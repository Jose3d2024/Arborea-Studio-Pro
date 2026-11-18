import * as THREE from 'three';
import { TreeParams, PolygonLOD, AlienArchetype } from '../types/botany';
import {
  ensureStandardAttributes,
  colorizeGeometryGradient,
  createSucculentBlade,
  generateFoliageCluster,
} from './foliageGenerator';
import { mergeSafe } from './cactusGenerator';

const LOD_SEG_MULT: Record<PolygonLOD, number> = {
  low: 0.6,
  medium: 0.85,
  high: 1.0,
  ultra: 1.35,
};

/**
 * Computes twist-free Parallel Transport frames along a 3D curve so tubes never
 * kink, flip 180 degrees at inflection points, or turn inside-out.
 */
export function computeTwistFreeFrames(
  curve: THREE.Curve<THREE.Vector3>,
  segments: number
): {
  tangents: THREE.Vector3[];
  normals: THREE.Vector3[];
  binormals: THREE.Vector3[];
} {
  const tangents: THREE.Vector3[] = [];
  const normals: THREE.Vector3[] = [];
  const binormals: THREE.Vector3[] = [];

  for (let i = 0; i <= segments; i++) {
    tangents.push(curve.getTangentAt(i / segments).normalize());
  }

  // Initial normal perpendicular to tangents[0]
  const t0 = tangents[0];
  const ref =
    Math.abs(t0.y) < 0.85
      ? new THREE.Vector3(0, 1, 0)
      : new THREE.Vector3(1, 0, 0);
  const n0 = new THREE.Vector3().crossVectors(t0, ref).normalize();
  const b0 = new THREE.Vector3().crossVectors(t0, n0).normalize();
  normals.push(n0);
  binormals.push(b0);

  // Parallel transport along the curve
  for (let i = 1; i <= segments; i++) {
    const prevT = tangents[i - 1];
    const currT = tangents[i];
    const prevN = normals[i - 1].clone();

    const axis = new THREE.Vector3().crossVectors(prevT, currT);
    if (axis.lengthSq() > 1e-6) {
      axis.normalize();
      const angle = Math.acos(THREE.MathUtils.clamp(prevT.dot(currT), -1, 1));
      prevN.applyAxisAngle(axis, angle);
    }
    // Gram-Schmidt orthogonalization
    prevN.sub(currT.clone().multiplyScalar(prevN.dot(currT))).normalize();
    const currB = new THREE.Vector3().crossVectors(currT, prevN).normalize();

    normals.push(prevN);
    binormals.push(currB);
  }

  return { tangents, normals, binormals };
}

/**
 * Builds a solid, closed, outward-facing organic tube along a 3D CatmullRomCurve3
 * with variable radius profile, longitudinal ribs, and sealed dome caps.
 */
function buildOrganicCurveTube(
  points: THREE.Vector3[],
  rStart: number,
  rEnd: number,
  tubularSegs: number,
  radialSegs: number,
  ribCount: number,
  ribDepth: number,
  bellyBulge: number,
  colorBot: string,
  colorTop: string,
  rand: () => number,
  capTopDome = true
): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points);
  const frames = computeTwistFreeFrames(curve, tubularSegs);
  const totalRings = capTopDome ? tubularSegs + 2 : tubularSegs;
  const vertexCount = (totalRings + 1) * (radialSegs + 1);
  const positions = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const indices: number[] = [];

  for (let i = 0; i <= totalRings; i++) {
    const isCap = i > tubularSegs;
    const t = Math.min(1.0, i / tubularSegs);
    const frameIdx = Math.min(tubularSegs, i);
    const pt = curve.getPointAt(t);
    const T = frames.tangents[frameIdx];
    const N = frames.normals[frameIdx];
    const B = frames.binormals[frameIdx];

    let capScale = 1.0;
    let capLift = 0.0;
    if (isCap) {
      const capStep = (i - tubularSegs) / 2; // 0.5, 1.0
      capScale = Math.max(0.001, Math.cos(capStep * Math.PI * 0.5));
      capLift = Math.sin(capStep * Math.PI * 0.5) * rEnd * 0.55;
    }

    const baseR = THREE.MathUtils.lerp(rStart, rEnd, Math.pow(t, 0.85));
    const bulge = 1.0 + Math.sin(t * Math.PI) * bellyBulge * (1.0 - t * 0.45);

    for (let j = 0; j <= radialSegs; j++) {
      const u = j / radialSegs;
      const theta = u * Math.PI * 2;
      const ribMod =
        ribCount > 0 ? 1.0 + Math.cos(theta * ribCount) * ribDepth * capScale : 1.0;
      const r = Math.max(0.002, baseR * bulge * ribMod * capScale);

      const cx = Math.cos(theta) * r;
      const cz = Math.sin(theta) * r;

      const vx = pt.x + cx * N.x + cz * B.x + capLift * T.x;
      const vy = pt.y + cx * N.y + cz * B.y + capLift * T.y;
      const vz = pt.z + cx * N.z + cz * B.z + capLift * T.z;

      const idx = i * (radialSegs + 1) + j;
      positions[idx * 3] = vx;
      positions[idx * 3 + 1] = vy;
      positions[idx * 3 + 2] = vz;

      uvs[idx * 2] = u * 2.0;
      uvs[idx * 2 + 1] = t * 4.0;
    }
  }

  // Outward-facing counter-clockwise winding: (a, d, b) and (b, d, c)
  for (let i = 0; i < totalRings; i++) {
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
  colorizeGeometryGradient(nonIdx, colorBot, colorTop, rand, 0.05);
  return nonIdx;
}

/**
 * 1. Solid Outward-Facing Alien Umbrella Pileus Cap with Radial Gills & Hanging Tendrils
 */
