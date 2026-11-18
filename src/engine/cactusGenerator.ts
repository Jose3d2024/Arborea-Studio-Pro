import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { TreeParams, PolygonLOD } from '../types/botany';
import { ensureStandardAttributes, colorizeGeometryGradient } from './foliageGenerator';

export interface CactusMeshResult {
  bodyGeometries: THREE.BufferGeometry[];
  detailGeometries: THREE.BufferGeometry[];
}

/**
 * Generates a ribbed columnar cactus segment or curved elbow tube with rounded dome apex,
 * plus wooly areoles and radiating spine clusters along the rib crests.
 */
function buildCurvedRibbedColumn(
  curvePoints: THREE.Vector3[],
  baseRadius: number,
  topRadius: number,
  ribs: number,
  ribDepth: number,
  colorBody: string,
  colorTip: string,
  colorSpine: string,
  colorFlower: string,
  spineDensity: number,
  spineLength: number,
  spinesPerAreole: number,
  hasFlowerCrown: boolean,
  flowerCount: number,
  lod: PolygonLOD,
  rand: () => number,
  bodyOut: THREE.BufferGeometry[],
  detailOut: THREE.BufferGeometry[]
): THREE.Vector3 {
  const curve = new THREE.CatmullRomCurve3(curvePoints);
  const length = curve.getLength();
  const tubularSegs = Math.max(8, Math.round(curvePoints.length * (lod === 'low' ? 3 : lod === 'medium' ? 5 : 7)));
  const radialSegs = Math.max(12, ribs * (lod === 'low' ? 2 : lod === 'medium' ? 3 : 4));

  const frames = curve.computeFrenetFrames(tubularSegs, false);
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  // Build custom Frenet-Swept Ribbed Mesh with rounded dome top
  const totalRings = tubularSegs + 3; // +3 for rounded hemispherical dome cap
  for (let i = 0; i <= totalRings; i++) {
    let t = Math.min(1, i / tubularSegs);
    let domeFactor = 1.0;
    let extraOffset = 0;

    if (i > tubularSegs) {
      const dt = (i - tubularSegs) / 3; // 0 -> 1 over the dome cap
      domeFactor = Math.cos(dt * Math.PI * 0.48);
      extraOffset = Math.sin(dt * Math.PI * 0.48) * topRadius * 0.85;
    }

    const pt = curve.getPointAt(t);
    const frameIdx = Math.min(tubularSegs, i);
    const N = frames.normals[frameIdx];
    const B = frames.binormals[frameIdx];
    const T = frames.tangents[frameIdx];

    // Slight basal constriction + gentle mid-belly swell
    const swell = 0.88 + 0.18 * Math.sin(Math.pow(t, 0.7) * Math.PI * 0.85);
    const rBase = THREE.MathUtils.lerp(baseRadius, topRadius, t) * swell * domeFactor;

    for (let j = 0; j <= radialSegs; j++) {
      const u = j / radialSegs;
      const theta = u * Math.PI * 2;
      // Sharp outer rib crest, rounded inner furrow
      const ribWave = Math.cos(theta * ribs);
      const ribProfile = 1 + (ribWave > 0 ? Math.pow(ribWave, 0.75) : ribWave * 0.7) * ribDepth * domeFactor;
      const r = Math.max(0.005, rBase * ribProfile);

      const cx = Math.cos(theta) * r;
      const cz = Math.sin(theta) * r;

      const vx = pt.x + N.x * cx + B.x * cz + T.x * extraOffset;
      const vy = pt.y + N.y * cx + B.y * cz + T.y * extraOffset;
      const vz = pt.z + N.z * cx + B.z * cz + T.z * extraOffset;

      positions.push(vx, vy, vz);
      uvs.push(u * 2, t * (length / (baseRadius * 4)));
    }

    if (i < totalRings) {
      const stride = radialSegs + 1;
      const rowA = i * stride;
      const rowB = (i + 1) * stride;
      for (let j = 0; j < radialSegs; j++) {
        indices.push(rowA + j, rowA + j + 1, rowB + j);
        indices.push(rowB + j, rowA + j + 1, rowB + j + 1);
      }
    }
  }

  const colGeo = new THREE.BufferGeometry();
  colGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  colGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  colGeo.setIndex(indices);
  colGeo.computeVertexNormals();
  const nonIdxCol = ensureStandardAttributes(colGeo);

  const cDark = new THREE.Color(colorBody).multiplyScalar(0.78);
  const cMid = new THREE.Color(colorBody).lerp(new THREE.Color(colorTip), 0.35);
  colorizeGeometryGradient(nonIdxCol, cDark, cMid, rand, 0.05);
  bodyOut.push(nonIdxCol);

  // ── AREOLES & SPINE ROSETTES ALONG RIB CRESTS ──
  const lodSpineMult = lod === 'low' ? 0.35 : lod === 'medium' ? 0.7 : lod === 'high' ? 1.0 : 1.35;
  const effectiveSpineDensity = spineDensity * lodSpineMult;

  if (effectiveSpineDensity > 0.05) {
    const areoleRows = Math.max(3, Math.round(length * 2.2 * Math.min(1.8, effectiveSpineDensity)));
    const spinesPerCluster = Math.max(1, Math.min(12, Math.round(spinesPerAreole * Math.min(1.2, lodSpineMult + 0.3))));
    const spineBaseLen = baseRadius * 0.32 * spineLength;
    const spineTemplate = new THREE.ConeGeometry( Math.max(0.004, baseRadius * 0.018), spineBaseLen, 3);
    spineTemplate.translate(0, spineBaseLen * 0.5, 0);
    const spineTemplateNonIdx = ensureStandardAttributes(spineTemplate);
    const cSpineDark = new THREE.Color(colorSpine || '#fef08a').multiplyScalar(0.75);
    const cSpineLight = new THREE.Color(colorSpine || '#fef08a');
    colorizeGeometryGradient(spineTemplateNonIdx, cSpineDark, cSpineLight, rand, 0.04);

    // Subsample ribs on lower LODs to keep triangle counts fast while preserving silhouette
    const ribStep = lod === 'low' ? 2 : 1;

    for (let row = 1; row < areoleRows; row++) {
      const t = row / areoleRows;
      const pt = curve.getPointAt(t);
      const frameIdx = Math.min(tubularSegs, Math.round(t * tubularSegs));
      const N = frames.normals[frameIdx];
      const B = frames.binormals[frameIdx];
      const T = frames.tangents[frameIdx];

      const swell = 0.88 + 0.18 * Math.sin(Math.pow(t, 0.7) * Math.PI * 0.85);
      const rCrest = THREE.MathUtils.lerp(baseRadius, topRadius, t) * swell * (1 + ribDepth);

      for (let r = 0; r < ribs; r += ribStep) {
        if (rand() > 0.82 * Math.min(1.2, effectiveSpineDensity)) continue;
        const theta = (r / ribs) * Math.PI * 2;
        const outDir = new THREE.Vector3()
          .addScaledVector(N, Math.cos(theta))
          .addScaledVector(B, Math.sin(theta))
          .normalize();

        const areolePos = pt.clone().addScaledVector(outDir, rCrest * 0.98);

        // Basis matrix pointing outward along outDir
        const upVec = new THREE.Vector3(0, 1, 0);
        const qBase = new THREE.Quaternion().setFromUnitVectors(upVec, outDir);

        for (let s = 0; s < spinesPerCluster; s++) {
          const sp = spineTemplateNonIdx.clone();
          // Central spine points straight out; radial spines splay in a star cone
          const isCentral = s === 0 && spinesPerCluster >= 3;
          const sScale = isCentral ? 1.35 : 0.75 + rand() * 0.35;
          sp.scale(1, sScale, 1);

          const m = new THREE.Matrix4().makeTranslation(areolePos.x, areolePos.y, areolePos.z);
          const qRot = new THREE.Quaternion().copy(qBase);

          if (!isCentral) {
            const fanAngle = (s / Math.max(1, spinesPerCluster - 1)) * Math.PI * 2;
            const splayQ = new THREE.Quaternion().setFromEuler(
              new THREE.Euler(Math.cos(fanAngle) * 0.62, 0, Math.sin(fanAngle) * 0.62)
            );
            qRot.multiply(splayQ);
          }
          m.multiply(new THREE.Matrix4().makeRotationFromQuaternion(qRot));
          sp.applyMatrix4(m);
          detailOut.push(sp);
        }
        void T;
      }
    }
    spineTemplateNonIdx.dispose();
  }

  // ── APICAL CACTUS CROWN FLOWERS ──
  const tipPos = curve.getPointAt(1.0);
  const tipTangent = frames.tangents[tubularSegs];
  const crownCenter = tipPos.clone().addScaledVector(tipTangent, topRadius * 0.72);

  if (hasFlowerCrown && flowerCount > 0) {
    const count = Math.max(1, Math.min(8, flowerCount));
    const cFlBase = new THREE.Color(colorFlower || '#f43f5e').multiplyScalar(0.75);
    const cFlTip = new THREE.Color(colorFlower || '#fda4af');

    for (let f = 0; f < count; f++) {
      const ang = (f / count) * Math.PI * 2 + rand() * 0.4;
      const ringR = count === 1 ? 0 : topRadius * 0.42;
      const fx = crownCenter.x + Math.cos(ang) * ringR;
      const fy = crownCenter.y + topRadius * 0.08;
      const fz = crownCenter.z + Math.sin(ang) * ringR;

      // Cupped multi-petal cactus flower
      const cupGeo = new THREE.ConeGeometry(topRadius * 0.32, topRadius * 0.36, 7, 1, true);
      cupGeo.rotateX(Math.PI);
      cupGeo.translate(0, topRadius * 0.16, 0);
      const cupNonIdx = ensureStandardAttributes(cupGeo);
      colorizeGeometryGradient(cupNonIdx, cFlBase, cFlTip, rand, 0.05);

      const stamenGeo = new THREE.OctahedronGeometry(topRadius * 0.11, 0);
      stamenGeo.translate(0, topRadius * 0.18, 0);
      const stamenNonIdx = ensureStandardAttributes(stamenGeo);
      colorizeGeometryGradient(stamenNonIdx, '#d97706', '#fef08a', rand, 0.02);

      const mFl = new THREE.Matrix4().makeTranslation(fx, fy, fz);
      mFl.multiply(new THREE.Matrix4().makeRotationY(ang));
      mFl.multiply(new THREE.Matrix4().makeRotationZ(-0.28));
      cupNonIdx.applyMatrix4(mFl);
      stamenNonIdx.applyMatrix4(mFl);
      detailOut.push(cupNonIdx, stamenNonIdx);
    }
  }

  return crownCenter;
}

