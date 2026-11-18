import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { FoliageType, SeasonMode, PolygonLOD, CustomBotanicalElement } from '../types/botany';
import { buildCustomElementFoliageCluster, DEFAULT_CUSTOM_ELEMENT } from './composedElementGenerator';

export interface FoliageGenOptions {
  foliageType: FoliageType;
  customElement?: CustomBotanicalElement;
  scale: number;
  density: number;
  widthRatio: number;
  bend: number;
  petalOpenness?: number;
  colorMain: string;
  colorTip: string;
  colorFlower: string;
  season: SeasonMode;
  lod: PolygonLOD;
  needleLength: number;
  needleDensity: number;
  fascicleCount: number;
  needleSpreadAngle: number;
  pineConeDensity: number;
  rand: () => number;
}

export function safeToNonIndexed(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  if (geo.index) {
    geo.computeVertexNormals();
    const nonIdx = geo.toNonIndexed();
    geo.dispose();
    return nonIdx;
  }
  return geo;
}

export function ensureStandardAttributes(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const nonIdx = safeToNonIndexed(geo);
  const count = nonIdx.attributes.position.count;

  if (!nonIdx.attributes.normal) {
    nonIdx.computeVertexNormals();
  }
  if (!nonIdx.attributes.uv) {
    const uvs = new Float32Array(count * 2);
    const pos = nonIdx.attributes.position;
    for (let i = 0; i < count; i++) {
      uvs[i * 2] = pos.getX(i) + 0.5;
      uvs[i * 2 + 1] = Math.max(0, Math.min(1, pos.getY(i)));
    }
    nonIdx.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  }
  if (!nonIdx.attributes.color) {
    const cols = new Float32Array(count * 3).fill(1);
    nonIdx.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  }
  // Remove any extraneous attributes so mergeGeometries never fails
  Object.keys(nonIdx.attributes).forEach((attr) => {
    if (!['position', 'normal', 'uv', 'color'].includes(attr)) {
      nonIdx.deleteAttribute(attr);
    }
  });
  return nonIdx;
}

