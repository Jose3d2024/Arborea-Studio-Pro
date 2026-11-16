import * as THREE from 'three';
import { EcosystemBaseType, QualitySettings, TreeParams } from '../types/botany';
import { ensureStandardAttributes, colorizeGeometryGradient } from './foliageGenerator';
import { mergeSafe } from './cactusGenerator';

export type ResolvedEcosystemBase = Exclude<EcosystemBaseType, 'auto'>;

function createPRNG(seed: number): () => number {
  let s = Math.abs(Math.floor(seed)) % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function hash2D(x: number, z: number, seed: number): number {
  return (
    Math.sin(x * 1.7 + z * 2.3 + seed * 0.37) * 0.5 +
    Math.cos(x * 3.1 - z * 1.9 + seed * 0.71) * 0.3 +
    Math.sin(x * 5.3 + z * 4.7 - seed * 0.19) * 0.2
  );
}

/**
 * Automatically selects the most cohesive biome terrain base for any species engine or preset.
 */
export function resolveEcosystemBase(
  selected: EcosystemBaseType,
  params: TreeParams
): ResolvedEcosystemBase {
  if (selected && selected !== 'auto') return selected;

  if (params.engine === 'aquatic_coral_algae') return 'aquatic_reef_seabed';
  if (params.engine === 'moss_fungi_rock') return 'mossy_forest_floor';
  if (params.engine === 'alien_xenobotany') return 'exoplanetary_crater';
  if (params.engine === 'cactus' || params.engine === 'rosette') return 'desert_dunes';
  if (params.engine === 'monopodial') return 'alpine_granite';
  return 'temperate_forest';
}

interface BiomePalette {
  centerSoil: string;
  midSurface: string;
  outerRim: string;
  rockBot: string;
  rockTop: string;
  skirtBot: string;
  roughness: number;
  reliefAmp: number;
  duneFreq: number;
  stepped: boolean;
}

function getBiomePalette(
  biome: Exclude<ResolvedEcosystemBase, 'clean_pedestal'>,
  params: TreeParams
): BiomePalette {
  switch (biome) {
    case 'mossy_forest_floor':
      return {
        centerSoil: '#2c2218',
        midSurface: '#2d5a27',
        outerRim: '#1e3a1e',
        rockBot: '#334155',
        rockTop: '#64748b',
        skirtBot: '#1c1917',
        roughness: 0.9,
        reliefAmp: 0.14,
        duneFreq: 0,
        stepped: false,
      };
    case 'aquatic_reef_seabed':
      return {
        centerSoil: '#c7b899',
        midSurface: '#5ea8ad',
        outerRim: '#164e63',
        rockBot: '#334155',
        rockTop: '#94a3b8',
        skirtBot: '#082f49',
        roughness: 0.78,
        reliefAmp: 0.13,
        duneFreq: 2.6,
        stepped: true,
      };
    case 'alpine_granite':
      return {
        centerSoil: '#4a3d31',
        midSurface: '#5c6670',
        outerRim: '#475569',
        rockBot: '#334155',
        rockTop: '#94a3b8',
        skirtBot: '#1e293b',
        roughness: 0.92,
        reliefAmp: 0.18,
        duneFreq: 0,
        stepped: true,
      };
    case 'desert_dunes':
      return {
        centerSoil: '#d99b52',
        midSurface: '#c97a38',
        outerRim: '#9a441a',
        rockBot: '#7c2d12',
        rockTop: '#ea580c',
        skirtBot: '#451a03',
        roughness: 0.94,
        reliefAmp: 0.16,
        duneFreq: 2.2,
        stepped: false,
      };
    case 'exoplanetary_crater':
      return {
        centerSoil: '#151226',
        midSurface: '#251d3d',
        outerRim: '#111827',
        rockBot: '#0f172a',
        rockTop: params.colorAccent || '#8b5cf6',
        skirtBot: '#050811',
        roughness: 0.65,
        reliefAmp: 0.21,
        duneFreq: 0,
        stepped: true,
      };
    case 'temperate_forest':
    default:
      return {
        centerSoil: '#3d2c1e',
        midSurface: '#3f6212',
        outerRim: '#2e4718',
        rockBot: '#44403c',
        rockTop: '#78716c',
        skirtBot: '#241b13',
        roughness: 0.92,
        reliefAmp: 0.14,
        duneFreq: 0,
        stepped: false,
      };
  }
}

/**
 * Evaluates terrain elevation at (x, z) relative to baseRadius so every boulder, grass tuft,
 * and pebble sits flush on/embedded in the ground without floating.
 */
function evaluateSurfaceY(
  x: number,
  z: number,
  baseRadius: number,
  pal: BiomePalette,
  biome: Exclude<ResolvedEcosystemBase, 'clean_pedestal'>,
  seed: number
): number {
  const r = Math.hypot(x, z);
  const rNorm = Math.min(1.0, r / Math.max(0.01, baseRadius));
  const ang = Math.atan2(z, x);

  // Smooth central anchor dish near y = 0 so roots/boulders plant seamlessly into terrain
  const mask = THREE.MathUtils.smoothstep(rNorm, 0.14, 0.62);
  const rimFalloff = 1.0 - THREE.MathUtils.smoothstep(rNorm, 0.84, 1.0);

  const n = hash2D((x / baseRadius) * 2.4, (z / baseRadius) * 2.4, seed);
  let h = n * pal.reliefAmp * mask;

  if (pal.duneFreq > 0) {
    // Wind/current sand ripples
    const ripple =
      Math.sin((x / baseRadius) * Math.PI * pal.duneFreq + (z / baseRadius) * 1.4) *
      0.065 *
      THREE.MathUtils.smoothstep(rNorm, 0.18, 0.82);
    h += ripple;
  }

  if (biome === 'exoplanetary_crater') {
    // Raised volcanic crater rim around 0.65..0.85 radius + radial fissures
    const rimBump = Math.exp(-Math.pow((rNorm - 0.72) / 0.16, 2)) * 0.22;
    const rays = Math.abs(Math.cos(ang * 7 + n * 1.4)) * 0.06 * mask;
    h += rimBump - rays;
  } else if (biome === 'alpine_granite') {
    // Terraced stone shelves around outer margin
    const terrace = Math.floor((n + 1.0) * 2.4) * 0.045 * mask;
    h += terrace;
  }

  // Slight depression at extreme outer edge for beveled diorama island contour
  const edgeSlope = -THREE.MathUtils.smoothstep(rNorm, 0.88, 1.0) * 0.09;
  return h * rimFalloff + edgeSlope;
}

/**
 * Builds an organic radial island disc with sculpted cliff underside skirt.
 */
function buildTerrainIslandMesh(
  baseRadius: number,
  radialSegs: number,
  ringSegs: number,
  pal: BiomePalette,
  biome: Exclude<ResolvedEcosystemBase, 'clean_pedestal'>,
  seed: number,
  rand: () => number
): THREE.BufferGeometry {
  // Polar disc from center (ring 0) to rim (ringSegs), then bevelled cliff drop + bottom cap
  const totalRings = ringSegs + 3; // +1 bevel lip, +1 cliff bottom, +1 center bottom close
  const stride = radialSegs + 1;
  const vertCount = (totalRings + 1) * stride;

  const positions = new Float32Array(vertCount * 3);
  const colors = new Float32Array(vertCount * 3);
  const uvs = new Float32Array(vertCount * 2);
  const indices: number[] = [];

  const cSoil = new THREE.Color(pal.centerSoil);
  const cMid = new THREE.Color(pal.midSurface);
  const cOuter = new THREE.Color(pal.outerRim);
  const cSkirt = new THREE.Color(pal.skirtBot);
  const tmpCol = new THREE.Color();

  const islandDepth = Math.max(0.38, baseRadius * 0.085);

  for (let ri = 0; ri <= totalRings; ri++) {
    for (let ai = 0; ai <= radialSegs; ai++) {
      const u = ai / radialSegs;
      const theta = u * Math.PI * 2;
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);

      // Natural organic shoreline silhouette variation (no sterile circle!)
      const edgeNoise =
        1.0 +
        0.07 * Math.sin(theta * 3 + seed * 0.1) +
        0.045 * Math.cos(theta * 5 - seed * 0.3) +
        0.025 * Math.sin(theta * 9 + 1.2);

      let rad = 0;
      let y = 0;

      if (ri <= ringSegs) {
        const rFrac = ri / ringSegs;
        rad = baseRadius * rFrac * (rFrac < 0.25 ? 1.0 : THREE.MathUtils.lerp(1.0, edgeNoise, rFrac));
        const px = cosT * rad;
        const pz = sinT * rad;
        y = evaluateSurfaceY(px, pz, baseRadius, pal, biome, seed);

        // Vertex color blend from root soil -> biome surface -> perimeter tone
        const noiseTint = (hash2D(px * 0.9, pz * 0.9, seed + 17) + 1) * 0.5;
        if (rFrac < 0.36) {
          tmpCol.copy(cSoil).lerp(cMid, THREE.MathUtils.smoothstep(rFrac, 0.14, 0.36));
        } else {
          tmpCol.copy(cMid).lerp(cOuter, THREE.MathUtils.smoothstep(rFrac, 0.45, 0.95));
        }
        tmpCol.offsetHSL(0, 0, (noiseTint - 0.5) * 0.06);
      } else if (ri === ringSegs + 1) {
        // Organic rocky rim lip
        rad = baseRadius * edgeNoise * 1.01;
        y = -islandDepth * 0.24 + Math.sin(theta * 7) * 0.02;
        tmpCol.copy(cOuter).lerp(cSkirt, 0.45);
      } else if (ri === ringSegs + 2) {
        // Tapered rocky cliff underside
        rad = baseRadius * edgeNoise * 0.84;
        y = -islandDepth;
        tmpCol.copy(cSkirt);
      } else {
        // Closed underside base at center
        rad = 0;
        y = -islandDepth;
        tmpCol.copy(cSkirt);
      }

      const idx = ri * stride + ai;
      positions[idx * 3] = cosT * rad;
      positions[idx * 3 + 1] = y;
      positions[idx * 3 + 2] = sinT * rad;

      colors[idx * 3] = THREE.MathUtils.clamp(tmpCol.r + (rand() - 0.5) * 0.015, 0, 1);
      colors[idx * 3 + 1] = THREE.MathUtils.clamp(tmpCol.g + (rand() - 0.5) * 0.015, 0, 1);
      colors[idx * 3 + 2] = THREE.MathUtils.clamp(tmpCol.b + (rand() - 0.5) * 0.015, 0, 1);

      uvs[idx * 2] = 0.5 + (cosT * rad) / (baseRadius * 2);
      uvs[idx * 2 + 1] = 0.5 + (sinT * rad) / (baseRadius * 2);
    }
  }

  // Upward-facing counter-clockwise winding as seen from +Y
  for (let ri = 0; ri < totalRings; ri++) {
    for (let ai = 0; ai < radialSegs; ai++) {
      const a = ri * stride + ai;
      const b = (ri + 1) * stride + ai;
      const c = (ri + 1) * stride + (ai + 1);
      const d = ri * stride + (ai + 1);
      indices.push(a, d, b, b, d, c);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return ensureStandardAttributes(geo);
}

/**
 * Generates an organic weathered stone/boulder or sandstone slab sunk into the ecosystem floor.
 */
function buildBiomeStone(
  rx: number,
  ry: number,
  rz: number,
  angular: boolean,
  colBot: string,
  colTop: string,
  seedOff: number,
  rand: () => number
): THREE.BufferGeometry {
  const geo = new THREE.IcosahedronGeometry(1.0, angular ? 1 : 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const n = hash2D(x * 2.1 + y, z * 2.1 - y, seedOff);
    const disp = angular ? 1.0 + n * 0.28 : 1.0 + n * 0.18;
    const py = y < 0 ? y * ry * 0.45 : y * ry * disp;
    pos.setXYZ(i, x * rx * disp, py, z * rz * disp);
  }
  geo.computeVertexNormals();
  const std = ensureStandardAttributes(geo);
  colorizeGeometryGradient(std, colBot, colTop, rand, 0.05);
  return std;
}

/**
 * Generates a cluster of curved 3D grass / reed / fern blades anchored directly into the soil.
 */
function buildGrassTuft(
  bladeCount: number,
  height: number,
  spread: number,
  colBot: string,
  colTip: string,
  rand: () => number
): THREE.BufferGeometry[] {
  const blades: THREE.BufferGeometry[] = [];
  for (let i = 0; i < bladeCount; i++) {
    const ang = (i / bladeCount) * Math.PI * 2 + rand() * 0.6;
    const bH = height * (0.65 + rand() * 0.55);
    const bW = Math.max(0.015, bH * 0.14);
    const lean = spread * (0.4 + rand() * 0.65);

    const g = new THREE.PlaneGeometry(bW, bH, 1, 3);
    const pos = g.attributes.position;
    for (let k = 0; k < pos.count; k++) {
      const yLocal = pos.getY(k) + bH * 0.5; // 0..bH
      const t = THREE.MathUtils.clamp(yLocal / bH, 0, 1);
      const xW = pos.getX(k) * (1.0 - t * 0.92);
      const zArch = Math.pow(t, 1.7) * lean;
      pos.setXYZ(k, xW, yLocal - 0.03, zArch);
    }
    g.computeVertexNormals();
    const std = ensureStandardAttributes(g);
    std.rotateY(ang);
    colorizeGeometryGradient(std, colBot, colTip, rand, 0.04);
    blades.push(std);
  }
  return blades;
}

/**
 * Generates a faceted alien mineral crystal prism cluster for the exoplanetary crater base.
 */
function buildMineralCrystal(
  rad: number,
  height: number,
  colBot: string,
  colTip: string,
  rand: () => number
): THREE.BufferGeometry {
  const crystal = new THREE.CylinderGeometry(rad * 0.12, rad, height, 6, 2);
  crystal.translate(0, height * 0.42, 0);
  const std = ensureStandardAttributes(crystal);
  colorizeGeometryGradient(std, colBot, colTip, rand, 0.05);
  return std;
}

/**
 * Builds the complete integrated 3D Ecosystem Base Group scaled proportionally
 * to the specimen height and footprint.
 */
export function generateEcosystemBaseGroup(
  selectedBase: EcosystemBaseType,
  params: TreeParams,
  quality: QualitySettings,
  modelHeight: number,
  modelRadius: number
): THREE.Group {
  const resolved = resolveEcosystemBase(selectedBase, params);
  const group = new THREE.Group();
  group.name = `EcosystemBase_${resolved}`;

  const scaleMult = quality.ecosystemBaseScale ?? 1.0;
  const rawBaseR = Math.max(modelRadius * 1.45, modelHeight * 0.58, 2.3);
  const baseRadius = THREE.MathUtils.clamp(rawBaseR, 2.4, 9.6) * scaleMult;

  const isClean = resolved === 'clean_pedestal' || quality.viewportMode === 'clay';

  if (resolved === 'clean_pedestal') {
    const pedGeo = new THREE.CylinderGeometry(baseRadius, baseRadius * 0.96, 0.34, 48);
    const pedMat = new THREE.MeshStandardMaterial({
      color: quality.groundColor || '#101824',
      roughness: 0.92,
      metalness: 0.04,
      wireframe: quality.viewportMode === 'wireframe',
    });
    const mesh = new THREE.Mesh(pedGeo, pedMat);
    mesh.position.y = -0.17;
    mesh.receiveShadow = true;
    group.add(mesh);
    return group;
  }

  const rand = createPRNG(params.seed + 713);
  const pal = getBiomePalette(resolved, params);
  const density = THREE.MathUtils.clamp(quality.meshDensity ?? 1.0, 0.25, 1.8);
  const radialSegs = Math.max(20, Math.round(44 * Math.min(1.4, density)));
  const ringSegs = Math.max(8, Math.round(14 * Math.min(1.4, density)));

  const terrainGeos: THREE.BufferGeometry[] = [];
  const accentGeos: THREE.BufferGeometry[] = [];

  // 1. Main Organic Sculpted Terrain Island
  const islandGeo = buildTerrainIslandMesh(
    baseRadius,
    radialSegs,
    ringSegs,
    pal,
    resolved,
    params.seed,
    rand
  );
  terrainGeos.push(islandGeo);

  // 2. Ecosystem-Specific Integrated Props (Stones, Pebbles, Moss Cushions, Grass, Reef Shelves, Crystals)
  const propCount = Math.max(6, Math.round(14 * Math.min(1.3, density)));
  const minRing = resolved === 'mossy_forest_floor' || resolved === 'aquatic_reef_seabed' ? 0.42 : 0.32;
  const maxRing = 0.84;

  for (let i = 0; i < propCount; i++) {
    const ang = i * 2.39996 + rand() * 0.55;
    const dist = baseRadius * (minRing + Math.sqrt((i + 0.5) / propCount) * (maxRing - minRing));
    const px = Math.cos(ang) * dist;
    const pz = Math.sin(ang) * dist;
    const surfY = evaluateSurfaceY(px, pz, baseRadius, pal, resolved, params.seed);

    if (resolved === 'exoplanetary_crater') {
      // Basalt boulders + angled alien mineral crystals around the crater rim
      if (i % 2 === 0) {
        const sc = baseRadius * (0.045 + rand() * 0.045);
        const stone = buildBiomeStone(sc * 1.4, sc * 0.75, sc * 1.1, true, pal.rockBot, '#334155', i, rand);
        stone.rotateY(rand() * Math.PI * 2);
        stone.translate(px, surfY - sc * 0.15, pz);
        terrainGeos.push(stone);
      } else {
        const cryH = baseRadius * (0.065 + rand() * 0.07);
        const cryR = cryH * (0.22 + rand() * 0.12);
        const crystal = buildMineralCrystal(
          cryR,
          cryH,
          '#1e1b4b',
          params.colorAccent || params.colorFlower || '#a855f7',
          rand
        );
        crystal.rotateX((rand() - 0.5) * 0.65);
        crystal.rotateZ((rand() - 0.5) * 0.65);
        crystal.rotateY(rand() * Math.PI * 2);
        crystal.translate(px, surfY - 0.03, pz);
        accentGeos.push(crystal);
      }
    } else if (resolved === 'aquatic_reef_seabed') {
      // Stratified limestone reef shelves + smooth marine pebbles + small coral rubble
      const sc = baseRadius * (0.045 + rand() * 0.055);
      const isShelf = i % 3 === 0;
      const rock = buildBiomeStone(
        isShelf ? sc * 2.1 : sc * 1.1,
        isShelf ? sc * 0.45 : sc * 0.65,
        isShelf ? sc * 1.5 : sc * 0.95,
        isShelf,
        '#334155',
        isShelf ? '#94a3b8' : '#cbd5e1',
        i * 3,
        rand
      );
      rock.rotateY(rand() * Math.PI * 2);
      rock.translate(px, surfY - sc * 0.12, pz);
      terrainGeos.push(rock);
    } else if (resolved === 'desert_dunes') {
      // Stratified flat sandstone boulders & desert gravel
      if (i % 3 !== 2) {
        const sc = baseRadius * (0.04 + rand() * 0.055);
        const rock = buildBiomeStone(
          sc * 1.7,
          sc * 0.52,
          sc * 1.3,
          true,
          pal.rockBot,
          pal.rockTop,
          i * 5,
          rand
        );
        rock.rotateY(rand() * Math.PI * 2);
        rock.translate(px, surfY - sc * 0.1, pz);
        terrainGeos.push(rock);
      }
    } else if (resolved === 'alpine_granite') {
      // Angular granite blocks + lichen-dusted scree stones
      const sc = baseRadius * (0.045 + rand() * 0.065);
      const rock = buildBiomeStone(
        sc * 1.3,
        sc * 0.85,
        sc * 1.1,
        true,
        pal.rockBot,
        i % 3 === 0 ? '#84a98c' : pal.rockTop,
        i * 7,
        rand
      );
      rock.rotateY(rand() * Math.PI * 2);
      rock.translate(px, surfY - sc * 0.18, pz);
      terrainGeos.push(rock);
    } else if (resolved === 'mossy_forest_floor') {
      // Soft pillowy moss hummocks + wet forest slate stones
      if (i % 2 === 0) {
        const sc = baseRadius * (0.05 + rand() * 0.055);
        const cushion = buildBiomeStone(
          sc * 1.6,
          sc * 0.55,
          sc * 1.4,
          false,
          '#14532d',
          '#65a30d',
          i * 11,
          rand
        );
        cushion.translate(px, surfY - sc * 0.12, pz);
        accentGeos.push(cushion);
      } else {
        const sc = baseRadius * (0.04 + rand() * 0.045);
        const slate = buildBiomeStone(sc * 1.5, sc * 0.42, sc * 1.2, true, '#1e293b', '#64748b', i, rand);
        slate.rotateY(rand() * Math.PI * 2);
        slate.translate(px, surfY - sc * 0.08, pz);
        terrainGeos.push(slate);
      }
    } else {
      // Temperate forest: mossy river boulders + lush curved 3D grass tufts
      if (i % 3 === 0) {
        const sc = baseRadius * (0.04 + rand() * 0.045);
        const stone = buildBiomeStone(sc * 1.35, sc * 0.65, sc * 1.1, false, pal.rockBot, pal.rockTop, i, rand);
        stone.rotateY(rand() * Math.PI * 2);
        stone.translate(px, surfY - sc * 0.12, pz);
        terrainGeos.push(stone);
      } else {
        const tuftH = Math.min(0.45, baseRadius * (0.055 + rand() * 0.045));
        const blades = buildGrassTuft(
          5,
          tuftH,
          tuftH * 0.45,
          '#365314',
          '#84cc16',
          rand
        );
        blades.forEach((b) => {
          b.translate(px, surfY, pz);
          accentGeos.push(b);
        });
      }
    }
  }

  const wireframe = quality.viewportMode === 'wireframe';
  const flatShade = !params.smoothShading || density < 0.35;

  const terrainMerged = mergeSafe(terrainGeos);
  if (terrainMerged) {
    const terrainMat = isClean
      ? new THREE.MeshStandardMaterial({
          color: '#64748b',
          roughness: 0.85,
          metalness: 0.05,
          wireframe,
        })
      : new THREE.MeshStandardMaterial({
          vertexColors: true,
          roughness: pal.roughness,
          metalness: resolved === 'exoplanetary_crater' ? 0.18 : 0.04,
          flatShading: flatShade,
          wireframe,
        });
    const terrainMesh = new THREE.Mesh(terrainMerged, terrainMat);
    terrainMesh.name = 'EcosystemTerrainIsland';
    terrainMesh.receiveShadow = true;
    terrainMesh.castShadow = true;
    group.add(terrainMesh);
  }

  const accentMerged = mergeSafe(accentGeos);
  if (accentMerged) {
    const isCrystal = resolved === 'exoplanetary_crater';
    const accentMat = isCrystal
      ? new THREE.MeshPhysicalMaterial({
          vertexColors: true,
          roughness: 0.18,
          metalness: 0.15,
          clearcoat: 0.85,
          emissive: new THREE.Color(params.colorAccent || params.colorFlower || '#a855f7'),
          emissiveIntensity: Math.max(0.2, (params.emissiveIntensity ?? 0.35) * 0.6),
          wireframe,
        })
      : new THREE.MeshStandardMaterial({
          vertexColors: true,
          roughness: 0.68,
          metalness: 0.02,
          side: THREE.DoubleSide,
          wireframe,
        });
    const accentMesh = new THREE.Mesh(accentMerged, accentMat);
    accentMesh.name = 'EcosystemBiomeDetails';
    accentMesh.receiveShadow = true;
    accentMesh.castShadow = true;
    group.add(accentMesh);
  }

  return group;
}
