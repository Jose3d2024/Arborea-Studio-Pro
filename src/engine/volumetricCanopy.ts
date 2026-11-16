import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  CrownEnvelopeShape,
  RepresentationStyle,
  SeasonMode,
  PolygonLOD,
} from '../types/botany';
import { ensureStandardAttributes, colorizeGeometryGradient } from './foliageGenerator';

export interface CanopyNode {
  position: THREE.Vector3;
  radius: number;
  direction: THREE.Vector3;
}

export interface VolumetricCanopyOptions {
  style: RepresentationStyle;
  crownShape: CrownEnvelopeShape;
  nodes: CanopyNode[];
  treeHeight: number;
  trunkClearHeight: number;
  crownWidthRatio: number;
  metaballThreshold: number;
  metaballResolution: number;
  clusterNoise: number;
  clusterFlatten: number;
  subdivisionDetail: number;
  smoothShading: boolean;
  colorMain: string;
  colorTip: string;
  season: SeasonMode;
  lod: PolygonLOD;
  rand: () => number;
}

function hash3(x: number, y: number, z: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return n - Math.floor(n);
}

function noise3D(x: number, y: number, z: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fy = y - iy;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const uz = fz * fz * (3 - 2 * fz);

  const n000 = hash3(ix, iy, iz);
  const n100 = hash3(ix + 1, iy, iz);
  const n010 = hash3(ix, iy + 1, iz);
  const n110 = hash3(ix + 1, iy + 1, iz);
  const n001 = hash3(ix, iy, iz + 1);
  const n101 = hash3(ix + 1, iy, iz + 1);
  const n011 = hash3(ix, iy + 1, iz + 1);
  const n111 = hash3(ix + 1, iy + 1, iz + 1);

  const nx00 = n000 + (n100 - n000) * ux;
  const nx10 = n010 + (n110 - n010) * ux;
  const nx01 = n001 + (n101 - n001) * ux;
  const nx11 = n011 + (n111 - n011) * ux;

  const nxy0 = nx00 + (nx10 - nx00) * uy;
  const nxy1 = nx01 + (nx11 - nx01) * uy;

  return nxy0 + (nxy1 - nxy0) * uz;
}

/**
 * Evaluates Weber & Penn / Andrew Marsh Tree3D Crown Envelope Radius Ratio at normalized height t in [0, 1]
 */
export function evaluateCrownEnvelopeRatio(shape: CrownEnvelopeShape, t: number): number {
  const ct = THREE.MathUtils.clamp(t, 0, 1);
  switch (shape) {
    case 'conical':
      return Math.max(0.12, 1.0 - 0.85 * ct);
    case 'inverse_conical':
      return 0.25 + 0.75 * ct;
    case 'hemispherical':
      return Math.sin(ct * Math.PI * 0.5 + Math.PI * 0.5) * 0.95 + 0.05;
    case 'cylindrical':
      return 0.88 + 0.12 * Math.sin(ct * Math.PI);
    case 'tapered_cylinder':
      return 0.95 - 0.45 * ct;
    case 'flame':
      return ct <= 0.35
        ? 0.35 + (ct / 0.35) * 0.65
        : Math.pow((1.0 - ct) / 0.65, 1.35);
    case 'umbrella':
      return ct < 0.55
        ? 0.25 + (ct / 0.55) * 0.75
        : Math.sin(((ct - 0.55) / 0.45) * Math.PI * 0.5 + Math.PI * 0.5);
    case 'spherical':
    default:
      return Math.max(0.15, Math.sin(Math.pow(ct, 0.85) * Math.PI));
  }
}

function getSeasonPalette(
  colorMain: string,
  colorTip: string,
  season: SeasonMode,
  rand: () => number
): { c1: THREE.Color; c2: THREE.Color } {
  const c1 = new THREE.Color(colorMain);
  const c2 = new THREE.Color(colorTip);
  if (season === 'spring') {
    c1.offsetHSL(0.02, 0.1, 0.04);
    c2.offsetHSL(0.03, 0.14, 0.08);
  } else if (season === 'autumn') {
    c1.set('#9a3412').lerp(new THREE.Color('#b91c1c'), rand() * 0.45);
    c2.set('#f59e0b').lerp(new THREE.Color('#fde047'), rand() * 0.65);
  } else if (season === 'winter') {
    c1.set('#94a3b8');
    c2.set('#f8fafc');
  }
  return { c1, c2 };
}

