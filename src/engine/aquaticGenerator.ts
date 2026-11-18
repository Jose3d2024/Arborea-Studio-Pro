import * as THREE from 'three';
import { TreeParams, PolygonLOD, AquaticArchetype } from '../types/botany';
import { ensureStandardAttributes, colorizeGeometryGradient } from './foliageGenerator';
import { computeTwistFreeFrames } from './alienFloraGenerator';

const LOD_MULT: Record<PolygonLOD, number> = {
  low: 0.55,
  medium: 0.85,
  high: 1.0,
  ultra: 1.35,
};

function noise3D(x: number, y: number, z: number, seedOff = 0): number {
  const s = seedOff * 1.37;
  const n1 = Math.sin(x * 1.9 + s) * Math.cos(y * 1.6 - s) * Math.sin(z * 1.8 + s * 0.6);
  const n2 = 0.5 * Math.cos(x * 3.7 - z * 2.3 + s) * Math.sin(y * 3.3 + x * 1.5);
  return n1 + n2;
}

/**
 * Builds a smooth swept organic tube along a CatmullRomCurve3 with optional rounded dome tip.
 */
function buildAquaticTube(
  points: THREE.Vector3[],
  rBot: number,
  rTop: number,
  tubularSegs: number,
  radialSegs: number,
  colBot: string,
  colTop: string,
  rand: () => number,
  capDome = true,
  fluteCount = 0,
  fluteDepth = 0
): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points);
  const frames = computeTwistFreeFrames(curve, tubularSegs);
  const totalRings = capDome ? tubularSegs + 2 : tubularSegs;
  const vCount = (totalRings + 1) * (radialSegs + 1);
  const positions = new Float32Array(vCount * 3);
  const uvs = new Float32Array(vCount * 2);
  const indices: number[] = [];

  for (let i = 0; i <= totalRings; i++) {
    const isCap = i > tubularSegs;
    const t = Math.min(1, i / tubularSegs);
    const fIdx = Math.min(tubularSegs, i);
    const pt = curve.getPointAt(t);
    const T = frames.tangents[fIdx];
    const N = frames.normals[fIdx];
    const B = frames.binormals[fIdx];

    let capScale = 1.0;
    let capLift = 0.0;
    if (isCap) {
      const dt = (i - tubularSegs) / 2;
      capScale = Math.max(0.01, Math.cos(dt * Math.PI * 0.5));
      capLift = Math.sin(dt * Math.PI * 0.5) * rTop * 0.75;
    }

    const rBase = THREE.MathUtils.lerp(rBot, rTop, Math.pow(t, 0.78));
    for (let j = 0; j <= radialSegs; j++) {
      const u = j / radialSegs;
      const theta = u * Math.PI * 2;
      const flute = fluteCount > 0 ? 1.0 + Math.cos(theta * fluteCount) * fluteDepth : 1.0;
      const r = Math.max(0.002, rBase * capScale * flute);

      const cx = Math.cos(theta) * r;
      const cz = Math.sin(theta) * r;
      const idx = i * (radialSegs + 1) + j;
      positions[idx * 3] = pt.x + cx * N.x + cz * B.x + capLift * T.x;
      positions[idx * 3 + 1] = pt.y + cx * N.y + cz * B.y + capLift * T.y;
      positions[idx * 3 + 2] = pt.z + cx * N.z + cz * B.z + capLift * T.z;
      uvs[idx * 2] = u * 2;
      uvs[idx * 2 + 1] = t * 3;
    }
  }

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
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const nonIdx = ensureStandardAttributes(geo);
  colorizeGeometryGradient(nonIdx, colBot, colTop, rand, 0.05);
  return nonIdx;
}

/**
 * Creates an organic sculpted reef rock pedestal / holdfast stone at (0,0,0)
 * so every coral colony, anemone or kelp holdfast sits solidly grounded as a single unit.
 */
function createReefRockBase(
  radius: number,
  height: number,
  detail: number,
  colorBase: string,
  seedOff: number,
  rand: () => number
): THREE.BufferGeometry {
  const geo = new THREE.IcosahedronGeometry(1.0, Math.max(1, detail));
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const n = noise3D(x * 1.8, y * 1.8, z * 1.8, seedOff);
    const disp = 1.0 + n * 0.24;
    let py = y * height;
    if (py < 0) py *= 0.22;
    else py = Math.pow(Math.max(0, y), 0.78) * height * (0.95 + n * 0.15);
    pos.setXYZ(i, x * radius * disp, py, z * radius * disp);
  }
  geo.computeVertexNormals();
  const nonIdx = ensureStandardAttributes(geo);
  const cDark = new THREE.Color(colorBase).multiplyScalar(0.68);
  const cTop = new THREE.Color(colorBase).lerp(new THREE.Color('#64748b'), 0.25);
  colorizeGeometryGradient(nonIdx, cDark, cTop, rand, 0.06);
  return nonIdx;
}