export function createAlienUmbrellaCap(
  radius: number,
  height: number,
  colorMain: string,
  colorTip: string,
  colorGill: string,
  rand: () => number,
  withHangingTendrils = true
): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  // Profile MUST ascend in Y (bottom -> outer rim -> top apex) so LatheGeometry normals point OUTWARD
  const profile: THREE.Vector2[] = [
    new THREE.Vector2(0.001, -height * 0.12),
    new THREE.Vector2(radius * 0.45, -height * 0.10),
    new THREE.Vector2(radius * 0.92, -height * 0.06),
    new THREE.Vector2(radius * 1.0, 0.02),
    new THREE.Vector2(radius * 0.78, height * 0.32),
    new THREE.Vector2(radius * 0.38, height * 0.58),
    new THREE.Vector2(0.001, height * 0.68),
  ];
  const lathe = new THREE.LatheGeometry(profile, 24);
  const pos = lathe.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const r = Math.sqrt(x * x + z * z);
    const ang = Math.atan2(z, x);
    const rimFrac = THREE.MathUtils.clamp(r / Math.max(0.01, radius), 0, 1);
    const wave = Math.sin(ang * 7) * 0.07 * radius * rimFrac;
    const ripple = Math.cos(ang * 13) * 0.04 * radius * rimFrac;
    pos.setY(i, y + wave);
    pos.setX(i, x * (1 + ripple * 0.14));
    pos.setZ(i, z * (1 + ripple * 0.14));
  }
  lathe.computeVertexNormals();
  const capGeo = ensureStandardAttributes(lathe);
  colorizeGeometryGradient(capGeo, colorMain, colorTip, rand, 0.07);
  parts.push(capGeo);

  // Radial luminous gills (lamellae) under the cap
  const gillCount = 16;
  for (let g = 0; g < gillCount; g++) {
    const ang = (g / gillCount) * Math.PI * 2;
    const gill = new THREE.BoxGeometry(radius * 0.76, height * 0.14, radius * 0.028);
    gill.translate(radius * 0.46, -height * 0.08, 0);
    gill.rotateY(ang);
    const gStd = ensureStandardAttributes(gill);
    colorizeGeometryGradient(gStd, colorGill, colorTip, rand, 0.04);
    parts.push(gStd);
  }

  // Hanging spore tendrils underneath
  if (withHangingTendrils) {
    const tendrilCount = 8;
    for (let t = 0; t < tendrilCount; t++) {
      const ang = (t / tendrilCount) * Math.PI * 2 + rand() * 0.4;
      const dist = radius * (0.42 + rand() * 0.4);
      const tLen = height * (1.2 + rand() * 1.3);
      const strand = new THREE.CylinderGeometry(0.012, 0.028, tLen, 6);
      strand.translate(Math.cos(ang) * dist, -tLen * 0.5 - height * 0.06, Math.sin(ang) * dist);
      const sStd = ensureStandardAttributes(strand);
      colorizeGeometryGradient(sStd, colorGill, colorMain, rand, 0.05);
      parts.push(sStd);
    }
  }

  return mergeSafe(parts) || capGeo;
}

/**
 * 2. Solid Outward-Facing Alien Carnivorous Pitcher Trap (Folio 1 Center-Left)
 */
export function createAlienPitcherTrap(
  height: number,
  radius: number,
  colorMain: string,
  colorTip: string,
  colorLip: string,
  rand: () => number
): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  // Strictly ascending Y profile from closed base (0.001, 0) up to flared rim (radius * 1.05, height)
  const profile: THREE.Vector2[] = [
    new THREE.Vector2(0.001, 0),
    new THREE.Vector2(radius * 0.35, height * 0.04),
    new THREE.Vector2(radius * 0.88, height * 0.24),
    new THREE.Vector2(radius * 0.96, height * 0.44),
    new THREE.Vector2(radius * 0.58, height * 0.72),
    new THREE.Vector2(radius * 0.78, height * 0.92),
    new THREE.Vector2(radius * 1.05, height * 1.0),
    new THREE.Vector2(0.001, height * 0.86),
  ];

  const body = new THREE.LatheGeometry(profile, 20);
  const pos = body.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const hFrac = y / Math.max(0.01, height);
    if (hFrac > 0.75 && z > 0) {
      pos.setY(i, y + (hFrac - 0.75) * height * 0.55 * (z / radius));
    }
  }
  body.computeVertexNormals();
  const bodyStd = ensureStandardAttributes(body);
  colorizeGeometryGradient(bodyStd, colorMain, colorTip, rand, 0.06);
  parts.push(bodyStd);

  // Ribbed Peristome Collar Lip around the mouth
  const lip = new THREE.TorusGeometry(radius * 0.88, radius * 0.15, 10, 22);
  lip.rotateX(Math.PI * 0.42);
  lip.translate(0, height * 0.98, 0);
  const lipStd = ensureStandardAttributes(lip);
  colorizeGeometryGradient(lipStd, colorLip, colorTip, rand, 0.05);
  parts.push(lipStd);

  return mergeSafe(parts) || bodyStd;
}

/**
 * 3. Solid Alien Cracked Spore Bulb / Xeno-Egg (Folio 1 Middle-Left & Bottom-Right)
 */
export function createAlienSporeBulb(
  radius: number,
  colorMain: string,
  colorTip: string,
  colorCalyx: string,
  rand: () => number
): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  const sphere = new THREE.IcosahedronGeometry(radius, 3);
  sphere.scale(0.94, 1.14, 0.94);
  sphere.translate(0, radius * 1.02, 0);
  const sStd = ensureStandardAttributes(sphere);
  colorizeGeometryGradient(sStd, colorMain, colorTip, rand, 0.06);
  parts.push(sStd);

  // Dark organic clasping basal calyx fingers
  const calyxRibs = 6;
  for (let c = 0; c < calyxRibs; c++) {
    const ang = (c / calyxRibs) * Math.PI * 2;
    const finger = new THREE.ConeGeometry(radius * 0.24, radius * 0.88, 6);
    finger.translate(Math.cos(ang) * radius * 0.52, radius * 0.38, Math.sin(ang) * radius * 0.52);
    finger.rotateZ(Math.cos(ang) * -0.22);
    finger.rotateX(Math.sin(ang) * 0.22);
    const fStd = ensureStandardAttributes(finger);
    colorizeGeometryGradient(fStd, colorCalyx, colorMain, rand, 0.04);
    parts.push(fStd);
  }

  return mergeSafe(parts) || sStd;
}

/**
 * 4. Solid Logarithmic Fibonacci Spiral Tentacle with Cup Suckers (Folio 1 Middle-Right)
 */