/**
 * 1. MARCHING TETRAHEDRA / VOLUMETRIC ISO-SURFACE METABALLS (Andrew Marsh Tree3D-Web)
 * Evaluates a 3D scalar field from all canopy nodes and extracts a smooth triangular iso-surface.
 */
function buildMetaballIsoSurface(opts: VolumetricCanopyOptions): THREE.BufferGeometry | null {
  const {
    nodes,
    metaballThreshold,
    metaballResolution,
    clusterNoise,
    clusterFlatten,
    colorMain,
    colorTip,
    season,
    rand,
  } = opts;

  if (nodes.length === 0) return null;

  const flattenY = Math.max(0.35, 1.0 - clusterFlatten * 0.55);
  const minB = new THREE.Vector3(Infinity, Infinity, Infinity);
  const maxB = new THREE.Vector3(-Infinity, -Infinity, -Infinity);

  for (const n of nodes) {
    const pad = n.radius * 1.95;
    minB.x = Math.min(minB.x, n.position.x - pad);
    minB.y = Math.min(minB.y, n.position.y - pad * flattenY);
    minB.z = Math.min(minB.z, n.position.z - pad);
    maxB.x = Math.max(maxB.x, n.position.x + pad);
    maxB.y = Math.max(maxB.y, n.position.y + pad * flattenY);
    maxB.z = Math.max(maxB.z, n.position.z + pad);
  }

  const res = THREE.MathUtils.clamp(Math.round(metaballResolution || 18), 10, 26);
  const nx = res;
  const ny = res;
  const nz = res;

  const sizeX = Math.max(0.5, maxB.x - minB.x);
  const sizeY = Math.max(0.5, maxB.y - minB.y);
  const sizeZ = Math.max(0.5, maxB.z - minB.z);
  const stepX = sizeX / (nx - 1);
  const stepY = sizeY / (ny - 1);
  const stepZ = sizeZ / (nz - 1);

  const invFlatSq = 1 / (flattenY * flattenY);
  const field = new Float32Array(nx * ny * nz);

  const idx3 = (ix: number, iy: number, iz: number) => (iz * ny + iy) * nx + ix;

  for (let iz = 0; iz < nz; iz++) {
    const pz = minB.z + iz * stepZ;
    for (let iy = 0; iy < ny; iy++) {
      const py = minB.y + iy * stepY;
      for (let ix = 0; ix < nx; ix++) {
        const px = minB.x + ix * stepX;

        let sum = 0;
        for (let k = 0; k < nodes.length; k++) {
          const nd = nodes[k];
          const dx = px - nd.position.x;
          const dy = py - nd.position.y;
          const dz = pz - nd.position.z;
          const d2 = dx * dx + dy * dy * invFlatSq + dz * dz;
          const r2 = nd.radius * nd.radius;
          if (d2 < r2 * 4.0) {
            const q = 1.0 - d2 / (r2 * 4.0);
            sum += q * q * 2.2;
          }
        }

        if (sum > 0.1 && clusterNoise > 0.01) {
          sum += (noise3D(px * 1.4, py * 1.4, pz * 1.4) - 0.5) * clusterNoise * 0.85;
        }
        field[idx3(ix, iy, iz)] = sum;
      }
    }
  }

  // Marching Tetrahedra decomposition (6 tetrahedra per grid cube, guaranteed manifold & crack-free)
  const iso = THREE.MathUtils.clamp(metaballThreshold || 1.0, 0.35, 2.2);
  const positions: number[] = [];

  const TETS = [
    [0, 5, 1, 6],
    [0, 1, 2, 6],
    [0, 2, 3, 6],
    [0, 3, 7, 6],
    [0, 7, 4, 6],
    [0, 4, 5, 6],
  ];

  const interp = (
    p1x: number, p1y: number, p1z: number, v1: number,
    p2x: number, p2y: number, p2z: number, v2: number
  ): [number, number, number] => {
    const dv = v2 - v1;
    const t = Math.abs(dv) < 1e-5 ? 0.5 : THREE.MathUtils.clamp((iso - v1) / dv, 0, 1);
    return [
      p1x + (p2x - p1x) * t,
      p1y + (p2y - p1y) * t,
      p1z + (p2z - p1z) * t,
    ];
  };

  const emitTri = (
    a: [number, number, number],
    b: [number, number, number],
    c: [number, number, number],
    insidePoint: [number, number, number]
  ) => {
    // Orient triangle normal pointing away from the inside vertex (outward from metaball)
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const nxComp = uy * vz - uz * vy;
    const nyComp = uz * vx - ux * vz;
    const nzComp = ux * vy - uy * vx;

    const toOutX = a[0] - insidePoint[0];
    const toOutY = a[1] - insidePoint[1];
    const toOutZ = a[2] - insidePoint[2];

    if (nxComp * toOutX + nyComp * toOutY + nzComp * toOutZ >= 0) {
      positions.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    } else {
      positions.push(a[0], a[1], a[2], c[0], c[1], c[2], b[0], b[1], b[2]);
    }
  };

  for (let iz = 0; iz < nz - 1; iz++) {
    const z0 = minB.z + iz * stepZ;
    const z1 = z0 + stepZ;
    for (let iy = 0; iy < ny - 1; iy++) {
      const y0 = minB.y + iy * stepY;
      const y1 = y0 + stepY;
      for (let ix = 0; ix < nx - 1; ix++) {
        const x0 = minB.x + ix * stepX;
        const x1 = x0 + stepX;

        const v0 = field[idx3(ix, iy, iz)];
        const v1 = field[idx3(ix + 1, iy, iz)];
        const v2 = field[idx3(ix + 1, iy, iz + 1)];
        const v3 = field[idx3(ix, iy, iz + 1)];
        const v4 = field[idx3(ix, iy + 1, iz)];
        const v5 = field[idx3(ix + 1, iy + 1, iz)];
        const v6 = field[idx3(ix + 1, iy + 1, iz + 1)];
        const v7 = field[idx3(ix, iy + 1, iz + 1)];

        const maxV = Math.max(v0, v1, v2, v3, v4, v5, v6, v7);
        const minV = Math.min(v0, v1, v2, v3, v4, v5, v6, v7);
        if (maxV < iso || minV > iso) continue;

        const cubePts: [number, number, number][] = [
          [x0, y0, z0],
          [x1, y0, z0],
          [x1, y0, z1],
          [x0, y0, z1],
          [x0, y1, z0],
          [x1, y1, z0],
          [x1, y1, z1],
          [x0, y1, z1],
        ];
        const cubeVals = [v0, v1, v2, v3, v4, v5, v6, v7];

        for (let t = 0; t < 6; t++) {
          const tet = TETS[t];
          const inside: number[] = [];
          const outside: number[] = [];
          for (let c = 0; c < 4; c++) {
            const ci = tet[c];
            if (cubeVals[ci] >= iso) inside.push(ci);
            else outside.push(ci);
          }
          if (inside.length === 0 || inside.length === 4) continue;

          if (inside.length === 1) {
            const i0 = inside[0];
            const o0 = outside[0], o1 = outside[1], o2 = outside[2];
            const a = interp(...cubePts[i0], cubeVals[i0], ...cubePts[o0], cubeVals[o0]);
            const b = interp(...cubePts[i0], cubeVals[i0], ...cubePts[o1], cubeVals[o1]);
            const c = interp(...cubePts[i0], cubeVals[i0], ...cubePts[o2], cubeVals[o2]);
            emitTri(a, b, c, cubePts[i0]);
          } else if (inside.length === 3) {
            const o0 = outside[0];
            const i0 = inside[0], i1 = inside[1], i2 = inside[2];
            const a = interp(...cubePts[i0], cubeVals[i0], ...cubePts[o0], cubeVals[o0]);
            const b = interp(...cubePts[i1], cubeVals[i1], ...cubePts[o0], cubeVals[o0]);
            const c = interp(...cubePts[i2], cubeVals[i2], ...cubePts[o0], cubeVals[o0]);
            emitTri(a, b, c, cubePts[i0]);
          } else if (inside.length === 2) {
            const i0 = inside[0], i1 = inside[1];
            const o0 = outside[0], o1 = outside[1];
            const p00 = interp(...cubePts[i0], cubeVals[i0], ...cubePts[o0], cubeVals[o0]);
            const p01 = interp(...cubePts[i0], cubeVals[i0], ...cubePts[o1], cubeVals[o1]);
            const p10 = interp(...cubePts[i1], cubeVals[i1], ...cubePts[o0], cubeVals[o0]);
            const p11 = interp(...cubePts[i1], cubeVals[i1], ...cubePts[o1], cubeVals[o1]);
            emitTri(p00, p01, p11, cubePts[i0]);
            emitTri(p00, p11, p10, cubePts[i1]);
          }
        }
      }
    }
  }

  if (positions.length === 0) return null;

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  const stdGeo = ensureStandardAttributes(geo);
  const { c1, c2 } = getSeasonPalette(colorMain, colorTip, season, rand);
  colorizeGeometryGradient(stdGeo, c1, c2, rand, 0.06);
  return stdGeo;
}

