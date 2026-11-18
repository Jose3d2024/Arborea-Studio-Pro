import * as THREE from 'three';
import {
  TreeParams,
  PolygonLOD,
  CustomBotanicalElement,
} from '../types/botany';
import {
  ensureStandardAttributes,
  colorizeGeometryGradient,
} from './foliageGenerator';
import { computeTwistFreeFrames } from './alienFloraGenerator';

const LOD_MULT: Record<PolygonLOD, number> = {
  low: 0.55,
  medium: 0.85,
  high: 1.0,
  ultra: 1.35,
};

export const DEFAULT_CUSTOM_ELEMENT: CustomBotanicalElement = {
  id: 'spiral_volute_liana',
  name: 'Liana en Espiral & Volutas Foliares',
  scientificName: 'Spiraea voluta botanica',
  description:
    'Tronco leñoso trenzado que se divide en brazos enrollados en espiral con hojas brotando a lo largo del tallo y zarcillos rizados.',
  createdAt: 1731700000000,
  stemStructure: 'spiral_volute_vine',
  canopyElement: 'stem_hugging_leaves',
  surfaceElement: 'braided_vines',
  hangingElement: 'curling_tendrils',
  spiralTurns: 1.45,
  spiralArms: 2,
  thornDensity: 0.0,
  thornLength: 0.8,
  filamentCount: 10,
  filamentLength: 1.0,
  padLayers: 5,
  lobeCount: 3,
  cupDepth: 0.35,
};

function resolveStemColor(hex: string, isHerbaceous: boolean, isMossyWoodTrunk = false): string {
  const c = new THREE.Color(hex || (isHerbaceous ? '#2f6e24' : '#583e2a'));
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  if (isHerbaceous && !isMossyWoodTrunk) {
    // If the stem is herbaceous (e.g. flower stalk, allium, dandelion, bell stem) and color is washed-out beige/grey,
    // restore a rich botanical chlorophyll green unless the user explicitly picked a vivid purple/crimson stalk
    if (hsl.s < 0.22 || (hsl.h > 0.06 && hsl.h < 0.19 && hsl.l > 0.55)) {
      c.setHSL(0.29, 0.54, 0.30);
    } else if (hsl.h >= 0.19 && hsl.h <= 0.44) {
      c.setHSL(hsl.h, Math.max(0.45, hsl.s), THREE.MathUtils.clamp(hsl.l, 0.22, 0.42));
    }
    return '#' + c.getHexString();
  }
  // If this is a woody/mossy trunk, ensure the trunk wood itself is rich weathered brown bark (never green or washed-out white)
  if (isMossyWoodTrunk) {
    if (hsl.h >= 0.16 && hsl.h <= 0.46) {
      c.setHSL(0.075, 0.38, 0.25); // Rich weathered deadwood brown
    } else if (hsl.s < 0.18 || hsl.l > 0.46 || hsl.l < 0.12) {
      c.setHSL(0.075, 0.36, THREE.MathUtils.clamp(hsl.l, 0.20, 0.30));
    }
    return '#' + c.getHexString();
  }
  if (hsl.s < 0.16) {
    c.setHSL(0.07, 0.34, THREE.MathUtils.clamp(hsl.l * 0.65, 0.14, 0.32));
  }
  return '#' + c.getHexString();
}

function resolveMossPalette(
  colMainHex: string,
  colTipHex: string
): { deepMoss: string; midMoss: string; tipMoss: string } {
  const cMain = new THREE.Color(colMainHex || '#4a7c1d');
  const cTip = new THREE.Color(colTipHex || '#7cb524');
  const hslMain = { h: 0, s: 0, l: 0 };
  const hslTip = { h: 0, s: 0, l: 0 };
  cMain.getHSL(hslMain);
  cTip.getHSL(hslTip);

  // Prevent white background halo or beige wood pixels from turning moss into pale whitish-mint!
  const mainHue =
    hslMain.h >= 0.17 && hslMain.h <= 0.42 ? hslMain.h : 0.26;
  const mainSat = THREE.MathUtils.clamp(Math.max(0.54, hslMain.s), 0.54, 0.78);
  const mainLum = THREE.MathUtils.clamp(
    hslMain.l > 0.48 ? 0.30 : hslMain.l < 0.16 ? 0.26 : hslMain.l,
    0.22,
    0.34
  );

  const tipHue =
    hslTip.h >= 0.16 && hslTip.h <= 0.40 ? hslTip.h : 0.23;
  const tipSat = THREE.MathUtils.clamp(Math.max(0.62, hslTip.s), 0.62, 0.85);
  const tipLum = THREE.MathUtils.clamp(
    hslTip.l > 0.58 ? 0.44 : hslTip.l < 0.28 ? 0.40 : hslTip.l,
    0.36,
    0.48
  );

  const cDeep = new THREE.Color().setHSL(mainHue + 0.02, mainSat * 0.92, mainLum * 0.58);
  const cMid = new THREE.Color().setHSL(mainHue, mainSat, mainLum);
  const cBright = new THREE.Color().setHSL(tipHue, tipSat, tipLum);

  return {
    deepMoss: '#' + cDeep.getHexString(),
    midMoss: '#' + cMid.getHexString(),
    tipMoss: '#' + cBright.getHexString(),
  };
}

function colorizeGeometryByHeight(
  geo: THREE.BufferGeometry,
  colorBottomHex: string | THREE.Color,
  colorTopHex: string | THREE.Color,
  minY?: number,
  maxY?: number
): void {
  const pos = geo.attributes.position as THREE.BufferAttribute;
  if (!pos) return;
  let y0 = minY;
  let y1 = maxY;
  if (y0 === undefined || y1 === undefined) {
    geo.computeBoundingBox();
    y0 = geo.boundingBox ? geo.boundingBox.min.y : 0;
    y1 = geo.boundingBox ? geo.boundingBox.max.y : 1;
  }
  const rangeY = Math.max(0.0001, y1 - y0);
  const cBot = new THREE.Color(colorBottomHex);
  const cTop = new THREE.Color(colorTopHex);
  const tmp = new THREE.Color();
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const t = THREE.MathUtils.clamp((pos.getY(i) - y0) / rangeY, 0, 1);
    tmp.copy(cBot).lerp(cTop, t);
    colors[i * 3] = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}



/**
 * Builds a smooth, closed 3D tube along a CatmullRomCurve3 with longitudinal ribs/fluting,
 * twist-free parallel transport frames, and outward-facing normals.
 */
function buildSmoothCurveTube(
  points: THREE.Vector3[],
  rStart: number,
  rEnd: number,
  tubularSegs: number,
  radialSegs: number,
  colBot: string,
  colTop: string,
  rand: () => number,
  fluteCount = 6,
  fluteDepth = 0.08,
  pinchTip = true
): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points);
  const frames = computeTwistFreeFrames(curve, tubularSegs);
  const vCount = (tubularSegs + 1) * (radialSegs + 1);
  const positions = new Float32Array(vCount * 3);
  const uvs = new Float32Array(vCount * 2);
  const indices: number[] = [];

  for (let i = 0; i <= tubularSegs; i++) {
    const t = i / tubularSegs;
    const pt = curve.getPointAt(t);
    const N = frames.normals[i];
    const B = frames.binormals[i];
    const tipPinch = pinchTip && i === tubularSegs ? 0.04 : 1.0;
    const baseR = THREE.MathUtils.lerp(rStart, rEnd, Math.pow(t, 0.78)) * tipPinch;

    for (let j = 0; j <= radialSegs; j++) {
      const u = j / radialSegs;
      const theta = u * Math.PI * 2 + t * 1.6;
      const flute =
        fluteCount > 0 ? 1.0 + Math.cos(theta * fluteCount) * fluteDepth * (1 - t * 0.5) : 1.0;
      const r = Math.max(0.001, baseR * flute);

      const vx = pt.x + r * (Math.cos(theta) * N.x + Math.sin(theta) * B.x);
      const vy = pt.y + r * (Math.cos(theta) * N.y + Math.sin(theta) * B.y);
      const vz = pt.z + r * (Math.cos(theta) * N.z + Math.sin(theta) * B.z);

      const idx = i * (radialSegs + 1) + j;
      positions[idx * 3] = vx;
      positions[idx * 3 + 1] = vy;
      positions[idx * 3 + 2] = vz;
      uvs[idx * 2] = u;
      uvs[idx * 2 + 1] = t;
    }
  }

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
  const std = ensureStandardAttributes(geo);
  colorizeGeometryGradient(std, colBot, colTop, rand, 0.04);
  return std;
}

/**
 * Builds a thick, 3D sculpted fleshy succulent / claw blade with a concave inner channel,
 * keeled dorsal back, sharp pointed apex, and marginal teeth/spines along both edges.
 */
function buildSculptedFleshyClawBlade(
  curvePts: THREE.Vector3[],
  radialOutDir: THREE.Vector3,
  maxHalfWidth: number,
  maxThickness: number,
  tubularSegs: number,
  colBase: string,
  colMid: string,
  colTip: string,
  colSpine: string,
  thornDensity: number,
  thornLengthMult: number,
  rand: () => number
): THREE.BufferGeometry[] {
  const outGeos: THREE.BufferGeometry[] = [];
  const curve = new THREE.CatmullRomCurve3(curvePts);

  const ringCols = 7;
  const vCount = (tubularSegs + 1) * (ringCols + 1);
  const positions = new Float32Array(vCount * 3);
  const colors = new Float32Array(vCount * 3);
  const uvs = new Float32Array(vCount * 2);
  const indices: number[] = [];

  const cBase = new THREE.Color(colBase);
  const cMid = new THREE.Color(colMid);
  const cTip = new THREE.Color(colTip);
  const tmpCol = new THREE.Color();

  const upVec = new THREE.Vector3(0, 1, 0);
  const sideVec = new THREE.Vector3().crossVectors(upVec, radialOutDir).normalize();
  if (sideVec.lengthSq() < 0.001) sideVec.set(1, 0, 0);

  const leftMarginPts: { pos: THREE.Vector3; dir: THREE.Vector3; scale: number }[] = [];
  const rightMarginPts: { pos: THREE.Vector3; dir: THREE.Vector3; scale: number }[] = [];
  const dorsalKeelPts: { pos: THREE.Vector3; dir: THREE.Vector3; scale: number }[] = [];

  for (let i = 0; i <= tubularSegs; i++) {
    const t = i / tubularSegs;
    const pt = curve.getPointAt(t);
    const tangent = curve.getTangentAt(t).normalize();

    const outwardNormal = new THREE.Vector3()
      .crossVectors(tangent, sideVec)
      .normalize();
    if (outwardNormal.dot(radialOutDir) < -0.2 && t < 0.5) {
      outwardNormal.negate();
    }

    const widthProfile =
      t === 1.0
        ? 0.002
        : Math.sin(Math.pow(1.0 - t, 0.68) * Math.PI * 0.82 + 0.18) *
          (1.0 - Math.pow(t, 2.2) * 0.35);
    const thickProfile =
      t === 1.0 ? 0.002 : Math.pow(1.0 - t, 0.75) * (0.85 + 0.25 * Math.sin(t * Math.PI));

    const hw = Math.max(0.002, maxHalfWidth * widthProfile);
    const th = Math.max(0.002, maxThickness * thickProfile);
    const cupChannel = hw * 0.22 * (1.0 - t * 0.5);

    const sectionOffsets: [number, number][] = [
      [-hw, -cupChannel * 0.6],
      [-hw * 0.42, -cupChannel * 0.1],
      [hw * 0.42, -cupChannel * 0.1],
      [hw, -cupChannel * 0.6],
      [hw * 0.55, th * 0.58],
      [0, th],
      [-hw * 0.55, th * 0.58],
      [-hw, -cupChannel * 0.6],
    ];

    if (i >= 2 && i < tubularSegs - 1 && thornDensity > 0.05) {
      const pLeft = pt
        .clone()
        .addScaledVector(sideVec, -hw)
        .addScaledVector(outwardNormal, -cupChannel * 0.5);
      const pRight = pt
        .clone()
        .addScaledVector(sideVec, hw)
        .addScaledVector(outwardNormal, -cupChannel * 0.5);
      const pKeel = pt.clone().addScaledVector(outwardNormal, th);

      const dirL = sideVec
        .clone()
        .multiplyScalar(-0.75)
        .addScaledVector(outwardNormal, 0.35)
        .addScaledVector(tangent, 0.45)
        .normalize();
      const dirR = sideVec
        .clone()
        .multiplyScalar(0.75)
        .addScaledVector(outwardNormal, 0.35)
        .addScaledVector(tangent, 0.45)
        .normalize();
      const dirK = outwardNormal
        .clone()
        .multiplyScalar(0.85)
        .addScaledVector(tangent, 0.4)
        .normalize();

      const spScale = (1.0 - t * 0.45) * maxHalfWidth * 0.48 * thornLengthMult;
      leftMarginPts.push({ pos: pLeft, dir: dirL, scale: spScale });
      rightMarginPts.push({ pos: pRight, dir: dirR, scale: spScale });
      if (i % 2 === 0) {
        dorsalKeelPts.push({ pos: pKeel, dir: dirK, scale: spScale * 0.9 });
      }
    }

    for (let j = 0; j <= ringCols; j++) {
      const [sx, sy] = sectionOffsets[j];
      const vx = pt.x + sideVec.x * sx + outwardNormal.x * sy;
      const vy = pt.y + sideVec.y * sx + outwardNormal.y * sy;
      const vz = pt.z + sideVec.z * sx + outwardNormal.z * sy;

      const idx = i * (ringCols + 1) + j;
      positions[idx * 3] = vx;
      positions[idx * 3 + 1] = vy;
      positions[idx * 3 + 2] = vz;
      uvs[idx * 2] = j / ringCols;
      uvs[idx * 2 + 1] = t;

      if (t < 0.28) {
        tmpCol.copy(cBase).lerp(cMid, t / 0.28);
      } else {
        tmpCol.copy(cMid).lerp(cTip, (t - 0.28) / 0.72);
      }
      if (j === 0 || j === 3 || j === 7) {
        tmpCol.lerp(cTip, 0.25);
      }
      const jitter = (rand() - 0.5) * 0.04;
      colors[idx * 3] = THREE.MathUtils.clamp(tmpCol.r + jitter, 0, 1);
      colors[idx * 3 + 1] = THREE.MathUtils.clamp(tmpCol.g + jitter, 0, 1);
      colors[idx * 3 + 2] = THREE.MathUtils.clamp(tmpCol.b + jitter, 0, 1);
    }
  }

  for (let i = 0; i < tubularSegs; i++) {
    for (let j = 0; j < ringCols; j++) {
      const a = i * (ringCols + 1) + j;
      const b = (i + 1) * (ringCols + 1) + j;
      const c = (i + 1) * (ringCols + 1) + (j + 1);
      const d = i * (ringCols + 1) + (j + 1);
      indices.push(a, b, d, b, c, d);
    }
  }

  const bladeGeo = new THREE.BufferGeometry();
  bladeGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  bladeGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  bladeGeo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  bladeGeo.setIndex(indices);
  bladeGeo.computeVertexNormals();
  outGeos.push(ensureStandardAttributes(bladeGeo));

  if (thornDensity > 0.05) {
    const allSpineNodes = [...leftMarginPts, ...rightMarginPts, ...dorsalKeelPts];
    for (let s = 0; s < allSpineNodes.length; s++) {
      const node = allSpineNodes[s];
      const spLen = Math.max(0.035, node.scale * (0.85 + rand() * 0.35));
      const spR = Math.max(0.008, spLen * 0.22);

      const cone = new THREE.ConeGeometry(spR, spLen, 4, 1);
      cone.translate(0, spLen * 0.45, 0);
      const q = new THREE.Quaternion().setFromUnitVectors(upVec, node.dir);
      const m = new THREE.Matrix4().makeRotationFromQuaternion(q);
      m.setPosition(node.pos);
      cone.applyMatrix4(m);
      const cStd = ensureStandardAttributes(cone);
      colorizeGeometryGradient(cStd, colTip, colSpine, rand, 0.04);
      outGeos.push(cStd);
    }
  }

  return outGeos;
}

/**
 * Builds a single contoured 3D leaf blade with custom lobe modulation, midrib fold,
 * and an embedded basal petiole collar so it never floats or attaches by a zero-width vertex.
 */
function buildCustomContouredLeaf(
  len: number,
  widthRatio: number,
  lobeCount: number,
  bend: number,
  colMain: string,
  colTip: string,
  rand: () => number
): THREE.BufferGeometry {
  const rows = 7;
  const maxW = len * THREE.MathUtils.clamp(widthRatio, 0.25, 1.1);
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let r = 0; r <= rows; r++) {
    const v = r / rows;
    const env =
      r === 0
        ? 0.16
        : r === rows
        ? 0.01
        : Math.max(0.14, Math.sin(Math.pow(v, 0.68) * Math.PI));
    const lobeWave =
      lobeCount > 1 && r > 0 && r < rows
        ? 0.78 + 0.22 * Math.sin(v * Math.PI * lobeCount)
        : 1.0;
    const halfW = maxW * 0.5 * env * lobeWave;
    // Start slightly below 0 (-0.08 * len) so the petiole base embeds deeply into the branch/cushion
    const y = (v - 0.08) * len;
    const archZ = -Math.pow(v, 1.65) * len * bend * 0.45;
    const foldZ = halfW * 0.24;

    positions.push(
      -halfW, y, archZ + foldZ,
      0, y, archZ - halfW * 0.08,
      halfW, y, archZ + foldZ
    );
    uvs.push(0, v, 0.5, v, 1, v);

    if (r < rows) {
      const rs = r * 3;
      const nr = (r + 1) * 3;
      indices.push(rs, rs + 1, nr + 1, rs, nr + 1, nr);
      indices.push(rs + 1, rs + 2, nr + 2, rs + 1, nr + 2, nr + 1);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const std = ensureStandardAttributes(geo);
  colorizeGeometryGradient(std, colMain, colTip, rand, 0.06);
  return std;
}

/**
 * Builds a 3D double-curved cupped lotus/rose petal that swells outward at the belly
 * and cups inward toward the top (unlike flat triangles!), with optional dorsal bristles.
 */
function buildSculptedCuppedPetal(
  height: number,
  maxWidth: number,
  bellySpread: number,
  tipInwardCup: number,
  colBase: string,
  colMid: string,
  colTip: string,
  rand: () => number
): THREE.BufferGeometry {
  const rows = 9;
  const cols = 4;
  const positions: number[] = [];
  const colors: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const cBase = new THREE.Color(colBase);
  const cMid = new THREE.Color(colMid);
  const cTip = new THREE.Color(colTip);
  const tmpCol = new THREE.Color();

  for (let r = 0; r <= rows; r++) {
    const v = r / rows;
    // Spoon-shaped width envelope: wide in the middle-upper part, pointed tip at v=1
    const wEnv =
      v === 1.0
        ? 0.005
        : Math.max(0.18, Math.sin(Math.pow(v, 0.65) * Math.PI) * (1.0 - Math.pow(v, 3.0) * 0.25));
    const halfW = maxWidth * 0.5 * wEnv;

    // Radial profile z(v): swells outward to bellySpread at v=0.45, then curves inward by tipInwardCup at v=1.0
    const bellyCurve = Math.sin(v * Math.PI) * bellySpread;
    const tipCurve = Math.pow(v, 1.35) * tipInwardCup;
    const centerZ = bellyCurve + tipCurve;
    const centerY = v * height * (1.0 - Math.max(0, -tipInwardCup / height) * 0.15);

    for (let c = 0; c <= cols; c++) {
      const u = c / cols;
      const s = (u - 0.5) * 2; // -1 .. +1
      const x = s * halfW;
      // Transverse cupping so the petal wraps around the bud circumference
      const cupZ = -Math.pow(s, 2) * halfW * 0.45;
      const z = centerZ + cupZ;

      positions.push(x, centerY, z);
      uvs.push(u, v);

      if (v < 0.35) {
        tmpCol.copy(cBase).lerp(cMid, v / 0.35);
      } else {
        tmpCol.copy(cMid).lerp(cTip, (v - 0.35) / 0.65);
      }
      // Subtle vein highlight along midrib and rim
      if (Math.abs(s) > 0.75) tmpCol.lerp(cTip, 0.25);
      const jit = (rand() - 0.5) * 0.03;
      colors.push(
        THREE.MathUtils.clamp(tmpCol.r + jit, 0, 1),
        THREE.MathUtils.clamp(tmpCol.g + jit, 0, 1),
        THREE.MathUtils.clamp(tmpCol.b + jit, 0, 1)
      );
    }
  }

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const a = r * (cols + 1) + c;
      const b = (r + 1) * (cols + 1) + c;
      const d = (r + 1) * (cols + 1) + (c + 1);
      const e = r * (cols + 1) + (c + 1);
      indices.push(a, e, b, b, e, d);
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
 * Builds a complete, watertight 3D Lotus / Crimson Bud / Flower Corolla ("Capullo Carmesí Trenzado")
 * with:
 *  - A welded woody/fleshy receptacle cup at (0,0,0) that seats directly onto the stem tip (ZERO gap!)
 *  - Spiny outer calyx bracts/sepals hugging the base of the bud
 *  - 3 concentric whorls of 3D cupped petals that curve around an inner glowing core
 */
function buildSculptedFlowerCorollaOrBud(
  el: CustomBotanicalElement,
  scale: number,
  colStem: string,
  colMain: string,
  colTip: string,
  colFlower: string,
  densityMult: number,
  rand: () => number
): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const cupDepth = THREE.MathUtils.clamp(el.cupDepth ?? 0.45, 0.05, 0.95);
  const openness = THREE.MathUtils.clamp(el.petalOpenness ?? (1.0 - cupDepth * 0.65), 0, 1);
  const budH = scale * 1.15;
  const budMaxR = scale * 0.62;

  // Choose vivid crimson/floral colors for the petals
  const cMainObj = new THREE.Color(colMain);
  const cFlowObj = new THREE.Color(colFlower);
  const hslM = { h: 0, s: 0, l: 0 };
  const hslF = { h: 0, s: 0, l: 0 };
  cMainObj.getHSL(hslM);
  cFlowObj.getHSL(hslF);
  const vividPetalMid = hslF.s >= hslM.s - 0.05 ? colFlower : colMain;
  const vividPetalTip = colTip;
  const darkPetalBase =
    '#' +
    new THREE.Color(vividPetalMid)
      .multiplyScalar(0.35)
      .lerp(new THREE.Color(colStem), 0.35)
      .getHexString();

  // 1. Welded Receptacle Base Cup (sits at y = -budH * 0.14 .. +budH * 0.22 so the stem tip penetrates deep inside it!)
  const recep = new THREE.LatheGeometry(
    [
      new THREE.Vector2(0.001, -budH * 0.14),
      new THREE.Vector2(budMaxR * 0.28, -budH * 0.06),
      new THREE.Vector2(budMaxR * 0.5, budH * 0.08),
      new THREE.Vector2(budMaxR * 0.44, budH * 0.18),
      new THREE.Vector2(0.001, budH * 0.22),
    ],
    Math.max(8, Math.round(12 * densityMult))
  );
  const recepStd = ensureStandardAttributes(recep);
  colorizeGeometryGradient(recepStd, colStem, darkPetalBase, rand, 0.04);
  parts.push(recepStd);

  // 2. Inner Glowing Ovule / Core Bulb nestled inside the petals
  const coreBulb = new THREE.IcosahedronGeometry(budMaxR * 0.36, 2);
  coreBulb.scale(0.82 + openness * 0.25, 1.35 - openness * 0.55, 0.82 + openness * 0.25);
  coreBulb.translate(0, budH * (0.42 - openness * 0.16), 0);
  const coreStd = ensureStandardAttributes(coreBulb);
  colorizeGeometryGradient(coreStd, vividPetalMid, vividPetalTip, rand, 0.05);
  parts.push(coreStd);

  // 3. Three Concentric Whorls of 3D Cupped Petals (Inner, Middle, Outer) + Basal Sepals
  const baseCount = Math.max(6, Math.min(12, el.lobeCount || 8));
  const bellyScale = THREE.MathUtils.lerp(1.05, 0.52, openness);
  const whorls = [
    // Whorl 0: Innermost tightly-cupped petals enclosing the core (hinge open with openness)
    {
      count: baseCount,
      radiusOffset: budMaxR * THREE.MathUtils.lerp(0.13, 0.21, openness),
      yOffset: budH * THREE.MathUtils.lerp(0.08, 0.06, openness),
      pHeight: budH * 0.88,
      pWidth: budMaxR * 0.58,
      belly: budMaxR * 0.38 * bellyScale,
      tipCup: THREE.MathUtils.lerp(-budMaxR * (0.30 + cupDepth * 0.22), budMaxR * 0.16, openness),
      tiltRad: THREE.MathUtils.lerp(0.02, 0.62, openness),
      phase: 0,
      cBase: darkPetalBase,
      cMid: vividPetalMid,
      cTop: vividPetalTip,
    },
    // Whorl 1: Middle lush overlapping petals
    {
      count: baseCount + 2,
      radiusOffset: budMaxR * THREE.MathUtils.lerp(0.20, 0.30, openness),
      yOffset: budH * 0.04,
      pHeight: budH * 0.92,
      pWidth: budMaxR * 0.66,
      belly: budMaxR * 0.46 * bellyScale,
      tipCup: THREE.MathUtils.lerp(-budMaxR * (0.14 + cupDepth * 0.16), budMaxR * 0.26, openness),
      tiltRad: THREE.MathUtils.lerp(0.08, 1.02, openness),
      phase: Math.PI / baseCount,
      cBase: darkPetalBase,
      cMid: vividPetalMid,
      cTop: vividPetalTip,
    },
    // Whorl 2: Outer protective bracts/petals with darker base
    {
      count: baseCount + 2,
      radiusOffset: budMaxR * THREE.MathUtils.lerp(0.25, 0.34, openness),
      yOffset: 0.0,
      pHeight: budH * 0.78,
      pWidth: budMaxR * 0.54,
      belly: budMaxR * 0.48 * bellyScale,
      tipCup: THREE.MathUtils.lerp(-budMaxR * 0.04 * cupDepth, budMaxR * 0.32, openness),
      tiltRad: THREE.MathUtils.lerp(0.14, 1.32, openness),
      phase: 0.35,
      cBase: colStem,
      cMid: darkPetalBase,
      cTop: vividPetalMid,
    },
  ];

  for (const w of whorls) {
    for (let i = 0; i < w.count; i++) {
      const ang = (i / w.count) * Math.PI * 2 + w.phase + (rand() - 0.5) * 0.08;
      const petal = buildSculptedCuppedPetal(
        w.pHeight * (0.94 + rand() * 0.1),
        w.pWidth * (0.94 + rand() * 0.12),
        w.belly,
        w.tipCup,
        w.cBase,
        w.cMid,
        w.cTop,
        rand
      );
      petal.rotateX(w.tiltRad);
      petal.translate(0, w.yOffset, w.radiusOffset);
      petal.rotateY(ang);
      parts.push(petal);
    }
  }

  // 4. Outer Calyx Spines / Bristles embedded into the lower bud & receptacle
  const spineCount = Math.max(8, Math.round(14 * (0.5 + (el.thornDensity ?? 0.4))));
  for (let s = 0; s < spineCount; s++) {
    const ang = s * 2.39996323;
    const hFrac = (s / spineCount) * 0.5;
    // Start inside the bud surface so calyx spines never float!
    const rAtH = budMaxR * (0.24 + Math.sin(hFrac * Math.PI) * 0.32);
    const yAtH = budH * (0.04 + hFrac * THREE.MathUtils.lerp(0.58, 0.22, openness));
    const spLen = budMaxR * (0.28 + rand() * 0.22);

    const cone = new THREE.ConeGeometry(spLen * 0.16, spLen, 4, 1);
    cone.translate(0, spLen * 0.35, 0);
    const dir = new THREE.Vector3(
      Math.sin(ang) * THREE.MathUtils.lerp(0.75, 0.96, openness),
      THREE.MathUtils.lerp(0.65, 0.18, openness),
      Math.cos(ang) * THREE.MathUtils.lerp(0.75, 0.96, openness)
    ).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    const m = new THREE.Matrix4().makeRotationFromQuaternion(q);
    m.setPosition(Math.sin(ang) * rAtH, yAtH, Math.cos(ang) * rAtH);
    cone.applyMatrix4(m);
    const cStd = ensureStandardAttributes(cone);
    colorizeGeometryGradient(cStd, darkPetalBase, vividPetalTip, rand, 0.04);
    parts.push(cStd);
  }

  // 5. If petalOpenness > 0.20, add central 3D Stamen Filaments & Anthers!
  if (openness > 0.2) {
    const stamenCount = Math.max(6, Math.min(16, baseCount));
    for (let st = 0; st < stamenCount; st++) {
      const sAng = (st / stamenCount) * Math.PI * 2 + 0.2;
      const sSpread = budMaxR * (0.16 + openness * 0.34);
      const sH = budH * (0.48 + openness * 0.18 + (st % 2) * 0.12);
      const sPts = [
        new THREE.Vector3(0, budH * 0.12, 0),
        new THREE.Vector3(Math.cos(sAng) * sSpread * 0.6, budH * 0.42, Math.sin(sAng) * sSpread * 0.6),
        new THREE.Vector3(Math.cos(sAng) * sSpread, sH, Math.sin(sAng) * sSpread),
      ];
      parts.push(
        buildSmoothCurveTube(
          sPts,
          budMaxR * 0.032,
          budMaxR * 0.016,
          6,
          4,
          vividPetalMid,
          vividPetalTip,
          rand,
          0,
          0,
          false
        )
      );
      const anther = new THREE.IcosahedronGeometry(budMaxR * 0.048, 0);
      anther.scale(0.8, 1.4, 0.8);
      anther.translate(Math.cos(sAng) * sSpread, sH, Math.sin(sAng) * sSpread);
      const antherStd = ensureStandardAttributes(anther);
      colorizeGeometryGradient(antherStd, vividPetalTip, '#fef08a', rand, 0.03);
      parts.push(antherStd);
    }
  }

  return parts;
}

/**
 * Builds a complete, watertight 3D Sculpted Umbrella / Mushroom / Bioluminescent Spore Dome Cap
 * ("custom_fungi_cap") with:
 *  - A welded sub-cap collar/annulus ring at (0,0,0) that seats directly onto the stalk tip
 *  - A 3D sculpted hemispherical / bell / umbrella dome with ribbed margin
 *  - Radial 3D gill lamellae underneath the dome
 *  - 3D raised contrasting spots/warts across the upper dome surface (like spotted orange/red caps)
 *  - Delicate hanging glowing spore filaments emerging from inside the underside of the cap
 */
function buildSculptedUmbrellaFungiCap(
  el: CustomBotanicalElement,
  scale: number,
  colStalk: string,
  colCapMain: string,
  colCapTip: string,
  colGillOrFilament: string,
  colAccentSpot: string,
  densityMult: number,
  includeHangingFilaments: boolean,
  rand: () => number
): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const capR = Math.max(0.18, scale * 0.78);
  const domeRatio = THREE.MathUtils.clamp(el.capDomeHeight ?? 0.58, 0.25, 1.05);
  const capH = capR * domeRatio;
  const radSegs = Math.max(14, Math.round(24 * Math.min(1.4, densityMult)));
  const ringSegs = Math.max(8, Math.round(12 * Math.min(1.3, densityMult)));

  // 1. Welded Sub-Cap Collar / Annulus Ring at (0,0,0) so the stalk tip is 100% fused into the cap
  const collar = new THREE.LatheGeometry(
    [
      new THREE.Vector2(0.001, -capH * 0.22),
      new THREE.Vector2(capR * 0.18, -capH * 0.14),
      new THREE.Vector2(capR * 0.28, -capH * 0.05),
      new THREE.Vector2(capR * 0.16, capH * 0.04),
      new THREE.Vector2(capR * 0.32, capH * 0.12),
      new THREE.Vector2(0.001, capH * 0.16),
    ],
    Math.max(8, Math.round(12 * densityMult))
  );
  const collarStd = ensureStandardAttributes(collar);
  colorizeGeometryGradient(collarStd, colStalk, colCapMain, rand, 0.04);
  parts.push(collarStd);

  // 2. Sculpted 3D Umbrella / Hemispherical Dome Cap
  const vCount = (ringSegs + 1) * (radSegs + 1);
  const positions = new Float32Array(vCount * 3);
  const colors = new Float32Array(vCount * 3);
  const uvs = new Float32Array(vCount * 2);
  const indices: number[] = [];

  const cApex = new THREE.Color(colCapMain);
  const cMid = new THREE.Color(colCapTip);
  const cRim = new THREE.Color(colGillOrFilament).lerp(cMid, 0.5);
  const tmpCol = new THREE.Color();
  const ribCount = Math.max(10, Math.round((el.lobeCount || 12) * 1.5));

  for (let r = 0; r <= ringSegs; r++) {
    const v = r / ringSegs; // 0 = top apex, 1 = outer rim
    const phi = v * Math.PI * 0.54;
    const baseR = Math.sin(phi) * capR;
    // Slight bell/umbrella inflection near the rim
    const baseY = Math.cos(phi) * capH;

    for (let j = 0; j <= radSegs; j++) {
      const u = j / radSegs;
      const theta = u * Math.PI * 2;
      const ribWave = 1.0 + Math.cos(theta * ribCount) * 0.035 * Math.pow(v, 1.4);
      const scallopY = Math.sin(theta * ribCount) * capH * 0.025 * Math.pow(v, 2.0);

      const vx = Math.cos(theta) * baseR * ribWave;
      const vz = Math.sin(theta) * baseR * ribWave;
      const vy = baseY + scallopY;

      const idx = r * (radSegs + 1) + j;
      positions[idx * 3] = vx;
      positions[idx * 3 + 1] = vy;
      positions[idx * 3 + 2] = vz;
      uvs[idx * 2] = u;
      uvs[idx * 2 + 1] = 1 - v;

      if (v < 0.55) {
        tmpCol.copy(cApex).lerp(cMid, v / 0.55);
      } else {
        tmpCol.copy(cMid).lerp(cRim, (v - 0.55) / 0.45);
      }
      const jit = (rand() - 0.5) * 0.04;
      colors[idx * 3] = THREE.MathUtils.clamp(tmpCol.r + jit, 0, 1);
      colors[idx * 3 + 1] = THREE.MathUtils.clamp(tmpCol.g + jit, 0, 1);
      colors[idx * 3 + 2] = THREE.MathUtils.clamp(tmpCol.b + jit, 0, 1);
    }
  }

  for (let r = 0; r < ringSegs; r++) {
    for (let j = 0; j < radSegs; j++) {
      const a = r * (radSegs + 1) + j;
      const b = (r + 1) * (radSegs + 1) + j;
      const c = (r + 1) * (radSegs + 1) + (j + 1);
      const d = r * (radSegs + 1) + (j + 1);
      indices.push(a, b, d, b, c, d);
    }
  }

  const domeGeo = new THREE.BufferGeometry();
  domeGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  domeGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  domeGeo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  domeGeo.setIndex(indices);
  domeGeo.computeVertexNormals();
  parts.push(ensureStandardAttributes(domeGeo));

  // 3. Radial 3D Underside Gill Lamellae (welded from central collar out to the cap rim)
  const gillCount = Math.max(14, Math.min(32, Math.round((el.gillCount || 22) * Math.min(1.2, densityMult))));
  const cGillInner = new THREE.Color(colStalk).lerp(new THREE.Color(colGillOrFilament), 0.55);
  const cGillOuter = new THREE.Color(colCapTip);

  for (let g = 0; g < gillCount; g++) {
    const gAng = (g / gillCount) * Math.PI * 2;
    const cosA = Math.cos(gAng);
    const sinA = Math.sin(gAng);
    const rIn = capR * 0.14;
    const rOut = capR * 0.94;
    const rMid = (rIn + rOut) * 0.5;

    const yTopIn = capH * 0.18;
    const yTopMid = capH * 0.52;
    const yTopOut = -capH * 0.04;
    const yBotIn = -capH * 0.04;
    const yBotMid = capH * 0.06;

    const gVerts = new Float32Array([
      cosA * rIn, yBotIn, sinA * rIn,
      cosA * rIn, yTopIn, sinA * rIn,
      cosA * rMid, yTopMid, sinA * rMid,
      cosA * rMid, yBotMid, sinA * rMid,
      cosA * rOut, yTopOut, sinA * rOut,
    ]);
    const gGeo = new THREE.BufferGeometry();
    gGeo.setAttribute('position', new THREE.BufferAttribute(gVerts, 3));
    gGeo.setIndex([0, 1, 2, 0, 2, 3, 3, 2, 4, 0, 2, 1, 0, 3, 2, 3, 4, 2]);
    gGeo.computeVertexNormals();
    const gStd = ensureStandardAttributes(gGeo);
    colorizeGeometryGradient(gStd, cGillInner, cGillOuter, rand, 0.03);
    parts.push(gStd);
  }

  // 4. 3D Raised Contrasting Spots / Warts on the Dome Top (like the dark spots on glowing orange domes!)
  const spotDensity = el.capSpotDensity ?? 0.65;
  if (spotDensity > 0.08) {
    const spotCount = Math.max(8, Math.min(26, Math.round(18 * spotDensity * Math.min(1.3, densityMult))));
    const golden = 2.39996323;
    for (let s = 0; s < spotCount; s++) {
      const u = (s + 0.4) / spotCount;
      const phi = Math.sqrt(u) * Math.PI * 0.46;
      const theta = s * golden + (rand() - 0.5) * 0.2;
      const sr = Math.sin(phi) * capR * 0.99;
      const sy = Math.cos(phi) * capH * 0.99;
      const sx = Math.cos(theta) * sr;
      const sz = Math.sin(theta) * sr;

      const wartSize = capR * (0.065 + (1 - u * 0.4) * 0.055) * (0.8 + rand() * 0.4);
      const wart = new THREE.IcosahedronGeometry(wartSize, 1);
      wart.scale(1.15, 0.42, 1.15);

      const surfNormal = new THREE.Vector3(
        Math.cos(theta) * Math.sin(phi),
        Math.cos(phi),
        Math.sin(theta) * Math.sin(phi)
      ).normalize();
      const qWart = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), surfNormal);
      const mWart = new THREE.Matrix4().makeRotationFromQuaternion(qWart);
      mWart.setPosition(sx, sy, sz);
      wart.applyMatrix4(mWart);

      const wartStd = ensureStandardAttributes(wart);
      colorizeGeometryGradient(wartStd, colStalk, colAccentSpot, rand, 0.04);
      parts.push(wartStd);
    }
  }

  // 5. Delicate Glowing Spore Filaments / Tentacles hanging directly from inside the underside of the cap!
  if (includeHangingFilaments && el.hangingElement !== 'none') {
    const strandCount = Math.max(5, Math.min(14, Math.round((el.filamentCount || 10) * 0.55)));
    const filLenMult = THREE.MathUtils.clamp(el.filamentLength ?? 1.0, 0.4, 2.2);
    for (let f = 0; f < strandCount; f++) {
      const fAng = (f / strandCount) * Math.PI * 2 + (rand() - 0.5) * 0.25;
      const fRad = capR * (0.32 + (f % 3) * 0.18);
      // Start INSIDE the underside of the dome so it is 100% physically fused to the cap!
      const startY = Math.cos((fRad / capR) * Math.PI * 0.5) * capH * 0.55;
      const sx = Math.cos(fAng) * fRad;
      const sz = Math.sin(fAng) * fRad;
      const dropH = capR * (0.85 + rand() * 0.95) * filLenMult;
      const sway = (rand() - 0.5) * capR * 0.16;

      const fPts = [
        new THREE.Vector3(sx, startY, sz),
        new THREE.Vector3(sx + sway * 0.5, startY - dropH * 0.48, sz - sway * 0.4),
        new THREE.Vector3(sx + sway, startY - dropH, sz + sway * 0.5),
      ];
      parts.push(
        buildSmoothCurveTube(
          fPts,
          capR * 0.024,
          capR * 0.006,
          6,
          4,
          colGillOrFilament,
          colCapTip,
          rand,
          0,
          0,
          true
        )
      );

      // Luminous spore droplet at the tip of the hanging filament
      const drop = new THREE.IcosahedronGeometry(capR * 0.032, 0);
      drop.scale(0.85, 1.45, 0.85);
      drop.translate(sx + sway, startY - dropH, sz + sway * 0.5);
      const dropStd = ensureStandardAttributes(drop);
      colorizeGeometryGradient(dropStd, colGillOrFilament, colCapTip, rand, 0.03);
      parts.push(dropStd);
    }
  }

  return parts;
}

/**
 * Builds a solid, organically sculpted multi-lobed 3D foliage pillow/cushion
 * that welds onto a bonsai branch tip and holds the outer leaves so there are ZERO floating triangles.
 */
function buildSculptedCloudCushionCore(
  radiusX: number,
  heightY: number,
  radiusZ: number,
  colBottom: string,
  colMid: string,
  colTop: string,
  detailLevel: number,
  rand: () => number
): THREE.BufferGeometry {
  const detail = detailLevel >= 1.1 ? 3 : 2;
  const geo = new THREE.IcosahedronGeometry(1.0, detail);
  const pos = geo.attributes.position;
  const seedPhase = rand() * Math.PI * 2;

  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i);
    let y = pos.getY(i);
    let z = pos.getZ(i);

    const theta = Math.atan2(z, x);
    // Multi-lobed cloud silhouette
    const lobeMod =
      1.0 +
      0.16 * Math.sin(theta * 5 + seedPhase) +
      0.1 * Math.cos(theta * 3 - seedPhase * 0.7) +
      0.08 * Math.sin(y * 4.5 + theta * 2);

    // Flatten the bottom slightly like a classic bonsai cloud pad, dome the top
    const verticalScale = y < 0 ? heightY * 0.55 : heightY * 0.95;
    x *= radiusX * lobeMod;
    z *= radiusZ * lobeMod;
    y = y * verticalScale + heightY * 0.18;

    pos.setXYZ(i, x, y, z);
  }

  geo.computeVertexNormals();
  const std = ensureStandardAttributes(geo);

  // Rich 3-stop vertical gradient (dark crimson underside -> mid -> bright scarlet top)
  const pAttr = std.attributes.position;
  std.computeBoundingBox();
  const minY = std.boundingBox ? std.boundingBox.min.y : -heightY;
  const maxY = std.boundingBox ? std.boundingBox.max.y : heightY;
  const spanY = Math.max(0.01, maxY - minY);

  const cBot = new THREE.Color(colBottom);
  const cMid = new THREE.Color(colMid);
  const cTop = new THREE.Color(colTop);
  const tmp = new THREE.Color();
  const colors = new Float32Array(pAttr.count * 3);

  for (let i = 0; i < pAttr.count; i++) {
    const t = THREE.MathUtils.clamp((pAttr.getY(i) - minY) / spanY, 0, 1);
    if (t < 0.45) {
      tmp.copy(cBot).lerp(cMid, t / 0.45);
    } else {
      tmp.copy(cMid).lerp(cTop, (t - 0.45) / 0.55);
    }
    const jit = (rand() - 0.5) * 0.04;
    colors[i * 3] = THREE.MathUtils.clamp(tmp.r + jit, 0, 1);
    colors[i * 3 + 1] = THREE.MathUtils.clamp(tmp.g + jit, 0, 1);
    colors[i * 3 + 2] = THREE.MathUtils.clamp(tmp.b + jit, 0, 1);
  }
  std.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return std;
}

/**
 * Computes an iridescent multi-hue color shift so each bubble/floret/tip in an umbel or crown
 * reflects a rich spectrum (coral-orange, magenta-pink, cyan-blue, gold, violet) instead of flat beige.
 */
function computeIridescentSpectrumColor(
  baseColorHex: string,
  secondaryColorHex: string,
  accentColorHex: string,
  rayIndex: number,
  totalRays: number,
  iridescentShift: number,
  dir: THREE.Vector3
): { colCore: string; colOuter: string; colHighlight: string } {
  const shiftAmt = THREE.MathUtils.clamp(iridescentShift, 0, 1);
  const cBase = new THREE.Color(baseColorHex || '#f97316');
  const cSec = new THREE.Color(secondaryColorHex || '#ec4899');
  const cAcc = new THREE.Color(accentColorHex || '#38bdf8');

  const hslB = { h: 0, s: 0, l: 0 };
  cBase.getHSL(hslB);
  // If input color was accidentally washed out (low saturation), boost it into vibrant coral-amber
  if (hslB.s < 0.35) {
    cBase.setHSL(0.06, 0.86, 0.58);
  }

  const palette = [
    cBase,
    cSec,
    cAcc,
    new THREE.Color('#fb923c'), // Warm Coral Orange
    new THREE.Color('#f472b6'), // Iridescent Rose Pink
    new THREE.Color('#38bdf8'), // Prismatic Cyan Blue
    new THREE.Color('#c084fc'), // Violet Opal
    new THREE.Color('#facc15'), // Golden Amber
  ];

  const spatialPhase =
    (dir.x * 0.65 + dir.y * 0.55 - dir.z * 0.45 + 1.5) * 1.4 +
    (rayIndex / Math.max(1, totalRays)) * 2.5;
  const idxA = Math.abs(Math.floor(spatialPhase * 2.3)) % palette.length;
  const idxB = (idxA + 2) % palette.length;
  const frac = (spatialPhase * 2.3) - Math.floor(spatialPhase * 2.3);

  const specA = cBase.clone().lerp(palette[idxA], shiftAmt * 0.85);
  const specB = cSec.clone().lerp(palette[idxB], shiftAmt * 0.9);
  const colCore = '#' + specA.clone().lerp(specB, frac * 0.5).getHexString();
  const colOuter = '#' + specB.clone().lerp(new THREE.Color('#e0f2fe'), 0.28 * shiftAmt).getHexString();
  const colHighlight =
    '#' +
    specA
      .clone()
      .lerp(new THREE.Color('#ffffff'), 0.52)
      .getHexString();

  return { colCore, colOuter, colHighlight };
}

/**
 * Builds a single AI-Synthesized Micro-Part at the tip of a ray, pedicel, or branchlet:
 * - 'iridescent_bubble': Translucent glassy bubble sphere + inner nucleus + 2-3 satellite micro-bubbles
 * - 'dewy_droplet': Elongated tear/nectar drop with bright specular crown
 * - 'micro_floret_star': 5-6 pointed star floret with central stamen dot
 * - 'cupped_bell_calyx': Hanging miniature bell/cup flower with protruding clapper
 * - 'faceted_crystal_gem': Double-terminated hexagonal crystal prism
 * - 'spotted_spore_dome': Miniature umbrella dome cap
 * - 'lanceolate_blade': Pointed bract/leaf tip
 */
function buildSynthesizedTipPrimitive(
  primitiveType: string,
  tipRadius: number,
  pos: THREE.Vector3,
  dir: THREE.Vector3,
  colCore: string,
  colOuter: string,
  colHighlight: string,
  densityMult: number,
  rand: () => number,
  openness = 0.72
): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const upVec = new THREE.Vector3(0, 1, 0);
  const qAlign = new THREE.Quaternion().setFromUnitVectors(upVec, dir.clone().normalize());
  const matAlign = new THREE.Matrix4().makeRotationFromQuaternion(qAlign);
  matAlign.setPosition(pos.x, pos.y, pos.z);

  if (primitiveType === 'iridescent_bubble' || primitiveType === 'dewy_droplet') {
    const isDroplet = primitiveType === 'dewy_droplet';
    const detail = densityMult >= 0.95 ? 2 : 1;
    // 1. Main Glassy Bubble / Dewy Sphere welded onto the ray tip
    const mainSphere = new THREE.IcosahedronGeometry(tipRadius, detail);
    if (isDroplet) {
      mainSphere.scale(0.84, 1.32, 0.84);
      mainSphere.translate(0, tipRadius * 0.35, 0);
    } else {
      mainSphere.translate(0, tipRadius * 0.55, 0);
    }
    mainSphere.applyMatrix4(matAlign);
    const mainStd = ensureStandardAttributes(mainSphere);
    colorizeGeometryGradient(mainStd, colCore, colOuter, rand, 0.05);
    parts.push(mainStd);

    // 2. Inner Luminous Nucleus / Refracting Core inside the bubble
    const innerCore = new THREE.IcosahedronGeometry(tipRadius * 0.48, 0);
    innerCore.translate(0, tipRadius * (isDroplet ? 0.25 : 0.45), 0);
    innerCore.applyMatrix4(matAlign);
    const coreStd = ensureStandardAttributes(innerCore);
    colorizeGeometryGradient(coreStd, colHighlight, colCore, rand, 0.02);
    parts.push(coreStd);

    // 3. Satellite Micro-Bubbles / Dew Pearls clustered directly on the main bubble surface (welded!)
    const satCount = isDroplet ? 1 : 2 + (rand() > 0.45 ? 1 : 0);
    for (let s = 0; s < satCount; s++) {
      const satAng = s * 2.39996 + rand() * 0.8;
      const satElev = 0.25 + rand() * 0.95;
      const satR = tipRadius * (0.28 + rand() * 0.22);
      const dist = tipRadius * 0.86; // Welded into the outer shell of the main bubble
      const localOffset = new THREE.Vector3(
        Math.cos(satAng) * Math.sin(satElev) * dist,
        tipRadius * 0.55 + Math.cos(satElev) * dist,
        Math.sin(satAng) * Math.sin(satElev) * dist
      );
      const satGeo = new THREE.IcosahedronGeometry(satR, detail > 1 ? 1 : 0);
      satGeo.translate(localOffset.x, localOffset.y, localOffset.z);
      satGeo.applyMatrix4(matAlign);
      const satStd = ensureStandardAttributes(satGeo);
      colorizeGeometryGradient(satStd, colOuter, colHighlight, rand, 0.04);
      parts.push(satStd);
    }
    return parts;
  }

  if (primitiveType === 'micro_floret_star') {
    const petalCount = 5;
    const op = THREE.MathUtils.clamp(openness, 0, 1);
    const centerDisk = new THREE.IcosahedronGeometry(tipRadius * 0.42, 1);
    centerDisk.scale(1.0, 0.55, 1.0);
    centerDisk.applyMatrix4(matAlign);
    const diskStd = ensureStandardAttributes(centerDisk);
    colorizeGeometryGradient(diskStd, colCore, colHighlight, rand, 0.03);
    parts.push(diskStd);

    for (let p = 0; p < petalCount; p++) {
      const pAng = (p / petalCount) * Math.PI * 2;
      const petal = buildCustomContouredLeaf(
        tipRadius * 1.45,
        0.52,
        1,
        THREE.MathUtils.lerp(-0.18, 0.42, op),
        colCore,
        colOuter,
        rand
      );
      const mLocal = new THREE.Matrix4()
        .makeRotationY(pAng)
        .multiply(new THREE.Matrix4().makeRotationX(THREE.MathUtils.lerp(0.18, 1.28, op)));
      petal.applyMatrix4(mLocal);
      petal.applyMatrix4(matAlign);
      parts.push(petal);
    }
    return parts;
  }

  if (primitiveType === 'cupped_bell_calyx') {
    const op = THREE.MathUtils.clamp(openness, 0, 1);
    const bellH = tipRadius * 2.1;
    const bellR = tipRadius * 1.15;
    const mouthFlare = THREE.MathUtils.lerp(0.45, 1.32, op);
    const waistFlare = THREE.MathUtils.lerp(0.55, 0.95, op);
    const bellLathe = new THREE.LatheGeometry(
      [
        new THREE.Vector2(0.001, 0),
        new THREE.Vector2(bellR * 0.35, bellH * 0.18),
        new THREE.Vector2(bellR * 0.72 * waistFlare, bellH * 0.55),
        new THREE.Vector2(bellR * 0.68 * waistFlare, bellH * 0.82),
        new THREE.Vector2(bellR * mouthFlare, bellH * 1.0),
      ],
      8
    );
    bellLathe.applyMatrix4(matAlign);
    const bellStd = ensureStandardAttributes(bellLathe);
    colorizeGeometryGradient(bellStd, colCore, colOuter, rand, 0.04);
    parts.push(bellStd);

    // Glowing clapper stamen inside the bell
    const clapper = new THREE.IcosahedronGeometry(tipRadius * 0.36, 0);
    clapper.scale(0.8, 1.6, 0.8);
    clapper.translate(0, bellH * 0.95, 0);
    clapper.applyMatrix4(matAlign);
    const clapStd = ensureStandardAttributes(clapper);
    colorizeGeometryGradient(clapStd, colHighlight, colOuter, rand, 0.03);
    parts.push(clapStd);
    return parts;
  }

  if (primitiveType === 'faceted_crystal_gem') {
    const gemH = tipRadius * 2.4;
    const gemR = tipRadius * 0.75;
    const gem = new THREE.ConeGeometry(gemR, gemH, 6, 1);
    gem.translate(0, gemH * 0.42, 0);
    gem.applyMatrix4(matAlign);
    const gemStd = ensureStandardAttributes(gem);
    colorizeGeometryGradient(gemStd, colCore, colHighlight, rand, 0.03);
    parts.push(gemStd);
    return parts;
  }

  if (primitiveType === 'scifi_plasma_orb') {
    const detail = densityMult >= 0.9 ? 2 : 1;
    const orb = new THREE.IcosahedronGeometry(tipRadius * 1.05, detail);
    orb.translate(0, tipRadius * 0.65, 0);
    orb.applyMatrix4(matAlign);
    const orbStd = ensureStandardAttributes(orb);
    colorizeGeometryGradient(orbStd, colCore, colHighlight, rand, 0.04);
    parts.push(orbStd);

    // Two intersecting orbital energy rings around the plasma orb
    for (let r = 0; r < 2; r++) {
      const ring = new THREE.TorusGeometry(tipRadius * 1.38, tipRadius * 0.09, 6, 16);
      ring.rotateX(r === 0 ? 0.65 : -0.65);
      ring.rotateZ(r === 0 ? 0.4 : -0.4);
      ring.translate(0, tipRadius * 0.65, 0);
      ring.applyMatrix4(matAlign);
      const ringStd = ensureStandardAttributes(ring);
      colorizeGeometryGradient(ringStd, colOuter, colHighlight, rand, 0.02);
      parts.push(ringStd);
    }
    return parts;
  }

  if (primitiveType === 'spiked_seed_burr') {
    const burrCore = new THREE.IcosahedronGeometry(tipRadius * 0.85, 1);
    burrCore.translate(0, tipRadius * 0.6, 0);
    burrCore.applyMatrix4(matAlign);
    const burrStd = ensureStandardAttributes(burrCore);
    colorizeGeometryGradient(burrStd, colCore, colOuter, rand, 0.04);
    parts.push(burrStd);

    const spikeCount = 12;
    const golden = 2.39996323;
    for (let s = 0; s < spikeCount; s++) {
      const v = (s + 0.5) / spikeCount;
      const phi = Math.acos(1 - 2 * v);
      const theta = s * golden;
      const sx = Math.sin(phi) * Math.cos(theta);
      const sy = Math.cos(phi);
      const sz = Math.sin(phi) * Math.sin(theta);
      const spCone = new THREE.ConeGeometry(tipRadius * 0.16, tipRadius * 0.95, 4, 1);
      spCone.translate(0, tipRadius * 0.45, 0);
      const qSp = new THREE.Quaternion().setFromUnitVectors(
        upVec,
        new THREE.Vector3(sx, sy, sz).normalize()
      );
      const mSp = new THREE.Matrix4().makeRotationFromQuaternion(qSp);
      mSp.setPosition(sx * tipRadius * 0.65, tipRadius * 0.6 + sy * tipRadius * 0.65, sz * tipRadius * 0.65);
      spCone.applyMatrix4(mSp);
      spCone.applyMatrix4(matAlign);
      const spStd = ensureStandardAttributes(spCone);
      colorizeGeometryGradient(spStd, colOuter, colHighlight, rand, 0.03);
      parts.push(spStd);
    }
    return parts;
  }

  if (primitiveType === 'winged_helicoid_seed') {
    const nut = new THREE.IcosahedronGeometry(tipRadius * 0.58, 1);
    nut.scale(0.85, 1.25, 0.7);
    nut.translate(0, tipRadius * 0.35, 0);
    nut.applyMatrix4(matAlign);
    const nutStd = ensureStandardAttributes(nut);
    colorizeGeometryGradient(nutStd, colCore, colOuter, rand, 0.04);
    parts.push(nutStd);

    for (const side of [-1, 1]) {
      const wing = buildCustomContouredLeaf(
        tipRadius * 2.3,
        0.48,
        1,
        0.22,
        colOuter,
        colHighlight,
        rand
      );
      const mW = new THREE.Matrix4()
        .makeTranslation(0, tipRadius * 0.35, 0)
        .multiply(new THREE.Matrix4().makeRotationZ(side * 0.68))
        .multiply(new THREE.Matrix4().makeRotationY(side * 0.25));
      wing.applyMatrix4(mW);
      wing.applyMatrix4(matAlign);
      parts.push(wing);
    }
    return parts;
  }

  if (primitiveType === 'crowned_pomegranate_pod') {
    const pod = new THREE.IcosahedronGeometry(tipRadius * 0.95, 2);
    pod.scale(1.0, 1.12, 1.0);
    pod.translate(0, tipRadius * 0.75, 0);
    pod.applyMatrix4(matAlign);
    const podStd = ensureStandardAttributes(pod);
    colorizeGeometryGradient(podStd, colCore, colOuter, rand, 0.04);
    parts.push(podStd);

    const teeth = 6;
    for (let t = 0; t < teeth; t++) {
      const tAng = (t / teeth) * Math.PI * 2;
      const tooth = new THREE.ConeGeometry(tipRadius * 0.2, tipRadius * 0.65, 4, 1);
      const mT = new THREE.Matrix4()
        .makeTranslation(
          Math.cos(tAng) * tipRadius * 0.38,
          tipRadius * 1.75,
          Math.sin(tAng) * tipRadius * 0.38
        )
        .multiply(new THREE.Matrix4().makeRotationY(-tAng))
        .multiply(new THREE.Matrix4().makeRotationZ(-0.32));
      tooth.applyMatrix4(mT);
      tooth.applyMatrix4(matAlign);
      const tStd = ensureStandardAttributes(tooth);
      colorizeGeometryGradient(tStd, colOuter, colHighlight, rand, 0.03);
      parts.push(tStd);
    }
    return parts;
  }

  if (primitiveType === 'recurved_thorn_claw') {
    const clawPts = [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, tipRadius * 1.1, tipRadius * 0.25),
      new THREE.Vector3(0, tipRadius * 1.85, tipRadius * 0.95),
      new THREE.Vector3(0, tipRadius * 1.55, tipRadius * 1.45),
    ];
    const claw = buildSmoothCurveTube(
      clawPts,
      tipRadius * 0.42,
      0.003,
      6,
      5,
      colCore,
      colHighlight,
      rand,
      4,
      0.1,
      true
    );
    claw.applyMatrix4(matAlign);
    parts.push(claw);
    return parts;
  }

  if (primitiveType === 'feathery_pappus_plume') {
    const achene = new THREE.ConeGeometry(tipRadius * 0.24, tipRadius * 0.7, 5, 1);
    achene.translate(0, tipRadius * 0.25, 0);
    achene.applyMatrix4(matAlign);
    const acStd = ensureStandardAttributes(achene);
    colorizeGeometryGradient(acStd, colCore, colOuter, rand, 0.03);
    parts.push(acStd);

    const plumes = 9;
    for (let p = 0; p < plumes; p++) {
      const pAng = (p / plumes) * Math.PI * 2;
      const pEnd = new THREE.Vector3(
        Math.cos(pAng) * tipRadius * 1.25,
        tipRadius * 1.85,
        Math.sin(pAng) * tipRadius * 1.25
      );
      const plumeTube = buildSmoothCurveTube(
        [
          new THREE.Vector3(0, tipRadius * 0.45, 0),
          pEnd.clone().multiplyScalar(0.55),
          pEnd,
        ],
        tipRadius * 0.06,
        0.002,
        4,
        4,
        colOuter,
        colHighlight,
        rand,
        0,
        0,
        true
      );
      plumeTube.applyMatrix4(matAlign);
      parts.push(plumeTube);
    }
    return parts;
  }

  if (primitiveType === 'sucker_tentacle_cup') {
    const cup = new THREE.LatheGeometry(
      [
        new THREE.Vector2(0.001, 0),
        new THREE.Vector2(tipRadius * 0.55, tipRadius * 0.25),
        new THREE.Vector2(tipRadius * 0.95, tipRadius * 0.65),
        new THREE.Vector2(tipRadius * 0.72, tipRadius * 0.85),
        new THREE.Vector2(tipRadius * 0.25, tipRadius * 0.35),
        new THREE.Vector2(0.001, tipRadius * 0.32),
      ],
      10
    );
    cup.applyMatrix4(matAlign);
    const cupStd = ensureStandardAttributes(cup);
    colorizeGeometryGradient(cupStd, colCore, colHighlight, rand, 0.04);
    parts.push(cupStd);
    return parts;
  }

  if (primitiveType === 'granulated_berry_cluster') {
    const core = new THREE.IcosahedronGeometry(tipRadius * 0.62, 1);
    core.translate(0, tipRadius * 0.65, 0);
    core.applyMatrix4(matAlign);
    const coreStd = ensureStandardAttributes(core);
    colorizeGeometryGradient(coreStd, colCore, colOuter, rand, 0.04);
    parts.push(coreStd);

    const drupeCount = Math.max(7, Math.round(10 * Math.min(1.2, densityMult)));
    const drupeDetail = densityMult >= 1.15 ? 1 : 0;
    const golden = 2.39996323;
    for (let d = 0; d < drupeCount; d++) {
      const u = (d + 0.5) / drupeCount;
      const phi = Math.acos(1 - 1.65 * u);
      const theta = d * golden;
      const dist = tipRadius * 0.68;
      const drupeR = tipRadius * (0.28 + (1 - u * 0.35) * 0.08);
      const drupe = new THREE.IcosahedronGeometry(drupeR, drupeDetail);
      drupe.translate(
        Math.cos(theta) * Math.sin(phi) * dist,
        tipRadius * 0.65 + Math.cos(phi) * dist,
        Math.sin(theta) * Math.sin(phi) * dist
      );
      drupe.applyMatrix4(matAlign);
      const dStd = ensureStandardAttributes(drupe);
      colorizeGeometryGradient(dStd, colOuter, colHighlight, rand, 0.05);
      parts.push(dStd);
    }
    return parts;
  }

  if (primitiveType === 'fuzzy_pom_floret_tuft') {
    const core = new THREE.IcosahedronGeometry(tipRadius * 0.52, 1);
    core.translate(0, tipRadius * 0.55, 0);
    core.applyMatrix4(matAlign);
    const coreStd = ensureStandardAttributes(core);
    colorizeGeometryGradient(coreStd, colCore, colOuter, rand, 0.03);
    parts.push(coreStd);

    const bristleCount = Math.max(14, Math.round(22 * Math.min(1.25, densityMult)));
    const golden = 2.39996323;
    for (let b = 0; b < bristleCount; b++) {
      const u = (b + 0.5) / bristleCount;
      const phi = Math.acos(1 - 1.55 * u);
      const theta = b * golden;
      const dirB = new THREE.Vector3(
        Math.cos(theta) * Math.sin(phi),
        Math.cos(phi),
        Math.sin(theta) * Math.sin(phi)
      ).normalize();
      const bLen = tipRadius * (0.85 + rand() * 0.45);
      const cone = new THREE.ConeGeometry(tipRadius * 0.075, bLen, 4, 1);
      cone.translate(0, bLen * 0.5, 0);
      const qB = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dirB);
      const mB = new THREE.Matrix4().makeRotationFromQuaternion(qB);
      mB.setPosition(0, tipRadius * 0.55, 0);
      cone.applyMatrix4(mB);
      cone.applyMatrix4(matAlign);
      const bStd = ensureStandardAttributes(cone);
      colorizeGeometryGradient(bStd, colOuter, colHighlight, rand, 0.04);
      parts.push(bStd);
    }
    return parts;
  }

  if (primitiveType === 'none') {
    return parts;
  }

  if (primitiveType === 'spotted_spore_dome') {
    const capR = tipRadius * 1.15;
    const capH = tipRadius * 0.85;
    const domeProfile: THREE.Vector2[] = [
      new THREE.Vector2(0.001, -capH * 0.08),
      new THREE.Vector2(capR * 0.52, -capH * 0.05),
      new THREE.Vector2(capR * 0.98, 0),
      new THREE.Vector2(capR * 1.0, capH * 0.25),
      new THREE.Vector2(capR * 0.72, capH * 0.72),
      new THREE.Vector2(capR * 0.34, capH * 0.94),
      new THREE.Vector2(0.001, capH),
    ];
    const capLathe = new THREE.LatheGeometry(domeProfile, 14);
    capLathe.applyMatrix4(matAlign);
    const capStd = ensureStandardAttributes(capLathe);
    colorizeGeometryGradient(capStd, colCore, colOuter, rand, 0.04);
    parts.push(capStd);

    const goldenSpot = 2.39996323;
    for (let sp = 0; sp < 7; sp++) {
      const spFrac = 0.22 + (sp / 7) * 0.65;
      const spAng = sp * goldenSpot;
      const spR = capR * Math.cos(spFrac * Math.PI * 0.46) * 0.88;
      const spY = capH * (0.14 + Math.sin(spFrac * Math.PI * 0.46) * 0.82);
      const wart = new THREE.IcosahedronGeometry(capR * 0.13, 1);
      wart.scale(1.15, 0.55, 1.15);
      wart.translate(Math.cos(spAng) * spR, spY, Math.sin(spAng) * spR);
      wart.applyMatrix4(matAlign);
      const wStd = ensureStandardAttributes(wart);
      colorizeGeometryGradient(wStd, '#f8fafc', colHighlight, rand, 0.02);
      parts.push(wStd);
    }
    return parts;
  }

  if (primitiveType === 'bryophyte_moss_pad') {
    const padR = tipRadius * 1.18;
    const pad = new THREE.IcosahedronGeometry(padR, 2);
    pad.scale(1.12, 0.58, 1.12);
    pad.translate(0, padR * 0.25, 0);
    pad.applyMatrix4(matAlign);
    const padStd = ensureStandardAttributes(pad);
    colorizeGeometryGradient(padStd, '#14532d', '#84cc16', rand, 0.06);
    parts.push(padStd);

    for (let f = 0; f < 6; f++) {
      const fAng = (f / 6) * Math.PI * 2 + 0.3;
      const fDist = padR * (0.25 + (f % 2) * 0.32);
      const fH = padR * (0.65 + (f % 3) * 0.22);
      const stalk = buildSmoothCurveTube(
        [
          new THREE.Vector3(Math.cos(fAng) * fDist, padR * 0.22, Math.sin(fAng) * fDist),
          new THREE.Vector3(Math.cos(fAng) * (fDist + padR * 0.14), fH * 0.72, Math.sin(fAng) * (fDist + padR * 0.14)),
          new THREE.Vector3(Math.cos(fAng) * (fDist + padR * 0.24), fH, Math.sin(fAng) * (fDist + padR * 0.24)),
        ],
        padR * 0.045,
        padR * 0.015,
        5,
        4,
        '#4d7c0f',
        '#bef264',
        rand,
        0,
        0,
        true
      );
      stalk.applyMatrix4(matAlign);
      parts.push(stalk);
    }
    return parts;
  }

  // Fallback: lanceolate blade or miniature dome
  const blade = buildCustomContouredLeaf(
    tipRadius * 1.8,
    0.48,
    1,
    0.25,
    colCore,
    colOuter,
    rand
  );
  blade.applyMatrix4(matAlign);
  parts.push(blade);
  return parts;
}

/**
 * Builds a complete, 100% welded 3D Spherical Bubble / Dandelion / Allium Umbel Head
 * ("spherical_bubble_umbel" / "Flor de Burbujas Iridiscentes")
 * Directly matching `image_290829a3.png`:
 *  1. Welded green/organic receptacle collar & pointed green involucre bracts at (0,0,0)
 *  2. Central glowing core receptacle sphere
 *  3. Dozens of 3D Fibonacci-distributed radiating filaments/pedicels (outer + inner layers)
 *  4. Translucent multi-hue iridescent bubbles & micro-droplets welded at every filament tip and along the rays
 */
function buildSculptedSphericalBubbleUmbel(
  el: CustomBotanicalElement,
  scale: number,
  colStem: string,
  colMain: string,
  colTip: string,
  colFlower: string,
  colAccent: string,
  densityMult: number,
  rand: () => number
): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const umbelR = Math.max(0.45, scale * 1.18);
  const sphereRatio = THREE.MathUtils.clamp(el.umbelSphereRatio ?? 0.88, 0.35, 1.0);
  const rayCount = Math.max(
    24,
    Math.min(
      110,
      Math.round((el.umbelRayCount || 68) * Math.min(1.3, Math.max(0.65, densityMult)))
    )
  );
  const tipScaleMult = THREE.MathUtils.clamp(el.tipBubbleScale ?? 1.05, 0.35, 2.2);
  const iridShift = THREE.MathUtils.clamp(el.iridescentShift ?? 0.85, 0.0, 1.0);
  const tipPrimitive = el.synthesizedTipPrimitive || 'iridescent_bubble';
  const golden = 2.39996323;

  // 1. Welded Green Receptacle Collar at (0,0,0) so the curved stalk fuses seamlessly into the umbel core
  const coreR = umbelR * 0.19;
  const collar = new THREE.LatheGeometry(
    [
      new THREE.Vector2(0.001, -coreR * 1.15),
      new THREE.Vector2(coreR * 0.55, -coreR * 0.55),
      new THREE.Vector2(coreR * 0.95, 0.0),
      new THREE.Vector2(coreR * 1.05, coreR * 0.55),
      new THREE.Vector2(0.001, coreR * 0.95),
    ],
    Math.max(8, Math.round(12 * densityMult))
  );
  const collarStd = ensureStandardAttributes(collar);
  colorizeGeometryGradient(collarStd, colStem, colMain, rand, 0.04);
  parts.push(collarStd);

  // 2. Pointed Involucre Calyx Bracts underneath the umbel collar (just like Allium / Dandelion sepals!)
  const bractCount = 7;
  for (let b = 0; b < bractCount; b++) {
    const bAng = (b / bractCount) * Math.PI * 2 + 0.15;
    const bract = buildCustomContouredLeaf(
      umbelR * 0.36,
      0.38,
      1,
      0.42,
      colStem,
      colMain,
      rand
    );
    const mBract = new THREE.Matrix4()
      .makeTranslation(Math.cos(bAng) * coreR * 0.45, -coreR * 0.25, Math.sin(bAng) * coreR * 0.45)
      .multiply(new THREE.Matrix4().makeRotationY(bAng))
      .multiply(new THREE.Matrix4().makeRotationX(1.22));
    bract.applyMatrix4(mBract);
    parts.push(bract);
  }

  // 3. Outer & Inner 3D Fibonacci Radiating Pedicel Rays + Tip Bubbles
  for (let i = 0; i < rayCount; i++) {
    // Fibonacci distribution spanning from top pole (y = +1) down to lower hemisphere based on sphereRatio
    const v = (i + 0.5) / rayCount;
    const minCosPhi = 1.0 - sphereRatio * 1.78; // at sphereRatio=0.88 -> minCosPhi = -0.56 (full 3D globe!)
    const cosPhi = 1.0 - v * (1.0 - minCosPhi);
    const sinPhi = Math.sqrt(Math.max(0.001, 1.0 - cosPhi * cosPhi));
    const theta = i * golden + (rand() - 0.5) * 0.08;

    const dir = new THREE.Vector3(
      Math.cos(theta) * sinPhi,
      cosPhi,
      Math.sin(theta) * sinPhi
    ).normalize();

    // Alternate slightly between outer full-length rays and inner 76%-length rays for lush 3D volume
    const isInnerLayer = i % 3 === 2;
    const rayLen =
      umbelR *
      (isInnerLayer ? 0.72 + rand() * 0.12 : 0.92 + rand() * 0.14);

    // Slight graceful gravity arch on lateral rays
    const midDir = dir
      .clone()
      .add(new THREE.Vector3(0, 0.12 * (1.0 - Math.abs(cosPhi)), 0))
      .normalize();

    const p0 = dir.clone().multiplyScalar(coreR * 0.45);
    const p1 = midDir.clone().multiplyScalar(rayLen * 0.54);
    const p2 = dir.clone().multiplyScalar(rayLen);

    const { colCore, colOuter, colHighlight } = computeIridescentSpectrumColor(
      colMain,
      colFlower,
      colAccent,
      i,
      rayCount,
      iridShift,
      dir
    );

    // Delicate glowing filament/pedicel connecting core to bubble tip
    const rayTube = buildSmoothCurveTube(
      [p0, p1, p2],
      umbelR * 0.016,
      umbelR * 0.007,
      5,
      4,
      colStem,
      colCore,
      rand,
      0,
      0,
      false
    );
    parts.push(rayTube);

    // Tip bubble / micro-part welded at p2
    const bubbleR =
      umbelR *
      (isInnerLayer ? 0.072 : 0.095) *
      tipScaleMult *
      (0.86 + rand() * 0.28);

    const tipParts = buildSynthesizedTipPrimitive(
      tipPrimitive,
      bubbleR,
      p2,
      dir,
      colCore,
      colOuter,
      colHighlight,
      densityMult,
      rand,
      el.petalOpenness ?? 0.72
    );
    for (const tp of tipParts) {
      parts.push(tp);
    }

    // Add tiny dewy micro-droplets midway along 40% of the outer rays (just like image_290829a3.png!)
    if (!isInnerLayer && i % 2 === 0) {
      const dewR = bubbleR * 0.34;
      const dewGeo = new THREE.IcosahedronGeometry(dewR, 0);
      dewGeo.translate(p1.x, p1.y, p1.z);
      const dewStd = ensureStandardAttributes(dewGeo);
      colorizeGeometryGradient(dewStd, colOuter, colHighlight, rand, 0.03);
      parts.push(dewStd);
    }
  }

  return parts;
}

/**
 * Builds a 3D Radiating Composite / Starburst / Protea / Sunflower Head
 * ("radiating_floret_head" / "layered_petal_starburst")
 */
function buildSculptedRadiatingFloretHead(
  el: CustomBotanicalElement,
  scale: number,
  colStem: string,
  colMain: string,
  colTip: string,
  colFlower: string,
  colAccent: string,
  densityMult: number,
  rand: () => number
): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const headR = Math.max(0.42, scale * 1.08);
  const iridShift = THREE.MathUtils.clamp(el.iridescentShift ?? 0.45, 0, 1);
  const golden = 2.39996323;

  // 1. Welded Green Involucre Cup at (0,0,0)
  const recep = new THREE.LatheGeometry(
    [
      new THREE.Vector2(0.001, -headR * 0.22),
      new THREE.Vector2(headR * 0.26, -headR * 0.08),
      new THREE.Vector2(headR * 0.56, headR * 0.06),
      new THREE.Vector2(headR * 0.48, headR * 0.16),
      new THREE.Vector2(0.001, headR * 0.18),
    ],
    12
  );
  const recepStd = ensureStandardAttributes(recep);
  colorizeGeometryGradient(recepStd, colStem, colMain, rand, 0.04);
  parts.push(recepStd);

  // 2. Central Domed Fibonacci Floret Disc
  const discCount = Math.max(18, Math.round(32 * Math.min(1.2, densityMult)));
  for (let d = 0; d < discCount; d++) {
    const u = (d + 0.5) / discCount;
    const r = Math.sqrt(u) * headR * 0.42;
    const ang = d * golden;
    const y = headR * 0.12 + Math.cos(u * Math.PI * 0.5) * headR * 0.18;
    const pos = new THREE.Vector3(Math.cos(ang) * r, y, Math.sin(ang) * r);
    const dir = new THREE.Vector3(Math.cos(ang) * 0.35, 1.0, Math.sin(ang) * 0.35).normalize();

    const { colCore, colOuter, colHighlight } = computeIridescentSpectrumColor(
      colFlower,
      colTip,
      colAccent,
      d,
      discCount,
      iridShift,
      dir
    );
    const tipParts = buildSynthesizedTipPrimitive(
      el.synthesizedTipPrimitive || 'iridescent_bubble',
      headR * 0.065 * (el.tipBubbleScale ?? 1.0),
      pos,
      dir,
      colCore,
      colOuter,
      colHighlight,
      densityMult,
      rand,
      el.petalOpenness ?? 0.72
    );
    parts.push(...tipParts);
  }

  // 3. Two Concentric Rings of Radiating Starburst Ray Petals
  const openness = THREE.MathUtils.clamp(el.petalOpenness ?? 0.75, 0, 1);
  const rayPetals = Math.max(14, Math.min(36, Math.round((el.umbelRayCount || 24) * 0.5)));
  for (let ring = 0; ring < 2; ring++) {
    const count = rayPetals + ring * 4;
    for (let i = 0; i < count; i++) {
      const ang = (i / count) * Math.PI * 2 + ring * 0.14;
      const pLen = headR * (ring === 0 ? 0.82 : 0.98);
      const tilt =
        ring === 0
          ? THREE.MathUtils.lerp(0.12, 1.15, openness)
          : THREE.MathUtils.lerp(0.24, 1.40, openness);
      const ringRad = headR * (0.14 + openness * 0.18);
      const petal = buildCustomContouredLeaf(
        pLen,
        0.34,
        1,
        THREE.MathUtils.lerp(-0.18, 0.34, openness),
        ring === 0 ? colFlower : colMain,
        ring === 0 ? colAccent : colTip,
        rand
      );
      const m = new THREE.Matrix4()
        .makeTranslation(Math.cos(ang) * ringRad, headR * 0.08, Math.sin(ang) * ringRad)
        .multiply(new THREE.Matrix4().makeRotationY(ang))
        .multiply(new THREE.Matrix4().makeRotationX(tilt));
      petal.applyMatrix4(m);
      parts.push(petal);
    }
  }

  return parts;
}

/**
 * Builds a 3D Hanging Bell / Lantern Raceme Cluster ("hanging_bell_cluster")
 */
function buildSculptedHangingBellCluster(
  el: CustomBotanicalElement,
  scale: number,
  colStem: string,
  colMain: string,
  colTip: string,
  colFlower: string,
  colAccent: string,
  densityMult: number,
  rand: () => number
): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const clusterR = Math.max(0.4, scale * 0.95);
  const bellCount = Math.max(5, Math.min(18, Math.round((el.umbelRayCount || 12) * 0.28)));
  const openness = THREE.MathUtils.clamp(el.petalOpenness ?? 0.68, 0, 1);
  const golden = 2.39996323;

  // Welded node hub at (0,0,0)
  const hub = new THREE.IcosahedronGeometry(clusterR * 0.14, 1);
  const hubStd = ensureStandardAttributes(hub);
  colorizeGeometryGradient(hubStd, colStem, colMain, rand, 0.03);
  parts.push(hubStd);

  for (let b = 0; b < bellCount; b++) {
    const yaw = b * golden;
    const rank = b / bellCount;
    const reach = clusterR * (0.22 + openness * 0.22 + rank * (0.35 + openness * 0.35));
    const drop = clusterR * (0.28 + rank * 0.52);

    const p0 = new THREE.Vector3(0, 0, 0);
    const p1 = new THREE.Vector3(Math.cos(yaw) * reach * 0.65, clusterR * 0.18, Math.sin(yaw) * reach * 0.65);
    const p2 = new THREE.Vector3(Math.cos(yaw) * reach, -drop, Math.sin(yaw) * reach);

    parts.push(
      buildSmoothCurveTube([p0, p1, p2], clusterR * 0.025, clusterR * 0.012, 6, 4, colStem, colMain, rand, 0, 0, false)
    );

    const bellParts = buildSynthesizedTipPrimitive(
      'cupped_bell_calyx',
      clusterR * (0.18 - rank * 0.04) * (el.tipBubbleScale ?? 1.0),
      p2,
      new THREE.Vector3(Math.cos(yaw) * (0.08 + openness * 0.18), -1.0, Math.sin(yaw) * (0.08 + openness * 0.18)).normalize(),
      colMain,
      colFlower,
      colAccent || colTip,
      densityMult,
      rand,
      openness
    );
    parts.push(...bellParts);
  }

  return parts;
}

/**
 * Builds a 3D Faceted Crystal Prism / Mineral-Botanical Crown ("crystal_prism_crown")
 */
function buildSculptedCrystalPrismCrown(
  el: CustomBotanicalElement,
  scale: number,
  colStem: string,
  colMain: string,
  colTip: string,
  colFlower: string,
  colAccent: string,
  densityMult: number,
  rand: () => number
): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const crownR = Math.max(0.4, scale * 0.95);
  const spireCount = Math.max(9, Math.min(32, Math.round((el.umbelRayCount || 18) * 0.45)));
  const golden = 2.39996323;
  const iridShift = THREE.MathUtils.clamp(el.iridescentShift ?? 0.75, 0, 1);

  const baseMatrix = new THREE.IcosahedronGeometry(crownR * 0.24, 1);
  const baseStd = ensureStandardAttributes(baseMatrix);
  colorizeGeometryGradient(baseStd, colStem, colMain, rand, 0.04);
  parts.push(baseStd);

  for (let s = 0; s < spireCount; s++) {
    const u = s / spireCount;
    const theta = s * golden;
    const phi = Math.sqrt(u) * Math.PI * 0.48;
    const dir = new THREE.Vector3(
      Math.cos(theta) * Math.sin(phi),
      Math.cos(phi),
      Math.sin(theta) * Math.sin(phi)
    ).normalize();

    const spireLen = crownR * (1.05 - u * 0.45) * (0.85 + rand() * 0.25);
    const spireR = spireLen * (0.16 + (1 - u) * 0.06);

    const { colCore, colOuter, colHighlight } = computeIridescentSpectrumColor(
      colMain,
      colFlower,
      colAccent || colTip,
      s,
      spireCount,
      iridShift,
      dir
    );

    const cyl = new THREE.CylinderGeometry(spireR * 0.85, spireR * 0.45, spireLen * 0.72, 6, 1);
    cyl.translate(0, spireLen * 0.36, 0);
    const tip = new THREE.ConeGeometry(spireR * 0.85, spireLen * 0.34, 6, 1);
    tip.translate(0, spireLen * 0.89, 0);

    const upVec = new THREE.Vector3(0, 1, 0);
    const q = new THREE.Quaternion().setFromUnitVectors(upVec, dir);
    const m = new THREE.Matrix4().makeRotationFromQuaternion(q);

    cyl.applyMatrix4(m);
    tip.applyMatrix4(m);

    const cylStd = ensureStandardAttributes(cyl);
    colorizeGeometryGradient(cylStd, colCore, colOuter, rand, 0.03);
    const tipStd = ensureStandardAttributes(tip);
    colorizeGeometryGradient(tipStd, colOuter, colHighlight, rand, 0.03);

    parts.push(cylStd, tipStd);
  }

  return parts;
}

/**
 * Builds a Custom 3D Revolved Lathe Chalice / Pitcher / Pod ("procedural_lathe_head")
 * directly from the AI's 6-point `latheProfileRadii` array!
 */
function buildSculptedProceduralLatheHead(
  el: CustomBotanicalElement,
  scale: number,
  colStem: string,
  colMain: string,
  colTip: string,
  colFlower: string,
  colAccent: string,
  densityMult: number,
  rand: () => number
): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const cupH = Math.max(0.45, scale * 1.15);
  const cupMaxR = Math.max(0.28, scale * 0.68);
  const rawRadii =
    Array.isArray(el.latheProfileRadii) && el.latheProfileRadii.length >= 4
      ? el.latheProfileRadii
      : [0.16, 0.68, 0.88, 0.56, 0.78, 0.92];

  const openness = THREE.MathUtils.clamp(el.petalOpenness ?? 0.65, 0, 1);
  const profilePts: THREE.Vector2[] = [new THREE.Vector2(0.001, -cupH * 0.12)];
  for (let i = 0; i < rawRadii.length; i++) {
    const t = i / (rawRadii.length - 1);
    const lipMult = Math.max(0.18, 1.0 + Math.pow(t, 1.3) * (openness - 0.65) * 1.15);
    const rNorm = THREE.MathUtils.clamp((Number(rawRadii[i]) || 0.5) * lipMult, 0.08, 1.55);
    profilePts.push(new THREE.Vector2(cupMaxR * rNorm, t * cupH));
  }
  // Inner lip return for thickness
  const topR = profilePts[profilePts.length - 1].x;
  profilePts.push(new THREE.Vector2(topR * 0.82, cupH * 0.92));
  profilePts.push(new THREE.Vector2(0.001, cupH * 0.32));

  const lathe = new THREE.LatheGeometry(profilePts, Math.max(14, Math.round(22 * densityMult)));
  const latheStd = ensureStandardAttributes(lathe);
  colorizeGeometryGradient(latheStd, colStem, colMain, rand, 0.05);
  parts.push(latheStd);

  // Inner emerging glowing pistils / bubbles from the chalice mouth
  const stamenCount = 7;
  for (let s = 0; s < stamenCount; s++) {
    const ang = (s / stamenCount) * Math.PI * 2;
    const sSpread = topR * (0.25 + openness * 0.35);
    const p0 = new THREE.Vector3(0, cupH * 0.35, 0);
    const p1 = new THREE.Vector3(Math.cos(ang) * sSpread * 0.6, cupH * 0.78, Math.sin(ang) * sSpread * 0.6);
    const p2 = new THREE.Vector3(Math.cos(ang) * sSpread, cupH * 1.18, Math.sin(ang) * sSpread);
    parts.push(
      buildSmoothCurveTube([p0, p1, p2], cupMaxR * 0.035, cupMaxR * 0.015, 6, 4, colMain, colFlower, rand, 0, 0, false)
    );
    const tipParts = buildSynthesizedTipPrimitive(
      el.synthesizedTipPrimitive || 'iridescent_bubble',
      cupMaxR * 0.11 * (el.tipBubbleScale ?? 1.0),
      p2,
      new THREE.Vector3(Math.cos(ang) * 0.35, 1.0, Math.sin(ang) * 0.35).normalize(),
      colFlower,
      colTip,
      colAccent,
      densityMult,
      rand,
      openness
    );
    parts.push(...tipParts);
  }

  return parts;
}

/**
 * Builds a single 3D Double-Surfaced Spline-Contoured Leaf / Petal / Bract blade
 * directly from the AI's `petalContourProfile` width control array plus 3D cupping,
 * helical twist, marginal waves, and midrib keel thickness.
 */
function buildCustomSplineContourBlade(
  contourRadii: number[],
  bladeLen: number,
  maxHalfWidth: number,
  cupping: number,
  twistRad: number,
  marginWave: number,
  longArch: number,
  colBase: string,
  colTip: string,
  colAccent: string,
  segsU: number,
  segsV: number
): THREE.BufferGeometry {
  const safePts =
    Array.isArray(contourRadii) && contourRadii.length >= 4
      ? contourRadii
      : [0.12, 0.58, 0.96, 0.78, 0.92, 0.44, 0.08];

  const spline2D = new THREE.SplineCurve(
    safePts.map((w, idx) => {
      const t = idx / (safePts.length - 1);
      const clampedW = THREE.MathUtils.clamp(Number(w) || 0.4, 0.02, 1.45);
      return new THREE.Vector2(t, clampedW);
    })
  );

  const cols = segsV + 1;
  const rows = segsU + 1;
  const positions: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  const cBase = new THREE.Color(colBase);
  const cTip = new THREE.Color(colTip);
  const cAcc = new THREE.Color(colAccent);
  const tmpCol = new THREE.Color();

  // Upper surface (layer 0) & Lower cambered surface (layer 1) so the blade has physical 3D thickness
  for (let side = 0; side < 2; side++) {
    const signSide = side === 0 ? 1 : -1;
    for (let r = 0; r < rows; r++) {
      const u = r / segsU;
      const profileW = THREE.MathUtils.clamp(spline2D.getPointAt(u).y, 0.015, 1.45);
      const yBase = u * bladeLen;
      const zArch = Math.sin(u * Math.PI * 0.85) * longArch * bladeLen * 0.28 - u * u * longArch * bladeLen * 0.16;
      const halfW = maxHalfWidth * profileW;
      const twistHere = u * twistRad;
      const cosT = Math.cos(twistHere);
      const sinT = Math.sin(twistHere);

      for (let c = 0; c < cols; c++) {
        const vNorm = (c / segsV) * 2 - 1; // -1 to +1
        const absV = Math.abs(vNorm);
        const edgeFade = Math.max(0, 1 - absV * absV);

        const xLocal = vNorm * halfW;
        // Transverse cupping + marginal wave
        const cupZ = cupping * (absV * absV) * maxHalfWidth * 0.55 * Math.sin(u * Math.PI * 0.92 + 0.15);
        const waveZ =
          marginWave *
          Math.sin(u * Math.PI * 5.0 + vNorm * 2.2) *
          Math.pow(absV, 1.35) *
          maxHalfWidth *
          0.45;
        // Midrib keel ridge + thickness taper to sharp edge
        const keelHalfThick =
          maxHalfWidth * (0.045 * (1 - u * 0.6) * edgeFade + 0.018 * (1 - absV));
        const zLocal = zArch + cupZ + waveZ + signSide * keelHalfThick;

        // Apply axial helical twist around Y
        const rx = xLocal * cosT - zLocal * sinT;
        const rz = xLocal * sinT + zLocal * cosT;

        positions.push(rx, yBase, rz);
        uvs.push(c / segsV, u);

        // Rich gradient: base -> main/tip -> accented margins & apex
        tmpCol.copy(cBase).lerp(cTip, Math.pow(u, 0.85));
        if (absV > 0.55 || u > 0.78) {
          tmpCol.lerp(cAcc, Math.min(0.65, (absV - 0.55) * 0.9 + Math.max(0, u - 0.78) * 1.4));
        }
        if (side === 1) {
          tmpCol.multiplyScalar(0.84);
        }
        colors.push(tmpCol.r, tmpCol.g, tmpCol.b);
      }
    }
  }

  const sideVertCount = rows * cols;
  for (let r = 0; r < segsU; r++) {
    for (let c = 0; c < segsV; c++) {
      const a0 = r * cols + c;
      const b0 = a0 + 1;
      const d0 = (r + 1) * cols + c;
      const c0 = d0 + 1;
      indices.push(a0, d0, b0, b0, d0, c0);

      const a1 = sideVertCount + a0;
      const b1 = sideVertCount + b0;
      const d1 = sideVertCount + d0;
      const c1 = sideVertCount + c0;
      indices.push(a1, b1, d1, b1, c1, d1);
    }
  }

  // Stitch left & right perimeter seams
  for (let r = 0; r < segsU; r++) {
    const uL0 = r * cols;
    const uL1 = (r + 1) * cols;
    const lL0 = sideVertCount + uL0;
    const lL1 = sideVertCount + uL1;
    indices.push(uL0, lL0, uL1, lL0, lL1, uL1);

    const uR0 = r * cols + segsV;
    const uR1 = (r + 1) * cols + segsV;
    const lR0 = sideVertCount + uR0;
    const lR1 = sideVertCount + uR1;
    indices.push(uR0, uR1, lR0, lR0, uR1, lR1);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return ensureStandardAttributes(geo);
}

/**
 * Builds a complete Multi-Whorl Corona / Rosette of 3D Spline-Contoured Blades or Petals
 * ("custom_spline_leaf_crown" / "spline_petal_corona").
 */
function buildSculptedSplineLeafCrown(
  el: CustomBotanicalElement,
  scale: number,
  colStem: string,
  colMain: string,
  colTip: string,
  colFlower: string,
  colAccent: string,
  densityMult: number,
  rand: () => number
): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const contour =
    Array.isArray(el.petalContourProfile) && el.petalContourProfile.length >= 4
      ? el.petalContourProfile
      : [0.14, 0.62, 0.98, 0.72, 0.94, 0.42, 0.08];
  const cupping = THREE.MathUtils.clamp(el.petalCupping ?? 0.38, -0.65, 0.95);
  const twistRad = THREE.MathUtils.degToRad(THREE.MathUtils.clamp(el.petalTwistDeg ?? 14, 0, 95));
  const marginWave = THREE.MathUtils.clamp(el.petalMarginWave ?? 0.16, 0, 0.5);
  const openness = THREE.MathUtils.clamp(el.petalOpenness ?? 0.52, 0, 1.0);
  const whorls = Math.max(1, Math.min(4, Math.round(el.padLayers ? el.padLayers * 0.45 : 2)));
  const petalsPerWhorl = Math.max(4, Math.min(12, el.lobeCount || 6));

  // Welded central receptacle / calyx base
  const recepR = Math.max(0.06, scale * 0.16);
  const recep = new THREE.SphereGeometry(recepR, 10, 8);
  recep.scale(1.0, 0.68, 1.0);
  colorizeGeometryByHeight(recep, colStem, colMain, -recepR, recepR);
  parts.push(ensureStandardAttributes(recep));

  const segsU = Math.max(7, Math.round(11 * Math.min(1.3, densityMult)));
  const segsV = Math.max(5, Math.round(7 * Math.min(1.3, densityMult)));

  for (let w = 0; w < whorls; w++) {
    const wFrac = whorls === 1 ? 0.5 : w / (whorls - 1);
    const countHere = Math.max(4, petalsPerWhorl - w);
    const bladeLen = scale * (0.95 - wFrac * 0.25);
    const maxHalfW = bladeLen * (0.28 + (1 - wFrac) * 0.08);
    const tiltAngle = THREE.MathUtils.lerp(
      0.08 + openness * 1.16,
      0.02 + openness * 0.62,
      wFrac
    );

    for (let i = 0; i < countHere; i++) {
      const yaw = (i / countHere) * Math.PI * 2 + w * 0.52 + (rand() - 0.5) * 0.12;
      const blade = buildCustomSplineContourBlade(
        contour,
        bladeLen * (0.92 + rand() * 0.16),
        maxHalfW,
        cupping * (1 - openness * 0.45),
        twistRad * (i % 2 === 0 ? 1 : -1),
        marginWave,
        THREE.MathUtils.lerp(-0.18, 0.68, openness),
        w === 0 ? colMain : colFlower,
        colTip,
        colAccent,
        segsU,
        segsV
      );
      const m = new THREE.Matrix4()
        .makeRotationY(yaw)
        .multiply(new THREE.Matrix4().makeRotationX(tiltAngle))
        .multiply(new THREE.Matrix4().makeTranslation(0, recepR * 0.25, recepR * 0.45));
      blade.applyMatrix4(m);
      parts.push(blade);
    }
  }

  // Optional central synthesized tip primitive / anther spire
  if (el.synthesizedTipPrimitive && el.synthesizedTipPrimitive !== 'none') {
    const tipParts = buildSynthesizedTipPrimitive(
      el.synthesizedTipPrimitive,
      recepR * 0.65 * (el.tipBubbleScale ?? 1.0),
      new THREE.Vector3(0, recepR * 1.15, 0),
      new THREE.Vector3(0, 1, 0),
      colFlower,
      colTip,
      colAccent,
      densityMult,
      rand,
      openness
    );
    parts.push(...tipParts);
  }

  return parts;
}

/**
 * Builds AI-Synthesized Basal Foliage welded around the stem base at y = 0:
 * - 'long_grass_blades': Long arching V-channeled green grass/allium blades + stem-clasping leaves (matches image_290829a3.png!)
 * - 'broad_rosette_leaves': Broad contoured rosette leaves around the base
 * - 'spiny_succulent_claws': Thick succulent basal claws
 * - 'fern_fiddleheads': Coiled basal fern fronds
 * - 'baby_umbel_sprouts': Miniature secondary stalks with baby bubble/dome buds at the base
 */
function buildSynthesizedBasalFoliage(
  el: CustomBotanicalElement,
  H: number,
  R: number,
  mainStemCurve: THREE.CatmullRomCurve3 | null,
  colStem: string,
  colStemDark: string,
  colMain: string,
  colTip: string,
  colFlower: string,
  colAccent: string,
  densityMult: number,
  rand: () => number
): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const basalType =
    el.synthesizedBasalFoliage ||
    (el.stemStructure === 'herbaceous_curved_stalk' || el.canopyElement === 'spherical_bubble_umbel'
      ? 'long_grass_blades'
      : 'none');

  if (basalType === 'none') return parts;

  // Resolve a rich chlorophyll green for basal foliage blades
  const colBladeBase = resolveStemColor(colStemDark, true);
  const colBladeMid = resolveStemColor(colStem, true);
  const cBladeTipObj = new THREE.Color(colBladeMid).lerp(new THREE.Color('#84cc16'), 0.42);
  const colBladeTip = '#' + cBladeTipObj.getHexString();

  const bladeCount = Math.max(
    8,
    Math.min(
      30,
      Math.round((el.basalLeafCount || 16) * Math.min(1.3, Math.max(0.7, densityMult)))
    )
  );
  const lenMult = THREE.MathUtils.clamp(el.basalLeafLength ?? 1.0, 0.35, 2.0);
  const golden = 2.39996323;

  if (basalType === 'long_grass_blades' || basalType === 'spiny_succulent_claws') {
    const isSpiny = basalType === 'spiny_succulent_claws';
    for (let b = 0; b < bladeCount; b++) {
      const u = b / Math.max(1, bladeCount - 1);
      const yaw = b * golden + (rand() - 0.5) * 0.18;
      const radDir = new THREE.Vector3(Math.cos(yaw), 0, Math.sin(yaw));

      const bladeH = H * (0.22 + (1.0 - u * 0.55) * 0.26) * lenMult * (0.88 + rand() * 0.22);
      const spread = H * (0.11 + u * 0.24) * lenMult * (0.88 + rand() * 0.22);
      const baseDist = R * (0.18 + u * 0.55);

      const bPts = [
        new THREE.Vector3(radDir.x * baseDist, -0.03, radDir.z * baseDist),
        new THREE.Vector3(radDir.x * (baseDist + spread * 0.35), bladeH * 0.42, radDir.z * (baseDist + spread * 0.35)),
        new THREE.Vector3(radDir.x * (baseDist + spread * 0.76), bladeH * 0.82, radDir.z * (baseDist + spread * 0.76)),
        new THREE.Vector3(radDir.x * (baseDist + spread * 1.08), bladeH * (0.94 - u * 0.14), radDir.z * (baseDist + spread * 1.08)),
      ];

      const halfW = R * (isSpiny ? 0.32 : 0.21) * (1.0 - u * 0.25);
      const thick = halfW * (isSpiny ? 0.52 : 0.28);

      const bladeGeos = buildSculptedFleshyClawBlade(
        bPts,
        radDir,
        halfW,
        thick,
        8,
        colBladeBase,
        colBladeMid,
        colBladeTip,
        colBladeTip,
        isSpiny ? 0.65 : 0.0,
        0.8,
        rand
      );
      parts.push(...bladeGeos);
    }

    // Also add 3 stem-clasping cauline leaves rising directly off the lower 30% of the curved stalk (just like image_290829a3.png!)
    if (mainStemCurve && !isSpiny) {
      for (let c = 0; c < 3; c++) {
        const tStem = 0.12 + c * 0.09;
        const pt = mainStemCurve.getPointAt(tStem);
        const yaw = c * 2.15 + 0.4;
        const radDir = new THREE.Vector3(Math.cos(yaw), 0, Math.sin(yaw));
        const cLen = H * (0.24 - c * 0.04) * lenMult;
        const cSpread = cLen * 0.62;
        const cPts = [
          pt.clone(),
          new THREE.Vector3(pt.x + radDir.x * cSpread * 0.38, pt.y + cLen * 0.45, pt.z + radDir.z * cSpread * 0.38),
          new THREE.Vector3(pt.x + radDir.x * cSpread * 0.82, pt.y + cLen * 0.85, pt.z + radDir.z * cSpread * 0.82),
          new THREE.Vector3(pt.x + radDir.x * cSpread * 1.05, pt.y + cLen * 0.92, pt.z + radDir.z * cSpread * 1.05),
        ];
        const cGeos = buildSculptedFleshyClawBlade(
          cPts,
          radDir,
          R * 0.19,
          R * 0.05,
          7,
          colBladeBase,
          colBladeMid,
          colBladeTip,
          colBladeTip,
          0,
          0.5,
          rand
        );
        parts.push(...cGeos);
      }
    }
    return parts;
  }

  if (basalType === 'broad_rosette_leaves' || basalType === 'fern_fiddleheads') {
    for (let b = 0; b < bladeCount; b++) {
      const yaw = b * golden;
      const u = b / bladeCount;
      const lLen = H * (0.24 + (1 - u) * 0.16) * lenMult;
      const leaf = buildCustomContouredLeaf(
        lLen,
        basalType === 'fern_fiddleheads' ? 0.38 : 0.68,
        basalType === 'fern_fiddleheads' ? 5 : 3,
        0.42,
        colBladeBase,
        colBladeTip,
        rand
      );
      const m = new THREE.Matrix4()
        .makeTranslation(Math.cos(yaw) * R * 0.25, R * 0.15, Math.sin(yaw) * R * 0.25)
        .multiply(new THREE.Matrix4().makeRotationY(yaw))
        .multiply(new THREE.Matrix4().makeRotationX(0.65 + u * 0.45));
      leaf.applyMatrix4(m);
      parts.push(leaf);
    }
    return parts;
  }

  if (basalType === 'baby_umbel_sprouts') {
    const sproutCount = Math.max(3, Math.min(8, Math.round(bladeCount * 0.35)));
    for (let s = 0; s < sproutCount; s++) {
      const yaw = s * golden + 0.3;
      const sH = H * (0.18 + (s % 3) * 0.07) * lenMult;
      const dist = R * (0.65 + s * 0.22);
      const p0 = new THREE.Vector3(Math.cos(yaw) * dist * 0.5, -0.03, Math.sin(yaw) * dist * 0.5);
      const p1 = new THREE.Vector3(Math.cos(yaw) * dist * 0.85, sH * 0.55, Math.sin(yaw) * dist * 0.85);
      const p2 = new THREE.Vector3(Math.cos(yaw) * dist, sH, Math.sin(yaw) * dist);
      parts.push(
        buildSmoothCurveTube([p0, p1, p2], R * 0.14, R * 0.07, 6, 5, colBladeBase, colBladeMid, rand, 4, 0.08, false)
      );
      const tipParts = buildSynthesizedTipPrimitive(
        el.synthesizedTipPrimitive || 'iridescent_bubble',
        R * 0.26,
        p2,
        new THREE.Vector3(0, 1, 0),
        colMain,
        colFlower,
        colAccent,
        densityMult,
        rand,
        el.petalOpenness ?? 0.72
      );
      parts.push(...tipParts);
    }
  }

  return parts;
}

/**
 * Builds a lush, organic 3D Bryophyte Moss Mantle ("Manto de Musgo Briófito y Pelusa")
 * clinging directly to the dorsal ridges, bends, and helical bark crevices of a twisted woody trunk
 * and its weathered branch stubs (matches `download_85c90a64.png` — zero giant flat leaves!).
 */
function buildSculptedBarkMossMantle(
  stemCurves: { curve: THREE.CatmullRomCurve3; rStart: number; rEnd: number }[],
  colMainHex: string,
  colTipHex: string,
  leafScale: number,
  densityMult: number,
  coverageMult: number,
  rand: () => number
): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const { deepMoss, midMoss, tipMoss } = resolveMossPalette(colMainHex, colTipHex);
  const golden = 2.39996323;
  const scaleFactor = THREE.MathUtils.clamp(leafScale * 0.85, 0.55, 1.55);

  stemCurves.forEach(({ curve, rStart, rEnd }, curveIdx) => {
    const isPrimaryTrunk = curveIdx === 0;
    const bandCount = isPrimaryTrunk
      ? Math.max(18, Math.round(28 * Math.min(1.4, densityMult) * coverageMult))
      : Math.max(5, Math.round(8 * Math.min(1.3, densityMult) * coverageMult));
    const frames = computeTwistFreeFrames(curve, bandCount);

    for (let i = 1; i < bandCount; i++) {
      const t = i / bandCount;
      // Leave the very tip of broken deadwood stubs bare weathered wood, just like download_85c90a64.png!
      if (!isPrimaryTrunk && t > 0.72) continue;
      if (isPrimaryTrunk && t > 0.94) continue;

      const pt = curve.getPointAt(t);
      const T = frames.tangents[i];
      const N = frames.normals[i];
      const B = frames.binormals[i];
      const rHere = THREE.MathUtils.lerp(rStart, rEnd, Math.pow(t, 0.78));

      // Helical-dorsal strip angle so moss hugs the upper ridges and winds along the S-curve bark furrows
      // while leaving 50-60% of the furrowed brown wood exposed on the sides/underside!
      const helicalCenterAng =
        Math.sin(t * Math.PI * 2.6 + curveIdx * 1.1) * 1.1 + 0.35;
      const cushionsHere = isPrimaryTrunk ? 3 : 2;

      for (let c = 0; c < cushionsHere; c++) {
        const angOffset =
          ((c - (cushionsHere - 1) * 0.5) / Math.max(1, cushionsHere)) * 1.45 +
          (rand() - 0.5) * 0.25;
        const theta = helicalCenterAng + angOffset;

        const radDir = new THREE.Vector3(
          Math.cos(theta) * N.x + Math.sin(theta) * B.x,
          Math.cos(theta) * N.y + Math.sin(theta) * B.y,
          Math.cos(theta) * N.z + Math.sin(theta) * B.z
        ).normalize();

        // Bias slightly toward the upper (+Y) dorsal ridge of the bend
        const mossNormal = radDir
          .clone()
          .add(new THREE.Vector3(0, 0.28, 0))
          .normalize();

        // Embed cushion base at rHere * 0.84 so it is 100% fused into the bark ridges
        const cushionPos = pt.clone().addScaledVector(radDir, rHere * 0.84);
        const cRx = Math.max(0.025, rHere * (0.34 + rand() * 0.16) * scaleFactor);
        const cRy = Math.max(0.018, rHere * (0.18 + rand() * 0.09) * scaleFactor);
        const cRz = Math.max(0.028, rHere * (0.42 + rand() * 0.18) * scaleFactor);

        const pillow = buildSculptedCloudCushionCore(
          cRx,
          cRy,
          cRz,
          deepMoss,
          midMoss,
          tipMoss,
          Math.min(1.1, densityMult),
          rand
        );

        const qAlign = new THREE.Quaternion().setFromUnitVectors(
          new THREE.Vector3(0, 1, 0),
          mossNormal
        );
        const mPillow = new THREE.Matrix4().makeRotationFromQuaternion(qAlign);
        mPillow.setPosition(cushionPos.x, cushionPos.y, cushionPos.z);
        pillow.applyMatrix4(mPillow);
        parts.push(pillow);

        // Sprout dense 3D bryophyte gametophyte micro-tufts / fuzzy moss filaments across each cushion
        const tuftCount = Math.max(
          4,
          Math.round((isPrimaryTrunk ? 7 : 4) * Math.min(1.3, densityMult))
        );
        for (let f = 0; f < tuftCount; f++) {
          const fAng = (f + i * 3) * golden + (rand() - 0.5) * 0.35;
          const jitterAlong = (rand() - 0.5) * cRz * 1.15;
          const jitterSide = (rand() - 0.5) * cRx * 1.15;

          const tangentOrtho = new THREE.Vector3()
            .crossVectors(mossNormal, T)
            .normalize();

          const basePt = cushionPos
            .clone()
            .addScaledVector(T, jitterAlong)
            .addScaledVector(tangentOrtho, jitterSide)
            .addScaledVector(mossNormal, cRy * 0.35);

          const isFringeBeard = f === 0 && rand() > 0.35;
          const shootLen = Math.max(
            0.03,
            rHere * (isFringeBeard ? 0.42 + rand() * 0.25 : 0.22 + rand() * 0.22) * scaleFactor
          );

          const shootDir = isFringeBeard
            ? radDir
                .clone()
                .multiplyScalar(0.55)
                .add(new THREE.Vector3(0, -0.75, 0))
                .normalize()
            : mossNormal
                .clone()
                .addScaledVector(T, Math.cos(fAng) * 0.38)
                .addScaledVector(tangentOrtho, Math.sin(fAng) * 0.38)
                .normalize();

          const curlDir = shootDir
            .clone()
            .add(
              new THREE.Vector3(
                (rand() - 0.5) * 0.45,
                isFringeBeard ? -0.35 : 0.28,
                (rand() - 0.5) * 0.45
              )
            )
            .normalize();

          const p0 = basePt.clone().addScaledVector(mossNormal, -cRy * 0.25);
          const p1 = basePt.clone().addScaledVector(shootDir, shootLen * 0.55);
          const p2 = p1.clone().addScaledVector(curlDir, shootLen * 0.52);

          parts.push(
            buildSmoothCurveTube(
              [p0, p1, p2],
              Math.max(0.007, rHere * 0.068),
              Math.max(0.0018, rHere * 0.012),
              4,
              4,
              f % 3 === 0 ? deepMoss : midMoss,
              tipMoss,
              rand,
              0,
              0,
              true
            )
          );
        }
      }
    }
  });

  return parts;
}

/**
 * 13. SCI-FI BIOLUMINESCENT PLASMA GLOBES WITH ORBITAL RINGS ("scifi_biolum_plasma_globes")
 */
function buildSciFiPlasmaGlobeCluster(
  el: CustomBotanicalElement,
  scale: number,
  colStem: string,
  colMain: string,
  colTip: string,
  colFlower: string,
  colAccent: string,
  densityMult: number,
  rand: () => number
): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const globeR = Math.max(0.32, scale * 0.72);
  const detail = densityMult >= 0.95 ? 2 : 1;

  // 1. Welded Biomechanical / Botanical Calyx Socket at (0,0,0)
  const calyx = new THREE.LatheGeometry(
    [
      new THREE.Vector2(0.001, -globeR * 0.25),
      new THREE.Vector2(globeR * 0.32, -globeR * 0.08),
      new THREE.Vector2(globeR * 0.56, globeR * 0.16),
      new THREE.Vector2(globeR * 0.42, globeR * 0.28),
      new THREE.Vector2(0.001, globeR * 0.32),
    ],
    10
  );
  const calStd = ensureStandardAttributes(calyx);
  colorizeGeometryGradient(calStd, colStem, colMain, rand, 0.04);
  parts.push(calStd);

  // 2. Main Translucent Plasma Globe Sphere
  const centerY = globeR * 0.88;
  const outerGlobe = new THREE.IcosahedronGeometry(globeR, detail + 1);
  outerGlobe.translate(0, centerY, 0);
  const outerStd = ensureStandardAttributes(outerGlobe);
  colorizeGeometryGradient(outerStd, colMain, colTip, rand, 0.05);
  parts.push(outerStd);

  // 3. Inner Glowing Energy Core
  const innerCore = new THREE.IcosahedronGeometry(globeR * 0.52, detail);
  innerCore.translate(0, centerY, 0);
  const coreStd = ensureStandardAttributes(innerCore);
  colorizeGeometryGradient(coreStd, colFlower, colAccent, rand, 0.03);
  parts.push(coreStd);

  // 4. Three Intersecting Orbital Energy Rings + Meridian Ribs cradling the globe
  const ringCount = Math.max(2, Math.min(4, Math.round((el.lobeCount || 3) * 0.6)));
  for (let r = 0; r < ringCount; r++) {
    const ring = new THREE.TorusGeometry(
      globeR * (1.14 + r * 0.08),
      globeR * 0.048,
      6,
      Math.max(16, Math.round(24 * densityMult))
    );
    ring.rotateX(0.55 + r * 0.78);
    ring.rotateY((r / ringCount) * Math.PI);
    ring.translate(0, centerY, 0);
    const rStd = ensureStandardAttributes(ring);
    colorizeGeometryGradient(rStd, colTip, colAccent, rand, 0.03);
    parts.push(rStd);
  }

  // 5. Satellite Tethered Plasma Micro-Orbs
  const satCount = Math.max(3, Math.min(7, el.spiralArms ? el.spiralArms + 2 : 5));
  for (let s = 0; s < satCount; s++) {
    const sAng = (s / satCount) * Math.PI * 2 + 0.3;
    const sDist = globeR * (1.35 + (s % 2) * 0.25);
    const sY = centerY + (s % 2 === 0 ? 1 : -1) * globeR * 0.35;
    const p0 = new THREE.Vector3(Math.cos(sAng) * globeR * 0.4, globeR * 0.22, Math.sin(sAng) * globeR * 0.4);
    const p1 = new THREE.Vector3(Math.cos(sAng) * sDist * 0.75, (globeR * 0.22 + sY) * 0.5, Math.sin(sAng) * sDist * 0.75);
    const p2 = new THREE.Vector3(Math.cos(sAng) * sDist, sY, Math.sin(sAng) * sDist);

    parts.push(
      buildSmoothCurveTube([p0, p1, p2], globeR * 0.045, globeR * 0.02, 6, 4, colStem, colTip, rand, 0, 0, false)
    );
    const satOrb = new THREE.IcosahedronGeometry(globeR * 0.28, detail);
    satOrb.translate(p2.x, p2.y, p2.z);
    const satStd = ensureStandardAttributes(satOrb);
    colorizeGeometryGradient(satStd, colTip, colAccent, rand, 0.04);
    parts.push(satStd);
  }

  return parts;
}

/**
 * 14. SCI-FI VORONOI OVA BALLOONS / FLOATING GAS BLADDERS ("scifi_voronoi_ova_balloons")
 */
function buildSciFiVoronoiOvaBalloons(
  el: CustomBotanicalElement,
  scale: number,
  colStem: string,
  colMain: string,
  colTip: string,
  colFlower: string,
  colAccent: string,
  densityMult: number,
  rand: () => number
): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const balloonCount = Math.max(3, Math.min(7, Math.round((el.padLayers || 5) * 0.85)));
  const golden = 2.39996323;

  // Basal vascular hub welded at (0,0,0)
  const hub = buildSculptedCloudCushionCore(
    scale * 0.28,
    scale * 0.18,
    scale * 0.28,
    colStem,
    colMain,
    colTip,
    densityMult,
    rand
  );
  parts.push(hub);

  for (let b = 0; b < balloonCount; b++) {
    const isCenter = b === 0;
    const yaw = b * golden;
    const spread = isCenter ? 0 : scale * (0.45 + (b / balloonCount) * 0.38);
    const liftY = scale * (isCenter ? 0.95 : 0.65 + (1 - b / balloonCount) * 0.35);
    const bRadius = scale * (isCenter ? 0.48 : 0.34 + (1 - b / balloonCount) * 0.1);

    const p0 = new THREE.Vector3(0, 0, 0);
    const p1 = new THREE.Vector3(Math.cos(yaw) * spread * 0.6, liftY * 0.45, Math.sin(yaw) * spread * 0.6);
    const p2 = new THREE.Vector3(Math.cos(yaw) * spread, liftY, Math.sin(yaw) * spread);

    // Tether cord
    parts.push(
      buildSmoothCurveTube([p0, p1, p2], bRadius * 0.16, bRadius * 0.09, 8, 5, colStem, colMain, rand, 4, 0.1, false)
    );

    // Egg/balloon bladder
    const bladder = new THREE.IcosahedronGeometry(bRadius, densityMult >= 0.9 ? 3 : 2);
    const posAttr = bladder.attributes.position;
    for (let i = 0; i < posAttr.count; i++) {
      let x = posAttr.getX(i);
      let y = posAttr.getY(i);
      let z = posAttr.getZ(i);
      const ang = Math.atan2(z, x);
      // 8 raised meridian vascular ribs along the balloon
      const rib = 1.0 + 0.06 * Math.pow(Math.abs(Math.cos(ang * 4)), 1.5);
      // Teardrop / balloon elongation
      const yScale = y > 0 ? 1.28 : 1.05;
      posAttr.setXYZ(i, x * rib, y * yScale + bRadius * 0.85, z * rib);
    }
    bladder.computeVertexNormals();
    bladder.translate(p2.x, p2.y, p2.z);
    const bStd = ensureStandardAttributes(bladder);
    colorizeGeometryGradient(bStd, colMain, b % 2 === 0 ? colTip : colFlower, rand, 0.05);
    parts.push(bStd);

    // Apical gas-vent sphincter ring at top of each balloon
    const vent = new THREE.TorusGeometry(bRadius * 0.24, bRadius * 0.06, 6, 12);
    vent.rotateX(Math.PI * 0.5);
    vent.translate(p2.x, p2.y + bRadius * 2.1, p2.z);
    const vStd = ensureStandardAttributes(vent);
    colorizeGeometryGradient(vStd, colFlower, colAccent, rand, 0.03);
    parts.push(vStd);
  }

  return parts;
}

/**
 * 15. FENESTRATED TROPICAL MONSTERA LEAVES ("fenestrated_monstera_leaves")
 */
function buildFenestratedMonsteraCluster(
  el: CustomBotanicalElement,
  scale: number,
  colStem: string,
  colMain: string,
  colTip: string,
  colFlower: string,
  densityMult: number,
  rand: () => number
): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const leafCount = Math.max(5, Math.min(10, Math.round(7 * Math.min(1.3, densityMult))));
  const golden = 2.39996323;

  const core = buildSculptedCloudCushionCore(
    scale * 0.24,
    scale * 0.16,
    scale * 0.24,
    colStem,
    colMain,
    colTip,
    densityMult,
    rand
  );
  parts.push(core);

  for (let l = 0; l < leafCount; l++) {
    const yaw = l * golden + (rand() - 0.5) * 0.18;
    const tilt = 0.42 + (l / leafCount) * 0.65;
    const leafLen = scale * (0.85 + (1 - l / leafCount) * 0.35);
    const petioleLen = leafLen * 0.35;

    // Sturdy petiole + central midrib rachis
    const rachisPts = [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, petioleLen, -petioleLen * 0.15),
      new THREE.Vector3(0, petioleLen + leafLen * 0.85, -leafLen * 0.38),
    ];
    const rachis = buildSmoothCurveTube(
      rachisPts,
      leafLen * 0.042,
      leafLen * 0.012,
      7,
      5,
      colStem,
      colTip,
      rand,
      0,
      0,
      true
    );

    // 5 paired lateral fenestrated ribbon-lobes per Monstera leaf (creating authentic 3D slits between lobes!)
    const lobePairs = 5;
    const leafSubGeos: THREE.BufferGeometry[] = [rachis];
    for (let p = 0; p < lobePairs; p++) {
      const v = (p + 0.5) / lobePairs;
      const yPos = petioleLen + v * leafLen * 0.82;
      const zPos = -petioleLen * 0.15 - Math.pow(v, 1.4) * leafLen * 0.24;
      const env = Math.sin(Math.pow(v, 0.7) * Math.PI);
      const lobeLen = leafLen * 0.46 * env;

      for (const side of [-1, 1]) {
        const lobe = buildCustomContouredLeaf(
          lobeLen,
          0.36,
          1,
          0.18,
          colMain,
          p % 2 === 0 ? colTip : colFlower,
          rand
        );
        const mLobe = new THREE.Matrix4()
          .makeTranslation(0, yPos, zPos)
          .multiply(new THREE.Matrix4().makeRotationZ(side * (1.12 - v * 0.32)))
          .multiply(new THREE.Matrix4().makeRotationX(-0.12));
        lobe.applyMatrix4(mLobe);
        leafSubGeos.push(lobe);
      }
    }

    const mOrient = new THREE.Matrix4()
      .makeRotationY(yaw)
      .multiply(new THREE.Matrix4().makeRotationX(tilt));
    for (const sg of leafSubGeos) {
      sg.applyMatrix4(mOrient);
      parts.push(sg);
    }
  }

  return parts;
}

/**
 * 16. PALMATE 5-7 POINTED STAR LEAVES ("palmate_maple_star_leaves")
 */
function buildPalmateMapleStarCluster(
  el: CustomBotanicalElement,
  scale: number,
  colStem: string,
  colMain: string,
  colTip: string,
  colFlower: string,
  densityMult: number,
  rand: () => number
): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const leafCount = Math.max(6, Math.min(12, Math.round(8 * Math.min(1.3, densityMult))));
  const fingerCount = Math.max(5, Math.min(9, (el.lobeCount || 5) | 1));
  const golden = 2.39996323;

  const core = buildSculptedCloudCushionCore(
    scale * 0.25,
    scale * 0.18,
    scale * 0.25,
    colStem,
    colMain,
    colTip,
    densityMult,
    rand
  );
  parts.push(core);

  for (let l = 0; l < leafCount; l++) {
    const yaw = l * golden + (rand() - 0.5) * 0.2;
    const tilt = 0.35 + (l / leafCount) * 0.72;
    const petioleLen = scale * 0.28;
    const palmLeafLen = scale * (0.58 + (1 - l / leafCount) * 0.22);

    const petiole = buildSmoothCurveTube(
      [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, petioleLen, -petioleLen * 0.12)],
      palmLeafLen * 0.04,
      palmLeafLen * 0.025,
      4,
      4,
      colStem,
      colMain,
      rand,
      0,
      0,
      false
    );
    const mOrient = new THREE.Matrix4()
      .makeRotationY(yaw)
      .multiply(new THREE.Matrix4().makeRotationX(tilt));
    petiole.applyMatrix4(mOrient);
    parts.push(petiole);

    // Radiating palmate fingers from petiole apex
    for (let f = 0; f < fingerCount; f++) {
      const fNorm = (f / (fingerCount - 1)) * 2 - 1; // -1 .. +1
      const spreadAng = fNorm * 1.18;
      const fingerScale = 1.0 - Math.abs(fNorm) * 0.38;
      const finger = buildCustomContouredLeaf(
        palmLeafLen * fingerScale,
        0.38,
        3,
        0.22,
        colMain,
        l % 2 === 0 ? colTip : colFlower,
        rand
      );
      const mF = new THREE.Matrix4()
        .makeTranslation(0, petioleLen, -petioleLen * 0.12)
        .multiply(new THREE.Matrix4().makeRotationZ(spreadAng));
      finger.applyMatrix4(mF);
      finger.applyMatrix4(mOrient);
      parts.push(finger);
    }
  }

  return parts;
}

/**
 * 17. ARCHED PINNATE FERN & PALM FRONDS ("pinnate_fern_palm_fronds")
 */
function buildPinnateFernPalmFronds(
  el: CustomBotanicalElement,
  scale: number,
  colStem: string,
  colMain: string,
  colTip: string,
  colFlower: string,
  densityMult: number,
  rand: () => number
): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const frondCount = Math.max(5, Math.min(10, Math.round(7 * Math.min(1.3, densityMult))));
  const golden = 2.39996323;

  const crownBase = buildSculptedCloudCushionCore(
    scale * 0.24,
    scale * 0.18,
    scale * 0.24,
    colStem,
    colMain,
    colTip,
    densityMult,
    rand
  );
  parts.push(crownBase);

  for (let f = 0; f < frondCount; f++) {
    const yaw = (f / frondCount) * Math.PI * 2 + (rand() - 0.5) * 0.18;
    const frondLen = scale * (1.05 + (f % 2) * 0.22);
    const rPts = [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(Math.cos(yaw) * frondLen * 0.38, frondLen * 0.42, Math.sin(yaw) * frondLen * 0.38),
      new THREE.Vector3(Math.cos(yaw) * frondLen * 0.78, frondLen * 0.34, Math.sin(yaw) * frondLen * 0.78),
      new THREE.Vector3(Math.cos(yaw) * frondLen * 1.05, frondLen * 0.05, Math.sin(yaw) * frondLen * 1.05),
    ];
    parts.push(
      buildSmoothCurveTube(rPts, frondLen * 0.032, frondLen * 0.006, 10, 5, colStem, colMain, rand, 0, 0, true)
    );

    const rCurve = new THREE.CatmullRomCurve3(rPts);
    const pinnaePairs = Math.max(7, Math.round(11 * Math.min(1.25, densityMult)));
    const sideVec = new THREE.Vector3(-Math.sin(yaw), 0, Math.cos(yaw));

    for (let p = 1; p <= pinnaePairs; p++) {
      const t = p / (pinnaePairs + 1);
      const pt = rCurve.getPointAt(t);
      const tang = rCurve.getTangentAt(t).normalize();
      const env = Math.sin(Math.pow(t, 0.65) * Math.PI);
      const pinnaLen = frondLen * 0.28 * env;

      for (const side of [-1, 1]) {
        const pinnaDir = sideVec
          .clone()
          .multiplyScalar(side * 0.85)
          .addScaledVector(tang, 0.42)
          .add(new THREE.Vector3(0, 0.18, 0))
          .normalize();
        const pinna = buildCustomContouredLeaf(
          pinnaLen,
          0.32,
          1,
          0.25,
          colMain,
          t > 0.6 ? colTip : colFlower,
          rand
        );
        const qP = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), pinnaDir);
        const mP = new THREE.Matrix4().makeRotationFromQuaternion(qP);
        mP.setPosition(pt.x, pt.y, pt.z);
        pinna.applyMatrix4(mP);
        parts.push(pinna);
      }
    }
  }

  return parts;
}

/**
 * 18. SUCCULENT FLESHY ROSETTES WITH SPINES ("succulent_fleshy_rosettes")
 */
function buildSucculentFleshyRosetteCluster(
  el: CustomBotanicalElement,
  scale: number,
  colStem: string,
  colMain: string,
  colTip: string,
  colFlower: string,
  densityMult: number,
  rand: () => number
): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const bladeCount = Math.max(12, Math.min(24, Math.round(16 * Math.min(1.25, densityMult))));
  const openness = THREE.MathUtils.clamp(el.petalOpenness ?? 0.65, 0, 1);
  const golden = 2.39996323;
  const colBase = '#' + new THREE.Color(colMain).multiplyScalar(0.45).getHexString();

  for (let b = 0; b < bladeCount; b++) {
    const u = b / Math.max(1, bladeCount - 1);
    const yaw = b * golden;
    const radDir = new THREE.Vector3(Math.cos(yaw), 0, Math.sin(yaw));
    const topY = scale * (0.98 - openness * 0.28 - u * 0.28);
    const spread = scale * (0.10 + openness * 0.22 + u * (0.28 + openness * 0.52));

    const bPts = [
      new THREE.Vector3(radDir.x * scale * 0.06, 0, radDir.z * scale * 0.06),
      new THREE.Vector3(radDir.x * spread * 0.65, topY * 0.42, radDir.z * spread * 0.65),
      new THREE.Vector3(radDir.x * spread, topY * 0.82, radDir.z * spread),
      new THREE.Vector3(radDir.x * spread * 0.88, topY, radDir.z * spread * 0.88),
    ];
    const bladeGeos = buildSculptedFleshyClawBlade(
      bPts,
      radDir,
      scale * (0.18 + (1 - u * 0.3) * 0.08),
      scale * 0.09,
      8,
      colBase,
      colMain,
      colTip,
      colFlower,
      Math.max(0.45, el.thornDensity ?? 0.65),
      el.thornLength || 0.9,
      rand
    );
    parts.push(...bladeGeos);
  }

  return parts;
}

/**
 * 19. CONIFER NEEDLE BRUSHES & PINE CONES ("conifer_needle_brushes")
 */
function buildConiferNeedleBrushCluster(
  el: CustomBotanicalElement,
  scale: number,
  colStem: string,
  colMain: string,
  colTip: string,
  colFlower: string,
  densityMult: number,
  rand: () => number
): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const golden = 2.39996323;

  // Central woody shoot
  const shootLen = scale * 0.95;
  parts.push(
    buildSmoothCurveTube(
      [new THREE.Vector3(0, -shootLen * 0.1, 0), new THREE.Vector3(0, shootLen, 0)],
      scale * 0.07,
      scale * 0.025,
      6,
      5,
      colStem,
      colStem,
      rand,
      4,
      0.1,
      true
    )
  );

  // 36+ radial 3D needle fascicles
  const needleCount = Math.max(24, Math.round(38 * Math.min(1.3, densityMult)));
  for (let n = 0; n < needleCount; n++) {
    const t = (n + 0.5) / needleCount;
    const y = t * shootLen * 0.92;
    const ang = n * golden;
    const nLen = scale * (0.38 + (1 - t * 0.35) * 0.22);
    const nDir = new THREE.Vector3(
      Math.cos(ang) * 0.78,
      0.48 + t * 0.35,
      Math.sin(ang) * 0.78
    ).normalize();

    const needle = new THREE.ConeGeometry(scale * 0.018, nLen, 4, 1);
    needle.translate(0, nLen * 0.48, 0);
    const qN = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), nDir);
    const mN = new THREE.Matrix4().makeRotationFromQuaternion(qN);
    mN.setPosition(0, y, 0);
    needle.applyMatrix4(mN);
    const nStd = ensureStandardAttributes(needle);
    colorizeGeometryGradient(nStd, colMain, colTip, rand, 0.04);
    parts.push(nStd);
  }

  // 2 Sculpted Woody Pine Cones hanging near the base of the brush
  for (let c = 0; c < 2; c++) {
    const cAng = c * Math.PI + 0.5;
    const coneH = scale * 0.34;
    const coneR = scale * 0.14;
    const pCone = new THREE.LatheGeometry(
      [
        new THREE.Vector2(0.001, 0),
        new THREE.Vector2(coneR * 0.85, coneH * 0.25),
        new THREE.Vector2(coneR, coneH * 0.55),
        new THREE.Vector2(coneR * 0.65, coneH * 0.85),
        new THREE.Vector2(0.001, coneH),
      ],
      7
    );
    pCone.rotateX(2.4);
    pCone.rotateY(cAng);
    pCone.translate(Math.cos(cAng) * scale * 0.08, shootLen * 0.28, Math.sin(cAng) * scale * 0.08);
    const pcStd = ensureStandardAttributes(pCone);
    colorizeGeometryGradient(pcStd, colStem, colFlower, rand, 0.05);
    parts.push(pcStd);
  }

  return parts;
}

/**
 * 20. IMPERIAL LOTUS / MAGNOLIA COROLLA CROWN WITH SEED TORUS ("lotus_magnolia_corolla_crown")
 */
function buildLotusMagnoliaCorollaCrown(
  el: CustomBotanicalElement,
  scale: number,
  colStem: string,
  colMain: string,
  colTip: string,
  colFlower: string,
  colAccent: string,
  densityMult: number,
  rand: () => number
): THREE.BufferGeometry[] {
  // Respect user's petalOpenness slider smoothly from 0 (closed lotus bud) to 1 (wide open bloom)
  const openness = THREE.MathUtils.clamp(el.petalOpenness ?? 0.82, 0, 1);
  const openEl: CustomBotanicalElement = {
    ...el,
    cupDepth: el.cupDepth ?? 0.25,
    petalOpenness: openness,
    lobeCount: Math.max(6, el.lobeCount || 10),
  };
  const parts = buildSculptedFlowerCorollaOrBud(
    openEl,
    scale * 1.12,
    colStem,
    colMain,
    colTip,
    colFlower,
    densityMult,
    rand
  );

  // Add the iconic Sacred Lotus central flat-topped obconical seed-pod receptacle torus + embedded seeds
  const podScale = THREE.MathUtils.lerp(0.55, 1.0, openness);
  const podH = scale * 0.42 * podScale;
  const podTopR = scale * 0.28 * podScale;
  const seedTorus = new THREE.LatheGeometry(
    [
      new THREE.Vector2(0.001, 0),
      new THREE.Vector2(podTopR * 0.45, podH * 0.35),
      new THREE.Vector2(podTopR * 0.92, podH * 0.88),
      new THREE.Vector2(podTopR, podH * 0.98),
      new THREE.Vector2(0.001, podH),
    ],
    12
  );
  const stStd = ensureStandardAttributes(seedTorus);
  colorizeGeometryGradient(stStd, colStem, colAccent || '#facc15', rand, 0.03);
  parts.push(stStd);

  // 9 Embedded Golden Lotus Seeds protruding from the flat top of the receptacle
  const golden = 2.39996323;
  for (let s = 0; s < 9; s++) {
    const r = s === 0 ? 0 : Math.sqrt(s / 9) * podTopR * 0.72;
    const ang = s * golden;
    const seed = new THREE.IcosahedronGeometry(podTopR * 0.16, 1);
    seed.scale(0.85, 1.35, 0.85);
    seed.translate(Math.cos(ang) * r, podH * 1.02, Math.sin(ang) * r);
    const sStd = ensureStandardAttributes(seed);
    colorizeGeometryGradient(sStd, colAccent || '#facc15', '#fef08a', rand, 0.02);
    parts.push(sStd);
  }

  return parts;
}

/**
 * 21. PASSIONFLOWER RADIAL FILAMENT CORONA ("passionflower_filament_corona")
 */
function buildPassionflowerFilamentCorona(
  el: CustomBotanicalElement,
  scale: number,
  colStem: string,
  colMain: string,
  colTip: string,
  colFlower: string,
  colAccent: string,
  densityMult: number,
  rand: () => number
): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const rad = Math.max(0.35, scale * 0.85);

  // 1. Welded Calyx Cup
  const calyx = new THREE.LatheGeometry(
    [
      new THREE.Vector2(0.001, -rad * 0.18),
      new THREE.Vector2(rad * 0.25, 0),
      new THREE.Vector2(rad * 0.38, rad * 0.14),
      new THREE.Vector2(0.001, rad * 0.18),
    ],
    10
  );
  const calStd = ensureStandardAttributes(calyx);
  colorizeGeometryGradient(calStd, colStem, colMain, rand, 0.03);
  parts.push(calStd);

  // 2. Perianth Sepals & Petals (open from closed bud at 0 to reflexed starburst at 1)
  const openness = THREE.MathUtils.clamp(el.petalOpenness ?? 0.78, 0, 1);
  const petalCount = Math.max(6, Math.min(14, el.lobeCount ? Math.round(el.lobeCount * 1.25) : 10));
  const petalTiltBase = THREE.MathUtils.lerp(0.12, 1.32, openness);
  const petalTipCup = THREE.MathUtils.lerp(-rad * 0.24, rad * 0.14, openness);
  for (let p = 0; p < petalCount; p++) {
    const pAng = (p / petalCount) * Math.PI * 2;
    const petal = buildSculptedCuppedPetal(
      rad * 0.95,
      rad * 0.36,
      rad * 0.18 * THREE.MathUtils.lerp(1.1, 0.65, openness),
      petalTipCup,
      colMain,
      p % 2 === 0 ? colTip : colFlower,
      colTip,
      rand
    );
    const mP = new THREE.Matrix4()
      .makeTranslation(0, rad * 0.1, 0)
      .multiply(new THREE.Matrix4().makeRotationY(pAng))
      .multiply(new THREE.Matrix4().makeRotationX(petalTiltBase + (p % 2) * 0.1 * openness));
    petal.applyMatrix4(mP);
    parts.push(petal);
  }

  // 3. Radial Halo Corona of Wavy Filaments
  const coronaRays = Math.max(20, Math.round(32 * Math.min(1.3, densityMult)));
  for (let c = 0; c < coronaRays; c++) {
    const cAng = (c / coronaRays) * Math.PI * 2;
    const rLen = rad * (0.68 + (c % 2) * 0.16);
    const horizSpread = THREE.MathUtils.lerp(0.24, 1.04, openness);
    const midY = rad * THREE.MathUtils.lerp(0.55, 0.25, openness);
    const tipY = rad * THREE.MathUtils.lerp(0.76, 0.16, openness);
    const pts = [
      new THREE.Vector3(Math.cos(cAng) * rad * 0.12, rad * 0.15, Math.sin(cAng) * rad * 0.12),
      new THREE.Vector3(Math.cos(cAng) * rLen * 0.55 * horizSpread, midY, Math.sin(cAng) * rLen * 0.55 * horizSpread),
      new THREE.Vector3(Math.cos(cAng) * rLen * horizSpread, tipY, Math.sin(cAng) * rLen * horizSpread),
    ];
    parts.push(
      buildSmoothCurveTube(pts, rad * 0.022, rad * 0.008, 6, 4, colFlower, colAccent, rand, 0, 0, true)
    );
  }

  // 4. Central Elevated Androgynophore Column + Ovary Globe + 3 Stigmas
  const colH = rad * 0.58;
  parts.push(
    buildSmoothCurveTube(
      [new THREE.Vector3(0, rad * 0.1, 0), new THREE.Vector3(0, colH, 0)],
      rad * 0.065,
      rad * 0.045,
      5,
      6,
      colStem,
      colAccent,
      rand,
      0,
      0,
      false
    )
  );
  const ovary = new THREE.IcosahedronGeometry(rad * 0.15, 1);
  ovary.scale(0.9, 1.25, 0.9);
  ovary.translate(0, colH, 0);
  const ovStd = ensureStandardAttributes(ovary);
  colorizeGeometryGradient(ovStd, colMain, colAccent, rand, 0.03);
  parts.push(ovStd);

  for (let s = 0; s < 3; s++) {
    const sAng = (s / 3) * Math.PI * 2;
    const stPts = [
      new THREE.Vector3(0, colH + rad * 0.1, 0),
      new THREE.Vector3(Math.cos(sAng) * rad * 0.28, colH + rad * 0.24, Math.sin(sAng) * rad * 0.28),
    ];
    parts.push(
      buildSmoothCurveTube(stPts, rad * 0.028, rad * 0.055, 5, 5, colFlower, colAccent, rand, 0, 0, false)
    );
  }

  return parts;
}

/**
 * 22. HELICONIA / BIRD OF PARADISE KEEL BRACT CANDELABRA ("heliconia_bract_candelabra")
 */
function buildHeliconiaBractCandelabra(
  el: CustomBotanicalElement,
  scale: number,
  colStem: string,
  colMain: string,
  colTip: string,
  colFlower: string,
  colAccent: string,
  densityMult: number,
  rand: () => number
): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const bractCount = Math.max(4, Math.min(8, Math.round(el.padLayers || 6)));
  const totalH = scale * 1.15;

  // Zigzag rachis spine
  const rachisPts: THREE.Vector3[] = [new THREE.Vector3(0, -scale * 0.1, 0)];
  for (let b = 0; b < bractCount; b++) {
    const t = (b + 0.5) / bractCount;
    const side = b % 2 === 0 ? 1 : -1;
    rachisPts.push(new THREE.Vector3(side * scale * 0.08, t * totalH, 0));
  }
  parts.push(
    buildSmoothCurveTube(rachisPts, scale * 0.065, scale * 0.028, 12, 6, colStem, colMain, rand, 4, 0.1, true)
  );

  // Boat-shaped keel bracts alternating left/right + protruding nectar florets (spread controlled by petalOpenness)
  const openness = THREE.MathUtils.clamp(el.petalOpenness ?? 0.65, 0, 1);
  for (let b = 0; b < bractCount; b++) {
    const t = (b + 0.4) / bractCount;
    const side = b % 2 === 0 ? 1 : -1;
    const bLen = scale * (0.68 - t * 0.22);
    const origin = new THREE.Vector3(side * scale * 0.06, t * totalH, 0);
    const horizFactor = THREE.MathUtils.lerp(0.35, 1.05, openness);
    const liftFactor = THREE.MathUtils.lerp(0.75, 0.32, openness);
    const radDir = new THREE.Vector3(side * horizFactor, liftFactor, 0).normalize();
    const bPts = [
      origin,
      origin.clone().addScaledVector(radDir, bLen * 0.52),
      origin.clone().add(new THREE.Vector3(side * bLen * (0.36 + openness * 0.62), bLen * (0.72 - openness * 0.28), 0)),
    ];
    const bractGeos = buildSculptedFleshyClawBlade(
      bPts,
      new THREE.Vector3(0, -1, 0),
      bLen * 0.22,
      bLen * 0.14,
      8,
      colStem,
      colMain,
      colTip,
      colAccent,
      0,
      0,
      rand
    );
    parts.push(...bractGeos);

    // 2 Pointed Bird-of-Paradise florets emerging from inside the boat bract
    for (let f = 0; f < 2; f++) {
      const fLen = bLen * (0.32 + openness * 0.22 + f * 0.1);
      const floret = buildCustomContouredLeaf(fLen, 0.26, 1, -0.2, colFlower, colAccent, rand);
      const mF = new THREE.Matrix4()
        .makeTranslation(
          origin.x + side * bLen * (0.18 + openness * 0.22 + f * 0.12),
          origin.y + bLen * (0.28 - openness * 0.06),
          0
        )
        .multiply(new THREE.Matrix4().makeRotationZ(-side * (THREE.MathUtils.lerp(0.12, 0.48, openness) + f * 0.22 * openness)));
      floret.applyMatrix4(mF);
      parts.push(floret);
    }
  }

  return parts;
}

/**
 * 23. DEHISCENT SEED PODS, CONES & GLOWING SEEDS ("dehiscent_seed_pods_coronas")
 */
function buildDehiscentSeedPodsAndCoronas(
  el: CustomBotanicalElement,
  scale: number,
  colStem: string,
  colMain: string,
  colTip: string,
  colFlower: string,
  colAccent: string,
  densityMult: number,
  rand: () => number
): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const podCount = Math.max(3, Math.min(6, Math.round((el.padLayers || 4) * 0.9)));
  const golden = 2.39996323;

  const hub = buildSculptedCloudCushionCore(
    scale * 0.22,
    scale * 0.15,
    scale * 0.22,
    colStem,
    colMain,
    colTip,
    densityMult,
    rand
  );
  parts.push(hub);

  for (let p = 0; p < podCount; p++) {
    const pYaw = p * golden;
    const pTilt = 0.25 + (p / podCount) * 0.55;
    const podScale = scale * (0.52 + (1 - p / podCount) * 0.18);

    const mPod = new THREE.Matrix4()
      .makeRotationY(pYaw)
      .multiply(new THREE.Matrix4().makeRotationX(pTilt))
      .multiply(new THREE.Matrix4().makeTranslation(0, scale * 0.12, 0));

    // 4 Split Dehiscent Woody Husk Valves curling open with petalOpenness
    const openness = THREE.MathUtils.clamp(el.petalOpenness ?? 0.65, 0, 1);
    const valves = 4;
    for (let v = 0; v < valves; v++) {
      const vAng = (v / valves) * Math.PI * 2;
      const husk = buildSculptedCuppedPetal(
        podScale,
        podScale * 0.48,
        podScale * 0.28,
        THREE.MathUtils.lerp(-podScale * 0.14, podScale * 0.24, openness),
        colStem,
        colMain,
        colTip,
        rand
      );
      husk.rotateX(THREE.MathUtils.lerp(0.06, 0.92, openness));
      husk.rotateY(vAng);
      husk.applyMatrix4(mPod);
      parts.push(husk);
    }

    // Cluster of 6 Glossy Seeds exposed inside the split capsule
    for (let s = 0; s < 6; s++) {
      const sAng = s * golden;
      const sR = podScale * (s === 0 ? 0 : 0.18);
      const sY = podScale * (0.35 + (s % 3) * 0.16);
      const seed = new THREE.IcosahedronGeometry(podScale * 0.15, 1);
      seed.scale(0.88, 1.25, 0.88);
      seed.translate(Math.cos(sAng) * sR, sY, Math.sin(sAng) * sR);
      seed.applyMatrix4(mPod);
      const sStd = ensureStandardAttributes(seed);
      colorizeGeometryGradient(sStd, colFlower, colAccent, rand, 0.03);
      parts.push(sStd);
    }
  }

  return parts;
}

/**
 * 24. CARNIVOROUS NEPENTHES PITCHER TRAPS WITH PERISTOME & OPERCULUM ("carnivorous_nepenthes_pitchers")
 */
function buildCarnivorousNepenthesPitchers(
  el: CustomBotanicalElement,
  scale: number,
  colStem: string,
  colMain: string,
  colTip: string,
  colFlower: string,
  colAccent: string,
  densityMult: number,
  rand: () => number
): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const pitcherCount = Math.max(2, Math.min(5, Math.round((el.spiralArms || 3))));
  const golden = 2.39996323;

  const baseCushion = buildSculptedCloudCushionCore(
    scale * 0.22,
    scale * 0.14,
    scale * 0.22,
    colStem,
    colMain,
    colTip,
    densityMult,
    rand
  );
  parts.push(baseCushion);

  for (let p = 0; p < pitcherCount; p++) {
    const yaw = p * golden;
    const pH = scale * (0.78 + (p === 0 ? 0.18 : 0));
    const pR = pH * 0.34;
    const offsetX = p === 0 ? 0 : Math.cos(yaw) * scale * 0.42;
    const offsetZ = p === 0 ? 0 : Math.sin(yaw) * scale * 0.42;
    const offsetY = p === 0 ? 0 : -scale * 0.12;

    // Curved tendril connecting base to bottom of pitcher
    if (p > 0) {
      parts.push(
        buildSmoothCurveTube(
          [
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(offsetX * 0.6, offsetY - pH * 0.18, offsetZ * 0.6),
            new THREE.Vector3(offsetX, offsetY, offsetZ),
          ],
          pR * 0.14,
          pR * 0.12,
          8,
          5,
          colStem,
          colMain,
          rand,
          0,
          0,
          false
        )
      );
    }

    // Sculpted Pitcher Body (swollen digestive belly -> narrow waist -> flared mouth)
    const bodyLathe = new THREE.LatheGeometry(
      [
        new THREE.Vector2(0.001, 0),
        new THREE.Vector2(pR * 0.65, pH * 0.12),
        new THREE.Vector2(pR * 1.05, pH * 0.36),
        new THREE.Vector2(pR * 0.76, pH * 0.68),
        new THREE.Vector2(pR * 0.92, pH * 0.94),
        new THREE.Vector2(pR * 0.78, pH * 0.96),
        new THREE.Vector2(pR * 0.55, pH * 0.25),
        new THREE.Vector2(0.001, pH * 0.22),
      ],
      Math.max(10, Math.round(14 * densityMult))
    );
    bodyLathe.translate(offsetX, offsetY, offsetZ);
    const bStd = ensureStandardAttributes(bodyLathe);
    colorizeGeometryGradient(bStd, colMain, colTip, rand, 0.05);
    parts.push(bStd);

    // Ribbed Peristome Collar Torus around the pitcher mouth
    const peristome = new THREE.TorusGeometry(pR * 0.88, pR * 0.15, 8, 18);
    peristome.rotateX(Math.PI * 0.5 - 0.18);
    peristome.translate(offsetX, offsetY + pH * 0.95, offsetZ);
    const perStd = ensureStandardAttributes(peristome);
    colorizeGeometryGradient(perStd, colFlower, colAccent, rand, 0.04);
    parts.push(perStd);

    // Overhanging Operculum Lid above the mouth
    const lid = buildSculptedCuppedPetal(
      pR * 1.45,
      pR * 1.25,
      pR * 0.35,
      -pR * 0.45,
      colFlower,
      colTip,
      colAccent,
      rand
    );
    const mLid = new THREE.Matrix4()
      .makeTranslation(offsetX, offsetY + pH * 0.96, offsetZ - pR * 0.78)
      .multiply(new THREE.Matrix4().makeRotationX(0.95));
    lid.applyMatrix4(mLid);
    parts.push(lid);
  }

  return parts;
}

/**
 * 25. CONICAL FLORAL SPIKE / DENSE BRACT RACEME ("conical_floral_spike")
 */
function buildConicalFloralSpike(
  el: CustomBotanicalElement,
  scale: number,
  colStem: string,
  colMain: string,
  colTip: string,
  colFlower: string,
  colAccent: string,
  densityMult: number,
  rand: () => number
): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const openness = THREE.MathUtils.clamp(el.petalOpenness ?? 0.58, 0, 1);
  const layers = Math.max(6, Math.min(14, Math.round((el.padLayers || 8) * 1.15)));
  const spikeH = scale * 1.45;
  const maxR = scale * 0.46;

  // Central rachis axis
  parts.push(
    buildSmoothCurveTube(
      [new THREE.Vector3(0, -spikeH * 0.08, 0), new THREE.Vector3(0, spikeH, 0)],
      maxR * 0.22,
      maxR * 0.05,
      10,
      6,
      colStem,
      colMain,
      rand,
      4,
      0.08,
      true
    )
  );

  const golden = 2.39996323;
  const bractCount = Math.max(18, Math.round(layers * 4.5 * Math.min(1.2, densityMult)));
  for (let i = 0; i < bractCount; i++) {
    const t = i / Math.max(1, bractCount - 1);
    const y = t * spikeH * 0.94;
    const yaw = i * golden;
    const envelope = Math.sin(t * Math.PI * 0.85 + 0.22) * (1 - t * 0.42);
    const bLen = maxR * (0.48 + envelope * 0.72);
    const tilt = THREE.MathUtils.lerp(0.28, 1.08, openness) + (1 - t) * 0.25;
    const bract = buildSculptedCuppedPetal(
      bLen,
      bLen * 0.62,
      bLen * 0.24,
      bLen * THREE.MathUtils.lerp(-0.18, 0.16, openness),
      colMain,
      colFlower,
      t > 0.72 ? colAccent : colTip,
      rand
    );
    const m = new THREE.Matrix4()
      .makeTranslation(0, y, 0)
      .multiply(new THREE.Matrix4().makeRotationY(yaw))
      .multiply(new THREE.Matrix4().makeRotationX(tilt));
    bract.applyMatrix4(m);
    parts.push(bract);
  }
  return parts;
}

/**
 * 26. TERRACED PAGODA STACKED FUNGI / BRACT CAPS ("terraced_pagoda_caps")
 */
function buildTerracedPagodaCaps(
  el: CustomBotanicalElement,
  scale: number,
  colStem: string,
  colMain: string,
  colTip: string,
  colFlower: string,
  colAccent: string,
  densityMult: number,
  rand: () => number
): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const tiers = Math.max(4, Math.min(9, Math.round(el.padLayers || 6)));
  const totalH = scale * 1.45;
  const baseR = scale * 0.78;

  parts.push(
    buildSmoothCurveTube(
      [new THREE.Vector3(0, -totalH * 0.08, 0), new THREE.Vector3(0, totalH * 0.96, 0)],
      baseR * 0.24,
      baseR * 0.1,
      10,
      7,
      colStem,
      colMain,
      rand,
      5,
      0.1,
      false
    )
  );

  for (let i = 0; i < tiers; i++) {
    const t = i / Math.max(1, tiers - 1);
    const tierR = baseR * (1.0 - t * 0.62) * (0.92 + rand() * 0.14);
    const tierY = t * totalH * 0.88 + scale * 0.14;
    const domeH = tierR * (0.34 + (el.capDomeHeight ?? 0.45) * 0.35);

    const disc = new THREE.LatheGeometry(
      [
        new THREE.Vector2(0.001, -domeH * 0.2),
        new THREE.Vector2(tierR * 0.42, -domeH * 0.1),
        new THREE.Vector2(tierR * 0.96, 0),
        new THREE.Vector2(tierR, domeH * 0.22),
        new THREE.Vector2(tierR * 0.65, domeH * 0.72),
        new THREE.Vector2(0.001, domeH),
      ],
      Math.max(12, Math.round(18 * densityMult))
    );
    const pos = disc.attributes.position as THREE.BufferAttribute;
    for (let v = 0; v < pos.count; v++) {
      const vx = pos.getX(v);
      const vz = pos.getZ(v);
      const rNorm = Math.hypot(vx, vz) / Math.max(0.001, tierR);
      if (rNorm > 0.5) {
        const ang = Math.atan2(vz, vx);
        pos.setY(v, pos.getY(v) + Math.sin(ang * 7 + i) * domeH * 0.14 * rNorm);
      }
    }
    disc.computeVertexNormals();
    disc.translate((rand() - 0.5) * baseR * 0.08, tierY, (rand() - 0.5) * baseR * 0.08);
    const dStd = ensureStandardAttributes(disc);
    colorizeGeometryGradient(dStd, colMain, i === tiers - 1 ? colAccent : colTip, rand, 0.05);
    parts.push(dStd);

    // Glowing rim spores under each tier
    const rimRing = new THREE.TorusGeometry(tierR * 0.78, tierR * 0.04, 5, 16);
    rimRing.rotateX(Math.PI * 0.5);
    rimRing.translate(0, tierY - domeH * 0.04, 0);
    const rStd = ensureStandardAttributes(rimRing);
    colorizeGeometryGradient(rStd, colFlower, colAccent, rand, 0.03);
    parts.push(rStd);
  }
  return parts;
}

/**
 * 27. CURLED WITCH-HAT MUSHROOM CAP WITH 3D WARTS ("curled_witchhat_mushroom_cap")
 */
function buildCurledWitchhatMushroomCap(
  el: CustomBotanicalElement,
  scale: number,
  colStem: string,
  colMain: string,
  colTip: string,
  colFlower: string,
  colAccent: string,
  densityMult: number,
  rand: () => number
): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const capR = scale * 0.72;
  const coneH = scale * (1.15 + (el.capDomeHeight ?? 0.65) * 0.55);

  // Bell base flared skirt + curled spiral horn tip
  const spinePts: THREE.Vector3[] = [];
  const steps = 18;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const curl = Math.pow(Math.max(0, t - 0.42) / 0.58, 1.8) * Math.PI * 1.45;
    const x = Math.sin(curl) * capR * 0.48 * Math.pow(t, 1.5);
    const y = Math.pow(t, 0.78) * coneH - Math.max(0, Math.cos(curl) < 0 ? Math.abs(Math.cos(curl)) * capR * 0.22 : 0);
    const z = (1 - Math.cos(curl)) * capR * 0.24 * t;
    spinePts.push(new THREE.Vector3(x, y, z));
  }
  const curve = new THREE.CatmullRomCurve3(spinePts);
  const segs = Math.max(18, Math.round(24 * densityMult));
  const radSegs = Math.max(12, Math.round(16 * densityMult));
  const frames = computeTwistFreeFrames(curve, segs);

  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const colLow = new THREE.Color(colMain);
  const colMid = new THREE.Color(colFlower);
  const colTop = new THREE.Color(colTip);
  const tempC = new THREE.Color();

  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const pt = curve.getPointAt(t);
    const N = frames.normals[i];
    const B = frames.binormals[i];
    // Flared bell rim near t=0..0.18 tapering smoothly to curled whip apex
    const radius =
      t < 0.08
        ? capR * THREE.MathUtils.lerp(0.88, 1.0, t / 0.08)
        : capR * Math.pow(1 - (t - 0.08) / 0.92, 1.45);
    tempC.copy(t < 0.5 ? colLow : colMid).lerp(t < 0.5 ? colMid : colTop, (t % 0.5) * 2.0);
    for (let j = 0; j <= radSegs; j++) {
      const th = (j / radSegs) * Math.PI * 2;
      const flute = t < 0.35 ? 1 + Math.sin(th * 9) * 0.09 * (1 - t / 0.35) : 1;
      const rx = radius * flute;
      positions.push(
        pt.x + (Math.cos(th) * N.x + Math.sin(th) * B.x) * rx,
        pt.y + (Math.cos(th) * N.y + Math.sin(th) * B.y) * rx,
        pt.z + (Math.cos(th) * N.z + Math.sin(th) * B.z) * rx
      );
      colors.push(tempC.r, tempC.g, tempC.b);
    }
  }
  const stride = radSegs + 1;
  for (let i = 0; i < segs; i++) {
    for (let j = 0; j < radSegs; j++) {
      const a = i * stride + j;
      const b = a + stride;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const capGeo = new THREE.BufferGeometry();
  capGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  capGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  capGeo.setIndex(indices);
  capGeo.computeVertexNormals();
  parts.push(ensureStandardAttributes(capGeo));

  // Sub-cap stem collar at (0,0,0)
  const collar = new THREE.CylinderGeometry(capR * 0.24, capR * 0.16, capR * 0.24, 10);
  collar.translate(0, capR * 0.04, 0);
  const colStd = ensureStandardAttributes(collar);
  colorizeGeometryGradient(colStd, colStem, colMain, rand, 0.03);
  parts.push(colStd);

  // Raised 3D contrasting warts/spots across the bell & lower horn
  const spotCount = Math.max(8, Math.round(18 * (el.capSpotDensity ?? 0.72)));
  const golden = 2.39996323;
  for (let s = 0; s < spotCount; s++) {
    const t = 0.08 + (s / spotCount) * 0.56;
    const pt = curve.getPointAt(t);
    const frameIdx = Math.min(segs, Math.round(t * segs));
    const N = frames.normals[frameIdx];
    const B = frames.binormals[frameIdx];
    const rAtT = capR * Math.pow(1 - (t - 0.08) / 0.92, 1.45);
    const ang = s * golden;
    const out = new THREE.Vector3(
      Math.cos(ang) * N.x + Math.sin(ang) * B.x,
      Math.cos(ang) * N.y + Math.sin(ang) * B.y,
      Math.cos(ang) * N.z + Math.sin(ang) * B.z
    ).normalize();
    const wartR = capR * (0.065 + rand() * 0.055);
    const wart = new THREE.IcosahedronGeometry(wartR, 1);
    wart.scale(1.0, 0.65, 1.0);
    wart.translate(pt.x + out.x * rAtT * 0.92, pt.y + out.y * rAtT * 0.92, pt.z + out.z * rAtT * 0.92);
    const wStd = ensureStandardAttributes(wart);
    colorizeGeometryGradient(wStd, colAccent, colTip, rand, 0.03);
    parts.push(wStd);
  }
  return parts;
}

/**
 * 28. SPOTTED ORCHID / LABELLUM COROLLA WITH CURLING TENDRILS ("spotted_orchid_labellum_corolla")
 */
function buildSpottedOrchidLabellumCorolla(
  el: CustomBotanicalElement,
  scale: number,
  colStem: string,
  colMain: string,
  colTip: string,
  colFlower: string,
  colAccent: string,
  densityMult: number,
  rand: () => number
): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const openness = THREE.MathUtils.clamp(el.petalOpenness ?? 0.85, 0, 1);
  const rad = scale * 0.95;

  // Welded calyx hub
  const hub = new THREE.IcosahedronGeometry(rad * 0.16, 1);
  const hubStd = ensureStandardAttributes(hub);
  colorizeGeometryGradient(hubStd, colStem, colMain, rand, 0.03);
  parts.push(hubStd);

  // 5 Asymmetric Orchid Tepals (dorsal sepal + 2 lateral sepals + 2 wide lateral petals)
  const tepalAngles = [0, 1.18, -1.18, 2.38, -2.38];
  const tepalWidths = [0.36, 0.44, 0.44, 0.34, 0.34];
  const tepalLens = [1.0, 0.94, 0.94, 0.92, 0.92];
  for (let i = 0; i < tepalAngles.length; i++) {
    const yaw = tepalAngles[i];
    const pLen = rad * tepalLens[i];
    const tilt = THREE.MathUtils.lerp(0.18, 1.32, openness);
    const petal = buildSculptedCuppedPetal(
      pLen,
      pLen * tepalWidths[i],
      pLen * THREE.MathUtils.lerp(0.24, 0.08, openness),
      pLen * THREE.MathUtils.lerp(-0.22, 0.18, openness),
      colMain,
      colTip,
      colFlower,
      rand
    );
    const m = new THREE.Matrix4()
      .makeRotationY(yaw)
      .multiply(new THREE.Matrix4().makeRotationX(tilt));
    petal.applyMatrix4(m);
    parts.push(petal);
  }

  // Prominent Ruffled Orchid Labellum (lower lip) + Central Gynostemium Column
  const labellum = buildSculptedCuppedPetal(
    rad * 0.88,
    rad * 0.62,
    rad * 0.32,
    -rad * 0.24,
    colFlower,
    colAccent,
    colTip,
    rand
  );
  const mLab = new THREE.Matrix4()
    .makeRotationY(Math.PI)
    .multiply(new THREE.Matrix4().makeRotationX(THREE.MathUtils.lerp(0.25, 1.15, openness)));
  labellum.applyMatrix4(mLab);
  parts.push(labellum);

  // 4 Curling Orchid Whiskers / Antenna Tendrils emerging around column
  const tendrilCount = Math.max(2, Math.min(6, Math.round((el.lobeCount || 4) * 0.65)));
  for (let t = 0; t < tendrilCount; t++) {
    const yaw = ((t + 0.5) / tendrilCount) * Math.PI * 2;
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k <= 10; k++) {
      const f = k / 10;
      const spread = rad * (0.12 + f * (0.28 + openness * 0.55));
      const h = rad * (0.15 + Math.sin(f * Math.PI * 0.72) * 0.68);
      pts.push(new THREE.Vector3(Math.cos(yaw + f * 0.85) * spread, h, Math.sin(yaw + f * 0.85) * spread));
    }
    parts.push(
      buildSmoothCurveTube(pts, rad * 0.028, rad * 0.008, 10, Math.max(4, Math.round(5 * densityMult)), colStem, colAccent, rand, 0, 0, true)
    );
  }
  return parts;
}

/**
 * 29. GIANT ARUM PLEATED SPATHE & SPADIX ("giant_arum_spathe_spadix")
 */
function buildGiantArumSpatheSpadix(
  el: CustomBotanicalElement,
  scale: number,
  colStem: string,
  colMain: string,
  colTip: string,
  colFlower: string,
  colAccent: string,
  densityMult: number,
  rand: () => number
): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const openness = THREE.MathUtils.clamp(el.petalOpenness ?? 0.72, 0, 1);
  const spatheH = scale * 1.15;
  const spatheR = scale * THREE.MathUtils.lerp(0.32, 0.92, openness);

  // Fluted Bell Spathe Lathe with dramatic wavy rim folds
  const profile: THREE.Vector2[] = [
    new THREE.Vector2(0.001, -spatheH * 0.08),
    new THREE.Vector2(spatheR * 0.24, spatheH * 0.12),
    new THREE.Vector2(spatheR * 0.38, spatheH * 0.42),
    new THREE.Vector2(spatheR * 0.86, spatheH * 0.82),
    new THREE.Vector2(spatheR * 1.0, spatheH * 0.95),
    new THREE.Vector2(spatheR * 0.88, spatheH * 0.88),
    new THREE.Vector2(spatheR * 0.26, spatheH * 0.36),
    new THREE.Vector2(0.001, spatheH * 0.24),
  ];
  const radialSegs = Math.max(20, Math.round(32 * densityMult));
  const spathe = new THREE.LatheGeometry(profile, radialSegs);
  const pos = spathe.attributes.position as THREE.BufferAttribute;
  const waveCount = Math.max(8, Math.min(18, (el.lobeCount || 8) * 2));
  for (let v = 0; v < pos.count; v++) {
    const vx = pos.getX(v);
    const vy = pos.getY(v);
    const vz = pos.getZ(v);
    const hFrac = THREE.MathUtils.clamp(vy / spatheH, 0, 1);
    const ang = Math.atan2(vz, vx);
    const pleat = Math.sin(ang * waveCount) * hFrac * spatheR * 0.16;
    const r = Math.hypot(vx, vz);
    if (r > 0.005) {
      const scaleR = (r + pleat) / r;
      pos.setX(v, vx * scaleR);
      pos.setZ(v, vz * scaleR);
      pos.setY(v, vy + Math.cos(ang * waveCount) * hFrac * spatheH * 0.08);
    }
  }
  spathe.computeVertexNormals();
  const spStd = ensureStandardAttributes(spathe);
  colorizeGeometryGradient(spStd, colMain, colFlower, rand, 0.05);
  parts.push(spStd);

  // Towering Central Conical Spadix Spire rising through the spathe mouth
  const spadixH = spatheH * 1.45;
  const spadixR = scale * 0.16;
  const spadix = new THREE.LatheGeometry(
    [
      new THREE.Vector2(0.001, spatheH * 0.12),
      new THREE.Vector2(spadixR * 0.85, spatheH * 0.45),
      new THREE.Vector2(spadixR * 1.0, spatheH * 0.88),
      new THREE.Vector2(spadixR * 0.58, spadixH * 0.82),
      new THREE.Vector2(0.001, spadixH),
    ],
    14
  );
  const sxStd = ensureStandardAttributes(spadix);
  colorizeGeometryGradient(sxStd, colStem, colAccent, rand, 0.04);
  parts.push(sxStd);

  return parts;
}

/**
 * 30. TOOTHED CARNIVOROUS JAW TRAP WITH MARGINAL CILIA ("toothed_venus_jaw_trap")
 */
function buildToothedVenusJawTrap(
  el: CustomBotanicalElement,
  scale: number,
  colStem: string,
  colMain: string,
  colTip: string,
  colFlower: string,
  colAccent: string,
  densityMult: number,
  rand: () => number
): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const openness = THREE.MathUtils.clamp(el.petalOpenness ?? 0.65, 0, 1);
  const trapR = scale * 0.72;
  const jawAngle = THREE.MathUtils.lerp(0.14, 1.05, openness);

  // Basal swollen pitcher/petiole pad at (0,0,0)
  const baseCup = new THREE.IcosahedronGeometry(trapR * 0.36, 1);
  baseCup.scale(1.1, 0.8, 0.85);
  const bcStd = ensureStandardAttributes(baseCup);
  colorizeGeometryGradient(bcStd, colStem, colMain, rand, 0.04);
  parts.push(bcStd);

  // Two hinged concave trap lobes with marginal interlocking teeth
  for (const side of [-1, 1]) {
    const lobe = buildSculptedCuppedPetal(
      trapR * 1.35,
      trapR * 1.05,
      trapR * 0.34,
      -trapR * 0.25,
      colMain,
      colFlower,
      colTip,
      rand
    );
    const toothCount = Math.max(6, Math.round(9 * Math.min(1.2, densityMult)));
    const lobeParts: THREE.BufferGeometry[] = [lobe];
    for (let t = 0; t < toothCount; t++) {
      const f = (t + 0.5) / toothCount;
      const yTooth = trapR * (0.28 + Math.sin(f * Math.PI) * 0.92);
      const xTooth = (f - 0.5) * trapR * 0.92;
      const toothLen = trapR * (0.28 + Math.sin(f * Math.PI) * 0.16);
      const tooth = new THREE.ConeGeometry(toothLen * 0.12, toothLen, 4, 1);
      tooth.translate(0, toothLen * 0.45, 0);
      tooth.rotateX(-0.85);
      tooth.translate(xTooth, yTooth, trapR * 0.14);
      const tStd = ensureStandardAttributes(tooth);
      colorizeGeometryGradient(tStd, colTip, colAccent, rand, 0.02);
      lobeParts.push(tStd);
    }
    const hingeMat = new THREE.Matrix4()
      .makeRotationY(side === 1 ? 0 : Math.PI)
      .multiply(new THREE.Matrix4().makeRotationX(jawAngle));
    lobeParts.forEach((g) => {
      g.applyMatrix4(hingeMat);
      parts.push(g);
    });
  }
  return parts;
}

/**
 * 31. CRATER TENTACLE ANEMONE CROWN ("crater_tentacle_anemone")
 */
function buildCraterTentacleAnemone(
  el: CustomBotanicalElement,
  scale: number,
  colStem: string,
  colMain: string,
  colTip: string,
  colFlower: string,
  colAccent: string,
  densityMult: number,
  rand: () => number
): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const openness = THREE.MathUtils.clamp(el.petalOpenness ?? 0.78, 0, 1);
  const crownR = scale * 0.95;

  // Concave crater oral disc
  const disc = new THREE.LatheGeometry(
    [
      new THREE.Vector2(0.001, -crownR * 0.18),
      new THREE.Vector2(crownR * 0.45, 0),
      new THREE.Vector2(crownR * 0.54, crownR * 0.24),
      new THREE.Vector2(crownR * 0.36, crownR * 0.26),
      new THREE.Vector2(crownR * 0.14, crownR * 0.08),
      new THREE.Vector2(0.001, crownR * 0.04),
    ],
    14
  );
  const discStd = ensureStandardAttributes(disc);
  colorizeGeometryGradient(discStd, colStem, colFlower, rand, 0.04);
  parts.push(discStd);

  const tentCount = Math.max(14, Math.min(34, Math.round(22 * densityMult)));
  const golden = 2.39996323;
  for (let i = 0; i < tentCount; i++) {
    const yaw = (i / tentCount) * Math.PI * 2 + (rand() - 0.5) * 0.12;
    const isInner = i % 2 === 0;
    const tLen = crownR * (isInner ? 0.85 : 1.12);
    const spread = THREE.MathUtils.lerp(0.28, 1.15, openness);
    const baseR = crownR * (isInner ? 0.32 : 0.46);
    const curl = Math.sin(i * golden) * 0.25;
    const pts = [
      new THREE.Vector3(Math.cos(yaw) * baseR, crownR * 0.2, Math.sin(yaw) * baseR),
      new THREE.Vector3(
        Math.cos(yaw + curl) * (baseR + tLen * 0.45 * spread),
        crownR * (0.48 - openness * 0.12),
        Math.sin(yaw + curl) * (baseR + tLen * 0.45 * spread)
      ),
      new THREE.Vector3(
        Math.cos(yaw - curl) * (baseR + tLen * 0.95 * spread),
        crownR * THREE.MathUtils.lerp(0.95, 0.34, openness),
        Math.sin(yaw - curl) * (baseR + tLen * 0.95 * spread)
      ),
    ];
    parts.push(
      buildSmoothCurveTube(
        pts,
        crownR * 0.068,
        crownR * 0.016,
        10,
        6,
        colMain,
        isInner ? colAccent : colTip,
        rand,
        0,
        0,
        true
      )
    );
  }
  return parts;
}

/**
 * 32. BRANCHING CORAL CLAVARIA FINGERS ("coral_clavaria_fingers")
 */
function buildCoralClavariaFingers(
  el: CustomBotanicalElement,
  scale: number,
  colStem: string,
  colMain: string,
  colTip: string,
  colFlower: string,
  colAccent: string,
  densityMult: number,
  rand: () => number
): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const fingers = Math.max(8, Math.min(20, Math.round(13 * densityMult)));
  const golden = 2.39996323;
  const h = scale * 1.35;

  const basePad = new THREE.IcosahedronGeometry(scale * 0.28, 1);
  basePad.scale(1.25, 0.55, 1.25);
  const bpStd = ensureStandardAttributes(basePad);
  colorizeGeometryGradient(bpStd, colStem, colMain, rand, 0.03);
  parts.push(bpStd);

  for (let f = 0; f < fingers; f++) {
    const u = (f + 0.5) / fingers;
    const yaw = f * golden;
    const spread = scale * (0.12 + Math.sqrt(u) * 0.42);
    const fH = h * (0.62 + (1 - u) * 0.42 + rand() * 0.18);
    const pMid = new THREE.Vector3(Math.cos(yaw) * spread * 0.55, fH * 0.5, Math.sin(yaw) * spread * 0.55);
    const pTop = new THREE.Vector3(Math.cos(yaw) * spread, fH, Math.sin(yaw) * spread);
    parts.push(
      buildSmoothCurveTube(
        [new THREE.Vector3(0, 0, 0), pMid, pTop],
        scale * 0.085,
        scale * 0.042,
        10,
        6,
        colMain,
        f % 2 === 0 ? colTip : colFlower,
        rand,
        0,
        0,
        true
      )
    );
    // Forked twin sub-finger tip
    if (f % 2 === 0) {
      const subDir = yaw + (rand() - 0.5) * 0.6;
      const pSub = new THREE.Vector3(
        pMid.x + Math.cos(subDir) * scale * 0.22,
        fH * 0.88,
        pMid.z + Math.sin(subDir) * scale * 0.22
      );
      parts.push(
        buildSmoothCurveTube(
          [pMid, pSub],
          scale * 0.06,
          scale * 0.032,
          7,
          5,
          colFlower,
          colAccent,
          rand,
          0,
          0,
          true
        )
      );
    }
  }
  return parts;
}

/**
 * 33. SPINY FENESTRATED PODS WITH OCULAR PORES ("spiny_fenestrated_pods")
 */
function buildSpinyFenestratedPods(
  el: CustomBotanicalElement,
  scale: number,
  colStem: string,
  colMain: string,
  colTip: string,
  colFlower: string,
  colAccent: string,
  densityMult: number,
  rand: () => number
): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const podCount = Math.max(2, Math.min(5, Math.round((el.padLayers || 3) * 0.65)));
  const golden = 2.39996323;

  for (let p = 0; p < podCount; p++) {
    const yaw = p * golden;
    const isMain = p === 0;
    const podH = scale * (isMain ? 1.15 : 0.78);
    const podR = podH * 0.44;
    const offX = isMain ? 0 : Math.cos(yaw) * scale * 0.36;
    const offZ = isMain ? 0 : Math.sin(yaw) * scale * 0.36;
    const offY = isMain ? scale * 0.12 : scale * (0.08 + p * 0.08);

    const pod = new THREE.IcosahedronGeometry(podR, 2);
    pod.scale(0.85, 1.38, 0.85);
    pod.translate(offX, offY + podH * 0.48, offZ);
    const pStd = ensureStandardAttributes(pod);
    colorizeGeometryGradient(pStd, colStem, colMain, rand, 0.06);
    parts.push(pStd);

    // Glowing fenestrated ocular rim on outer side
    const eye = new THREE.TorusGeometry(podR * 0.32, podR * 0.08, 6, 12);
    eye.rotateY(yaw);
    eye.translate(
      offX + Math.cos(yaw) * podR * 0.74,
      offY + podH * 0.56,
      offZ + Math.sin(yaw) * podR * 0.74
    );
    const eStd = ensureStandardAttributes(eye);
    colorizeGeometryGradient(eStd, colFlower, colAccent, rand, 0.03);
    parts.push(eStd);

    // Fine radiating defensive needles protruding from pod upper half
    const spineCount = Math.max(8, Math.round(14 * (0.5 + (el.thornDensity ?? 0.6)) * Math.min(1.2, densityMult)));
    for (let s = 0; s < spineCount; s++) {
      const sYaw = s * golden + p;
      const elev = 0.25 + (s / spineCount) * 1.05;
      const dir = new THREE.Vector3(
        Math.cos(sYaw) * Math.cos(elev),
        Math.sin(elev),
        Math.sin(sYaw) * Math.cos(elev)
      ).normalize();
      const sLen = podR * (0.65 + (el.thornLength || 0.9) * 0.55);
      const sp = new THREE.ConeGeometry(podR * 0.045, sLen, 4, 1);
      sp.translate(0, sLen * 0.5, 0);
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      const m = new THREE.Matrix4().makeRotationFromQuaternion(q);
      m.setPosition(
        offX + dir.x * podR * 0.68,
        offY + podH * 0.48 + dir.y * podR * 0.92,
        offZ + dir.z * podR * 0.68
      );
      sp.applyMatrix4(m);
      const spStd = ensureStandardAttributes(sp);
      colorizeGeometryGradient(spStd, colTip, colAccent, rand, 0.03);
      parts.push(spStd);
    }
  }
  return parts;
}

/**
 * 34. PERFORATED RIBBED BLOSSOM URN / JELLY DOME ("perforated_blossom_urn")
 */
function buildPerforatedBlossomUrn(
  el: CustomBotanicalElement,
  scale: number,
  colStem: string,
  colMain: string,
  colTip: string,
  colFlower: string,
  colAccent: string,
  densityMult: number,
  rand: () => number
): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const openness = THREE.MathUtils.clamp(el.petalOpenness ?? 0.48, 0, 1);
  const urnH = scale * 1.15;
  const urnR = scale * 0.58;
  const mouthR = urnR * THREE.MathUtils.lerp(0.28, 0.88, openness);

  const lathe = new THREE.LatheGeometry(
    [
      new THREE.Vector2(0.001, -urnH * 0.08),
      new THREE.Vector2(urnR * 0.45, urnH * 0.06),
      new THREE.Vector2(urnR * 1.0, urnH * 0.36),
      new THREE.Vector2(urnR * 0.78, urnH * 0.76),
      new THREE.Vector2(mouthR, urnH * 0.98),
      new THREE.Vector2(mouthR * 0.76, urnH * 0.92),
      new THREE.Vector2(0.001, urnH * 0.35),
    ],
    Math.max(16, Math.round(24 * densityMult))
  );
  const lStd = ensureStandardAttributes(lathe);
  colorizeGeometryGradient(lStd, colStem, colMain, rand, 0.05);
  parts.push(lStd);

  // Exterior structural ribs + fenestration pore rings around belly
  const ribs = Math.max(5, Math.min(10, el.lobeCount || 6));
  for (let r = 0; r < ribs; r++) {
    const yaw = (r / ribs) * Math.PI * 2;
    const pts = [
      new THREE.Vector3(Math.cos(yaw) * urnR * 0.44, urnH * 0.05, Math.sin(yaw) * urnR * 0.44),
      new THREE.Vector3(Math.cos(yaw) * urnR * 1.02, urnH * 0.38, Math.sin(yaw) * urnR * 1.02),
      new THREE.Vector3(Math.cos(yaw) * mouthR * 1.02, urnH * 0.98, Math.sin(yaw) * mouthR * 1.02),
    ];
    parts.push(
      buildSmoothCurveTube(pts, urnR * 0.08, urnR * 0.04, 10, 5, colMain, colTip, rand, 0, 0, false)
    );

    const poreYaw = yaw + Math.PI / ribs;
    const pore = new THREE.TorusGeometry(urnR * 0.14, urnR * 0.045, 5, 10);
    pore.rotateY(poreYaw);
    pore.translate(Math.cos(poreYaw) * urnR * 0.9, urnH * 0.42, Math.sin(poreYaw) * urnR * 0.9);
    const poreStd = ensureStandardAttributes(pore);
    colorizeGeometryGradient(poreStd, colFlower, colAccent, rand, 0.04);
    parts.push(poreStd);
  }

  // Luminous slender stamen filaments rising out of the urn mouth
  const filCount = 5;
  for (let f = 0; f < filCount; f++) {
    const ang = (f / filCount) * Math.PI * 2;
    const sp = mouthR * 0.65;
    const pTop = new THREE.Vector3(Math.cos(ang) * sp, urnH * 1.48, Math.sin(ang) * sp);
    parts.push(
      buildSmoothCurveTube(
        [new THREE.Vector3(0, urnH * 0.65, 0), new THREE.Vector3(Math.cos(ang) * sp * 0.4, urnH * 1.12, Math.sin(ang) * sp * 0.4), pTop],
        urnR * 0.03,
        urnR * 0.015,
        8,
        4,
        colFlower,
        colAccent,
        rand,
        0,
        0,
        true
      )
    );
    const orb = new THREE.IcosahedronGeometry(urnR * 0.095, 1);
    orb.translate(pTop.x, pTop.y, pTop.z);
    const oStd = ensureStandardAttributes(orb);
    colorizeGeometryGradient(oStd, colTip, colAccent, rand, 0.03);
    parts.push(oStd);
  }
  return parts;
}

/**
 * Generates a single standalone cluster of a CustomBotanicalElement so it can ALSO be used
 * as a FoliageType ('ai_custom_element') on any standard tree in the studio
 */
export function buildCustomElementFoliageCluster(
  el: CustomBotanicalElement,
  scale: number,
  colorMain: string,
  colorTip: string,
  colorFlower: string,
  densityMult: number,
  rand: () => number
): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const leafCount = Math.max(8, Math.round(12 * densityMult));
  const golden = 2.39996323;

  if (el.canopyElement === 'conical_floral_spike') {
    return buildConicalFloralSpike(el, scale, '#3f6212', colorMain, colorTip, colorFlower, '#facc15', densityMult, rand);
  }
  if (el.canopyElement === 'terraced_pagoda_caps') {
    return buildTerracedPagodaCaps(el, scale, '#312e81', colorMain, colorTip, colorFlower, '#fbbf24', densityMult, rand);
  }
  if (el.canopyElement === 'curled_witchhat_mushroom_cap') {
    return buildCurledWitchhatMushroomCap(el, scale, '#3b2618', colorMain, colorTip, colorFlower, '#f8fafc', densityMult, rand);
  }
  if (el.canopyElement === 'spotted_orchid_labellum_corolla') {
    return buildSpottedOrchidLabellumCorolla(el, scale, '#2f6e24', colorMain, colorTip, colorFlower, '#f59e0b', densityMult, rand);
  }
  if (el.canopyElement === 'giant_arum_spathe_spadix') {
    return buildGiantArumSpatheSpadix(el, scale, '#3f6212', colorMain, colorTip, colorFlower, '#fde68a', densityMult, rand);
  }
  if (el.canopyElement === 'toothed_venus_jaw_trap') {
    return buildToothedVenusJawTrap(el, scale, '#3f6212', colorMain, colorTip, colorFlower, '#ef4444', densityMult, rand);
  }
  if (el.canopyElement === 'crater_tentacle_anemone') {
    return buildCraterTentacleAnemone(el, scale, '#3f2e1e', colorMain, colorTip, colorFlower, '#fb923c', densityMult, rand);
  }
  if (el.canopyElement === 'coral_clavaria_fingers') {
    return buildCoralClavariaFingers(el, scale, '#9f1239', colorMain, colorTip, colorFlower, '#fda4af', densityMult, rand);
  }
  if (el.canopyElement === 'spiny_fenestrated_pods') {
    return buildSpinyFenestratedPods(el, scale, '#1e3a8a', colorMain, colorTip, colorFlower, '#f87171', densityMult, rand);
  }
  if (el.canopyElement === 'perforated_blossom_urn') {
    return buildPerforatedBlossomUrn(el, scale, '#3f6212', colorMain, colorTip, colorFlower, '#38bdf8', densityMult, rand);
  }
  if (el.canopyElement === 'caladium_heart_leaf_cluster') {
    const parts: THREE.BufferGeometry[] = [];
    const count = Math.max(7, Math.min(16, Math.round((el.lobeCount || 11) * densityMult)));
    const openness = THREE.MathUtils.clamp(el.petalOpenness ?? 0.72, 0, 1);
    for (let i = 0; i < count; i++) {
      const tier = i < Math.ceil(count * 0.45) ? 0 : 1;
      const ang = (i / count) * Math.PI * 2 + tier * 0.45 + (rand() - 0.5) * 0.16;
      const leafLen = scale * (tier === 0 ? 1.42 : 1.08) * (0.9 + rand() * 0.2);
      const leafW = leafLen * 0.78;
      // Sculpted cordate heart leaf blade with sinus lobes at base and pointed apex
      const segU = 6;
      const segV = 8;
      const positions: number[] = [];
      const uvs: number[] = [];
      const indices: number[] = [];
      for (let v = 0; v <= segV; v++) {
        const vt = v / segV;
        // Heart width profile: notched at base, wide heart lobes around vt=0.28, sharp tip at vt=1
        const lobeProfile =
          vt < 0.25
            ? Math.sin((vt / 0.25) * Math.PI * 0.5) * 0.92
            : Math.pow(1 - (vt - 0.25) / 0.75, 0.72) * (0.95 + 0.12 * Math.sin(vt * Math.PI));
        const halfW = leafW * 0.5 * lobeProfile;
        const archY = Math.sin(vt * Math.PI) * leafLen * 0.18 - Math.pow(vt, 2.2) * leafLen * 0.22;
        for (let u = 0; u <= segU; u++) {
          const ut = u / segU;
          const sx = (ut - 0.5) * 2; // -1..1
          const x = sx * halfW;
          // Sinus dip at base center + subtle radiating corrugation
          const baseSinus = vt < 0.18 ? (1 - Math.abs(sx)) * leafLen * 0.14 * (1 - vt / 0.18) : 0;
          const z = vt * leafLen - baseSinus;
          const cupY = archY + Math.abs(sx) * leafW * 0.08 + Math.sin(Math.abs(sx) * Math.PI * 3.0) * 0.014 * leafLen;
          positions.push(x, cupY, z);
          uvs.push(ut, vt);
        }
      }
      for (let v = 0; v < segV; v++) {
        for (let u = 0; u < segU; u++) {
          const a = v * (segU + 1) + u;
          const b = a + 1;
          const c = (v + 1) * (segU + 1) + u;
          const d = c + 1;
          indices.push(a, c, b, b, c, d);
        }
      }
      const blade = new THREE.BufferGeometry();
      blade.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      blade.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      blade.setIndex(indices);
      blade.computeVertexNormals();
      const tilt = THREE.MathUtils.lerp(0.28, 0.92, openness) + (tier === 0 ? 0.18 : -0.14);
      const m = new THREE.Matrix4()
        .makeRotationY(ang)
        .multiply(new THREE.Matrix4().makeTranslation(0, tier * scale * 0.18, scale * 0.1))
        .multiply(new THREE.Matrix4().makeRotationX(tilt));
      blade.applyMatrix4(m);
      const bStd = ensureStandardAttributes(blade);
      colorizeGeometryGradient(bStd, colorMain, colorTip, rand, 0.05);
      parts.push(bStd);

      // Petiole connecting leaf back to crown center
      const petPts = [
        new THREE.Vector3(0, -scale * 0.18, 0),
        new THREE.Vector3(Math.sin(ang) * scale * 0.2, tier * scale * 0.05, Math.cos(ang) * scale * 0.2),
        new THREE.Vector3(Math.sin(ang) * scale * 0.22, tier * scale * 0.18, Math.cos(ang) * scale * 0.22),
      ];
      parts.push(buildSmoothCurveTube(petPts, scale * 0.045, scale * 0.025, 5, 5, '#1f2937', colorMain, rand, 0, 0, false));
    }
    // 3 Scarlet Calla Spathes rising at the center
    for (let s = 0; s < 3; s++) {
      const sAng = (s / 3) * Math.PI * 2 + 0.4;
      const spathe = buildCustomContouredLeaf(scale * 0.72, 0.48, 1, 0.65, colorFlower, colorTip, rand);
      const sm = new THREE.Matrix4()
        .makeRotationY(sAng)
        .multiply(new THREE.Matrix4().makeTranslation(0, scale * 0.32, scale * 0.12))
        .multiply(new THREE.Matrix4().makeRotationX(0.32));
      spathe.applyMatrix4(sm);
      parts.push(spathe);
    }
    return parts;
  }
  if (el.canopyElement === 'king_protea_crown') {
    const parts: THREE.BufferGeometry[] = [];
    const openness = THREE.MathUtils.clamp(el.petalOpenness ?? 0.65, 0, 1);
    // Fuzzy domed lavender/ivory stamen pincushion core
    const domeR = scale * 0.62;
    const coreDome = new THREE.IcosahedronGeometry(domeR, densityMult >= 0.85 ? 2 : 1);
    coreDome.scale(1.0, 0.82, 1.0);
    coreDome.translate(0, domeR * 0.55, 0);
    const domeStd = ensureStandardAttributes(coreDome);
    colorizeGeometryGradient(domeStd, colorTip, colorFlower, rand, 0.05);
    parts.push(domeStd);

    // 4 concentric overlapping rings of pointed Protea bracts (opening smoothly with petalOpenness!)
    const rings = [
      { n: 10, len: scale * 1.05, tiltBase: 0.22, yOff: 0.12, c0: colorFlower, c1: colorTip },
      { n: 14, len: scale * 1.25, tiltBase: 0.45, yOff: 0.06, c0: colorMain, c1: colorFlower },
      { n: 16, len: scale * 1.18, tiltBase: 0.72, yOff: 0.0, c0: colorMain, c1: colorFlower },
      { n: 12, len: scale * 0.85, tiltBase: 1.02, yOff: -0.08, c0: colorMain, c1: colorTip },
    ];
    rings.forEach((rg, rIdx) => {
      const cnt = Math.max(6, Math.round(rg.n * Math.min(1.15, densityMult + 0.15)));
      for (let i = 0; i < cnt; i++) {
        const ang = (i / cnt) * Math.PI * 2 + rIdx * 0.28;
        const bract = buildCustomContouredLeaf(rg.len, 0.34, 1, 0.35, rg.c0, rg.c1, rand);
        const tilt = THREE.MathUtils.lerp(0.14 + rIdx * 0.1, rg.tiltBase + 0.32, openness);
        const m = new THREE.Matrix4()
          .makeRotationY(ang)
          .multiply(new THREE.Matrix4().makeTranslation(0, rg.yOff * scale, domeR * (0.45 + rIdx * 0.12)))
          .multiply(new THREE.Matrix4().makeRotationX(tilt));
        bract.applyMatrix4(m);
        parts.push(bract);
      }
    });
    return parts;
  }
  if (el.canopyElement === 'curled_horn_rosette') {
    const parts: THREE.BufferGeometry[] = [];
    const openness = THREE.MathUtils.clamp(el.petalOpenness ?? 0.68, 0, 1);
    const leafLayers = [
      { count: 6, rOff: 0.12, len: scale * 0.72, tilt: THREE.MathUtils.lerp(0.18, 0.48, openness), y: 0.18 },
      { count: 9, rOff: 0.24, len: scale * 1.02, tilt: THREE.MathUtils.lerp(0.42, 0.88, openness), y: 0.08 },
      { count: 12, rOff: 0.34, len: scale * 1.24, tilt: THREE.MathUtils.lerp(0.68, 1.22, openness), y: -0.02 },
    ];
    leafLayers.forEach((layer, lIdx) => {
      for (let i = 0; i < layer.count; i++) {
        const ang = (i / layer.count) * Math.PI * 2 + lIdx * 0.42;
        // Thick fleshy succulent blade
        const blade = buildCustomContouredLeaf(layer.len, 0.46, 1, 0.42, colorMain, colorTip, rand);
        const bm = new THREE.Matrix4()
          .makeRotationY(ang)
          .multiply(new THREE.Matrix4().makeTranslation(0, layer.y * scale, layer.rOff * scale))
          .multiply(new THREE.Matrix4().makeRotationX(layer.tilt));
        blade.applyMatrix4(bm);
        parts.push(blade);

        // Signature spiraling curled obsidian/crimson whip-horn at the tip of every petal!
        const tipDist = layer.rOff * scale + Math.sin(layer.tilt) * layer.len * 0.92;
        const tipY = layer.y * scale + Math.cos(layer.tilt) * layer.len * 0.92;
        const curlPts: THREE.Vector3[] = [];
        const dirX = Math.sin(ang);
        const dirZ = Math.cos(ang);
        for (let k = 0; k <= 7; k++) {
          const kt = k / 7;
          const spiralAng = kt * Math.PI * 1.85;
          const curlR = scale * 0.18 * (1 - kt * 0.55);
          const fwd = Math.sin(spiralAng) * curlR + kt * scale * 0.14;
          const up = Math.cos(spiralAng) * curlR - curlR + kt * scale * 0.26;
          curlPts.push(new THREE.Vector3(dirX * (tipDist + fwd), tipY + up, dirZ * (tipDist + fwd)));
        }
        parts.push(
          buildSmoothCurveTube(curlPts, scale * 0.055, scale * 0.008, 7, 5, colorFlower, '#18181b', rand, 0, 0, true)
        );
      }
    });
    return parts;
  }
  if (el.canopyElement === 'spiny_crater_dragon_orb') {
    const parts: THREE.BufferGeometry[] = [];
    const openness = THREE.MathUtils.clamp(el.petalOpenness ?? 0.7, 0, 1);
    const orbR = scale * 0.92;
    const mouthR = orbR * THREE.MathUtils.lerp(0.35, 0.72, openness);
    const profile: THREE.Vector2[] = [
      new THREE.Vector2(0.001, 0),
      new THREE.Vector2(orbR * 0.65, orbR * 0.15),
      new THREE.Vector2(orbR * 1.0, orbR * 0.58),
      new THREE.Vector2(orbR * 0.94, orbR * 1.08),
      new THREE.Vector2(mouthR, orbR * 1.38),
      new THREE.Vector2(mouthR * 0.68, orbR * 0.95),
      new THREE.Vector2(0.001, orbR * 0.78),
    ];
    const orbLathe = new THREE.LatheGeometry(profile, densityMult >= 0.85 ? 20 : 14);
    const orbStd = ensureStandardAttributes(orbLathe);
    colorizeGeometryGradient(orbStd, colorMain, colorFlower, rand, 0.05);
    parts.push(orbStd);

    // Protruding red-tipped conical spines around the rim and body
    const spineCount = Math.max(12, Math.round(18 * densityMult));
    for (let i = 0; i < spineCount; i++) {
      const ang = (i / spineCount) * Math.PI * 2;
      const isRim = i % 2 === 0;
      const sy = isRim ? orbR * 1.34 : orbR * (0.45 + (i % 3) * 0.24);
      const sr = isRim ? mouthR * 0.96 : orbR * 0.96;
      const coneH = scale * (isRim ? 0.44 : 0.26);
      const cone = new THREE.ConeGeometry(scale * 0.085, coneH, 6, 1);
      cone.translate(0, coneH * 0.45, 0);
      const tilt = isRim ? 0.52 : 1.18;
      const cm = new THREE.Matrix4()
        .makeRotationY(ang)
        .multiply(new THREE.Matrix4().makeTranslation(0, sy, sr))
        .multiply(new THREE.Matrix4().makeRotationX(tilt));
      cone.applyMatrix4(cm);
      const cStd = ensureStandardAttributes(cone);
      colorizeGeometryGradient(cStd, colorMain, colorFlower, rand, 0.04);
      parts.push(cStd);
    }
    // Luminous stamen brush emerging inside the crimson cavity
    for (let f = 0; f < 14; f++) {
      const fang = (f / 14) * Math.PI * 2 + rand() * 0.2;
      const fr = mouthR * (0.15 + rand() * 0.35);
      const fPts = [
        new THREE.Vector3(Math.cos(fang) * fr * 0.5, orbR * 0.82, Math.sin(fang) * fr * 0.5),
        new THREE.Vector3(Math.cos(fang) * fr, orbR * 1.32, Math.sin(fang) * fr),
      ];
      parts.push(buildSmoothCurveTube(fPts, scale * 0.025, scale * 0.012, 4, 4, colorFlower, colorTip, rand, 0, 0, true));
    }
    return parts;
  }
  if (el.canopyElement === 'lacy_veil_spiked_mushroom') {
    const parts: THREE.BufferGeometry[] = [];
    const capR = scale * 1.28;
    const capH = scale * 0.82;
    const segR = densityMult >= 0.85 ? 24 : 16;
    // Undulating wave-rimmed mushroom cap
    const capProfile: THREE.Vector2[] = [
      new THREE.Vector2(0.001, capH),
      new THREE.Vector2(capR * 0.36, capH * 0.92),
      new THREE.Vector2(capR * 0.72, capH * 0.52),
      new THREE.Vector2(capR * 1.0, capH * 0.14),
      new THREE.Vector2(capR * 0.86, 0.0),
      new THREE.Vector2(capR * 0.22, capH * 0.18),
    ];
    const capGeo = new THREE.LatheGeometry(capProfile, segR);
    // Add undulating scalloped ruffles along the cap rim
    const posAttr = capGeo.attributes.position;
    for (let i = 0; i < posAttr.count; i++) {
      const x = posAttr.getX(i);
      const y = posAttr.getY(i);
      const z = posAttr.getZ(i);
      const rad = Math.hypot(x, z);
      const ang = Math.atan2(z, x);
      if (rad > capR * 0.45) {
        const wave = Math.sin(ang * 7.0) * capH * 0.16 * ((rad - capR * 0.45) / (capR * 0.55));
        posAttr.setY(i, y + wave);
      }
    }
    capGeo.computeVertexNormals();
    const capStd = ensureStandardAttributes(capGeo);
    colorizeGeometryGradient(capStd, colorMain, colorTip, rand, 0.05);
    parts.push(capStd);

    // Protruding conical spikes/warts studded across the upper dome
    const wartCount = Math.max(18, Math.round(28 * densityMult));
    for (let w = 0; w < wartCount; w++) {
      const ang = w * 2.39996;
      const frac = 0.22 + (w / wartCount) * 0.74;
      const wr = capR * frac;
      const wy = capH * (1 - Math.pow(frac, 1.35)) * 0.88 + 0.08 * capH;
      const spike = new THREE.ConeGeometry(scale * 0.065, scale * 0.22, 5, 1);
      spike.translate(0, scale * 0.08, 0);
      const sm = new THREE.Matrix4()
        .makeRotationY(ang)
        .multiply(new THREE.Matrix4().makeTranslation(0, wy, wr))
        .multiply(new THREE.Matrix4().makeRotationX(frac * 0.95));
      spike.applyMatrix4(sm);
      const sStd = ensureStandardAttributes(spike);
      colorizeGeometryGradient(sStd, colorTip, colorFlower, rand, 0.04);
      parts.push(sStd);
    }

    // Perforated lacy veil tassels draping gracefully from the scalloped rim
    const veilCount = Math.max(10, Math.round(14 * densityMult));
    for (let v = 0; v < veilCount; v++) {
      const ang = (v / veilCount) * Math.PI * 2;
      const vx = Math.cos(ang) * capR * 0.9;
      const vz = Math.sin(ang) * capR * 0.9;
      const drop = scale * (0.48 + (v % 2) * 0.28);
      const lace = buildCustomContouredLeaf(drop, 0.28, 1, 0.2, colorTip, colorFlower, rand);
      const lm = new THREE.Matrix4()
        .makeTranslation(vx, capH * 0.08, vz)
        .multiply(new THREE.Matrix4().makeRotationY(-ang))
        .multiply(new THREE.Matrix4().makeRotationX(Math.PI * 0.94));
      lace.applyMatrix4(lm);
      parts.push(lace);
    }
    return parts;
  }

  if (
    el.canopyElement === 'moss_velvet_mantle' ||
    el.synthesizedTipPrimitive === 'bryophyte_moss_pad'
  ) {
    const { deepMoss, midMoss, tipMoss } = resolveMossPalette(colorMain, colorTip);
    const dummyCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, -scale * 0.25, 0),
      new THREE.Vector3(scale * 0.08, 0, 0),
      new THREE.Vector3(-scale * 0.06, scale * 0.25, 0),
    ]);
    const core = buildSculptedCloudCushionCore(
      scale * 0.36,
      scale * 0.22,
      scale * 0.36,
      deepMoss,
      midMoss,
      tipMoss,
      densityMult,
      rand
    );
    return [
      core,
      ...buildSculptedBarkMossMantle(
        [{ curve: dummyCurve, rStart: scale * 0.28, rEnd: scale * 0.2 }],
        colorMain,
        colorTip,
        1.0,
        densityMult,
        0.75,
        rand
      ),
    ];
  }

  if (el.canopyElement === 'scifi_biolum_plasma_globes') {
    return buildSciFiPlasmaGlobeCluster(
      el,
      scale,
      '#1e1b4b',
      colorMain,
      colorTip,
      colorFlower,
      '#00f5d4',
      densityMult,
      rand
    );
  }

  if (el.canopyElement === 'scifi_voronoi_ova_balloons') {
    return buildSciFiVoronoiOvaBalloons(
      el,
      scale,
      '#1e1b4b',
      colorMain,
      colorTip,
      colorFlower,
      '#38bdf8',
      densityMult,
      rand
    );
  }

  if (el.canopyElement === 'fenestrated_monstera_leaves') {
    return buildFenestratedMonsteraCluster(
      el,
      scale,
      '#2f5e24',
      colorMain,
      colorTip,
      colorFlower,
      densityMult,
      rand
    );
  }

  if (el.canopyElement === 'palmate_maple_star_leaves') {
    return buildPalmateMapleStarCluster(
      el,
      scale,
      '#4a3525',
      colorMain,
      colorTip,
      colorFlower,
      densityMult,
      rand
    );
  }

  if (el.canopyElement === 'pinnate_fern_palm_fronds') {
    return buildPinnateFernPalmFronds(
      el,
      scale,
      '#2f5e24',
      colorMain,
      colorTip,
      colorFlower,
      densityMult,
      rand
    );
  }

  if (el.canopyElement === 'succulent_fleshy_rosettes') {
    return buildSucculentFleshyRosetteCluster(
      el,
      scale,
      '#3f6212',
      colorMain,
      colorTip,
      colorFlower,
      densityMult,
      rand
    );
  }

  if (el.canopyElement === 'conifer_needle_brushes') {
    return buildConiferNeedleBrushCluster(
      el,
      scale,
      '#583e2a',
      colorMain,
      colorTip,
      colorFlower,
      densityMult,
      rand
    );
  }

  if (el.canopyElement === 'lotus_magnolia_corolla_crown') {
    return buildLotusMagnoliaCorollaCrown(
      el,
      scale,
      '#3f6212',
      colorMain,
      colorTip,
      colorFlower,
      '#facc15',
      densityMult,
      rand
    );
  }

  if (el.canopyElement === 'passionflower_filament_corona') {
    return buildPassionflowerFilamentCorona(
      el,
      scale,
      '#2f5e24',
      colorMain,
      colorTip,
      colorFlower,
      '#38bdf8',
      densityMult,
      rand
    );
  }

  if (el.canopyElement === 'heliconia_bract_candelabra') {
    return buildHeliconiaBractCandelabra(
      el,
      scale,
      '#3f6212',
      colorMain,
      colorTip,
      colorFlower,
      '#facc15',
      densityMult,
      rand
    );
  }

  if (el.canopyElement === 'dehiscent_seed_pods_coronas') {
    return buildDehiscentSeedPodsAndCoronas(
      el,
      scale,
      '#583e2a',
      colorMain,
      colorTip,
      colorFlower,
      '#facc15',
      densityMult,
      rand
    );
  }

  if (el.canopyElement === 'carnivorous_nepenthes_pitchers') {
    return buildCarnivorousNepenthesPitchers(
      el,
      scale,
      '#3f6212',
      colorMain,
      colorTip,
      colorFlower,
      '#ef4444',
      densityMult,
      rand
    );
  }

  if (
    el.canopyElement === 'spherical_bubble_umbel' ||
    el.synthesizedHeadTopology === 'spherical_umbel_rays'
  ) {
    return buildSculptedSphericalBubbleUmbel(
      el,
      scale,
      '#2f6e24',
      colorMain,
      colorTip,
      colorFlower,
      '#38bdf8',
      densityMult,
      rand
    );
  }

  if (
    el.canopyElement === 'radiating_floret_head' ||
    el.synthesizedHeadTopology === 'layered_petal_starburst'
  ) {
    return buildSculptedRadiatingFloretHead(
      el,
      scale,
      '#2f6e24',
      colorMain,
      colorTip,
      colorFlower,
      '#facc15',
      densityMult,
      rand
    );
  }

  if (
    el.canopyElement === 'hanging_bell_cluster' ||
    el.synthesizedHeadTopology === 'hanging_bell_raceme'
  ) {
    return buildSculptedHangingBellCluster(
      el,
      scale,
      '#2f6e24',
      colorMain,
      colorTip,
      colorFlower,
      '#fef08a',
      densityMult,
      rand
    );
  }

  if (
    el.canopyElement === 'crystal_prism_crown' ||
    el.synthesizedHeadTopology === 'crystal_spire_cluster'
  ) {
    return buildSculptedCrystalPrismCrown(
      el,
      scale,
      '#2f6e24',
      colorMain,
      colorTip,
      colorFlower,
      '#38bdf8',
      densityMult,
      rand
    );
  }

  if (
    el.canopyElement === 'procedural_lathe_head' ||
    el.synthesizedHeadTopology === 'revolved_lathe_chalice'
  ) {
    return buildSculptedProceduralLatheHead(
      el,
      scale,
      '#2f6e24',
      colorMain,
      colorTip,
      colorFlower,
      '#fde68a',
      densityMult,
      rand
    );
  }

  if (
    el.canopyElement === 'custom_spline_leaf_crown' ||
    el.synthesizedHeadTopology === 'spline_petal_corona'
  ) {
    return buildSculptedSplineLeafCrown(
      el,
      scale,
      '#2f6e24',
      colorMain,
      colorTip,
      colorFlower,
      '#fde68a',
      densityMult,
      rand
    );
  }

  if (el.canopyElement === 'custom_flower_corolla') {
    return buildSculptedFlowerCorollaOrBud(
      el,
      scale,
      '#4a3525',
      colorMain,
      colorTip,
      colorFlower,
      densityMult,
      rand
    );
  }

  if (el.canopyElement === 'custom_fungi_cap') {
    return buildSculptedUmbrellaFungiCap(
      el,
      scale,
      '#3b2618',
      colorMain,
      colorTip,
      colorFlower,
      '#451a03',
      densityMult,
      true,
      rand
    );
  }

  // Central welded foliage/node core at (0,0,0) so every leaf/spur in the cluster is physically fused to the branch tip!
  const colDark = '#' + new THREE.Color(colorMain).multiplyScalar(0.48).getHexString();
  const coreCushion = buildSculptedCloudCushionCore(
    scale * 0.34,
    scale * 0.22,
    scale * 0.34,
    colDark,
    colorMain,
    colorTip,
    densityMult,
    rand
  );
  parts.push(coreCushion);

  if (el.canopyElement === 'thorn_spur_clusters') {
    const spurCount = Math.max(7, Math.round(10 * densityMult));
    for (let b = 0; b < spurCount; b++) {
      const yaw = b * golden;
      const tilt = 0.22 + (b / spurCount) * 0.85;
      const spurLen = scale * (0.48 + rand() * 0.24);
      const blade = buildCustomContouredLeaf(
        spurLen,
        0.34,
        1,
        -0.25,
        colorMain,
        colorTip,
        rand
      );
      const m = new THREE.Matrix4()
        .makeRotationY(yaw)
        .multiply(new THREE.Matrix4().makeRotationX(tilt));
      blade.applyMatrix4(m);
      parts.push(blade);
    }
  } else {
    for (let i = 0; i < leafCount; i++) {
      const yaw = i * golden + (rand() - 0.5) * 0.22;
      const tilt = 0.25 + (i / leafCount) * 0.92;
      const leaf = buildCustomContouredLeaf(
        scale * (0.46 + rand() * 0.22),
        0.65,
        el.lobeCount || 3,
        0.28,
        colorMain,
        colorTip,
        rand
      );
      const m = new THREE.Matrix4()
        .makeRotationY(yaw)
        .multiply(new THREE.Matrix4().makeRotationX(tilt));
      leaf.applyMatrix4(m);
      parts.push(leaf);
    }
  }

  return parts;
}

/**
 * Master 4-Layer Combinatorial & Generative Part Synthesis Model Generator:
 * Guarantees 100% physical welding between roots, herbaceous/woody stems, basal grass/rosette blades,
 * spherical bubble umbels, radiating floret heads, hanging bell clusters, crystal crowns,
 * flower buds, umbrella/fungi colonies, claw rosettes, bonsai cloud pads, and hanging tendrils/filaments.
 */
export function generateComposedBotanicalGeometry(
  p: TreeParams,
  lod: PolygonLOD,
  meshDensity: number,
  rand: () => number
): {
  bodyGeometries: THREE.BufferGeometry[];
  detailGeometries: THREE.BufferGeometry[];
} {
  const bodyGeometries: THREE.BufferGeometry[] = [];
  const detailGeometries: THREE.BufferGeometry[] = [];

  const el: CustomBotanicalElement = p.customElement || DEFAULT_CUSTOM_ELEMENT;
  const densityMult = THREE.MathUtils.clamp(
    LOD_MULT[lod] * (meshDensity || 1.0),
    0.25,
    2.2
  );

  const H = Math.max(1.6, p.height || 5.0);
  const R = Math.max(0.12, p.radius || 0.34);
  const leafScale = THREE.MathUtils.clamp(p.leafScale || 1.15, 0.4, 2.4);
  const gnarl = THREE.MathUtils.clamp(el.trunkBentS ?? p.gnarl ?? 0.45, 0.05, 0.95);

  const isSynthesizedFloralOrUmbelHead =
    el.canopyElement === 'spherical_bubble_umbel' ||
    el.canopyElement === 'radiating_floret_head' ||
    el.canopyElement === 'hanging_bell_cluster' ||
    el.canopyElement === 'crystal_prism_crown' ||
    el.canopyElement === 'procedural_lathe_head' ||
    (el.synthesizedHeadTopology !== undefined && el.synthesizedHeadTopology !== 'none');

  const elText = `${el.name || ''} ${el.scientificName || ''} ${el.description || ''} ${el.aiNewPartsReport || ''}`.toLowerCase();
  const isMossyDeadwoodTrunk =
    el.stemStructure === 'serpentine_mossy_deadwood' ||
    el.canopyElement === 'moss_velvet_mantle' ||
    el.synthesizedTipPrimitive === 'bryophyte_moss_pad' ||
    (el.surfaceElement === 'moss_lichen_bark' &&
      (el.stemStructure === 'gnarled_bonsai' || el.stemStructure === 'hollow_ancient_snag') &&
      (elText.includes('musgo') ||
        elText.includes('bryophyt') ||
        elText.includes('tronco') ||
        elText.includes('lignum')));

  const isHerbaceousStalk =
    !isMossyDeadwoodTrunk &&
    (el.stemStructure === 'herbaceous_curved_stalk' ||
      el.stemStructure === 'swollen_ovary_calyx_stem' ||
      (isSynthesizedFloralOrUmbelHead &&
        el.stemStructure !== 'scaled_armored_caudex' &&
        el.stemStructure !== 'braided_helix_trunks' &&
        el.stemStructure !== 'gnarled_bonsai'));

  const colTrunk = resolveStemColor(
    p.colorTrunk || (isHerbaceousStalk ? '#2f6e24' : '#583e2a'),
    isHerbaceousStalk,
    isMossyDeadwoodTrunk
  );
  const colTrunkDark =
    '#' + new THREE.Color(colTrunk).multiplyScalar(0.62).getHexString();

  const mossPalette = isMossyDeadwoodTrunk
    ? resolveMossPalette(p.colorLeafMain, p.colorLeafTip)
    : null;

  const colLeafMain = mossPalette ? mossPalette.midMoss : p.colorLeafMain || '#f97316';
  const colLeafDark = mossPalette
    ? mossPalette.deepMoss
    : '#' + new THREE.Color(colLeafMain).multiplyScalar(0.48).getHexString();
  const colLeafTip = mossPalette ? mossPalette.tipMoss : p.colorLeafTip || '#f472b6';
  const colFlower = mossPalette ? mossPalette.midMoss : p.colorFlower || colLeafTip;
  const colAccent = mossPalette ? mossPalette.tipMoss : p.colorAccent || '#38bdf8';

  const radialSegs = Math.max(6, Math.round(10 * densityMult));
  const mainStemCurves: { curve: THREE.CatmullRomCurve3; rStart: number; rEnd: number }[] = [];
  const canopyAttachmentNodes: {
    pos: THREE.Vector3;
    radius: number;
    stemRadius: number;
    dir: THREE.Vector3;
    isPrimaryApex?: boolean;
  }[] = [];

  const isClawOrCrownRosette =
    el.stemStructure === 'thorny_horn_crown' || el.stemStructure === 'rosette_cluster';
  const isFloralBudCanopy =
    el.canopyElement === 'custom_flower_corolla' ||
    el.canopyElement === 'spotted_orchid_labellum_corolla' ||
    el.canopyElement === 'giant_arum_spathe_spadix' ||
    el.canopyElement === 'toothed_venus_jaw_trap' ||
    el.canopyElement === 'crater_tentacle_anemone' ||
    el.canopyElement === 'conical_floral_spike' ||
    el.canopyElement === 'perforated_blossom_urn' ||
    el.canopyElement === 'caladium_heart_leaf_cluster' ||
    el.canopyElement === 'king_protea_crown' ||
    el.canopyElement === 'curled_horn_rosette' ||
    el.canopyElement === 'spiny_crater_dragon_orb' ||
    el.canopyElement === 'lacy_veil_spiked_mushroom' ||
    isSynthesizedFloralOrUmbelHead;
  const isMultiStalkColony = el.stemStructure === 'multi_stalk_umbel_colony';

  // ═══════════════════════════════════════════════════════════════════════════
  // LAYER 0: SPREADING GNARLED ROOT COLLAR (Welded into trunk base at y = 0..startY)
  // ═══════════════════════════════════════════════════════════════════════════
  if (p.showRoots !== false) {
    const rootCount = Math.max(
      6,
      Math.round(
        (isClawOrCrownRosette ? 12 : p.rootCount || 8) * Math.min(1.4, densityMult)
      )
    );
    for (let r = 0; r < rootCount; r++) {
      const rAng = (r / rootCount) * Math.PI * 2 + (rand() - 0.5) * 0.28;
      const rLen = R * (2.2 + (p.rootLength || 1.1) * (1.1 + rand() * 0.7));
      const rStart = R * (0.42 + rand() * 0.18);
      const startY = R * (0.55 + (p.rootArch || 0.35) * 0.45);
      const wiggle = (rand() - 0.5) * 0.4;

      const rPts = [
        // Starts inside the central trunk core so roots are 100% fused to the trunk!
        new THREE.Vector3(Math.cos(rAng) * R * 0.12, startY, Math.sin(rAng) * R * 0.12),
        new THREE.Vector3(
          Math.cos(rAng + wiggle * 0.4) * rLen * 0.45,
          startY * 0.35,
          Math.sin(rAng + wiggle * 0.4) * rLen * 0.45
        ),
        new THREE.Vector3(
          Math.cos(rAng + wiggle) * rLen * 0.82,
          0.02,
          Math.sin(rAng + wiggle) * rLen * 0.82
        ),
        new THREE.Vector3(
          Math.cos(rAng + wiggle * 1.2) * rLen,
          -0.06,
          Math.sin(rAng + wiggle * 1.2) * rLen
        ),
      ];
      bodyGeometries.push(
        buildSmoothCurveTube(
          rPts,
          rStart,
          rStart * 0.08,
          Math.max(6, Math.round(9 * densityMult)),
          Math.max(5, radialSegs - 2),
          colTrunkDark,
          colTrunk,
          rand,
          4,
          0.12,
          true
        )
      );
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LAYER 1: PRIMARY STEM / CROWN STRUCTURE ("stemStructure")
  // ═══════════════════════════════════════════════════════════════════════════
  if (el.stemStructure === 'herbaceous_curved_stalk') {
    // ─────────────────────────────────────────────────────────────────────────
    // HERBACEOUS FLUTED CURVED FLOWER STALK ("Tallo Herbáceo Curvo con Hojas Basales")
    // Matches `image_290829a3.png`: graceful S-arched green ribbed peduncle
    // supporting a large spherical umbel/floral head at the apex, surrounded by basal grass blades!
    // ─────────────────────────────────────────────────────────────────────────
    const stalkCount = Math.max(1, Math.min(5, Math.round(el.stemCount || 1)));
    const golden = 2.39996323;

    for (let s = 0; s < stalkCount; s++) {
      const isPrimary = s === 0;
      const rank = s / Math.max(1, stalkCount);
      const yaw = s * golden + 0.25;
      const stalkH = H * (isPrimary ? 0.66 : 0.45 - rank * 0.12);
      const baseOffset = isPrimary ? 0 : R * (0.45 + rank * 0.45);
      const archCurve = H * (isPrimary ? 0.14 : 0.18) * (0.55 + gnarl * 0.65);

      const stalkPts: THREE.Vector3[] = [];
      const steps = 22;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const sWave = Math.sin(t * Math.PI * 1.18) * archCurve * (1.0 - t * 0.28);
        const sx = Math.cos(yaw) * (baseOffset + sWave);
        const sy = t * stalkH;
        const sz = Math.sin(yaw) * baseOffset + Math.sin(t * Math.PI) * archCurve * 0.32;
        stalkPts.push(new THREE.Vector3(sx, Math.max(-0.04, sy), sz));
      }

      const sRStart = R * (isPrimary ? 0.88 : 0.56);
      const sREnd = sRStart * 0.52;
      bodyGeometries.push(
        buildSmoothCurveTube(
          stalkPts,
          sRStart,
          sREnd,
          Math.max(16, Math.round(24 * densityMult)),
          radialSegs + 2,
          colTrunkDark,
          colTrunk,
          rand,
          10,
          0.14,
          false
        )
      );

      const sCurve = new THREE.CatmullRomCurve3(stalkPts);
      mainStemCurves.push({ curve: sCurve, rStart: sRStart, rEnd: sREnd });

      canopyAttachmentNodes.push({
        pos: sCurve.getPointAt(1.0),
        radius: H * (isPrimary ? 0.36 : 0.22) * leafScale,
        stemRadius: sREnd,
        dir: sCurve.getTangentAt(1.0).normalize(),
        isPrimaryApex: isPrimary,
      });
    }
  } else if (isClawOrCrownRosette) {
    // ─────────────────────────────────────────────────────────────────────────
    // SCULPTED FLESHY CLAW / SUCCULENT / THORNY CROWN ROSETTE
    // ("Aloe Feroz Escarlata" & "Corona de Espinas")
    // ─────────────────────────────────────────────────────────────────────────
    const caudexH = H * 0.22;
    const caudexPts = [
      new THREE.Vector3(0, -0.05, 0),
      new THREE.Vector3((rand() - 0.5) * R * 0.12, caudexH * 0.45, (rand() - 0.5) * R * 0.12),
      new THREE.Vector3(0, caudexH, 0),
    ];
    bodyGeometries.push(
      buildSmoothCurveTube(
        caudexPts,
        R * 1.35,
        R * 1.05,
        Math.max(8, Math.round(12 * densityMult)),
        radialSegs + 2,
        colTrunkDark,
        colTrunk,
        rand,
        8,
        0.16,
        false
      )
    );

    const totalBlades = Math.max(
      26,
      Math.min(
        48,
        Math.round((28 + (el.spiralArms || 6) * 2) * Math.min(1.25, Math.max(0.75, densityMult)))
      )
    );
    const golden = 2.39996323;
    const bladeSteps = Math.max(10, Math.round(14 * Math.min(1.3, densityMult)));
    const effectiveThornDensity =
      el.surfaceElement === 'curved_thorns_spines'
        ? Math.max(0.65, el.thornDensity || 0.85)
        : el.thornDensity ?? 0.45;

    const cMainTest = new THREE.Color(colLeafMain);
    const cFlowTest = new THREE.Color(colFlower);
    const hslM = { h: 0, s: 0, l: 0 };
    const hslF = { h: 0, s: 0, l: 0 };
    cMainTest.getHSL(hslM);
    cFlowTest.getHSL(hslF);
    const bladeMidColor = hslF.s > hslM.s + 0.15 ? colFlower : colLeafMain;
    const bladeBaseColor =
      '#' +
      new THREE.Color(bladeMidColor)
        .multiplyScalar(0.38)
        .lerp(new THREE.Color(colTrunk), 0.25)
        .getHexString();
    const bladeTipColor = colLeafTip;
    const spineColor =
      '#' + new THREE.Color(bladeTipColor).lerp(new THREE.Color('#fff7ed'), 0.55).getHexString();

    for (let b = 0; b < totalBlades; b++) {
      const u = b / Math.max(1, totalBlades - 1);
      const yaw = b * golden + (rand() - 0.5) * 0.14;
      const radDir = new THREE.Vector3(Math.cos(yaw), 0, Math.sin(yaw));

      const bladeTopY = H * (0.96 - u * 0.28) * (0.92 + rand() * 0.14);
      const bellySpread = H * (0.14 + u * 0.36) * (0.92 + rand() * 0.14);
      const tipSpread = bellySpread * (0.42 + u * 0.26);

      const baseR = R * (0.22 + u * 0.62);
      const baseY = caudexH * (0.95 - u * 0.35);

      const bPts = [
        new THREE.Vector3(radDir.x * baseR, baseY, radDir.z * baseR),
        new THREE.Vector3(
          radDir.x * bellySpread * 0.72,
          baseY + (bladeTopY - baseY) * 0.26,
          radDir.z * bellySpread * 0.72
        ),
        new THREE.Vector3(
          radDir.x * bellySpread * 1.04,
          baseY + (bladeTopY - baseY) * 0.62,
          radDir.z * bellySpread * 1.04
        ),
        new THREE.Vector3(radDir.x * tipSpread, bladeTopY, radDir.z * tipSpread),
      ];

      const bladeHalfW = R * (0.28 + (1.0 - u * 0.35) * 0.22) * leafScale;
      const bladeThick = bladeHalfW * 0.58;

      const bladeGeos = buildSculptedFleshyClawBlade(
        bPts,
        radDir,
        bladeHalfW,
        bladeThick,
        bladeSteps,
        bladeBaseColor,
        bladeMidColor,
        bladeTipColor,
        spineColor,
        effectiveThornDensity,
        el.thornLength || 1.0,
        rand
      );
      for (const bg of bladeGeos) {
        detailGeometries.push(bg);
      }

      if (b < 5) {
        const bCurve = new THREE.CatmullRomCurve3(bPts);
        mainStemCurves.push({ curve: bCurve, rStart: bladeHalfW * 0.65, rEnd: bladeHalfW * 0.15 });
        canopyAttachmentNodes.push({
          pos: bPts[bPts.length - 1].clone(),
          radius: H * 0.17 * leafScale,
          stemRadius: bladeHalfW * 0.2,
          dir: bCurve.getTangentAt(1.0).normalize(),
          isPrimaryApex: b === 0,
        });
      }
    }
    if (mainStemCurves.length === 0) {
      mainStemCurves.push({ curve: new THREE.CatmullRomCurve3(caudexPts), rStart: R * 1.2, rEnd: R * 0.9 });
    }
    if (canopyAttachmentNodes.length === 0) {
      canopyAttachmentNodes.push({
        pos: new THREE.Vector3(0, caudexH * 1.05, 0),
        radius: H * 0.24 * leafScale,
        stemRadius: R * 0.8,
        dir: new THREE.Vector3(0, 1, 0),
        isPrimaryApex: true,
      });
    }
  } else if (isMultiStalkColony) {
    // ─────────────────────────────────────────────────────────────────────────
    // MULTI-STALK UMBRELLA / BIOLUMINESCENT MUSHROOM / SPORE DOME COLONY
    // ─────────────────────────────────────────────────────────────────────────
    const primaryStalkCount = Math.max(
      4,
      Math.min(12, Math.round(el.stemCount || el.spiralArms || 7))
    );
    const babyStalkCount = Math.max(3, Math.round(primaryStalkCount * 0.5));
    const totalStalks = primaryStalkCount + babyStalkCount;
    const golden = 2.39996323;

    const basalMound = buildSculptedCloudCushionCore(
      R * 2.2,
      R * 0.75,
      R * 2.2,
      colTrunkDark,
      colTrunk,
      colLeafDark,
      densityMult,
      rand
    );
    bodyGeometries.push(basalMound);

    for (let s = 0; s < totalStalks; s++) {
      const isBaby = s >= primaryStalkCount;
      const rank = isBaby
        ? (s - primaryStalkCount) / Math.max(1, babyStalkCount)
        : s / Math.max(1, primaryStalkCount);
      const yaw = s * golden + (rand() - 0.5) * 0.22;

      const stalkH = isBaby
        ? H * (0.18 + (1 - rank) * 0.15) * (0.9 + rand() * 0.2)
        : H * (1.02 - rank * 0.46) * (0.92 + rand() * 0.14);

      const baseDist = isBaby
        ? R * (0.95 + rank * 1.05)
        : s === 0
        ? R * 0.08
        : R * (0.28 + rank * 0.85);
      const topSpread = isBaby
        ? baseDist + H * (0.06 + rand() * 0.06)
        : s === 0
        ? H * 0.05
        : baseDist + H * (0.14 + rank * 0.22);

      const stalkRStart = isBaby
        ? R * (0.18 + (1 - rank) * 0.08)
        : R * (0.34 - rank * 0.11);
      const stalkREnd = stalkRStart * 0.52;

      const sWave = (rand() - 0.5) * H * 0.08 * (0.5 + gnarl);
      const perpX = -Math.sin(yaw);
      const perpZ = Math.cos(yaw);

      const sPts = [
        new THREE.Vector3(Math.cos(yaw) * baseDist * 0.6, -0.04, Math.sin(yaw) * baseDist * 0.6),
        new THREE.Vector3(
          Math.cos(yaw) * (baseDist + (topSpread - baseDist) * 0.35) + perpX * sWave,
          stalkH * 0.36,
          Math.sin(yaw) * (baseDist + (topSpread - baseDist) * 0.35) + perpZ * sWave
        ),
        new THREE.Vector3(
          Math.cos(yaw) * (baseDist + (topSpread - baseDist) * 0.78) - perpX * sWave * 0.6,
          stalkH * 0.72,
          Math.sin(yaw) * (baseDist + (topSpread - baseDist) * 0.78) - perpZ * sWave * 0.6
        ),
        new THREE.Vector3(
          Math.cos(yaw) * topSpread,
          stalkH,
          Math.sin(yaw) * topSpread
        ),
      ];

      bodyGeometries.push(
        buildSmoothCurveTube(
          sPts,
          stalkRStart,
          stalkREnd,
          Math.max(10, Math.round(16 * densityMult)),
          Math.max(6, radialSegs),
          colTrunkDark,
          colTrunk,
          rand,
          6,
          0.1,
          false
        )
      );

      const sCurve = new THREE.CatmullRomCurve3(sPts);
      mainStemCurves.push({ curve: sCurve, rStart: stalkRStart, rEnd: stalkREnd });

      const capRadiusScale = isBaby
        ? H * (0.12 + (1 - rank) * 0.06) * leafScale
        : H * (0.28 - rank * 0.09) * leafScale;

      canopyAttachmentNodes.push({
        pos: sCurve.getPointAt(1.0),
        radius: capRadiusScale,
        stemRadius: stalkREnd,
        dir: sCurve.getTangentAt(1.0).normalize(),
        isPrimaryApex: s === 0,
      });
    }

    const basalTufts = 8;
    for (let bt = 0; bt < basalTufts; bt++) {
      const bAng = (bt / basalTufts) * Math.PI * 2 + rand() * 0.3;
      const bDist = R * (0.8 + rand() * 1.1);
      const leaf = buildCustomContouredLeaf(
        R * (0.95 + rand() * 0.55),
        0.48,
        3,
        0.38,
        colTrunkDark,
        colLeafMain,
        rand
      );
      const m = new THREE.Matrix4()
        .makeTranslation(Math.cos(bAng) * bDist, R * 0.18, Math.sin(bAng) * bDist)
        .multiply(new THREE.Matrix4().makeRotationY(bAng))
        .multiply(new THREE.Matrix4().makeRotationX(0.75 + rand() * 0.35));
      leaf.applyMatrix4(m);
      detailGeometries.push(leaf);
    }
  } else if (el.stemStructure === 'spiral_volute_vine') {
    const armCount = Math.max(2, Math.min(4, Math.round(el.spiralArms || 2)));
    const turns = THREE.MathUtils.clamp(el.spiralTurns || 1.45, 0.85, 2.2);
    const tubeSegs = Math.max(28, Math.round(46 * densityMult));

    for (let a = 0; a < armCount; a++) {
      const isPrimary = a === 0;
      const side = a % 2 === 0 ? -1 : 1;
      const yawOffset = a < 2 ? 0 : ((a - 1) / armCount) * Math.PI * 0.75;
      const armH = H * (isPrimary ? 1.0 : a === 1 ? 0.84 : 0.62 + rand() * 0.18);
      const armRStart = R * (isPrimary ? 1.12 : a === 1 ? 0.88 : 0.55);
      const armREnd = isFloralBudCanopy ? armRStart * 0.28 : armRStart * 0.08;

      const pts: THREE.Vector3[] = [];
      const totalSteps = 36;
      const spiralCenterX = side * H * (isPrimary ? 0.21 : 0.26);
      const spiralCenterY = armH * (isPrimary ? 0.72 : 0.65);
      const maxSpiralR = H * (isPrimary ? 0.33 : 0.25);

      for (let i = 0; i <= totalSteps; i++) {
        const t = i / totalSteps;
        if (t < 0.36) {
          const st = t / 0.36;
          const sCurveX =
            Math.sin(st * Math.PI * 1.1) * H * 0.14 * (isPrimary ? 1 : 0.7) +
            side * Math.pow(st, 1.75) * H * 0.12;
          const sCurveY = st * (spiralCenterY - maxSpiralR * 0.65);
          const sCurveZ = Math.sin(st * Math.PI) * R * 0.5 * side;
          pts.push(new THREE.Vector3(sCurveX, Math.max(-0.04, sCurveY), sCurveZ));
        } else {
          const ct = (t - 0.36) / 0.64;
          const theta = ct * turns * Math.PI * 2;
          const curR = maxSpiralR * Math.pow(1.0 - ct * 0.84, 0.92);
          const startAng = isPrimary ? -Math.PI * 0.35 : -Math.PI * 0.65;
          const ang = startAng + side * theta;

          const x = spiralCenterX + Math.cos(ang) * curR;
          const y = spiralCenterY + Math.sin(ang) * curR;
          const z =
            Math.sin(ct * Math.PI * 2) * R * 0.35 +
            Math.sin(yawOffset) * curR * 0.35;
          pts.push(new THREE.Vector3(x, y, z));
        }
      }

      const stemGeo = buildSmoothCurveTube(
        pts,
        armRStart,
        armREnd,
        tubeSegs,
        radialSegs + 2,
        colTrunkDark,
        colTrunk,
        rand,
        8,
        0.16,
        !isFloralBudCanopy
      );
      bodyGeometries.push(stemGeo);

      const curve = new THREE.CatmullRomCurve3(pts);
      mainStemCurves.push({ curve, rStart: armRStart, rEnd: armREnd });

      if (isFloralBudCanopy) {
        canopyAttachmentNodes.push({
          pos: curve.getPointAt(1.0),
          radius: H * (isPrimary ? 0.34 : 0.24) * leafScale,
          stemRadius: armREnd,
          dir: curve.getTangentAt(1.0).normalize(),
          isPrimaryApex: isPrimary,
        });
      } else {
        for (let k = 2; k <= 12; k++) {
          const kt = k / 13;
          canopyAttachmentNodes.push({
            pos: curve.getPointAt(kt),
            radius: THREE.MathUtils.lerp(armRStart, armREnd, kt) * 2.2,
            stemRadius: THREE.MathUtils.lerp(armRStart, armREnd, kt),
            dir: curve.getTangentAt(kt).normalize(),
          });
        }
      }
    }
  } else if (
    el.stemStructure === 'gnarled_bonsai' ||
    el.stemStructure === 'serpentine_mossy_deadwood'
  ) {
    if (isMossyDeadwoodTrunk || el.stemStructure === 'serpentine_mossy_deadwood') {
      // ───────────────────────────────────────────────────────────────────────
      // SERPENTINE DOUBLE-S WEATHERED DEADWOOD TRUNK WITH SHORT WOODY STUBS
      // Matches `download_85c90a64.png` ("Tronco Retorcido con Musgo"):
      // Sweeps right near base -> strongly left at mid-height -> right/upward to forked apex,
      // with deep twisted wood grain fibers and broken woody stubs ("muñones apicales").
      // ───────────────────────────────────────────────────────────────────────
      const trunkSteps = 34;
      const trunkPts: THREE.Vector3[] = [];
      const sAmp = 0.78 + gnarl * 0.42;

      for (let i = 0; i <= trunkSteps; i++) {
        const t = i / trunkSteps;
        const env = Math.pow(Math.sin(t * Math.PI * 0.92), 0.72);
        // Double-S serpentine wave: +X at t~0.22, -X at t~0.56, +X at t~0.92
        const sCurveX =
          (Math.sin(t * Math.PI * 2.35 + 0.15) * 0.22 -
            Math.sin(t * Math.PI * 1.15) * 0.08 +
            Math.pow(t, 2.2) * 0.16) *
          H *
          sAmp *
          (0.35 + 0.65 * env);
        const sy = t * H * 0.95;
        const sz = Math.sin(t * Math.PI * 1.85) * H * 0.07 * sAmp;
        trunkPts.push(new THREE.Vector3(sCurveX, Math.max(-0.04, sy), sz));
      }

      const trunkRStart = R * 1.38;
      const trunkREnd = R * 0.28;
      const trunkGeo = buildSmoothCurveTube(
        trunkPts,
        trunkRStart,
        trunkREnd,
        Math.max(26, Math.round(38 * densityMult)),
        radialSegs + 4,
        colTrunkDark,
        colTrunk,
        rand,
        12,
        0.24,
        false
      );
      bodyGeometries.push(trunkGeo);

      const trunkCurve = new THREE.CatmullRomCurve3(trunkPts);
      mainStemCurves.push({ curve: trunkCurve, rStart: trunkRStart, rEnd: trunkREnd });

      // Helical deadwood grain ribs fused into the trunk contour so wood fibers twist along the S-curve
      const grainFrames = computeTwistFreeFrames(trunkCurve, trunkSteps);
      const grainRibs = 4;
      for (let g = 0; g < grainRibs; g++) {
        const gPts: THREE.Vector3[] = [];
        const phase = (g / grainRibs) * Math.PI * 2;
        for (let i = 0; i <= trunkSteps; i++) {
          const t = i / trunkSteps;
          const pt = trunkCurve.getPointAt(t);
          const N = grainFrames.normals[i];
          const B = grainFrames.binormals[i];
          const rHere = THREE.MathUtils.lerp(trunkRStart, trunkREnd, Math.pow(t, 0.78));
          const ang = phase + t * Math.PI * 3.1;
          const offsetR = rHere * 0.56;
          gPts.push(
            new THREE.Vector3(
              pt.x + offsetR * (Math.cos(ang) * N.x + Math.sin(ang) * B.x),
              Math.max(-0.03, pt.y + offsetR * (Math.cos(ang) * N.y + Math.sin(ang) * B.y)),
              pt.z + offsetR * (Math.cos(ang) * N.z + Math.sin(ang) * B.z)
            )
          );
        }
        bodyGeometries.push(
          buildSmoothCurveTube(
            gPts,
            trunkRStart * 0.36,
            trunkREnd * 0.34,
            Math.max(18, Math.round(28 * densityMult)),
            6,
            colTrunkDark,
            colTrunk,
            rand,
            4,
            0.16,
            true
          )
        );
      }

      // 5 Weathered Woody Branch Stubs ("Muñones Leñosos Secos") at the bends & forked apex
      const stubConfigs = [
        // 1. Lower-mid inner right snag
        { bt: 0.39, dx: 0.08, dy: 0.14, dz: -0.05, rMult: 0.46, tipMult: 0.22 },
        // 2. Prominent vertical/upward broken limb on the outer left bend (matches left fork in download_85c90a64.png)
        { bt: 0.67, dx: -0.07, dy: 0.23, dz: 0.03, rMult: 0.58, tipMult: 0.24 },
        // 3. Sweeping upper-right woody fork (matches right branch in download_85c90a64.png)
        { bt: 0.76, dx: 0.22, dy: 0.15, dz: 0.02, rMult: 0.54, tipMult: 0.20 },
        // 4. Short gnarled knot on upper-left ridge
        { bt: 0.87, dx: -0.07, dy: 0.06, dz: 0.02, rMult: 0.42, tipMult: 0.28 },
        // 5. Secondary cleft snag at top apex
        { bt: 0.94, dx: -0.04, dy: 0.08, dz: -0.03, rMult: 0.52, tipMult: 0.32 },
      ];

      for (const sc of stubConfigs) {
        const origin = trunkCurve.getPointAt(sc.bt);
        const rHere = THREE.MathUtils.lerp(trunkRStart, trunkREnd, Math.pow(sc.bt, 0.78));
        const sPts = [
          origin.clone(),
          new THREE.Vector3(
            origin.x + H * sc.dx * 0.48,
            origin.y + H * sc.dy * 0.45,
            origin.z + H * sc.dz * 0.48
          ),
          new THREE.Vector3(
            origin.x + H * sc.dx * 0.82,
            origin.y + H * sc.dy * 0.78,
            origin.z + H * sc.dz * 0.82
          ),
          new THREE.Vector3(
            origin.x + H * sc.dx,
            origin.y + H * sc.dy,
            origin.z + H * sc.dz
          ),
        ];
        const stubRStart = rHere * sc.rMult;
        const stubREnd = stubRStart * sc.tipMult;
        bodyGeometries.push(
          buildSmoothCurveTube(
            sPts,
            stubRStart,
            stubREnd,
            Math.max(8, Math.round(12 * densityMult)),
            radialSegs,
            colTrunkDark,
            colTrunk,
            rand,
            8,
            0.22,
            true
          )
        );
        const sCurve = new THREE.CatmullRomCurve3(sPts);
        mainStemCurves.push({ curve: sCurve, rStart: stubRStart, rEnd: stubREnd });
        if (!isMossyDeadwoodTrunk) {
          canopyAttachmentNodes.push({
            pos: sCurve.getPointAt(1.0),
            radius: H * 0.22 * leafScale,
            stemRadius: stubREnd,
            dir: sCurve.getTangentAt(1.0).normalize(),
          });
        }
      }
      if (!isMossyDeadwoodTrunk) {
        canopyAttachmentNodes.push({
          pos: trunkCurve.getPointAt(1.0),
          radius: H * 0.32 * leafScale,
          stemRadius: trunkREnd,
          dir: trunkCurve.getTangentAt(1.0).normalize(),
          isPrimaryApex: true,
        });
      }
    } else {
      const trunkSteps = 26;
      const trunkPts: THREE.Vector3[] = [];
      const topHeightFrac = isFloralBudCanopy ? 0.68 : 0.82;

      for (let i = 0; i <= trunkSteps; i++) {
        const t = i / trunkSteps;
        const baseLock = Math.pow(t, 0.78);
        const sx =
          baseLock *
          (Math.sin(t * Math.PI * 1.35) * H * 0.24 * (0.65 + gnarl * 0.65) -
            Math.pow(t, 2.0) * H * 0.08);
        const sy = t * H * topHeightFrac;
        const sz = baseLock * Math.sin(t * Math.PI * 1.15) * H * 0.09 * gnarl;
        trunkPts.push(new THREE.Vector3(sx, Math.max(-0.04, sy), sz));
      }

      const trunkRStart = R * 1.45;
      const trunkREnd = R * (isFloralBudCanopy ? 0.38 : 0.24);
      const trunkGeo = buildSmoothCurveTube(
        trunkPts,
        trunkRStart,
        trunkREnd,
        Math.max(20, Math.round(30 * densityMult)),
        radialSegs + 2,
        colTrunkDark,
        colTrunk,
        rand,
        8,
        0.18,
        false
      );
      bodyGeometries.push(trunkGeo);

      const trunkCurve = new THREE.CatmullRomCurve3(trunkPts);
      mainStemCurves.push({ curve: trunkCurve, rStart: trunkRStart, rEnd: trunkREnd });

      const topApex = trunkCurve.getPointAt(1.0);
      const topTangent = trunkCurve.getTangentAt(1.0).normalize();
      canopyAttachmentNodes.push({
        pos: topApex.clone(),
        radius: H * (isFloralBudCanopy ? 0.42 : 0.36) * leafScale,
        stemRadius: trunkREnd,
        dir: topTangent,
        isPrimaryApex: true,
      });

      const branchTiers = isFloralBudCanopy
        ? Math.min(2, Math.max(0, (el.spiralArms || 2) - 1))
        : Math.max(5, Math.min(10, Math.round(el.padLayers || 7)));
      const spreadMult = THREE.MathUtils.clamp(el.branchSpread ?? 1.0, 0.5, 1.5);

      for (let b = 0; b < branchTiers; b++) {
        const bt = isFloralBudCanopy
          ? 0.38 + b * 0.24
          : 0.32 + (b / Math.max(1, branchTiers - 1)) * 0.56;
        const origin = trunkCurve.getPointAt(bt);
        const rHere = THREE.MathUtils.lerp(trunkRStart, trunkREnd, bt);
        const bYaw = b * 2.35 + (b % 2 === 0 ? 0.2 : -0.2);
        const bLen =
          H *
          (isFloralBudCanopy ? 0.26 : (0.48 - bt * 0.15) * spreadMult) *
          (0.85 + rand() * 0.22);

        const bPts = [
          origin.clone(),
          new THREE.Vector3(
            origin.x + Math.cos(bYaw) * bLen * 0.45,
            origin.y + bLen * (isFloralBudCanopy ? 0.25 : 0.14),
            origin.z + Math.sin(bYaw) * bLen * 0.45
          ),
          new THREE.Vector3(
            origin.x + Math.cos(bYaw + 0.18) * bLen * 0.78,
            origin.y + bLen * (isFloralBudCanopy ? 0.45 : 0.11),
            origin.z + Math.sin(bYaw + 0.18) * bLen * 0.78
          ),
          new THREE.Vector3(
            origin.x + Math.cos(bYaw + 0.28) * bLen,
            origin.y + bLen * (isFloralBudCanopy ? 0.68 : 0.16),
            origin.z + Math.sin(bYaw + 0.28) * bLen
          ),
        ];

        const brRStart = rHere * 0.62;
        const brREnd = brRStart * (isFloralBudCanopy ? 0.36 : 0.24);
        bodyGeometries.push(
          buildSmoothCurveTube(
            bPts,
            brRStart,
            brREnd,
            Math.max(8, Math.round(14 * densityMult)),
            radialSegs,
            colTrunkDark,
            colTrunk,
            rand,
            6,
            0.14,
            false
          )
        );

        const brCurve = new THREE.CatmullRomCurve3(bPts);
        mainStemCurves.push({ curve: brCurve, rStart: brRStart, rEnd: brREnd });

        canopyAttachmentNodes.push({
          pos: brCurve.getPointAt(1.0),
          radius: (isFloralBudCanopy ? H * 0.24 : bLen * 0.56) * leafScale,
          stemRadius: brREnd,
          dir: brCurve.getTangentAt(1.0).normalize(),
        });

        if (el.canopyElement === 'cloud_bonsai_pads') {
          canopyAttachmentNodes.push({
            pos: brCurve.getPointAt(0.62),
            radius: bLen * 0.42 * leafScale,
            stemRadius: THREE.MathUtils.lerp(brRStart, brREnd, 0.62),
            dir: new THREE.Vector3(0, 1, 0),
          });
        }
      }
    }
  } else if (el.stemStructure === 'strangler_root_cage') {
    // ───────────────────────────────────────────────────────────────────────
    // 10. JAULA DE RAÍCES ESTRANGULADORAS (BANYAN / FICUS)
    // Interwoven lattice of aerial strangler roots fusing into an upper crown
    // ───────────────────────────────────────────────────────────────────────
    const cageStrands = Math.max(6, Math.min(12, (el.spiralArms || 6) + 2));
    const cageH = H * 0.64;
    const crownCenter = new THREE.Vector3(0, cageH, 0);

    for (let s = 0; s < cageStrands; s++) {
      const baseAng = (s / cageStrands) * Math.PI * 2;
      const twistDir = s % 2 === 0 ? 1 : -1;
      const pts: THREE.Vector3[] = [];
      const steps = 22;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const ang = baseAng + twistDir * t * Math.PI * 1.15 + Math.sin(t * Math.PI * 2) * 0.25;
        const rad =
          R *
          (2.4 * (1 - t * 0.62) + Math.sin(t * Math.PI) * 0.85) *
          (0.85 + 0.25 * Math.sin(s * 1.7 + t * 4));
        pts.push(
          new THREE.Vector3(
            Math.cos(ang) * rad,
            Math.max(-0.04, t * cageH),
            Math.sin(ang) * rad
          )
        );
      }
      const sRStart = R * 0.48;
      const sREnd = R * 0.34;
      bodyGeometries.push(
        buildSmoothCurveTube(
          pts,
          sRStart,
          sREnd,
          Math.max(16, Math.round(24 * densityMult)),
          radialSegs,
          colTrunkDark,
          colTrunk,
          rand,
          6,
          0.16,
          false
        )
      );
      const sCurve = new THREE.CatmullRomCurve3(pts);
      mainStemCurves.push({ curve: sCurve, rStart: sRStart, rEnd: sREnd });
    }

    // Horizontal anastomosing root bridges welding adjacent strands
    const bridgeCount = Math.max(5, Math.round(8 * densityMult));
    for (let br = 0; br < bridgeCount; br++) {
      const cA = mainStemCurves[br % mainStemCurves.length];
      const cB = mainStemCurves[(br + 1) % mainStemCurves.length];
      const tA = 0.22 + ((br * 0.19) % 0.62);
      const tB = THREE.MathUtils.clamp(tA + (rand() - 0.5) * 0.14, 0.18, 0.88);
      const pA = cA.curve.getPointAt(tA);
      const pB = cB.curve.getPointAt(tB);
      const mid = pA.clone().lerp(pB, 0.5);
      mid.y -= H * 0.03;
      bodyGeometries.push(
        buildSmoothCurveTube(
          [pA, mid, pB],
          R * 0.24,
          R * 0.22,
          8,
          6,
          colTrunkDark,
          colTrunk,
          rand,
          4,
          0.1,
          true
        )
      );
    }

    // Upper spreading boughs emerging from the fused root collar
    const boughCount = Math.max(4, Math.min(8, el.padLayers || 6));
    const spreadMult = THREE.MathUtils.clamp(el.branchSpread ?? 1.05, 0.5, 1.5);
    for (let b = 0; b < boughCount; b++) {
      const yaw = (b / boughCount) * Math.PI * 2 + (rand() - 0.5) * 0.2;
      const bLen = H * (0.34 + (b % 2) * 0.1) * spreadMult;
      const bPts = [
        crownCenter.clone(),
        new THREE.Vector3(
          Math.cos(yaw) * bLen * 0.52,
          cageH + H * 0.18,
          Math.sin(yaw) * bLen * 0.52
        ),
        new THREE.Vector3(
          Math.cos(yaw + 0.16) * bLen,
          cageH + H * (0.28 + (b % 2) * 0.07),
          Math.sin(yaw + 0.16) * bLen
        ),
      ];
      const bR0 = R * 0.46;
      const bR1 = R * 0.18;
      bodyGeometries.push(
        buildSmoothCurveTube(
          bPts,
          bR0,
          bR1,
          12,
          radialSegs,
          colTrunkDark,
          colTrunk,
          rand,
          6,
          0.14,
          false
        )
      );
      const bCurve = new THREE.CatmullRomCurve3(bPts);
      mainStemCurves.push({ curve: bCurve, rStart: bR0, rEnd: bR1 });
      canopyAttachmentNodes.push({
        pos: bCurve.getPointAt(1.0),
        radius: H * 0.28 * leafScale,
        stemRadius: bR1,
        dir: bCurve.getTangentAt(1.0).normalize(),
        isPrimaryApex: b === 0,
      });
    }
  } else if (el.stemStructure === 'baobab_pachycaul_bottle') {
    // ───────────────────────────────────────────────────────────────────────
    // 11. TRONCO PAQUICAULE / BAOBAB BOTELLA
    // Massive swollen water-storing bottle trunk with compact root-like crown arms
    // ───────────────────────────────────────────────────────────────────────
    const bottleH = H * 0.68;
    const lathePts: THREE.Vector2[] = [];
    const profileSteps = 24;
    for (let i = 0; i <= profileSteps; i++) {
      const t = i / profileSteps;
      const belly = Math.sin(Math.pow(t, 0.72) * Math.PI) * 1.15;
      const baseFlare = Math.pow(1 - t, 3.2) * 0.55;
      const neckTaper = THREE.MathUtils.lerp(1.0, 0.48, Math.pow(t, 1.8));
      const rad = R * (1.25 + belly + baseFlare) * neckTaper;
      lathePts.push(new THREE.Vector2(Math.max(0.04, rad), -0.04 + t * bottleH));
    }
    const bottleGeo = new THREE.LatheGeometry(
      lathePts,
      Math.max(16, Math.round(24 * densityMult))
    );
    const bPos = bottleGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < bPos.count; i++) {
      const vx = bPos.getX(i);
      const vy = bPos.getY(i);
      const vz = bPos.getZ(i);
      const ang = Math.atan2(vz, vx);
      const u = THREE.MathUtils.clamp(vy / bottleH, 0, 1);
      const flute = 1 + Math.sin(ang * 7 + u * 2.5) * 0.08 * (1 - u * 0.5) + Math.cos(ang * 3) * 0.05;
      bPos.setXYZ(i, vx * flute, vy, vz * flute);
    }
    bottleGeo.computeVertexNormals();
    colorizeGeometryByHeight(bottleGeo, colTrunkDark, colTrunk, -0.04, bottleH);
    bodyGeometries.push(bottleGeo);

    const spineCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, -0.04, 0),
      new THREE.Vector3(0, bottleH * 0.5, 0),
      new THREE.Vector3(0, bottleH, 0),
    ]);
    mainStemCurves.push({ curve: spineCurve, rStart: R * 2.1, rEnd: R * 1.1 });

    const armCount = Math.max(5, Math.min(9, el.padLayers || 6));
    const spreadMult = THREE.MathUtils.clamp(el.branchSpread ?? 0.95, 0.5, 1.4);
    for (let a = 0; a < armCount; a++) {
      const yaw = (a / armCount) * Math.PI * 2 + (rand() - 0.5) * 0.25;
      const armLen = H * (0.26 + (a % 2) * 0.08) * spreadMult;
      const startR = R * 0.65;
      const aPts = [
        new THREE.Vector3(Math.cos(yaw) * startR * 0.45, bottleH * 0.94, Math.sin(yaw) * startR * 0.45),
        new THREE.Vector3(
          Math.cos(yaw) * (startR + armLen * 0.52),
          bottleH + H * 0.16,
          Math.sin(yaw) * (startR + armLen * 0.52)
        ),
        new THREE.Vector3(
          Math.cos(yaw + 0.2) * (startR + armLen),
          bottleH + H * 0.26,
          Math.sin(yaw + 0.2) * (startR + armLen)
        ),
      ];
      const aR0 = R * 0.58;
      const aR1 = R * 0.16;
      bodyGeometries.push(
        buildSmoothCurveTube(
          aPts,
          aR0,
          aR1,
          10,
          radialSegs,
          colTrunkDark,
          colTrunk,
          rand,
          6,
          0.18,
          false
        )
      );
      const aCurve = new THREE.CatmullRomCurve3(aPts);
      mainStemCurves.push({ curve: aCurve, rStart: aR0, rEnd: aR1 });
      canopyAttachmentNodes.push({
        pos: aCurve.getPointAt(1.0),
        radius: H * 0.26 * leafScale,
        stemRadius: aR1,
        dir: aCurve.getTangentAt(1.0).normalize(),
        isPrimaryApex: a === 0,
      });
    }
  } else if (el.stemStructure === 'mangrove_stilt_arch') {
    // ───────────────────────────────────────────────────────────────────────
    // 12. RAÍCES ZANCO ARQUEADAS (MANGLAR / PANDANUS)
    // Elevated trunk perched on dramatic parabolic stilt root arches
    // ───────────────────────────────────────────────────────────────────────
    const stiltH = H * 0.42;
    const forkH = H * 0.68;
    const trunkPts = [
      new THREE.Vector3(0, stiltH * 0.55, 0),
      new THREE.Vector3(Math.sin(0.5) * H * 0.05 * gnarl, (stiltH + forkH) * 0.5, 0),
      new THREE.Vector3(0, forkH, 0),
    ];
    const trunkR0 = R * 1.15;
    const trunkR1 = R * 0.65;
    bodyGeometries.push(
      buildSmoothCurveTube(
        trunkPts,
        trunkR0,
        trunkR1,
        14,
        radialSegs + 2,
        colTrunkDark,
        colTrunk,
        rand,
        6,
        0.14,
        false
      )
    );
    const trunkCurve = new THREE.CatmullRomCurve3(trunkPts);
    mainStemCurves.push({ curve: trunkCurve, rStart: trunkR0, rEnd: trunkR1 });

    // Parabolic stilt root arches radiating from the elevated stem down into the substrate
    const stiltCount = Math.max(7, Math.min(14, (el.spiralArms || 6) * 2));
    for (let s = 0; s < stiltCount; s++) {
      const tier = s % 2;
      const attachY = stiltH * (0.65 + tier * 0.32);
      const yaw = (s / stiltCount) * Math.PI * 2 + tier * 0.22;
      const spanR = H * (0.28 + tier * 0.14) * (0.88 + rand() * 0.24);
      const sPts = [
        new THREE.Vector3(0, attachY, 0),
        new THREE.Vector3(
          Math.cos(yaw) * spanR * 0.58,
          attachY * 0.86,
          Math.sin(yaw) * spanR * 0.58
        ),
        new THREE.Vector3(
          Math.cos(yaw) * spanR * 0.92,
          attachY * 0.38,
          Math.sin(yaw) * spanR * 0.92
        ),
        new THREE.Vector3(Math.cos(yaw) * spanR, -0.05, Math.sin(yaw) * spanR),
      ];
      const sr0 = R * (0.36 + tier * 0.08);
      const sr1 = R * 0.22;
      bodyGeometries.push(
        buildSmoothCurveTube(
          sPts,
          sr0,
          sr1,
          12,
          radialSegs - 1,
          colTrunkDark,
          colTrunk,
          rand,
          4,
          0.1,
          false
        )
      );
      mainStemCurves.push({
        curve: new THREE.CatmullRomCurve3(sPts),
        rStart: sr0,
        rEnd: sr1,
      });
    }

    // Upper crown branches
    const bCount = Math.max(4, Math.min(7, el.padLayers || 5));
    for (let b = 0; b < bCount; b++) {
      const yaw = (b / bCount) * Math.PI * 2;
      const bSpan = H * 0.32 * THREE.MathUtils.clamp(el.branchSpread ?? 0.95, 0.5, 1.4);
      const bPts = [
        new THREE.Vector3(0, forkH, 0),
        new THREE.Vector3(Math.cos(yaw) * bSpan * 0.55, forkH + H * 0.18, Math.sin(yaw) * bSpan * 0.55),
        new THREE.Vector3(Math.cos(yaw) * bSpan, forkH + H * 0.28, Math.sin(yaw) * bSpan),
      ];
      const br0 = trunkR1 * 0.65;
      const br1 = br0 * 0.34;
      bodyGeometries.push(
        buildSmoothCurveTube(bPts, br0, br1, 10, radialSegs, colTrunkDark, colTrunk, rand, 4, 0.1, false)
      );
      const bCurve = new THREE.CatmullRomCurve3(bPts);
      mainStemCurves.push({ curve: bCurve, rStart: br0, rEnd: br1 });
      canopyAttachmentNodes.push({
        pos: bCurve.getPointAt(1.0),
        radius: H * 0.26 * leafScale,
        stemRadius: br1,
        dir: bCurve.getTangentAt(1.0).normalize(),
        isPrimaryApex: b === 0,
      });
    }
  } else if (el.stemStructure === 'dichotomous_dragon_tree') {
    // ───────────────────────────────────────────────────────────────────────
    // 13. BIFURCACIÓN DICOTÓMICA (DRAGO / DRACAENA / SOCOTRA)
    // Symmetrical Y-forking umbrella architecture crowned by dense terminal rosettes
    // ───────────────────────────────────────────────────────────────────────
    const stemH = H * 0.46;
    const trunkPts = [
      new THREE.Vector3(0, -0.04, 0),
      new THREE.Vector3(0, stemH * 0.5, 0),
      new THREE.Vector3(0, stemH, 0),
    ];
    const tR0 = R * 1.42;
    const tR1 = R * 0.92;
    bodyGeometries.push(
      buildSmoothCurveTube(
        trunkPts,
        tR0,
        tR1,
        14,
        radialSegs + 2,
        colTrunkDark,
        colTrunk,
        rand,
        8,
        0.12,
        false
      )
    );
    mainStemCurves.push({
      curve: new THREE.CatmullRomCurve3(trunkPts),
      rStart: tR0,
      rEnd: tR1,
    });

    const primaryForks = Math.max(3, Math.min(5, el.spiralArms || 4));
    const spreadMult = THREE.MathUtils.clamp(el.branchSpread ?? 1.0, 0.5, 1.45);
    const tier1Len = H * 0.24 * spreadMult;
    const tier2Len = H * 0.22 * spreadMult;

    for (let f1 = 0; f1 < primaryForks; f1++) {
      const yaw1 = (f1 / primaryForks) * Math.PI * 2;
      const p1End = new THREE.Vector3(
        Math.cos(yaw1) * tier1Len,
        stemH + H * 0.2,
        Math.sin(yaw1) * tier1Len
      );
      const p1Mid = new THREE.Vector3(
        Math.cos(yaw1) * tier1Len * 0.48,
        stemH + H * 0.09,
        Math.sin(yaw1) * tier1Len * 0.48
      );
      const r1Start = tR1 * 0.62;
      const r1End = r1Start * 0.72;
      bodyGeometries.push(
        buildSmoothCurveTube(
          [new THREE.Vector3(0, stemH, 0), p1Mid, p1End],
          r1Start,
          r1End,
          8,
          radialSegs,
          colTrunkDark,
          colTrunk,
          rand,
          4,
          0.08,
          false
        )
      );
      mainStemCurves.push({
        curve: new THREE.CatmullRomCurve3([new THREE.Vector3(0, stemH, 0), p1Mid, p1End]),
        rStart: r1Start,
        rEnd: r1End,
      });

      // Dichotomous Y-split into 2 secondary branches
      for (const side of [-1, 1]) {
        const yaw2 = yaw1 + side * 0.52;
        const p2End = new THREE.Vector3(
          p1End.x + Math.cos(yaw2) * tier2Len,
          p1End.y + H * 0.18,
          p1End.z + Math.sin(yaw2) * tier2Len
        );
        const p2Mid = p1End.clone().lerp(p2End, 0.5);
        p2Mid.y -= H * 0.02;
        const r2Start = r1End * 0.76;
        const r2End = r2Start * 0.68;
        bodyGeometries.push(
          buildSmoothCurveTube(
            [p1End.clone(), p2Mid, p2End],
            r2Start,
            r2End,
            8,
            radialSegs - 1,
            colTrunkDark,
            colTrunk,
            rand,
            0,
            0,
            false
          )
        );
        const c2 = new THREE.CatmullRomCurve3([p1End.clone(), p2Mid, p2End]);
        mainStemCurves.push({ curve: c2, rStart: r2Start, rEnd: r2End });
        canopyAttachmentNodes.push({
          pos: p2End.clone(),
          radius: H * 0.24 * leafScale,
          stemRadius: r2End,
          dir: new THREE.Vector3(Math.cos(yaw2) * 0.22, 0.96, Math.sin(yaw2) * 0.22).normalize(),
          isPrimaryApex: f1 === 0 && side === 1,
        });
      }
    }
  } else if (el.stemStructure === 'braided_helix_trunks') {
    // ───────────────────────────────────────────────────────────────────────
    // 14. TRONCOS TRENZADOS EN DOBLE / TRIPLE HÉLICE (FICUS / PACHIRA)
    // Tightly braided helical trunks opening into a symmetrical high crown
    // ───────────────────────────────────────────────────────────────────────
    const strandCount = Math.max(3, Math.min(5, el.spiralArms || 3));
    const braidH = H * 0.74;
    const braidR = R * 0.85;
    const turns = 1.8 + gnarl * 1.1;

    for (let s = 0; s < strandCount; s++) {
      const phase = (s / strandCount) * Math.PI * 2;
      const pts: THREE.Vector3[] = [];
      const steps = 28;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const ang = phase + t * Math.PI * 2 * turns;
        const env = Math.sin(t * Math.PI * 0.85);
        const rOff = braidR * (0.45 + 0.55 * env);
        pts.push(
          new THREE.Vector3(
            Math.cos(ang) * rOff,
            Math.max(-0.04, t * braidH),
            Math.sin(ang) * rOff
          )
        );
      }
      // Flare outward at top of the braid
      const topYaw = phase + turns * Math.PI * 2;
      const flareDist = H * 0.24 * THREE.MathUtils.clamp(el.branchSpread ?? 0.95, 0.5, 1.4);
      pts.push(
        new THREE.Vector3(
          Math.cos(topYaw) * flareDist,
          braidH + H * 0.16,
          Math.sin(topYaw) * flareDist
        )
      );

      const sR0 = R * 0.58;
      const sR1 = R * 0.22;
      bodyGeometries.push(
        buildSmoothCurveTube(
          pts,
          sR0,
          sR1,
          Math.max(20, Math.round(28 * densityMult)),
          radialSegs,
          colTrunkDark,
          colTrunk,
          rand,
          4,
          0.12,
          false
        )
      );
      const sCurve = new THREE.CatmullRomCurve3(pts);
      mainStemCurves.push({ curve: sCurve, rStart: sR0, rEnd: sR1 });
      canopyAttachmentNodes.push({
        pos: sCurve.getPointAt(1.0),
        radius: H * 0.28 * leafScale,
        stemRadius: sR1,
        dir: sCurve.getTangentAt(1.0).normalize(),
        isPrimaryApex: s === 0,
      });
    }
  } else if (el.stemStructure === 'segmented_bamboo_equisetum') {
    // ───────────────────────────────────────────────────────────────────────
    // 15. CAÑAS SEGMENTADAS CON NUDOS (BAMBÚ / EQUISETUM)
    // Clump of gracefully arching segmented culms with prominent nodal rings
    // ───────────────────────────────────────────────────────────────────────
    const culmCount = Math.max(3, Math.min(9, el.spiralArms || 5));
    const spreadMult = THREE.MathUtils.clamp(el.branchSpread ?? 0.85, 0.4, 1.4);

    for (let c = 0; c < culmCount; c++) {
      const yaw = (c / culmCount) * Math.PI * 2 + (rand() - 0.5) * 0.2;
      const culmH = H * (c === 0 ? 0.96 : 0.72 + (c % 3) * 0.1);
      const baseDist = c === 0 ? 0 : R * (0.85 + (c % 2) * 0.45);
      const archSpan = culmH * (0.14 + (c === 0 ? 0.05 : 0.16)) * spreadMult;
      const culmSteps = 24;
      const culmPts: THREE.Vector3[] = [];

      for (let i = 0; i <= culmSteps; i++) {
        const t = i / culmSteps;
        const arch = Math.pow(t, 1.75) * archSpan;
        culmPts.push(
          new THREE.Vector3(
            Math.cos(yaw) * (baseDist + arch),
            Math.max(-0.04, t * culmH),
            Math.sin(yaw) * (baseDist + arch)
          )
        );
      }

      const cR0 = R * (c === 0 ? 0.46 : 0.36);
      const cR1 = cR0 * 0.32;
      bodyGeometries.push(
        buildSmoothCurveTube(
          culmPts,
          cR0,
          cR1,
          Math.max(16, Math.round(24 * densityMult)),
          radialSegs,
          colTrunkDark,
          colTrunk,
          rand,
          0,
          0,
          false
        )
      );
      const cCurve = new THREE.CatmullRomCurve3(culmPts);
      mainStemCurves.push({ curve: cCurve, rStart: cR0, rEnd: cR1 });

      // Nodal rings + whorled nodal side twigs
      const nodeCount = 7;
      for (let n = 1; n <= nodeCount; n++) {
        const nt = n / (nodeCount + 0.5);
        const nPos = cCurve.getPointAt(nt);
        const nTan = cCurve.getTangentAt(nt).normalize();
        const rHere = THREE.MathUtils.lerp(cR0, cR1, Math.pow(nt, 0.78));

        const ringGeo = new THREE.TorusGeometry(rHere * 1.12, rHere * 0.22, 6, 12);
        ringGeo.rotateX(Math.PI * 0.5);
        const qAlign = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), nTan);
        const mRing = new THREE.Matrix4().makeRotationFromQuaternion(qAlign);
        mRing.setPosition(nPos.x, nPos.y, nPos.z);
        ringGeo.applyMatrix4(mRing);
        colorizeGeometryByHeight(ringGeo, colTrunkDark, colAccent, -0.05, rHere * 0.25);
        bodyGeometries.push(ringGeo);

        if (n >= 4) {
          canopyAttachmentNodes.push({
            pos: nPos.clone(),
            radius: H * 0.16 * leafScale,
            stemRadius: rHere,
            dir: new THREE.Vector3(Math.cos(yaw + n * 1.9) * 0.65, 0.75, Math.sin(yaw + n * 1.9) * 0.65).normalize(),
          });
        }
      }

      canopyAttachmentNodes.push({
        pos: cCurve.getPointAt(1.0),
        radius: H * 0.22 * leafScale,
        stemRadius: cR1,
        dir: cCurve.getTangentAt(1.0).normalize(),
        isPrimaryApex: c === 0,
      });
    }
  } else if (el.stemStructure === 'hollow_ancient_snag') {
    // ───────────────────────────────────────────────────────────────────────
    // 16. TRONCO ANCESTRAL HUECO / TOCÓN PARTIDO
    // Split hollow cathedral trunk shell formed by fused buttress ribs and jagged snags
    // ───────────────────────────────────────────────────────────────────────
    const ribCount = 7;
    const snagH = H * 0.76;
    for (let r = 0; r < ribCount; r++) {
      // Leave a natural hollow cathedral opening on the front (+Z)
      const ang = ((r + 0.6) / (ribCount + 0.8)) * Math.PI * 1.72 + 0.45;
      const ribH = snagH * (0.72 + (r % 3) * 0.14);
      const pts: THREE.Vector3[] = [];
      const steps = 18;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const flare = Math.pow(1 - t, 2.2) * R * 1.35;
        const twist = t * 0.35 * gnarl;
        const rad = R * (1.05 - t * 0.25) + flare;
        pts.push(
          new THREE.Vector3(
            Math.cos(ang + twist) * rad,
            Math.max(-0.04, t * ribH),
            Math.sin(ang + twist) * rad
          )
        );
      }
      const rR0 = R * 0.56;
      const rR1 = R * 0.18;
      bodyGeometries.push(
        buildSmoothCurveTube(
          pts,
          rR0,
          rR1,
          14,
          radialSegs,
          colTrunkDark,
          colTrunk,
          rand,
          8,
          0.22,
          true
        )
      );
      const rCurve = new THREE.CatmullRomCurve3(pts);
      mainStemCurves.push({ curve: rCurve, rStart: rR0, rEnd: rR1 });

      if (r % 2 === 0) {
        const limbOrigin = rCurve.getPointAt(0.75);
        const limbLen = H * (0.22 + (r % 3) * 0.06);
        const lPts = [
          limbOrigin.clone(),
          new THREE.Vector3(
            limbOrigin.x + Math.cos(ang) * limbLen * 0.55,
            limbOrigin.y + limbLen * 0.35,
            limbOrigin.z + Math.sin(ang) * limbLen * 0.55
          ),
          new THREE.Vector3(
            limbOrigin.x + Math.cos(ang + 0.2) * limbLen,
            limbOrigin.y + limbLen * 0.55,
            limbOrigin.z + Math.sin(ang + 0.2) * limbLen
          ),
        ];
        bodyGeometries.push(
          buildSmoothCurveTube(
            lPts,
            rR0 * 0.52,
            rR1 * 0.45,
            8,
            radialSegs - 1,
            colTrunkDark,
            colTrunk,
            rand,
            6,
            0.18,
            true
          )
        );
        const lCurve = new THREE.CatmullRomCurve3(lPts);
        mainStemCurves.push({ curve: lCurve, rStart: rR0 * 0.52, rEnd: rR1 * 0.45 });
        canopyAttachmentNodes.push({
          pos: lCurve.getPointAt(1.0),
          radius: H * 0.25 * leafScale,
          stemRadius: rR1 * 0.45,
          dir: lCurve.getTangentAt(1.0).normalize(),
          isPrimaryApex: r === 0,
        });
      }
    }
  } else if (el.stemStructure === 'creeping_rhizome_runners') {
    // ───────────────────────────────────────────────────────────────────────
    // 17. RIZOMA RASTRERO CON ESTOLONES Y BROTES VERTICALES
    // Thick horizontal creeping rhizome runners sending up vertical shoots
    // ───────────────────────────────────────────────────────────────────────
    const runnerCount = Math.max(3, Math.min(6, el.spiralArms || 4));
    const spanR = H * 0.48 * THREE.MathUtils.clamp(el.branchSpread ?? 1.0, 0.5, 1.45);

    for (let r = 0; r < runnerCount; r++) {
      const yaw = (r / runnerCount) * Math.PI * 2 + 0.2;
      const rPts: THREE.Vector3[] = [];
      const steps = 16;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const wig = Math.sin(t * Math.PI * 2.5 + r) * 0.22;
        const dist = t * spanR;
        const archY = Math.sin(t * Math.PI * 3) * R * 0.42 + R * 0.25;
        rPts.push(
          new THREE.Vector3(
            Math.cos(yaw + wig) * dist,
            Math.max(-0.02, archY),
            Math.sin(yaw + wig) * dist
          )
        );
      }
      const r0 = R * 0.72;
      const r1 = R * 0.34;
      bodyGeometries.push(
        buildSmoothCurveTube(
          rPts,
          r0,
          r1,
          14,
          radialSegs,
          colTrunkDark,
          colTrunk,
          rand,
          6,
          0.16,
          true
        )
      );
      const rCurve = new THREE.CatmullRomCurve3(rPts);
      mainStemCurves.push({ curve: rCurve, rStart: r0, rEnd: r1 });

      // Vertical ascending shoots rising from nodes along each creeping rhizome
      const shootNodes = [0.22, 0.58, 0.92];
      shootNodes.forEach((st, sIdx) => {
        if (r > 0 && sIdx === 0) return;
        const origin = rCurve.getPointAt(st);
        const shootH = H * (0.72 - st * 0.24) * (0.88 + rand() * 0.2);
        const sPts = [
          origin.clone(),
          new THREE.Vector3(
            origin.x + Math.cos(yaw) * shootH * 0.08,
            origin.y + shootH * 0.52,
            origin.z + Math.sin(yaw) * shootH * 0.08
          ),
          new THREE.Vector3(
            origin.x + Math.cos(yaw + 0.2) * shootH * 0.14,
            origin.y + shootH,
            origin.z + Math.sin(yaw + 0.2) * shootH * 0.14
          ),
        ];
        const sr0 = THREE.MathUtils.lerp(r0, r1, st) * 0.72;
        const sr1 = sr0 * 0.38;
        bodyGeometries.push(
          buildSmoothCurveTube(sPts, sr0, sr1, 10, radialSegs - 1, colTrunkDark, colTrunk, rand, 4, 0.1, false)
        );
        const sCurve = new THREE.CatmullRomCurve3(sPts);
        mainStemCurves.push({ curve: sCurve, rStart: sr0, rEnd: sr1 });
        canopyAttachmentNodes.push({
          pos: sCurve.getPointAt(1.0),
          radius: H * (sIdx === 0 ? 0.32 : 0.24) * leafScale,
          stemRadius: sr1,
          dir: sCurve.getTangentAt(1.0).normalize(),
          isPrimaryApex: r === 0 && sIdx === 0,
        });
      });
    }
  } else if (el.stemStructure === 'scifi_tendril_cradle') {
    // ───────────────────────────────────────────────────────────────────────
    // 18. CÁLIZ DE TENTÁCULOS / SOPORTE DE GLOBOS SCI-FI
    // Alien pedestal trunk splitting into curving biomechanical cradle ribs
    // that cup a central plasma globe and hold satellite orbs at each rib tip
    // ───────────────────────────────────────────────────────────────────────
    const pedH = H * 0.38;
    const pedPts = [
      new THREE.Vector3(0, -0.04, 0),
      new THREE.Vector3(0, pedH * 0.5, 0),
      new THREE.Vector3(0, pedH, 0),
    ];
    const pR0 = R * 1.45;
    const pR1 = R * 0.88;
    bodyGeometries.push(
      buildSmoothCurveTube(
        pedPts,
        pR0,
        pR1,
        14,
        radialSegs + 2,
        colTrunkDark,
        colTrunk,
        rand,
        8,
        0.18,
        false
      )
    );
    mainStemCurves.push({
      curve: new THREE.CatmullRomCurve3(pedPts),
      rStart: pR0,
      rEnd: pR1,
    });

    // Central suspended cradle apex inside the chalice
    canopyAttachmentNodes.push({
      pos: new THREE.Vector3(0, pedH + H * 0.24, 0),
      radius: H * 0.38 * leafScale,
      stemRadius: pR1 * 0.55,
      dir: new THREE.Vector3(0, 1, 0),
      isPrimaryApex: true,
    });

    const cradleCount = Math.max(5, Math.min(10, el.spiralArms || 6));
    const spreadMult = THREE.MathUtils.clamp(el.branchSpread ?? 1.0, 0.5, 1.45);
    const cupR = H * 0.32 * spreadMult;
    const cupH = H * 0.48;

    for (let c = 0; c < cradleCount; c++) {
      const yaw = (c / cradleCount) * Math.PI * 2;
      const pts: THREE.Vector3[] = [];
      const steps = 18;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        // Bow outward then curve inward at the rim like a cradling claw
        const bow = Math.sin(t * Math.PI * 0.88) * cupR * (1.05 - Math.pow(t, 2.4) * 0.25);
        const twist = yaw + t * 0.42 * gnarl;
        pts.push(
          new THREE.Vector3(
            Math.cos(twist) * bow,
            pedH + Math.pow(t, 0.88) * cupH,
            Math.sin(twist) * bow
          )
        );
      }
      const cR0 = pR1 * 0.52;
      const cR1 = cR0 * 0.24;
      bodyGeometries.push(
        buildSmoothCurveTube(
          pts,
          cR0,
          cR1,
          14,
          radialSegs,
          colTrunkDark,
          colAccent,
          rand,
          6,
          0.14,
          false
        )
      );
      const cCurve = new THREE.CatmullRomCurve3(pts);
      mainStemCurves.push({ curve: cCurve, rStart: cR0, rEnd: cR1 });
      canopyAttachmentNodes.push({
        pos: cCurve.getPointAt(1.0),
        radius: H * 0.22 * leafScale,
        stemRadius: cR1,
        dir: cCurve.getTangentAt(1.0).normalize(),
      });
    }
  } else if (el.stemStructure === 'scaled_armored_caudex') {
    // ───────────────────────────────────────────────────────────────────────
    // 19. ESTÍPITE / CAUDEX ESCAMOSO ACORAZADO
    // Stately sweeping armored caudex with overlapping diamond plate scales
    // ───────────────────────────────────────────────────────────────────────
    const lean = H * 0.24 * THREE.MathUtils.clamp(el.trunkBentS ?? 0.45, 0, 1);
    const pts = [
      new THREE.Vector3(0, -0.04, 0),
      new THREE.Vector3(lean * 0.45, H * 0.35, lean * 0.18),
      new THREE.Vector3(lean * 0.85, H * 0.72, -lean * 0.12),
      new THREE.Vector3(lean * 0.68, H * 0.98, 0),
    ];
    const cR0 = R * 1.15;
    const cR1 = R * 0.42;
    bodyGeometries.push(
      buildSmoothCurveTube(pts, cR0, cR1, 18, radialSegs, colTrunkDark, colTrunk, rand, 6, 0.14, false)
    );
    const curve = new THREE.CatmullRomCurve3(pts);
    mainStemCurves.push({ curve, rStart: cR0, rEnd: cR1 });
    // Dense overlapping diamond scales along caudex
    const rings = Math.max(10, Math.round(16 * Math.min(1.25, densityMult)));
    const frames = computeTwistFreeFrames(curve, rings);
    for (let i = 1; i < rings; i++) {
      const t = i / rings;
      const pt = curve.getPointAt(t);
      const T = frames.tangents[i];
      const N = frames.normals[i];
      const B = frames.binormals[i];
      const rHere = THREE.MathUtils.lerp(cR0, cR1, Math.pow(t, 0.75));
      for (let s = 0; s < 6; s++) {
        const ang = (s / 6) * Math.PI * 2 + (i % 2) * 0.52;
        const out = new THREE.Vector3(
          Math.cos(ang) * N.x + Math.sin(ang) * B.x,
          Math.cos(ang) * N.y + Math.sin(ang) * B.y,
          Math.cos(ang) * N.z + Math.sin(ang) * B.z
        ).normalize();
        const dirS = out.clone().multiplyScalar(0.65).addScaledVector(T, 0.58).normalize();
        const scaleLeaf = buildCustomContouredLeaf(Math.max(0.1, rHere * 1.45), 0.75, 1, 0.2, colTrunkDark, colLeafMain, rand);
        const m = new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dirS));
        m.setPosition(pt.x + out.x * rHere * 0.72, pt.y + out.y * rHere * 0.72, pt.z + out.z * rHere * 0.72);
        scaleLeaf.applyMatrix4(m);
        bodyGeometries.push(scaleLeaf);
      }
    }
    canopyAttachmentNodes.push({
      pos: curve.getPointAt(1.0),
      radius: H * 0.44 * leafScale,
      stemRadius: cR1,
      dir: new THREE.Vector3(0, 1, 0),
      isPrimaryApex: true,
    });
  } else if (el.stemStructure === 'segmented_siphon_tubes') {
    // ───────────────────────────────────────────────────────────────────────
    // 20. SIFONES / CHIMENEAS TUBULARES SEGMENTADAS
    // Curved ringed tubular siphons with fluted collar rims
    // ───────────────────────────────────────────────────────────────────────
    const siphonCount = Math.max(2, Math.min(5, el.stemCount ?? el.spiralArms ?? 3));
    for (let s = 0; s < siphonCount; s++) {
      const yaw = (s / siphonCount) * Math.PI * 2;
      const isMain = s === 0;
      const sH = H * (isMain ? 0.96 : 0.55 + (s % 2) * 0.18);
      const off = isMain ? 0 : R * 1.15;
      const bow = H * 0.18 * (el.trunkBentS ?? 0.45);
      const pts = [
        new THREE.Vector3(Math.cos(yaw) * off * 0.4, -0.04, Math.sin(yaw) * off * 0.4),
        new THREE.Vector3(Math.cos(yaw) * (off + bow), sH * 0.45, Math.sin(yaw) * (off + bow)),
        new THREE.Vector3(Math.cos(yaw) * (off + bow * 0.4), sH, Math.sin(yaw) * (off + bow * 0.4)),
      ];
      const sR0 = R * (isMain ? 0.92 : 0.62);
      const sR1 = sR0 * 0.74;
      bodyGeometries.push(
        buildSmoothCurveTube(pts, sR0, sR1, 16, radialSegs, colTrunkDark, colTrunk, rand, 0, 0, false)
      );
      const sCurve = new THREE.CatmullRomCurve3(pts);
      mainStemCurves.push({ curve: sCurve, rStart: sR0, rEnd: sR1 });
      // Segmented annular rings along each siphon tube
      for (let k = 1; k <= 6; k++) {
        const pt = sCurve.getPointAt(k / 7);
        const tan = sCurve.getTangentAt(k / 7).normalize();
        const rHere = THREE.MathUtils.lerp(sR0, sR1, k / 7);
        const ring = new THREE.TorusGeometry(rHere * 1.02, rHere * 0.1, 6, 12);
        ring.rotateX(Math.PI * 0.5);
        ring.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), tan)));
        ring.translate(pt.x, pt.y, pt.z);
        const rStd = ensureStandardAttributes(ring);
        colorizeGeometryGradient(rStd, colTrunk, colAccent, rand, 0.03);
        bodyGeometries.push(rStd);
      }
      canopyAttachmentNodes.push({
        pos: sCurve.getPointAt(1.0),
        radius: H * (isMain ? 0.36 : 0.25) * leafScale,
        stemRadius: sR1,
        dir: sCurve.getTangentAt(1.0).normalize(),
        isPrimaryApex: isMain,
      });
    }
  } else if (el.stemStructure === 'swollen_ovary_calyx_stem') {
    // ───────────────────────────────────────────────────────────────────────
    // 21. TALLO CON BULBO OVÁRICO PANZUDO Y ZARCILLOS LATERALES
    // Herbaceous stem swelling into a prominent fluted ovary bulb beneath the bloom
    // ───────────────────────────────────────────────────────────────────────
    const stemH = H * 0.74;
    const pts = [
      new THREE.Vector3(0, -0.04, 0),
      new THREE.Vector3(R * 0.35, stemH * 0.45, R * 0.18),
      new THREE.Vector3(0, stemH, 0),
    ];
    const curve = new THREE.CatmullRomCurve3(pts);
    const sR0 = R * 0.55;
    const sR1 = R * 0.42;
    bodyGeometries.push(
      buildSmoothCurveTube(pts, sR0, sR1, 14, radialSegs, colTrunkDark, colTrunk, rand, 5, 0.12, false)
    );
    mainStemCurves.push({ curve, rStart: sR0, rEnd: sR1 });

    // Swollen gourd-like ovary bulb perched at upper stem
    const ovaryPos = curve.getPointAt(0.76);
    const ovR = R * 1.65;
    const ovary = new THREE.IcosahedronGeometry(ovR, 2);
    ovary.scale(0.92, 1.32, 0.92);
    ovary.translate(ovaryPos.x, ovaryPos.y, ovaryPos.z);
    const ovStd = ensureStandardAttributes(ovary);
    colorizeGeometryGradient(ovStd, colTrunk, colLeafMain, rand, 0.04);
    bodyGeometries.push(ovStd);

    // Radiating lateral stamen filaments emerging from the swollen ovary bulb
    for (let f = 0; f < 10; f++) {
      const ang = (f / 10) * Math.PI * 2;
      const p0 = ovaryPos.clone();
      const p1 = new THREE.Vector3(ovaryPos.x + Math.cos(ang) * ovR * 1.75, ovaryPos.y - ovR * 0.15, ovaryPos.z + Math.sin(ang) * ovR * 1.75);
      bodyGeometries.push(
        buildSmoothCurveTube([p0, p1], R * 0.08, R * 0.03, 5, 4, colFlower, colAccent, rand, 0, 0, true)
      );
      const tip = new THREE.IcosahedronGeometry(R * 0.14, 0);
      tip.translate(p1.x, p1.y, p1.z);
      const tStd = ensureStandardAttributes(tip);
      colorizeGeometryGradient(tStd, colFlower, colAccent, rand, 0.03);
      bodyGeometries.push(tStd);
    }

    canopyAttachmentNodes.push({
      pos: curve.getPointAt(1.0),
      radius: H * 0.45 * leafScale,
      stemRadius: sR1,
      dir: new THREE.Vector3(0, 1, 0),
      isPrimaryApex: true,
    });
  } else if (el.stemStructure === 'ebony_fluted_bonsai_arch') {
    // ───────────────────────────────────────────────────────────────────────
    // 22. ARCO BONSÁI ACANALADO DE ÉBANO (Looping S-arch gnarled trunk + limbs)
    // ───────────────────────────────────────────────────────────────────────
    const archPts = [
      new THREE.Vector3(-H * 0.22, -0.04, 0),
      new THREE.Vector3(-H * 0.34, H * 0.28, H * 0.08),
      new THREE.Vector3(-H * 0.08, H * 0.58, -H * 0.06),
      new THREE.Vector3(H * 0.22, H * 0.72, H * 0.05),
      new THREE.Vector3(H * 0.06, H * 0.94, 0),
    ];
    const mainArchCurve = new THREE.CatmullRomCurve3(archPts);
    bodyGeometries.push(
      buildSmoothCurveTube(archPts, R * 1.45, R * 0.36, 22, 10, colTrunk, colTrunk, rand, 6, 0.24, true)
    );
    mainStemCurves.push({ curve: mainArchCurve, rStart: R * 1.45, rEnd: R * 0.36 });

    // Secondary dramatic counter-arch limb + 3 tiered canopy branches
    const limbSpecs = [
      { t: 0.42, dx: -0.34, dy: 0.28, dz: 0.16, rF: 0.48 },
      { t: 0.68, dx: 0.36, dy: 0.24, dz: -0.18, rF: 0.42 },
      { t: 0.86, dx: -0.22, dy: 0.22, dz: -0.22, rF: 0.34 },
    ];
    limbSpecs.forEach((ls) => {
      const origin = mainArchCurve.getPointAt(ls.t);
      const mid = origin.clone().add(new THREE.Vector3(ls.dx * H * 0.55, ls.dy * H * 0.45, ls.dz * H * 0.55));
      const end = origin.clone().add(new THREE.Vector3(ls.dx * H, ls.dy * H, ls.dz * H));
      const lCurve = new THREE.CatmullRomCurve3([origin, mid, end]);
      bodyGeometries.push(
        buildSmoothCurveTube([origin, mid, end], R * ls.rF, R * 0.14, 12, 7, colTrunk, colTrunk, rand, 4, 0.16, true)
      );
      mainStemCurves.push({ curve: lCurve, rStart: R * ls.rF, rEnd: R * 0.14 });
      canopyAttachmentNodes.push({
        pos: end,
        radius: H * 0.26 * leafScale,
        stemRadius: R * 0.14,
        dir: new THREE.Vector3(ls.dx, 0.85, ls.dz).normalize(),
      });
    });
    canopyAttachmentNodes.push({
      pos: mainArchCurve.getPointAt(1.0),
      radius: H * 0.34 * leafScale,
      stemRadius: R * 0.36,
      dir: new THREE.Vector3(0, 1, 0),
      isPrimaryApex: true,
    });
  } else if (el.stemStructure === 'caudex_rosette_branch_tree') {
    // ───────────────────────────────────────────────────────────────────────
    // 23. ÁRBOL CAUDEX SUCULENTO CON BRAZOS DE ROSETAS (Lavender Echeveria Tree)
    // ───────────────────────────────────────────────────────────────────────
    const trunkH = H * 0.62;
    const tPts = [
      new THREE.Vector3(0, -0.04, 0),
      new THREE.Vector3(R * 0.18, trunkH * 0.45, -R * 0.12),
      new THREE.Vector3(-R * 0.08, trunkH, R * 0.08),
    ];
    const tCurve = new THREE.CatmullRomCurve3(tPts);
    bodyGeometries.push(
      buildSmoothCurveTube(tPts, R * 1.65, R * 0.72, 16, 10, colTrunk, colTrunk, rand, 4, 0.14, true)
    );
    mainStemCurves.push({ curve: tCurve, rStart: R * 1.65, rEnd: R * 0.72 });

    const armCount = Math.max(5, Math.min(9, el.stemCount || 6));
    for (let i = 0; i < armCount; i++) {
      const ang = (i / armCount) * Math.PI * 2 + 0.3;
      const tPos = 0.58 + (i % 3) * 0.16;
      const start = tCurve.getPointAt(Math.min(0.96, tPos));
      const armLen = H * (0.28 + (i % 2) * 0.14);
      const mid = start.clone().add(new THREE.Vector3(Math.cos(ang) * armLen * 0.65, armLen * 0.45, Math.sin(ang) * armLen * 0.65));
      const end = start.clone().add(new THREE.Vector3(Math.cos(ang) * armLen, armLen * 0.92, Math.sin(ang) * armLen));
      const aCurve = new THREE.CatmullRomCurve3([start, mid, end]);
      bodyGeometries.push(
        buildSmoothCurveTube([start, mid, end], R * 0.52, R * 0.24, 10, 7, colTrunk, colTrunk, rand, 3, 0.1, true)
      );
      mainStemCurves.push({ curve: aCurve, rStart: R * 0.52, rEnd: R * 0.24 });
      canopyAttachmentNodes.push({
        pos: end,
        radius: H * 0.22 * leafScale,
        stemRadius: R * 0.24,
        dir: new THREE.Vector3(Math.cos(ang) * 0.4, 0.92, Math.sin(ang) * 0.4).normalize(),
      });
    }
    canopyAttachmentNodes.push({
      pos: tCurve.getPointAt(1.0).clone().add(new THREE.Vector3(0, H * 0.14, 0)),
      radius: H * 0.28 * leafScale,
      stemRadius: R * 0.55,
      dir: new THREE.Vector3(0, 1, 0),
      isPrimaryApex: true,
    });
  } else {
    const isWeeping = el.stemStructure === 'weeping_willow' || (el.branchDroop ?? 0) > 0.25;
    const droop = THREE.MathUtils.clamp(el.branchDroop ?? (isWeeping ? 0.48 : -0.12), -0.5, 0.85);
    const spreadMult = THREE.MathUtils.clamp(el.branchSpread ?? 0.85, 0.4, 1.4);

    const forkH = H * (isFloralBudCanopy ? 0.65 : 0.46);
    const trunkPts = [
      new THREE.Vector3(0, -0.04, 0),
      new THREE.Vector3(Math.sin(0.6) * H * 0.06 * gnarl, forkH * 0.48, Math.cos(0.6) * H * 0.04 * gnarl),
      new THREE.Vector3(Math.sin(1.2) * H * 0.08 * gnarl, forkH, 0),
    ];
    const trunkRStart = R * 1.35;
    const trunkREnd = R * 0.68;
    bodyGeometries.push(
      buildSmoothCurveTube(
        trunkPts,
        trunkRStart,
        trunkREnd,
        Math.max(12, Math.round(18 * densityMult)),
        radialSegs + 2,
        colTrunkDark,
        colTrunk,
        rand,
        8,
        0.16,
        false
      )
    );
    const trunkCurve = new THREE.CatmullRomCurve3(trunkPts);
    mainStemCurves.push({ curve: trunkCurve, rStart: trunkRStart, rEnd: trunkREnd });
    const forkOrigin = trunkCurve.getPointAt(1.0);

    const boughCount = isFloralBudCanopy
      ? Math.min(3, Math.max(1, el.spiralArms || 1))
      : Math.max(4, Math.min(8, Math.round(el.padLayers || el.spiralArms || 5)));

    for (let b = 0; b < boughCount; b++) {
      const bYaw = (b / boughCount) * Math.PI * 2 + (rand() - 0.5) * 0.25;
      const bSpread = H * (0.28 + (b % 2) * 0.12) * spreadMult;
      const bTopY = forkH + H * (isWeeping ? 0.34 : 0.44) * (0.88 + rand() * 0.18);
      const bTipY = isWeeping ? bTopY - H * 0.18 * droop : bTopY;

      const boughPts = [
        forkOrigin.clone(),
        new THREE.Vector3(
          forkOrigin.x + Math.cos(bYaw) * bSpread * 0.52,
          forkOrigin.y + (bTopY - forkOrigin.y) * 0.65,
          forkOrigin.z + Math.sin(bYaw) * bSpread * 0.52
        ),
        new THREE.Vector3(
          forkOrigin.x + Math.cos(bYaw + 0.15) * bSpread,
          bTipY,
          forkOrigin.z + Math.sin(bYaw + 0.15) * bSpread
        ),
      ];
      const bRStart = trunkREnd * 0.68;
      const bREnd = bRStart * (isFloralBudCanopy ? 0.42 : 0.28);
      bodyGeometries.push(
        buildSmoothCurveTube(
          boughPts,
          bRStart,
          bREnd,
          Math.max(10, Math.round(14 * densityMult)),
          radialSegs,
          colTrunkDark,
          colTrunk,
          rand,
          6,
          0.12,
          false
        )
      );
      const bCurve = new THREE.CatmullRomCurve3(boughPts);
      mainStemCurves.push({ curve: bCurve, rStart: bRStart, rEnd: bREnd });

      canopyAttachmentNodes.push({
        pos: bCurve.getPointAt(1.0),
        radius: H * (isFloralBudCanopy ? 0.34 : 0.26) * leafScale,
        stemRadius: bREnd,
        dir: bCurve.getTangentAt(1.0).normalize(),
        isPrimaryApex: b === 0,
      });

      if (!isFloralBudCanopy) {
        for (const side of [-1, 1]) {
          const subOrigin = bCurve.getPointAt(0.58);
          const subYaw = bYaw + side * (0.58 + rand() * 0.22);
          const subLen = bSpread * 0.55;
          const subTipY = subOrigin.y + (isWeeping ? -subLen * 0.45 : subLen * 0.38);
          const subPts = [
            subOrigin.clone(),
            new THREE.Vector3(
              subOrigin.x + Math.cos(subYaw) * subLen * 0.55,
              subOrigin.y + subLen * 0.18,
              subOrigin.z + Math.sin(subYaw) * subLen * 0.55
            ),
            new THREE.Vector3(
              subOrigin.x + Math.cos(subYaw) * subLen,
              subTipY,
              subOrigin.z + Math.sin(subYaw) * subLen
            ),
          ];
          const sRStart = bRStart * 0.52;
          const sREnd = sRStart * 0.32;
          bodyGeometries.push(
            buildSmoothCurveTube(
              subPts,
              sRStart,
              sREnd,
              6,
              Math.max(5, radialSegs - 2),
              colTrunkDark,
              colTrunk,
              rand,
              4,
              0.08,
              false
            )
          );
          const sCurve = new THREE.CatmullRomCurve3(subPts);
          mainStemCurves.push({ curve: sCurve, rStart: sRStart, rEnd: sREnd });
          canopyAttachmentNodes.push({
            pos: sCurve.getPointAt(1.0),
            radius: H * 0.21 * leafScale,
            stemRadius: sREnd,
            dir: sCurve.getTangentAt(1.0).normalize(),
          });
        }
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LAYER 1B: AI-SYNTHESIZED BASAL FOLIAGE ("synthesizedBasalFoliage")
  // (e.g., Long arching green grass/allium blades around the base of a flower stalk)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    const basalParts = buildSynthesizedBasalFoliage(
      el,
      H,
      R,
      mainStemCurves.length > 0 ? mainStemCurves[0].curve : null,
      colTrunk,
      colTrunkDark,
      colLeafMain,
      colLeafTip,
      colFlower,
      colAccent,
      densityMult,
      rand
    );
    for (const bp of basalParts) {
      // Put green basal grass blades into bodyGeometries so they use the organic stem/chlorophyll shader
      // without being tinted by floral iridescence!
      if (
        el.synthesizedBasalFoliage === 'long_grass_blades' ||
        el.stemStructure === 'herbaceous_curved_stalk' ||
        el.canopyElement === 'spherical_bubble_umbel'
      ) {
        bodyGeometries.push(bp);
      } else {
        detailGeometries.push(bp);
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LAYER 2: SURFACE ELEMENT ALONG STEMS ("braided_vines" | "curved_thorns_spines")
  // ═══════════════════════════════════════════════════════════════════════════
  if (!isClawOrCrownRosette && el.surfaceElement === 'braided_vines') {
    mainStemCurves.slice(0, 4).forEach(({ curve, rStart, rEnd }, idx) => {
      const strands = idx === 0 ? 5 : 3;
      const steps = 34;
      const frames = computeTwistFreeFrames(curve, steps);

      for (let st = 0; st < strands; st++) {
        const vPts: THREE.Vector3[] = [];
        const phase = (st / strands) * Math.PI * 2;
        for (let i = 0; i <= steps; i++) {
          const t = i / steps;
          const pt = curve.getPointAt(t);
          const N = frames.normals[i];
          const B = frames.binormals[i];
          const rStem = THREE.MathUtils.lerp(rStart, rEnd, Math.pow(t, 0.78));
          const ang = phase + t * Math.PI * 5.5;
          const endTaper = Math.sin(t * Math.PI);
          const offsetR = rStem * 0.55 * endTaper;

          vPts.push(
            new THREE.Vector3(
              pt.x + offsetR * (Math.cos(ang) * N.x + Math.sin(ang) * B.x),
              Math.max(-0.03, pt.y + offsetR * (Math.cos(ang) * N.y + Math.sin(ang) * B.y)),
              pt.z + offsetR * (Math.cos(ang) * N.z + Math.sin(ang) * B.z)
            )
          );
        }
        bodyGeometries.push(
          buildSmoothCurveTube(
            vPts,
            rStart * 0.28,
            rEnd * 0.26,
            Math.max(16, Math.round(24 * densityMult)),
            5,
            colTrunkDark,
            colTrunk,
            rand,
            0,
            0,
            true
          )
        );
      }
    });
  } else if (
    !isClawOrCrownRosette &&
    (el.surfaceElement === 'curved_thorns_spines' || (el.thornDensity ?? 0) > 0.25)
  ) {
    const thornMult = Math.max(0.4, el.thornDensity || 1.0);
    const thornScale = Math.max(0.4, el.thornLength || 1.0);

    mainStemCurves.forEach(({ curve, rStart, rEnd }) => {
      const thornCount = Math.max(
        6,
        Math.round(14 * thornMult * Math.min(1.3, densityMult))
      );
      const frames = computeTwistFreeFrames(curve, thornCount);

      for (let i = 1; i < thornCount; i++) {
        const t = i / thornCount;
        const pt = curve.getPointAt(t);
        const T = frames.tangents[i];
        const N = frames.normals[i];
        const B = frames.binormals[i];
        const rHere = THREE.MathUtils.lerp(rStart, rEnd, Math.pow(t, 0.78));

        for (let k = 0; k < 2; k++) {
          const theta = i * 2.39996 + k * Math.PI;
          const outDir = new THREE.Vector3(
            Math.cos(theta) * N.x + Math.sin(theta) * B.x,
            Math.cos(theta) * N.y + Math.sin(theta) * B.y,
            Math.cos(theta) * N.z + Math.sin(theta) * B.z
          ).normalize();

          const tLen = Math.max(0.06, rHere * 2.2 * thornScale * (1.1 - t * 0.35));
          const tBaseR = Math.max(0.014, rHere * 0.38);

          const p0 = pt.clone();
          const p1 = pt
            .clone()
            .addScaledVector(outDir, rHere + tLen * 0.55)
            .addScaledVector(T, tLen * 0.2);
          const p2 = p1
            .clone()
            .addScaledVector(outDir, tLen * 0.45)
            .addScaledVector(T, tLen * 0.38);

          detailGeometries.push(
            buildSmoothCurveTube(
              [p0, p1, p2],
              tBaseR,
              0.002,
              5,
              4,
              colLeafMain,
              colLeafTip,
              rand,
              0,
              0,
              true
            )
          );
        }
      }
    });
  } else if (
    !isClawOrCrownRosette &&
    !isMossyDeadwoodTrunk &&
    el.surfaceElement === 'moss_lichen_bark'
  ) {
    // When '3. Corteza Rugosa con Musgo' is selected on any standard tree, add sculpted 3D moss cushions along the bark
    const barkMossParts = buildSculptedBarkMossMantle(
      mainStemCurves.slice(0, 4),
      colLeafMain,
      colLeafTip,
      leafScale * 0.78,
      densityMult,
      0.55,
      rand
    );
    for (const mp of barkMossParts) {
      detailGeometries.push(mp);
    }
  } else if (!isClawOrCrownRosette && el.surfaceElement === 'strangler_root_web') {
    // ───────────────────────────────────────────────────────────────────────
    // 5. RED DE RAÍCES ENREDADERAS / FICUS ESTRANGULADOR ADHERIDAS AL TRONCO
    // Crisscrossing counter-helical root lattice hugging the bark contour
    // ───────────────────────────────────────────────────────────────────────
    mainStemCurves.slice(0, 6).forEach(({ curve, rStart, rEnd }, idx) => {
      const pairs = idx === 0 ? 3 : 2;
      const steps = 28;
      const frames = computeTwistFreeFrames(curve, steps);

      for (let pIdx = 0; pIdx < pairs; pIdx++) {
        for (const dirSign of [-1, 1]) {
          const rPts: THREE.Vector3[] = [];
          const phase = (pIdx / pairs) * Math.PI * 2 + (dirSign < 0 ? 0.5 : 0);
          for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const pt = curve.getPointAt(t);
            const N = frames.normals[i];
            const B = frames.binormals[i];
            const rStem = THREE.MathUtils.lerp(rStart, rEnd, Math.pow(t, 0.78));
            const ang = phase + dirSign * t * Math.PI * 3.8;
            const flare = t < 0.22 && idx === 0 ? (1 - t / 0.22) * rStart * 0.75 : 0;
            const offsetR = rStem * 0.82 + flare;
            rPts.push(
              new THREE.Vector3(
                pt.x + offsetR * (Math.cos(ang) * N.x + Math.sin(ang) * B.x),
                Math.max(-0.04, pt.y + offsetR * (Math.cos(ang) * N.y + Math.sin(ang) * B.y)),
                pt.z + offsetR * (Math.cos(ang) * N.z + Math.sin(ang) * B.z)
              )
            );
          }
          bodyGeometries.push(
            buildSmoothCurveTube(
              rPts,
              rStart * 0.22,
              rEnd * 0.18,
              Math.max(14, Math.round(20 * densityMult)),
              5,
              colTrunkDark,
              colAccent,
              rand,
              3,
              0.12,
              true
            )
          );
        }
      }
    });
  } else if (!isClawOrCrownRosette && el.surfaceElement === 'rose_hooked_prickles') {
    // ───────────────────────────────────────────────────────────────────────
    // 6. AGUIJONES GANCHUDOS DE ROSAL / ZARZA
    // Flattened recurved shark-fin prickles welded along stems
    // ───────────────────────────────────────────────────────────────────────
    const thornMult = Math.max(0.5, el.thornDensity || 1.1);
    const thornScale = Math.max(0.5, el.thornLength || 1.0);
    mainStemCurves.forEach(({ curve, rStart, rEnd }) => {
      const prickleCount = Math.max(8, Math.round(16 * thornMult * Math.min(1.3, densityMult)));
      const frames = computeTwistFreeFrames(curve, prickleCount);
      for (let i = 1; i < prickleCount; i++) {
        const t = i / prickleCount;
        const pt = curve.getPointAt(t);
        const T = frames.tangents[i];
        const N = frames.normals[i];
        const B = frames.binormals[i];
        const rHere = THREE.MathUtils.lerp(rStart, rEnd, Math.pow(t, 0.78));
        const theta = i * 2.39996;
        const outDir = new THREE.Vector3(
          Math.cos(theta) * N.x + Math.sin(theta) * B.x,
          Math.cos(theta) * N.y + Math.sin(theta) * B.y,
          Math.cos(theta) * N.z + Math.sin(theta) * B.z
        ).normalize();
        const pLen = Math.max(0.07, rHere * 2.4 * thornScale);
        // Hook downward (-T) at the tip like a true rose prickle
        const p0 = pt.clone().addScaledVector(outDir, rHere * 0.45);
        const p1 = pt
          .clone()
          .addScaledVector(outDir, rHere + pLen * 0.62)
          .addScaledVector(T, pLen * 0.08);
        const p2 = p1
          .clone()
          .addScaledVector(outDir, pLen * 0.35)
          .addScaledVector(T, -pLen * 0.42);
        const prickle = buildSmoothCurveTube(
          [p0, p1, p2],
          Math.max(0.02, rHere * 0.48),
          0.002,
          6,
          4,
          colTrunkDark,
          colFlower,
          rand,
          0,
          0,
          true
        );
        detailGeometries.push(prickle);
      }
    });
  } else if (!isClawOrCrownRosette && el.surfaceElement === 'cactus_areole_spine_bursts') {
    // ───────────────────────────────────────────────────────────────────────
    // 7. ARÉOLAS CON ESTALLIDO DE PÚAS LARGAS (CACTUS / ACACIA / EUPHORBIA)
    // Woolly cushion areoles with multi-needle radial spine bursts
    // ───────────────────────────────────────────────────────────────────────
    const thornMult = Math.max(0.5, el.thornDensity || 1.1);
    const thornScale = Math.max(0.5, el.thornLength || 1.15);
    mainStemCurves.slice(0, 6).forEach(({ curve, rStart, rEnd }) => {
      const areoleSteps = Math.max(6, Math.round(11 * thornMult * Math.min(1.25, densityMult)));
      const frames = computeTwistFreeFrames(curve, areoleSteps);
      for (let i = 1; i < areoleSteps; i++) {
        const t = i / areoleSteps;
        const pt = curve.getPointAt(t);
        const T = frames.tangents[i];
        const N = frames.normals[i];
        const B = frames.binormals[i];
        const rHere = THREE.MathUtils.lerp(rStart, rEnd, Math.pow(t, 0.78));
        for (let row = 0; row < 3; row++) {
          const theta = i * 1.15 + (row / 3) * Math.PI * 2;
          const outDir = new THREE.Vector3(
            Math.cos(theta) * N.x + Math.sin(theta) * B.x,
            Math.cos(theta) * N.y + Math.sin(theta) * B.y,
            Math.cos(theta) * N.z + Math.sin(theta) * B.z
          ).normalize();
          const sideDir = new THREE.Vector3().crossVectors(outDir, T).normalize();
          const areolePos = pt.clone().addScaledVector(outDir, rHere * 0.88);
          // 5 spines per areole (1 long central + 4 radial)
          const spineVectors = [
            outDir.clone(),
            outDir.clone().addScaledVector(T, 0.45).normalize(),
            outDir.clone().addScaledVector(T, -0.45).normalize(),
            outDir.clone().addScaledVector(sideDir, 0.45).normalize(),
            outDir.clone().addScaledVector(sideDir, -0.45).normalize(),
          ];
          spineVectors.forEach((sVec, sIdx) => {
            const sLen =
              Math.max(0.08, rHere * (sIdx === 0 ? 2.8 : 1.85) * thornScale) *
              (1.05 - t * 0.25);
            const tipPos = areolePos.clone().addScaledVector(sVec, sLen);
            const midPos = areolePos.clone().lerp(tipPos, 0.5);
            detailGeometries.push(
              buildSmoothCurveTube(
                [areolePos.clone().addScaledVector(outDir, -rHere * 0.2), midPos, tipPos],
                Math.max(0.008, rHere * (sIdx === 0 ? 0.18 : 0.12)),
                0.0015,
                3,
                4,
                colAccent,
                colLeafTip,
                rand,
                0,
                0,
                true
              )
            );
          });
        }
      }
    });
  } else if (!isClawOrCrownRosette && el.surfaceElement === 'armored_dragon_scales') {
    // ───────────────────────────────────────────────────────────────────────
    // 8. ESCAMAS ACORAZADAS DE CÍCADA / PANGOLÍN
    // Overlapping diamond armor plates wrapped in phyllotactic spirals around stems
    // ───────────────────────────────────────────────────────────────────────
    mainStemCurves.slice(0, 5).forEach(({ curve, rStart, rEnd }) => {
      const rings = Math.max(8, Math.round(14 * Math.min(1.3, densityMult)));
      const frames = computeTwistFreeFrames(curve, rings);
      for (let i = 1; i < rings; i++) {
        const t = i / rings;
        const pt = curve.getPointAt(t);
        const T = frames.tangents[i];
        const N = frames.normals[i];
        const B = frames.binormals[i];
        const rHere = THREE.MathUtils.lerp(rStart, rEnd, Math.pow(t, 0.78));
        const scalesInRing = 5;
        for (let s = 0; s < scalesInRing; s++) {
          const theta = (s / scalesInRing) * Math.PI * 2 + (i % 2) * (Math.PI / scalesInRing);
          const outDir = new THREE.Vector3(
            Math.cos(theta) * N.x + Math.sin(theta) * B.x,
            Math.cos(theta) * N.y + Math.sin(theta) * B.y,
            Math.cos(theta) * N.z + Math.sin(theta) * B.z
          ).normalize();
          const scaleDir = outDir.clone().multiplyScalar(0.58).addScaledVector(T, 0.65).normalize();
          const scLen = Math.max(0.08, rHere * 1.45);
          const scGeo = buildCustomContouredLeaf(
            scLen,
            0.78,
            1,
            0.22,
            colTrunkDark,
            colAccent,
            rand
          );
          const qRot = new THREE.Quaternion().setFromUnitVectors(
            new THREE.Vector3(0, 1, 0),
            scaleDir
          );
          const m = new THREE.Matrix4().makeRotationFromQuaternion(qRot);
          m.setPosition(
            pt.x + outDir.x * rHere * 0.72,
            pt.y + outDir.y * rHere * 0.72,
            pt.z + outDir.z * rHere * 0.72
          );
          scGeo.applyMatrix4(m);
          detailGeometries.push(scGeo);
        }
      }
    });
  } else if (!isClawOrCrownRosette && el.surfaceElement === 'shelf_fungi_conks') {
    // ───────────────────────────────────────────────────────────────────────
    // 9. HONGOS DE REPISA / YESQUEROS ESCALONADOS (GANODERMA / TRAMETES)
    // Semicircular tiered polypore bracket fungi shelves welded into the bark
    // ───────────────────────────────────────────────────────────────────────
    mainStemCurves.slice(0, 4).forEach(({ curve, rStart, rEnd }, cIdx) => {
      const conkCount = cIdx === 0 ? 9 : 4;
      const frames = computeTwistFreeFrames(curve, conkCount + 2);
      for (let i = 1; i <= conkCount; i++) {
        const t = 0.14 + (i / (conkCount + 1)) * 0.72;
        const pt = curve.getPointAt(t);
        const N = frames.normals[i];
        const B = frames.binormals[i];
        const rHere = THREE.MathUtils.lerp(rStart, rEnd, Math.pow(t, 0.78));
        const theta = i * 2.39996 + cIdx * 1.1;
        const outDir = new THREE.Vector3(
          Math.cos(theta) * N.x + Math.sin(theta) * B.x,
          0,
          Math.cos(theta) * N.z + Math.sin(theta) * B.z
        ).normalize();
        const conkR = Math.max(0.09, rHere * (1.25 + (i % 3) * 0.35) * leafScale);
        const conkGeo = new THREE.CylinderGeometry(
          conkR,
          conkR * 0.65,
          conkR * 0.28,
          14,
          2,
          false,
          -Math.PI * 0.62,
          Math.PI * 1.24
        );
        const cPos = conkGeo.attributes.position as THREE.BufferAttribute;
        for (let v = 0; v < cPos.count; v++) {
          const vx = cPos.getX(v);
          const vy = cPos.getY(v);
          const vz = cPos.getZ(v);
          const rDist = Math.sqrt(vx * vx + vz * vz) / Math.max(0.001, conkR);
          const ringWave = Math.sin(rDist * Math.PI * 4) * conkR * 0.04;
          cPos.setY(v, vy + ringWave);
        }
        conkGeo.computeVertexNormals();
        colorizeGeometryByHeight(conkGeo, colLeafMain, colLeafTip, -conkR * 0.15, conkR * 0.2);
        const yaw = Math.atan2(outDir.x, outDir.z);
        conkGeo.rotateY(yaw);
        conkGeo.translate(
          pt.x + outDir.x * rHere * 0.65,
          pt.y,
          pt.z + outDir.z * rHere * 0.65
        );
        detailGeometries.push(conkGeo);
      }
    });
  } else if (!isClawOrCrownRosette && el.surfaceElement === 'biolum_nodule_pustules') {
    // ───────────────────────────────────────────────────────────────────────
    // 10. NÓDULOS Y PÚSTULAS BIOLUMINISCENTES SCI-FI
    // Glowing alien spore blisters embedded in craters along the trunk and limbs
    // ───────────────────────────────────────────────────────────────────────
    mainStemCurves.slice(0, 6).forEach(({ curve, rStart, rEnd }) => {
      const noduleSteps = Math.max(7, Math.round(12 * Math.min(1.3, densityMult)));
      const frames = computeTwistFreeFrames(curve, noduleSteps);
      for (let i = 1; i < noduleSteps; i++) {
        const t = i / noduleSteps;
        const pt = curve.getPointAt(t);
        const N = frames.normals[i];
        const B = frames.binormals[i];
        const rHere = THREE.MathUtils.lerp(rStart, rEnd, Math.pow(t, 0.78));
        for (let k = 0; k < 2; k++) {
          const theta = i * 2.39996 + k * Math.PI * 0.95;
          const outDir = new THREE.Vector3(
            Math.cos(theta) * N.x + Math.sin(theta) * B.x,
            Math.cos(theta) * N.y + Math.sin(theta) * B.y,
            Math.cos(theta) * N.z + Math.sin(theta) * B.z
          ).normalize();
          const nodR = Math.max(0.045, rHere * (0.48 + (i % 3) * 0.14));
          const nodGeo = new THREE.IcosahedronGeometry(nodR, 1);
          colorizeGeometryByHeight(nodGeo, colFlower, colAccent, -nodR, nodR);
          nodGeo.translate(
            pt.x + outDir.x * (rHere * 0.78),
            pt.y + outDir.y * (rHere * 0.78),
            pt.z + outDir.z * (rHere * 0.78)
          );
          detailGeometries.push(nodGeo);
        }
      }
    });
  } else if (!isClawOrCrownRosette && el.surfaceElement === 'rhomboid_pinecone_scales') {
    // Escamas romboidales gruesas tipo piña/palma blindada
    mainStemCurves.slice(0, 4).forEach(({ curve, rStart, rEnd }) => {
      const rings = Math.max(9, Math.round(15 * Math.min(1.25, densityMult)));
      const frames = computeTwistFreeFrames(curve, rings);
      for (let i = 1; i < rings; i++) {
        const t = i / rings;
        const pt = curve.getPointAt(t);
        const N = frames.normals[i];
        const B = frames.binormals[i];
        const rHere = THREE.MathUtils.lerp(rStart, rEnd, Math.pow(t, 0.75));
        for (let s = 0; s < 6; s++) {
          const theta = (s / 6) * Math.PI * 2 + (i % 2) * (Math.PI / 6);
          const outDir = new THREE.Vector3(
            Math.cos(theta) * N.x + Math.sin(theta) * B.x,
            Math.cos(theta) * N.y + Math.sin(theta) * B.y,
            Math.cos(theta) * N.z + Math.sin(theta) * B.z
          ).normalize();
          const scGeo = new THREE.IcosahedronGeometry(Math.max(0.05, rHere * 0.56), 0);
          scGeo.scale(1.15, 0.85, 0.52);
          scGeo.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), outDir)));
          scGeo.translate(pt.x + outDir.x * rHere * 0.84, pt.y + outDir.y * rHere * 0.84, pt.z + outDir.z * rHere * 0.84);
          const sStd = ensureStandardAttributes(scGeo);
          colorizeGeometryGradient(sStd, colTrunkDark, colLeafMain, rand, 0.04);
          detailGeometries.push(sStd);
        }
      }
    });
  } else if (!isClawOrCrownRosette && el.surfaceElement === 'fleshy_tubercles_warts') {
    // Tubérculos y verrugas agrupadas orgánicas sobre corteza
    mainStemCurves.slice(0, 4).forEach(({ curve, rStart, rEnd }) => {
      const steps = Math.max(8, Math.round(12 * Math.min(1.25, densityMult)));
      const frames = computeTwistFreeFrames(curve, steps);
      for (let i = 1; i < steps; i++) {
        const t = i / steps;
        const pt = curve.getPointAt(t);
        const N = frames.normals[i];
        const B = frames.binormals[i];
        const rHere = THREE.MathUtils.lerp(rStart, rEnd, t);
        for (let k = 0; k < 3; k++) {
          const theta = i * 2.39996 + k * 2.1;
          const outDir = new THREE.Vector3(
            Math.cos(theta) * N.x + Math.sin(theta) * B.x,
            Math.cos(theta) * N.y + Math.sin(theta) * B.y,
            Math.cos(theta) * N.z + Math.sin(theta) * B.z
          ).normalize();
          const wartR = Math.max(0.04, rHere * (0.34 + rand() * 0.28));
          const wartGeo = new THREE.IcosahedronGeometry(wartR, 1);
          wartGeo.translate(pt.x + outDir.x * rHere * 0.82, pt.y + outDir.y * rHere * 0.82, pt.z + outDir.z * rHere * 0.82);
          const wStd = ensureStandardAttributes(wartGeo);
          colorizeGeometryGradient(wStd, colFlower, colLeafTip, rand, 0.05);
          detailGeometries.push(wStd);
        }
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LAYER 3: CANOPY / FOLIAGE / SYNTHESIZED UMBEL / FLORET / BELL / BUD / CAP / MOSS MANTLE
  // ═══════════════════════════════════════════════════════════════════════════
  const golden = 2.39996323;
  const padSubBranchCurves: { curve: THREE.CatmullRomCurve3; rStart: number; rEnd: number }[] = [];

  if (isMossyDeadwoodTrunk) {
    // 3D Bryophyte Moss Mantle & Gametophyte Filaments hugging the dorsal ridges & crevices of the twisted trunk!
    const mossParts = buildSculptedBarkMossMantle(
      mainStemCurves,
      colLeafMain,
      colLeafTip,
      leafScale,
      densityMult,
      1.05,
      rand
    );
    for (const mp of mossParts) {
      detailGeometries.push(mp);
    }
  } else if (
    el.canopyElement === 'spherical_bubble_umbel' ||
    el.synthesizedHeadTopology === 'spherical_umbel_rays'
  ) {
    // 3D Spherical Bubble / Dandelion / Allium Umbel welded onto each stalk apex!
    canopyAttachmentNodes.forEach((node) => {
      const umbelScale = Math.max(0.45, node.radius * (node.isPrimaryApex ? 1.15 : 0.8));
      const umbelParts = buildSculptedSphericalBubbleUmbel(
        el,
        umbelScale,
        colTrunk,
        colLeafMain,
        colLeafTip,
        colFlower,
        colAccent,
        densityMult,
        rand
      );
      const upDir = new THREE.Vector3(0, 1, 0);
      const aimDir = node.dir.clone().lerp(upDir, 0.72).normalize();
      const qAlign = new THREE.Quaternion().setFromUnitVectors(upDir, aimDir);
      const mat = new THREE.Matrix4().makeRotationFromQuaternion(qAlign);
      mat.setPosition(node.pos.x, node.pos.y, node.pos.z);

      umbelParts.forEach((up) => {
        up.applyMatrix4(mat);
        detailGeometries.push(up);
      });
    });
  } else if (
    el.canopyElement === 'radiating_floret_head' ||
    el.synthesizedHeadTopology === 'layered_petal_starburst'
  ) {
    canopyAttachmentNodes.forEach((node) => {
      const headScale = Math.max(0.42, node.radius * (node.isPrimaryApex ? 1.12 : 0.78));
      const headParts = buildSculptedRadiatingFloretHead(
        el,
        headScale,
        colTrunk,
        colLeafMain,
        colLeafTip,
        colFlower,
        colAccent,
        densityMult,
        rand
      );
      const upDir = new THREE.Vector3(0, 1, 0);
      const aimDir = node.dir.clone().lerp(upDir, 0.65).normalize();
      const qAlign = new THREE.Quaternion().setFromUnitVectors(upDir, aimDir);
      const mat = new THREE.Matrix4().makeRotationFromQuaternion(qAlign);
      mat.setPosition(node.pos.x, node.pos.y, node.pos.z);

      headParts.forEach((hp) => {
        hp.applyMatrix4(mat);
        detailGeometries.push(hp);
      });
    });
  } else if (
    el.canopyElement === 'hanging_bell_cluster' ||
    el.synthesizedHeadTopology === 'hanging_bell_raceme'
  ) {
    canopyAttachmentNodes.forEach((node) => {
      const bellScale = Math.max(0.4, node.radius * (node.isPrimaryApex ? 1.1 : 0.78));
      const bellParts = buildSculptedHangingBellCluster(
        el,
        bellScale,
        colTrunk,
        colLeafMain,
        colLeafTip,
        colFlower,
        colAccent,
        densityMult,
        rand
      );
      const mat = new THREE.Matrix4().makeTranslation(node.pos.x, node.pos.y, node.pos.z);
      bellParts.forEach((bp) => {
        bp.applyMatrix4(mat);
        detailGeometries.push(bp);
      });
    });
  } else if (
    el.canopyElement === 'crystal_prism_crown' ||
    el.synthesizedHeadTopology === 'crystal_spire_cluster'
  ) {
    canopyAttachmentNodes.forEach((node) => {
      const crownScale = Math.max(0.4, node.radius * (node.isPrimaryApex ? 1.12 : 0.8));
      const crownParts = buildSculptedCrystalPrismCrown(
        el,
        crownScale,
        colTrunk,
        colLeafMain,
        colLeafTip,
        colFlower,
        colAccent,
        densityMult,
        rand
      );
      const upDir = new THREE.Vector3(0, 1, 0);
      const aimDir = node.dir.clone().lerp(upDir, 0.65).normalize();
      const qAlign = new THREE.Quaternion().setFromUnitVectors(upDir, aimDir);
      const mat = new THREE.Matrix4().makeRotationFromQuaternion(qAlign);
      mat.setPosition(node.pos.x, node.pos.y, node.pos.z);

      crownParts.forEach((cp) => {
        cp.applyMatrix4(mat);
        detailGeometries.push(cp);
      });
    });
  } else if (
    el.canopyElement === 'procedural_lathe_head' ||
    el.synthesizedHeadTopology === 'revolved_lathe_chalice'
  ) {
    canopyAttachmentNodes.forEach((node) => {
      const latheScale = Math.max(0.42, node.radius * (node.isPrimaryApex ? 1.12 : 0.8));
      const latheParts = buildSculptedProceduralLatheHead(
        el,
        latheScale,
        colTrunk,
        colLeafMain,
        colLeafTip,
        colFlower,
        colAccent,
        densityMult,
        rand
      );
      const upDir = new THREE.Vector3(0, 1, 0);
      const aimDir = node.dir.clone().lerp(upDir, 0.65).normalize();
      const qAlign = new THREE.Quaternion().setFromUnitVectors(upDir, aimDir);
      const mat = new THREE.Matrix4().makeRotationFromQuaternion(qAlign);
      mat.setPosition(node.pos.x, node.pos.y, node.pos.z);

      latheParts.forEach((lp) => {
        lp.applyMatrix4(mat);
        detailGeometries.push(lp);
      });
    });
  } else if (
    el.canopyElement === 'custom_spline_leaf_crown' ||
    el.synthesizedHeadTopology === 'spline_petal_corona'
  ) {
    canopyAttachmentNodes.forEach((node) => {
      const splineScale = Math.max(0.42, node.radius * (node.isPrimaryApex ? 1.16 : 0.82));
      const splineParts = buildSculptedSplineLeafCrown(
        el,
        splineScale,
        colTrunk,
        colLeafMain,
        colLeafTip,
        colFlower,
        colAccent,
        densityMult,
        rand
      );
      const upDir = new THREE.Vector3(0, 1, 0);
      const aimDir = node.dir.clone().lerp(upDir, 0.58).normalize();
      const qAlign = new THREE.Quaternion().setFromUnitVectors(upDir, aimDir);
      const mat = new THREE.Matrix4().makeRotationFromQuaternion(qAlign);
      mat.setPosition(node.pos.x, node.pos.y, node.pos.z);

      splineParts.forEach((sp) => {
        sp.applyMatrix4(mat);
        detailGeometries.push(sp);
      });
    });
  } else if (el.canopyElement === 'custom_fungi_cap') {
    canopyAttachmentNodes.forEach((node) => {
      const capScale = Math.max(0.28, node.radius * 1.15);
      const capParts = buildSculptedUmbrellaFungiCap(
        el,
        capScale,
        colTrunkDark,
        colLeafMain,
        colLeafTip,
        colFlower,
        colTrunkDark,
        densityMult,
        true,
        rand
      );

      const upDir = new THREE.Vector3(0, 1, 0);
      const aimDir = node.dir.clone().lerp(upDir, 0.72).normalize();
      const qAlign = new THREE.Quaternion().setFromUnitVectors(upDir, aimDir);
      const mat = new THREE.Matrix4().makeRotationFromQuaternion(qAlign);
      mat.setPosition(node.pos.x, node.pos.y, node.pos.z);

      capParts.forEach((cp) => {
        cp.applyMatrix4(mat);
        detailGeometries.push(cp);
      });
    });
  } else if (el.canopyElement === 'stem_hugging_leaves') {
    mainStemCurves.forEach(({ curve, rStart, rEnd }) => {
      const leafNodes = Math.max(
        14,
        Math.round((22 + (p.leafDensity || 5) * 4) * Math.min(1.4, densityMult))
      );
      const frames = computeTwistFreeFrames(curve, leafNodes);

      for (let i = 1; i <= leafNodes; i++) {
        const t = i / (leafNodes + 1);
        const pt = curve.getPointAt(t);
        const T = frames.tangents[i];
        const N = frames.normals[i];
        const B = frames.binormals[i];
        const rHere = THREE.MathUtils.lerp(rStart, rEnd, Math.pow(t, 0.78));

        const leavesHere = t < 0.25 ? 3 : 4;
        for (let l = 0; l < leavesHere; l++) {
          const ang = i * golden + l * ((Math.PI * 2) / leavesHere);
          const radialOut = new THREE.Vector3(
            Math.cos(ang) * N.x + Math.sin(ang) * B.x,
            Math.cos(ang) * N.y + Math.sin(ang) * B.y,
            Math.cos(ang) * N.z + Math.sin(ang) * B.z
          ).normalize();

          const leafDir = radialOut
            .clone()
            .multiplyScalar(0.65)
            .addScaledVector(T, 0.55)
            .normalize();

          const lSize =
            (0.32 + (1 - t * 0.42) * 0.28) *
            leafScale *
            (0.85 + rand() * 0.3);
          const leafGeo = buildCustomContouredLeaf(
            lSize,
            p.leafWidthRatio || 0.62,
            el.lobeCount || 1,
            p.leafBend || 0.38,
            colLeafMain,
            colLeafTip,
            rand
          );

          const qRot = new THREE.Quaternion().setFromUnitVectors(
            new THREE.Vector3(0, 1, 0),
            leafDir
          );
          const m = new THREE.Matrix4().makeRotationFromQuaternion(qRot);
          m.setPosition(
            pt.x + radialOut.x * rHere * 0.42,
            pt.y + radialOut.y * rHere * 0.42,
            pt.z + radialOut.z * rHere * 0.42
          );
          leafGeo.applyMatrix4(m);
          detailGeometries.push(leafGeo);
        }
      }
    });
  } else if (el.canopyElement === 'cloud_bonsai_pads') {
    canopyAttachmentNodes.forEach((node) => {
      const padR = Math.max(0.48, node.radius * 0.88);
      const padH = padR * 0.34;
      const subLobeCount = 5;

      const centerCushion = buildSculptedCloudCushionCore(
        padR * 0.56,
        padH * 0.85,
        padR * 0.56,
        colLeafDark,
        colLeafMain,
        colLeafTip,
        densityMult,
        rand
      );
      centerCushion.translate(node.pos.x, node.pos.y, node.pos.z);
      detailGeometries.push(centerCushion);

      const cushionCenters: { pos: THREE.Vector3; rx: number; ry: number }[] = [
        { pos: node.pos.clone(), rx: padR * 0.56, ry: padH * 0.85 },
      ];

      for (let sb = 0; sb < subLobeCount; sb++) {
        const sbAng = (sb / subLobeCount) * Math.PI * 2 + (rand() - 0.5) * 0.22;
        const sbDist = padR * (0.48 + (sb % 2) * 0.14);
        const sbEndPos = new THREE.Vector3(
          node.pos.x + Math.cos(sbAng) * sbDist,
          node.pos.y + padH * (0.06 + (sb % 2) * 0.08),
          node.pos.z + Math.sin(sbAng) * sbDist
        );
        const sbMidPos = new THREE.Vector3(
          node.pos.x + Math.cos(sbAng) * sbDist * 0.52,
          node.pos.y + padH * 0.03,
          node.pos.z + Math.sin(sbAng) * sbDist * 0.52
        );

        const twigRStart = Math.max(0.018, node.stemRadius * 0.72);
        const twigREnd = Math.max(0.01, twigRStart * 0.42);
        const twigPts = [node.pos.clone(), sbMidPos, sbEndPos];
        bodyGeometries.push(
          buildSmoothCurveTube(
            twigPts,
            twigRStart,
            twigREnd,
            6,
            Math.max(5, radialSegs - 2),
            colTrunkDark,
            colTrunk,
            rand,
            4,
            0.08,
            false
          )
        );
        padSubBranchCurves.push({
          curve: new THREE.CatmullRomCurve3(twigPts),
          rStart: twigRStart,
          rEnd: twigREnd,
        });

        const lobeR = padR * (0.44 + (rand() - 0.5) * 0.06);
        const lobeH = padH * (0.72 + (rand() - 0.5) * 0.08);
        const lobeCushion = buildSculptedCloudCushionCore(
          lobeR,
          lobeH,
          lobeR,
          colLeafDark,
          colLeafMain,
          sb % 2 === 0 ? colLeafTip : colFlower,
          densityMult,
          rand
        );
        lobeCushion.translate(sbEndPos.x, sbEndPos.y, sbEndPos.z);
        detailGeometries.push(lobeCushion);

        cushionCenters.push({ pos: sbEndPos, rx: lobeR, ry: lobeH });
      }

      const leavesPerCushion = Math.max(6, Math.round(9 * Math.min(1.4, densityMult)));
      cushionCenters.forEach((cNode, cIdx) => {
        for (let l = 0; l < leavesPerCushion; l++) {
          const u = (l + 0.5) / leavesPerCushion;
          const lAng = l * golden + cIdx * 1.1;
          const lRad = Math.sqrt(u) * cNode.rx * 0.65;
          const domeY = Math.cos((lRad / cNode.rx) * Math.PI * 0.5) * cNode.ry * 0.68;

          const lx = cNode.pos.x + Math.cos(lAng) * lRad;
          const lz = cNode.pos.z + Math.sin(lAng) * lRad;
          const ly = cNode.pos.y + domeY;

          const outDir = new THREE.Vector3(
            Math.cos(lAng) * (0.35 + u * 0.55),
            0.85 - u * 0.35,
            Math.sin(lAng) * (0.35 + u * 0.55)
          ).normalize();

          const leaf = buildCustomContouredLeaf(
            cNode.rx * (0.46 + (1 - u * 0.25) * 0.16),
            0.72,
            el.lobeCount || 3,
            0.26,
            colLeafMain,
            l % 2 === 0 ? colLeafTip : colFlower,
            rand
          );
          const qRot = new THREE.Quaternion().setFromUnitVectors(
            new THREE.Vector3(0, 1, 0),
            outDir
          );
          const m = new THREE.Matrix4().makeRotationFromQuaternion(qRot);
          m.setPosition(lx, ly, lz);
          leaf.applyMatrix4(m);
          detailGeometries.push(leaf);
        }
      });
    });
  } else if (el.canopyElement === 'custom_flower_corolla') {
    canopyAttachmentNodes.forEach((node) => {
      const budScale = Math.max(0.45, node.radius * (node.isPrimaryApex ? 1.15 : 0.78));
      const budParts = buildSculptedFlowerCorollaOrBud(
        el,
        budScale,
        colTrunk,
        colLeafMain,
        colLeafTip,
        colFlower,
        densityMult,
        rand
      );

      const upDir = new THREE.Vector3(0, 1, 0);
      const aimDir = node.dir.clone().lerp(upDir, 0.55).normalize();
      const qAlign = new THREE.Quaternion().setFromUnitVectors(upDir, aimDir);
      const mat = new THREE.Matrix4().makeRotationFromQuaternion(qAlign);
      mat.setPosition(node.pos.x, node.pos.y, node.pos.z);

      budParts.forEach((bp) => {
        bp.applyMatrix4(mat);
        detailGeometries.push(bp);
      });
    });
  } else if (!isClawOrCrownRosette || el.canopyElement !== 'thorn_spur_clusters') {
    canopyAttachmentNodes.forEach((node) => {
      const clusterParts = buildCustomElementFoliageCluster(
        el,
        Math.max(0.35, node.radius),
        colLeafMain,
        colLeafTip,
        colFlower,
        densityMult,
        rand
      );
      const upDir = new THREE.Vector3(0, 1, 0);
      const aimDir = node.dir.clone().lerp(upDir, 0.62).normalize();
      const qAlign = new THREE.Quaternion().setFromUnitVectors(upDir, aimDir);
      const mat = new THREE.Matrix4().makeRotationFromQuaternion(qAlign);
      mat.setPosition(node.pos.x, node.pos.y, node.pos.z);

      clusterParts.forEach((cp) => {
        cp.applyMatrix4(mat);
        detailGeometries.push(cp);
      });
    });
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // LAYER 4: HANGING / TENDRIL / FILAMENT ELEMENT ("hangingElement")
  // (Skip extra stem filaments if buildSculptedUmbrellaFungiCap already placed under-cap filaments)
  // ═══════════════════════════════════════════════════════════════════════════
  const filCount = Math.max(0, Math.round((el.filamentCount ?? 10) * Math.min(1.4, densityMult)));
  const filLenMult = THREE.MathUtils.clamp(el.filamentLength ?? 1.0, 0.3, 2.2);

  const branchSources =
    padSubBranchCurves.length > 0
      ? [...padSubBranchCurves, ...mainStemCurves.slice(1)]
      : mainStemCurves;

  if (
    el.canopyElement !== 'custom_fungi_cap' &&
    el.hangingElement === 'weeping_filaments' &&
    filCount > 0 &&
    branchSources.length > 0
  ) {
    // Organic weeping aerial filaments anchored directly inside physical wooden branches/sub-twigs
    const totalStrands = Math.max(8, Math.min(28, filCount * 2));
    for (let f = 0; f < totalStrands; f++) {
      const src = branchSources[f % branchSources.length];
      const kt = 0.28 + ((f * 0.37) % 0.66);
      // Exact centerline point inside the wooden branch!
      const origin = src.curve.getPointAt(kt);
      const dropLen = H * (0.16 + rand() * 0.2) * filLenMult;
      const swayAng = f * golden + rand() * 0.5;
      const swayR = dropLen * (0.08 + rand() * 0.08);

      const fPts = [
        origin.clone(),
        new THREE.Vector3(
          origin.x + Math.cos(swayAng) * swayR * 0.4,
          origin.y - dropLen * 0.33,
          origin.z + Math.sin(swayAng) * swayR * 0.4
        ),
        new THREE.Vector3(
          origin.x + Math.cos(swayAng + 0.8) * swayR,
          origin.y - dropLen * 0.68,
          origin.z + Math.sin(swayAng + 0.8) * swayR
        ),
        new THREE.Vector3(
          origin.x + Math.cos(swayAng + 1.4) * swayR * 0.7,
          origin.y - dropLen,
          origin.z + Math.sin(swayAng + 1.4) * swayR * 0.7
        ),
      ];
      detailGeometries.push(
        buildSmoothCurveTube(
          fPts,
          0.014 * leafScale,
          0.003 * leafScale,
          8,
          4,
          colTrunk,
          colFlower,
          rand,
          0,
          0,
          true
        )
      );
    }
  } else if (
    el.hangingElement === 'curling_tendrils' &&
    filCount > 0 &&
    branchSources.length > 0
  ) {
    // Helical curling tendrils starting at the exact centerline of physical wooden stems
    const totalTendrils = Math.max(6, Math.min(20, Math.round(filCount * 1.2)));
    for (let tc = 0; tc < totalTendrils; tc++) {
      const src = branchSources[tc % branchSources.length];
      const kt = 0.24 + ((tc * 0.41) % 0.68);
      const origin = src.curve.getPointAt(kt);
      const side = tc % 2 === 0 ? 1 : -1;
      const yaw = tc * golden;
      const tLen = H * (0.14 + rand() * 0.14) * filLenMult;
      const tPts: THREE.Vector3[] = [];
      const steps = 16;

      for (let s = 0; s <= steps; s++) {
        const u = s / steps;
        const coilAng = u * Math.PI * 3.6 * side;
        // At u=0, coilR is 0 and radial offset is 0, so tPts[0] === origin (inside the wooden branch!)
        const coilR = tLen * 0.18 * u * (1 - u * 0.45);
        tPts.push(
          new THREE.Vector3(
            origin.x + Math.cos(yaw) * u * tLen * 0.38 + Math.cos(coilAng) * coilR,
            origin.y - u * tLen * 0.72 + Math.sin(coilAng) * coilR * 0.45,
            origin.z + Math.sin(yaw) * u * tLen * 0.38 + Math.sin(coilAng) * coilR * 0.45
          )
        );
      }
      detailGeometries.push(
        buildSmoothCurveTube(
          tPts,
          0.015 * leafScale,
          0.003 * leafScale,
          12,
          4,
          colTrunk,
          colLeafTip,
          rand,
          0,
          0,
          true
        )
      );
    }
  } else if (el.hangingElement === 'mycelial_fuzz' && filCount > 0) {
    for (let f = 0; f < filCount * 2; f++) {
      const ang = (f / (filCount * 2)) * Math.PI * 2 + rand() * 0.3;
      // Start inside the trunk collar base (R * 0.2) so basal filaments are welded to the trunk!
      const startDist = R * 0.2;
      const fLen = R * (1.1 + rand() * 1.1) * filLenMult;
      const p0 = new THREE.Vector3(Math.cos(ang) * startDist, R * 0.18, Math.sin(ang) * startDist);
      const p1 = new THREE.Vector3(
        Math.cos(ang) * (startDist + fLen * 0.5),
        R * 0.22 + fLen * 0.25,
        Math.sin(ang) * (startDist + fLen * 0.5)
      );
      const p2 = new THREE.Vector3(
        Math.cos(ang + 0.2) * (startDist + fLen),
        0.02,
        Math.sin(ang + 0.2) * (startDist + fLen)
      );
      detailGeometries.push(
        buildSmoothCurveTube(
          [p0, p1, p2],
          0.013,
          0.002,
          6,
          4,
          colTrunk,
          colAccent,
          rand,
          0,
          0,
          true
        )
      );
    }
  } else if (
    el.hangingElement === 'hanging_pods_berries' &&
    filCount > 0 &&
    branchSources.length > 0
  ) {
    // 4. VAINAS Y BAYAS COLGANTES
    const podCount = Math.max(6, Math.min(20, filCount));
    for (let pIdx = 0; pIdx < podCount; pIdx++) {
      const src = branchSources[pIdx % branchSources.length];
      const kt = 0.32 + ((pIdx * 0.37) % 0.62);
      const origin = src.curve.getPointAt(kt);
      const stalkLen = H * (0.09 + rand() * 0.08) * filLenMult;
      const tipPos = new THREE.Vector3(origin.x, origin.y - stalkLen, origin.z);
      detailGeometries.push(
        buildSmoothCurveTube(
          [origin.clone(), origin.clone().lerp(tipPos, 0.5), tipPos.clone()],
          0.014 * leafScale,
          0.008 * leafScale,
          5,
          4,
          colTrunkDark,
          colTrunk,
          rand,
          0,
          0,
          true
        )
      );
      const podR = Math.max(0.055, H * 0.032 * leafScale);
      const podGeo = new THREE.SphereGeometry(podR, 8, 8);
      podGeo.scale(0.65, 1.85, 0.65);
      colorizeGeometryByHeight(podGeo, colLeafMain, colFlower, -podR * 1.8, podR * 1.8);
      podGeo.translate(tipPos.x, tipPos.y - podR * 1.4, tipPos.z);
      detailGeometries.push(podGeo);
    }
  } else if (
    el.hangingElement === 'aerial_root_curtains' &&
    filCount > 0 &&
    branchSources.length > 0
  ) {
    // 6. CORTINA DE RAÍCES AÉREAS HASTA EL SUELO (BANYAN / CISSUS)
    const rootCount = Math.max(8, Math.min(24, Math.round(filCount * 1.5)));
    for (let rIdx = 0; rIdx < rootCount; rIdx++) {
      const src = branchSources[rIdx % branchSources.length];
      const kt = 0.25 + ((rIdx * 0.39) % 0.68);
      const origin = src.curve.getPointAt(kt);
      const reachGround = rIdx % 2 === 0;
      const targetY = reachGround ? -0.04 : Math.max(0.15, origin.y - H * 0.42 * filLenMult);
      const swayAng = rIdx * golden;
      const swayR = H * 0.04;
      const rPts = [
        origin.clone(),
        new THREE.Vector3(
          origin.x + Math.cos(swayAng) * swayR,
          origin.y - (origin.y - targetY) * 0.36,
          origin.z + Math.sin(swayAng) * swayR
        ),
        new THREE.Vector3(
          origin.x - Math.cos(swayAng) * swayR * 0.5,
          origin.y - (origin.y - targetY) * 0.72,
          origin.z - Math.sin(swayAng) * swayR * 0.5
        ),
        new THREE.Vector3(origin.x, targetY, origin.z),
      ];
      bodyGeometries.push(
        buildSmoothCurveTube(
          rPts,
          0.026 * leafScale,
          reachGround ? 0.032 * leafScale : 0.008 * leafScale,
          10,
          5,
          colTrunkDark,
          colTrunk,
          rand,
          3,
          0.1,
          !reachGround
        )
      );
    }
  } else if (
    el.hangingElement === 'winged_samara_seeds' &&
    filCount > 0 &&
    branchSources.length > 0
  ) {
    // 7. RACIMOS DE SEMILLAS ALADAS / SÁMARAS DE ARCE Y FRESNO
    const clusterCount = Math.max(6, Math.min(18, filCount));
    for (let cIdx = 0; cIdx < clusterCount; cIdx++) {
      const src = branchSources[cIdx % branchSources.length];
      const kt = 0.3 + ((cIdx * 0.41) % 0.64);
      const origin = src.curve.getPointAt(kt);
      const dropLen = H * 0.08 * filLenMult;
      const tipPos = new THREE.Vector3(origin.x, origin.y - dropLen, origin.z);
      detailGeometries.push(
        buildSmoothCurveTube(
          [origin.clone(), origin.clone().lerp(tipPos, 0.5), tipPos.clone()],
          0.012 * leafScale,
          0.006 * leafScale,
          4,
          4,
          colTrunkDark,
          colLeafMain,
          rand,
          0,
          0,
          true
        )
      );
      // Paired V-winged samara keys
      const wingLen = Math.max(0.11, H * 0.065 * leafScale);
      const yaw = cIdx * golden;
      for (const side of [-1, 1]) {
        const wingDir = new THREE.Vector3(
          Math.cos(yaw) * side * 0.72,
          -0.68,
          Math.sin(yaw) * side * 0.72
        ).normalize();
        const wingGeo = buildCustomContouredLeaf(
          wingLen,
          0.42,
          1,
          0.18,
          colLeafMain,
          colAccent,
          rand
        );
        const qRot = new THREE.Quaternion().setFromUnitVectors(
          new THREE.Vector3(0, 1, 0),
          wingDir
        );
        const m = new THREE.Matrix4().makeRotationFromQuaternion(qRot);
        m.setPosition(tipPos.x, tipPos.y, tipPos.z);
        wingGeo.applyMatrix4(m);
        detailGeometries.push(wingGeo);
      }
    }
  } else if (
    el.hangingElement === 'tethered_scifi_lantern_globes' &&
    filCount > 0 &&
    branchSources.length > 0
  ) {
    // 8. GLOBOS FAROL BIOLUMINISCENTES SUSPENDIDOS (SCI-FI)
    const lanternCount = Math.max(5, Math.min(16, filCount));
    for (let lIdx = 0; lIdx < lanternCount; lIdx++) {
      const src = branchSources[lIdx % branchSources.length];
      const kt = 0.28 + ((lIdx * 0.37) % 0.66);
      const origin = src.curve.getPointAt(kt);
      const cordLen = H * (0.14 + (lIdx % 3) * 0.05) * filLenMult;
      const orbPos = new THREE.Vector3(origin.x, origin.y - cordLen, origin.z);

      // Tether cord welded from branch centerline into top of lantern
      detailGeometries.push(
        buildSmoothCurveTube(
          [origin.clone(), origin.clone().lerp(orbPos, 0.5), orbPos.clone()],
          0.016 * leafScale,
          0.01 * leafScale,
          6,
          5,
          colTrunkDark,
          colAccent,
          rand,
          0,
          0,
          false
        )
      );

      const orbR = Math.max(0.09, H * 0.048 * leafScale);
      // Calyx cap
      const capGeo = new THREE.ConeGeometry(orbR * 0.85, orbR * 0.55, 8);
      colorizeGeometryByHeight(capGeo, colTrunkDark, colLeafMain, -orbR * 0.3, orbR * 0.3);
      capGeo.translate(orbPos.x, orbPos.y, orbPos.z);
      detailGeometries.push(capGeo);

      // Bioluminescent plasma globe
      const orbGeo = new THREE.IcosahedronGeometry(orbR, 2);
      colorizeGeometryByHeight(orbGeo, colFlower, colAccent, -orbR, orbR);
      orbGeo.translate(orbPos.x, orbPos.y - orbR * 0.85, orbPos.z);
      detailGeometries.push(orbGeo);
    }
  } else if (
    el.hangingElement === 'spanish_moss_epiphyte_drapes' &&
    filCount > 0 &&
    branchSources.length > 0
  ) {
    // 9. CORTINAS DE MUSGO ESPAÑOL / TILLANDSIA EPÍFITA
    const drapeCount = Math.max(8, Math.min(24, Math.round(filCount * 1.4)));
    for (let dIdx = 0; dIdx < drapeCount; dIdx++) {
      const src = branchSources[dIdx % branchSources.length];
      const kt = 0.22 + ((dIdx * 0.33) % 0.72);
      const origin = src.curve.getPointAt(kt);
      const drapeLen = H * (0.18 + (dIdx % 3) * 0.07) * filLenMult;
      for (let sub = 0; sub < 3; sub++) {
        const subAng = dIdx * golden + sub * 2.1;
        const zigR = drapeLen * 0.09;
        const dPts: THREE.Vector3[] = [];
        const steps = 10;
        for (let s = 0; s <= steps; s++) {
          const u = s / steps;
          const wave = Math.sin(u * Math.PI * 4 + sub) * zigR * u;
          dPts.push(
            new THREE.Vector3(
              origin.x + Math.cos(subAng) * wave,
              origin.y - u * drapeLen * (0.75 + sub * 0.12),
              origin.z + Math.sin(subAng) * wave
            )
          );
        }
        detailGeometries.push(
          buildSmoothCurveTube(
            dPts,
            0.022 * leafScale,
            0.005 * leafScale,
            10,
            4,
            colLeafMain,
            colLeafTip,
            rand,
            4,
            0.22,
            true
          )
        );
      }
    }
  } else if (
    el.hangingElement === 'thorny_barbed_whips' &&
    filCount > 0 &&
    branchSources.length > 0
  ) {
    // 10. LÁTIGOS COLGANTES CON PÚAS Y GARFIOS (CALAMUS / ROTANG)
    const whipCount = Math.max(6, Math.min(16, filCount));
    for (let wIdx = 0; wIdx < whipCount; wIdx++) {
      const src = branchSources[wIdx % branchSources.length];
      const kt = 0.26 + ((wIdx * 0.41) % 0.66);
      const origin = src.curve.getPointAt(kt);
      const whipLen = H * (0.22 + (wIdx % 2) * 0.08) * filLenMult;
      const yaw = wIdx * golden;
      const wPts = [
        origin.clone(),
        new THREE.Vector3(
          origin.x + Math.cos(yaw) * whipLen * 0.25,
          origin.y - whipLen * 0.45,
          origin.z + Math.sin(yaw) * whipLen * 0.25
        ),
        new THREE.Vector3(
          origin.x + Math.cos(yaw + 0.5) * whipLen * 0.42,
          origin.y - whipLen * 0.85,
          origin.z + Math.sin(yaw + 0.5) * whipLen * 0.42
        ),
        new THREE.Vector3(
          origin.x + Math.cos(yaw + 0.9) * whipLen * 0.35,
          origin.y - whipLen,
          origin.z + Math.sin(yaw + 0.9) * whipLen * 0.35
        ),
      ];
      const wCurve = new THREE.CatmullRomCurve3(wPts);
      detailGeometries.push(
        buildSmoothCurveTube(
          wPts,
          0.018 * leafScale,
          0.004 * leafScale,
          10,
          4,
          colTrunkDark,
          colLeafMain,
          rand,
          0,
          0,
          true
        )
      );
      // Recurved barbs along each hanging whip
      for (let b = 1; b <= 5; b++) {
        const bt = b / 6;
        const bOrigin = wCurve.getPointAt(bt);
        const barbAng = yaw + b * 2.2;
        const barbLen = 0.065 * leafScale;
        const bTip = new THREE.Vector3(
          bOrigin.x + Math.cos(barbAng) * barbLen,
          bOrigin.y + barbLen * 0.55,
          bOrigin.z + Math.sin(barbAng) * barbLen
        );
        detailGeometries.push(
          buildSmoothCurveTube(
            [bOrigin.clone(), bOrigin.clone().lerp(bTip, 0.5), bTip],
            0.01 * leafScale,
            0.0015,
            3,
            3,
            colTrunkDark,
            colAccent,
            rand,
            0,
            0,
            true
          )
        );
      }
    }
  }

  return { bodyGeometries, detailGeometries };
}

/**
 * Distinctive signature color palettes and scales for each tip primitive,
 * ensuring Part Picker miniatures render isolated, high-contrast, macro 3D views.
 */
export const TIP_SIGNATURE_PALETTES: Record<
  string,
  {
    stem: string;
    core: string;
    outer: string;
    highlight: string;
    radius: number;
    openness?: number;
  }
> = {
  iridescent_bubble: {
    stem: '#0f766e',
    core: '#38bdf8',
    outer: '#c084fc',
    highlight: '#ffffff',
    radius: 0.95,
  },
  dewy_droplet: {
    stem: '#15803d',
    core: '#fbbf24',
    outer: '#f59e0b',
    highlight: '#ffffff',
    radius: 0.95,
  },
  micro_floret_star: {
    stem: '#166534',
    core: '#facc15',
    outer: '#f43f5e',
    highlight: '#ffe4e6',
    radius: 0.9,
    openness: 0.95,
  },
  cupped_bell_calyx: {
    stem: '#1e3a5f',
    core: '#06b6d4',
    outer: '#38bdf8',
    highlight: '#f43f5e',
    radius: 0.85,
    openness: 0.85,
  },
  faceted_crystal_gem: {
    stem: '#312e81',
    core: '#a855f7',
    outer: '#06b6d4',
    highlight: '#ffffff',
    radius: 0.85,
  },
  spotted_spore_dome: {
    stem: '#e2e8f0',
    core: '#dc2626',
    outer: '#ef4444',
    highlight: '#fef9c3',
    radius: 0.9,
  },
  lanceolate_blade: {
    stem: '#14532d',
    core: '#059669',
    outer: '#84cc16',
    highlight: '#6ee7b7',
    radius: 0.95,
  },
  bryophyte_moss_pad: {
    stem: '#78350f',
    core: '#4d7c0f',
    outer: '#84cc16',
    highlight: '#bef264',
    radius: 0.95,
  },
  scifi_plasma_orb: {
    stem: '#0f172a',
    core: '#00f0ff',
    outer: '#8b5cf6',
    highlight: '#ffffff',
    radius: 0.9,
  },
  spiked_seed_burr: {
    stem: '#78350f',
    core: '#92400e',
    outer: '#d97706',
    highlight: '#fde047',
    radius: 0.85,
  },
  winged_helicoid_seed: {
    stem: '#713f12',
    core: '#92400e',
    outer: '#10b981',
    highlight: '#a3e635',
    radius: 0.9,
  },
  crowned_pomegranate_pod: {
    stem: '#78350f',
    core: '#991b1b',
    outer: '#e11d48',
    highlight: '#f59e0b',
    radius: 0.9,
  },
  recurved_thorn_claw: {
    stem: '#334155',
    core: '#1e293b',
    outer: '#b91c1c',
    highlight: '#fca5a5',
    radius: 0.9,
  },
  feathery_pappus_plume: {
    stem: '#475569',
    core: '#334155',
    outer: '#f8fafc',
    highlight: '#ffffff',
    radius: 0.9,
  },
  sucker_tentacle_cup: {
    stem: '#881337',
    core: '#f472b6',
    outer: '#fb7185',
    highlight: '#fda4af',
    radius: 0.88,
  },
  granulated_berry_cluster: {
    stem: '#14532d',
    core: '#581c87',
    outer: '#c026d3',
    highlight: '#f472b6',
    radius: 0.88,
  },
  fuzzy_pom_floret_tuft: {
    stem: '#15803d',
    core: '#d97706',
    outer: '#facc15',
    highlight: '#fef08a',
    radius: 0.88,
  },
};

/**
 * Builds an isolated macro 3D Group for a single SynthesizedTipPrimitive atop a short pedicel,
 * so Part Picker thumbnails clearly depict the exact 3D shape of each tip primitive.
 */
export function buildIsolatedTipPreviewGroup(
  primitiveType: string,
  colors: {
    trunk?: string;
    main?: string;
    tip?: string;
    flower?: string;
    accent?: string;
  } = {}
): THREE.Group {
  let s = 4242;
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const sig = TIP_SIGNATURE_PALETTES[primitiveType] || {
    stem: colors.trunk || '#3f6212',
    core: colors.tip || '#86efac',
    outer: colors.flower || '#f472b6',
    highlight: colors.accent || '#38bdf8',
    radius: 0.88,
    openness: 0.85,
  };

  const group = new THREE.Group();
  // Small, subtle pedicel base receptacle at the bottom
  const pedicelPts = [
    new THREE.Vector3(0, -0.28, 0),
    new THREE.Vector3(0.012, -0.14, 0.008),
    new THREE.Vector3(0, 0, 0),
  ];
  const stemGeo = buildSmoothCurveTube(
    pedicelPts,
    0.055,
    0.035,
    8,
    6,
    sig.stem,
    sig.core,
    rand,
    3,
    0.04,
    false
  );
  const stemMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.45,
    metalness: 0.05,
  });
  group.add(new THREE.Mesh(stemGeo, stemMat));

  // The tip primitive sits squarely at (0, 0, 0) pointing UP (0, 1, 0)
  const tipParts = buildSynthesizedTipPrimitive(
    primitiveType,
    sig.radius,
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 1, 0),
    sig.core,
    sig.outer,
    sig.highlight,
    1.15,
    rand,
    sig.openness ?? 0.85
  );

  if (tipParts.length > 0) {
    const tipMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.28,
      metalness: 0.12,
      side: THREE.DoubleSide,
    });
    tipParts.forEach((geo) => {
      group.add(new THREE.Mesh(geo, tipMat));
    });
  }

  return group;
}