export function colorizeGeometryGradient(
  geo: THREE.BufferGeometry,
  colorBottomHex: string | THREE.Color,
  colorTopHex: string | THREE.Color,
  rand: () => number,
  jitter = 0.06
): void {
  const pos = geo.attributes.position;
  geo.computeBoundingBox();
  const minY = geo.boundingBox ? geo.boundingBox.min.y : 0;
  const maxY = geo.boundingBox ? geo.boundingBox.max.y : 1;
  const rangeY = Math.max(0.001, maxY - minY);

  const cBot = new THREE.Color(colorBottomHex);
  const cTop = new THREE.Color(colorTopHex);
  const tmp = new THREE.Color();
  const colors = new Float32Array(pos.count * 3);
  const patchShift = (rand() - 0.5) * jitter;

  for (let i = 0; i < pos.count; i++) {
    const t = THREE.MathUtils.clamp((pos.getY(i) - minY) / rangeY, 0, 1);
    tmp.copy(cBot).lerp(cTop, t);
    tmp.offsetHSL(patchShift * 0.3, 0, patchShift + (rand() - 0.5) * jitter * 0.5);
    colors[i * 3] = THREE.MathUtils.clamp(tmp.r, 0, 1);
    colors[i * 3 + 1] = THREE.MathUtils.clamp(tmp.g, 0, 1);
    colors[i * 3 + 2] = THREE.MathUtils.clamp(tmp.b, 0, 1);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

function resolveSeasonalColors(
  colorMain: string,
  colorTip: string,
  season: SeasonMode,
  isConifer: boolean,
  rand: () => number
): { c1: THREE.Color; c2: THREE.Color } {
  const c1 = new THREE.Color(colorMain);
  const c2 = new THREE.Color(colorTip);

  if (season === 'spring') {
    c1.offsetHSL(0.02, 0.08, 0.04);
    c2.offsetHSL(0.03, 0.12, 0.08);
  } else if (season === 'autumn') {
    if (isConifer) {
      c1.offsetHSL(-0.02, -0.08, -0.03);
      c2.offsetHSL(-0.03, -0.05, -0.02);
    } else {
      c1.set('#9a3412').lerp(new THREE.Color('#b91c1c'), rand() * 0.5);
      c2.set('#f59e0b').lerp(new THREE.Color('#fde047'), rand() * 0.7);
    }
  } else if (season === 'winter') {
    if (isConifer) {
      c2.lerp(new THREE.Color('#e2e8f0'), 0.65);
    } else {
      c1.set('#cbd5e1');
      c2.set('#f8fafc');
    }
  }
  return { c1, c2 };
}

/**
 * Creates a contoured 3D leaf blade with V-midrib fold, natural longitudinal arch,
 * and species-specific silhouette profile (lobed oak, palmate maple, ginkgo fan, cordate, ovate, lanceolate).
 */
function createContouredLeafBlade(
  shapeType: 'lobed' | 'palmate' | 'ovate' | 'lanceolate' | 'ginkgo' | 'heart',
  length: number,
  widthRatio: number,
  bend: number
): THREE.BufferGeometry {
  const width = length * widthRatio;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  if (shapeType === 'palmate') {
    // 5-pointed palmate Maple leaf star blade
    const lobeAngles = [-1.15, -0.58, 0, 0.58, 1.15];
    const lobeLengths = [0.55, 0.85, 1.0, 0.85, 0.55];
    // Center base hub (idx 0)
    positions.push(0, 0, 0);
    uvs.push(0.5, 0);

    for (let i = 0; i < lobeAngles.length; i++) {
      const ang = lobeAngles[i];
      const l = length * lobeLengths[i];
      const tipX = Math.sin(ang) * l;
      const tipY = Math.cos(ang) * l * 0.85 + length * 0.15;
      const tipZ = -bend * l * 0.35;

      const sinLX = Math.sin(ang - 0.24) * l * 0.48;
      const sinLY = Math.cos(ang - 0.24) * l * 0.42 + length * 0.12;
      const sinRX = Math.sin(ang + 0.24) * l * 0.48;
      const sinRY = Math.cos(ang + 0.24) * l * 0.42 + length * 0.12;

      const baseIdx = positions.length / 3;
      positions.push(
        sinLX, sinLY, Math.abs(sinLX) * 0.12,
        tipX, tipY, tipZ,
        sinRX, sinRY, Math.abs(sinRX) * 0.12
      );
      uvs.push(0.25, 0.5, 0.5, 1.0, 0.75, 0.5);
      indices.push(0, baseIdx, baseIdx + 1, 0, baseIdx + 1, baseIdx + 2);
    }
  } else if (shapeType === 'ginkgo') {
    // Fan-shaped bilobed Ginkgo leaf with central notch
    const fanSegs = 8;
    positions.push(0, 0, 0); // petiole base
    uvs.push(0.5, 0);
    for (let i = 0; i <= fanSegs; i++) {
      const t = i / fanSegs;
      const ang = (t - 0.5) * 1.65;
      const notch = 1.0 - Math.exp(-Math.pow((t - 0.5) * 8, 2)) * 0.28;
      const r = length * notch;
      const x = Math.sin(ang) * r * widthRatio * 1.25;
      const y = Math.cos(ang) * r;
      const z = Math.abs(t - 0.5) * width * 0.18 - bend * r * 0.25;
      positions.push(x, y, z);
      uvs.push(t, notch);
      if (i > 0) {
        indices.push(0, i, i + 1);
      }
    }
  } else {
    // Segmented midrib blade with species outline (lobed, ovate, lanceolate, heart)
    const rows = 5;
    for (let r = 0; r <= rows; r++) {
      const v = r / rows;
      let halfW = 0;
      if (shapeType === 'lobed') {
        // Wavy Oak lobes
        const env = Math.sin(v * Math.PI);
        const wave = 0.72 + 0.28 * Math.sin(v * Math.PI * 5);
        halfW = (width * 0.5) * env * wave;
      } else if (shapeType === 'lanceolate') {
        halfW = (width * 0.38) * Math.sin(Math.pow(v, 0.75) * Math.PI);
      } else if (shapeType === 'heart') {
        halfW = (width * 0.58) * Math.sin(Math.pow(v, 0.55) * Math.PI);
      } else {
        // ovate
        halfW = (width * 0.5) * Math.sin(Math.pow(v, 0.8) * Math.PI);
      }

      const y = v * length;
      const archZ = -Math.pow(v, 1.7) * length * bend * 0.45;
      const foldZ = halfW * 0.22;

      // Left edge, Center midrib, Right edge
      positions.push(
        -halfW, y, archZ + foldZ,
        0, y, archZ,
        halfW, y, archZ + foldZ
      );
      uvs.push(0, v, 0.5, v, 1, v);

      if (r < rows) {
        const rowStart = r * 3;
        const nextRow = (r + 1) * 3;
        // Left half
        indices.push(rowStart, rowStart + 1, nextRow + 1);
        indices.push(rowStart, nextRow + 1, nextRow);
        // Right half
        indices.push(rowStart + 1, rowStart + 2, nextRow + 2);
        indices.push(rowStart + 1, nextRow + 2, nextRow + 1);
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return ensureStandardAttributes(geo);
}

/**
 * Generates a 3D Pine Cone (Estróbilo) with layered woody scales
 */
function createPineConeMesh(scale: number, colorCone: string, rand: () => number): THREE.BufferGeometry {
  const coneH = scale * 0.28;
  const coneR = scale * 0.095;
  const geo = new THREE.ConeGeometry(coneR, coneH, 6, 3);
  geo.rotateX(Math.PI); // hang downward
  geo.translate(0, -coneH * 0.45, 0);
  const nonIdx = ensureStandardAttributes(geo);
  const cDark = new THREE.Color(colorCone || '#5c3418').multiplyScalar(0.65);
  const cLight = new THREE.Color(colorCone || '#854d0e');
  colorizeGeometryGradient(nonIdx, cDark, cLight, rand, 0.06);
  return nonIdx;
}

/**
 * Creates a botanical 3D Volumetric Conifer Bough Spray with authentic needle arrangement:
 * - needles_fascicle: Pine needle bundles (2-5 long needles per sheath) radiating 360° + apical candle tufts
 * - needles_pectinate: Wide feather-fronds with double comb rows + upper V-ranks (Silver Fir / Abeto)
 * - needles_radial: 360-degree bottlebrush spirals on main shoot + pendulous side branchlets (Spruce / Picea)
 * - needles_scale: Lush 3D billowing cushions of overlapping scale foliage (Giant Sequoia / Cypress)
 * - needles_rosette: Whorled star-rosettes on horizontal spur-shoot pads (Cedar / Larch)
 */
function createConiferShootCluster(opts: FoliageGenOptions): THREE.BufferGeometry {
  const {
    foliageType,
    scale,
    needleLength,
    needleDensity,
    fascicleCount,
    needleSpreadAngle,
    pineConeDensity,
    colorMain,
    colorTip,
    colorFlower,
    season,
    lod,
    rand,
  } = opts;

  const parts: THREE.BufferGeometry[] = [];
  const { c1, c2 } = resolveSeasonalColors(colorMain, colorTip, season, true, rand);

  const lodMult = lod === 'low' ? 0.55 : lod === 'medium' ? 0.85 : lod === 'high' ? 1.15 : 1.5;
  const shootLen = scale * 1.05;
  const spreadRad = THREE.MathUtils.degToRad(needleSpreadAngle || 42);

  // 3D volumetric sub-shoot directions: [yawZ, pitchX, rollY, lengthScale, forwardOffset]
  // Distributes branchlets to the left, right, upper, lower, and terminal apex so foliage wraps 360° around branches
  const subShoots: [number, number, number, number, number][] =
    lod === 'low'
      ? [
          [0, 0.12, 0, 1.0, 0],
          [-0.68, 0.25, -0.4, 0.82, 0.15],
          [0.68, -0.2, 0.4, 0.82, 0.15],
        ]
      : [
          [0, 0.08, 0, 1.05, 0.0], // Central leader shoot
          [-0.78, 0.18, -0.35, 0.86, 0.12], // Left lateral wing
          [0.78, 0.18, 0.35, 0.86, 0.12], // Right lateral wing
          [-0.45, -0.52, -0.8, 0.78, 0.28], // Upper-left plumed shoot
          [0.45, 0.55, 0.8, 0.78, 0.28], // Lower-right plumed shoot
          [0, -0.48, 1.57, 0.74, 0.38], // Dorsal crown shoot (covers top/bottom)
        ];

  for (let sIdx = 0; sIdx < subShoots.length; sIdx++) {
    const [yawZ, pitchX, rollY, subScale, fwdOff] = subShoots[sIdx];
    const curShootLen = shootLen * subScale;
    const shootGroupParts: THREE.BufferGeometry[] = [];

    // Subtle internal woody twig core
    const twigGeo = new THREE.CylinderGeometry(scale * 0.01, scale * 0.022, curShootLen * 0.85, 4, 1);
    twigGeo.translate(0, curShootLen * 0.42, 0);
    const twigNonIdx = ensureStandardAttributes(twigGeo);
    colorizeGeometryGradient(twigNonIdx, '#4a3525', '#6b4c35', rand, 0.03);
    shootGroupParts.push(twigNonIdx);

    if (foliageType === 'needles_pectinate') {
      // ABETO (FIR): Dense feather-like double ranks (left, right, and upper V-rank)
      const pairs = Math.max(6, Math.round(needleDensity * 1.45 * lodMult));
      for (let i = 0; i < pairs; i++) {
        const t = (i + 0.3) / pairs;
        const yPos = t * curShootLen;
        const profile = Math.sin(Math.pow(t, 0.65) * Math.PI * 0.9 + 0.12);
        const nLen = scale * 0.36 * needleLength * profile * subScale;
        const nWidth = scale * 0.028;

        for (const side of [-1, 1]) {
          const blade = new THREE.BufferGeometry();
          const verts = new Float32Array([
            0, 0, -nWidth * 0.5,
            0, 0, nWidth * 0.5,
            side * nLen * 0.6, nLen * 0.14, nWidth * 0.65,
            side * nLen * 0.6, nLen * 0.14, -nWidth * 0.65,
            side * nLen, nLen * 0.22, 0,
          ]);
          blade.setAttribute('position', new THREE.BufferAttribute(verts, 3));
          blade.setIndex([0, 1, 2, 0, 2, 3, 3, 2, 4]);
          const nonIdx = ensureStandardAttributes(blade);
          const m = new THREE.Matrix4().makeTranslation(0, yPos, 0);
          m.multiply(
            new THREE.Matrix4().makeRotationZ(
              side * (Math.PI * 0.5 - spreadRad * 0.65) + (rand() - 0.5) * 0.15
            )
          );
          m.multiply(new THREE.Matrix4().makeRotationX((i % 2 === 0 ? 0.18 : -0.14) + (rand() - 0.5) * 0.15));
          nonIdx.applyMatrix4(m);
          colorizeGeometryGradient(nonIdx, c1, c2, rand, 0.05);
          shootGroupParts.push(nonIdx);
        }
      }
    } else if (foliageType === 'needles_radial') {
      // PICEA (SPRUCE): Full 360-degree bottlebrush spiral around the shoot
      const totalNeedles = Math.max(12, Math.round(needleDensity * 2.6 * lodMult));
      const golden = 2.39996323;
      for (let i = 0; i < totalNeedles; i++) {
        const t = i / totalNeedles;
        const yPos = (0.06 + t * 0.94) * curShootLen;
        const phi = i * golden;
        const nLen = scale * 0.28 * needleLength * (1.05 - t * 0.32) * subScale;
        const needleGeo = new THREE.ConeGeometry(scale * 0.019, nLen, 3);
        needleGeo.translate(0, nLen * 0.5, 0);
        const nonIdx = ensureStandardAttributes(needleGeo);
        const m = new THREE.Matrix4().makeTranslation(0, yPos, 0);
        m.multiply(new THREE.Matrix4().makeRotationY(phi));
        m.multiply(new THREE.Matrix4().makeRotationX(spreadRad * (0.95 - t * 0.25)));
        nonIdx.applyMatrix4(m);
        colorizeGeometryGradient(nonIdx, c1, c2, rand, 0.05);
        shootGroupParts.push(nonIdx);
      }
    } else if (foliageType === 'needles_scale') {
      // SECUOYA GIGANTE / CIPRÉS: Volumetric 3D billowing cushions & overlapping cord-like scale sprays
      const tuftCount = Math.max(6, Math.round(needleDensity * 1.15 * lodMult));
      const golden = 2.39996323;
      for (let i = 0; i < tuftCount; i++) {
        const t = (i + 0.2) / tuftCount;
        const yPos = t * curShootLen;
        const phi = i * golden + (rand() - 0.5) * 0.35;
        const fanSize = scale * 0.38 * needleLength * (1.15 - t * 0.28) * subScale;

        // Multi-angled scale fan + 3D scale cushion so it looks full from every angle
        const fanGeo = createContouredLeafBlade('lobed', fanSize, 0.82, 0.28);
        const m = new THREE.Matrix4().makeTranslation(
          Math.cos(phi) * scale * 0.08 * (1 - t * 0.4),
          yPos,
          Math.sin(phi) * scale * 0.08 * (1 - t * 0.4)
        );
        m.multiply(new THREE.Matrix4().makeRotationY(phi));
        m.multiply(new THREE.Matrix4().makeRotationX(0.55 + (i % 3) * 0.28 + (rand() - 0.5) * 0.2));
        m.multiply(new THREE.Matrix4().makeRotationZ((rand() - 0.5) * 0.45));
        fanGeo.applyMatrix4(m);
        colorizeGeometryGradient(fanGeo, c1, c2, rand, 0.06);
        shootGroupParts.push(fanGeo);

        // Cross-plane companion scale spray for true 3D volume (eliminates flat ribbon look)
        const crossGeo = createContouredLeafBlade('lobed', fanSize * 0.88, 0.78, -0.22);
        const mc = m.clone();
        mc.multiply(new THREE.Matrix4().makeRotationY(Math.PI * 0.5));
        mc.multiply(new THREE.Matrix4().makeRotationX(0.32));
        crossGeo.applyMatrix4(mc);
        colorizeGeometryGradient(crossGeo, c1, c2, rand, 0.06);
        shootGroupParts.push(crossGeo);
      }
    } else if (foliageType === 'needles_rosette') {
      // CEDRO / ALERCE: Star-like rosette whorls on short shoots all around the bough
      const rosetteCount = Math.max(4, Math.round(needleDensity * 0.78 * lodMult));
      const needlesPerRosette = Math.max(6, fascicleCount * 2 + 1);
      const golden = 2.39996323;
      for (let r = 0; r < rosetteCount; r++) {
        const t = (r + 0.25) / rosetteCount;
        const yPos = t * curShootLen;
        const rPhi = r * golden;
        for (let n = 0; n < needlesPerRosette; n++) {
          const nLen = scale * 0.3 * needleLength * (0.85 + rand() * 0.3) * subScale;
          const needleGeo = new THREE.ConeGeometry(scale * 0.017, nLen, 3);
          needleGeo.translate(0, nLen * 0.5, 0);
          const nonIdx = ensureStandardAttributes(needleGeo);
          const m = new THREE.Matrix4().makeTranslation(
            Math.cos(rPhi) * scale * 0.04,
            yPos,
            Math.sin(rPhi) * scale * 0.04
          );
          m.multiply(new THREE.Matrix4().makeRotationY((n / needlesPerRosette) * Math.PI * 2 + rand() * 0.25));
          m.multiply(new THREE.Matrix4().makeRotationX(0.55 + rand() * 0.45));
          nonIdx.applyMatrix4(m);
          colorizeGeometryGradient(nonIdx, c1, c2, rand, 0.05);
          shootGroupParts.push(nonIdx);
        }
      }
    } else {
      // PINO (needles_fascicle): Dense 360° spiral bundles of 2-5 long needles + lush apical pom-pom tuft
      const bundleCount = Math.max(7, Math.round(needleDensity * 1.35 * lodMult));
      const perFascicle = Math.max(2, Math.min(5, fascicleCount || 3));
      const golden = 2.39996323;

      for (let b = 0; b < bundleCount; b++) {
        const t = (b + 0.2) / bundleCount;
        const yPos = t * curShootLen;
        const bundleYaw = b * golden + (rand() - 0.5) * 0.2;
        // Lower bundles spread wide (up to 70°), apical bundles form a forward/upward dome
        const baseTilt = spreadRad * (1.25 - t * 0.55);

        for (let f = 0; f < perFascicle; f++) {
          const nLen = scale * 0.46 * needleLength * (0.88 + rand() * 0.26) * subScale;
          const needleGeo = new THREE.ConeGeometry(scale * 0.017, nLen, 3);
          needleGeo.translate(0, nLen * 0.5, 0);
          const nonIdx = ensureStandardAttributes(needleGeo);

          const m = new THREE.Matrix4().makeTranslation(0, yPos, 0);
          m.multiply(new THREE.Matrix4().makeRotationY(bundleYaw + (f / perFascicle) * 0.65));
          m.multiply(
            new THREE.Matrix4().makeRotationX(
              baseTilt + (f - (perFascicle - 1) * 0.5) * 0.18 + (rand() - 0.5) * 0.12
            )
          );
          nonIdx.applyMatrix4(m);
          colorizeGeometryGradient(nonIdx, c1, c2, rand, 0.05);
          shootGroupParts.push(nonIdx);
        }
      }
    }

    const mergedShoot = mergeGeometries(shootGroupParts, false);
    shootGroupParts.forEach((g) => g.dispose());
    if (mergedShoot) {
      const mShoot = new THREE.Matrix4().makeTranslation(0, shootLen * fwdOff, 0);
      mShoot.multiply(new THREE.Matrix4().makeRotationY(rollY + (rand() - 0.5) * 0.15));
      mShoot.multiply(new THREE.Matrix4().makeRotationZ(yawZ + (rand() - 0.5) * 0.12));
      mShoot.multiply(new THREE.Matrix4().makeRotationX(pitchX + (rand() - 0.5) * 0.12));
      mergedShoot.applyMatrix4(mShoot);
      parts.push(mergedShoot);
    }
  }

  // Optional Pine Cone (Piña / Estróbilo) attached naturally to the bough
  if (pineConeDensity > 0.02 && rand() < pineConeDensity * 0.7) {
    const cone = createPineConeMesh(scale, colorFlower, rand);
    const mCone = new THREE.Matrix4().makeTranslation(
      (rand() - 0.5) * scale * 0.12,
      shootLen * 0.32,
      scale * 0.06
    );
    if (foliageType === 'needles_pectinate') {
      // Fir cones stand upright on upper branches
      mCone.multiply(new THREE.Matrix4().makeRotationX(Math.PI));
    }
    cone.applyMatrix4(mCone);
    parts.push(cone);
  }

  const finalGeo = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  return finalGeo;
}

/**
 * Creates a botanical Broadleaf cluster with a woody twig and contoured 3D leaves
 */
function createBroadleafCluster(
  shapeType: 'lobed' | 'palmate' | 'ovate' | 'lanceolate' | 'ginkgo' | 'heart',
  opts: FoliageGenOptions
): THREE.BufferGeometry {
  const { scale, widthRatio, bend, colorMain, colorTip, season, lod, rand } = opts;
  const parts: THREE.BufferGeometry[] = [];
  const { c1, c2 } = resolveSeasonalColors(colorMain, colorTip, season, false, rand);

  const lodMult = lod === 'low' ? 0.45 : lod === 'medium' ? 0.85 : lod === 'high' ? 1.25 : 1.75;
  const leafCount = Math.max(5, Math.round((10 + rand() * 6) * lodMult));
  const golden = 2.39996323;

  const baseBlade = createContouredLeafBlade(
    shapeType,
    scale * 0.34,
    widthRatio || 0.65,
    bend || 0.25
  );

  // Central woody shoot twig connecting all leaves at (0,0,0) -> branch tip
  const shootLen = scale * 0.42;
  const twigGeo = new THREE.CylinderGeometry(
    Math.max(0.005, scale * 0.009),
    Math.max(0.009, scale * 0.018),
    shootLen,
    4,
    1
  );
  twigGeo.translate(0, shootLen * 0.45, 0);
  const twigNonIdx = ensureStandardAttributes(twigGeo);
  colorizeGeometryGradient(twigNonIdx, new THREE.Color(colorMain).multiplyScalar(0.55), c1, rand, 0.03);
  parts.push(twigNonIdx);

  for (let i = 0; i < leafCount; i++) {
    const t = i / leafCount;
    const leaf = baseBlade.clone();
    const sc = 0.78 + rand() * 0.42;
    leaf.scale(sc, sc, sc);

    const yaw = i * golden + (rand() - 0.5) * 0.3;
    const pitch = 0.42 + t * 0.78 + (rand() - 0.5) * 0.25;
    const roll = (rand() - 0.5) * 0.45;
    // Keep petiole attachment strictly INSIDE the central shoot twig (r <= scale * 0.008) so no leaf ever floats!
    const r = scale * 0.006 * (1 - t * 0.4);
    const stemY = t * shootLen * 0.85 + scale * 0.02;

    const m = new THREE.Matrix4().makeRotationY(yaw);
    m.multiply(new THREE.Matrix4().makeRotationX(pitch));
    m.multiply(new THREE.Matrix4().makeRotationZ(roll));
    m.setPosition(
      Math.cos(yaw) * r,
      stemY,
      Math.sin(yaw) * r
    );
    leaf.applyMatrix4(m);
    colorizeGeometryGradient(leaf, c1, c2, rand, 0.07);
    parts.push(leaf);
  }
  baseBlade.dispose();

  const merged = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  return merged;
}

/**
 * Creates 3D 5-petal Blossoms + Leaves for Sakura, Magnolia, Jacaranda
 */
function createBlossomCluster(opts: FoliageGenOptions): THREE.BufferGeometry {
  const { scale, colorMain, colorTip, colorFlower, lod, rand } = opts;
  const openness = THREE.MathUtils.clamp(opts.petalOpenness ?? 0.68, 0, 1);
  const parts: THREE.BufferGeometry[] = [];
  const lodMult = lod === 'low' ? 0.45 : lod === 'medium' ? 0.85 : lod === 'high' ? 1.2 : 1.65;

  // Build reusable 5-petal 3D flower geometry
  const petalBlade = createContouredLeafBlade('ovate', scale * (0.14 + openness * 0.04), 0.72, THREE.MathUtils.lerp(-0.12, 0.32, openness));
  const flowerCount = Math.max(4, Math.round(9 * lodMult));
  const golden = 2.39996323;

  const cBase = new THREE.Color(colorMain);
  const cPetalTip = new THREE.Color(colorTip);
  const cAccent = new THREE.Color(colorFlower || colorTip);
  const petalTiltX = THREE.MathUtils.lerp(0.18, 1.24, openness);

  for (let f = 0; f < flowerCount; f++) {
    const t = f / flowerCount;
    const fYaw = f * golden;
    const r = scale * (0.06 + Math.sqrt(t) * 0.24);
    const fx = Math.cos(fYaw) * r;
    const fy = (1 - t * 0.45) * scale * 0.28 + scale * 0.04;
    const fz = Math.sin(fYaw) * r;

    // Slender woody pedicel stem connecting (0,0,0) directly to (fx, fy, fz) so blossoms never float!
    const pedLen = Math.max(0.01, Math.hypot(fx, fy, fz));
    const pedGeo = new THREE.CylinderGeometry(scale * 0.005, scale * 0.009, pedLen, 3, 1);
    pedGeo.translate(0, pedLen * 0.5, 0);
    const pedDir = new THREE.Vector3(fx, fy, fz).normalize();
    const pedQ = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), pedDir);
    pedGeo.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(pedQ));
    const pedStd = ensureStandardAttributes(pedGeo);
    colorizeGeometryGradient(pedStd, '#4a3525', colorMain, rand, 0.02);
    parts.push(pedStd);

    const flowerOrient = new THREE.Matrix4().makeTranslation(fx, fy, fz);
    flowerOrient.multiply(new THREE.Matrix4().makeRotationY(rand() * Math.PI * 2));
    flowerOrient.multiply(new THREE.Matrix4().makeRotationX((rand() - 0.3) * 1.1));

    const petals = 5;
    for (let p = 0; p < petals; p++) {
      const pGeo = petalBlade.clone();
      const pm = flowerOrient.clone();
      pm.multiply(new THREE.Matrix4().makeRotationY((p / petals) * Math.PI * 2));
      pm.multiply(new THREE.Matrix4().makeRotationX(petalTiltX));
      pGeo.applyMatrix4(pm);
      colorizeGeometryGradient(pGeo, cBase, p % 2 === 0 ? cPetalTip : cAccent, rand, 0.05);
      parts.push(pGeo);
    }

    // Golden stamen heart (visible once bud starts opening)
    if (openness > 0.22) {
      const centerGeo = new THREE.OctahedronGeometry(scale * (0.022 + openness * 0.016), 0);
      const centerNonIdx = ensureStandardAttributes(centerGeo);
      centerNonIdx.applyMatrix4(flowerOrient);
      colorizeGeometryGradient(centerNonIdx, '#d97706', '#fef08a', rand, 0.02);
      parts.push(centerNonIdx);
    }
  }
  petalBlade.dispose();

  // Add subtle green/bronze young leaves beneath the blossoms
  const leafBlade = createContouredLeafBlade('ovate', scale * 0.24, 0.55, 0.25);
  const leafCount = Math.max(2, Math.round(4 * lodMult));
  for (let l = 0; l < leafCount; l++) {
    const lg = leafBlade.clone();
    const lm = new THREE.Matrix4().makeRotationY(l * 1.7 + rand());
    lm.multiply(new THREE.Matrix4().makeRotationX(1.0 + rand() * 0.4));
    lg.applyMatrix4(lm);
    colorizeGeometryGradient(lg, '#166534', '#4ade80', rand, 0.05);
    parts.push(lg);
  }
  leafBlade.dispose();

  const merged = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  return merged;
}

/**
 * Creates Holly / Rowan leaves with clusters of glossy 3D berries
 */
function createBerryCluster(opts: FoliageGenOptions): THREE.BufferGeometry {
  const { scale, colorMain, colorTip, colorFlower, lod, rand } = opts;
  const parts: THREE.BufferGeometry[] = [];
  const leaves = createBroadleafCluster('lobed', opts);
  if (leaves) parts.push(leaves);

  const berryCount = lod === 'low' ? 4 : lod === 'medium' ? 7 : 11;
  const cBerry1 = new THREE.Color(colorFlower || '#dc2626').multiplyScalar(0.75);
  const cBerry2 = new THREE.Color(colorFlower || '#ef4444');
  const cMain = new THREE.Color(colorMain);
  const cTip = new THREE.Color(colorTip);
  void cMain;
  void cTip;

  for (let b = 0; b < berryCount; b++) {
    const berry = new THREE.IcosahedronGeometry(scale * 0.048, lod === 'ultra' ? 1 : 0);
    const nonIdx = ensureStandardAttributes(berry);
    const ang = (b / berryCount) * Math.PI * 2 + rand() * 0.5;
    // Keep berries clustered tight around the central stem (r <= scale * 0.07) so they never float!
    const r = scale * (0.025 + rand() * 0.055);
    const by = scale * (0.04 + rand() * 0.16);
    nonIdx.translate(Math.cos(ang) * r, by, Math.sin(ang) * r);
    colorizeGeometryGradient(nonIdx, cBerry1, cBerry2, rand, 0.04);
    parts.push(nonIdx);
  }

  const merged = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  return merged;
}

/**
 * Creates Weeping Strands (Willow / Wisteria) with flexible hanging stem and alternating leaves
 */
function createWeepingStrands(opts: FoliageGenOptions): THREE.BufferGeometry {
  const { scale, colorMain, colorTip, season, lod, rand } = opts;
  const parts: THREE.BufferGeometry[] = [];
  const { c1, c2 } = resolveSeasonalColors(colorMain, colorTip, season, false, rand);

  const lodMult = lod === 'low' ? 0.5 : lod === 'medium' ? 0.85 : lod === 'high' ? 1.2 : 1.6;
  const strandCount = Math.max(3, Math.round(5 * lodMult));
  const baseLeaf = createContouredLeafBlade('lanceolate', scale * 0.24, 0.32, 0.2);

  for (let s = 0; s < strandCount; s++) {
    const strandLen = scale * (1.25 + rand() * 1.0);
    const ang = (s / strandCount) * Math.PI * 2 + rand() * 0.5;
    const rad = scale * (0.06 + rand() * 0.16);
    const bx = Math.cos(ang) * rad;
    const bz = Math.sin(ang) * rad;

    // Slender hanging twiglet connecting (0,0,0) continuously down the entire weeping strand
    const bridgeGeo = new THREE.CylinderGeometry(scale * 0.006, scale * 0.011, Math.hypot(bx, bz) + 0.02, 3, 1);
    bridgeGeo.rotateZ(Math.PI * 0.5);
    bridgeGeo.translate(Math.hypot(bx, bz) * 0.5, 0, 0);
    bridgeGeo.rotateY(-ang);
    const bridgeNonIdx = ensureStandardAttributes(bridgeGeo);
    colorizeGeometryGradient(bridgeNonIdx, c1, c1, rand, 0.02);
    parts.push(bridgeNonIdx);

    const stemGeo = new THREE.CylinderGeometry(scale * 0.004, scale * 0.009, strandLen, 4, 1);
    stemGeo.translate(bx, -strandLen * 0.5, bz);
    const stemNonIdx = ensureStandardAttributes(stemGeo);
    colorizeGeometryGradient(stemNonIdx, c1, c2, rand, 0.03);
    parts.push(stemNonIdx);

    const leavesOnStrand = Math.max(6, Math.round(11 * lodMult));
    for (let i = 0; i < leavesOnStrand; i++) {
      const t = i / leavesOnStrand;
      const leaf = baseLeaf.clone();
      const sc = (1.0 - t * 0.35) * (0.85 + rand() * 0.3);
      leaf.scale(sc, sc, sc);

      const swayX = Math.sin(t * Math.PI * 2 + s) * scale * 0.025;
      const m = new THREE.Matrix4().makeTranslation(bx + swayX, -t * strandLen, bz + swayX * 0.5);
      m.multiply(new THREE.Matrix4().makeRotationY(i * 2.1 + rand() * 0.5));
      m.multiply(new THREE.Matrix4().makeRotationX(2.35 + (rand() - 0.5) * 0.3)); // point downward
      leaf.applyMatrix4(m);
      colorizeGeometryGradient(leaf, c1, c2, rand, 0.06);
      parts.push(leaf);
    }
  }
  baseLeaf.dispose();

  const merged = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  return merged;
}

/**
 * Creates a full Arched Pinnate Palm Crown (Coconut / Date Palm) or Fern Crown
 */
function createPinnateCrown(opts: FoliageGenOptions, isFern = false): THREE.BufferGeometry {
  const { scale, bend, colorMain, colorTip, season, lod, rand } = opts;
  const parts: THREE.BufferGeometry[] = [];
  const { c1, c2 } = resolveSeasonalColors(colorMain, colorTip, season, false, rand);

  const lodMult = lod === 'low' ? 0.55 : lod === 'medium' ? 0.85 : lod === 'high' ? 1.15 : 1.45;
  const frondCount = Math.max(7, Math.round((isFern ? 11 : 13) * lodMult));
  const pinnaTemplate = createContouredLeafBlade('lanceolate', scale * (isFern ? 0.38 : 0.55), isFern ? 0.36 : 0.22, 0.25);

  for (let f = 0; f < frondCount; f++) {
    const tier = f / frondCount;
    const yaw = f * 2.39996323 + (rand() - 0.5) * 0.18;
    const baseTilt = 0.32 + tier * 0.95; // inner fronds upright, outer fronds arching down
    const frondLen = scale * (isFern ? 1.45 : 1.95) * (0.85 + rand() * 0.25);
    const frondParts: THREE.BufferGeometry[] = [];

    const segs = 5;
    const segLen = frondLen / segs;
    let rMat = new THREE.Matrix4();
    const archPerSeg = (bend || 0.45) * 0.26;

    for (let s = 0; s < segs; s++) {
      const st = s / segs;
      const rBot = scale * 0.028 * (1 - st * 0.7);
      const rTop = scale * 0.028 * (1 - (st + 1 / segs) * 0.7);
      const rGeo = new THREE.CylinderGeometry(rTop, rBot, segLen, 4, 1);
      rGeo.translate(0, segLen * 0.5, 0);
      const rNonIdx = ensureStandardAttributes(rGeo);
      rNonIdx.applyMatrix4(rMat);
      colorizeGeometryGradient(rNonIdx, c1, c2, rand, 0.03);
      frondParts.push(rNonIdx);

      // Pinnae along this rachis segment
      const pairsInSeg = Math.max(2, Math.round((isFern ? 4 : 3) * lodMult));
      for (let p = 0; p < pairsInSeg; p++) {
        const pt = st + (p / pairsInSeg) * (1 / segs);
        if (pt < 0.12) continue;
        const pinnaScale = Math.sin(Math.pow(pt, 0.7) * Math.PI) * (0.9 + rand() * 0.2);

        for (const side of [-1, 1]) {
          const pinna = pinnaTemplate.clone();
          pinna.scale(pinnaScale, pinnaScale, pinnaScale);
          const pm = rMat.clone();
          pm.multiply(new THREE.Matrix4().makeTranslation(0, (p / pairsInSeg) * segLen, 0));
          pm.multiply(new THREE.Matrix4().makeRotationY(side * (Math.PI * 0.5 - 0.25)));
          pm.multiply(new THREE.Matrix4().makeRotationX(0.75 + pt * 0.35));
          pinna.applyMatrix4(pm);
          colorizeGeometryGradient(pinna, c1, c2, rand, 0.05);
          frondParts.push(pinna);
        }
      }

      rMat.multiply(new THREE.Matrix4().makeTranslation(0, segLen, 0));
      rMat.multiply(new THREE.Matrix4().makeRotationX(archPerSeg));
    }

    const mergedFrond = mergeGeometries(frondParts, false);
    frondParts.forEach((fp) => fp.dispose());
    if (mergedFrond) {
      const fm = new THREE.Matrix4().makeRotationY(yaw);
      fm.multiply(new THREE.Matrix4().makeRotationX(baseTilt));
      mergedFrond.applyMatrix4(fm);
      parts.push(mergedFrond);
    }
  }
  pinnaTemplate.dispose();

  const merged = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  return merged;
}

/**
 * Creates a Costapalmate Fan Palm Crown (Washingtonia / Sabal)
 */
function createPalmateFanCrown(opts: FoliageGenOptions): THREE.BufferGeometry {
  const { scale, colorMain, colorTip, season, lod, rand } = opts;
  const parts: THREE.BufferGeometry[] = [];
  const { c1, c2 } = resolveSeasonalColors(colorMain, colorTip, season, false, rand);

  const lodMult = lod === 'low' ? 0.55 : lod === 'medium' ? 0.85 : 1.25;
  const frondCount = Math.max(8, Math.round(14 * lodMult));
  const segTemplate = createContouredLeafBlade('lanceolate', scale * 0.78, 0.16, 0.22);

  for (let f = 0; f < frondCount; f++) {
    const tier = f / frondCount;
    const yaw = f * 2.39996323;
    const tilt = 0.25 + tier * 1.15;
    const petioleLen = scale * 0.85;

    const frondParts: THREE.BufferGeometry[] = [];
    const petGeo = new THREE.CylinderGeometry(scale * 0.018, scale * 0.032, petioleLen, 4, 1);
    petGeo.translate(0, petioleLen * 0.5, 0);
    const petNonIdx = ensureStandardAttributes(petGeo);
    colorizeGeometryGradient(petNonIdx, c1, c2, rand, 0.03);
    frondParts.push(petNonIdx);

    // Radiating pleated fan blades at the tip of the petiole
    const rays = lod === 'low' ? 7 : 13;
    for (let r = 0; r < rays; r++) {
      const rt = (r / (rays - 1)) - 0.5;
      const rayBlade = segTemplate.clone();
      const rScale = 1.0 - Math.abs(rt) * 0.35;
      rayBlade.scale(rScale, rScale, rScale);

      const rm = new THREE.Matrix4().makeTranslation(0, petioleLen, 0);
      rm.multiply(new THREE.Matrix4().makeRotationZ(rt * 2.2));
      rm.multiply(new THREE.Matrix4().makeRotationX(0.25 + Math.abs(rt) * 0.35));
      rayBlade.applyMatrix4(rm);
      colorizeGeometryGradient(rayBlade, c1, c2, rand, 0.05);
      frondParts.push(rayBlade);
    }

    const mergedFrond = mergeGeometries(frondParts, false);
    frondParts.forEach((fp) => fp.dispose());
    if (mergedFrond) {
      const fm = new THREE.Matrix4().makeRotationY(yaw);
      fm.multiply(new THREE.Matrix4().makeRotationX(tilt));
      mergedFrond.applyMatrix4(fm);
      parts.push(mergedFrond);
    }
  }
  segTemplate.dispose();

  const merged = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  return merged;
}

/**
 * Creates a true Radial Crown of Arching Banana Paddle Leaves (Musa acuminata)
 * Fixes the flat green pancake from the original code!
 */
function createBananaPaddleCrown(opts: FoliageGenOptions): THREE.BufferGeometry {
  const { scale, bend, colorMain, colorTip, season, lod, rand } = opts;
  const parts: THREE.BufferGeometry[] = [];
  const { c1, c2 } = resolveSeasonalColors(colorMain, colorTip, season, false, rand);

  const lodMult = lod === 'low' ? 0.6 : lod === 'medium' ? 0.9 : 1.25;
  const leafCount = Math.max(7, Math.round(11 * lodMult));

  // Build a multi-segment arched, V-folded paddle leaf with natural wind tears
  for (let i = 0; i < leafCount; i++) {
    const tier = i / leafCount;
    const yaw = i * 2.39996323 + (rand() - 0.5) * 0.22;
    const tilt = 0.22 + tier * 0.92;
    const totalLen = scale * (1.45 + rand() * 0.35);
    const maxW = totalLen * 0.28;

    const rows = 7;
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    for (let r = 0; r <= rows; r++) {
      const v = r / rows;
      // Petiole for first 20%, then broad oblong paddle lamina
      const profile = v < 0.18 ? 0.08 : Math.sin(((v - 0.15) / 0.85) * Math.PI * 0.92);
      const halfW = maxW * profile;
      const y = v * totalLen;
      const archZ = -Math.pow(v, 1.85) * totalLen * (bend || 0.48) * 0.65;
      const troughZ = halfW * 0.26; // V-channel along midrib

      positions.push(
        -halfW, y, archZ + troughZ,
        0, y, archZ,
        halfW, y, archZ + troughZ
      );
      uvs.push(0, v, 0.5, v, 1, v);

      if (r < rows) {
        const rs = r * 3;
        const nr = (r + 1) * 3;
        indices.push(rs, rs + 1, nr + 1, rs, nr + 1, nr);
        indices.push(rs + 1, rs + 2, nr + 2, rs + 1, nr + 2, nr + 1);
      }
    }

    const paddleGeo = new THREE.BufferGeometry();
    paddleGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    paddleGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    paddleGeo.setIndex(indices);
    paddleGeo.computeVertexNormals();
    const nonIdx = ensureStandardAttributes(paddleGeo);

    const m = new THREE.Matrix4().makeRotationY(yaw);
    m.multiply(new THREE.Matrix4().makeRotationX(tilt));
    nonIdx.applyMatrix4(m);
    colorizeGeometryGradient(nonIdx, c1, c2, rand, 0.06);
    parts.push(nonIdx);
  }

  // Central rolled emerging leaf spike ("furling cigar leaf")
  const spikeGeo = new THREE.ConeGeometry(scale * 0.06, scale * 0.95, 5);
  spikeGeo.translate(0, scale * 0.45, 0);
  const spikeNonIdx = ensureStandardAttributes(spikeGeo);
  colorizeGeometryGradient(spikeNonIdx, c2, '#d9f99d', rand, 0.03);
  parts.push(spikeNonIdx);

  const merged = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  return merged;
}

/**
 * Creates Bamboo Nodal Leaf Sprays
 */
function createBambooSpray(opts: FoliageGenOptions): THREE.BufferGeometry {
  return createBroadleafCluster('lanceolate', {
    ...opts,
    widthRatio: 0.24,
    bend: 0.35,
  });
}

/**
 * Creates Fleshy 3D Succulent Rosette Blade (Agave / Aloe)
 */
export function createSucculentBlade(
  length: number,
  width: number,
  colorMain: string,
  colorTip: string,
  rand: () => number
): THREE.BufferGeometry {
  // Triangular cross-section fleshy blade tapering to a sharp dark apical spine
  const geo = new THREE.ConeGeometry(width * 0.55, length, 4, 3);
  geo.scale(1.35, 1.0, 0.38);
  geo.translate(0, length * 0.5, 0);
  // Slight upward S-curve
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const t = y / length;
    pos.setZ(i, pos.getZ(i) - Math.sin(t * Math.PI) * length * 0.08);
  }
  geo.computeVertexNormals();
  const nonIdx = ensureStandardAttributes(geo);
  colorizeGeometryGradient(nonIdx, colorMain, colorTip, rand, 0.05);
  return nonIdx;
}

/**
 * Master dispatcher for any FoliageType
 */
export function generateFoliageCluster(opts: FoliageGenOptions): THREE.BufferGeometry | null {
  const { foliageType, scale, colorMain, colorTip, colorFlower, season, lod, rand } = opts;
  if (foliageType === 'none') return null;

  switch (foliageType) {
    case 'needles_fascicle':
    case 'needles_pectinate':
    case 'needles_radial':
    case 'needles_scale':
    case 'needles_rosette':
      return createConiferShootCluster(opts);

    case 'broadleaf_lobed':
      return createBroadleafCluster('lobed', opts);
    case 'broadleaf_palmate':
      return createBroadleafCluster('palmate', opts);
    case 'broadleaf_ovate':
      return createBroadleafCluster('ovate', opts);
    case 'broadleaf_lanceolate':
      return createBroadleafCluster('lanceolate', opts);
    case 'broadleaf_ginkgo':
      return createBroadleafCluster('ginkgo', opts);
    case 'broadleaf_heart':
      return createBroadleafCluster('heart', opts);

    case 'fronds_pinnate':
      return createPinnateCrown(opts, false);
    case 'fronds_fern':
      return createPinnateCrown(opts, true);
    case 'fronds_palmate':
      return createPalmateFanCrown(opts);
    case 'paddle_banana':
      return createBananaPaddleCrown(opts);
    case 'bamboo_lance':
      return createBambooSpray(opts);

    case 'weeping_strands':
      return createWeepingStrands(opts);
    case 'blossom_clusters':
      return createBlossomCluster(opts);
    case 'berry_clusters':
      return createBerryCluster(opts);

    case 'succulent_rosette':
      return createSucculentBlade(scale * 0.9, scale * 0.28, colorMain, colorTip, rand);

    case 'alien_umbrella_caps': {
      const segs = lod === 'low' ? 10 : 18;
      const capR = scale * 0.55;
      const capH = scale * 0.28;
      const stalk = new THREE.CylinderGeometry(capR * 0.14, capR * 0.22, scale * 0.18, 6, 1);
      stalk.translate(0, scale * 0.08, 0);
      const stalkNonIdx = ensureStandardAttributes(stalk);
      colorizeGeometryGradient(stalkNonIdx, colorMain, colorTip, rand, 0.04);

      const cap = new THREE.SphereGeometry(capR, segs, 8, 0, Math.PI * 2, 0, Math.PI * 0.52);
      cap.scale(1.0, capH / capR, 1.0);
      cap.translate(0, scale * 0.14, 0);
      const capNonIdx = ensureStandardAttributes(cap);
      colorizeGeometryGradient(capNonIdx, colorMain, colorTip, rand, 0.08);

      const gills = new THREE.ConeGeometry(capR * 0.94, capH * 0.35, segs, 1);
      gills.rotateX(Math.PI);
      gills.translate(0, scale * 0.12, 0);
      const gillsNonIdx = ensureStandardAttributes(gills);
      colorizeGeometryGradient(gillsNonIdx, colorFlower, colorTip, rand, 0.04);

      const merged = mergeGeometries([stalkNonIdx, capNonIdx, gillsNonIdx], false);
      stalkNonIdx.dispose();
      capNonIdx.dispose();
      gillsNonIdx.dispose();
      return merged;
    }

    case 'alien_pitcher_traps': {
      const pitcher = new THREE.CylinderGeometry(scale * 0.28, scale * 0.08, scale * 0.72, 12, 3);
      pitcher.translate(0, scale * 0.34, 0);
      const nonIdx = ensureStandardAttributes(pitcher);
      colorizeGeometryGradient(nonIdx, colorMain, colorFlower, rand, 0.08);
      return nonIdx;
    }

    case 'alien_spore_bulbs': {
      const bulb = new THREE.IcosahedronGeometry(scale * 0.42, 2);
      bulb.scale(0.9, 1.15, 0.9);
      bulb.translate(0, scale * 0.32, 0);
      const nonIdx = ensureStandardAttributes(bulb);
      colorizeGeometryGradient(nonIdx, colorMain, colorTip, rand, 0.07);
      return nonIdx;
    }

    case 'alien_tentacle_coils': {
      const torus = new THREE.TorusKnotGeometry(scale * 0.28, scale * 0.085, 24, 7, 2, 3);
      torus.translate(0, scale * 0.28, 0);
      const nonIdx = ensureStandardAttributes(torus);
      colorizeGeometryGradient(nonIdx, colorMain, colorFlower, rand, 0.08);
      return nonIdx;
    }

    case 'ai_custom_element': {
      const lodMult = lod === 'low' ? 0.6 : lod === 'medium' ? 0.85 : 1.15;
      const parts = buildCustomElementFoliageCluster(
        opts.customElement || DEFAULT_CUSTOM_ELEMENT,
        scale,
        colorMain,
        colorTip,
        colorFlower,
        lodMult,
        rand
      );
      if (parts.length === 0) return null;
      const merged = mergeGeometries(parts, false);
      parts.forEach((p) => p.dispose());
      return merged;
    }

    case 'canopy_volume':
    default: {
      const detail = lod === 'ultra' ? 2 : lod === 'high' ? 1 : 0;
      const geo = new THREE.IcosahedronGeometry(scale * 0.72, detail);
      geo.scale(1.15, 0.82, 1.15);
      const nonIdx = ensureStandardAttributes(geo);
      const { c1, c2 } = resolveSeasonalColors(colorMain, colorTip, season, false, rand);
      colorizeGeometryGradient(nonIdx, c1, c2, rand, 0.08);
      return nonIdx;
    }
  }
}
