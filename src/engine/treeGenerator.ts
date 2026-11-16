import * as THREE from 'three';
import {
  TreeParams,
  QualitySettings,
  MeshStats,
  PolygonLOD,
  TonalShaderMode,
} from '../types/botany';
import {
  ensureStandardAttributes,
  colorizeGeometryGradient,
  generateFoliageCluster,
  createSucculentBlade,
  FoliageGenOptions,
} from './foliageGenerator';
import { generateCactusGeometry, mergeSafe } from './cactusGenerator';
import { generateAlienFloraGeometry, computeTwistFreeFrames } from './alienFloraGenerator';
import { generateMossFungiGeometry } from './mossFungiGenerator';
import { generateAquaticGeometry } from './aquaticGenerator';
import { generateComposedBotanicalGeometry } from './composedElementGenerator';
import { getBarkTextures, getFoliageTextures } from './proceduralTextures';
import {
  CanopyNode,
  evaluateCrownEnvelopeRatio,
  generateVolumetricStyleCanopy,
} from './volumetricCanopy';

export interface GeneratedTreeResult {
  group: THREE.Group;
  stats: MeshStats;
}

const LOD_MULTIPLIER: Record<PolygonLOD, number> = {
  low: 0.55,
  medium: 0.85,
  high: 1.0,
  ultra: 1.35,
};

const TONAL_MODE_INDEX: Record<TonalShaderMode, number> = {
  natural_botanical: 0,
  bioluminescent_abyss: 1,
  voronoi_cracked: 2,
  iridescent_chitin: 3,
  translucent_jelly: 4,
  tri_tone_xenogradient: 5,
  striated_banded: 6,
  cel_concept_art: 7,
  spectral_thermal: 8,
};

function createPRNG(seed: number): () => number {
  let s = Math.abs(Math.floor(seed)) % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function shiftColorHue(hex: string, degShift = 0): string {
  if (!degShift || Math.abs(degShift) < 0.5) return hex;
  const c = new THREE.Color(hex);
  c.offsetHSL(degShift / 360, 0, 0);
  return '#' + c.getHexString();
}

function createTrunkSegment(
  rBot: number,
  rTop: number,
  len: number,
  radialSegs: number,
  colorHex: string,
  flareFactor: number,
  isBambooNode: boolean,
  rand: () => number
): THREE.BufferGeometry {
  const heightSegs = flareFactor > 0.05 || isBambooNode ? 3 : 1;
  const geo = new THREE.CylinderGeometry(rTop, rBot, len, radialSegs, heightSegs, false);

  const uvs = geo.attributes.uv;
  const vRepeat = Math.max(0.5, len / Math.max(0.18, rBot * 3.5));
  for (let i = 0; i < uvs.count; i++) {
    uvs.setY(i, uvs.getY(i) * vRepeat);
  }

  if (flareFactor > 0.05 || isBambooNode) {
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      const normY = (y + len * 0.5) / len;
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const theta = Math.atan2(z, x);

      if (flareFactor > 0.05 && normY < 0.65) {
        const buttress = Math.pow(1 - normY / 0.65, 2) * flareFactor;
        const lobes = 1 + Math.max(0, Math.cos(theta * 5)) * buttress * 0.85 + buttress * 0.35;
        pos.setX(i, x * lobes);
        pos.setZ(i, z * lobes);
      }
      if (isBambooNode && normY > 0.88) {
        pos.setX(i, x * 1.14);
        pos.setZ(i, z * 1.14);
      }
    }
    geo.computeVertexNormals();
  }

  geo.translate(0, len * 0.5, 0);
  const nonIdx = ensureStandardAttributes(geo);
  const cBot = new THREE.Color(colorHex).multiplyScalar(0.78);
  const cTop = new THREE.Color(colorHex);
  colorizeGeometryGradient(nonIdx, cBot, cTop, rand, 0.035);
  return nonIdx;
}

/**
 * Generates a single organic downward-curving root tube along a 3D CatmullRomCurve3
 * from the trunk collar down into the soil (y <= 0), using twist-free parallel transport frames
 * and outward-facing triangle winding.
 */
