import React, { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { OBJExporter } from 'three/examples/jsm/exporters/OBJExporter.js';
import { TreeParams, QualitySettings, MeshStats } from '../types/botany';
import { generateProceduralTree } from '../engine/treeGenerator';
import { generateEcosystemBaseGroup } from '../engine/ecosystemBaseGenerator';

export type CameraPreset = 'overview' | 'front' | 'crown' | 'trunk' | 'top';
export type ViewportHitPart = 'trunk' | 'canopy' | 'roots' | 'ecosystem_base';

export interface TreeViewportHandle {
  exportGLB: () => void;
  exportOBJ: () => void;
  captureSnapshot: () => void;
  captureThumbnail: (width?: number, height?: number) => string;
  setCameraPreset: (preset: CameraPreset) => void;
}

interface TreeViewportProps {
  params: TreeParams;
  quality: QualitySettings;
  onStatsUpdate: (stats: MeshStats) => void;
  onPartClick?: (part: ViewportHitPart) => void;
  selectedPart?: ViewportHitPart | null;
  onBackgroundClick?: () => void;
}

const _targetCamPos = new THREE.Vector3();
const _targetLookAt = new THREE.Vector3();

function createContactShadowTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(size / 2, size / 2, size * 0.05, size / 2, size / 2, size * 0.48);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.68)');
  grad.addColorStop(0.55, 'rgba(0, 0, 0, 0.25)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Generates an Andrew Marsh Tree3D-Web style Compass Rose & Metric Polar Grid on HTML5 Canvas
 */
function createCompassRoseTexture(maxAnisotropy = 4): THREE.CanvasTexture {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const cx = size / 2;
  const cy = size / 2;
  const maxR = size * 0.46;

  ctx.clearRect(0, 0, size, size);

  // Concentric distance rings (2m, 4m, 6m, 8m)
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.22)';
  ctx.lineWidth = 2;
  for (let r = 1; r <= 4; r++) {
    const rad = (r / 4) * maxR;
    ctx.beginPath();
    ctx.arc(cx, cy, rad, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Degree ticks around outer compass ring
  for (let deg = 0; deg < 360; deg += 15) {
    const ang = (deg * Math.PI) / 180;
    const isMajor = deg % 90 === 0;
    const isMed = deg % 45 === 0;
    const rIn = maxR * (isMajor ? 0.91 : isMed ? 0.94 : 0.965);
    ctx.strokeStyle = isMajor ? 'rgba(52, 211, 153, 0.75)' : 'rgba(148, 163, 184, 0.35)';
    ctx.lineWidth = isMajor ? 3 : 1.5;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(ang) * rIn, cy + Math.sin(ang) * rIn);
    ctx.lineTo(cx + Math.cos(ang) * maxR, cy + Math.sin(ang) * maxR);
    ctx.stroke();
  }

  // Crosshair axes
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.18)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(cx - maxR, cy);
  ctx.lineTo(cx + maxR, cy);
  ctx.moveTo(cx, cy - maxR);
  ctx.lineTo(cx, cy + maxR);
  ctx.stroke();

  // Cardinal Labels (N, S, E, O)
  ctx.font = 'bold 34px "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ctx.fillStyle = '#34d399';
  ctx.fillText('N', cx, cy - maxR - 24);
  ctx.fillStyle = 'rgba(226, 232, 240, 0.65)';
  ctx.fillText('S', cx, cy + maxR + 24);
  ctx.fillText('E', cx + maxR + 24, cy);
  ctx.fillText('O', cx - maxR - 24, cy);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function createHumanScaleReference(): THREE.Group {
  const refGroup = new THREE.Group();
  refGroup.name = 'HumanScaleReference_1_8m';
  const mat = new THREE.MeshStandardMaterial({
    color: '#38bdf8',
    roughness: 0.4,
    metalness: 0.2,
    transparent: true,
    opacity: 0.78,
  });

  const legs = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.09, 0.88, 10), mat);
  legs.position.y = 0.44;
  refGroup.add(legs);

  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.12, 0.62, 10), mat);
  torso.position.y = 1.19;
  refGroup.add(torso);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 10), mat);
  head.position.y = 1.66;
  refGroup.add(head);

  const baseRing = new THREE.Mesh(
    new THREE.RingGeometry(0.28, 0.32, 24),
    new THREE.MeshBasicMaterial({ color: '#38bdf8', side: THREE.DoubleSide })
  );
  baseRing.rotation.x = -Math.PI / 2;
  baseRing.position.y = 0.02;
  refGroup.add(baseRing);

  refGroup.position.set(2.6, 0, 0.6);
  return refGroup;
}

