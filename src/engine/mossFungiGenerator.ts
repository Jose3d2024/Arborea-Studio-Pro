import * as THREE from 'three';
import { TreeParams, PolygonLOD, MossFungiArchetype } from '../types/botany';
import { ensureStandardAttributes, colorizeGeometryGradient } from './foliageGenerator';
import { computeTwistFreeFrames } from './alienFloraGenerator';

const LOD_MULT: Record<PolygonLOD, number> = {
  low: 0.55,
  medium: 0.85,
  high: 1.0,
  ultra: 1.35,
};

/**
 * Smooth 3D organic harmonic noise for sculpting natural rocks, moss pillows, and mushroom caps
 * without any rectilinear grid artifacts.
 */
function organicNoise3D(x: number, y: number, z: number, seedOff = 0): number {
  const s = seedOff * 1.73;
  const n1 =
    Math.sin(x * 1.7 + s) * Math.cos(y * 1.5 - s) * Math.sin(z * 1.6 + s * 0.5);
  const n2 =
    0.5 *
    Math.cos(x * 3.4 - z * 2.1 + s) *
    Math.sin(y * 3.1 + x * 1.8) *
    Math.cos(z * 2.9 - s);
  const n3 =
    0.25 *
    Math.sin(x * 6.3 + y * 4.7 - s) *
    Math.cos(z * 5.9 - y * 3.8);
  return n1 + n2 + n3;
}

/**
 * Evaluates the exact sculpted 3D boulder surface position for a unit sphere direction (nx, ny, nz)
 * so that moss cushions, lichens, and mushrooms sit organically right on the rock's surface.
 */
function evaluateRockSurfacePoint(
  nx: number,
  ny: number,
  nz: number,
  rx: number,
  ry: number,
  rz: number,
  roughness: number,
  seedOff: number
): THREE.Vector3 {
  let px = nx * rx;
  let py = ny * ry;
  let pz = nz * rz;

  const nLow = organicNoise3D(nx * 1.4, ny * 1.4, nz * 1.4, seedOff);
  const nMid = organicNoise3D(nx * 2.9 + 2.1, ny * 2.4, nz * 2.9 - 1.3, seedOff);
  const strata = Math.sin(ny * 7.5 + nLow * 1.8) * 0.06 * roughness;

  const disp = 1.0 + (nLow * 0.22 + nMid * 0.11 + strata) * roughness;
  px *= disp;
  pz *= disp;
  py *= 1.0 + nLow * 0.16 * roughness;

  if (py < 0) {
    py *= 0.24;
  } else {
    py = Math.pow(Math.max(0, ny), 0.78) * ry * (0.95 + nLow * 0.14 * roughness);
  }

  return new THREE.Vector3(px, py, pz);
}

/**
 * Builds a smooth, organic 3D curved stem/stalk or filament along a CatmullRomCurve3
 * with outward-facing triangles, smooth vertex normals, and closed ends.
 */
