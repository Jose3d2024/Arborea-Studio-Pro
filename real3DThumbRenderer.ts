import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  BarkType,
  CanopyElementType,
  HangingElementType,
  QualitySettings,
  StemStructureType,
  SurfaceElementType,
  SynthesizedBasalFoliageType,
  SynthesizedTipPrimitive,
  TreeParams,
} from '../types/botany';
import { DEFAULT_TREE_PARAMS } from '../data/speciesCatalog';
import { generateProceduralTree } from '../engine/treeGenerator';
import { buildIsolatedTipPreviewGroup } from '../engine/composedElementGenerator';
import { PartThumbKind } from '../components/BotanicalVisualThumb';

const THUMB_W = 168;
const THUMB_H = 126;

let offscreenRenderer: THREE.WebGLRenderer | null = null;
let offscreenScene: THREE.Scene | null = null;
let offscreenCamera: THREE.PerspectiveCamera | null = null;
let offscreenPmremDone = false;

const memoryThumbCache = new Map<string, string>();
const REAL_THUMB_STORAGE_KEY = 'arborea_real3d_thumbs_v7';

function loadPersistedThumbs(): void {
  if (memoryThumbCache.size > 0) return;
  try {
    const raw = localStorage.getItem(REAL_THUMB_STORAGE_KEY);
    if (!raw) return;
    const obj = JSON.parse(raw);
    if (obj && typeof obj === 'object') {
      Object.entries(obj).forEach(([k, v]) => {
        if (typeof v === 'string' && v.startsWith('data:image/')) {
          memoryThumbCache.set(k, v);
        }
      });
    }
  } catch {
    // ignore storage errors
  }
}

let persistTimer: number | null = null;
function schedulePersistThumbs(): void {
  if (persistTimer !== null) return;
  persistTimer = window.setTimeout(() => {
    persistTimer = null;
    try {
      const speciesEntries: [string, string][] = [];
      const partEntries: [string, string][] = [];
      for (const [k, v] of memoryThumbCache.entries()) {
        if (k.startsWith('species_')) {
          speciesEntries.push([k, v]);
        } else {
          partEntries.push([k, v]);
        }
      }
      // Prioritize keeping all catalog species thumbnails intact before part picker previews
      const combined = [...speciesEntries, ...partEntries.slice(-70)];
      const out: Record<string, string> = {};
      combined.forEach(([k, v]) => {
        out[k] = v;
      });
      try {
        localStorage.setItem(REAL_THUMB_STORAGE_KEY, JSON.stringify(out));
      } catch {
        // Fallback under tight storage quota: persist species thumbnails only
        const speciesOnly: Record<string, string> = {};
        speciesEntries.forEach(([k, v]) => {
          speciesOnly[k] = v;
        });
        localStorage.setItem(REAL_THUMB_STORAGE_KEY, JSON.stringify(speciesOnly));
      }
    } catch {
      // ignore storage quota limits
    }
  }, 800);
}

function getOffscreenRig(): {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
} | null {
  try {
    if (!offscreenRenderer) {
      const canvas = document.createElement('canvas');
      canvas.width = THUMB_W;
      canvas.height = THUMB_H;
      offscreenRenderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: false,
        preserveDrawingBuffer: true,
        powerPreference: 'default',
      });
      offscreenRenderer.setSize(THUMB_W, THUMB_H, false);
      offscreenRenderer.setPixelRatio(1);
      offscreenRenderer.outputColorSpace = THREE.SRGBColorSpace;
      offscreenRenderer.toneMapping = THREE.ACESFilmicToneMapping;
      offscreenRenderer.toneMappingExposure = 1.15;
    }

    if (!offscreenScene) {
      offscreenScene = new THREE.Scene();
      const hemi = new THREE.HemisphereLight(0xdbeafe, 0x1e293b, 1.05);
      offscreenScene.add(hemi);

      const key = new THREE.DirectionalLight(0xfffbeb, 2.15);
      key.position.set(8, 12, 9);
      offscreenScene.add(key);

      const rim = new THREE.DirectionalLight(0x7dd3fc, 0.85);
      rim.position.set(-9, 6, -8);
      offscreenScene.add(rim);
    }

    if (!offscreenPmremDone && offscreenRenderer && offscreenScene) {
      offscreenPmremDone = true;
      try {
        const pmrem = new THREE.PMREMGenerator(offscreenRenderer);
        offscreenScene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
        pmrem.dispose();
      } catch {
        // optional env reflection
      }
    }

    if (!offscreenCamera) {
      offscreenCamera = new THREE.PerspectiveCamera(36, THUMB_W / THUMB_H, 0.1, 140);
    }

    return {
      renderer: offscreenRenderer,
      scene: offscreenScene,
      camera: offscreenCamera,
    };
  } catch {
    return null;
  }
}