export const TreeViewport = forwardRef<TreeViewportHandle, TreeViewportProps>(
  ({ params, quality, onStatsUpdate, onPartClick, selectedPart, onBackgroundClick }, ref) => {
    const mountRef = useRef<HTMLDivElement>(null);
    const onPartClickRef = useRef(onPartClick);
    onPartClickRef.current = onPartClick;
    const onBackgroundClickRef = useRef(onBackgroundClick);
    onBackgroundClickRef.current = onBackgroundClick;

    const sceneRef = useRef<THREE.Scene | null>(null);
    const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
    const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
    const controlsRef = useRef<OrbitControls | null>(null);
    const treeGroupRef = useRef<THREE.Group | null>(null);
    const selectionOutlineGroupRef = useRef<THREE.Group | null>(null);
    const dirLightRef = useRef<THREE.DirectionalLight | null>(null);
    const gridGroupRef = useRef<THREE.Group | null>(null);
    const ecosystemBaseGroupRef = useRef<THREE.Group | null>(null);
    const contactShadowRef = useRef<THREE.Mesh | null>(null);
    const gridHelperRef = useRef<THREE.GridHelper | null>(null);
    const compassGroupRef = useRef<THREE.Group | null>(null);
    const sunIndicatorRef = useRef<THREE.Mesh | null>(null);
    const sunRayLineRef = useRef<THREE.Line | null>(null);
    const dimensionsGroupRef = useRef<THREE.Group | null>(null);
    const scaleRefGroup = useRef<THREE.Group | null>(null);
    const windUniformRef = useRef<{ value: number }>({ value: 0 });
    const camTransitionActiveRef = useRef<boolean>(false);

    const paramsRef = useRef(params);
    paramsRef.current = params;
    const qualityRef = useRef(quality);
    qualityRef.current = quality;

    const lastFramedPresetRef = useRef<string>('');
    const treeBoundsRef = useRef<{ height: number; radius: number; centerY: number }>({
      height: 6,
      radius: 3,
      centerY: 3,
    });

    const computeIdealCameraFrame = (preset: CameraPreset) => {
      const bounds = treeBoundsRef.current;
      const height = Number.isFinite(bounds.height) && bounds.height > 0 ? bounds.height : 4.5;
      const radius = Number.isFinite(bounds.radius) && bounds.radius > 0 ? bounds.radius : 2.2;
      const centerY = Number.isFinite(bounds.centerY) ? bounds.centerY : height * 0.48;
      const cam = cameraRef.current;
      const vFovRad = THREE.MathUtils.degToRad(cam?.fov || 42);
      const aspect = Math.max(0.5, cam?.aspect || 1.35);
      const hFovRad = 2 * Math.atan(Math.tan(vFovRad * 0.5) * aspect);

      const requiredVertDist = (Math.max(height * 1.28, 3.2) * 0.5) / Math.tan(vFovRad * 0.5);
      const requiredHorizDist = (Math.max(radius * 2.5, 3.2) * 0.5) / Math.tan(hFovRad * 0.5);
      const dist = Math.max(requiredVertDist, requiredHorizDist);

      if (preset === 'overview') {
        _targetCamPos.set(dist * 0.68, centerY + height * 0.12, dist * 0.86);
        _targetLookAt.set(0, centerY * 0.94, 0);
      } else if (preset === 'front') {
        _targetCamPos.set(0, centerY, dist * 1.08);
        _targetLookAt.set(0, centerY * 0.96, 0);
      } else if (preset === 'crown') {
        _targetCamPos.set(dist * 0.42, height * 0.72, dist * 0.48);
        _targetLookAt.set(0, height * 0.65, 0);
      } else if (preset === 'trunk') {
        _targetCamPos.set(dist * 0.35, height * 0.24, dist * 0.42);
        _targetLookAt.set(0, height * 0.2, 0);
      } else if (preset === 'top') {
        _targetCamPos.set(0.05, dist * 1.32 + height * 0.5, 0.05);
        _targetLookAt.set(0, centerY * 0.5, 0);
      }
      camTransitionActiveRef.current = true;
    };

    useImperativeHandle(ref, () => ({
      exportGLB: () => {
        if (!treeGroupRef.current) return;
        const exporter = new GLTFExporter();
        let exportRoot: THREE.Object3D = treeGroupRef.current;
        if (
          qualityRef.current.includeBaseInExport &&
          qualityRef.current.showGroundDisk &&
          ecosystemBaseGroupRef.current
        ) {
          const combined = new THREE.Group();
          combined.name = `Arborea_WithEcosystem_${paramsRef.current.presetId}`;
          combined.add(treeGroupRef.current.clone());
          combined.add(ecosystemBaseGroupRef.current.clone());
          exportRoot = combined;
        }
        exporter.parse(
          exportRoot,
          (gltf) => {
            const blob =
              gltf instanceof ArrayBuffer
                ? new Blob([gltf], { type: 'application/octet-stream' })
                : new Blob([JSON.stringify(gltf)], { type: 'application/json' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `arborea_${paramsRef.current.presetId}_${paramsRef.current.seed}.glb`;
            link.click();
            URL.revokeObjectURL(link.href);
          },
          (err) => console.error('GLB Export Error:', err),
          { binary: true }
        );
      },
      exportOBJ: () => {
        if (!treeGroupRef.current) return;
        const exporter = new OBJExporter();
        let exportRoot: THREE.Object3D = treeGroupRef.current;
        if (
          qualityRef.current.includeBaseInExport &&
          qualityRef.current.showGroundDisk &&
          ecosystemBaseGroupRef.current
        ) {
          const combined = new THREE.Group();
          combined.add(treeGroupRef.current.clone());
          combined.add(ecosystemBaseGroupRef.current.clone());
          exportRoot = combined;
        }
        const objText = exporter.parse(exportRoot);
        const blob = new Blob([objText], { type: 'text/plain' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `arborea_${paramsRef.current.presetId}_${paramsRef.current.seed}.obj`;
        link.click();
        URL.revokeObjectURL(link.href);
      },
      captureSnapshot: () => {
        if (!rendererRef.current || !sceneRef.current || !cameraRef.current) return;
        rendererRef.current.render(sceneRef.current, cameraRef.current);
        const dataUrl = rendererRef.current.domElement.toDataURL('image/png');
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = `arborea_${paramsRef.current.presetId}_${paramsRef.current.seed}.png`;
        link.click();
      },
      captureThumbnail: (width = 280, height = 190) => {
        if (!rendererRef.current || !sceneRef.current || !cameraRef.current) return '';
        rendererRef.current.render(sceneRef.current, cameraRef.current);
        const srcCanvas = rendererRef.current.domElement;
        const thumbCanvas = document.createElement('canvas');
        thumbCanvas.width = width;
        thumbCanvas.height = height;
        const ctx = thumbCanvas.getContext('2d');
        if (!ctx) return '';

        const srcW = Math.max(1, srcCanvas.width);
        const srcH = Math.max(1, srcCanvas.height);
        const targetAspect = width / height;
        const srcAspect = srcW / srcH;

        let sx = 0;
        let sy = 0;
        let sw = srcW;
        let sh = srcH;

        if (srcAspect > targetAspect) {
          sw = srcH * targetAspect;
          sx = (srcW - sw) * 0.5;
        } else {
          sh = srcW / targetAspect;
          sy = (srcH - sh) * 0.5;
        }

        ctx.drawImage(srcCanvas, sx, sy, sw, sh, 0, 0, width, height);
        return thumbCanvas.toDataURL('image/jpeg', 0.88);
      },
      setCameraPreset: (preset: CameraPreset) => {
        computeIdealCameraFrame(preset);
      },
    }));

    useEffect(() => {
      const container = mountRef.current;
      if (!container) return;

      const isSoftwareGl = (() => {
        const gl = document.createElement('canvas').getContext('webgl2');
        if (!gl) return true;
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
        const gpu = String(gl.getParameter(param));
        gl.getExtension('WEBGL_lose_context')?.loseContext();
        return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
      })();

      const scene = new THREE.Scene();
      scene.background = new THREE.Color('#0c131d');
      scene.fog = new THREE.FogExp2('#0c131d', 0.014);
      sceneRef.current = scene;

      const camera = new THREE.PerspectiveCamera(
        42,
        container.clientWidth / Math.max(1, container.clientHeight),
        0.1,
        180
      );
      camera.position.set(8.8, 5.4, 10.2);
      cameraRef.current = camera;

      const renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        powerPreference: 'high-performance',
        preserveDrawingBuffer: false,
      });
      renderer.setSize(container.clientWidth, container.clientHeight);
      renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.12;
      renderer.shadowMap.enabled = !isSoftwareGl;
      renderer.shadowMap.type = THREE.PCFShadowMap;
      container.appendChild(renderer.domElement);
      rendererRef.current = renderer;

      const pmremGenerator = new THREE.PMREMGenerator(renderer);
      scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
      pmremGenerator.dispose();

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = !isSoftwareGl;
      controls.dampingFactor = 0.06;
      controls.maxPolarAngle = Math.PI * 0.52;
      controls.minDistance = 1.2;
      controls.maxDistance = 52;
      controls.target.set(0, 2.8, 0);
      controls.addEventListener('start', () => {
        camTransitionActiveRef.current = false;
      });
      controlsRef.current = controls;

      // Balanced 3-Point Botanical Studio Lighting
      const hemiLight = new THREE.HemisphereLight('#bae6fd', '#1e293b', 1.15);
      scene.add(hemiLight);

      const dirLight = new THREE.DirectionalLight('#fffbeb', 2.65);
      dirLight.position.set(9, 14, 10);
      dirLight.castShadow = !isSoftwareGl;
      dirLight.shadow.mapSize.set(2048, 2048);
      dirLight.shadow.camera.left = -12;
      dirLight.shadow.camera.right = 12;
      dirLight.shadow.camera.top = 14;
      dirLight.shadow.camera.bottom = -12;
      dirLight.shadow.camera.near = 0.5;
      dirLight.shadow.camera.far = 48;
      dirLight.shadow.bias = -0.0005;
      dirLight.shadow.normalBias = 0.02;
      scene.add(dirLight);
      dirLightRef.current = dirLight;

      const rimLight = new THREE.DirectionalLight('#38bdf8', 0.9);
      rimLight.position.set(-10, 7, -9);
      scene.add(rimLight);

      // Ground Ecosystem Base Container & Grid Group
      const gridGroup = new THREE.Group();
      const ecosystemBaseHolder = new THREE.Group();
      ecosystemBaseHolder.name = 'EcosystemBaseHolder';
      gridGroup.add(ecosystemBaseHolder);
      ecosystemBaseGroupRef.current = ecosystemBaseHolder;

      const grid = new THREE.GridHelper(16, 16, '#1e293b', '#172030');
      grid.position.y = 0.025;
      gridGroup.add(grid);
      gridHelperRef.current = grid;

      const contactShadowTex = createContactShadowTexture();
      const contactShadowPlane = new THREE.Mesh(
        new THREE.PlaneGeometry(5.5, 5.5),
        new THREE.MeshBasicMaterial({
          map: contactShadowTex,
          transparent: true,
          depthWrite: false,
          opacity: 0.48,
          polygonOffset: true,
          polygonOffsetFactor: -1,
          polygonOffsetUnits: -1,
        })
      );
      contactShadowPlane.rotation.x = -Math.PI / 2;
      contactShadowPlane.position.y = 0.014;
      gridGroup.add(contactShadowPlane);
      contactShadowRef.current = contactShadowPlane;
      scene.add(gridGroup);
      gridGroupRef.current = gridGroup;

      // Andrew Marsh Tree3D-Web Compass Rose & Solar Path Group
      const compassGroup = new THREE.Group();
      const compassTex = createCompassRoseTexture(renderer.capabilities.getMaxAnisotropy());
      const compassPlane = new THREE.Mesh(
        new THREE.PlaneGeometry(17.5, 17.5),
        new THREE.MeshBasicMaterial({
          map: compassTex,
          transparent: true,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -2,
          polygonOffsetUnits: -2,
        })
      );
      compassPlane.rotation.x = -Math.PI / 2;
      compassPlane.position.y = 0.02;
      compassGroup.add(compassPlane);

      // Sun Indicator Orb & Ray Line
      const sunOrb = new THREE.Mesh(
        new THREE.SphereGeometry(0.28, 16, 12),
        new THREE.MeshBasicMaterial({ color: '#fde047' })
      );
      compassGroup.add(sunOrb);
      sunIndicatorRef.current = sunOrb;

      const rayGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(5, 8, 5),
      ]);
      const rayLine = new THREE.Line(
        rayGeo,
        new THREE.LineDashedMaterial({
          color: '#facc15',
          dashSize: 0.35,
          gapSize: 0.2,
          transparent: true,
          opacity: 0.45,
        })
      );
      rayLine.computeLineDistances();
      compassGroup.add(rayLine);
      sunRayLineRef.current = rayLine;

      scene.add(compassGroup);
      compassGroupRef.current = compassGroup;

      // 3D Architectural Dimensions Guide Group (Crown Ring + Height Pole)
      const dimGroup = new THREE.Group();
      dimGroup.visible = false;
      scene.add(dimGroup);
      dimensionsGroupRef.current = dimGroup;

      // 1.80m Human Scale Reference
      const humanScale = createHumanScaleReference();
      humanScale.visible = qualityRef.current.showScaleRef;
      scene.add(humanScale);
      scaleRefGroup.current = humanScale;

      const startTimeMs = performance.now();
      let lastTimeMs = startTimeMs;
      let frameId = 0;

      function afterDraw(cb: () => void) {
        const gl = renderer.getContext() as WebGL2RenderingContext;
        const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
        gl.flush();
        const poll = () => {
          const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
          if (state === gl.UNSIGNALED) {
            frameId = window.setTimeout(poll, 5);
          } else {
            if (sync) gl.deleteSync(sync);
            frameId = window.setTimeout(cb, 80);
          }
        };
        frameId = window.setTimeout(poll, 5);
      }

      function tick() {
        const nowMs = performance.now();
        const dt = Math.min(0.1, Math.max(0, (nowMs - lastTimeMs) / 1000));
        const elapsed = (nowMs - startTimeMs) / 1000;
        lastTimeMs = nowMs;

        if (
          paramsRef.current.windEnabled ||
          paramsRef.current.tonalMode === 'bioluminescent_abyss'
        ) {
          windUniformRef.current.value = elapsed;
        }

        if (qualityRef.current.autoRotate && treeGroupRef.current) {
          treeGroupRef.current.rotation.y += dt * 0.35;
        }

        if (
          !Number.isFinite(camera.position.x) ||
          !Number.isFinite(camera.position.y) ||
          !Number.isFinite(camera.position.z)
        ) {
          camera.position.set(8.8, 5.4, 10.2);
        }
        if (
          !Number.isFinite(controls.target.x) ||
          !Number.isFinite(controls.target.y) ||
          !Number.isFinite(controls.target.z)
        ) {
          controls.target.set(0, 2.2, 0);
        }

        if (
          camTransitionActiveRef.current &&
          Number.isFinite(_targetCamPos.x) &&
          Number.isFinite(_targetLookAt.y)
        ) {
          camera.position.x = THREE.MathUtils.damp(camera.position.x, _targetCamPos.x, 6, dt);
          camera.position.y = THREE.MathUtils.damp(camera.position.y, _targetCamPos.y, 6, dt);
          camera.position.z = THREE.MathUtils.damp(camera.position.z, _targetCamPos.z, 6, dt);

          controls.target.x = THREE.MathUtils.damp(controls.target.x, _targetLookAt.x, 6, dt);
          controls.target.y = THREE.MathUtils.damp(controls.target.y, _targetLookAt.y, 6, dt);
          controls.target.z = THREE.MathUtils.damp(controls.target.z, _targetLookAt.z, 6, dt);

          if (camera.position.distanceToSquared(_targetCamPos) < 0.01) {
            camTransitionActiveRef.current = false;
          }
        }

        controls.update();
        renderer.render(scene, camera);

        if (isSoftwareGl) {
          afterDraw(tick);
        } else {
          frameId = requestAnimationFrame(tick);
        }
      }

      tick();

      const handleResize = () => {
        if (!container || !renderer || !camera) return;
        const w = Math.max(1, container.clientWidth);
        const h = Math.max(1, container.clientHeight);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      };
      window.addEventListener('resize', handleResize);
      const resizeObserver = new ResizeObserver(() => handleResize());
      resizeObserver.observe(container);

      const raycaster = new THREE.Raycaster();
      const pointerNdc = new THREE.Vector2();
      let pointerDownX = 0;
      let pointerDownY = 0;

      const handlePointerDown = (e: PointerEvent) => {
        if (e.button !== 0) return;
        pointerDownX = e.clientX;
        pointerDownY = e.clientY;
      };

      const handlePointerUp = (e: PointerEvent) => {
        if (e.button !== 0 || !onPartClickRef.current) return;
        const dx = e.clientX - pointerDownX;
        const dy = e.clientY - pointerDownY;
        if (dx * dx + dy * dy > 25) return; // Ignore orbit/pan drags

        const rect = renderer.domElement.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;
        pointerNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        pointerNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(pointerNdc, camera);

        const targets: THREE.Object3D[] = [];
        if (treeGroupRef.current) targets.push(treeGroupRef.current);
        if (ecosystemBaseGroupRef.current && ecosystemBaseGroupRef.current.visible) {
          targets.push(ecosystemBaseGroupRef.current);
        }
        if (targets.length === 0) return;

        const hits = raycaster.intersectObjects(targets, true);
        if (hits.length === 0) {
          onBackgroundClickRef.current?.();
          return;
        }

        const hit = hits[0];
        let isBaseHit = false;
        let cur: THREE.Object3D | null = hit.object;
        while (cur) {
          if (cur === ecosystemBaseGroupRef.current) {
            isBaseHit = true;
            break;
          }
          cur = cur.parent;
        }

        if (isBaseHit) {
          onPartClickRef.current('ecosystem_base');
          return;
        }

        const pNow = paramsRef.current;
        const hNow = Math.max(1.5, treeBoundsRef.current.height || pNow.height || 4);
        const lowBandY = Math.max(0.45, hNow * 0.16);
        const hitName = hit.object.name || '';
        const noRootsEngine = ['moss_fungi_rock', 'aquatic_coral_algae', 'cactus', 'rosette', 'bamboo'].includes(
          pNow.engine
        );

        if (hitName === 'Trunk_And_Branches') {
          if (hit.point.y <= lowBandY && pNow.showRoots && !noRootsEngine) {
            onPartClickRef.current('roots');
          } else {
            onPartClickRef.current('trunk');
          }
        } else {
          const hasHangingOrBasal =
            pNow.engine === 'composed_custom' &&
            ((pNow.customElement?.hangingElement && pNow.customElement.hangingElement !== 'none') ||
              (pNow.customElement?.synthesizedBasalFoliage && pNow.customElement.synthesizedBasalFoliage !== 'none'));
          if (hit.point.y <= lowBandY && hasHangingOrBasal) {
            onPartClickRef.current('roots');
          } else {
            onPartClickRef.current('canopy');
          }
        }
      };

      renderer.domElement.addEventListener('pointerdown', handlePointerDown);
      renderer.domElement.addEventListener('pointerup', handlePointerUp);

      return () => {
        renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
        renderer.domElement.removeEventListener('pointerup', handlePointerUp);
        window.removeEventListener('resize', handleResize);
        resizeObserver.disconnect();
        cancelAnimationFrame(frameId);
        clearTimeout(frameId);
        controls.dispose();
        renderer.dispose();
        if (container.contains(renderer.domElement)) {
          container.removeChild(renderer.domElement);
        }
      };
    }, []);

    useEffect(() => {
      const scene = sceneRef.current;
      const renderer = rendererRef.current;
      if (!scene || !renderer) return;

      // Update Background Color & Fog
      const bgHex = quality.backgroundColor || '#0c131d';
      const bgCol = new THREE.Color(bgHex);
      scene.background = bgCol;
      if (scene.fog instanceof THREE.FogExp2) {
        scene.fog.color.copy(bgCol);
      }

      if (gridHelperRef.current) {
        gridHelperRef.current.visible = quality.showGrid;
      }

      // Update Sun Position & Compass Solar Indicator
      const elevRad = THREE.MathUtils.degToRad(params.sunElevation);
      const azimRad = THREE.MathUtils.degToRad(params.sunAzimuth);
      const lightDist = 18;
      const sunX = Math.cos(elevRad) * Math.sin(azimRad);
      const sunY = Math.max(0.12, Math.sin(elevRad));
      const sunZ = Math.cos(elevRad) * Math.cos(azimRad);

      if (dirLightRef.current) {
        dirLightRef.current.position.set(sunX * lightDist, sunY * lightDist, sunZ * lightDist);
      }

      const visualDist = 8.2;
      if (sunIndicatorRef.current) {
        sunIndicatorRef.current.position.set(sunX * visualDist, sunY * visualDist, sunZ * visualDist);
      }
      if (sunRayLineRef.current) {
        sunRayLineRef.current.geometry.setFromPoints([
          new THREE.Vector3(0, 0.05, 0),
          new THREE.Vector3(sunX * visualDist, sunY * visualDist, sunZ * visualDist),
        ]);
        sunRayLineRef.current.computeLineDistances();
      }

      if (compassGroupRef.current) {
        compassGroupRef.current.visible = quality.showCompassSolar;
      }
      if (scaleRefGroup.current) {
        scaleRefGroup.current.visible = quality.showScaleRef;
      }

      if (treeGroupRef.current) {
        const oldGroup = treeGroupRef.current;
        scene.remove(oldGroup);
        oldGroup.traverse((obj) => {
          if (obj instanceof THREE.Mesh) {
            obj.geometry?.dispose();
            if (Array.isArray(obj.material)) {
              obj.material.forEach((m) => m.dispose());
            } else {
              obj.material?.dispose();
            }
          }
        });
      }

      const maxAniso = renderer.capabilities.getMaxAnisotropy();
      const { group, stats } = generateProceduralTree(
        params,
        quality,
        windUniformRef.current,
        maxAniso
      );
      scene.add(group);
      treeGroupRef.current = group;

      // Rebuild Integrated Procedural 3D Ecosystem Base proportioned to the specimen
      if (ecosystemBaseGroupRef.current) {
        const holder = ecosystemBaseGroupRef.current;
        while (holder.children.length > 0) {
          const ch = holder.children[0];
          holder.remove(ch);
          ch.traverse((obj) => {
            if (obj instanceof THREE.Mesh) {
              obj.geometry?.dispose();
              if (Array.isArray(obj.material)) {
                obj.material.forEach((m) => m.dispose());
              } else {
                obj.material?.dispose();
              }
            }
          });
        }
        holder.visible = quality.showGroundDisk ?? true;
        if (holder.visible) {
          const newBase = generateEcosystemBaseGroup(
            quality.ecosystemBase || 'auto',
            params,
            quality,
            stats.treeHeightM,
            Math.max(1.2, stats.crownDiameterM * 0.5)
          );
          holder.add(newBase);
        }
      }

      if (contactShadowRef.current) {
        const shadowScale = THREE.MathUtils.clamp(stats.crownDiameterM * 0.22, 0.5, 1.8);
        contactShadowRef.current.scale.set(shadowScale, shadowScale, 1);
      }

      // Update actual bounding box metrics for accurate camera framing
      const safeH = Number.isFinite(stats.treeHeightM) ? stats.treeHeightM : params.height;
      const safeD = Number.isFinite(stats.crownDiameterM) ? stats.crownDiameterM : params.height * 0.7;
      const actualH = Math.max(2.0, safeH);
      const actualR = Math.max(1.2, safeD * 0.5);
      treeBoundsRef.current = {
        height: actualH,
        radius: actualR,
        centerY: actualH * 0.48,
      };

      if (lastFramedPresetRef.current !== params.presetId) {
        const isFirstLoad = lastFramedPresetRef.current === '';
        lastFramedPresetRef.current = params.presetId;
        computeIdealCameraFrame('overview');
        if (isFirstLoad && cameraRef.current && controlsRef.current) {
          cameraRef.current.position.copy(_targetCamPos);
          controlsRef.current.target.copy(_targetLookAt);
          controlsRef.current.update();
          camTransitionActiveRef.current = false;
        }
      }

      // Update 3D Architectural Dimension Bounding Ring & Height Pole (Andrew Marsh Tree3D style)
      if (dimensionsGroupRef.current) {
        const dimG = dimensionsGroupRef.current;
        while (dimG.children.length > 0) {
          const ch = dimG.children[0];
          dimG.remove(ch);
        }
        dimG.visible = quality.showDimensions;

        if (quality.showDimensions) {
          const crownR = Math.max(0.5, stats.crownDiameterM * 0.5);
          const treeH = Math.max(1.0, stats.treeHeightM);

          // Ground Crown Footprint Ring
          const footRing = new THREE.Mesh(
            new THREE.RingGeometry(crownR - 0.03, crownR + 0.03, 48),
            new THREE.MeshBasicMaterial({ color: '#10b981', side: THREE.DoubleSide })
          );
          footRing.rotation.x = -Math.PI / 2;
          footRing.position.y = 0.03;
          dimG.add(footRing);

          // Top Height Marker Ring & Vertical Stadia Axis
          const polePts = [
            new THREE.Vector3(-crownR - 0.45, 0, 0),
            new THREE.Vector3(-crownR - 0.45, treeH, 0),
            new THREE.Vector3(0, treeH, 0),
          ];
          const poleLine = new THREE.Line(
            new THREE.BufferGeometry().setFromPoints(polePts),
            new THREE.LineBasicMaterial({ color: '#38bdf8' })
          );
          dimG.add(poleLine);
        }
      }

      onStatsUpdate(stats);
    }, [params, quality, onStatsUpdate]);

    // Red 3D Selection Contour Outline around the currently selected plant part
    useEffect(() => {
      const scene = sceneRef.current;
      if (!scene) return;

      if (!selectionOutlineGroupRef.current) {
        const g = new THREE.Group();
        g.name = 'Selection_Red_Outline_Group';
        selectionOutlineGroupRef.current = g;
        scene.add(g);
      }

      const outlineGroup = selectionOutlineGroupRef.current;
      while (outlineGroup.children.length > 0) {
        const ch = outlineGroup.children[0];
        outlineGroup.remove(ch);
        if (ch instanceof THREE.Mesh) {
          if (Array.isArray(ch.material)) {
            ch.material.forEach((m) => m.dispose());
          } else {
            ch.material?.dispose();
          }
        }
      }

      if (!selectedPart) return;

      const matchedMeshes: THREE.Mesh[] = [];
      if (selectedPart === 'ecosystem_base') {
        ecosystemBaseGroupRef.current?.traverse((obj) => {
          if (obj instanceof THREE.Mesh && obj.visible) matchedMeshes.push(obj);
        });
      } else {
        treeGroupRef.current?.traverse((obj) => {
          if (!(obj instanceof THREE.Mesh) || !obj.visible) return;
          if (selectedPart === 'canopy' && obj.name !== 'Trunk_And_Branches') {
            matchedMeshes.push(obj);
          } else if (
            (selectedPart === 'trunk' || selectedPart === 'roots') &&
            obj.name === 'Trunk_And_Branches'
          ) {
            matchedMeshes.push(obj);
          }
        });
      }

      if (matchedMeshes.length === 0) return;

      const hNow = Math.max(1.5, treeBoundsRef.current.height || params.height || 4);
      const outlineWidth = THREE.MathUtils.clamp(hNow * 0.0095, 0.014, 0.055);
      const maxYCut = selectedPart === 'roots' ? Math.max(0.65, hNow * 0.24) : 9999.0;

      matchedMeshes.forEach((srcMesh) => {
        srcMesh.updateWorldMatrix(true, false);

        // 1. Solid BackSide Red Silhouette Contour (expanded along normals)
        const hullMat = new THREE.ShaderMaterial({
          uniforms: {
            uOutlineWidth: { value: outlineWidth },
            uMaxY: { value: maxYCut },
          },
          vertexShader: `
            uniform float uOutlineWidth;
            varying float vWorldY;
            void main() {
              vec3 displaced = position + normalize(normal) * uOutlineWidth;
              vec4 wp = modelMatrix * vec4(displaced, 1.0);
              vWorldY = wp.y;
              gl_Position = projectionMatrix * viewMatrix * wp;
            }
          `,
          fragmentShader: `
            uniform float uMaxY;
            varying float vWorldY;
            void main() {
              if (vWorldY > uMaxY) discard;
              gl_FragColor = vec4(1.0, 0.12, 0.22, 0.95);
            }
          `,
          side: THREE.BackSide,
          transparent: true,
          depthWrite: false,
        });

        const hullMesh = new THREE.Mesh(srcMesh.geometry, hullMat);
        hullMesh.applyMatrix4(srcMesh.matrixWorld);
        hullMesh.renderOrder = 25;
        hullMesh.raycast = () => {};
        outlineGroup.add(hullMesh);

        // 2. Crisp Red Fresnel Rim Glow (ensures thin double-sided petals/leaves show a bright red border)
        const rimMat = new THREE.ShaderMaterial({
          uniforms: {
            uMaxY: { value: maxYCut },
          },
          vertexShader: `
            varying vec3 vNormView;
            varying vec3 vViewPos;
            varying float vWorldY;
            void main() {
              vec4 wp = modelMatrix * vec4(position, 1.0);
              vWorldY = wp.y;
              vec4 mv = viewMatrix * wp;
              vViewPos = -mv.xyz;
              vNormView = normalize(normalMatrix * normal);
              gl_Position = projectionMatrix * mv;
            }
          `,
          fragmentShader: `
            uniform float uMaxY;
            varying vec3 vNormView;
            varying vec3 vViewPos;
            varying float vWorldY;
            void main() {
              if (vWorldY > uMaxY) discard;
              float ndv = abs(dot(normalize(vNormView), normalize(vViewPos)));
              float rim = pow(clamp(1.0 - ndv, 0.0, 1.0), 1.85);
              if (rim < 0.22) discard;
              gl_FragColor = vec4(1.0, 0.16, 0.26, clamp(rim * 1.15, 0.0, 0.92));
            }
          `,
          side: THREE.DoubleSide,
          transparent: true,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -1,
          polygonOffsetUnits: -1,
        });

        const rimMesh = new THREE.Mesh(srcMesh.geometry, rimMat);
        rimMesh.applyMatrix4(srcMesh.matrixWorld);
        rimMesh.renderOrder = 26;
        rimMesh.raycast = () => {};
        outlineGroup.add(rimMesh);
      });
    }, [selectedPart, params, quality]);

    return <div ref={mountRef} className="w-full h-full relative overflow-hidden" />;
  }
);