function createRootTube(
  points: THREE.Vector3[],
  rStart: number,
  rEnd: number,
  tubularSegs: number,
  radialSegs: number,
  colorHex: string,
  rand: () => number
): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points);
  const frames = computeTwistFreeFrames(curve, tubularSegs);
  const vertexCount = (tubularSegs + 1) * (radialSegs + 1);
  const positions = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const indices: number[] = [];

  for (let i = 0; i <= tubularSegs; i++) {
    const t = i / tubularSegs;
    const pt = curve.getPointAt(t);
    const N = frames.normals[i];
    const B = frames.binormals[i];
    const tipPinch = i === tubularSegs ? 0.01 : 1.0;
    const rBase = THREE.MathUtils.lerp(rStart, rEnd, Math.pow(t, 0.78)) * tipPinch;

    for (let j = 0; j <= radialSegs; j++) {
      const u = j / radialSegs;
      const theta = u * Math.PI * 2;
      const buttressVert = 1.0 + (1.0 - t) * 0.22 * Math.cos(theta * 2);
      const r = Math.max(0.002, rBase * buttressVert);

      const vx = pt.x + r * (Math.cos(theta) * N.x + Math.sin(theta) * B.x);
      const vy = pt.y + r * (Math.cos(theta) * N.y + Math.sin(theta) * B.y);
      const vz = pt.z + r * (Math.cos(theta) * N.z + Math.sin(theta) * B.z);

      const idx = i * (radialSegs + 1) + j;
      positions[idx * 3] = vx;
      positions[idx * 3 + 1] = vy;
      positions[idx * 3 + 2] = vz;

      uvs[idx * 2] = u;
      uvs[idx * 2 + 1] = t * 2.5;
    }
  }

  // Outward-facing counter-clockwise winding: (a, d, b) and (b, d, c)
  for (let i = 0; i < tubularSegs; i++) {
    for (let j = 0; j < radialSegs; j++) {
      const a = i * (radialSegs + 1) + j;
      const b = (i + 1) * (radialSegs + 1) + j;
      const c = (i + 1) * (radialSegs + 1) + (j + 1);
      const d = i * (radialSegs + 1) + (j + 1);
      indices.push(a, d, b, b, d, c);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();

  const nonIdx = ensureStandardAttributes(geo);
  const cTop = new THREE.Color(colorHex);
  const cBot = new THREE.Color(colorHex).multiplyScalar(0.68);
  colorizeGeometryGradient(nonIdx, cBot, cTop, rand, 0.04);
  return nonIdx;
}

/**
 * Advanced Botanical & Xenobotanical GLSL Shader Injection:
 * Supports GPU Wind + 9 Tonal/Alien Shader Modes (Voronoi Cracks, Bioluminescence,
 * Iridescent Chitin, Acid Jelly, Tri-Tone Gradient, Mineral Striations, Cel-Shading, Spectral).
 */
function attachBotanicalShader(
  material: THREE.Material,
  p: TreeParams,
  windUniform: { value: number },
  isFoliage: boolean
): void {
  if (
    !(
      material instanceof THREE.MeshStandardMaterial ||
      material instanceof THREE.MeshPhysicalMaterial ||
      material instanceof THREE.MeshLambertMaterial
    )
  ) {
    return;
  }

  const tonalMode: TonalShaderMode = p.tonalMode || 'natural_botanical';
  const modeIndex = TONAL_MODE_INDEX[tonalMode] ?? 0;
  const windStrength = p.windEnabled ? p.windStrength : 0.0;
  const windTurbulence = p.windTurbulence ?? 0.35;

  const hShift = p.hueShift ?? 0;
  const colMain = new THREE.Color(shiftColorHue(p.colorLeafMain, hShift));
  const colTip = new THREE.Color(shiftColorHue(p.colorLeafTip, hShift));
  const colAccent = new THREE.Color(shiftColorHue(p.colorAccent || p.colorFlower, hShift));

  const barkShaderIndex =
    p.barkType === 'mossy_deadwood'
      ? 1
      : p.barkType === 'eucalyptus_rainbow'
      ? 2
      : p.barkType === 'scifi_biolum_veins'
      ? 3
      : p.barkType === 'volcanic_magma_crust'
      ? 4
      : p.barkType === 'cork_oak_quercus'
      ? 5
      : p.barkType === 'dragon_scales_cycad'
      ? 6
      : p.barkType === 'strangler_vine_lattice'
      ? 7
      : 0;

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = windUniform;
    shader.uniforms.uWindStrength = { value: windStrength };
    shader.uniforms.uWindTurbulence = { value: windTurbulence };
    shader.uniforms.uTonalMode = { value: modeIndex };
    shader.uniforms.uBarkShaderMode = { value: barkShaderIndex };
    shader.uniforms.uIsFoliage = { value: isFoliage ? 1.0 : 0.0 };
    shader.uniforms.uTreeHeight = { value: Math.max(1.5, p.height) };
    shader.uniforms.uMainColor = { value: colMain };
    shader.uniforms.uTipColor = { value: colTip };
    shader.uniforms.uAccentColor = { value: colAccent };
    shader.uniforms.uEmissiveIntensity = { value: p.emissiveIntensity ?? 0.35 };
    shader.uniforms.uIridescence = { value: p.iridescenceAmount ?? 0.3 };
    shader.uniforms.uPatternScale = { value: p.patternScale ?? 1.0 };
    shader.uniforms.uPatternContrast = { value: p.patternContrast ?? 0.55 };

    shader.vertexShader =
      `
      uniform float uTime;
      uniform float uWindStrength;
      uniform float uWindTurbulence;
      varying vec3 vBotanyWorldPos;
      ` + shader.vertexShader;

    const flutterCode = isFoliage
      ? `
        float leafFlutter = sin(uTime * 5.2 + position.x * 6.0 + position.y * 5.0 + position.z * 6.0) * 0.032 * uWindTurbulence * uWindStrength;
        transformed.x += leafFlutter;
        transformed.y += leafFlutter * 0.6;
        transformed.z += leafFlutter;
      `
      : '';

    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `
      #include <begin_vertex>
      if (uWindStrength > 0.001) {
        float hFactor = max(0.0, position.y) * 0.14;
        float trunkSway = sin(uTime * 1.45 + position.y * 0.45 + position.x * 0.25) * hFactor * hFactor * 0.25 * uWindStrength;
        float gust = cos(uTime * 2.6 + position.z * 0.7) * hFactor * 0.08 * uWindTurbulence * uWindStrength;
        transformed.x += trunkSway + gust;
        transformed.z += trunkSway * 0.55 - gust * 0.5;
        ${flutterCode}
      }
      vBotanyWorldPos = transformed;
      `
    );

    if (
      material instanceof THREE.MeshStandardMaterial ||
      material instanceof THREE.MeshPhysicalMaterial
    ) {
      shader.fragmentShader =
        `
        uniform float uTime;
        uniform int uTonalMode;
        uniform int uBarkShaderMode;
        uniform float uIsFoliage;
        uniform float uTreeHeight;
        uniform vec3 uMainColor;
        uniform vec3 uTipColor;
        uniform vec3 uAccentColor;
        uniform float uEmissiveIntensity;
        uniform float uIridescence;
        uniform float uPatternScale;
        uniform float uPatternContrast;
        varying vec3 vBotanyWorldPos;

        vec3 botanyHash3(vec3 p) {
          p = vec3(
            dot(p, vec3(127.1, 311.7, 74.7)),
            dot(p, vec3(269.5, 183.3, 246.1)),
            dot(p, vec3(113.5, 271.9, 124.6))
          );
          return fract(sin(p) * 43758.5453123);
        }

        // Returns vec2(closestDist, edgeCrackFactor) for 3D cellular Voronoi pattern
        vec2 botanyVoronoiEdge(vec3 x) {
          vec3 n = floor(x);
          vec3 f = fract(x);
          float md1 = 8.0;
          float md2 = 8.0;
          for (int k = -1; k <= 1; k++) {
            for (int j = -1; j <= 1; j++) {
              for (int i = -1; i <= 1; i++) {
                vec3 g = vec3(float(i), float(j), float(k));
                vec3 o = botanyHash3(n + g);
                vec3 r = g + o - f;
                float d = dot(r, r);
                if (d < md1) {
                  md2 = md1;
                  md1 = d;
                } else if (d < md2) {
                  md2 = d;
                }
              }
            }
          }
          float edge = sqrt(md2) - sqrt(md1);
          return vec2(sqrt(md1), edge);
        }
        ` + shader.fragmentShader;

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <lights_fragment_end>',
        `
        #include <lights_fragment_end>
        vec3 viewDir = normalize(vViewPosition);
        float ndotv = clamp(abs(dot(normal, viewDir)), 0.0, 1.0);
        float fresnel = pow(1.0 - ndotv, 2.2);
        float hNorm = clamp(vBotanyWorldPos.y / max(1.0, uTreeHeight), 0.0, 1.0);

        // Specialized Trunk Bark Shaders (uIsFoliage < 0.5)
        if (uIsFoliage < 0.5 && uBarkShaderMode > 0) {
          if (uBarkShaderMode == 1) {
            // mossy_deadwood: lush emerald bryophyte moss in helical bark crevices
            vec3 mp = vBotanyWorldPos * 3.8;
            float helicalMoss = sin(mp.y * 2.6 + atan(mp.z, mp.x) * 3.0 + sin(mp.x * 4.0) * 0.8);
            float mossMask = smoothstep(0.28, 0.72, helicalMoss);
            vec3 mossVelvet = vec3(0.26, 0.52, 0.11);
            reflectedLight.directDiffuse = mix(reflectedLight.directDiffuse, mossVelvet * (0.45 + length(reflectedLight.directDiffuse) * 0.75), mossMask * 0.55);
            reflectedLight.indirectDiffuse = mix(reflectedLight.indirectDiffuse, mossVelvet * 0.38, mossMask * 0.55);
          } else if (uBarkShaderMode == 2) {
            // eucalyptus_rainbow: exfoliating multi-hued vertical strips
            float strip = fract(atan(vBotanyWorldPos.z, vBotanyWorldPos.x) * 1.6 + vBotanyWorldPos.y * 0.55 + sin(vBotanyWorldPos.y * 3.2) * 0.25);
            vec3 eucCol = strip < 0.25
              ? vec3(0.25, 0.68, 0.36)
              : strip < 0.5
              ? vec3(0.88, 0.46, 0.18)
              : strip < 0.75
              ? vec3(0.56, 0.28, 0.68)
              : vec3(0.72, 0.26, 0.22);
            reflectedLight.directDiffuse = mix(reflectedLight.directDiffuse, eucCol * (0.4 + length(reflectedLight.directDiffuse) * 0.7), 0.52);
          } else if (uBarkShaderMode == 3) {
            // scifi_biolum_veins: pulsing bioluminescent vascular sap channels on trunk
            vec3 bp = vBotanyWorldPos * 3.4;
            bp += 0.35 * sin(bp.yzx * 2.2);
            vec2 bVor = botanyVoronoiEdge(bp);
            float sapVein = 1.0 - smoothstep(0.015, 0.11, bVor.y);
            float pulse = 0.72 + 0.28 * sin(uTime * 2.6 - vBotanyWorldPos.y * 2.2);
            vec3 sapCol = mix(uTipColor, uAccentColor, 0.5 + 0.5 * sin(vBotanyWorldPos.y * 1.8));
            totalEmissiveRadiance += sapCol * sapVein * max(0.55, uEmissiveIntensity * 1.35) * pulse;
          } else if (uBarkShaderMode == 4) {
            // volcanic_magma_crust: charred basalt trunk with glowing ember fissures
            vec3 vp = vBotanyWorldPos * 3.8;
            vp += 0.3 * cos(vp.zxy * 2.5);
            vec2 vVor = botanyVoronoiEdge(vp);
            float emberCrack = 1.0 - smoothstep(0.015, 0.10, vVor.y);
            float emberPulse = 0.78 + 0.22 * sin(uTime * 2.0 + vBotanyWorldPos.y * 3.0);
            vec3 magmaCol = mix(vec3(1.0, 0.24, 0.04), vec3(1.0, 0.78, 0.12), emberCrack);
            reflectedLight.directDiffuse *= mix(0.45, 0.18, emberCrack);
            totalEmissiveRadiance += magmaCol * emberCrack * max(0.65, uEmissiveIntensity * 1.4) * emberPulse;
          }
        }

        // Mode 0: Natural Botanical Subsurface Scattering
        if (uTonalMode == 0) {
          if (uIsFoliage > 0.5) {
            reflectedLight.directDiffuse += uTipColor * fresnel * 0.36;
            reflectedLight.indirectDiffuse += uTipColor * 0.12;
          }
          if (uEmissiveIntensity > 0.02) {
            totalEmissiveRadiance += uAccentColor * fresnel * uEmissiveIntensity * 0.45;
          }
        }
        // Mode 1: Bioluminescent Abyss (Organic Pulsing Veins + Neon Rim Glow)
        else if (uTonalMode == 1) {
          float pulse = 0.68 + 0.32 * sin(uTime * 2.4 - vBotanyWorldPos.y * 1.8);
          vec3 bioPos = vBotanyWorldPos * (3.2 * max(0.25, uPatternScale));
          bioPos += 0.42 * sin(bioPos.yzx * 1.9 + uTime * 0.4) + 0.22 * cos(bioPos.zxy * 3.7);
          vec2 bioVor = botanyVoronoiEdge(bioPos);
          float veinWave = 1.0 - smoothstep(0.02, 0.14, bioVor.y);
          vec3 bioGlow = mix(uTipColor, uAccentColor, fresnel * 0.65 + veinWave * 0.35);
          totalEmissiveRadiance += bioGlow * (fresnel * 1.15 + veinWave * uPatternContrast * 1.1) * max(0.35, uEmissiveIntensity) * pulse;
          reflectedLight.directDiffuse += uAccentColor * fresnel * 0.42;
        }
        // Mode 2: Organic Curvilinear Cellular Membranes & Living Sap Veins (Domain-Warped Voronoi)
        else if (uTonalMode == 2) {
          vec3 wp = vBotanyWorldPos * (2.65 * max(0.25, uPatternScale));
          // 3D harmonic curl domain-warping eliminates straight polygon edges and creates organic biological cells
          wp += 0.38 * sin(wp.yzx * 2.3) + 0.19 * cos(wp.zxy * 4.5);
          vec2 vor = botanyVoronoiEdge(wp);
          vec2 subVor = botanyVoronoiEdge(wp * 2.15 + vec3(1.7, 3.1, 2.4));
          float mainVein = 1.0 - smoothstep(0.015, 0.11 + (1.0 - uPatternContrast) * 0.08, vor.y);
          float capVein = (1.0 - smoothstep(0.01, 0.08, subVor.y)) * 0.38;
          float crack = clamp(mainVein + capVein, 0.0, 1.0);
          float cellPillow = smoothstep(0.08, 0.72, vor.x);
          reflectedLight.directDiffuse *= mix(1.0, 0.32, mainVein * uPatternContrast);
          reflectedLight.indirectDiffuse *= mix(1.0, 0.42, mainVein * uPatternContrast);
          reflectedLight.directDiffuse = mix(reflectedLight.directDiffuse, reflectedLight.directDiffuse * (1.18 - cellPillow * 0.26), 0.7);
          float sapPulse = 0.82 + 0.18 * sin(uTime * 2.1 + vBotanyWorldPos.y * 2.5);
          totalEmissiveRadiance += mix(uAccentColor, uTipColor, capVein) * crack * uEmissiveIntensity * 1.35 * sapPulse;
        }
        // Mode 3: Iridescent Chitin / Rainbow Bubble Film
        else if (uTonalMode == 3) {
          if (uIsFoliage > 0.5) {
            vec3 iridA = uMainColor;
            vec3 iridB = uTipColor;
            vec3 iridC = uAccentColor;
            float spatialPhase = fract(
              ndotv * (1.2 + uIridescence * 1.4) +
              hNorm * 0.45 +
              (vBotanyWorldPos.x * 0.35 + vBotanyWorldPos.z * 0.35)
            );
            vec3 iridCol = spatialPhase < 0.5
              ? mix(iridA, iridB, spatialPhase * 2.0)
              : mix(iridB, iridC, (spatialPhase - 0.5) * 2.0);
            reflectedLight.directDiffuse = mix(
              reflectedLight.directDiffuse,
              iridCol * max(0.35, length(reflectedLight.directDiffuse) * 0.85),
              0.28 + uIridescence * 0.22
            );
            reflectedLight.directSpecular += iridCol * fresnel * (0.55 + uIridescence * 0.65);
            totalEmissiveRadiance += iridCol * fresnel * max(0.22, uEmissiveIntensity * 0.55);
          } else {
            reflectedLight.directSpecular += uTipColor * fresnel * 0.22;
          }
        }
        // Mode 4: Translucent Acid Jelly / Iridescent Dew Bubble
        else if (uTonalMode == 4) {
          if (uIsFoliage > 0.5) {
            float innerGlow = pow(ndotv, 1.35);
            vec3 jellyCol = mix(uAccentColor, uTipColor, innerGlow);
            reflectedLight.directDiffuse = mix(reflectedLight.directDiffuse, jellyCol * 0.9, 0.25);
            reflectedLight.indirectDiffuse += jellyCol * 0.24;
            totalEmissiveRadiance += mix(uMainColor, uAccentColor, fresnel) * (0.22 + uEmissiveIntensity * 0.55);
          }
        }
        // Mode 5: Tri-Tone Xenogradient (Root -> Mid -> Crown Apex)
        else if (uTonalMode == 5) {
          if (uIsFoliage > 0.5) {
            vec3 gradCol = hNorm < 0.5
              ? mix(uMainColor, uTipColor, hNorm * 2.0)
              : mix(uTipColor, uAccentColor, (hNorm - 0.5) * 2.0);
            reflectedLight.directDiffuse = mix(reflectedLight.directDiffuse, gradCol * (0.45 + length(reflectedLight.directDiffuse) * 0.65), 0.45);
            totalEmissiveRadiance += gradCol * fresnel * uEmissiveIntensity * 0.55;
          }
        }
        // Mode 6: Striated Mineral Bands
        else if (uTonalMode == 6) {
          float warp = sin(vBotanyWorldPos.x * 3.5 + vBotanyWorldPos.z * 3.5) * 0.25;
          float band = 0.5 + 0.5 * sin((vBotanyWorldPos.y + warp) * 10.0 * uPatternScale);
          float sharpBand = smoothstep(0.35, 0.65, band);
          vec3 bandCol = mix(uMainColor, uAccentColor, sharpBand * uPatternContrast);
          reflectedLight.directDiffuse = mix(reflectedLight.directDiffuse, bandCol * (0.4 + length(reflectedLight.directDiffuse) * 0.65), 0.65);
          totalEmissiveRadiance += uAccentColor * sharpBand * uEmissiveIntensity * 0.45;
        }
        // Mode 7: Cel-Shaded Concept Art (Sci-Fi Illustration)
        else if (uTonalMode == 7) {
          float lum = dot(reflectedLight.directDiffuse, vec3(0.299, 0.587, 0.114));
          float qLum = floor(lum * 3.5 + 0.5) / 3.5;
          reflectedLight.directDiffuse *= (qLum / max(0.001, lum));
          float inkOutline = smoothstep(0.18, 0.28, ndotv);
          reflectedLight.directDiffuse *= inkOutline;
          reflectedLight.indirectDiffuse *= inkOutline;
          totalEmissiveRadiance += uAccentColor * (1.0 - inkOutline) * uEmissiveIntensity * 0.5;
        }
        // Mode 8: Thermal Exobiological Spectrum
        else if (uTonalMode == 8) {
          float heat = fract(hNorm * 0.85 + fresnel * 0.25);
          vec3 cCold = vec3(0.08, 0.12, 0.55);
          vec3 cMid = vec3(0.0, 0.85, 0.65);
          vec3 cHot = vec3(1.0, 0.22, 0.45);
          vec3 cApex = vec3(1.0, 0.92, 0.2);
          vec3 specCol = heat < 0.33
            ? mix(cCold, cMid, heat * 3.0)
            : heat < 0.66
            ? mix(cMid, cHot, (heat - 0.33) * 3.0)
            : mix(cHot, cApex, (heat - 0.66) * 3.0);
          reflectedLight.directDiffuse = specCol * (0.45 + length(reflectedLight.directDiffuse) * 0.55);
          totalEmissiveRadiance += specCol * (0.25 + uEmissiveIntensity * 0.55);
        }
        `
      );
    }
  };
}