export function createAlienTentacleCoil(
  height: number,
  baseRadius: number,
  turns: number,
  colorStalk: string,
  colorTip: string,
  colorSucker: string,
  rand: () => number
): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const totalPts = 32;
  const curvePts: THREE.Vector3[] = [];

  for (let i = 0; i <= totalPts; i++) {
    const t = i / totalPts;
    if (t < 0.42) {
      const st = t / 0.42;
      const sway = Math.sin(st * Math.PI * 1.5) * height * 0.14;
      curvePts.push(new THREE.Vector3(sway, st * height * 0.58, Math.cos(st * 2.0) * height * 0.05));
    } else {
      const ct = (t - 0.42) / 0.58;
      const maxAngle = turns * Math.PI * 2;
      const theta = ct * maxAngle;
      const coilR = height * 0.24 * (1.0 - ct * 0.78);
      const centerX = Math.sin(Math.PI * 1.5) * height * 0.14 - height * 0.24;
      const centerY = height * 0.58;
      const x = centerX + Math.cos(theta) * coilR;
      const y = centerY + Math.sin(theta) * coilR;
      const z = ct * baseRadius * 0.4;
      curvePts.push(new THREE.Vector3(x, y, z));
    }
  }

  const stalkGeo = buildOrganicCurveTube(
    curvePts,
    baseRadius,
    baseRadius * 0.16,
    36,
    12,
    8,
    0.12,
    0.05,
    colorStalk,
    colorTip,
    rand,
    true
  );
  parts.push(stalkGeo);

  // Add golden/glowing cup-suckers along the spiral curve
  const curve = new THREE.CatmullRomCurve3(curvePts);
  const suckerSteps = 18;
  for (let s = 3; s < suckerSteps; s++) {
    const t = s / suckerSteps;
    const pt = curve.getPointAt(t);
    const tangent = curve.getTangentAt(t);
    const normal = new THREE.Vector3(-tangent.y, tangent.x, 0).normalize();
    const rHere = THREE.MathUtils.lerp(baseRadius, baseRadius * 0.16, t);

    for (const side of [-1, 1]) {
      const cupR = rHere * (0.48 + rand() * 0.2);
      const cup = new THREE.TorusGeometry(cupR, cupR * 0.38, 8, 12);
      const m = new THREE.Matrix4();
      const offset = normal
        .clone()
        .multiplyScalar(rHere * 0.85)
        .add(new THREE.Vector3(0, 0, side * rHere * 0.55));
      m.makeTranslation(pt.x + offset.x, pt.y + offset.y, pt.z + offset.z);
      m.multiply(new THREE.Matrix4().makeRotationY(side * 0.8));
      cup.applyMatrix4(m);
      const cupStd = ensureStandardAttributes(cup);
      colorizeGeometryGradient(cupStd, colorSucker, colorTip, rand, 0.05);
      parts.push(cupStd);
    }
  }

  return mergeSafe(parts) || stalkGeo;
}

/**
 * Master Xenobotany / Extraterrestrial Plant Generator covering all 12 Reference Folio Designs
 */