/**
 * Builds an undulating marine algal frond / kelp blade anchored cleanly at (0,0,0)
 * and extending along +Y with ruffled edges and central midrib wave.
 */
function buildKelpBlade(
  length: number,
  maxWidth: number,
  ruffleAmp: number,
  curveBend: number,
  rows: number,
  cols: number,
  colBot: string,
  colTop: string,
  rand: () => number,
  bifurcated = false
): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let r = 0; r <= rows; r++) {
    const v = r / rows;
    // Taper from narrow stipe base into broad undulating lamina and pointed/lobed tip
    let profile = v < 0.1 ? 0.12 : Math.sin(Math.pow((v - 0.06) / 0.94, 0.68) * Math.PI);
    if (bifurcated && v > 0.65) {
      profile *= 1.0 - (v - 0.65) * 0.8;
    }
    const halfW = maxWidth * Math.max(0.04, profile);
    const y = v * length;
    const archZ = Math.sin(v * Math.PI * 1.2) * length * curveBend;

    for (let c = 0; c <= cols; c++) {
      const u = c / cols;
      const sx = (u - 0.5) * 2; // -1 to 1
      const edgeDist = Math.abs(sx);
      const ruffleZ =
        Math.sin(v * Math.PI * 5.0 + sx * 2.2) *
        ruffleAmp *
        maxWidth *
        edgeDist *
        Math.sin(v * Math.PI);
      const midRibY = (1 - edgeDist) * maxWidth * 0.08;
      positions.push(sx * halfW, y + midRibY, archZ + ruffleZ);
      uvs.push(u, v);
    }
  }

  const stride = cols + 1;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const a = r * stride + c;
      const b = (r + 1) * stride + c;
      const d = r * stride + (c + 1);
      const e = (r + 1) * stride + (c + 1);
      indices.push(a, d, b, b, d, e);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const nonIdx = ensureStandardAttributes(geo);
  colorizeGeometryGradient(nonIdx, colBot, colTop, rand, 0.06);
  return nonIdx;
}

/**
 * Generates an 8-ray Octocoral star polyp flower welded to a branch or tube apex.
 */
function createStarPolyp(
  radius: number,
  colCore: string,
  colTip: string,
  rand: () => number
): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const calyx = new THREE.CylinderGeometry(radius * 0.35, radius * 0.18, radius * 0.4, 6, 1);
  calyx.translate(0, radius * 0.2, 0);
  const cStd = ensureStandardAttributes(calyx);
  colorizeGeometryGradient(cStd, colCore, colTip, rand, 0.04);
  parts.push(cStd);

  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * Math.PI * 2;
    const petal = new THREE.ConeGeometry(radius * 0.14, radius * 0.85, 4, 1);
    petal.translate(0, radius * 0.42, 0);
    petal.rotateX(1.05);
    petal.rotateY(ang);
    petal.translate(0, radius * 0.32, 0);
    const pStd = ensureStandardAttributes(petal);
    colorizeGeometryGradient(pStd, colCore, colTip, rand, 0.05);
    parts.push(pStd);
  }

  // Merge manually cleanly via BufferGeometry array? Let's return combined using mergeSafe style
  const merged = new THREE.BufferGeometry();
  let totalVerts = 0;
  parts.forEach((p) => (totalVerts += p.attributes.position.count));
  const pos = new Float32Array(totalVerts * 3);
  const norm = new Float32Array(totalVerts * 3);
  const col = new Float32Array(totalVerts * 3);
  const uv = new Float32Array(totalVerts * 2);
  let off3 = 0;
  let off2 = 0;
  for (const p of parts) {
    const cnt = p.attributes.position.count;
    pos.set(p.attributes.position.array as Float32Array, off3);
    norm.set(p.attributes.normal.array as Float32Array, off3);
    col.set(p.attributes.color.array as Float32Array, off3);
    uv.set(p.attributes.uv.array as Float32Array, off2);
    off3 += cnt * 3;
    off2 += cnt * 2;
    p.dispose();
  }
  merged.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(norm, 3));
  merged.setAttribute('color', new THREE.BufferAttribute(col, 3));
  merged.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return merged;
}

/**
 * Generates cohesive 3D Aquatic Flora, Corals, Sea Anemones, Tube Sponges, and Seaweeds/Kelp Forests.
 * Every structure anchors cleanly to a reef rock boulder or calcareous holdfast so there are zero floating parts.
 */