export function buildBotanicalMaterials(
  p: TreeParams,
  q: QualitySettings,
  windUniform: { value: number },
  maxAnisotropy = 4
): { barkMaterial: THREE.Material; foliageMaterial: THREE.Material } {
  const wireframe = q.viewportMode === 'wireframe';
  const isXray = q.viewportMode === 'xray_canopy';
  const effectiveOpacity = isXray ? Math.min(0.42, p.canopyOpacity) : p.canopyOpacity;
  const isTranslucentCanopy = effectiveOpacity < 0.98;

  if (q.viewportMode === 'normals') {
    const normMat = new THREE.MeshNormalMaterial({
      wireframe: false,
      flatShading: !p.smoothShading,
      side: THREE.DoubleSide,
    });
    return { barkMaterial: normMat, foliageMaterial: normMat.clone() };
  }

  if (q.viewportMode === 'clay') {
    const clayBark = new THREE.MeshStandardMaterial({
      color: '#94a3b8',
      roughness: 0.78,
      metalness: 0.05,
      flatShading: !p.smoothShading,
    });
    const clayFoliage = new THREE.MeshStandardMaterial({
      color: '#e2e8f0',
      roughness: 0.48,
      metalness: 0.05,
      flatShading: !p.smoothShading,
      transparent: isTranslucentCanopy,
      opacity: effectiveOpacity,
      depthWrite: !isTranslucentCanopy,
      side: THREE.DoubleSide,
    });
    return { barkMaterial: clayBark, foliageMaterial: clayFoliage };
  }

  const effectiveBarkType = p.barkType || 'fissured';
  const barkTex = getBarkTextures(effectiveBarkType, q.textureQuality, maxAnisotropy);
  const foliageTex =
    p.representationStyle === 'botanical_leaves'
      ? getFoliageTextures(q.textureQuality, maxAnisotropy)
      : { map: null, normalMap: null, roughnessMap: null };

  if (q.shaderQuality === 'unlit') {
    const barkMat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      map: barkTex.map,
      wireframe,
    });
    const folMat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      map: foliageTex.map,
      transparent: isTranslucentCanopy,
      opacity: effectiveOpacity,
      depthWrite: !isTranslucentCanopy,
      side: THREE.DoubleSide,
      wireframe,
    });
    return { barkMaterial: barkMat, foliageMaterial: folMat };
  }

  const tonalMode = p.tonalMode || 'natural_botanical';
  const wetness = p.wetnessGloss ?? (tonalMode === 'translucent_jelly' ? 0.85 : 0.15);
  const iridescence = p.iridescenceAmount ?? (tonalMode === 'iridescent_chitin' ? 0.85 : 0.0);

  if (q.shaderQuality === 'lambert' && tonalMode === 'natural_botanical') {
    const barkMat = new THREE.MeshLambertMaterial({
      vertexColors: true,
      map: barkTex.map,
      wireframe,
    });
    const folMat = new THREE.MeshLambertMaterial({
      vertexColors: true,
      map: foliageTex.map,
      transparent: isTranslucentCanopy,
      opacity: effectiveOpacity,
      depthWrite: !isTranslucentCanopy,
      side: THREE.DoubleSide,
      wireframe,
    });
    if (p.windEnabled) {
      attachBotanicalShader(barkMat, p, windUniform, false);
      attachBotanicalShader(folMat, p, windUniform, true);
    }
    return { barkMaterial: barkMat, foliageMaterial: folMat };
  }

  const isPhysical =
    q.shaderQuality === 'pbr_subsurface' ||
    tonalMode !== 'natural_botanical' ||
    wetness > 0.25 ||
    iridescence > 0.15;
  const flatShade = !p.smoothShading || (q.meshDensity !== undefined && q.meshDensity < 0.32);

  const barkMat = new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    roughness: Math.max(0.18, (p.barkRoughness || 0.82) * (1.0 - wetness * 0.65)),
    metalness: tonalMode === 'iridescent_chitin' ? 0.32 : 0.04,
    clearcoat: wetness * 0.85,
    clearcoatRoughness: Math.max(0.08, 0.35 - wetness * 0.25),
    iridescence: iridescence * 0.7,
    flatShading: flatShade,
    map: barkTex.map,
    normalMap: barkTex.normalMap,
    normalScale: new THREE.Vector2(0.85, 0.85),
    roughnessMap: barkTex.roughnessMap,
    wireframe,
  });

  const folMat = isPhysical
    ? new THREE.MeshPhysicalMaterial({
        vertexColors: true,
        roughness: Math.max(0.12, 0.44 * (1.0 - wetness * 0.68)),
        metalness: tonalMode === 'iridescent_chitin' ? 0.38 : 0.04,
        clearcoat: Math.max(0.16, wetness),
        clearcoatRoughness: Math.max(0.06, 0.32 - wetness * 0.25),
        iridescence: iridescence,
        iridescenceIOR: 1.45,
        sheen: 0.38,
        sheenColor: new THREE.Color(p.colorLeafTip),
        flatShading: flatShade,
        map: foliageTex.map,
        normalMap: foliageTex.normalMap,
        normalScale: new THREE.Vector2(0.45, 0.45),
        transparent: isTranslucentCanopy,
        opacity: effectiveOpacity,
        depthWrite: !isTranslucentCanopy,
        side: THREE.DoubleSide,
        wireframe,
      })
    : new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.48,
        metalness: 0.02,
        flatShading: flatShade,
        map: foliageTex.map,
        normalMap: foliageTex.normalMap,
        normalScale: new THREE.Vector2(0.4, 0.4),
        transparent: isTranslucentCanopy,
        opacity: effectiveOpacity,
        depthWrite: !isTranslucentCanopy,
        side: THREE.DoubleSide,
        wireframe,
      });

  attachBotanicalShader(barkMat, p, windUniform, false);
  attachBotanicalShader(folMat, p, windUniform, true);

  return { barkMaterial: barkMat, foliageMaterial: folMat };
}