export function generateAlienFloraGeometry(
  p: TreeParams,
  lod: PolygonLOD,
  rand: () => number,
  meshDensity = 1.0
): { bodyGeometries: THREE.BufferGeometry[]; detailGeometries: THREE.BufferGeometry[] } {
  const bodyGeometries: THREE.BufferGeometry[] = [];
  const detailGeometries: THREE.BufferGeometry[] = [];
  const archetype: AlienArchetype = p.alienArchetype || 'mega_mushroom_terraced';
  const segMult = THREE.MathUtils.clamp(LOD_SEG_MULT[lod] * meshDensity, 0.25, 2.2);
  const radialSegs = Math.max(5, Math.round((p.radialSegments || 12) * segMult));

  const cTrunk = p.colorTrunk || '#27272a';
  const cMain = p.colorLeafMain || '#f97316';
  const cTip = p.colorLeafTip || '#fde047';
  const cFlower = p.colorFlower || '#38bdf8';
  const cAccent = p.colorAccent || cFlower;

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. MEGA-SETA MARCIANA EN TERRAZAS (Folio 1 Top-Right & Bottom-Center)
  // ═══════════════════════════════════════════════════════════════════════════
  if (archetype === 'mega_mushroom_terraced') {
    const stemCount = Math.max(1, Math.min(7, p.branchCount || 3));
    for (let s = 0; s < stemCount; s++) {
      const isMain = s === 0;
      const hScale = isMain ? 1.0 : 0.45 + (s / stemCount) * 0.42;
      const stemH = p.height * hScale;
      const stemR = p.radius * (isMain ? 1.15 : 0.55 + rand() * 0.25);
      const angle = (s / Math.max(1, stemCount - 1)) * Math.PI * 2 + rand() * 0.4;
      const baseDist = isMain ? 0 : p.radius * (1.2 + rand() * 1.5);

      const x0 = Math.cos(angle) * baseDist;
      const z0 = Math.sin(angle) * baseDist;
      const leanX = isMain ? (rand() - 0.5) * 0.5 : Math.cos(angle) * (baseDist + stemH * 0.28);
      const leanZ = isMain ? (rand() - 0.5) * 0.5 : Math.sin(angle) * (baseDist + stemH * 0.28);

      const pts = [
        new THREE.Vector3(x0, 0, z0),
        new THREE.Vector3(x0 * 0.7 + leanX * 0.3, stemH * 0.35, z0 * 0.7 + leanZ * 0.3),
        new THREE.Vector3(leanX * 0.85, stemH * 0.72, leanZ * 0.85),
        new THREE.Vector3(leanX, stemH, leanZ),
      ];

      const stipe = buildOrganicCurveTube(
        pts,
        stemR * (1 + p.flare * 0.5),
        stemR * p.taper * 0.55,
        Math.round(18 * segMult),
        radialSegs,
        10,
        0.08,
        0.12,
        cTrunk,
        cMain,
        rand,
        true
      );
      bodyGeometries.push(stipe);

      const capRadius =
        stemH * (p.crownWidthRatio || 0.45) * (isMain ? 1.15 : 0.85) * (p.leafScale * 0.8);
      const cap = createAlienUmbrellaCap(
        capRadius,
        capRadius * 0.36,
        cMain,
        cTip,
        cFlower,
        rand,
        true
      );
      cap.rotateZ((rand() - 0.5) * 0.14);
      cap.rotateX((rand() - 0.5) * 0.14);
      cap.translate(leanX, stemH, leanZ);
      detailGeometries.push(cap);

      if (isMain && p.levels >= 3) {
        const subTiers = Math.min(4, p.levels - 1);
        for (let t = 1; t <= subTiers; t++) {
          const frac = 0.52 + (t / (subTiers + 1)) * 0.38;
          const subAngle = t * 2.4;
          const subR = capRadius * (0.42 + (1 - frac) * 0.35);
          const subCap = createAlienUmbrellaCap(subR, subR * 0.32, cMain, cTip, cFlower, rand, false);
          subCap.translate(
            leanX * frac + Math.cos(subAngle) * stemR * 1.4,
            stemH * frac,
            leanZ * frac + Math.sin(subAngle) * stemR * 1.4
          );
          detailGeometries.push(subCap);
        }
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. ESPIRAL TENTACULAR DE VENTOSAS DORADAS (Folio 1 Middle-Right)
  // ═══════════════════════════════════════════════════════════════════════════
  else if (archetype === 'spiral_fiddlehead_tentacle') {
    const count = Math.max(3, Math.min(9, (p.branchCount || 4) + 2));
    for (let i = 0; i < count; i++) {
      const isCenter = i === 0;
      const yaw = (i / count) * Math.PI * 2 + (rand() - 0.5) * 0.3;
      const dist = isCenter ? 0 : p.radius * (0.8 + rand() * 1.8);
      const h = p.height * (isCenter ? 1.05 : 0.62 + rand() * 0.38);
      const r = p.radius * (isCenter ? 0.85 : 0.55 + rand() * 0.25);

      const coil = createAlienTentacleCoil(
        h,
        r,
        1.35 + (p.gnarl || 0.3) * 0.8,
        cTrunk,
        cMain,
        cFlower,
        rand
      );
      const m = new THREE.Matrix4();
      m.makeTranslation(Math.cos(yaw) * dist, 0, Math.sin(yaw) * dist);
      m.multiply(new THREE.Matrix4().makeRotationY(yaw));
      m.multiply(new THREE.Matrix4().makeRotationZ((isCenter ? 0.05 : 0.18) + (rand() - 0.5) * 0.1));
      coil.applyMatrix4(m);
      bodyGeometries.push(coil);
    }

    const sporeCount = 12 + p.leafDensity * 3;
    for (let sp = 0; sp < sporeCount; sp++) {
      const ang = rand() * Math.PI * 2;
      const d = p.radius * (0.6 + rand() * 3.2);
      const sh = 0.22 + rand() * 0.45;
      const miniCap = createAlienUmbrellaCap(sh * 0.65, sh * 0.35, cFlower, cTip, cMain, rand, false);
      miniCap.translate(Math.cos(ang) * d, sh, Math.sin(ang) * d);
      detailGeometries.push(miniCap);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. COLONIA DE CÁLIZ CARNÍVORO / ODRES ÁCIDOS (Folio 1 Center-Left)
  // ═══════════════════════════════════════════════════════════════════════════
  else if (archetype === 'carnivorous_pitcher_colony') {
    const pitcherCount = Math.max(4, Math.min(12, (p.branchCount || 4) + 3));
    for (let i = 0; i < pitcherCount; i++) {
      const isMain = i === 0;
      const ang = (i / pitcherCount) * Math.PI * 2 + (rand() - 0.5) * 0.28;
      const dist = isMain ? 0 : p.radius * (0.75 + rand() * 1.45);
      const h = p.height * (isMain ? 1.0 : 0.42 + rand() * 0.52);
      const r = p.radius * (isMain ? 1.15 : 0.55 + rand() * 0.4);

      const pitcher = createAlienPitcherTrap(h, r * p.leafScale * 0.85, cMain, cTip, cFlower, rand);
      const m = new THREE.Matrix4();
      m.makeTranslation(Math.cos(ang) * dist, 0, Math.sin(ang) * dist);
      m.multiply(new THREE.Matrix4().makeRotationY(ang + Math.PI));
      m.multiply(new THREE.Matrix4().makeRotationX(isMain ? 0.04 : 0.14 + rand() * 0.12));
      pitcher.applyMatrix4(m);
      detailGeometries.push(pitcher);
    }

    const pool = new THREE.CylinderGeometry(p.radius * 2.6, p.radius * 3.1, 0.14, 24);
    pool.translate(0, 0.06, 0);
    const poolStd = ensureStandardAttributes(pool);
    colorizeGeometryGradient(poolStd, cFlower, cTip, rand, 0.06);
    bodyGeometries.push(poolStd);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. TORRE CALCÁREA PERFORADA / ÁRBOL ESPONJA (Folio 1 Bottom-Left & Folio 3 Middle-Left)
  // ═══════════════════════════════════════════════════════════════════════════
  else if (archetype === 'fenestrated_coral_spire') {
    const pillars = Math.max(4, Math.min(10, (p.branchCount || 4) + 3));
    const totalH = p.height;
    const crownSpread = totalH * (p.crownWidthRatio || 0.42);

    for (let i = 0; i < pillars; i++) {
      const ang0 = (i / pillars) * Math.PI * 2;
      const baseR = p.radius * (1.3 + rand() * 0.6);
      const midR = p.radius * (0.65 + rand() * 0.5);
      const topR = crownSpread * (0.55 + rand() * 0.45);
      const twist = (p.gnarl || 0.25) * 1.4;

      const pts = [
        new THREE.Vector3(Math.cos(ang0) * baseR, 0, Math.sin(ang0) * baseR),
        new THREE.Vector3(
          Math.cos(ang0 + twist * 0.4) * midR,
          totalH * 0.35,
          Math.sin(ang0 + twist * 0.4) * midR
        ),
        new THREE.Vector3(
          Math.cos(ang0 + twist * 0.8) * (midR * 1.25),
          totalH * 0.68,
          Math.sin(ang0 + twist * 0.8) * (midR * 1.25)
        ),
        new THREE.Vector3(
          Math.cos(ang0 + twist) * topR,
          totalH * (0.88 + rand() * 0.12),
          Math.sin(ang0 + twist) * topR
        ),
      ];

      const strand = buildOrganicCurveTube(
        pts,
        p.radius * 0.48,
        p.radius * 0.32,
        Math.round(16 * segMult),
        10,
        6,
        0.14,
        -0.12,
        cTrunk,
        cTip,
        rand,
        true
      );
      bodyGeometries.push(strand);

      const nextAng = ((i + 1) / pillars) * Math.PI * 2;
      for (const hFrac of [0.28, 0.55, 0.78]) {
        const rBridge = THREE.MathUtils.lerp(baseR, topR, hFrac) * 0.85;
        const pA = new THREE.Vector3(
          Math.cos(ang0 + twist * hFrac) * rBridge,
          totalH * hFrac,
          Math.sin(ang0 + twist * hFrac) * rBridge
        );
        const pB = new THREE.Vector3(
          Math.cos(nextAng + twist * hFrac) * rBridge,
          totalH * (hFrac + (rand() - 0.5) * 0.12),
          Math.sin(nextAng + twist * hFrac) * rBridge
        );
        const pMid = pA.clone().lerp(pB, 0.5);
        pMid.y += totalH * 0.06;
        const bridge = buildOrganicCurveTube(
          [pA, pMid, pB],
          p.radius * 0.25,
          p.radius * 0.22,
          8,
          8,
          0,
          0,
          0,
          cTrunk,
          cMain,
          rand,
          true
        );
        bodyGeometries.push(bridge);
      }

      const shelfR = crownSpread * (0.38 + rand() * 0.25) * (p.leafScale * 0.75);
      const shelf = new THREE.CylinderGeometry(shelfR * 1.1, shelfR * 0.45, shelfR * 0.28, 14);
      shelf.scale(1.2, 1.0, 0.85);
      const apex = pts[3];
      shelf.translate(apex.x, apex.y, apex.z);
      const sStd = ensureStandardAttributes(shelf);
      colorizeGeometryGradient(sStd, cMain, cTip, rand, 0.07);
      detailGeometries.push(sStd);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. RACIMO DE ESFERAS CRAQUELADAS / HUEVOS XENO (Folio 1 Middle-Left & Bottom-Right)
  // ═══════════════════════════════════════════════════════════════════════════
  else if (archetype === 'cracked_ova_cluster') {
    const bulbCount = Math.max(4, Math.min(14, (p.branchCount || 5) + p.leafDensity));
    for (let i = 0; i < bulbCount; i++) {
      const isCenter = i === 0;
      const ang = (i / bulbCount) * Math.PI * 2 + (rand() - 0.5) * 0.35;
      const spread = isCenter ? 0 : p.height * (0.18 + rand() * 0.32);
      const stemH = p.height * (isCenter ? 0.78 : 0.38 + rand() * 0.42);

      const pts = [
        new THREE.Vector3(Math.cos(ang) * spread * 0.25, 0, Math.sin(ang) * spread * 0.25),
        new THREE.Vector3(
          Math.cos(ang + 0.35) * spread * 0.65,
          stemH * 0.48,
          Math.sin(ang + 0.35) * spread * 0.65
        ),
        new THREE.Vector3(Math.cos(ang) * spread, stemH, Math.sin(ang) * spread),
      ];

      const peduncle = buildOrganicCurveTube(
        pts,
        p.radius * 0.42,
        p.radius * 0.22,
        14,
        10,
        6,
        0.12,
        -0.1,
        cTrunk,
        cTrunk,
        rand,
        true
      );
      bodyGeometries.push(peduncle);

      const bulbR = p.radius * (isCenter ? 1.45 : 0.85 + rand() * 0.55) * (p.leafScale * 0.8);
      const bulb = createAlienSporeBulb(bulbR, cMain, cTip, cTrunk, rand);
      bulb.rotateZ(Math.cos(ang) * -0.18);
      bulb.rotateX(Math.sin(ang) * 0.18);
      bulb.translate(pts[2].x, pts[2].y - bulbR * 0.15, pts[2].z);
      detailGeometries.push(bulb);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 6. BULBO TENTACULAR CON FLOR ESTRELLA (Folio 2 Middle-Left)
  // ═══════════════════════════════════════════════════════════════════════════
  else if (archetype === 'star_flower_caudex') {
    const caudexR = p.radius * 1.95;
    const caudex = new THREE.IcosahedronGeometry(caudexR, 2);
    caudex.scale(1.15, 0.88, 1.15);
    caudex.translate(0, caudexR * 0.78, 0);
    const cStd = ensureStandardAttributes(caudex);
    colorizeGeometryGradient(cStd, cTrunk, cMain, rand, 0.07);
    bodyGeometries.push(cStd);

    const tendrilCount = Math.max(4, p.branchCount + 2);
    for (let t = 0; t < tendrilCount; t++) {
      const ang = (t / tendrilCount) * Math.PI * 2 + rand() * 0.3;
      const reach = p.height * (0.45 + rand() * 0.35);
      const tPts = [
        new THREE.Vector3(Math.cos(ang) * caudexR * 0.7, caudexR * 0.9, Math.sin(ang) * caudexR * 0.7),
        new THREE.Vector3(Math.cos(ang + 0.4) * reach * 0.55, caudexR * 1.35, Math.sin(ang + 0.4) * reach * 0.55),
        new THREE.Vector3(Math.cos(ang + 0.8) * reach * 0.85, caudexR * 0.35, Math.sin(ang + 0.8) * reach * 0.85),
        new THREE.Vector3(Math.cos(ang + 1.2) * reach, 0.18, Math.sin(ang + 1.2) * reach),
      ];
      const whip = buildOrganicCurveTube(
        tPts,
        p.radius * 0.32,
        0.025,
        18,
        8,
        6,
        0.1,
        0,
        cTrunk,
        cMain,
        rand,
        true
      );
      bodyGeometries.push(whip);
    }

    const stalkPts = [
      new THREE.Vector3(0, caudexR * 1.2, 0),
      new THREE.Vector3(p.radius * 0.9, p.height * 0.45, -p.radius * 0.5),
      new THREE.Vector3(-p.radius * 0.6, p.height * 0.75, p.radius * 0.4),
      new THREE.Vector3(0, p.height, 0),
    ];
    const mainStalk = buildOrganicCurveTube(
      stalkPts,
      p.radius * 0.55,
      p.radius * 0.25,
      20,
      10,
      8,
      0.14,
      0,
      cTrunk,
      cMain,
      rand,
      true
    );
    bodyGeometries.push(mainStalk);

    const petalCount = 4;
    const petalLen = p.height * 0.34 * p.leafScale;
    for (let pt = 0; pt < petalCount; pt++) {
      const pAng = (pt / petalCount) * Math.PI * 2 + 0.3;
      const blade = createSucculentBlade(petalLen, petalLen * 0.48, cFlower, cTip, rand);
      const m = new THREE.Matrix4();
      m.makeTranslation(0, p.height, 0);
      m.multiply(new THREE.Matrix4().makeRotationY(pAng));
      m.multiply(new THREE.Matrix4().makeRotationX(1.08));
      blade.applyMatrix4(m);
      detailGeometries.push(blade);
    }
    const throat = new THREE.SphereGeometry(petalLen * 0.22, 12, 10);
    throat.translate(0, p.height + 0.05, 0);
    const thStd = ensureStandardAttributes(throat);
    colorizeGeometryGradient(thStd, cAccent, cFlower, rand, 0.04);
    detailGeometries.push(thStd);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 7. CHIMENEAS TUBULARES DE ESPORAS AZULES (Folio 2 Top-Right & Folio 3 Bottom-Left)
  // ═══════════════════════════════════════════════════════════════════════════
  else if (archetype === 'azure_spore_chimneys') {
    const tubeCount = Math.max(6, Math.min(18, (p.branchCount || 5) * 2 + p.leafDensity));
    for (let i = 0; i < tubeCount; i++) {
      const ang = (i / tubeCount) * Math.PI * 2 + rand() * 0.5;
      const dist = i === 0 ? 0 : p.radius * (0.5 + rand() * 2.1);
      const h = p.height * (0.45 + rand() * 0.62);
      const rBot = p.radius * (0.28 + rand() * 0.16);
      const rTop = rBot * (1.35 + rand() * 0.35);

      const x0 = Math.cos(ang) * dist * 0.55;
      const z0 = Math.sin(ang) * dist * 0.55;
      const x1 = Math.cos(ang) * dist * 1.15;
      const z1 = Math.sin(ang) * dist * 1.15;

      const pts = [
        new THREE.Vector3(x0, 0, z0),
        new THREE.Vector3((x0 + x1) * 0.5, h * 0.52, (z0 + z1) * 0.5),
        new THREE.Vector3(x1, h, z1),
      ];
      const tube = buildOrganicCurveTube(
        pts,
        rBot,
        rTop,
        14,
        12,
        12,
        0.1,
        -0.08,
        cTrunk,
        cMain,
        rand,
        true
      );
      bodyGeometries.push(tube);

      const rim = new THREE.TorusGeometry(rTop * 0.92, rTop * 0.36, 10, 16);
      rim.rotateX(Math.PI * 0.5);
      rim.translate(x1, h, z1);
      const rimStd = ensureStandardAttributes(rim);
      colorizeGeometryGradient(rimStd, cTip, cFlower, rand, 0.07);
      detailGeometries.push(rimStd);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 8. BAOBAB XENOMÓRFICO DE SAVIA MAGMÁTICA (Folio 1 Top-Second & Folio 3 Middle-Right)
  // ═══════════════════════════════════════════════════════════════════════════
  else if (archetype === 'sap_fissure_baobab') {
    const trunkH = p.height * 0.72;
    const pts = [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0.05, trunkH * 0.35, 0),
      new THREE.Vector3(-0.04, trunkH * 0.7, 0.03),
      new THREE.Vector3(0, trunkH, 0),
    ];
    const bottle = buildOrganicCurveTube(
      pts,
      p.radius * 1.45,
      p.radius * 0.95,
      20,
      16,
      10,
      0.16,
      0.58,
      cTrunk,
      cMain,
      rand,
      true
    );
    bodyGeometries.push(bottle);

    const veinCount = 5;
    for (let v = 0; v < veinCount; v++) {
      const vAng = (v / veinCount) * Math.PI * 2 + 0.3;
      const vPts = [
        new THREE.Vector3(Math.cos(vAng) * p.radius * 1.38, trunkH * 0.1, Math.sin(vAng) * p.radius * 1.38),
        new THREE.Vector3(Math.cos(vAng + 0.15) * p.radius * 1.55, trunkH * 0.45, Math.sin(vAng + 0.15) * p.radius * 1.55),
        new THREE.Vector3(Math.cos(vAng) * p.radius * 1.02, trunkH * 0.85, Math.sin(vAng) * p.radius * 1.02),
      ];
      const vein = buildOrganicCurveTube(
        vPts,
        p.radius * 0.14,
        p.radius * 0.08,
        10,
        8,
        0,
        0,
        0,
        cFlower,
        cTip,
        rand,
        true
      );
      detailGeometries.push(vein);
    }

    const arms = Math.max(3, p.branchCount + 2);
    for (let a = 0; a < arms; a++) {
      const ang = (a / arms) * Math.PI * 2;
      const armReach = p.radius * (1.2 + rand() * 0.8);
      const armTopY = p.height * (0.88 + rand() * 0.15);
      const aPts = [
        new THREE.Vector3(Math.cos(ang) * p.radius * 0.5, trunkH * 0.88, Math.sin(ang) * p.radius * 0.5),
        new THREE.Vector3(Math.cos(ang) * armReach, armTopY, Math.sin(ang) * armReach),
      ];
      const armGeo = buildOrganicCurveTube(
        aPts,
        p.radius * 0.48,
        p.radius * 0.32,
        10,
        10,
        6,
        0.1,
        0,
        cTrunk,
        cMain,
        rand,
        true
      );
      bodyGeometries.push(armGeo);

      const blades = 10;
      for (let b = 0; b < blades; b++) {
        const bAng = (b / blades) * Math.PI * 2;
        const blade = createSucculentBlade(p.leafScale * 0.95, p.leafScale * 0.38, cMain, cTip, rand);
        const m = new THREE.Matrix4().makeTranslation(Math.cos(ang) * armReach, armTopY, Math.sin(ang) * armReach);
        m.multiply(new THREE.Matrix4().makeRotationY(bAng));
        m.multiply(new THREE.Matrix4().makeRotationX(0.75 + (b % 2) * 0.3));
        blade.applyMatrix4(m);
        detailGeometries.push(blade);
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 9. CENTINELA MAZA ESPINOSA & ESTRELLAS AÉREAS (Folio 3 Top-Center)
  // ═══════════════════════════════════════════════════════════════════════════
  else if (archetype === 'spiky_mace_sentinel') {
    const trunks = Math.max(1, Math.min(4, Math.floor((p.branchCount || 3) * 0.8)));
    for (let t = 0; t < trunks; t++) {
      const isMain = t === 0;
      const ang = (t / trunks) * Math.PI * 2 + 0.4;
      const dist = isMain ? 0 : p.radius * (1.6 + rand() * 1.4);
      const h = p.height * (isMain ? 1.0 : 0.68 + rand() * 0.25);
      const sweepX = Math.cos(ang) * (dist + h * 0.18);
      const sweepZ = Math.sin(ang) * (dist + h * 0.18);

      const pts = [
        new THREE.Vector3(Math.cos(ang) * dist, 0, Math.sin(ang) * dist),
        new THREE.Vector3(sweepX * 0.45, h * 0.45, sweepZ * 0.45),
        new THREE.Vector3(sweepX, h * 0.85, sweepZ),
      ];
      const col = buildOrganicCurveTube(
        pts,
        p.radius * (isMain ? 1.25 : 0.85),
        p.radius * (isMain ? 0.42 : 0.3),
        18,
        12,
        12,
        0.12,
        -0.12,
        cTrunk,
        cMain,
        rand,
        true
      );
      bodyGeometries.push(col);

      const maceR = p.radius * (isMain ? 1.35 : 0.95) * (p.leafScale * 0.85);
      const maceCenter = new THREE.Vector3(sweepX, h * 0.85 + maceR * 0.65, sweepZ);
      const core = new THREE.IcosahedronGeometry(maceR, 3);
      core.translate(maceCenter.x, maceCenter.y, maceCenter.z);
      const coreStd = ensureStandardAttributes(core);
      colorizeGeometryGradient(coreStd, cMain, cTip, rand, 0.06);
      detailGeometries.push(coreStd);

      const spikeCount = 26;
      const golden = 2.39996323;
      for (let s = 0; s < spikeCount; s++) {
        const yOff = 1 - (s / (spikeCount - 1)) * 1.7;
        const rHoriz = Math.sqrt(Math.max(0, 1 - yOff * yOff));
        const theta = s * golden;
        const dir = new THREE.Vector3(Math.cos(theta) * rHoriz, yOff, Math.sin(theta) * rHoriz).normalize();
        const sLen = maceR * (0.85 + rand() * 0.95);
        const spike = new THREE.ConeGeometry(maceR * 0.12, sLen, 6);
        spike.translate(0, maceR * 0.85 + sLen * 0.45, 0);
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
        const m = new THREE.Matrix4().makeRotationFromQuaternion(q);
        m.setPosition(maceCenter);
        spike.applyMatrix4(m);
        const spStd = ensureStandardAttributes(spike);
        colorizeGeometryGradient(spStd, cTrunk, cFlower, rand, 0.05);
        detailGeometries.push(spStd);
      }
    }

    const floaters = 7;
    for (let f = 0; f < floaters; f++) {
      const fAng = (f / floaters) * Math.PI * 2 + rand() * 0.5;
      const fDist = p.height * (0.28 + rand() * 0.35);
      const fY = p.height * (0.45 + rand() * 0.6);
      const starR = p.radius * 0.28;
      for (let ray = 0; ray < 6; ray++) {
        const rayCone = new THREE.ConeGeometry(starR * 0.25, starR * 1.8, 5);
        rayCone.rotateZ((ray / 6) * Math.PI * 2);
        rayCone.rotateX(ray * 0.9);
        rayCone.translate(Math.cos(fAng) * fDist, fY, Math.sin(fAng) * fDist);
        const rStd = ensureStandardAttributes(rayCone);
        colorizeGeometryGradient(rStd, cFlower, cTip, rand, 0.04);
        detailGeometries.push(rStd);
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 10. PILAR DE CORAL ABISAL / GORGONIA ROJA (Folio 3 Bottom-Right)
  // ═══════════════════════════════════════════════════════════════════════════
  else if (archetype === 'crimson_coral_plume') {
    const columns = Math.max(2, Math.min(6, p.branchCount || 3));
    for (let c = 0; c < columns; c++) {
      const isMain = c === 0;
      const ang = (c / columns) * Math.PI * 2 + rand() * 0.3;
      const dist = isMain ? 0 : p.radius * (1.2 + rand() * 1.5);
      const h = p.height * (isMain ? 1.0 : 0.55 + rand() * 0.4);
      const colR = p.radius * (isMain ? 0.65 : 0.45);
      const cx = Math.cos(ang) * dist;
      const cz = Math.sin(ang) * dist;

      const pts = [
        new THREE.Vector3(cx, 0, cz),
        new THREE.Vector3(cx + (rand() - 0.5) * 0.3, h * 0.5, cz + (rand() - 0.5) * 0.3),
        new THREE.Vector3(cx, h, cz),
      ];
      const core = buildOrganicCurveTube(pts, colR, colR * 0.45, 16, 10, 6, 0.1, 0, cTrunk, cMain, rand, true);
      bodyGeometries.push(core);

      const polypCount = Math.round((32 + p.leafDensity * 6) * (isMain ? 1.0 : 0.65));
      for (let pIdx = 0; pIdx < polypCount; pIdx++) {
        const hFrac = 0.08 + (pIdx / polypCount) * 0.9;
        const pYaw = pIdx * 2.39996;
        const pLen = colR * (1.1 + Math.sin(hFrac * Math.PI) * 1.2) * (p.leafScale * 0.75);
        const finger = new THREE.CapsuleGeometry(colR * 0.22, pLen, 5, 8);
        finger.translate(0, pLen * 0.5 + colR * 0.35, 0);
        const m = new THREE.Matrix4().makeTranslation(cx, h * hFrac, cz);
        m.multiply(new THREE.Matrix4().makeRotationY(pYaw));
        m.multiply(new THREE.Matrix4().makeRotationZ(0.85 - hFrac * 0.35));
        finger.applyMatrix4(m);
        const fStd = ensureStandardAttributes(finger);
        colorizeGeometryGradient(fStd, cMain, cTip, rand, 0.06);
        detailGeometries.push(fStd);
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 11. DOMOS PORO DE CRÁTER BIOLUMINISCENTE (Folio 3 Center — Smooth Organic Sculpted Reef)
  // ═══════════════════════════════════════════════════════════════════════════
  else if (archetype === 'biolum_crater_mounds') {
    const moundCount = Math.max(3, Math.min(8, (p.branchCount || 4) + 1));
    const domeSubdiv =
      segMult < 0.45 ? 1 : segMult < 0.8 ? 2 : segMult < 1.25 ? 3 : 4;

    for (let m = 0; m < moundCount; m++) {
      const isMain = m === 0;
      const ang = (m / moundCount) * Math.PI * 2 + rand() * 0.35;
      const dist = isMain ? 0 : p.height * (0.34 + rand() * 0.32);
      const rMound = p.height * (isMain ? 0.38 : 0.22 + rand() * 0.14);
      const hMound = rMound * (0.85 + p.flare * 0.35);
      const mx = Math.cos(ang) * dist;
      const mz = Math.sin(ang) * dist;

      // Sculpted organic geodesic dome with smooth biological lobes and sunken apical crater caldera
      const domeGeo = new THREE.IcosahedronGeometry(1.0, domeSubdiv);
      const dPos = domeGeo.attributes.position;
      const lobeCount = 5 + (m % 3);

      for (let i = 0; i < dPos.count; i++) {
        const nx = dPos.getX(i);
        const ny = dPos.getY(i);
        const nz = dPos.getZ(i);
        const theta = Math.atan2(nz, nx);
        const horizDist = Math.hypot(nx, nz);

        // Organic biological ribs & pillowy lobes
        const organicWave =
          1.0 +
          0.14 * Math.sin(theta * lobeCount + ny * 2.5 + m) * horizDist +
          0.08 * Math.cos(nx * 4.2 - nz * 3.8);

        let rx = nx * rMound * organicWave;
        let rz = nz * rMound * organicWave;
        let ry = 0;

        if (ny < 0) {
          // Flatten base so it sits organically on the ground
          ry = ny * hMound * 0.12;
        } else {
          // Smooth dome profile that indents inward at the top center (ny > 0.72) to form a living crater mouth
          const domeRise = Math.sin(Math.min(1.0, ny * 1.15) * Math.PI * 0.5);
          const craterIndent =
            ny > 0.68
              ? Math.pow((ny - 0.68) / 0.32, 1.6) * 0.42
              : 0.0;
          ry = hMound * Math.max(0.05, domeRise - craterIndent) * (0.95 + 0.08 * Math.sin(theta * 3));
        }

        dPos.setXYZ(i, rx, ry, rz);
      }
      domeGeo.computeVertexNormals();
      domeGeo.translate(mx, 0, mz);
      const cStd = ensureStandardAttributes(domeGeo);
      colorizeGeometryGradient(cStd, cTrunk, cMain, rand, 0.06);
      bodyGeometries.push(cStd);

      // Glowing bioluminescent nectar/spore core inside the crater caldera + rising spore pearls
      const coreBulb = new THREE.IcosahedronGeometry(
        rMound * 0.34,
        Math.max(1, domeSubdiv - 1)
      );
      coreBulb.scale(1.0, 0.45, 1.0);
      coreBulb.translate(mx, hMound * 0.68, mz);
      const gStd = ensureStandardAttributes(coreBulb);
      colorizeGeometryGradient(gStd, cFlower, cTip, rand, 0.04);
      detailGeometries.push(gStd);

      // Organic root-vein tendrils radiating from the mound base
      for (let v = 0; v < 3; v++) {
        const vAng = ang + (v - 1) * 0.85 + (rand() - 0.5) * 0.3;
        const vPts = [
          new THREE.Vector3(
            mx + Math.cos(vAng) * rMound * 0.55,
            hMound * 0.42,
            mz + Math.sin(vAng) * rMound * 0.55
          ),
          new THREE.Vector3(
            mx + Math.cos(vAng + 0.2) * rMound * 0.98,
            hMound * 0.18,
            mz + Math.sin(vAng + 0.2) * rMound * 0.98
          ),
          new THREE.Vector3(
            mx + Math.cos(vAng) * rMound * 1.38,
            -0.02,
            mz + Math.sin(vAng) * rMound * 1.38
          ),
        ];
        const veinTube = buildOrganicCurveTube(
          vPts,
          rMound * 0.14,
          rMound * 0.03,
          Math.max(6, Math.round(10 * segMult)),
          Math.max(5, Math.round(7 * segMult)),
          4,
          0.08,
          0,
          cAccent,
          cFlower,
          rand,
          true
        );
        detailGeometries.push(veinTube);
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 12. PALMERA ALBINA DE CRISTAL & CORAL PÚRPURA (Folio 2 Middle-Third)
  // ═══════════════════════════════════════════════════════════════════════════
  else {
    const stems = Math.max(2, Math.min(6, p.branchCount || 3));
    for (let s = 0; s < stems; s++) {
      const ang = (s / stems) * Math.PI * 2 + rand() * 0.35;
      const sweep = p.height * (0.28 + s * 0.12);
      const h = p.height * (s === 0 ? 1.0 : 0.72 + rand() * 0.25);

      const pts = [
        new THREE.Vector3(Math.cos(ang) * p.radius * 0.4, 0, Math.sin(ang) * p.radius * 0.4),
        new THREE.Vector3(Math.cos(ang) * sweep * 0.55, h * 0.42, Math.sin(ang) * sweep * 0.55),
        new THREE.Vector3(Math.cos(ang) * sweep, h, Math.sin(ang) * sweep),
      ];
      const trunk = buildOrganicCurveTube(
        pts,
        p.radius * 0.85,
        p.radius * 0.35,
        18,
        12,
        0,
        0,
        0,
        cTrunk,
        cTip,
        rand,
        true
      );
      bodyGeometries.push(trunk);

      const crown = generateFoliageCluster({
        foliageType: 'fronds_pinnate',
        scale: p.leafScale * (s === 0 ? 1.2 : 0.95),
        density: p.leafDensity,
        widthRatio: p.leafWidthRatio,
        bend: p.leafBend,
        colorMain: cMain,
        colorTip: cTip,
        colorFlower: cFlower,
        season: p.season,
        lod,
        needleLength: 1,
        needleDensity: 8,
        fascicleCount: 3,
        needleSpreadAngle: 35,
        pineConeDensity: 0,
        rand,
      });
      if (crown) {
        crown.translate(pts[2].x, pts[2].y, pts[2].z);
        detailGeometries.push(crown);
      }
    }

    for (let c = 0; c < 6; c++) {
      const cAng = (c / 6) * Math.PI * 2 + rand() * 0.4;
      const cDist = p.radius * (1.8 + rand() * 2.2);
      const cR = p.radius * (0.75 + rand() * 0.55);
      const coral = new THREE.IcosahedronGeometry(cR, 2);
      coral.scale(1.3, 0.65, 1.3);
      coral.translate(Math.cos(cAng) * cDist, cR * 0.35, Math.sin(cAng) * cDist);
      const crStd = ensureStandardAttributes(coral);
      colorizeGeometryGradient(crStd, cFlower, cAccent, rand, 0.08);
      detailGeometries.push(crStd);
    }
  }

  return { bodyGeometries, detailGeometries };
}