/**
 * 2. GEODESIC / PERLIN-DISPLACED SPHERE CLUSTERS (Tree3D-Web & Wiskered TreeGen)
 */
function buildGeodesicClusters(opts: VolumetricCanopyOptions): THREE.BufferGeometry | null {
  const {
    nodes,
    clusterNoise,
    clusterFlatten,
    subdivisionDetail,
    colorMain,
    colorTip,
    season,
    rand,
  } = opts;
  if (nodes.length === 0) return null;

  const detail = THREE.MathUtils.clamp(subdivisionDetail ?? 1, 0, 3);
  const flattenY = Math.max(0.3, 1.0 - clusterFlatten * 0.58);
  const { c1, c2 } = getSeasonPalette(colorMain, colorTip, season, rand);
  const parts: THREE.BufferGeometry[] = [];

  for (let i = 0; i < nodes.length; i++) {
    const nd = nodes[i];
    const r = nd.radius * 0.85;
    const ico = new THREE.IcosahedronGeometry(r, detail);
    const pos = ico.attributes.position;

    for (let v = 0; v < pos.count; v++) {
      const vx = pos.getX(v);
      const vy = pos.getY(v) * flattenY;
      const vz = pos.getZ(v);

      let disp = 1.0;
      if (clusterNoise > 0.01) {
        const n = noise3D(
          (vx + nd.position.x) * 2.2,
          (vy + nd.position.y) * 2.2,
          (vz + nd.position.z) * 2.2
        );
        disp = 1.0 + (n - 0.45) * clusterNoise * 0.65;
      }
      pos.setXYZ(v, vx * disp + nd.position.x, vy * disp + nd.position.y, vz * disp + nd.position.z);
    }

    ico.computeVertexNormals();
    const std = ensureStandardAttributes(ico);
    colorizeGeometryGradient(std, c1, c2, rand, 0.08);
    parts.push(std);
  }

  const merged = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  return merged;
}