export function generateProceduralTree(
  p: TreeParams,
  q: QualitySettings,
  windUniform: { value: number },
  maxAnisotropy = 4
): GeneratedTreeResult {
  const t0 = performance.now();
  const rand = createPRNG(p.seed);
  const densityFactor = q.meshDensity ?? 1.0;
  const lodMult = THREE.MathUtils.clamp(
    LOD_MULTIPLIER[q.polygonLod] * densityFactor,
    0.15,
    2.2
  );
  const radialSegsBase = Math.max(
    3,
    Math.round((p.radialSegments || 10) * lodMult)
  );
  const branchStepsBase = Math.max(
    1,
    Math.round((p.curveSteps || 4) * lodMult)
  );

  const GOLDEN_ANGLE = 2.39996323;
  const hShift = p.hueShift ?? 0;
  const colTrunk = shiftColorHue(p.colorTrunk, hShift);
  const colLeafMain = shiftColorHue(p.colorLeafMain, hShift);
  const colLeafTip = shiftColorHue(p.colorLeafTip, hShift);
  const colFlower = shiftColorHue(p.colorFlower, hShift);

  const trunkGeos: THREE.BufferGeometry[] = [];
  const foliageGeos: THREE.BufferGeometry[] = [];
  const canopyNodes: CanopyNode[] = [];

  const isVolumetricStyle = p.representationStyle !== 'botanical_leaves';

  const foliageOpts: FoliageGenOptions = {
    foliageType: p.foliageType,
    customElement: p.customElement,
    scale: p.leafScale,
    density: p.leafDensity,
    widthRatio: p.leafWidthRatio,
    bend: p.leafBend,
    colorMain: colLeafMain,
    colorTip: colLeafTip,
    colorFlower: colFlower,
    season: p.season,
    lod: q.polygonLod,
    needleLength: p.needleLength,
    needleDensity: p.needleDensity,
    fascicleCount: p.fascicleCount,
    needleSpreadAngle: p.needleSpreadAngle,
    pineConeDensity: p.pineConeDensity,
    rand,
  };

  // Pre-build reusable botanical foliage cluster archetypes when in botanical_leaves mode
  const clusterVariants: THREE.BufferGeometry[] = [];
  if (
    !isVolumetricStyle &&
    p.foliageType !== 'none' &&
    p.engine !== 'palm' &&
    p.engine !== 'rosette' &&
    p.engine !== 'alien_xenobotany' &&
    p.engine !== 'moss_fungi_rock' &&
    p.engine !== 'aquatic_coral_algae' &&
    p.engine !== 'composed_custom'
  ) {
    const varCount = q.polygonLod === 'low' ? 2 : 3;
    for (let v = 0; v < varCount; v++) {
      const cl = generateFoliageCluster(foliageOpts);
      if (cl) clusterVariants.push(cl);
    }
  }

  const pickCluster = (scaleFactor: number): THREE.BufferGeometry | null => {
    if (clusterVariants.length === 0) return null;
    const idx = Math.floor(rand() * clusterVariants.length);
    const clone = clusterVariants[idx].clone();
    clone.scale(scaleFactor, scaleFactor, scaleFactor);
    return clone;
  };

  const recordCanopyNode = (mat: THREE.Matrix4, radius: number) => {
    const pos = new THREE.Vector3().setFromMatrixPosition(mat);
    const dir = new THREE.Vector3(0, 1, 0)
      .applyMatrix4(new THREE.Matrix4().extractRotation(mat))
      .normalize();
    canopyNodes.push({
      position: pos,
      radius: Math.max(0.25, radius),
      direction: dir,
    });
  };

  const routeDetailGeometriesOrVolumetricNodes = (
    detailGeos: THREE.BufferGeometry[],
    liftY = 0,
    fallbackBodyGeos?: THREE.BufferGeometry[]
  ) => {
    if (!isVolumetricStyle) {
      detailGeos.forEach((dg) => {
        if (liftY > 0.01) dg.translate(0, liftY, 0);
        foliageGeos.push(dg);
      });
      return;
    }

    const sourceGeos =
      detailGeos.length > 0 ? detailGeos : fallbackBodyGeos || [];
    const cellSize = Math.max(0.38, p.height * 0.14);
    const buckets = new Map<
      string,
      { sumPos: THREE.Vector3; sumRad: number; maxRad: number; count: number }
    >();

    sourceGeos.forEach((dg) => {
      if (liftY > 0.01 && detailGeos.length > 0) dg.translate(0, liftY, 0);
      dg.computeBoundingSphere();
      if (dg.boundingSphere && Number.isFinite(dg.boundingSphere.center.x)) {
        const c = dg.boundingSphere.center;
        const r = Math.max(0.18, dg.boundingSphere.radius);
        const key = `${Math.round(c.x / cellSize)}_${Math.round(c.y / cellSize)}_${Math.round(c.z / cellSize)}`;
        const existing = buckets.get(key);
        if (existing) {
          existing.sumPos.add(c);
          existing.sumRad += r;
          existing.maxRad = Math.max(existing.maxRad, r);
          existing.count++;
        } else {
          buckets.set(key, {
            sumPos: c.clone(),
            sumRad: r,
            maxRad: r,
            count: 1,
          });
        }
      }
      if (detailGeos.length > 0) {
        dg.dispose();
      }
    });

    buckets.forEach((b) => {
      const center = b.sumPos.multiplyScalar(1 / b.count);
      const avgRad = b.sumRad / b.count;
      const clusterBonus = Math.min(0.65, Math.sqrt(b.count) * 0.14);
      const effRad = THREE.MathUtils.clamp(
        Math.max(b.maxRad * 0.85, avgRad + clusterBonus) * (0.75 + p.leafScale * 0.25),
        0.32,
        Math.max(0.85, p.height * 0.28)
      );
      canopyNodes.push({
        position: center,
        radius: effRad,
        direction: new THREE.Vector3(0, 1, 0),
      });
    });

    if (canopyNodes.length === 0) {
      canopyNodes.push({
        position: new THREE.Vector3(0, p.height * 0.68, 0),
        radius: Math.max(0.6, p.height * 0.26 * p.leafScale),
        direction: new THREE.Vector3(0, 1, 0),
      });
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. TRUE DOWNWARD-CURVING BUTTRESS, SURFACE & STILT ROOTS
  //    The trunk starts AT the root collar (trunkStartY) and divides directly
  //    into the roots—so the trunk cylinder NEVER sticks down below the roots!
  // ═══════════════════════════════════════════════════════════════════════════
  const rootCount = Math.round(p.rootCount ?? 5);
  const hasBasalRoots =
    p.showRoots &&
    rootCount > 0 &&
    p.engine !== 'cactus' &&
    p.engine !== 'rosette' &&
    p.engine !== 'bamboo' &&
    p.engine !== 'moss_fungi_rock' &&
    p.engine !== 'aquatic_coral_algae' &&
    p.engine !== 'composed_custom';

  const rootArchMult = p.rootArch ?? 0.35;
  const collarY = hasBasalRoots
    ? Math.max(0.14, p.radius * (0.28 + rootArchMult * 1.15))
    : 0;
  // The trunk begins inside the fused root collar and never protrudes below it
  const trunkStartY = hasBasalRoots ? collarY * 0.56 : 0;

  if (
    p.showRoots &&
    rootCount > 0 &&
    p.engine !== 'moss_fungi_rock' &&
    p.engine !== 'aquatic_coral_algae' &&
    p.engine !== 'composed_custom'
  ) {
    const rootLenMult = p.rootLength ?? 1.2;
    const rootThickMult = p.rootThickness ?? 1.0;
    const rSegs = Math.max(5, radialSegsBase - 1);
    const effCollarY = Math.max(0.14, p.radius * (0.28 + rootArchMult * 1.15));

    // Smooth basal root-crown hub where the bottom of the trunk divides into the roots
    if (hasBasalRoots) {
      const hubR = p.radius * (0.92 + p.flare * 0.18);
      const hubH = effCollarY * 0.42;
      const hubGeo = new THREE.SphereGeometry(hubR, rSegs, 6);
      hubGeo.scale(1.0, Math.max(0.35, hubH / Math.max(0.05, hubR)), 1.0);
      hubGeo.translate(0, trunkStartY + hubH * 0.25, 0);
      const hubStd = ensureStandardAttributes(hubGeo);
      const cBot = new THREE.Color(colTrunk).multiplyScalar(0.74);
      const cTop = new THREE.Color(colTrunk);
      colorizeGeometryGradient(hubStd, cBot, cTop, rand, 0.03);
      trunkGeos.push(hubStd);
    }

    for (let r = 0; r < rootCount; r++) {
      const baseYaw =
        (r / rootCount) * Math.PI * 2 +
        (rand() - 0.5) * (0.38 / Math.max(1, rootCount * 0.25));
      const thisCollarY = effCollarY * (0.92 + rand() * 0.14);
      const reach = Math.max(
        0.38,
        p.radius * (1.75 + rootLenMult * 2.35 + p.flare * 1.1) * (0.86 + rand() * 0.28)
      );
      const rStart = Math.max(
        0.032,
        p.radius * (0.46 + p.flare * 0.18) * rootThickMult
      );
      const rEnd = Math.max(0.008, rStart * 0.13);

      const dirX = Math.cos(baseYaw);
      const dirZ = Math.sin(baseYaw);
      const perpX = -dirZ;
      const perpZ = dirX;
      const wiggle = (rand() - 0.5) * reach * 0.16;

      // Convex outward-and-downward root arch emerging from the trunk base into the soil (y <= 0)
      const rootPts = [
        new THREE.Vector3(
          dirX * p.radius * 0.24,
          thisCollarY * 0.88,
          dirZ * p.radius * 0.24
        ),
        new THREE.Vector3(
          dirX * (p.radius * 0.58 + reach * 0.26) + perpX * wiggle * 0.4,
          thisCollarY * 0.52,
          dirZ * (p.radius * 0.58 + reach * 0.26) + perpZ * wiggle * 0.4
        ),
        new THREE.Vector3(
          dirX * reach * 0.72 + perpX * wiggle,
          Math.max(0.03, rStart * 0.26),
          dirZ * reach * 0.72 + perpZ * wiggle
        ),
        new THREE.Vector3(
          dirX * reach + perpX * wiggle * 0.6,
          -0.05,
          dirZ * reach + perpZ * wiggle * 0.6
        ),
      ];

      const mainRoot = createRootTube(rootPts, rStart, rEnd, 11, rSegs, colTrunk, rand);
      trunkGeos.push(mainRoot);

      // Lateral secondary rootlet splitting along the ground
      if (rootLenMult > 0.55 && rand() < 0.78) {
        const forkSign = rand() < 0.5 ? 1 : -1;
        const forkAngle = baseYaw + forkSign * (0.42 + rand() * 0.32);
        const forkStart = rootPts[1].clone().lerp(rootPts[2], 0.52);
        const forkReach = reach * (0.45 + rand() * 0.25);
        const forkPts = [
          forkStart,
          new THREE.Vector3(
            forkStart.x + Math.cos(forkAngle) * forkReach * 0.55,
            Math.max(0.02, forkStart.y * 0.35),
            forkStart.z + Math.sin(forkAngle) * forkReach * 0.55
          ),
          new THREE.Vector3(
            forkStart.x + Math.cos(forkAngle) * forkReach,
            -0.04,
            forkStart.z + Math.sin(forkAngle) * forkReach
          ),
        ];
        const subRoot = createRootTube(
          forkPts,
          rStart * 0.48,
          rEnd * 0.7,
          6,
          Math.max(4, rSegs - 2),
          colTrunk,
          rand
        );
        trunkGeos.push(subRoot);
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. ENGINE-SPECIFIC GROWTH ALGORITHMS (Including Alien Xenobotany)
  // ═══════════════════════════════════════════════════════════════════════════
  if (p.engine === 'composed_custom') {
    const composedRes = generateComposedBotanicalGeometry(
      {
        ...p,
        colorTrunk: colTrunk,
        colorLeafMain: colLeafMain,
        colorLeafTip: colLeafTip,
        colorFlower: colFlower,
      },
      q.polygonLod,
      densityFactor,
      rand
    );
    trunkGeos.push(...composedRes.bodyGeometries);
    routeDetailGeometriesOrVolumetricNodes(
      composedRes.detailGeometries,
      0,
      composedRes.bodyGeometries
    );
  } else if (p.engine === 'moss_fungi_rock') {
    const mossRes = generateMossFungiGeometry(
      {
        ...p,
        colorTrunk: colTrunk,
        colorLeafMain: colLeafMain,
        colorLeafTip: colLeafTip,
        colorFlower: colFlower,
      },
      q.polygonLod,
      densityFactor,
      rand
    );
    trunkGeos.push(...mossRes.bodyGeometries);
    routeDetailGeometriesOrVolumetricNodes(
      mossRes.detailGeometries,
      0,
      mossRes.bodyGeometries
    );
  } else if (p.engine === 'aquatic_coral_algae') {
    const aquaticRes = generateAquaticGeometry(
      {
        ...p,
        colorTrunk: colTrunk,
        colorLeafMain: colLeafMain,
        colorLeafTip: colLeafTip,
        colorFlower: colFlower,
      },
      q.polygonLod,
      densityFactor,
      rand
    );
    trunkGeos.push(...aquaticRes.bodyGeometries);
    routeDetailGeometriesOrVolumetricNodes(
      aquaticRes.detailGeometries,
      0,
      aquaticRes.bodyGeometries
    );
  } else if (p.engine === 'alien_xenobotany') {
    const alienRes = generateAlienFloraGeometry(
      {
        ...p,
        colorTrunk: colTrunk,
        colorLeafMain: colLeafMain,
        colorLeafTip: colLeafTip,
        colorFlower: colFlower,
      },
      q.polygonLod,
      rand,
      densityFactor
    );
    // If basal stilt roots are active, lift the central alien body so it rests atop the root collar
    const alienLiftY = hasBasalRoots ? trunkStartY * 0.85 : 0;
    alienRes.bodyGeometries.forEach((bg) => {
      if (alienLiftY > 0.01) bg.translate(0, alienLiftY, 0);
      trunkGeos.push(bg);
    });
    routeDetailGeometriesOrVolumetricNodes(
      alienRes.detailGeometries,
      alienLiftY,
      alienRes.bodyGeometries
    );
  } else if (p.engine === 'cactus') {
    const cactusRes = generateCactusGeometry(
      {
        ...p,
        colorTrunk: colTrunk,
        colorLeafMain: colLeafMain,
        colorLeafTip: colLeafTip,
        colorFlower: colFlower,
      },
      q.polygonLod,
      rand
    );
    trunkGeos.push(...cactusRes.bodyGeometries);
    if (!isVolumetricStyle) {
      foliageGeos.push(...cactusRes.detailGeometries);
      if (p.foliageType !== 'none' && clusterVariants.length > 0) {
        const crown = pickCluster(0.85);
        if (crown) {
          crown.translate(0, p.height, 0);
          foliageGeos.push(crown);
        }
      }
    } else {
      routeDetailGeometriesOrVolumetricNodes(
        cactusRes.detailGeometries,
        0,
        cactusRes.bodyGeometries
      );
    }
  } else if (p.engine === 'rosette') {
    const rosetteBlades: THREE.BufferGeometry[] = [];
    const layers = 4;
    const perLayer = Math.max(6, 5 + p.leafDensity * 2);
    for (let layer = 0; layer < layers; layer++) {
      const lt = layer / (layers - 1);
      const startY = p.height * 0.08 * lt;
      const tilt = 1.25 - lt * 0.85;
      for (let i = 0; i < perLayer; i++) {
        const yaw = (i / perLayer) * Math.PI * 2 + layer * 0.45 + (rand() - 0.5) * 0.15;
        const bladeLen =
          p.height * (0.65 + rand() * 0.25) * (1 - lt * 0.28) * (p.leafScale * 0.75);
        const bladeW = p.radius * 0.65 * (1 - lt * 0.2);

        const blade =
          p.foliageType === 'succulent_rosette'
            ? createSucculentBlade(bladeLen, bladeW, colLeafMain, colLeafTip, rand)
            : generateFoliageCluster({ ...foliageOpts, scale: bladeLen * 0.6 });

        if (blade) {
          const m = new THREE.Matrix4().makeTranslation(0, startY, 0);
          m.multiply(new THREE.Matrix4().makeRotationY(yaw));
          m.multiply(new THREE.Matrix4().makeRotationX(tilt));
          blade.applyMatrix4(m);
          rosetteBlades.push(blade);
        }
      }
    }
    routeDetailGeometriesOrVolumetricNodes(rosetteBlades, 0);
  } else if (p.engine === 'bamboo') {
    const culmCount = 4 + p.leafDensity;
    for (let c = 0; c < culmCount; c++) {
      const dist = c === 0 ? 0 : 0.28 + rand() * 0.95;
      const ang = (c / culmCount) * Math.PI * 2 + rand() * 0.4;
      const mat = new THREE.Matrix4().makeTranslation(
        Math.cos(ang) * dist,
        0,
        Math.sin(ang) * dist
      );
      mat.multiply(new THREE.Matrix4().makeRotationZ((rand() - 0.5) * 0.12));
      mat.multiply(new THREE.Matrix4().makeRotationX((rand() - 0.5) * 0.12));

      const culmH = p.height * (0.72 + rand() * 0.35);
      const nodes = p.levels + 4;
      const internodeLen = culmH / nodes;
      let rad = p.radius * (0.78 + rand() * 0.3);

      for (let n = 0; n < nodes; n++) {
        const nextRad = rad * Math.pow(p.taper, 0.35);
        const seg = createTrunkSegment(
          rad,
          nextRad,
          internodeLen,
          radialSegsBase,
          colTrunk,
          0,
          true,
          rand
        );
        seg.applyMatrix4(mat);
        trunkGeos.push(seg);

        mat.multiply(new THREE.Matrix4().makeTranslation(0, internodeLen, 0));
        mat.multiply(new THREE.Matrix4().makeRotationZ((rand() - 0.5) * p.noise * 0.18));

        if (n >= Math.floor(nodes * 0.35)) {
          recordCanopyNode(mat, p.leafScale * 0.65);
          if (!isVolumetricStyle) {
            const sprayCount = n >= nodes - 2 ? 2 : 1;
            for (let sp = 0; sp < sprayCount; sp++) {
              const leaves = pickCluster(0.65 + (n / nodes) * 0.35);
              if (leaves) {
                const lm = mat.clone();
                lm.multiply(new THREE.Matrix4().makeRotationY((n + sp) * GOLDEN_ANGLE));
                lm.multiply(new THREE.Matrix4().makeRotationZ(0.65));
                leaves.applyMatrix4(lm);
                foliageGeos.push(leaves);
              }
            }
          }
        }
        rad = nextRad;
      }
    }
  } else if (p.engine === 'palm') {
    const steps = branchStepsBase * p.levels;
    const effHeight = Math.max(1.2, p.height - trunkStartY);
    const stepLen = effHeight / steps;
    const currMat = new THREE.Matrix4().makeTranslation(0, trunkStartY, 0);
    let currRad = p.radius;
    const curveDir = rand() * Math.PI * 2;

    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      const nextRad = currRad * Math.pow(p.taper, 1 / steps);
      const flare = s === 0 && !hasBasalRoots ? p.flare * 0.6 : 0;
      const seg = createTrunkSegment(
        currRad * 1.06,
        nextRad,
        stepLen,
        radialSegsBase,
        colTrunk,
        flare,
        false,
        rand
      );
      seg.applyMatrix4(currMat);
      trunkGeos.push(seg);

      currMat.multiply(new THREE.Matrix4().makeTranslation(0, stepLen * 0.97, 0));
      const bendStep = (0.5 - t) * p.noise * 0.24;
      currMat.multiply(
        new THREE.Matrix4().makeRotationFromEuler(
          new THREE.Euler(Math.sin(curveDir) * bendStep, 0, Math.cos(curveDir) * bendStep)
        )
      );
      currRad = nextRad;
    }

    recordCanopyNode(currMat, p.leafScale * 1.35);
    if (!isVolumetricStyle) {
      const crownGeo = generateFoliageCluster({
        ...foliageOpts,
        scale: p.leafScale * 1.15,
      });
      if (crownGeo) {
        crownGeo.applyMatrix4(currMat);
        foliageGeos.push(crownGeo);
      }
    }
  } else if (p.engine === 'monopodial') {
    // ═════════════════════════════════════════════════════════════════════════
    // MONOPODIAL CONIFERS (Pines, Firs, Spruces, Giant Sequoia, Cedar, Cypress)
    // Multi-order boughs with horizontal left/right secondary branchlets and
    // 360° volumetric foliage pads clothing the branches & tips!
    // ═════════════════════════════════════════════════════════════════════════
    const tierCount = Math.max(5, p.levels * 2 + 3);
    const bareBaseRatio = THREE.MathUtils.clamp(p.trunkClearHeight || 0.16, 0.06, 0.55);
    const totalH = Math.max(1.5, p.height - trunkStartY);
    const stepH = totalH / tierCount;
    const branchAngleRad = THREE.MathUtils.degToRad(p.angle);

    const trunkMat = new THREE.Matrix4().makeTranslation(0, trunkStartY, 0);
    let currRad = p.radius;

    for (let t = 0; t < tierCount; t++) {
      const heightFrac = t / tierCount;
      const nextRad = Math.max(0.025, p.radius * Math.pow(1 - heightFrac * 0.91, 0.85));
      // When basal roots are shown, the root collar handles the basal flare so no cylinder hangs below
      const flare = t === 0 && !hasBasalRoots ? p.flare : 0;

      const seg = createTrunkSegment(
        currRad,
        nextRad,
        stepH * 1.03,
        Math.max(4, Math.round(radialSegsBase * (1 - heightFrac * 0.4))),
        colTrunk,
        flare,
        false,
        rand
      );
      seg.applyMatrix4(trunkMat);
      trunkGeos.push(seg);

      trunkMat.multiply(new THREE.Matrix4().makeTranslation(0, stepH, 0));
      trunkMat.multiply(
        new THREE.Matrix4().makeRotationFromEuler(
          new THREE.Euler(
            (rand() - 0.5) * p.noise * 0.07,
            0,
            (rand() - 0.5) * p.noise * 0.07
          )
        )
      );

      if (heightFrac >= bareBaseRatio) {
        const crownProgress =
          (heightFrac - bareBaseRatio) / Math.max(0.05, 1 - bareBaseRatio);
        const envelopeFactor = evaluateCrownEnvelopeRatio(
          p.crownShape || 'conical',
          crownProgress
        );
        const boughLen =
          p.height *
          (p.crownWidthRatio || 0.38) *
          1.12 *
          envelopeFactor *
          (0.86 + rand() * 0.26);
        const boughRad = Math.max(
          0.014,
          Math.min(currRad * 0.42, p.radius * 0.22) * envelopeFactor
        );
        const whorlsInTier = Math.max(
          3,
          Math.round((p.whorlBranches || 5) * (1 - crownProgress * 0.28))
        );
        const tierSpin = t * GOLDEN_ANGLE + (rand() - 0.5) * 0.2;

        for (let w = 0; w < whorlsInTier; w++) {
          if (p.pruneRatio > 0.02 && rand() < p.pruneRatio * 0.5) continue;

          const yaw =
            tierSpin + (w / whorlsInTier) * Math.PI * 2 + (rand() - 0.5) * 0.28;
          const bMat = trunkMat.clone();
          bMat.multiply(new THREE.Matrix4().makeRotationY(yaw));
          // Upper tiers angle slightly more upward than lower tiers
          const tierTilt = branchAngleRad * (1.0 - crownProgress * 0.32);
          bMat.multiply(new THREE.Matrix4().makeRotationZ(tierTilt));

          const bSteps = Math.max(3, branchStepsBase);
          const bStepLen = boughLen / bSteps;
          let bCurrRad = boughRad;

          for (let bs = 0; bs < bSteps; bs++) {
            const bt = bs / bSteps;
            // Taper smoothly to a fine woody twig at the tip (no thick cut stubs!)
            const bNextRad =
              bs === bSteps - 1 ? Math.max(0.006, boughRad * 0.12) : bCurrRad * 0.64;
            const bSeg = createTrunkSegment(
              bCurrRad,
              bNextRad,
              bStepLen * 1.02,
              Math.max(4, Math.floor(radialSegsBase * 0.5)),
              colTrunk,
              0,
              false,
              rand
            );
            bSeg.applyMatrix4(bMat);
            trunkGeos.push(bSeg);

            const shootScale =
              (0.56 + envelopeFactor * 0.62) * (1.0 - bt * 0.22);

            // Generate secondary lateral branchlets & 3D foliage pads spreading LEFT and RIGHT (±Z in branch space)
            for (const side of [-1, 1]) {
              const latFrac = 0.35 + rand() * 0.35;
              const latMat = bMat.clone();
              latMat.multiply(
                new THREE.Matrix4().makeTranslation(0, bStepLen * latFrac, 0)
              );
              // Rotate around branch's local X axis to fan out horizontally LEFT (-Z) and RIGHT (+Z)!
              const sideSpreadAngle = side * (0.68 + (1 - bt) * 0.25 + (rand() - 0.5) * 0.16);
              latMat.multiply(new THREE.Matrix4().makeRotationX(sideSpreadAngle));
              // Slight natural droop or lift on lateral wing
              latMat.multiply(
                new THREE.Matrix4().makeRotationZ(
                  p.gravity * 0.18 + (rand() - 0.5) * 0.18
                )
              );

              const latLen = bStepLen * (1.15 - bt * 0.25) * (0.85 + rand() * 0.25);
              if (bs < bSteps - 1 && bCurrRad > 0.018) {
                const latTwig = createTrunkSegment(
                  bCurrRad * 0.45,
                  Math.max(0.005, bCurrRad * 0.14),
                  latLen,
                  4,
                  colTrunk,
                  0,
                  false,
                  rand
                );
                latTwig.applyMatrix4(latMat);
                trunkGeos.push(latTwig);
              }

              if (!isVolumetricStyle) {
                // Lateral foliage pad extending along the left/right secondary branchlet
                const latShoot = pickCluster(shootScale * (0.76 + rand() * 0.18));
                if (latShoot) {
                  const sm = latMat.clone();
                  sm.multiply(
                    new THREE.Matrix4().makeTranslation(0, latLen * 0.35, 0)
                  );
                  sm.multiply(
                    new THREE.Matrix4().makeRotationY((rand() - 0.5) * 0.8)
                  );
                  latShoot.applyMatrix4(sm);
                  foliageGeos.push(latShoot);
                }
              } else {
                const nodeMat = latMat.clone();
                nodeMat.multiply(
                  new THREE.Matrix4().makeTranslation(0, latLen * 0.65, 0)
                );
                recordCanopyNode(nodeMat, p.leafScale * shootScale * 0.65);
              }
            }

            // Additional radial / dorsal-ventral foliage cushion wrapping around the main bough (for outer 75% of bough)
            if (!isVolumetricStyle && bs >= 1) {
              const wrapShoot = pickCluster(shootScale * 0.72);
              if (wrapShoot) {
                const wm = bMat.clone();
                wm.multiply(
                  new THREE.Matrix4().makeTranslation(0, bStepLen * 0.65, 0)
                );
                // Alternate left-upper, right-upper, and forward-draping around the branch axis
                wm.multiply(
                  new THREE.Matrix4().makeRotationY(
                    (bs + w) * GOLDEN_ANGLE + rand() * 0.6
                  )
                );
                wm.multiply(
                  new THREE.Matrix4().makeRotationX(0.38 + (rand() - 0.5) * 0.35)
                );
                wrapShoot.applyMatrix4(wm);
                foliageGeos.push(wrapShoot);
              }
            }

            bMat.multiply(new THREE.Matrix4().makeTranslation(0, bStepLen, 0));
            // Natural conifer bough curve: dips slightly in mid-section, then turns upward toward the sun at the tip
            const distalUpCurve = bt >= 0.5 ? -0.14 : p.gravity * 0.18;
            bMat.multiply(
              new THREE.Matrix4().makeRotationZ(
                distalUpCurve + (rand() - 0.5) * p.gnarl * 0.12
              )
            );
            bMat.multiply(
              new THREE.Matrix4().makeRotationX((rand() - 0.5) * p.noise * 0.1)
            );
            bCurrRad = bNextRad;
          }

          recordCanopyNode(bMat, p.leafScale * (0.5 + envelopeFactor * 0.55));

          // Dense 3-way terminal fan at the tip of the bough so the wooden end is 100% covered in needles/scales
          if (!isVolumetricStyle) {
            const tipBaseScale = (0.58 + envelopeFactor * 0.62) * 0.84;
            const tipFanAngles = [-0.55, 0, 0.55];
            for (const fanAng of tipFanAngles) {
              const tipShoot = pickCluster(
                tipBaseScale * (fanAng === 0 ? 1.0 : 0.82)
              );
              if (tipShoot) {
                const tm = bMat.clone();
                tm.multiply(new THREE.Matrix4().makeRotationX(fanAng));
                tm.multiply(
                  new THREE.Matrix4().makeRotationZ(-0.18 + (rand() - 0.5) * 0.2)
                );
                tm.multiply(
                  new THREE.Matrix4().makeRotationY((rand() - 0.5) * 0.5)
                );
                tipShoot.applyMatrix4(tm);
                foliageGeos.push(tipShoot);
              }
            }
          }
        }
      }

      currRad = nextRad;
    }

    // Lush Apical Leader Crown at the top of the conifer
    recordCanopyNode(trunkMat, p.leafScale * 0.72);
    if (!isVolumetricStyle) {
      const leaderTuft = pickCluster(0.75);
      if (leaderTuft) {
        leaderTuft.applyMatrix4(trunkMat);
        foliageGeos.push(leaderTuft);
      }
      for (let a = 0; a < 4; a++) {
        const subLeader = pickCluster(0.62);
        if (subLeader) {
          const am = trunkMat.clone();
          am.multiply(
            new THREE.Matrix4().makeTranslation(0, -stepH * 0.25, 0)
          );
          am.multiply(new THREE.Matrix4().makeRotationY((a / 4) * Math.PI * 2));
          am.multiply(new THREE.Matrix4().makeRotationZ(0.52));
          subLeader.applyMatrix4(am);
          foliageGeos.push(subLeader);
        }
      }
    }
  } else {
    const maxLevels = Math.max(2, Math.min(5, p.levels));
    const branchAngleRad = THREE.MathUtils.degToRad(p.angle);
    const stems = p.engine === 'shrub' ? Math.max(3, p.branchCount + 1) : 1;
    const apicalDom = THREE.MathUtils.clamp(p.apicalDominance ?? 0.55, 0.1, 0.95);
    const isConiferFoliage = p.foliageType.startsWith('needles_');

    function growSympodial(
      matrix: THREE.Matrix4,
      level: number,
      length: number,
      radius: number,
      radialSegs: number
    ) {
      const steps = level === 0 ? branchStepsBase + 1 : Math.max(2, branchStepsBase - 1);
      const stepLen = length / steps;
      const currMat = matrix.clone();
      let currRad = radius;

      for (let s = 0; s < steps; s++) {
        const nextRad = currRad * Math.pow(p.taper, 1 / steps);
        const flare = level === 0 && s === 0 && !hasBasalRoots ? p.flare : 0;
        const seg = createTrunkSegment(
          currRad,
          nextRad,
          stepLen * 1.03,
          radialSegs,
          colTrunk,
          flare,
          false,
          rand
        );
        seg.applyMatrix4(currMat);
        trunkGeos.push(seg);

        // For sympodial trees with conifer needles (e.g. Pinus pinea / Stone Pine), clothe sub-terminal branches laterally too
        if (
          !isVolumetricStyle &&
          isConiferFoliage &&
          level >= maxLevels - 2 &&
          s > 0
        ) {
          for (const side of [-1, 1]) {
            const midCluster = pickCluster(0.68 + rand() * 0.25);
            if (midCluster) {
              const mm = currMat.clone();
              mm.multiply(
                new THREE.Matrix4().makeTranslation(0, stepLen * 0.5, 0)
              );
              mm.multiply(
                new THREE.Matrix4().makeRotationX(side * (0.65 + rand() * 0.25))
              );
              mm.multiply(
                new THREE.Matrix4().makeRotationY(rand() * Math.PI * 2)
              );
              midCluster.applyMatrix4(mm);
              foliageGeos.push(midCluster);
            }
          }
        }

        currMat.multiply(new THREE.Matrix4().makeTranslation(0, stepLen, 0));

        const leaderStraightness = level === 0 ? 1.0 - apicalDom * 0.65 : 1.0;
        const curveStrength =
          (level === 0 ? p.gnarl * 0.35 : p.noise * 0.55 + p.gnarl * 0.35) *
          leaderStraightness;
        currMat.multiply(
          new THREE.Matrix4().makeRotationFromEuler(
            new THREE.Euler(
              (rand() - 0.5) * curveStrength,
              (rand() - 0.5) * curveStrength * 0.5,
              (rand() - 0.5) * curveStrength
            )
          )
        );

        if (level > 0) {
          const gravEffect =
            p.engine === 'weeping' ? Math.min(-0.25, p.gravity) : p.gravity;
          currMat.multiply(new THREE.Matrix4().makeRotationX(-gravEffect * 0.22));
        }

        const splitStartStep = Math.floor(
          steps * (p.trunkClearHeight || p.trunkSplitHeight || 0.3)
        );
        if (
          level < maxLevels - 1 &&
          s >= splitStartStep &&
          s < steps - 1 &&
          rand() < 0.68
        ) {
          if (!(p.pruneRatio > 0.02 && rand() < p.pruneRatio * 0.6)) {
            const sideMat = currMat.clone();
            sideMat.multiply(
              new THREE.Matrix4().makeRotationY(s * GOLDEN_ANGLE + rand())
            );
            sideMat.multiply(
              new THREE.Matrix4().makeRotationZ(branchAngleRad * 0.95)
            );

            const posNow = new THREE.Vector3().setFromMatrixPosition(currMat);
            const normCrownH = THREE.MathUtils.clamp(
              (posNow.y - p.height * 0.2) / Math.max(0.5, p.height * 0.8),
              0,
              1
            );
            const envScale =
              0.65 +
              evaluateCrownEnvelopeRatio(
                p.crownShape || 'spherical',
                normCrownH
              ) *
                0.55;

            growSympodial(
              sideMat,
              level + 1,
              length * p.decay * 0.82 * envScale,
              nextRad * 0.72,
              Math.max(3, radialSegs - 2)
            );
          }
        }

        currRad = nextRad;
      }

      const isTip = level >= maxLevels - 1;
      const isSubTip = level === maxLevels - 2 && p.leafDensity >= 3;

      if (isTip || isSubTip) {
        recordCanopyNode(currMat, p.leafScale * (isTip ? 0.92 : 0.72));

        if (!isVolumetricStyle) {
          const clusterCount = isTip
            ? Math.min(5, Math.ceil(p.leafDensity * (isConiferFoliage ? 0.85 : 0.65)))
            : isConiferFoliage
            ? 2
            : 1;
          for (let c = 0; c < clusterCount; c++) {
            const seasonScale = p.season === 'winter' ? 0.55 : 1.0;
            const sc = (0.78 + rand() * 0.38) * seasonScale;
            const leafGeo = pickCluster(sc);
            if (leafGeo) {
              const lm = currMat.clone();
              if (c > 0) {
                // Slide back along the wooden branch segment (0, -y, 0) instead of floating off to the side in mid-air!
                lm.multiply(
                  new THREE.Matrix4().makeTranslation(
                    0,
                    -stepLen * Math.min(0.75, c * 0.22),
                    0
                  )
                );
              }
              if (
                p.engine !== 'weeping' &&
                p.foliageType !== 'weeping_strands'
              ) {
                lm.multiply(
                  new THREE.Matrix4().makeRotationY(rand() * Math.PI * 2)
                );
                lm.multiply(
                  new THREE.Matrix4().makeRotationZ((rand() - 0.5) * 0.55)
                );
                lm.multiply(
                  new THREE.Matrix4().makeRotationX((rand() - 0.5) * 0.55)
                );
              }
              leafGeo.applyMatrix4(lm);
              foliageGeos.push(leafGeo);
            }
          }
        }
      }

      if (isTip) return;

      const children =
        level === 0
          ? Math.max(2, p.branchCount)
          : rand() < 0.65
          ? p.branchCount
          : Math.max(2, p.branchCount - 1);
      const baseSpin = rand() * Math.PI * 2;
      for (let i = 0; i < children; i++) {
        if (i > 0 && p.pruneRatio > 0.02 && rand() < p.pruneRatio) continue;

        const childMat = currMat.clone();
        const isApicalContinuation = i === 0 && apicalDom > 0.55;
        const tiltAngle = isApicalContinuation
          ? branchAngleRad * (1.0 - apicalDom * 0.75)
          : branchAngleRad * (0.85 + rand() * 0.32);

        childMat.multiply(
          new THREE.Matrix4().makeRotationY(
            baseSpin + (i / children) * Math.PI * 2 + (rand() - 0.5) * 0.35
          )
        );
        childMat.multiply(new THREE.Matrix4().makeRotationZ(tiltAngle));

        const lenFactor = isApicalContinuation ? 1.08 : 0.88 + rand() * 0.22;
        growSympodial(
          childMat,
          level + 1,
          length * p.decay * lenFactor,
          currRad * (isApicalContinuation ? 0.88 : 0.78),
          Math.max(3, radialSegs - 2)
        );
      }
    }

    for (let st = 0; st < stems; st++) {
      const stemMat = new THREE.Matrix4().makeTranslation(0, trunkStartY, 0);
      if (stems > 1) {
        const ang = (st / stems) * Math.PI * 2 + rand() * 0.3;
        stemMat.multiply(new THREE.Matrix4().makeRotationY(ang));
        stemMat.multiply(
          new THREE.Matrix4().makeRotationZ(0.22 + rand() * 0.25)
        );
      }
      const effTreeH = Math.max(1.2, p.height - trunkStartY);
      const baseLen = effTreeH * (p.engine === 'shrub' ? 0.36 : 0.42);
      const baseRad = p.radius * (p.engine === 'shrub' ? 0.65 : 1.0);
      growSympodial(stemMat, 0, baseLen, baseRad, radialSegsBase);
    }
  }

  clusterVariants.forEach((v) => v.dispose());

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. VOLUMETRIC / TREE3D-WEB REPRESENTATION MODES (All 7 Styles across all engines)
  // ═══════════════════════════════════════════════════════════════════════════
  if (
    isVolumetricStyle &&
    (canopyNodes.length > 0 ||
      p.representationStyle === 'architectural_envelope' ||
      p.foliageType !== 'none')
  ) {
    const volGeo = generateVolumetricStyleCanopy({
      style: p.representationStyle,
      crownShape: p.crownShape || 'spherical',
      nodes: canopyNodes,
      treeHeight: p.height,
      trunkClearHeight: p.trunkClearHeight || 0.28,
      crownWidthRatio: p.crownWidthRatio || 0.42,
      metaballThreshold: p.metaballThreshold || 0.95,
      metaballResolution: p.metaballResolution || 18,
      clusterNoise: p.clusterNoise ?? 0.25,
      clusterFlatten: p.clusterFlatten ?? 0.25,
      subdivisionDetail: p.subdivisionDetail ?? 1,
      smoothShading: p.smoothShading ?? true,
      colorMain: colLeafMain,
      colorTip: colLeafTip,
      season: p.season,
      lod: q.polygonLod,
      rand,
    });
    if (volGeo) {
      foliageGeos.push(volGeo);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. ASSEMBLE COMPOSITE THREE.GROUP & COMPUTE METRICS + DIMENSIONS
  // ═══════════════════════════════════════════════════════════════════════════
  const group = new THREE.Group();
  group.name = `Arborea_${p.presetId}_${p.seed}`;

  const { barkMaterial, foliageMaterial } = buildBotanicalMaterials(p, q, windUniform, maxAnisotropy);

  const mergedTrunk = mergeSafe(trunkGeos);
  const mergedFoliage = mergeSafe(foliageGeos);

  let trunkTris = 0;
  let foliageTris = 0;
  let totalVerts = 0;
  let drawCalls = 0;

  if (mergedTrunk) {
    const trunkMesh = new THREE.Mesh(mergedTrunk, barkMaterial);
    trunkMesh.name = 'Trunk_And_Branches';
    trunkMesh.castShadow = q.shaderQuality !== 'unlit';
    trunkMesh.receiveShadow = q.shaderQuality !== 'unlit';
    group.add(trunkMesh);
    trunkTris = Math.round(mergedTrunk.attributes.position.count / 3);
    totalVerts += mergedTrunk.attributes.position.count;
    drawCalls++;
  }

  if (mergedFoliage) {
    const foliageMesh = new THREE.Mesh(mergedFoliage, foliageMaterial);
    foliageMesh.name = 'Foliage_And_Canopy';
    foliageMesh.castShadow = q.shaderQuality !== 'unlit';
    foliageMesh.receiveShadow = q.shaderQuality !== 'unlit';
    foliageMesh.renderOrder = p.canopyOpacity < 0.98 ? 2 : 0;
    group.add(foliageMesh);
    foliageTris = Math.round(mergedFoliage.attributes.position.count / 3);
    totalVerts += mergedFoliage.attributes.position.count;
    drawCalls++;
  }

  const bbox = new THREE.Box3().setFromObject(group);
  const treeHeightM = bbox.isEmpty()
    ? p.height
    : Math.round((bbox.max.y - Math.min(0, bbox.min.y)) * 10) / 10;
  const crownDiameterM = bbox.isEmpty()
    ? p.height * 0.7
    : Math.round(Math.max(bbox.max.x - bbox.min.x, bbox.max.z - bbox.min.z) * 10) / 10;

  const generationTimeMs = Math.round((performance.now() - t0) * 10) / 10;

  return {
    group,
    stats: {
      triangles: trunkTris + foliageTris,
      vertices: totalVerts,
      trunkTriangles: trunkTris,
      foliageTriangles: foliageTris,
      crownDiameterM,
      treeHeightM,
      drawCalls,
      generationTimeMs,
    },
  };
}