function buildCurvedStalk(
  points: THREE.Vector3[],
  rBot: number,
  rTop: number,
  tubularSegs: number,
  radialSegs: number,
  colBot: string,
  colTop: string,
  rand: () => number,
  bulgeBase = 0.25,
  pinchTip = false
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
    const baseBulb = 1.0 + Math.exp(-t * 6.5) * bulgeBase;
    const tipTaper = pinchTip ? Math.cos(t * Math.PI * 0.49) : 1.0;
    const r = Math.max(
      0.0008,
      THREE.MathUtils.lerp(rBot, rTop, Math.pow(t, 0.75)) * baseBulb * tipTaper
    );

    for (let j = 0; j <= radialSegs; j++) {
      const u = j / radialSegs;
      const theta = u * Math.PI * 2;
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
 * Generates delicate, curved hair-like bryophyte / mycelial filaments ("pelusas o filamentos")
 * instead of sharp conical spikes.
 */
function buildSoftFilamentTuft(
  origin: THREE.Vector3,
  normal: THREE.Vector3,
  spreadRadius: number,
  filamentLen: number,
  filamentCount: number,
  colBase: string,
  colTip: string,
  rand: () => number,
  archDownward = false
): THREE.BufferGeometry[] {
  const filaments: THREE.BufferGeometry[] = [];
  const up = normal.clone().normalize();
  const ref =
    Math.abs(up.y) < 0.85 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const tangentA = new THREE.Vector3().crossVectors(up, ref).normalize();
  const tangentB = new THREE.Vector3().crossVectors(up, tangentA).normalize();

  for (let f = 0; f < filamentCount; f++) {
    const ang = (f / filamentCount) * Math.PI * 2 + (rand() - 0.5) * 0.55;
    const dist = spreadRadius * (0.15 + rand() * 0.72);
    const dirRadial = tangentA
      .clone()
      .multiplyScalar(Math.cos(ang))
      .addScaledVector(tangentB, Math.sin(ang));

    const len = filamentLen * (0.65 + rand() * 0.65);
    const p0 = origin
      .clone()
      .addScaledVector(dirRadial, dist * 0.45)
      .addScaledVector(up, -0.025);
    const p1 = p0
      .clone()
      .addScaledVector(up, len * (archDownward ? 0.32 : 0.58))
      .addScaledVector(dirRadial, len * 0.38);
    const p2 = p1
      .clone()
      .addScaledVector(up, len * (archDownward ? -0.15 : 0.35))
      .addScaledVector(dirRadial, len * 0.52);

    const rBase = Math.max(0.005, filamentLen * 0.055);
    const rTip = Math.max(0.0012, filamentLen * 0.012);

    filaments.push(
      buildCurvedStalk([p0, p1, p2], rBase, rTip, 5, 4, colBase, colTip, rand, 0.1, true)
    );
  }

  return filaments;
}

/**
 * Builds a closed, watertight Surface of Revolution from a profile curve (r, y)
 * that starts on the central axis inside the stem (r = 0.001, y = yBot),
 * sweeps outward along the underside (hymenium) to the outer cap margin,
 * and sweeps inward across the top pileus surface back to the central axis (r = 0.001, y = yTop).
 *
 * Because the profile traverses counter-clockwise around the cross-section in the (r, y) half-plane,
 * every triangle on the underside, outer margin, AND upper dome/funnel has 100% outward-facing normals
 * without ever needing a monotonic-Y clamp that would flatten funnel caps!
 */
function buildSeamlessRevolvedCap(
  profile: THREE.Vector2[],
  radialSegs: number,
  radius: number,
  height: number,
  style: 'umbrella' | 'bell' | 'funnel' | 'morel',
  colMain: string,
  colTip: string,
  rand: () => number
): THREE.BufferGeometry {
  const ringCount = profile.length;
  const vCount = ringCount * (radialSegs + 1);
  const positions = new Float32Array(vCount * 3);
  const uvs = new Float32Array(vCount * 2);
  const indices: number[] = [];

  for (let i = 0; i < ringCount; i++) {
    const v = i / Math.max(1, ringCount - 1);
    const baseR = profile[i].x;
    const baseY = profile[i].y;
    const radRatio = THREE.MathUtils.clamp(baseR / Math.max(0.001, radius), 0, 1);

    for (let j = 0; j <= radialSegs; j++) {
      const u = j / radialSegs;
      const theta = u * Math.PI * 2;

      let rMod = baseR;
      let yMod = baseY;

      if (style === 'morel') {
        // Sculpted honeycomb alveoli pits on the upper conical surface
        if (v > 0.25 && radRatio > 0.12) {
          const pit =
            Math.sin(theta * 7) * Math.cos((baseY / Math.max(0.04, height)) * 16) * 0.12;
          rMod = baseR * (1 + pit * radRatio);
        }
      } else if (style === 'funnel') {
        // Chanterelle undulating wavy golden trumpet margin
        const lobeWave =
          (Math.sin(theta * 5) * 0.08 + Math.cos(theta * 3) * 0.05) *
          Math.pow(radRatio, 1.35);
        rMod = baseR * (1 + lobeWave * 0.85);
        yMod = baseY + lobeWave * height * 0.28;
      } else {
        // Gentle organic margin undulation on umbrella & bell caps
        const wave =
          (Math.sin(theta * 5 + baseY * 2.5) * 0.045 + Math.cos(theta * 3) * 0.03) *
          Math.pow(radRatio, 1.4);
        rMod = baseR * (1 + wave);
        yMod = baseY + wave * height * 0.16;
      }

      const vx = rMod * Math.cos(theta);
      const vz = rMod * Math.sin(theta);
      const idx = i * (radialSegs + 1) + j;
      positions[idx * 3] = vx;
      positions[idx * 3 + 1] = yMod;
      positions[idx * 3 + 2] = vz;
      uvs[idx * 2] = u;
      uvs[idx * 2 + 1] = v;
    }
  }

  // Counter-clockwise outward triangle winding for profile going (0, yBot) -> (R, yRim) -> (0, yTop)
  for (let i = 0; i < ringCount - 1; i++) {
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
  colorizeGeometryGradient(std, colMain, colTip, rand, 0.05);
  return std;
}

/**
 * Builds an anatomical, 100% unified 3D Mushroom Cap (Umbrella, Bell, Chanterelle Funnel, or Morel)
 * where the cap underside, radial/decurrent gill folds, and stem collar fuse with ZERO separation!
 */
function buildOrganicMushroomCap(
  radius: number,
  height: number,
  stemTopRadius: number,
  style: 'umbrella' | 'bell' | 'funnel' | 'morel',
  densityMult: number,
  colMain: string,
  colTip: string,
  colGill: string,
  rand: () => number
): THREE.BufferGeometry[] {
  const geos: THREE.BufferGeometry[] = [];
  const latheSegs = Math.max(10, Math.round(24 * densityMult));
  const collarR = Math.max(0.01, stemTopRadius * 0.88);

  const profile: THREE.Vector2[] = [];

  if (style === 'funnel') {
    // Chanterelle (Cantharellus cibarius):
    // Infundibuliform trumpet cap that flows seamlessly up from the stipe collar (y = -height * 0.35),
    // flares wide to a rolled wavy margin (r = radius, y = height * 0.68),
    // and dips smoothly into a concave central funnel cup at (r = 0.001, y = height * 0.24).
    profile.push(
      new THREE.Vector2(0.001, -height * 0.38),
      new THREE.Vector2(collarR * 0.92, -height * 0.34),
      new THREE.Vector2(collarR * 1.18, -height * 0.14),
      new THREE.Vector2(radius * 0.46, height * 0.14),
      new THREE.Vector2(radius * 0.78, height * 0.42),
      new THREE.Vector2(radius * 0.98, height * 0.62),
      new THREE.Vector2(radius * 1.02, height * 0.72), // outer rolled margin
      new THREE.Vector2(radius * 0.92, height * 0.78), // top rim crest
      new THREE.Vector2(radius * 0.65, height * 0.58), // dipping into funnel cup
      new THREE.Vector2(radius * 0.34, height * 0.36),
      new THREE.Vector2(0.001, height * 0.24)         // concave center floor
    );
  } else if (style === 'bell') {
    // Mycena / Enoki campanulate bell cap:
    // Sealed underside attached inside the stem at y = -height * 0.08, domed apex at y = height
    profile.push(
      new THREE.Vector2(0.001, -height * 0.10),
      new THREE.Vector2(collarR, -height * 0.08),
      new THREE.Vector2(radius * 0.55, -height * 0.04),
      new THREE.Vector2(radius * 0.96, 0.0),
      new THREE.Vector2(radius * 1.0, height * 0.12),
      new THREE.Vector2(radius * 0.86, height * 0.45),
      new THREE.Vector2(radius * 0.54, height * 0.78),
      new THREE.Vector2(radius * 0.22, height * 0.95),
      new THREE.Vector2(0.001, height * 1.0)
    );
  } else if (style === 'morel') {
    // Conical honeycomb Morel (Morchella):
    // Collar fused directly to stem at y = -height * 0.12, ascending to conical apex at y = height
    profile.push(
      new THREE.Vector2(0.001, -height * 0.14),
      new THREE.Vector2(collarR * 1.05, -height * 0.10),
      new THREE.Vector2(radius * 0.78, 0.0),
      new THREE.Vector2(radius * 1.0, height * 0.22),
      new THREE.Vector2(radius * 0.92, height * 0.48),
      new THREE.Vector2(radius * 0.68, height * 0.74),
      new THREE.Vector2(radius * 0.35, height * 0.92),
      new THREE.Vector2(0.001, height * 1.0)
    );
  } else {
    // Classic Amanita / Boletus umbrella dome cap:
    // Closed hymenium underside attached to stem collar at y = -height * 0.10, rounded margin, convex dome
    profile.push(
      new THREE.Vector2(0.001, -height * 0.12),
      new THREE.Vector2(collarR, -height * 0.10),
      new THREE.Vector2(radius * 0.52, -height * 0.06),
      new THREE.Vector2(radius * 0.94, -height * 0.02),
      new THREE.Vector2(radius * 1.0, height * 0.08),
      new THREE.Vector2(radius * 0.88, height * 0.36),
      new THREE.Vector2(radius * 0.62, height * 0.68),
      new THREE.Vector2(radius * 0.30, height * 0.90),
      new THREE.Vector2(0.001, height * 1.0)
    );
  }

  const capGeo = buildSeamlessRevolvedCap(
    profile,
    latheSegs,
    radius,
    height,
    style,
    colMain,
    colTip,
    rand
  );
  geos.push(capGeo);

  // Add anatomical radial gills / decurrent folds fused directly between the stem core and cap underside
  if (style !== 'morel') {
    const gillCount = Math.max(10, Math.round(18 * densityMult));
    const gillThick = Math.max(0.006, radius * 0.026);

    for (let g = 0; g < gillCount; g++) {
      const gAng = (g / gillCount) * Math.PI * 2;

      if (style === 'funnel') {
        // Decurrent Chanterelle folds curving continuously from the upper stipe up to the flared trumpet rim
        const fPts = [
          new THREE.Vector3(collarR * 0.72, -height * 0.34, 0),
          new THREE.Vector3(radius * 0.44, height * 0.08, 0),
          new THREE.Vector3(radius * 0.92, height * 0.58, 0),
        ];
        const foldTube = buildCurvedStalk(
          fPts,
          gillThick * 1.15,
          gillThick * 0.85,
          5,
          4,
          colGill,
          colMain,
          rand,
          0.0,
          true
        );
        foldTube.rotateY(gAng);
        geos.push(foldTube);
      } else {
        // Radial gill fin embedded inside both the stem core (r = collarR * 0.55) and cap underside
        const innerR = collarR * 0.55;
        const outerR = radius * 0.92;
        const gillLen = Math.max(0.01, outerR - innerR);
        const gillH = height * 0.22;
        const gillBlade = new THREE.BoxGeometry(gillLen, gillH, gillThick, 2, 1, 1);
        // Taper outer edge so it tucks cleanly inside the curved cap margin
        const gPos = gillBlade.attributes.position;
        for (let vi = 0; vi < gPos.count; vi++) {
          const lx = gPos.getX(vi);
          const ly = gPos.getY(vi);
          const tR = THREE.MathUtils.clamp((lx + gillLen * 0.5) / Math.max(1e-5, gillLen), 0, 1); // 0 at stem, 1 at rim
          if (ly < 0) {
            // Curve bottom edge of gill gently upward toward the outer rim
            gPos.setY(vi, ly * (1.0 - Math.pow(tR, 1.8) * 0.65));
          } else {
            // Embed top edge inside the solid cap dome
            gPos.setY(vi, ly + height * 0.06 * (1.0 - tR * 0.5));
          }
        }
        gillBlade.computeVertexNormals();
        gillBlade.translate(innerR + gillLen * 0.5, -height * 0.04, 0);
        gillBlade.rotateY(gAng);
        const gStd = ensureStandardAttributes(gillBlade);
        colorizeGeometryGradient(gStd, colGill, colTip, rand, 0.03);
        geos.push(gStd);
      }
    }
  }

  return geos;
}

export function generateMossFungiGeometry(
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

  const archetype: MossFungiArchetype =
    p.mossFungiArchetype || 'velvet_moss_sporophytes';
  const densityMult = THREE.MathUtils.clamp(
    LOD_MULT[lod] * (meshDensity || 1.0),
    0.2,
    2.4
  );
  const seedOff = (p.seed % 997) * 0.13;

  const rockScale = p.rockScale ?? 1.0;
  const rockRough = p.rockRoughness ?? 0.65;
  const mossCov = p.mossCoverage ?? 0.78;

  const rx = 2.25 * rockScale;
  const ry = 1.35 * rockScale;
  const rz = 1.95 * rockScale;

  const colRock = p.colorTrunk || '#3f4752';
  const colMossMain = p.colorLeafMain || '#15803d';
  const colMossTip = p.colorLeafTip || '#84cc16';
  const colFungi = p.colorFlower || '#ef4444';
  const colAccent = p.colorAccent || '#fef08a';

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. SCULPTED 3D FOREST BOULDER / ROCK OUTCROP + COMPANION STONES
  // ═══════════════════════════════════════════════════════════════════════════
  const rockSubdiv =
    densityMult < 0.38
      ? 1
      : densityMult < 0.7
      ? 2
      : densityMult < 1.15
      ? 3
      : densityMult < 1.6
      ? 4
      : 5;

  const boulderGeo = new THREE.IcosahedronGeometry(1.0, rockSubdiv);
  const bPos = boulderGeo.attributes.position;
  for (let i = 0; i < bPos.count; i++) {
    const dir = new THREE.Vector3(
      bPos.getX(i),
      bPos.getY(i),
      bPos.getZ(i)
    ).normalize();
    const surf = evaluateRockSurfacePoint(
      dir.x,
      dir.y,
      dir.z,
      rx,
      ry,
      rz,
      rockRough,
      seedOff
    );
    bPos.setXYZ(i, surf.x, surf.y, surf.z);
  }
  boulderGeo.computeVertexNormals();
  const boulderStd = ensureStandardAttributes(boulderGeo);

  const cRockDark = new THREE.Color(colRock).multiplyScalar(0.58);
  const cRockLight = new THREE.Color(colRock).lerp(
    new THREE.Color(colMossMain),
    0.18
  );
  colorizeGeometryGradient(boulderStd, cRockDark, cRockLight, rand, 0.05);
  bodyGeometries.push(boulderStd);

  // 3 smaller companion stones seated firmly into the ground around the main rock
  for (let s = 0; s < 3; s++) {
    const sAng = (s / 3) * Math.PI * 2 + 0.5 + rand() * 0.5;
    const sDist = rx * (0.76 + rand() * 0.22);
    const sR = rx * (0.22 + rand() * 0.14);
    const pebbleSub = Math.max(1, rockSubdiv - 1);
    const pebble = new THREE.IcosahedronGeometry(sR, pebbleSub);
    const pPos = pebble.attributes.position;
    for (let i = 0; i < pPos.count; i++) {
      const vx = pPos.getX(i);
      const vy = pPos.getY(i);
      const vz = pPos.getZ(i);
      const n = 1.0 + organicNoise3D(vx * 2, vy * 2, vz * 2, seedOff + s) * 0.22;
      pPos.setXYZ(i, vx * n * 1.2, Math.max(-0.06, vy * n * 0.6 + sR * 0.18), vz * n);
    }
    pebble.computeVertexNormals();
    pebble.translate(Math.cos(sAng) * sDist, 0, Math.sin(sAng) * sDist);
    const pebStd = ensureStandardAttributes(pebble);
    colorizeGeometryGradient(pebStd, cRockDark, cRockLight, rand, 0.05);
    bodyGeometries.push(pebStd);
  }

  // Helper to get a point and outward normal on the upper surface of the boulder
  const sampleRockTopPoint = (
    uAngle: number,
    radialFrac: number
  ): {
    pos: THREE.Vector3;
    normal: THREE.Vector3;
  } => {
    const clampedRad = THREE.MathUtils.clamp(radialFrac, 0.02, 0.88);
    const horizR = Math.sin(clampedRad * Math.PI * 0.46);
    const ny = Math.cos(clampedRad * Math.PI * 0.46);
    const nx = Math.cos(uAngle) * horizR;
    const nz = Math.sin(uAngle) * horizR;
    const pos = evaluateRockSurfacePoint(
      nx,
      ny,
      nz,
      rx,
      ry,
      rz,
      rockRough,
      seedOff
    );
    const normal = new THREE.Vector3(nx * 0.45, Math.max(0.35, ny), nz * 0.45).normalize();
    return { pos, normal };
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. ORGANIC MOSS CUSHIONS & SOFT BRYOPHYTE FILAMENTS ("PELUSAS Y FILAMENTOS")
  //    (Replaces spiky cones with soft velvety pillows and fine curved filaments!)
  // ═══════════════════════════════════════════════════════════════════════════
  if (mossCov > 0.05) {
    const cushionCount = Math.max(
      6,
      Math.round((18 + p.leafDensity * 4) * mossCov * Math.min(1.6, densityMult))
    );
    const golden = 2.39996323;
    const cushionSubdiv = densityMult < 0.45 ? 1 : densityMult < 1.1 ? 2 : 3;

    for (let c = 0; c < cushionCount; c++) {
      const t = c / cushionCount;
      const uAng = c * golden + (rand() - 0.5) * 0.25;
      const radFrac = Math.sqrt(t) * (0.68 + mossCov * 0.22);
      const { pos, normal } = sampleRockTopPoint(uAng, radFrac);

      const pillowR =
        rx *
        (0.16 + (1 - t * 0.45) * 0.18) *
        (0.75 + p.leafScale * 0.35) *
        (0.85 + rand() * 0.3);
      const pillowH =
        pillowR *
        (archetype === 'sphagnum_bog_pillow' ? 0.62 : 0.42) *
        (0.8 + mossCov * 0.4);

      const pillow = new THREE.IcosahedronGeometry(1.0, cushionSubdiv);
      const pPos = pillow.attributes.position;
      for (let i = 0; i < pPos.count; i++) {
        const vx = pPos.getX(i);
        const vy = pPos.getY(i);
        const vz = pPos.getZ(i);
        // Soft botryoidal moss cushion without sharp protrusions
        const tuftBump =
          1.0 +
          0.14 * Math.sin(vx * 4.8 + c) * Math.cos(vz * 4.8 - c) +
          0.06 * Math.sin(vy * 7.5);
        // Deeply skirted bottom so cushion hugs curved boulder surfaces with zero gap
        const sy = vy < 0 ? vy * pillowH * 0.85 : vy * pillowH * tuftBump;
        pPos.setXYZ(i, vx * pillowR * tuftBump, sy, vz * pillowR * tuftBump);
      }
      pillow.computeVertexNormals();

      const qRot = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        normal
      );
      const m = new THREE.Matrix4().makeRotationFromQuaternion(qRot);
      // Sink cushion slightly INTO the rock (-0.08 * pillowH) so edges never float
      m.setPosition(
        pos.x - normal.x * pillowH * 0.08,
        pos.y - normal.y * pillowH * 0.08,
        pos.z - normal.z * pillowH * 0.08
      );
      pillow.applyMatrix4(m);

      const pStd = ensureStandardAttributes(pillow);
      colorizeGeometryGradient(pStd, colMossMain, colMossTip, rand, 0.07);
      detailGeometries.push(pStd);

      // Add delicate, curved hair-like bryophyte / mycelial filaments ("pelusas o filamentos")
      // emerging softly from the moss cushion instead of sharp cones!
      const cushionTop = pos.clone().addScaledVector(normal, pillowH * 0.65);
      const filCount = Math.max(2, Math.round(4 * Math.min(1.4, densityMult)));
      const filLen = pillowH * (0.55 + rand() * 0.45);
      const filaments = buildSoftFilamentTuft(
        cushionTop,
        normal,
        pillowR * 0.72,
        filLen,
        filCount,
        colMossMain,
        colMossTip,
        rand,
        false
      );
      filaments.forEach((fg) => detailGeometries.push(fg));
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. ARCHETYPE-SPECIFIC MOSS SPOROPHYTES, MUSHROOMS, LICHENS & FUNGI ON ROCK
  //    (100% unified parts with zero separation and soft basal filaments)
  // ═══════════════════════════════════════════════════════════════════════════
  const colonyCount = Math.max(3, Math.round((p.branchCount || 5) * 2 + p.leafDensity));
  const golden = 2.39996323;
  const scaleMult = p.leafScale || 1.2;

  if (
    archetype === 'velvet_moss_sporophytes' ||
    archetype === 'star_moss_polytrichum' ||
    archetype === 'sphagnum_bog_pillow'
  ) {
    // Slender curved sporophyte stalks (setas) rising from the moss cushions with nodding spore capsules
    const stalkCount = Math.max(
      10,
      Math.round(
        (archetype === 'velvet_moss_sporophytes' ? 32 : 20) *
          Math.min(1.5, densityMult)
      )
    );
    const stalkSegs = Math.max(6, Math.round(9 * densityMult));

    for (let s = 0; s < stalkCount; s++) {
      const uAng = s * golden + (rand() - 0.5) * 0.35;
      const radFrac = Math.sqrt((s + 0.5) / stalkCount) * 0.68;
      const { pos, normal } = sampleRockTopPoint(uAng, radFrac);

      const setaH = (0.45 + rand() * 0.55) * scaleMult * 0.75;
      const leanX = Math.cos(uAng) * setaH * 0.26 + (rand() - 0.5) * 0.14;
      const leanZ = Math.sin(uAng) * setaH * 0.26 + (rand() - 0.5) * 0.14;

      // Rooted inside the rock/moss (-0.06m) so the stalk never floats
      const pts = [
        new THREE.Vector3(pos.x, pos.y - 0.06, pos.z),
        new THREE.Vector3(pos.x + leanX * 0.45, pos.y + setaH * 0.62, pos.z + leanZ * 0.45),
        new THREE.Vector3(pos.x + leanX * 0.92, pos.y + setaH, pos.z + leanZ * 0.92),
        new THREE.Vector3(
          pos.x + leanX * 1.12,
          pos.y + setaH * 0.92,
          pos.z + leanZ * 1.12
        ),
      ];

      const setaCurve = new THREE.CatmullRomCurve3(pts);
      const setaTube = buildCurvedStalk(
        pts,
        0.016 * scaleMult,
        0.01 * scaleMult,
        stalkSegs,
        5,
        colMossMain,
        colFungi,
        rand,
        0.15
      );
      bodyGeometries.push(setaTube);

      // Attach nodding Spore Capsule directly along the terminal tangent of the seta curve
      const tipPos = setaCurve.getPointAt(1.0);
      const tipTan = setaCurve.getTangentAt(1.0).normalize();
      const capR = 0.042 * scaleMult;
      const capLen = capR * 1.65;
      const capGeo = new THREE.CapsuleGeometry(
        capR,
        capLen,
        4,
        Math.max(5, Math.round(8 * densityMult))
      );
      // Shift capsule so its base socket sits at local (0, 0, 0) overlapping the stalk tip
      capGeo.translate(0, capLen * 0.35, 0);
      const qCap = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        tipTan
      );
      const capMat = new THREE.Matrix4().makeRotationFromQuaternion(qCap);
      capMat.setPosition(tipPos);
      capGeo.applyMatrix4(capMat);

      const capStd = ensureStandardAttributes(capGeo);
      colorizeGeometryGradient(capStd, colFungi, colAccent, rand, 0.05);
      detailGeometries.push(capStd);

      // Delicate basal filaments around the foot of the sporophyte
      const baseFils = buildSoftFilamentTuft(
        pos,
        normal,
        0.08 * scaleMult,
        0.14 * scaleMult,
        3,
        colMossMain,
        colMossTip,
        rand
      );
      baseFils.forEach((bf) => detailGeometries.push(bf));
    }
  } else if (
    archetype === 'amanita_muscaria_moss' ||
    archetype === 'biolum_mycena_colony' ||
    archetype === 'chanterelle_golden_moss' ||
    archetype === 'morel_sponge_moss'
  ) {
    // Forest Mushroom Colony growing seamlessly out of the mossy rock
    const mushCount = Math.max(4, Math.min(18, colonyCount));
    const stalkSegs = Math.max(7, Math.round(12 * densityMult));
    const stalkRadSegs = Math.max(7, Math.round(11 * densityMult));

    for (let m = 0; m < mushCount; m++) {
      const isHero = m < 2;
      const uAng = m * golden + (rand() - 0.5) * 0.35;
      const radFrac = m === 0 ? 0.12 : Math.sqrt(m / mushCount) * 0.65;
      const { pos, normal } = sampleRockTopPoint(uAng, radFrac);

      const sizeFactor = (isHero ? 1.15 : 0.48 + rand() * 0.58) * scaleMult * 0.72;
      const stemH = (0.75 + rand() * 0.52) * sizeFactor;
      const stemR =
        (archetype === 'biolum_mycena_colony' ? 0.058 : 0.135) * sizeFactor;
      const stemTopR = stemR * (archetype === 'chanterelle_golden_moss' ? 0.92 : 0.78);

      const curveOutX = Math.cos(uAng) * stemH * 0.22;
      const curveOutZ = Math.sin(uAng) * stemH * 0.22;

      // Start stem at pos.y - 0.08 (deeply rooted in rock/moss) so the base never floats!
      const sPts = [
        new THREE.Vector3(pos.x, pos.y - 0.08, pos.z),
        new THREE.Vector3(
          pos.x + curveOutX * 0.58,
          pos.y + stemH * 0.5,
          pos.z + curveOutZ * 0.58
        ),
        new THREE.Vector3(
          pos.x + curveOutX * 0.48,
          pos.y + stemH,
          pos.z + curveOutZ * 0.48
        ),
      ];

      const stipeCurve = new THREE.CatmullRomCurve3(sPts);
      const stipeCol =
        archetype === 'biolum_mycena_colony'
          ? colMossTip
          : archetype === 'chanterelle_golden_moss'
          ? colFungi
          : '#f5f5f4';
      const stipeBotCol =
        archetype === 'chanterelle_golden_moss' ? colAccent : '#d6d3d1';

      const stipe = buildCurvedStalk(
        sPts,
        stemR * 1.28,
        stemTopR,
        stalkSegs,
        stalkRadSegs,
        stipeBotCol,
        stipeCol,
        rand,
        0.38
      );
      bodyGeometries.push(stipe);

      // Soft basal mycelial fuzz / filaments ("pelusas o filamentos") around the base of each mushroom stem
      const myceliaCount = Math.max(4, Math.round(7 * Math.min(1.4, densityMult)));
      const mycelia = buildSoftFilamentTuft(
        pos,
        normal,
        stemR * 1.5,
        stemR * 2.1,
        myceliaCount,
        stipeCol,
        colAccent,
        rand,
        false
      );
      mycelia.forEach((mf) => detailGeometries.push(mf));

      // Align cap with the exact top point & tangent of the stipe so stem, gills, and cap are 100% fused
      const apex = stipeCurve.getPointAt(1.0);
      const topTangent = stipeCurve
        .getTangentAt(1.0)
        .lerp(new THREE.Vector3(0, 1, 0), 0.55)
        .normalize();

      const capStyle =
        archetype === 'chanterelle_golden_moss'
          ? 'funnel'
          : archetype === 'biolum_mycena_colony'
          ? 'bell'
          : archetype === 'morel_sponge_moss'
          ? 'morel'
          : 'umbrella';

      const capRadius =
        (archetype === 'morel_sponge_moss' ? 0.28 : 0.48) * sizeFactor;
      const capHeight =
        (archetype === 'morel_sponge_moss'
          ? 0.58
          : archetype === 'biolum_mycena_colony'
          ? 0.34
          : archetype === 'chanterelle_golden_moss'
          ? 0.36
          : 0.28) * sizeFactor;

      const gillColor =
        archetype === 'chanterelle_golden_moss' ? colAccent : '#fef3c7';

      const capParts = buildOrganicMushroomCap(
        capRadius,
        capHeight,
        stemTopR,
        capStyle,
        densityMult,
        colFungi,
        colAccent,
        gillColor,
        rand
      );

      const qCap = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        topTangent
      );
      const capMat = new THREE.Matrix4().makeRotationFromQuaternion(qCap);
      capMat.setPosition(apex.x, apex.y, apex.z);

      capParts.forEach((cp) => {
        cp.applyMatrix4(capMat);
        detailGeometries.push(cp);
      });

      // Add delicate hanging veil filaments on cap rim for biolum_mycena_colony or amanita
      if (archetype === 'biolum_mycena_colony') {
        const rimFilCount = Math.max(4, Math.round(6 * densityMult));
        for (let rf = 0; rf < rimFilCount; rf++) {
          const rAng = (rf / rimFilCount) * Math.PI * 2 + rand() * 0.3;
          const rx0 = Math.cos(rAng) * capRadius * 0.92;
          const rz0 = Math.sin(rAng) * capRadius * 0.92;
          const fLen = capHeight * (0.45 + rand() * 0.35);
          const fPts = [
            new THREE.Vector3(rx0, capHeight * 0.06, rz0),
            new THREE.Vector3(rx0 * 1.04, -fLen * 0.5, rz0 * 1.04),
            new THREE.Vector3(rx0 * 0.98, -fLen, rz0 * 0.98),
          ];
          const rimFil = buildCurvedStalk(
            fPts,
            0.008 * sizeFactor,
            0.002 * sizeFactor,
            4,
            4,
            colFungi,
            colAccent,
            rand,
            0,
            true
          );
          rimFil.applyMatrix4(capMat);
          detailGeometries.push(rimFil);
        }
      }

      // Add 3D white velar spots + skirt ring for Amanita muscaria (perfectly seated on cap & stipe)
      if (archetype === 'amanita_muscaria_moss') {
        const spotCount = Math.max(6, Math.round(14 * densityMult));
        for (let sp = 0; sp < spotCount; sp++) {
          const uFrac = 0.18 + (sp / spotCount) * 0.72; // 0 = near margin, 1 = near apex
          const spYaw = sp * golden;
          // Match exact umbrella upper dome profile: r goes from radius*0.92 down to 0, y goes from height*0.12 up to height
          const spR = capRadius * Math.cos(uFrac * Math.PI * 0.48) * 0.92;
          const spY = capHeight * (0.08 + Math.sin(uFrac * Math.PI * 0.48) * 0.88);
          const wartR = capRadius * (0.055 + (1 - uFrac) * 0.025);

          const wart = new THREE.IcosahedronGeometry(wartR, 1);
          wart.scale(1.2, 0.55, 1.2);
          // Sink wart slightly into the cap surface so it never floats
          wart.translate(
            Math.cos(spYaw) * spR,
            spY - wartR * 0.22,
            Math.sin(spYaw) * spR
          );
          wart.applyMatrix4(capMat);
          const wStd = ensureStandardAttributes(wart);
          colorizeGeometryGradient(wStd, '#f5f5f4', '#ffffff', rand, 0.02);
          detailGeometries.push(wStd);
        }

        // Hanging annulus skirt ring evaluated on the exact CatmullRomCurve3 of the stipe at t = 0.70
        const skirtPos = stipeCurve.getPointAt(0.7);
        const skirtTan = stipeCurve.getTangentAt(0.7).normalize();
        const skirtProfile: THREE.Vector2[] = [
          new THREE.Vector2(stemTopR * 0.65, -stemR * 1.15),
          new THREE.Vector2(stemR * 1.68, -stemR * 1.25),
          new THREE.Vector2(stemR * 1.35, -stemR * 0.45),
          new THREE.Vector2(stemTopR * 0.92, 0.0),
          new THREE.Vector2(0.001, stemR * 0.1),
        ];
        const skirt = new THREE.LatheGeometry(
          skirtProfile,
          Math.max(8, stalkRadSegs)
        );
        const qSkirt = new THREE.Quaternion().setFromUnitVectors(
          new THREE.Vector3(0, 1, 0),
          skirtTan
        );
        const skirtMat = new THREE.Matrix4().makeRotationFromQuaternion(qSkirt);
        skirtMat.setPosition(skirtPos);
        skirt.applyMatrix4(skirtMat);
        const skStd = ensureStandardAttributes(skirt);
        colorizeGeometryGradient(skStd, '#e7e5e4', '#ffffff', rand, 0.02);
        detailGeometries.push(skStd);
      }
    }
  } else if (archetype === 'golden_enoki_cluster') {
    // Dense bouquet of 14-28 slender curving Enoki mushrooms emerging from a shared basal cushion
    const bouquetClusters = 3;
    const stalkSegs = Math.max(6, Math.round(10 * densityMult));

    for (let bq = 0; bq < bouquetClusters; bq++) {
      const bqAng = (bq / bouquetClusters) * Math.PI * 2 + 0.4;
      const { pos: basePos, normal: baseNorm } = sampleRockTopPoint(
        bqAng,
        bq === 0 ? 0.15 : 0.46
      );
      const stemsInCluster = Math.max(
        5,
        Math.round((6 + p.leafDensity) * Math.min(1.4, densityMult))
      );

      // Soft basal mycelial filaments around the Enoki bouquet root
      const bouquetFils = buildSoftFilamentTuft(
        basePos,
        baseNorm,
        0.22 * scaleMult,
        0.24 * scaleMult,
        Math.max(5, Math.round(8 * densityMult)),
        '#78350f',
        colAccent,
        rand
      );
      bouquetFils.forEach((bf) => detailGeometries.push(bf));

      for (let i = 0; i < stemsInCluster; i++) {
        const sAng = (i / stemsInCluster) * Math.PI * 2 + rand() * 0.3;
        const flareOut = (0.18 + (i / stemsInCluster) * 0.46) * scaleMult;
        const h = (0.55 + (1 - (i / stemsInCluster) * 0.45) * 0.65) * scaleMult;
        const stemTopR = 0.024 * scaleMult;

        const pts = [
          new THREE.Vector3(
            basePos.x + Math.cos(sAng) * 0.04,
            basePos.y - 0.06,
            basePos.z + Math.sin(sAng) * 0.04
          ),
          new THREE.Vector3(
            basePos.x + Math.cos(sAng) * flareOut * 0.72,
            basePos.y + h * 0.55,
            basePos.z + Math.sin(sAng) * flareOut * 0.72
          ),
          new THREE.Vector3(
            basePos.x + Math.cos(sAng) * flareOut,
            basePos.y + h,
            basePos.z + Math.sin(sAng) * flareOut
          ),
        ];

        const sCurve = new THREE.CatmullRomCurve3(pts);
        const stipe = buildCurvedStalk(
          pts,
          0.036 * scaleMult,
          stemTopR,
          stalkSegs,
          6,
          '#451a03',
          colAccent,
          rand,
          0.18
        );
        bodyGeometries.push(stipe);

        const tipPos = sCurve.getPointAt(1.0);
        const tipTan = sCurve
          .getTangentAt(1.0)
          .lerp(new THREE.Vector3(0, 1, 0), 0.5)
          .normalize();

        const capParts = buildOrganicMushroomCap(
          0.14 * scaleMult * (0.8 + rand() * 0.35),
          0.095 * scaleMult,
          stemTopR,
          'bell',
          densityMult * 0.85,
          colFungi,
          colAccent,
          '#fef3c7',
          rand
        );
        const qCap = new THREE.Quaternion().setFromUnitVectors(
          new THREE.Vector3(0, 1, 0),
          tipTan
        );
        const capMat = new THREE.Matrix4().makeRotationFromQuaternion(qCap);
        capMat.setPosition(tipPos);

        capParts.forEach((cp) => {
          cp.applyMatrix4(capMat);
          detailGeometries.push(cp);
        });
      }
    }
  } else if (archetype === 'turkey_tail_bracket') {
    // Cascading rosettes of fan-shaped bracket / shelf fungi (Trametes versicolor) deeply embedded in rock
    const shelfCount = Math.max(
      8,
      Math.round((14 + p.leafDensity * 3) * Math.min(1.5, densityMult))
    );
    const fanSegs = Math.max(8, Math.round(16 * densityMult));

    for (let sh = 0; sh < shelfCount; sh++) {
      const uAng = sh * golden + (rand() - 0.5) * 0.25;
      const radFrac = 0.2 + (sh / shelfCount) * 0.62;
      const { pos, normal } = sampleRockTopPoint(uAng, radFrac);

      const fanR = (0.28 + rand() * 0.26) * scaleMult;
      const fanThick = fanR * 0.16;
      const fanGeo = new THREE.CylinderGeometry(
        fanR,
        fanR * 0.28,
        fanThick,
        fanSegs,
        2,
        false,
        -Math.PI * 0.58,
        Math.PI * 1.16
      );
      const fPos = fanGeo.attributes.position;
      for (let i = 0; i < fPos.count; i++) {
        const vx = fPos.getX(i);
        const vy = fPos.getY(i);
        const vz = fPos.getZ(i);
        const rDist = Math.hypot(vx, vz) / fanR;
        const theta = Math.atan2(vz, vx);
        const wave = Math.sin(theta * 6 + sh) * 0.04 * rDist;
        fPos.setY(i, vy + wave);
      }
      fanGeo.computeVertexNormals();
      // Shift inward so the rear attachment base of the shelf penetrates into the rock
      fanGeo.translate(0, 0, fanR * 0.22);
      fanGeo.rotateY(uAng + Math.PI * 0.5);
      fanGeo.rotateX((rand() - 0.5) * 0.16);
      fanGeo.translate(
        pos.x - normal.x * fanR * 0.22,
        pos.y - 0.02,
        pos.z - normal.z * fanR * 0.22
      );

      const fStd = ensureStandardAttributes(fanGeo);
      colorizeGeometryGradient(fStd, colFungi, colAccent, rand, 0.08);
      detailGeometries.push(fStd);
    }
  } else if (archetype === 'pixie_cup_lichen') {
    // Cladonia pyxidata goblet/trumpet pixie-cup lichens + scarlet apothecia tips fused to the rim
    const cupCount = Math.max(
      10,
      Math.round((18 + p.leafDensity * 3) * Math.min(1.5, densityMult))
    );
    const latheSegs = Math.max(8, Math.round(14 * densityMult));

    for (let c = 0; c < cupCount; c++) {
      const uAng = c * golden + (rand() - 0.5) * 0.3;
      const radFrac = Math.sqrt((c + 0.3) / cupCount) * 0.68;
      const { pos, normal } = sampleRockTopPoint(uAng, radFrac);

      const podH = (0.26 + rand() * 0.28) * scaleMult;
      const cupR = podH * (0.44 + rand() * 0.15);

      // Closed-wall goblet profile with concave inner cup floor (zero gaps)
      const profile: THREE.Vector2[] = [
        new THREE.Vector2(0.001, -0.05),
        new THREE.Vector2(cupR * 0.36, 0.0),
        new THREE.Vector2(cupR * 0.28, podH * 0.48),
        new THREE.Vector2(cupR * 0.68, podH * 0.80),
        new THREE.Vector2(cupR * 1.0, podH * 0.96),
        new THREE.Vector2(cupR * 0.86, podH * 1.0),
        new THREE.Vector2(cupR * 0.48, podH * 0.78),
        new THREE.Vector2(0.001, podH * 0.68),
      ];
      const goblet = buildSeamlessRevolvedCap(
        profile,
        latheSegs,
        cupR,
        podH,
        'funnel',
        colMossMain,
        colMossTip,
        rand
      );

      // Shared transformation matrix for both the goblet AND its rim apothecia so they never separate!
      const tiltMat = new THREE.Matrix4().makeTranslation(pos.x, pos.y - 0.02, pos.z);
      tiltMat.multiply(new THREE.Matrix4().makeRotationZ((rand() - 0.5) * 0.24));
      tiltMat.multiply(new THREE.Matrix4().makeRotationX((rand() - 0.5) * 0.24));

      goblet.applyMatrix4(tiltMat);
      detailGeometries.push(goblet);

      // Scarlet British-soldier apothecia tubercles fused directly onto the goblet rim
      for (let b = 0; b < 4; b++) {
        const bAng = (b / 4) * Math.PI * 2 + rand() * 0.5;
        const tipR = cupR * 0.18;
        const tip = new THREE.IcosahedronGeometry(tipR, 1);
        tip.translate(
          Math.cos(bAng) * cupR * 0.9,
          podH * 0.96 - tipR * 0.25,
          Math.sin(bAng) * cupR * 0.9
        );
        tip.applyMatrix4(tiltMat);
        const tStd = ensureStandardAttributes(tip);
        colorizeGeometryGradient(tStd, colFungi, colAccent, rand, 0.04);
        detailGeometries.push(tStd);
      }

      // Delicate lichen rhizine filaments at the base
      const rhizines = buildSoftFilamentTuft(
        pos,
        normal,
        cupR * 0.8,
        podH * 0.35,
        3,
        colMossMain,
        colMossTip,
        rand
      );
      rhizines.forEach((rh) => detailGeometries.push(rh));
    }
  } else if (archetype === 'coral_fungus_ramaria') {
    // Branching Golden Coral Fungus (Ramaria aurea) with seamless bifurcated forks & terminal filaments
    const bushCount = Math.max(3, Math.min(7, p.branchCount || 4));
    for (let b = 0; b < bushCount; b++) {
      const bAng = (b / bushCount) * Math.PI * 2 + 0.3;
      const { pos, normal } = sampleRockTopPoint(bAng, b === 0 ? 0.1 : 0.44);
      const branches = Math.max(6, Math.round(12 * Math.min(1.4, densityMult)));

      // Shared fleshy basal trunk cushion rooted in the rock
      const baseBulb = new THREE.IcosahedronGeometry(0.12 * scaleMult, 2);
      baseBulb.scale(1.2, 0.85, 1.2);
      baseBulb.translate(pos.x, pos.y + 0.02, pos.z);
      const bbStd = ensureStandardAttributes(baseBulb);
      colorizeGeometryGradient(bbStd, '#d6d3d1', colFungi, rand, 0.04);
      bodyGeometries.push(bbStd);

      // Basal mycelial filaments around the coral fungus base
      const baseFils = buildSoftFilamentTuft(
        pos,
        normal,
        0.18 * scaleMult,
        0.2 * scaleMult,
        5,
        colFungi,
        colAccent,
        rand
      );
      baseFils.forEach((bf) => detailGeometries.push(bf));

      for (let br = 0; br < branches; br++) {
        const ang = (br / branches) * Math.PI * 2 + rand() * 0.4;
        const spread = (0.14 + (br / branches) * 0.28) * scaleMult;
        const h = (0.38 + rand() * 0.35) * scaleMult;
        const pts = [
          new THREE.Vector3(pos.x, pos.y - 0.04, pos.z),
          new THREE.Vector3(
            pos.x + Math.cos(ang) * spread * 0.58,
            pos.y + h * 0.55,
            pos.z + Math.sin(ang) * spread * 0.58
          ),
          new THREE.Vector3(
            pos.x + Math.cos(ang) * spread,
            pos.y + h,
            pos.z + Math.sin(ang) * spread
          ),
        ];
        const rArmTop = 0.028 * scaleMult;
        const coralArm = buildCurvedStalk(
          pts,
          0.052 * scaleMult,
          rArmTop,
          7,
          6,
          colFungi,
          colAccent,
          rand,
          0.2
        );
        detailGeometries.push(coralArm);

        // Bifurcated crown forks starting directly inside pts[2] (zero separation!)
        const forkNode = pts[2];
        for (const fork of [-1, 1]) {
          const forkAng = ang + fork * 0.65;
          const forkSpread = 0.075 * scaleMult;
          const forkH = 0.15 * scaleMult;
          const fPts = [
            new THREE.Vector3(forkNode.x, forkNode.y - 0.018, forkNode.z),
            new THREE.Vector3(
              forkNode.x + Math.cos(forkAng) * forkSpread * 0.6,
              forkNode.y + forkH * 0.55,
              forkNode.z + Math.sin(forkAng) * forkSpread * 0.6
            ),
            new THREE.Vector3(
              forkNode.x + Math.cos(forkAng) * forkSpread,
              forkNode.y + forkH,
              forkNode.z + Math.sin(forkAng) * forkSpread
            ),
          ];
          const forkBranch = buildCurvedStalk(
            fPts,
            rArmTop * 0.95,
            0.008 * scaleMult,
            5,
            5,
            colFungi,
            colAccent,
            rand,
            0.05,
            true
          );
          detailGeometries.push(forkBranch);
        }
      }
    }
  } else {
    // puffball_birds_nest: Pear-shaped Puffballs (Lycoperdon) & Bird's-Nest splash cups (Cyathus)
    const puffCount = Math.max(
      5,
      Math.round((8 + p.leafDensity) * Math.min(1.4, densityMult))
    );
    const subdiv = densityMult < 0.5 ? 1 : 2;
    const latheSegs = Math.max(10, Math.round(16 * densityMult));

    for (let pf = 0; pf < puffCount; pf++) {
      const uAng = pf * golden + (rand() - 0.5) * 0.3;
      const radFrac = Math.sqrt((pf + 0.3) / puffCount) * 0.64;
      const { pos, normal } = sampleRockTopPoint(uAng, radFrac);
      const rPuff = (0.16 + rand() * 0.14) * scaleMult;

      // Soft basal mycelial filaments anchoring the puffball or bird's-nest cup to the mossy rock
      const baseFils = buildSoftFilamentTuft(
        pos,
        normal,
        rPuff * 1.15,
        rPuff * 0.85,
        4,
        colMossMain,
        colAccent,
        rand
      );
      baseFils.forEach((bf) => detailGeometries.push(bf));

      if (pf % 2 === 0) {
        // Pear-shaped puffball seated into the rock/moss (pos.y + rPuff * 0.62 so bottom is buried)
        const puff = new THREE.IcosahedronGeometry(rPuff, subdiv);
        puff.scale(1.0, 1.22, 1.0);
        puff.translate(pos.x, pos.y + rPuff * 0.62, pos.z);
        const pfStd = ensureStandardAttributes(puff);
        colorizeGeometryGradient(pfStd, colFungi, colAccent, rand, 0.06);
        detailGeometries.push(pfStd);
      } else {
        // Bird's-nest splash cup (Cyathus) with solid concave interior floor so the eggs rest on the floor
        const cupH = rPuff * 0.95;
        const cupProfile: THREE.Vector2[] = [
          new THREE.Vector2(0.001, -0.06),
          new THREE.Vector2(rPuff * 0.52, 0.0),
          new THREE.Vector2(rPuff * 0.78, cupH * 0.55),
          new THREE.Vector2(rPuff * 1.0, cupH * 0.96),
          new THREE.Vector2(rPuff * 0.84, cupH * 1.0),
          new THREE.Vector2(rPuff * 0.58, cupH * 0.42),
          new THREE.Vector2(0.001, cupH * 0.32),
        ];
        const cup = buildSeamlessRevolvedCap(
          cupProfile,
          latheSegs,
          rPuff,
          cupH,
          'funnel',
          '#57534e',
          colFungi,
          rand
        );
        cup.translate(pos.x, pos.y - 0.02, pos.z);
        detailGeometries.push(cup);

        // 3 lenticular white peridiole "eggs" resting directly on the cup's interior floor (cupH * 0.38)
        for (let e = 0; e < 3; e++) {
          const eAng = (e / 3) * Math.PI * 2 + 0.25;
          const egg = new THREE.IcosahedronGeometry(rPuff * 0.25, 1);
          egg.scale(1.12, 0.62, 1.12);
          egg.translate(
            pos.x + Math.cos(eAng) * rPuff * 0.28,
            pos.y + cupH * 0.40,
            pos.z + Math.sin(eAng) * rPuff * 0.28
          );
          const eStd = ensureStandardAttributes(egg);
          colorizeGeometryGradient(eStd, '#e7e5e4', '#ffffff', rand, 0.02);
          detailGeometries.push(eStd);
        }
      }
    }
  }

  return { bodyGeometries, detailGeometries };
}