/**
 * 3. FIBONACCI PHYLLOTAXIS SPIRAL DOMES (Andrew Marsh Tree3D-Web)
 */
function buildFibonacciPhyllotaxis(opts: VolumetricCanopyOptions): THREE.BufferGeometry | null {
  const {
    nodes,
    clusterFlatten,
    subdivisionDetail,
    colorMain,
    colorTip,
    season,
    rand,
  } = opts;
  if (nodes.length === 0) return null;

  const { c1, c2 } = getSeasonPalette(colorMain, colorTip, season, rand);
  const parts: THREE.BufferGeometry[] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  const platesPerNode = Math.max(8, 10 + (subdivisionDetail || 1) * 8);
  const flattenY = Math.max(0.35, 1.0 - clusterFlatten * 0.5);

  const discTemplate = new THREE.CircleGeometry(1, 5);
  const discStd = ensureStandardAttributes(discTemplate);

  for (let i = 0; i < nodes.length; i++) {
    const nd = nodes[i];
    const r = nd.radius * 0.92;
    for (let k = 0; k < platesPerNode; k++) {
      const yNorm = 1 - (k / Math.max(1, platesPerNode - 1)) * 1.65; // upper hemisphere + skirt
      const radiusAtY = Math.sqrt(Math.max(0, 1 - yNorm * yNorm * 0.55));
      const theta = k * golden;

      const lx = Math.cos(theta) * radiusAtY * r;
      const ly = yNorm * r * flattenY;
      const lz = Math.sin(theta) * radiusAtY * r;

      const plate = discStd.clone();
      const plateSize = nd.radius * (0.28 + (1 - Math.abs(yNorm) * 0.35) * 0.14);
      plate.scale(plateSize, plateSize, plateSize);

      const m = new THREE.Matrix4().makeTranslation(
        nd.position.x + lx,
        nd.position.y + ly,
        nd.position.z + lz
      );
      m.multiply(new THREE.Matrix4().makeRotationY(-theta + Math.PI * 0.5));
      m.multiply(new THREE.Matrix4().makeRotationX(-Math.acos(THREE.MathUtils.clamp(yNorm * 0.7, -1, 1))));
      plate.applyMatrix4(m);
      colorizeGeometryGradient(plate, c1, c2, rand, 0.07);
      parts.push(plate);
    }
  }
  discStd.dispose();

  const merged = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  return merged;
}