/**
 * Generates Opuntia (Prickly Pear / Nopal) flattened cladodes (pads) with spines and tunas
 */
function generateOpuntiaCladodes(
  p: TreeParams,
  lod: PolygonLOD,
  rand: () => number,
  bodyOut: THREE.BufferGeometry[],
  detailOut: THREE.BufferGeometry[]
): void {
  const maxLevel = Math.min(4, Math.max(2, p.levels));
  const basePadH = p.height * 0.34;
  const basePadW = basePadH * 0.72;
  const basePadThick = Math.max(0.08, p.radius * 0.38);

  function addPad(matrix: THREE.Matrix4, level: number, padH: number, padW: number, padThick: number) {
    const segs = lod === 'low' ? 1 : lod === 'medium' ? 2 : 2;
    const padGeo = new THREE.IcosahedronGeometry(0.5, segs);
    padGeo.scale(padW, padH, padThick);
    padGeo.translate(0, padH * 0.48, 0);
    const padNonIdx = ensureStandardAttributes(padGeo);

    const cDark = new THREE.Color(p.colorTrunk).multiplyScalar(0.8);
    const cLight = new THREE.Color(p.colorTrunk).lerp(new THREE.Color(p.colorLeafTip), 0.35);
    colorizeGeometryGradient(padNonIdx, cDark, cLight, rand, 0.05);
    padNonIdx.applyMatrix4(matrix);
    bodyOut.push(padNonIdx);

    // Spines on both flat faces of the cladode
    if (p.spineDensity > 0.05) {
      const areoleCount = Math.max(4, Math.round(9 * p.spineDensity * (lod === 'low' ? 0.5 : 1)));
      const spLen = padThick * 1.15 * p.spineLength;
      const spBase = new THREE.ConeGeometry(padThick * 0.06, spLen, 3);
      spBase.translate(0, spLen * 0.5, 0);
      const spTemplate = ensureStandardAttributes(spBase);
      colorizeGeometryGradient(spTemplate, '#d6d3d1', p.colorSpine || '#fef9c3', rand, 0.03);

      for (let a = 0; a < areoleCount; a++) {
        const angle = rand() * Math.PI * 2;
        const r = Math.sqrt(rand()) * 0.38;
        const lx = Math.cos(angle) * r * padW;
        const ly = (0.48 + Math.sin(angle) * r) * padH;

        for (const side of [-1, 1]) {
          const lz = side * padThick * 0.45 * Math.sqrt(Math.max(0.1, 1 - r * r * 4));
          for (let s = 0; s < Math.min(4, p.spinesPerAreole); s++) {
            const sp = spTemplate.clone();
            const sm = matrix.clone();
            sm.multiply(new THREE.Matrix4().makeTranslation(lx, ly, lz));
            sm.multiply(new THREE.Matrix4().makeRotationX(side * (Math.PI * 0.5) + (rand() - 0.5) * 0.7));
            sm.multiply(new THREE.Matrix4().makeRotationZ((rand() - 0.5) * 0.7));
            sp.applyMatrix4(sm);
            detailOut.push(sp);
          }
        }
      }
      spTemplate.dispose();
    }

    // Prickly pear fruits / flowers along upper rim of terminal pads
    if (level >= maxLevel - 1 && p.cactusFlowerCount > 0) {
      const tunaCount = Math.min(4, Math.ceil(p.cactusFlowerCount * 0.5));
      for (let f = 0; f < tunaCount; f++) {
        const rimAng = ((f / Math.max(1, tunaCount - 1)) - 0.5) * 1.3 + (rand() - 0.5) * 0.25;
        const rx = Math.sin(rimAng) * padW * 0.46;
        const ry = (0.48 + Math.cos(rimAng) * 0.46) * padH;

        const tuna = new THREE.CylinderGeometry(padW * 0.11, padW * 0.07, padH * 0.22, 6);
        tuna.translate(0, padH * 0.11, 0);
        const tunaNonIdx = ensureStandardAttributes(tuna);
        colorizeGeometryGradient(tunaNonIdx, '#be123c', p.colorFlower || '#f97316', rand, 0.05);

        const fm = matrix.clone();
        fm.multiply(new THREE.Matrix4().makeTranslation(rx, ry, 0));
        fm.multiply(new THREE.Matrix4().makeRotationZ(-rimAng * 0.75));
        tunaNonIdx.applyMatrix4(fm);
        detailOut.push(tunaNonIdx);
      }
    }

    if (level >= maxLevel) return;

    // Spawn 2 or 3 child pads along upper rim
    const children = level === 1 ? Math.min(3, Math.max(2, Math.round(p.armCount * 0.5))) : (rand() < 0.75 ? 2 : 1);
    for (let c = 0; c < children; c++) {
      const slot = children === 1 ? (rand() - 0.5) * 0.8 : ((c / (children - 1)) - 0.5) * 1.35;
      const rimX = Math.sin(slot) * padW * 0.44;
      const rimY = (0.48 + Math.cos(slot) * 0.44) * padH;

      const childMat = matrix.clone();
      childMat.multiply(new THREE.Matrix4().makeTranslation(rimX, rimY, 0));
      childMat.multiply(new THREE.Matrix4().makeRotationZ(-slot * 0.75 + (rand() - 0.5) * 0.2));
      childMat.multiply(new THREE.Matrix4().makeRotationY(0.55 + (rand() - 0.5) * 0.8)); // twist child pad in 3D

      addPad(
        childMat,
        level + 1,
        padH * p.decay,
        padW * p.decay,
        padThick * 0.88
      );
    }
  }

  addPad(new THREE.Matrix4(), 1, basePadH, basePadW, basePadThick);
}