function disposeGroupMeshes(group: THREE.Object3D): void {
  group.traverse((obj) => {
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

const THUMB_QUALITY: QualitySettings = {
  polygonLod: 'low',
  meshDensity: 0.45,
  shaderQuality: 'pbr_standard',
  textureQuality: 'low_256',
  viewportMode: 'lit',
  backgroundColor: '#0a111a',
  groundColor: '#101824',
  showGroundDisk: false,
  ecosystemBase: 'clean_pedestal',
  ecosystemBaseScale: 1.0,
  includeBaseInExport: false,
  showGrid: false,
  showCompassSolar: false,
  showDimensions: false,
  showScaleRef: false,
  autoRotate: false,
};

export function getCachedReal3DThumb(cacheKey: string): string | undefined {
  loadPersistedThumbs();
  return memoryThumbCache.get(cacheKey);
}

/**
 * Renders an authentic 3D miniature snapshot of any botanical TreeParams using Three.js.
 */
export function renderReal3DThumbnail(
  cacheKey: string,
  params: TreeParams,
  bgHex = '#0a111a',
  focusMode: 'full' | 'crown' | 'trunk' | 'base' = 'full'
): string | null {
  loadPersistedThumbs();
  const existing = memoryThumbCache.get(cacheKey);
  if (existing) return existing;

  const rig = getOffscreenRig();
  if (!rig) return null;
  const { renderer, scene, camera } = rig;

  let group: THREE.Group | null = null;
  try {
    scene.background = new THREE.Color(bgHex);
    const windUniform = { value: 0 };
    const safeParams: TreeParams = {
      ...DEFAULT_TREE_PARAMS,
      ...params,
      windEnabled: false,
      tonalMode: 'natural_botanical',
      wetnessGloss: 0.15,
      iridescenceAmount: 0.0,
    };

    const res = generateProceduralTree(safeParams, THUMB_QUALITY, windUniform, 1);
    group = res.group;
    scene.add(group);

    const box = new THREE.Box3().setFromObject(group);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    if (box.isEmpty()) {
      size.set(3, 5, 3);
      center.set(0, 2.5, 0);
    } else {
      box.getSize(size);
      box.getCenter(center);
    }

    let lookY = center.y;
    let frameH = Math.max(1.2, size.y);
    let frameW = Math.max(1.2, Math.max(size.x, size.z));

    if (focusMode === 'crown') {
      lookY = box.min.y + size.y * 0.68;
      frameH = Math.max(1.0, size.y * 0.58);
      frameW = Math.max(1.0, frameW * 0.85);
    } else if (focusMode === 'trunk') {
      lookY = box.min.y + size.y * 0.35;
      frameH = Math.max(1.0, size.y * 0.55);
      frameW = Math.max(0.8, frameW * 0.55);
    } else if (focusMode === 'base') {
      lookY = box.min.y + size.y * 0.22;
      frameH = Math.max(1.0, size.y * 0.45);
      frameW = Math.max(1.0, frameW * 0.72);
    }

    const vFovRad = THREE.MathUtils.degToRad(camera.fov);
    const hFovRad = 2 * Math.atan(Math.tan(vFovRad * 0.5) * camera.aspect);
    const distV = (frameH * 1.18 * 0.5) / Math.tan(vFovRad * 0.5);
    const distH = (frameW * 1.18 * 0.5) / Math.tan(hFovRad * 0.5);
    const dist = Math.max(1.8, distV, distH);

    camera.position.set(center.x + dist * 0.64, lookY + frameH * 0.14, center.z + dist * 0.82);
    camera.lookAt(center.x, lookY, center.z);
    camera.updateMatrixWorld();

    renderer.render(scene, camera);

    const canvas = renderer.domElement;
    let url = '';
    try {
      url = canvas.toDataURL('image/webp', 0.84);
      if (!url.startsWith('data:image/webp')) {
        url = canvas.toDataURL('image/png');
      }
    } catch {
      url = canvas.toDataURL('image/png');
    }

    if (url) {
      memoryThumbCache.set(cacheKey, url);
      schedulePersistThumbs();
    }
    return url || null;
  } catch {
    return null;
  } finally {
    if (group) {
      scene.remove(group);
      disposeGroupMeshes(group);
    }
  }
}

function renderIsolatedGroupThumbnail(
  cacheKey: string,
  group: THREE.Group,
  bgHex = '#090f18'
): string | null {
  const rig = getOffscreenRig();
  if (!rig) {
    disposeGroupMeshes(group);
    return null;
  }
  const { renderer, scene, camera } = rig;
  try {
    scene.background = new THREE.Color(bgHex);
    scene.add(group);

    const box = new THREE.Box3().setFromObject(group);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    if (box.isEmpty()) {
      size.set(1.2, 1.4, 1.2);
      center.set(0, 0.7, 0);
    } else {
      box.getSize(size);
      box.getCenter(center);
    }

    const frameH = Math.max(0.65, size.y);
    const frameW = Math.max(0.65, Math.max(size.x, size.z));
    const vFovRad = THREE.MathUtils.degToRad(camera.fov);
    const hFovRad = 2 * Math.atan(Math.tan(vFovRad * 0.5) * camera.aspect);
    const distV = (frameH * 1.15 * 0.5) / Math.tan(vFovRad * 0.5);
    const distH = (frameW * 1.15 * 0.5) / Math.tan(hFovRad * 0.5);
    const dist = Math.max(0.68, distV, distH);

    camera.position.set(center.x + dist * 0.58, center.y + frameH * 0.12, center.z + dist * 0.82);
    camera.lookAt(center.x, center.y, center.z);
    camera.updateMatrixWorld();

    renderer.render(scene, camera);

    const canvas = renderer.domElement;
    let url = '';
    try {
      url = canvas.toDataURL('image/webp', 0.84);
      if (!url.startsWith('data:image/webp')) {
        url = canvas.toDataURL('image/png');
      }
    } catch {
      url = canvas.toDataURL('image/png');
    }

    if (url) {
      memoryThumbCache.set(cacheKey, url);
      schedulePersistThumbs();
    }
    return url || null;
  } catch {
    return null;
  } finally {
    scene.remove(group);
    disposeGroupMeshes(group);
  }
}

/**
 * Renders a real 3D preview of an individual modular part (stem, canopy, surface, hanging, tip, basal, bark).
 */
export function renderReal3DPartThumbnail(
  kind: PartThumbKind,
  value: string,
  colors?: {
    trunk?: string;
    main?: string;
    tip?: string;
    flower?: string;
    accent?: string;
  }
): string | null {
  const colT = colors?.trunk || '#583e2a';
  const colM = colors?.main || '#22c55e';
  const colTip = colors?.tip || '#86efac';
  const colF = colors?.flower || '#f472b6';
  const colA = colors?.accent || '#38bdf8';

  const key = kind === 'tip' ? `part_tip_v7_${value}` : `part_${kind}_${value}_${colT}_${colM}_${colF}`;
  const cached = getCachedReal3DThumb(key);
  if (cached) return cached;

  if (kind === 'tip') {
    const tipGroup = buildIsolatedTipPreviewGroup(value, {
      trunk: colT,
      main: colM,
      tip: colTip,
      flower: colF,
      accent: colA,
    });
    return renderIsolatedGroupThumbnail(key, tipGroup, '#090f18');
  }

  const baseCustom = {
    id: key,
    name: value,
    scientificName: 'Botanica modularis',
    description: '',
    createdAt: 0,
    stemStructure: (kind === 'stem' ? value : 'sympodial_tree') as StemStructureType,
    canopyElement: (kind === 'canopy'
      ? value
      : kind === 'stem' || kind === 'bark'
      ? 'custom_leaf_lamina'
      : 'custom_leaf_lamina') as CanopyElementType,
    surfaceElement: (kind === 'surface' ? value : 'smooth_striated') as SurfaceElementType,
    hangingElement: (kind === 'hanging' ? value : 'none') as HangingElementType,
    synthesizedTipPrimitive: 'none' as SynthesizedTipPrimitive,
    synthesizedBasalFoliage: (kind === 'basal' ? value : 'none') as SynthesizedBasalFoliageType,
    spiralTurns: 1.35,
    spiralArms: 5,
    stemCount: kind === 'stem' && value === 'herbaceous_curved_stalk' ? 1 : 5,
    thornDensity: kind === 'surface' || kind === 'hanging' ? 0.75 : 0.1,
    thornLength: 1.0,
    filamentCount: kind === 'hanging' ? 20 : 6,
    filamentLength: 1.2,
    padLayers: 5,
    lobeCount: 6,
    cupDepth: 0.45,
  };

  if (
    kind === 'canopy' &&
    [
      'spherical_bubble_umbel',
      'radiating_floret_head',
      'lotus_magnolia_corolla_crown',
      'passionflower_filament_corona',
      'spotted_orchid_labellum_corolla',
      'giant_arum_spathe_spadix',
      'toothed_venus_jaw_trap',
      'crater_tentacle_anemone',
      'perforated_blossom_urn',
      'conical_floral_spike',
      'curled_witchhat_mushroom_cap',
    ].includes(value)
  ) {
    baseCustom.stemStructure = 'herbaceous_curved_stalk';
    baseCustom.stemCount = 1;
  }
  if (kind === 'basal') {
    baseCustom.stemStructure = 'herbaceous_curved_stalk';
    baseCustom.stemCount = 1;
    baseCustom.canopyElement = 'radiating_floret_head';
    baseCustom.synthesizedBasalFoliage = value as SynthesizedBasalFoliageType;
  }
  if (kind === 'hanging') {
    baseCustom.stemStructure = 'gnarled_bonsai';
    baseCustom.canopyElement = 'cloud_bonsai_pads';
    baseCustom.filamentCount = 28;
    baseCustom.filamentLength = 1.5;
  }

  const partParams: TreeParams = {
    ...DEFAULT_TREE_PARAMS,
    engine: kind === 'bark' ? 'sympodial' : 'composed_custom',
    foliageType: kind === 'bark' ? 'none' : 'ai_custom_element',
    barkType: (kind === 'bark' ? value : 'fissured') as BarkType,
    representationStyle: 'botanical_leaves',
    height: kind === 'bark' ? 4.2 : 4.6,
    radius: kind === 'bark' ? 0.55 : 0.34,
    branchCount: kind === 'bark' ? 2 : 4,
    levels: kind === 'bark' ? 2 : 3,
    showRoots: kind === 'stem',
    colorTrunk: colT,
    colorLeafMain: colM,
    colorLeafTip: colTip,
    colorFlower: colF,
    colorAccent: colA,
    customElement: baseCustom,
  };

  const focus: 'full' | 'crown' | 'trunk' | 'base' =
    kind === 'canopy'
      ? 'crown'
      : kind === 'bark' || kind === 'surface'
      ? 'trunk'
      : kind === 'basal'
      ? 'base'
      : 'full';

  return renderReal3DThumbnail(key, partParams, '#090f18', focus);
}

type PartQueueJob = {
  kind: PartThumbKind;
  value: string;
  colors?: {
    trunk?: string;
    main?: string;
    tip?: string;
    flower?: string;
    accent?: string;
  };
  onDone: (url: string | null) => void;
};

const partThumbQueue: PartQueueJob[] = [];
let partQueueTimer: number | null = null;

function flushNextPartJob(): void {
  partQueueTimer = null;
  const job = partThumbQueue.shift();
  if (!job) return;
  const url = renderReal3DPartThumbnail(job.kind, job.value, job.colors);
  job.onDone(url);
  if (partThumbQueue.length > 0) {
    partQueueTimer = window.setTimeout(flushNextPartJob, 16);
  }
}

/**
 * Queues real-3D part thumbnail renders sequentially so opening a Part Picker
 * with 16+ options never blocks the main UI thread.
 */
export function enqueueReal3DPartThumbnail(
  kind: PartThumbKind,
  value: string,
  colors: {
    trunk?: string;
    main?: string;
    tip?: string;
    flower?: string;
    accent?: string;
  },
  onDone: (url: string | null) => void
): () => void {
  const job: PartQueueJob = { kind, value, colors, onDone };
  partThumbQueue.push(job);
  if (partQueueTimer === null) {
    partQueueTimer = window.setTimeout(flushNextPartJob, 12);
  }
  return () => {
    const idx = partThumbQueue.indexOf(job);
    if (idx !== -1) partThumbQueue.splice(idx, 1);
  };
}