/**
 * 4. TIERED HORIZONTAL ARCHITECTURAL PLATES (Tree3D-Web BIM / Solar Study)
 */
function buildTieredPlates(opts: VolumetricCanopyOptions): THREE.BufferGeometry | null {
  const {
    nodes,
    subdivisionDetail,
    colorMain,
    colorTip,
    season,
    rand,
  } = opts;
  if (nodes.length === 0) return null;

  const { c1, c2 } = getSeasonPalette(colorMain, colorTip, season, rand);
  const parts: THREE.BufferGeometry[] = [];
  const radialSegs = Math.max(6, 6 + (subdivisionDetail || 1) * 4);

  for (let i = 0; i < nodes.length; i++) {
    const nd = nodes[i];
    const tiers = 3;
    for (let t = 0; t < tiers; t++) {
      const tf = (t - 1) * 0.38;
      const tierRad = nd.radius * (1.05 - Math.abs(tf) * 0.65);
      const plateH = nd.radius * 0.11;
      const cyl = new THREE.CylinderGeometry(tierRad * 0.88, tierRad, plateH, radialSegs, 1);
      cyl.translate(nd.position.x, nd.position.y + tf * nd.radius, nd.position.z);
      const std = ensureStandardAttributes(cyl);
      colorizeGeometryGradient(std, c1, c2, rand, 0.06);
      parts.push(std);
    }
  }

  const merged = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  return merged;
}

/**
 * 5. PARAMETRIC ARCHITECTURAL CROWN ENVELOPE (Andrew Marsh Tree3D-Web Envelope)
 */
function buildArchitecturalEnvelope(opts: VolumetricCanopyOptions): THREE.BufferGeometry | null {
  const {
    crownShape,
    treeHeight,
    trunkClearHeight,
    crownWidthRatio,
    clusterNoise,
    subdivisionDetail,
    colorMain,
    colorTip,
    season,
    rand,
  } = opts;

  const clearH = treeHeight * THREE.MathUtils.clamp(trunkClearHeight || 0.28, 0.08, 0.72);
  const crownH = Math.max(0.8, treeHeight - clearH * 0.85);
  const maxRadius = treeHeight * (crownWidthRatio || 0.42);

  const latheSteps = Math.max(10, 10 + (subdivisionDetail || 1) * 6);
  const radialSegs = Math.max(10, 10 + (subdivisionDetail || 1) * 8);

  const points: THREE.Vector2[] = [];
  for (let i = 0; i <= latheSteps; i++) {
    const t = i / latheSteps;
    const rRatio = i === 0 || i === latheSteps ? 0.001 : evaluateCrownEnvelopeRatio(crownShape, t);
    points.push(new THREE.Vector2(maxRadius * rRatio, clearH * 0.85 + t * crownH));
  }

  const lathe = new THREE.LatheGeometry(points, radialSegs);
  if (clusterNoise > 0.01) {
    const pos = lathe.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i);
      const vy = pos.getY(i);
      const vz = pos.getZ(i);
      const n = noise3D(vx * 1.2, vy * 1.2, vz * 1.2);
      const sc = 1.0 + (n - 0.5) * clusterNoise * 0.35;
      pos.setXYZ(i, vx * sc, vy, vz * sc);
    }
    lathe.computeVertexNormals();
  }

  const std = ensureStandardAttributes(lathe);
  const { c1, c2 } = getSeasonPalette(colorMain, colorTip, season, rand);
  colorizeGeometryGradient(std, c1, c2, rand, 0.05);
  return std;
}

/**
 * 6. 3D VOXELIZED CANOPY GRID (Surface-Culled Volumetric Voxel Canopy)
 */