/**
 * Master Cactus Generator supporting Saguaro, Organ Pipe, Candelabra, Opuntia, and Golden Barrel
 */
export function generateCactusGeometry(
  p: TreeParams,
  lod: PolygonLOD,
  rand: () => number
): CactusMeshResult {
  const bodyGeometries: THREE.BufferGeometry[] = [];
  const detailGeometries: THREE.BufferGeometry[] = [];

  if (p.cactusSubType === 'opuntia') {
    generateOpuntiaCladodes(p, lod, rand, bodyGeometries, detailGeometries);
    return { bodyGeometries, detailGeometries };
  }

  if (p.cactusSubType === 'barrel') {
    // Golden Barrel Cactus (main sphere-barrel + optional offset pups around base)
    const mainPts = [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, p.height * 0.45, 0),
      new THREE.Vector3(0, p.height * 0.85, 0),
    ];
    buildCurvedRibbedColumn(
      mainPts,
      p.radius * 1.15,
      p.radius * 0.95,
      p.cactusRibs,
      p.ribDepth,
      p.colorTrunk,
      p.colorLeafTip,
      p.colorSpine,
      p.colorFlower,
      p.spineDensity,
      p.spineLength,
      p.spinesPerAreole,
      p.cactusFlowerCount > 0,
      p.cactusFlowerCount,
      lod,
      rand,
      bodyGeometries,
      detailGeometries
    );

    const pups = Math.min(8, p.armCount);
    for (let i = 0; i < pups; i++) {
      const ang = (i / pups) * Math.PI * 2 + rand() * 0.4;
      const dist = p.radius * (1.05 + rand() * 0.25);
      const pupH = p.height * (0.38 + rand() * 0.22);
      const pupR = p.radius * (0.42 + rand() * 0.15);
      const bx = Math.cos(ang) * dist;
      const bz = Math.sin(ang) * dist;
      const pupPts = [
        new THREE.Vector3(bx * 0.85, 0, bz * 0.85),
        new THREE.Vector3(bx, pupH * 0.5, bz),
        new THREE.Vector3(bx * 1.05, pupH * 0.9, bz * 1.05),
      ];
      buildCurvedRibbedColumn(
        pupPts,
        pupR,
        pupR * 0.9,
        Math.max(8, p.cactusRibs - 4),
        p.ribDepth,
        p.colorTrunk,
        p.colorLeafTip,
        p.colorSpine,
        p.colorFlower,
        p.spineDensity,
        p.spineLength * 0.85,
        p.spinesPerAreole,
        p.cactusFlowerCount > 2,
        Math.max(1, Math.floor(p.cactusFlowerCount * 0.5)),
        lod,
        rand,
        bodyGeometries,
        detailGeometries
      );
    }

    return { bodyGeometries, detailGeometries };
  }

  // ── COLUMNAR CACTI: SAGUARO, ORGAN PIPE, CANDELABRA ──
  const mainTrunkPts = [
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3((rand() - 0.5) * p.noise * 0.25, p.height * 0.35, (rand() - 0.5) * p.noise * 0.25),
    new THREE.Vector3((rand() - 0.5) * p.noise * 0.35, p.height * 0.7, (rand() - 0.5) * p.noise * 0.35),
    new THREE.Vector3(0, p.height, 0),
  ];

  buildCurvedRibbedColumn(
    mainTrunkPts,
    p.radius,
    p.radius * p.taper,
    p.cactusRibs,
    p.ribDepth,
    p.colorTrunk,
    p.colorLeafTip,
    p.colorSpine,
    p.colorFlower,
    p.spineDensity,
    p.spineLength,
    p.spinesPerAreole,
    p.cactusFlowerCount > 0,
    p.cactusFlowerCount,
    lod,
    rand,
    bodyGeometries,
    detailGeometries
  );

  // Generate primary arms with smooth curved 90-degree elbows!
  const armTotal = Math.max(0, Math.min(12, p.armCount));
  const golden = 2.39996323;

  for (let a = 0; a < armTotal; a++) {
    const isOrganPipe = p.cactusSubType === 'organ_pipe';
    const attachRatio = isOrganPipe
      ? 0.04 + (a / Math.max(1, armTotal)) * 0.12
      : p.armHeightMin + (a / Math.max(1, armTotal)) * 0.38;

    const startY = p.height * THREE.MathUtils.clamp(attachRatio, 0.05, 0.78);
    const yaw = a * golden + (rand() - 0.5) * 0.28;
    const dirX = Math.cos(yaw);
    const dirZ = Math.sin(yaw);

    const reach = p.radius * (1.8 + p.armSpread * 2.2) * (0.85 + rand() * 0.35);
    const elbowDrop = p.radius * (0.35 - p.armElbowCurve * 0.25);
    const armTopY = isOrganPipe
      ? p.height * (0.68 + rand() * 0.28)
      : Math.min(p.height * 0.96, startY + p.height * (0.28 + rand() * 0.26));

    const armRad = p.radius * (isOrganPipe ? 0.82 : 0.68);
    const armRibs = Math.max(6, p.cactusRibs - 2);

    // Smooth 5-point elbow curve starting slightly inside the trunk so there is zero gap
    const armPts = [
      new THREE.Vector3(dirX * p.radius * 0.35, startY, dirZ * p.radius * 0.35),
      new THREE.Vector3(dirX * reach * 0.55, startY - elbowDrop, dirZ * reach * 0.55),
      new THREE.Vector3(dirX * reach * 0.92, startY + (armTopY - startY) * 0.18, dirZ * reach * 0.92),
      new THREE.Vector3(dirX * reach, startY + (armTopY - startY) * 0.58, dirZ * reach),
      new THREE.Vector3(dirX * reach * 0.96, armTopY, dirZ * reach * 0.96),
    ];

    buildCurvedRibbedColumn(
      armPts,
      armRad * 0.88,
      armRad * p.taper,
      armRibs,
      p.ribDepth,
      p.colorTrunk,
      p.colorLeafTip,
      p.colorSpine,
      p.colorFlower,
      p.spineDensity,
      p.spineLength * 0.9,
      p.spinesPerAreole,
      p.cactusFlowerCount > 0,
      Math.max(1, Math.round(p.cactusFlowerCount * 0.6)),
      lod,
      rand,
      bodyGeometries,
      detailGeometries
    );

    // Secondary sub-arm branching off this primary arm (Candelabra / Old Saguaro)
    if (p.subArmProb > 0.05 && rand() < p.subArmProb) {
      const subStartY = startY + (armTopY - startY) * 0.45;
      const subYaw = yaw + (a % 2 === 0 ? 0.85 : -0.85);
      const sDirX = Math.cos(subYaw);
      const sDirZ = Math.sin(subYaw);
      const subReach = armRad * (1.9 + p.armSpread * 1.4);
      const subTopY = Math.min(p.height * 0.95, subStartY + p.height * (0.22 + rand() * 0.16));

      const baseX = dirX * reach * 0.95;
      const baseZ = dirZ * reach * 0.95;

      const subPts = [
        new THREE.Vector3(baseX, subStartY, baseZ),
        new THREE.Vector3(baseX + sDirX * subReach * 0.6, subStartY, baseZ + sDirZ * subReach * 0.6),
        new THREE.Vector3(baseX + sDirX * subReach, subStartY + (subTopY - subStartY) * 0.4, baseZ + sDirZ * subReach),
        new THREE.Vector3(baseX + sDirX * subReach * 0.95, subTopY, baseZ + sDirZ * subReach * 0.95),
      ];

      buildCurvedRibbedColumn(
        subPts,
        armRad * 0.68,
        armRad * 0.58,
        Math.max(5, armRibs - 2),
        p.ribDepth,
        p.colorTrunk,
        p.colorLeafTip,
        p.colorSpine,
        p.colorFlower,
        p.spineDensity,
        p.spineLength * 0.8,
        Math.max(3, p.spinesPerAreole - 1),
        p.cactusFlowerCount > 1,
        Math.max(1, Math.floor(p.cactusFlowerCount * 0.4)),
        lod,
        rand,
        bodyGeometries,
        detailGeometries
      );
    }
  }

  return { bodyGeometries, detailGeometries };
}

export function mergeSafe(geos: THREE.BufferGeometry[]): THREE.BufferGeometry | null {
  if (!geos || geos.length === 0) return null;
  const cleaned = geos.map((g) => ensureStandardAttributes(g));
  const merged = mergeGeometries(cleaned, false);
  cleaned.forEach((g) => g.dispose());
  return merged;
}