export function generateAquaticGeometry(
  p: TreeParams,
  lod: PolygonLOD,
  meshDensity: number,
  rand: () => number
): { bodyGeometries: THREE.BufferGeometry[]; detailGeometries: THREE.BufferGeometry[] } {
  const bodyGeometries: THREE.BufferGeometry[] = [];
  const detailGeometries: THREE.BufferGeometry[] = [];

  const arch: AquaticArchetype = p.aquaticArchetype || 'staghorn_acropora';
  const mult = THREE.MathUtils.clamp(LOD_MULT[lod] * meshDensity, 0.2, 2.2);
  const rSegs = Math.max(5, Math.round(9 * Math.min(1.6, mult)));
  const tSegs = Math.max(6, Math.round(10 * Math.min(1.6, mult)));
  const sphereDet = mult < 0.45 ? 1 : mult < 1.15 ? 2 : 3;

  const h = Math.max(1.2, p.height);
  const rBase = Math.max(0.08, p.radius);
  const rockScale = p.rockScale ?? 1.0;
  const waveAmp = p.gnarl ?? 0.25;
  const leafSc = p.leafScale ?? 1.15;
  const colonyCount = Math.max(2, Math.round(p.branchCount || 5));

  const cTrunk = p.colorTrunk;
  const cMain = p.colorLeafMain;
  const cTip = p.colorLeafTip;
  const cFlower = p.colorFlower;

  const seedOff = (p.seed % 997) * 0.13;

  // Base Reef Rock Anchor shared cleanly at y = 0..rockH
  const rockR = Math.max(0.45, rBase * 2.2) * rockScale;
  const rockH = rockR * 0.36;
  const reefRock = createReefRockBase(rockR, rockH, sphereDet, '#475569', seedOff, rand);
  bodyGeometries.push(reefRock);

  const anchorY = rockH * 0.68;

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. STAGHORN / ACROPORA BRANCHING CORAL
  // ═══════════════════════════════════════════════════════════════════════════
  if (arch === 'staghorn_acropora') {
    const growStagBranch = (
      startPt: THREE.Vector3,
      dir: THREE.Vector3,
      len: number,
      rad: number,
      depth: number
    ) => {
      const midPt = startPt
        .clone()
        .addScaledVector(dir, len * 0.5)
        .add(new THREE.Vector3((rand() - 0.5) * len * 0.15, len * 0.08, (rand() - 0.5) * len * 0.15));
      const endPt = startPt.clone().addScaledVector(dir, len);
      const nextRad = rad * 0.68;

      const branchGeo = buildAquaticTube(
        [startPt, midPt, endPt],
        rad,
        nextRad,
        Math.max(4, Math.round(tSegs * 0.6)),
        rSegs,
        depth === 0 ? cTrunk : cMain,
        depth >= 2 ? cTip : cMain,
        rand,
        true
      );
      bodyGeometries.push(branchGeo);

      // Tiny corallite polyp buds protruding along the coral branch
      if (depth >= 1) {
        const budCount = Math.max(2, Math.round(3 * Math.min(1.4, mult)));
        for (let b = 0; b < budCount; b++) {
          const bt = 0.25 + (b / budCount) * 0.65;
          const bPos = new THREE.Vector3().lerpVectors(startPt, endPt, bt);
          const ang = rand() * Math.PI * 2;
          const budOut = new THREE.Vector3(Math.cos(ang), 0.45, Math.sin(ang)).normalize();
          const budGeo = new THREE.CylinderGeometry(
            nextRad * 0.24,
            nextRad * 0.36,
            nextRad * 1.15,
            5,
            1
          );
          const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), budOut);
          const budStd = ensureStandardAttributes(budGeo);
          budStd.applyQuaternion(q);
          budStd.translate(bPos.x + budOut.x * nextRad * 0.6, bPos.y + budOut.y * nextRad * 0.6, bPos.z + budOut.z * nextRad * 0.6);
          colorizeGeometryGradient(budStd, cMain, cFlower, rand, 0.04);
          detailGeometries.push(budStd);
        }
      }

      if (depth >= 3) {
        // Pale growing apical axial corallite tip
        const tipCap = new THREE.IcosahedronGeometry(nextRad * 1.1, 1);
        const tipStd = ensureStandardAttributes(tipCap);
        tipStd.translate(endPt.x, endPt.y, endPt.z);
        colorizeGeometryGradient(tipStd, cTip, cFlower, rand, 0.03);
        detailGeometries.push(tipStd);
        return;
      }

      const forks = depth === 0 ? 3 : 2;
      const spin = rand() * Math.PI * 2;
      for (let f = 0; f < forks; f++) {
        const fYaw = spin + (f / forks) * Math.PI * 2 + (rand() - 0.5) * 0.45;
        const spreadDir = new THREE.Vector3(
          dir.x + Math.cos(fYaw) * 0.62,
          Math.max(0.28, dir.y + 0.35),
          dir.z + Math.sin(fYaw) * 0.62
        ).normalize();
        growStagBranch(endPt, spreadDir, len * 0.72, nextRad * 0.96, depth + 1);
      }
    };

    const mainStems = Math.min(6, Math.max(2, Math.round(colonyCount * 0.7)));
    for (let s = 0; s < mainStems; s++) {
      const ang = (s / mainStems) * Math.PI * 2 + rand() * 0.3;
      const offR = s === 0 ? 0 : rockR * 0.28;
      const basePt = new THREE.Vector3(Math.cos(ang) * offR, anchorY * 0.85, Math.sin(ang) * offR);
      const initDir = new THREE.Vector3(Math.cos(ang) * 0.32, 0.94, Math.sin(ang) * 0.32).normalize();
      growStagBranch(basePt, initDir, h * 0.34, rBase * 0.38, 0);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. BRAIN CORAL BOULDER (Meandroid Laberintic Dome)
  // ═══════════════════════════════════════════════════════════════════════════
  else if (arch === 'brain_coral_boulder') {
    const domeCount = Math.min(4, Math.max(1, Math.round(colonyCount * 0.4)));
    for (let d = 0; d < domeCount; d++) {
      const sc = d === 0 ? 1.0 : 0.45 + rand() * 0.32;
      const domeR = Math.max(0.55, h * 0.42) * sc * leafSc * 0.85;
      const ang = d * 2.399 + rand() * 0.4;
      const dist = d === 0 ? 0 : domeR * 1.15;
      const ox = Math.cos(ang) * dist;
      const oz = Math.sin(ang) * dist;

      const det = Math.max(2, sphereDet + 1);
      const geo = new THREE.IcosahedronGeometry(domeR, det);
      const pos = geo.attributes.position;
      const colors = new Float32Array(pos.count * 3);
      const cValley = new THREE.Color(cTrunk);
      const cRidge = new THREE.Color(cMain);
      const cGlow = new THREE.Color(cTip);
      const tmp = new THREE.Color();

      for (let i = 0; i < pos.count; i++) {
        let x = pos.getX(i);
        let y = pos.getY(i);
        let z = pos.getZ(i);
        const len = Math.hypot(x, y, z) || 1;
        const nx = x / len;
        const ny = y / len;
        const nz = z / len;

        // Compress bottom into the reef rock
        if (ny < 0) y *= 0.25;

        // Continuous curvy meandroid ridges (brain coral gyri/sulci)
        const warp = noise3D(nx * 2.4, ny * 2.4, nz * 2.4, seedOff + d) * 1.9;
        const gyrusWave = Math.sin((nx * 10.5 + nz * 10.5 + warp * 3.8)) *
          Math.cos((ny * 9.5 - nx * 6.5 + warp * 2.6));
        const ridge = Math.pow(Math.max(0, 0.5 + 0.5 * gyrusWave), 1.35);

        const disp = 1.0 + (ridge - 0.35) * 0.14;
        pos.setXYZ(i, ox + x * disp, anchorY * 0.8 + y * disp * 0.85, oz + z * disp);

        tmp.copy(cValley).lerp(cRidge, ridge);
        if (ridge > 0.72) tmp.lerp(cGlow, (ridge - 0.72) * 2.4);
        colors[i * 3] = tmp.r;
        colors[i * 3 + 1] = tmp.g;
        colors[i * 3 + 2] = tmp.b;
      }
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      geo.computeVertexNormals();
      const nonIdx = ensureStandardAttributes(geo);
      bodyGeometries.push(nonIdx);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. GORGONIAN SEA FAN (Flat Reticulated Lattice Fan)
  // ═══════════════════════════════════════════════════════════════════════════
  else if (arch === 'gorgonian_sea_fan') {
    const fanCount = Math.min(3, Math.max(1, Math.round(colonyCount * 0.35)));
    for (let f = 0; f < fanCount; f++) {
      const fanYaw = (f / fanCount) * Math.PI * 0.9 + (rand() - 0.5) * 0.4;
      const fanOffset = f === 0 ? new THREE.Vector3(0, anchorY, 0) : new THREE.Vector3((f - 1) * rockR * 0.45, anchorY * 0.9, (rand() - 0.5) * rockR * 0.3);

      const growFan = (p0: THREE.Vector3, dir: THREE.Vector3, len: number, rad: number, depth: number) => {
        const pMid = p0.clone().addScaledVector(dir, len * 0.5).add(new THREE.Vector3(0, 0, Math.sin(depth + rand() * 3) * len * 0.04));
        const p1 = p0.clone().addScaledVector(dir, len);
        const nextR = Math.max(0.006, rad * 0.68);

        const seg = buildAquaticTube(
          [p0, pMid, p1],
          rad,
          nextR,
          4,
          Math.max(4, rSegs - 2),
          depth === 0 ? cTrunk : cMain,
          depth >= 3 ? cTip : cMain,
          rand,
          true
        );
        seg.rotateY(fanYaw);
        seg.translate(fanOffset.x, fanOffset.y, fanOffset.z);
        (depth >= 2 ? detailGeometries : bodyGeometries).push(seg);

        if (depth >= 4) return;
        const forks = depth === 0 ? 3 : 2;
        for (let k = 0; k < forks; k++) {
          const spread = (k / Math.max(1, forks - 1) - 0.5) * (0.95 - depth * 0.12) + (rand() - 0.5) * 0.2;
          const nextDir = new THREE.Vector3(
            dir.x * Math.cos(spread) - dir.y * Math.sin(spread),
            Math.max(0.22, dir.x * Math.sin(spread) + dir.y * Math.cos(spread)),
            (rand() - 0.5) * 0.08
          ).normalize();
          growFan(p1, nextDir, len * 0.74, nextR * 0.95, depth + 1);
        }
      };

      const fanScale = f === 0 ? 1.0 : 0.68;
      growFan(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0), h * 0.32 * fanScale, rBase * 0.32 * fanScale, 0);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. TUBE SPONGE CLUSTER (Hollow Beveled Chimneys)
  // ═══════════════════════════════════════════════════════════════════════════
  else if (arch === 'tube_sponge_cluster') {
    const tubes = Math.max(3, Math.min(10, colonyCount + 1));
    for (let t = 0; t < tubes; t++) {
      const ang = (t / tubes) * Math.PI * 2 + rand() * 0.35;
      const dist = t === 0 ? 0 : rockR * (0.2 + rand() * 0.38);
      const tH = h * (t === 0 ? 0.92 : 0.45 + rand() * 0.45);
      const tR = Math.max(0.08, rBase * (0.45 + rand() * 0.45)) * leafSc * 0.8;
      const lean = t === 0 ? 0.08 : 0.22 + rand() * 0.28;

      const pts = [
        new THREE.Vector3(Math.cos(ang) * dist, anchorY * 0.75, Math.sin(ang) * dist),
        new THREE.Vector3(Math.cos(ang) * (dist + tH * lean * 0.5), anchorY + tH * 0.5, Math.sin(ang) * (dist + tH * lean * 0.5)),
        new THREE.Vector3(Math.cos(ang) * (dist + tH * lean), anchorY + tH, Math.sin(ang) * (dist + tH * lean)),
      ];

      // Hollow Lathe-like open chimney via custom curve extrusion with open osculum top
      const curve = new THREE.CatmullRomCurve3(pts);
      const frames = computeTwistFreeFrames(curve, tSegs);
      const vRings = tSegs + 3; // +3 for rounded outer rim turning inward to osculum cavity
      const vCount = (vRings + 1) * (rSegs + 1);
      const positions = new Float32Array(vCount * 3);
      const uvs = new Float32Array(vCount * 2);
      const indices: number[] = [];

      for (let i = 0; i <= vRings; i++) {
        let ct = Math.min(1, i / tSegs);
        let rMult = 0.72 + Math.sin(ct * Math.PI * 0.82) * 0.45;
        let lift = 0;
        if (i > tSegs) {
          const step = i - tSegs;
          if (step === 1) {
            rMult = 1.08;
            lift = tR * 0.14;
          } else if (step === 2) {
            rMult = 0.62; // Osculum hollow rim
            lift = tR * 0.08;
          } else {
            ct = 0.72; // Deep dark inner atrium
            rMult = 0.48;
            lift = -tH * 0.28;
          }
        }
        const fIdx = Math.min(tSegs, i);
        const pt = curve.getPointAt(ct);
        const T = frames.tangents[fIdx];
        const N = frames.normals[fIdx];
        const B = frames.binormals[fIdx];

        for (let j = 0; j <= rSegs; j++) {
          const u = j / rSegs;
          const theta = u * Math.PI * 2;
          const poreWave = i <= tSegs ? 1 + Math.sin(ct * 18 + theta * 3) * 0.055 : 1;
          const rad = Math.max(0.01, tR * rMult * poreWave);
          const cx = Math.cos(theta) * rad;
          const cz = Math.sin(theta) * rad;
          const idx = i * (rSegs + 1) + j;
          positions[idx * 3] = pt.x + cx * N.x + cz * B.x + lift * T.x;
          positions[idx * 3 + 1] = pt.y + cx * N.y + cz * B.y + lift * T.y;
          positions[idx * 3 + 2] = pt.z + cx * N.z + cz * B.z + lift * T.z;
          uvs[idx * 2] = u * 2;
          uvs[idx * 2 + 1] = ct * 3;
        }
      }

      for (let i = 0; i < vRings; i++) {
        for (let j = 0; j < rSegs; j++) {
          const a = i * (rSegs + 1) + j;
          const b = (i + 1) * (rSegs + 1) + j;
          const c = (i + 1) * (rSegs + 1) + (j + 1);
          const d = i * (rSegs + 1) + (j + 1);
          indices.push(a, d, b, b, d, c);
        }
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geo.setIndex(indices);
      geo.computeVertexNormals();
      const std = ensureStandardAttributes(geo);
      colorizeGeometryGradient(std, cTrunk, cTip, rand, 0.06);
      bodyGeometries.push(std);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. GIANT KELP FOREST & BULL KELP WHIP (Stipes + Pneumatocysts + Ruffled Blades)
  // ═══════════════════════════════════════════════════════════════════════════
  else if (arch === 'giant_kelp_forest' || arch === 'bull_kelp_whip') {
    const isBullKelp = arch === 'bull_kelp_whip';
    const stipes = Math.max(3, Math.min(9, colonyCount + 1));

    for (let s = 0; s < stipes; s++) {
      const ang = (s / stipes) * Math.PI * 2 + rand() * 0.4;
      const dist = rockR * (0.1 + rand() * 0.35);
      const sx = Math.cos(ang) * dist;
      const sz = Math.sin(ang) * dist;
      const stipeH = h * (0.72 + rand() * 0.35);
      const swayX = Math.cos(ang + 0.4) * h * (0.12 + waveAmp * 0.35);
      const swayZ = Math.sin(ang + 0.4) * h * (0.12 + waveAmp * 0.35);

      const pts = [
        new THREE.Vector3(sx, anchorY * 0.7, sz),
        new THREE.Vector3(sx + swayX * 0.4, anchorY + stipeH * 0.35, sz - swayZ * 0.25),
        new THREE.Vector3(sx - swayX * 0.2, anchorY + stipeH * 0.7, sz + swayZ * 0.4),
        new THREE.Vector3(sx + swayX * 0.85, anchorY + stipeH, sz + swayZ * 0.85),
      ];

      const curve = new THREE.CatmullRomCurve3(pts);
      const stipeR = Math.max(0.022, rBase * 0.14);
      const topR = isBullKelp ? stipeR * 2.6 : stipeR * 0.45;
      const stipeGeo = buildAquaticTube(
        pts,
        stipeR * 1.4,
        topR,
        Math.max(8, tSegs + 2),
        Math.max(5, rSegs - 2),
        cTrunk,
        cMain,
        rand,
        true
      );
      bodyGeometries.push(stipeGeo);

      if (isBullKelp) {
        // Spherical gas bladder float at apex + trailing crown of kelp ribbons
        const apex = pts[3];
        const bulbR = stipeR * 3.8 * leafSc;
        const bulb = new THREE.SphereGeometry(bulbR, rSegs, 6);
        bulb.scale(1.0, 1.3, 1.0);
        const bulbStd = ensureStandardAttributes(bulb);
        bulbStd.translate(apex.x, apex.y + bulbR * 0.4, apex.z);
        colorizeGeometryGradient(bulbStd, cMain, cFlower, rand, 0.04);
        bodyGeometries.push(bulbStd);

        const ribbonCount = Math.max(5, Math.round(7 * Math.min(1.4, mult)));
        for (let r = 0; r < ribbonCount; r++) {
          const rAng = (r / ribbonCount) * Math.PI * 2 + rand() * 0.3;
          const bLen = h * (0.35 + rand() * 0.2) * leafSc;
          const blade = buildKelpBlade(
            bLen,
            bLen * 0.16,
            0.22,
            0.28,
            Math.max(5, Math.round(7 * Math.min(1.4, mult))),
            2,
            cMain,
            cTip,
            rand
          );
          const m = new THREE.Matrix4().makeTranslation(apex.x, apex.y + bulbR * 0.9, apex.z);
          m.multiply(new THREE.Matrix4().makeRotationY(rAng));
          m.multiply(new THREE.Matrix4().makeRotationX(0.55 + rand() * 0.4));
          blade.applyMatrix4(m);
          detailGeometries.push(blade);
        }
      } else {
        // Giant Kelp: Pneumatocyst float bladders + large ruffled kelp blades alternating along the stipe
        const bladeNodes = Math.max(5, Math.round(8 * Math.min(1.5, mult)));
        for (let n = 1; n <= bladeNodes; n++) {
          const nt = 0.18 + (n / bladeNodes) * 0.78;
          const pos = curve.getPointAt(Math.min(1, nt));
          const bYaw = n * 2.3999 + ang;

          // Pneumatocyst bladder at node junction
          const floatR = stipeR * 1.45 * leafSc;
          const bladder = new THREE.SphereGeometry(floatR, 6, 5);
          bladder.scale(0.85, 1.35, 0.85);
          const blStd = ensureStandardAttributes(bladder);
          blStd.translate(pos.x + Math.cos(bYaw) * floatR, pos.y + floatR * 0.3, pos.z + Math.sin(bYaw) * floatR);
          colorizeGeometryGradient(blStd, cMain, cFlower, rand, 0.04);
          bodyGeometries.push(blStd);

          // Ruffled Kelp Blade springing directly from the pneumatocyst!
          const bLen = h * (0.28 + (1 - nt * 0.35) * 0.14) * leafSc;
          const blade = buildKelpBlade(
            bLen,
            bLen * 0.26,
            0.32,
            0.22,
            Math.max(5, Math.round(7 * Math.min(1.4, mult))),
            3,
            cMain,
            cTip,
            rand
          );
          const m = new THREE.Matrix4().makeTranslation(
            pos.x + Math.cos(bYaw) * floatR * 1.1,
            pos.y + floatR * 0.5,
            pos.z + Math.sin(bYaw) * floatR * 1.1
          );
          m.multiply(new THREE.Matrix4().makeRotationY(bYaw));
          m.multiply(new THREE.Matrix4().makeRotationX(0.85 + (rand() - 0.5) * 0.3));
          blade.applyMatrix4(m);
          detailGeometries.push(blade);
        }
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 6. SEA ANEMONE TENTACLE CROWN (Muscular Pedal Column + Biolum Tentacle Rings)
  // ═══════════════════════════════════════════════════════════════════════════
  else if (arch === 'sea_anemone_tentacles') {
    const anemones = Math.min(5, Math.max(1, Math.round(colonyCount * 0.6)));
    for (let a = 0; a < anemones; a++) {
      const sc = a === 0 ? 1.0 : 0.52 + rand() * 0.28;
      const ang = (a / anemones) * Math.PI * 2;
      const dist = a === 0 ? 0 : rockR * 0.42;
      const cx = Math.cos(ang) * dist;
      const cz = Math.sin(ang) * dist;
      const colH = h * 0.38 * sc;
      const colR = Math.max(0.18, rBase * 0.72) * sc * leafSc;

      const pedalPts = [
        new THREE.Vector3(cx, anchorY * 0.78, cz),
        new THREE.Vector3(cx, anchorY + colH * 0.5, cz),
        new THREE.Vector3(cx, anchorY + colH, cz),
      ];
      const pedal = buildAquaticTube(pedalPts, colR * 1.1, colR * 0.95, 5, rSegs, cTrunk, cMain, rand, true, 12, 0.05);
      bodyGeometries.push(pedal);

      // Oral disc + 2 concentric rings of waving tentacles welded to top of column
      const rings = 2;
      for (let ring = 0; ring < rings; ring++) {
        const tentCount = Math.max(10, Math.round((ring === 0 ? 18 : 12) * Math.min(1.4, mult)));
        for (let t = 0; t < tentCount; t++) {
          const tAng = (t / tentCount) * Math.PI * 2 + ring * 0.25;
          const rStart = colR * (ring === 0 ? 0.78 : 0.42);
          const tLen = colH * (1.25 - ring * 0.2) * (0.85 + rand() * 0.35) * leafSc;
          const splay = ring === 0 ? 0.95 : 0.45;
          const p0 = new THREE.Vector3(cx + Math.cos(tAng) * rStart, anchorY + colH * 0.95, cz + Math.sin(tAng) * rStart);
          const p1 = new THREE.Vector3(
            cx + Math.cos(tAng) * (rStart + tLen * splay * 0.45),
            anchorY + colH + tLen * 0.6,
            cz + Math.sin(tAng) * (rStart + tLen * splay * 0.45)
          );
          const p2 = new THREE.Vector3(
            cx + Math.cos(tAng + (rand() - 0.5) * 0.3) * (rStart + tLen * splay),
            anchorY + colH + tLen * (0.85 + rand() * 0.25),
            cz + Math.sin(tAng + (rand() - 0.5) * 0.3) * (rStart + tLen * splay)
          );
          const tentGeo = buildAquaticTube(
            [p0, p1, p2],
            colR * 0.14,
            colR * 0.05,
            5,
            5,
            cMain,
            cTip,
            rand,
            true
          );
          detailGeometries.push(tentGeo);

          // Glowing nematocyst bulb tip
          const tipBulb = new THREE.SphereGeometry(colR * 0.085, 6, 5);
          const tipStd = ensureStandardAttributes(tipBulb);
          tipStd.translate(p2.x, p2.y, p2.z);
          colorizeGeometryGradient(tipStd, cTip, cFlower, rand, 0.03);
          detailGeometries.push(tipStd);
        }
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 7. PLATE / SHELF MONTIPORA CORAL (Spiral Calcareous Tiers)
  // ═══════════════════════════════════════════════════════════════════════════
  else if (arch === 'plate_montipora_whorl') {
    const centralPillar = buildAquaticTube(
      [
        new THREE.Vector3(0, anchorY * 0.7, 0),
        new THREE.Vector3(0, anchorY + h * 0.52, 0),
      ],
      rBase * 0.55,
      rBase * 0.25,
      5,
      rSegs,
      cTrunk,
      cMain,
      rand,
      true
    );
    bodyGeometries.push(centralPillar);

    const tierCount = Math.max(5, Math.round(colonyCount * 1.6));
    for (let t = 0; t < tierCount; t++) {
      const frac = t / Math.max(1, tierCount - 1);
      const ang = t * 2.39996 + rand() * 0.2;
      const py = anchorY + h * (0.14 + frac * 0.55);
      const plateR = h * (0.34 - frac * 0.16) * leafSc;
      const radSegs = Math.max(14, Math.round(22 * Math.min(1.5, mult)));

      const plate = new THREE.CylinderGeometry(plateR, plateR * 0.28, plateR * 0.14, radSegs, 3);
      const pos = plate.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const px = pos.getX(i);
        const pyLocal = pos.getY(i);
        const pz = pos.getZ(i);
        const rRatio = Math.hypot(px, pz) / Math.max(0.01, plateR);
        const theta = Math.atan2(pz, px);
        const ruffle = Math.sin(theta * 7 + t) * plateR * 0.09 * Math.pow(rRatio, 1.5);
        const cupLift = Math.pow(rRatio, 1.6) * plateR * 0.22;
        pos.setY(i, pyLocal + cupLift + ruffle);
      }
      plate.computeVertexNormals();
      const plateStd = ensureStandardAttributes(plate);
      const m = new THREE.Matrix4().makeTranslation(
        Math.cos(ang) * rBase * 0.25,
        py,
        Math.sin(ang) * rBase * 0.25
      );
      m.multiply(new THREE.Matrix4().makeRotationY(ang));
      m.multiply(new THREE.Matrix4().makeRotationZ(-0.18));
      plateStd.applyMatrix4(m);
      colorizeGeometryGradient(plateStd, cMain, cTip, rand, 0.06);
      bodyGeometries.push(plateStd);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 8. ORGAN PIPE CORAL WITH 8-RAY STAR POLYPS (Tubipora musica)
  // ═══════════════════════════════════════════════════════════════════════════
  else if (arch === 'pillar_organ_pipe_coral') {
    const pipeCount = Math.max(8, Math.round(colonyCount * 2.4 * Math.min(1.3, mult)));
    for (let i = 0; i < pipeCount; i++) {
      const t = i / pipeCount;
      const ang = i * 2.39996;
      const r = rockR * 0.58 * Math.sqrt(t);
      const px = Math.cos(ang) * r;
      const pz = Math.sin(ang) * r;
      const pH = h * (0.45 + (1 - t) * 0.35 + rand() * 0.15);
      const pipeR = Math.max(0.032, rBase * 0.13);

      const tube = buildAquaticTube(
        [
          new THREE.Vector3(px * 0.7, anchorY * 0.8, pz * 0.7),
          new THREE.Vector3(px, anchorY + pH * 0.5, pz),
          new THREE.Vector3(px * 1.08, anchorY + pH, pz * 1.08),
        ],
        pipeR,
        pipeR * 1.08,
        5,
        6,
        cTrunk,
        cMain,
        rand,
        false
      );
      bodyGeometries.push(tube);

      const polyp = createStarPolyp(pipeR * 2.4 * leafSc, cTip, cFlower, rand);
      polyp.translate(px * 1.08, anchorY + pH, pz * 1.08);
      detailGeometries.push(polyp);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 9. RED SEAWEED / BLADDER WRACK / POSIDONIA SEAGRASS MEADOW
  // ═══════════════════════════════════════════════════════════════════════════
  else {
    const isRed = arch === 'red_seaweed_dulse';
    const isSargassum = arch === 'bladder_wrack_sargassum';
    const frondClusters = Math.max(6, Math.round(colonyCount * 2.5 * Math.min(1.4, mult)));

    for (let f = 0; f < frondClusters; f++) {
      const t = f / frondClusters;
      const ang = f * 2.39996 + rand() * 0.25;
      const dist = rockR * 0.62 * Math.sqrt(t);
      const fx = Math.cos(ang) * dist;
      const fz = Math.sin(ang) * dist;
      const fLen = h * (0.48 + rand() * 0.42) * leafSc * 0.85;
      const maxW = isRed
        ? fLen * 0.22
        : isSargassum
        ? fLen * 0.13
        : fLen * 0.055; // Posidonia seagrass narrow blades

      const blade = buildKelpBlade(
        fLen,
        maxW,
        isRed ? 0.35 : 0.18,
        0.25 + waveAmp * 0.35,
        Math.max(5, Math.round(7 * Math.min(1.4, mult))),
        isRed ? 3 : 2,
        cMain,
        cTip,
        rand,
        isRed || isSargassum
      );

      const m = new THREE.Matrix4().makeTranslation(fx, anchorY * 0.82, fz);
      m.multiply(new THREE.Matrix4().makeRotationY(ang + (rand() - 0.5) * 0.5));
      m.multiply(new THREE.Matrix4().makeRotationX(0.18 + Math.sqrt(t) * 0.55));
      blade.applyMatrix4(m);
      detailGeometries.push(blade);

      // Sargassum paired air bladders on blade midribs
      if (isSargassum && f % 2 === 0) {
        for (let b = 0; b < 2; b++) {
          const bH = fLen * (0.35 + b * 0.28);
          const blR = maxW * 0.26;
          const bl = new THREE.SphereGeometry(blR, 6, 5);
          const blStd = ensureStandardAttributes(bl);
          blStd.translate(
            fx + Math.cos(ang) * blR * 1.1,
            anchorY * 0.85 + bH,
            fz + Math.sin(ang) * blR * 1.1
          );
          colorizeGeometryGradient(blStd, cTip, cFlower, rand, 0.03);
          bodyGeometries.push(blStd);
        }
      }
    }
  }

  return { bodyGeometries, detailGeometries };
}