function buildVoxelCanopy(opts: VolumetricCanopyOptions): THREE.BufferGeometry | null {
  const {
    nodes,
    metaballThreshold,
    metaballResolution,
    clusterFlatten,
    colorMain,
    colorTip,
    season,
    rand,
  } = opts;
  if (nodes.length === 0) return null;

  const flattenY = Math.max(0.4, 1.0 - clusterFlatten * 0.5);
  const minB = new THREE.Vector3(Infinity, Infinity, Infinity);
  const maxB = new THREE.Vector3(-Infinity, -Infinity, -Infinity);

  for (const n of nodes) {
    const pad = n.radius * 1.4;
    minB.x = Math.min(minB.x, n.position.x - pad);
    minB.y = Math.min(minB.y, n.position.y - pad * flattenY);
    minB.z = Math.min(minB.z, n.position.z - pad);
    maxB.x = Math.max(maxB.x, n.position.x + pad);
    maxB.y = Math.max(maxB.y, n.position.y + pad * flattenY);
    maxB.z = Math.max(maxB.z, n.position.z + pad);
  }

  const res = THREE.MathUtils.clamp(Math.round((metaballResolution || 16) * 0.8), 8, 18);
  const step = Math.max(
    (maxB.x - minB.x) / res,
    (maxB.y - minB.y) / res,
    (maxB.z - minB.z) / res,
    0.22
  );

  const nx = Math.max(4, Math.ceil((maxB.x - minB.x) / step));
  const ny = Math.max(4, Math.ceil((maxB.y - minB.y) / step));
  const nz = Math.max(4, Math.ceil((maxB.z - minB.z) / step));

  const occupied = new Uint8Array(nx * ny * nz);
  const idx = (x: number, y: number, z: number) => (z * ny + y) * nx + x;
  const iso = THREE.MathUtils.clamp(metaballThreshold || 1.0, 0.4, 2.0);
  const invFlatSq = 1 / (flattenY * flattenY);

  for (let iz = 0; iz < nz; iz++) {
    const pz = minB.z + (iz + 0.5) * step;
    for (let iy = 0; iy < ny; iy++) {
      const py = minB.y + (iy + 0.5) * step;
      for (let ix = 0; ix < nx; ix++) {
        const px = minB.x + (ix + 0.5) * step;
        let sum = 0;
        for (let k = 0; k < nodes.length; k++) {
          const nd = nodes[k];
          const dx = px - nd.position.x;
          const dy = py - nd.position.y;
          const dz = pz - nd.position.z;
          const d2 = dx * dx + dy * dy * invFlatSq + dz * dz;
          const r2 = nd.radius * nd.radius * 1.4;
          if (d2 < r2) {
            const q = 1 - d2 / r2;
            sum += q * q * 2.0;
          }
        }
        if (sum >= iso) occupied[idx(ix, iy, iz)] = 1;
      }
    }
  }

  const parts: THREE.BufferGeometry[] = [];
  const boxTemplate = ensureStandardAttributes(new THREE.BoxGeometry(step * 0.96, step * 0.96, step * 0.96));
  const { c1, c2 } = getSeasonPalette(colorMain, colorTip, season, rand);

  for (let iz = 0; iz < nz; iz++) {
    for (let iy = 0; iy < ny; iy++) {
      for (let ix = 0; ix < nx; ix++) {
        if (!occupied[idx(ix, iy, iz)]) continue;
        // Skip interior hidden voxels
        const isInterior =
          ix > 0 && ix < nx - 1 &&
          iy > 0 && iy < ny - 1 &&
          iz > 0 && iz < nz - 1 &&
          occupied[idx(ix - 1, iy, iz)] &&
          occupied[idx(ix + 1, iy, iz)] &&
          occupied[idx(ix, iy - 1, iz)] &&
          occupied[idx(ix, iy + 1, iz)] &&
          occupied[idx(ix, iy, iz - 1)] &&
          occupied[idx(ix, iy, iz + 1)];
        if (isInterior) continue;

        const voxel = boxTemplate.clone();
        voxel.translate(
          minB.x + (ix + 0.5) * step,
          minB.y + (iy + 0.5) * step,
          minB.z + (iz + 0.5) * step
        );
        parts.push(voxel);
      }
    }
  }
  boxTemplate.dispose();

  if (parts.length === 0) return null;
  const merged = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  if (merged) {
    colorizeGeometryGradient(merged, c1, c2, rand, 0.08);
  }
  return merged;
}

export function generateVolumetricStyleCanopy(
  opts: VolumetricCanopyOptions
): THREE.BufferGeometry | null {
  switch (opts.style) {
    case 'metaball_isosurface':
      return buildMetaballIsoSurface(opts);
    case 'geodesic_clusters':
      return buildGeodesicClusters(opts);
    case 'fibonacci_phyllotaxis':
      return buildFibonacciPhyllotaxis(opts);
    case 'tiered_plates':
      return buildTieredPlates(opts);
    case 'architectural_envelope':
      return buildArchitecturalEnvelope(opts);
    case 'voxel_grid':
      return buildVoxelCanopy(opts);
    default:
      return null;
  }
}
