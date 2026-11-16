import * as THREE from 'three';
import { BarkType, TextureQuality } from '../types/botany';

export interface ProceduralTextureSet {
  map: THREE.CanvasTexture | null;
  normalMap: THREE.CanvasTexture | null;
  roughnessMap: THREE.CanvasTexture | null;
}

const textureCache = new Map<string, ProceduralTextureSet>();

function getResolution(quality: TextureQuality): number {
  switch (quality) {
    case 'none': return 0;
    case 'low_256': return 256;
    case 'med_512': return 512;
    case 'high_1024': return 1024;
  }
}

function hash2D(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return n - Math.floor(n);
}

function valueNoise(x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash2D(ix, iy);
  const b = hash2D(ix + 1, iy);
  const c = hash2D(ix, iy + 1);
  const d = hash2D(ix + 1, iy + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

function fbm(x: number, y: number, octaves = 4): number {
  let v = 0;
  let amp = 0.5;
  let freq = 1;
  for (let i = 0; i < octaves; i++) {
    v += amp * valueNoise(x * freq, y * freq);
    freq *= 2.02;
    amp *= 0.5;
  }
  return v;
}

export function getBarkTextures(
  barkType: BarkType,
  quality: TextureQuality,
  maxAnisotropy = 4
): ProceduralTextureSet {
  if (quality === 'none') {
    return { map: null, normalMap: null, roughnessMap: null };
  }

  const key = `bark_${barkType}_${quality}`;
  const cached = textureCache.get(key);
  if (cached) return cached;

  const size = getResolution(quality);
  const heightField = new Float32Array(size * size);

  const albedoCanvas = document.createElement('canvas');
  albedoCanvas.width = size;
  albedoCanvas.height = size;
  const albedoCtx = albedoCanvas.getContext('2d')!;
  const albedoData = albedoCtx.createImageData(size, size);

  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = size;
  roughCanvas.height = size;
  const roughCtx = roughCanvas.getContext('2d')!;
  const roughData = roughCtx.createImageData(size, size);

  // Compute procedural heightfield and albedo modulation for all 16 BarkType shaders
  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      let h = 0.5;
      let shadeR = 0.85;
      let shadeG = 0.85;
      let shadeB = 0.85;
      let rough = 0.85;

      if (barkType === 'fissured') {
        const warp = fbm(u * 6, v * 6, 3) * 0.18;
        const ridges = Math.abs(Math.sin((u + warp) * Math.PI * 14));
        const fine = fbm(u * 24, v * 12, 3);
        h = Math.pow(ridges, 0.65) * 0.75 + fine * 0.25;
        const s = 0.52 + h * 0.55;
        shadeR = s; shadeG = s; shadeB = s;
        rough = 0.95 - h * 0.2;
      } else if (barkType === 'pine_plates') {
        const cellX = u * 8 + fbm(u * 5, v * 5, 2) * 0.6;
        const cellY = v * 5 + fbm(u * 5 + 10, v * 5, 2) * 0.6;
        const fx = Math.abs((cellX - Math.floor(cellX)) - 0.5) * 2;
        const fy = Math.abs((cellY - Math.floor(cellY)) - 0.5) * 2;
        const edge = Math.max(fx, fy);
        const plate = edge > 0.82 ? 0.15 : 0.75 + fbm(u * 20, v * 20, 2) * 0.25;
        h = plate;
        const s = 0.45 + plate * 0.65;
        shadeR = s; shadeG = s; shadeB = s;
        rough = 0.88 - plate * 0.15;
      } else if (barkType === 'birch_paper') {
        const horiz = fbm(u * 4, v * 36, 3);
        const lenticel = valueNoise(u * 5, v * 48);
        const isDarkMark = lenticel > 0.78 && valueNoise(u * 14, v * 10) > 0.45;
        h = isDarkMark ? 0.2 : 0.75 + horiz * 0.2;
        const s = isDarkMark ? 0.28 : 0.88 + horiz * 0.15;
        shadeR = s; shadeG = s; shadeB = s;
        rough = isDarkMark ? 0.95 : 0.55;
      } else if (barkType === 'smooth_ash') {
        const n = fbm(u * 10, v * 14, 3);
        h = 0.5 + (n - 0.5) * 0.35;
        const s = 0.78 + (n - 0.5) * 0.28;
        shadeR = s; shadeG = s; shadeB = s;
        rough = 0.68;
      } else if (barkType === 'palm_rings') {
        const ring = Math.abs(Math.sin(v * Math.PI * 24 + fbm(u * 8, v * 8, 2) * 1.2));
        const fibrous = fbm(u * 32, v * 10, 3);
        h = Math.pow(ring, 0.5) * 0.7 + fibrous * 0.3;
        const s = 0.55 + h * 0.5;
        shadeR = s; shadeG = s; shadeB = s;
        rough = 0.9;
      } else if (barkType === 'bamboo_culm') {
        const nodeDist = Math.min(v, 1 - v);
        const isNode = nodeDist < 0.045;
        const fibers = valueNoise(u * 60, v * 4) * 0.12;
        h = isNode ? 0.95 : 0.6 + fibers;
        const s = isNode ? 0.62 : 0.9 + fibers;
        shadeR = s; shadeG = s; shadeB = s;
        rough = isNode ? 0.75 : 0.32;
      } else if (barkType === 'cactus_ribs') {
        const micro = fbm(u * 20, v * 20, 3);
        h = 0.5 + (micro - 0.5) * 0.3;
        const s = 0.82 + (micro - 0.5) * 0.22;
        shadeR = s; shadeG = s; shadeB = s;
        rough = 0.45 + micro * 0.15;
      } else if (barkType === 'mossy_deadwood') {
        // Helical weathered deadwood grain with bryophyte moss cushions in deep grooves
        const helical = u * 12 + v * 3.5 + fbm(u * 8, v * 8, 3) * 1.4;
        const woodGroove = 0.5 + 0.5 * Math.sin(helical * Math.PI * 2);
        const mossPatch = fbm(u * 9 + 4.2, v * 9 + 1.7, 4);
        const isMoss = mossPatch > 0.54 && woodGroove < 0.62;
        h = isMoss ? 0.78 + fbm(u * 32, v * 32, 2) * 0.22 : Math.pow(woodGroove, 0.7) * 0.75;
        if (isMoss) {
          shadeR = 0.52;
          shadeG = 0.96;
          shadeB = 0.36;
          rough = 0.96;
        } else {
          const w = 0.55 + h * 0.48;
          shadeR = w * 1.05;
          shadeG = w * 0.92;
          shadeB = w * 0.78;
          rough = 0.88;
        }
      } else if (barkType === 'cork_oak_quercus') {
        // Deep spongy Mediterranean cork oak fissures
        const warp = fbm(u * 7, v * 7, 4) * 0.35;
        const crag = Math.abs(Math.sin((u * 9 + warp) * Math.PI) * Math.cos((v * 6 + warp) * Math.PI));
        const pores = valueNoise(u * 40, v * 40) * 0.18;
        h = Math.pow(crag, 0.45) * 0.82 + pores;
        const s = 0.44 + h * 0.62;
        shadeR = s * 1.08;
        shadeG = s * 0.94;
        shadeB = s * 0.78;
        rough = 0.96;
      } else if (barkType === 'eucalyptus_rainbow') {
        // Exfoliating vertical ribbons in emerald, amber, violet & russet
        const ribbon = fbm(u * 10 + fbm(u * 3, v * 2, 2), v * 2.5, 3);
        const band = Math.floor(ribbon * 5.99);
        h = 0.45 + (ribbon * 5.99 - band) * 0.45;
        if (band % 4 === 0) {
          shadeR = 0.65; shadeG = 0.98; shadeB = 0.68; // Emerald green inner bark
        } else if (band % 4 === 1) {
          shadeR = 1.0; shadeG = 0.76; shadeB = 0.48;  // Warm amber-orange strip
        } else if (band % 4 === 2) {
          shadeR = 0.82; shadeG = 0.64; shadeB = 0.96; // Mauve-purple strip
        } else {
          shadeR = 0.92; shadeG = 0.58; shadeB = 0.52; // Terracotta-russet strip
        }
        rough = 0.52;
      } else if (barkType === 'gnarled_olive_burl') {
        // Swirling concentric burl knots & twisted ancient olive wood grain
        const swirlX = u * 6 + Math.sin(v * Math.PI * 4) * 0.45;
        const swirlY = v * 6 + Math.cos(u * Math.PI * 4) * 0.45;
        const burl = Math.sin(fbm(swirlX, swirlY, 4) * Math.PI * 5);
        h = 0.5 + burl * 0.42;
        const s = 0.52 + h * 0.52;
        shadeR = s; shadeG = s * 0.98; shadeB = s * 0.92;
        rough = 0.86;
      } else if (barkType === 'dragon_scales_cycad') {
        // Diamond imbricated woody armor scales (Cycad / Dragon Tree)
        const du = u * 12;
        const dv = v * 12;
        const diagA = Math.abs(((du + dv) - Math.floor(du + dv)) - 0.5) * 2;
        const diagB = Math.abs(((du - dv + 12) - Math.floor(du - dv + 12)) - 0.5) * 2;
        const scaleHeight = Math.max(0, 1.0 - Math.max(diagA, diagB) * 1.15);
        h = Math.pow(scaleHeight, 0.55);
        const s = 0.42 + h * 0.65;
        shadeR = s * 1.04; shadeG = s * 0.96; shadeB = s * 0.86;
        rough = 0.82 - h * 0.2;
      } else if (barkType === 'strangler_vine_lattice') {
        // Interwoven braided root strands (Banyan / Strangler Fig)
        const waveA = Math.pow(Math.max(0, Math.cos((u * 10 + Math.sin(v * Math.PI * 6) * 0.55) * Math.PI)), 1.6);
        const waveB = Math.pow(Math.max(0, Math.cos((u * 10 - Math.sin(v * Math.PI * 6) * 0.55 + 0.5) * Math.PI)), 1.6);
        const fiber = fbm(u * 24, v * 16, 2) * 0.18;
        h = Math.min(1, Math.max(waveA, waveB) * 0.85 + fiber);
        const s = 0.46 + h * 0.58;
        shadeR = s; shadeG = s * 0.96; shadeB = s * 0.88;
        rough = 0.86;
      } else if (barkType === 'scifi_biolum_veins') {
        // Dark chitin ridges with glowing cyan/neon vascular channels
        const warp = fbm(u * 8, v * 8, 3) * 0.35;
        const channel = Math.abs(Math.sin((u * 10 + warp) * Math.PI));
        const isVein = channel < 0.18;
        h = isVein ? 0.15 : 0.45 + Math.pow(channel, 0.6) * 0.5;
        if (isVein) {
          shadeR = 0.35; shadeG = 1.0; shadeB = 1.0;
          rough = 0.22;
        } else {
          const s = 0.45 + h * 0.45;
          shadeR = s * 0.78; shadeG = s * 0.85; shadeB = s * 1.05;
          rough = 0.58;
        }
      } else if (barkType === 'volcanic_magma_crust') {
        // Charred basalt plates with glowing magma/ember fissures
        const cellX = u * 9 + fbm(u * 6, v * 6, 3) * 0.7;
        const cellY = v * 9 + fbm(u * 6 + 5, v * 6, 3) * 0.7;
        const fx = Math.abs((cellX - Math.floor(cellX)) - 0.5) * 2;
        const fy = Math.abs((cellY - Math.floor(cellY)) - 0.5) * 2;
        const isCrack = Math.max(fx, fy) > 0.82;
        h = isCrack ? 0.12 : 0.72 + fbm(u * 24, v * 24, 2) * 0.25;
        if (isCrack) {
          shadeR = 1.0; shadeG = 0.52; shadeB = 0.15;
          rough = 0.3;
        } else {
          const s = 0.38 + h * 0.35;
          shadeR = s; shadeG = s * 0.92; shadeB = s * 0.9;
          rough = 0.92;
        }
      } else {
        // fibrous_redwood
        const strand = Math.sin((u * 28 + fbm(u * 6, v * 18, 3) * 2.5) * Math.PI);
        h = 0.5 + strand * 0.35 + fbm(u * 16, v * 32, 2) * 0.15;
        const s = 0.55 + h * 0.5;
        shadeR = s; shadeG = s; shadeB = s;
        rough = 0.92;
      }

      const idx = y * size + x;
      heightField[idx] = h;

      const pIdx = idx * 4;
      albedoData.data[pIdx] = Math.max(0, Math.min(255, Math.round(shadeR * 255)));
      albedoData.data[pIdx + 1] = Math.max(0, Math.min(255, Math.round(shadeG * 255)));
      albedoData.data[pIdx + 2] = Math.max(0, Math.min(255, Math.round(shadeB * 255)));
      albedoData.data[pIdx + 3] = 255;

      const rVal = Math.max(0, Math.min(255, Math.round(rough * 255)));
      roughData.data[pIdx] = rVal;
      roughData.data[pIdx + 1] = rVal;
      roughData.data[pIdx + 2] = rVal;
      roughData.data[pIdx + 3] = 255;
    }
  }

  albedoCtx.putImageData(albedoData, 0, 0);
  roughCtx.putImageData(roughData, 0, 0);

  // Derive Tangent-Space Normal Map from heightField via Sobel filter
  const normalCanvas = document.createElement('canvas');
  normalCanvas.width = size;
  normalCanvas.height = size;
  const normalCtx = normalCanvas.getContext('2d')!;
  const normalData = normalCtx.createImageData(size, size);
  const strength = 3.2;

  for (let y = 0; y < size; y++) {
    const yPrev = (y - 1 + size) % size;
    const yNext = (y + 1) % size;
    for (let x = 0; x < size; x++) {
      const xPrev = (x - 1 + size) % size;
      const xNext = (x + 1) % size;

      const hL = heightField[y * size + xPrev];
      const hR = heightField[y * size + xNext];
      const hU = heightField[yPrev * size + x];
      const hD = heightField[yNext * size + x];

      const dx = (hL - hR) * strength;
      const dy = (hU - hD) * strength;
      const dz = 1.0;
      const invLen = 1 / Math.sqrt(dx * dx + dy * dy + dz * dz);

      const pIdx = (y * size + x) * 4;
      normalData.data[pIdx] = Math.round(((dx * invLen) * 0.5 + 0.5) * 255);
      normalData.data[pIdx + 1] = Math.round(((dy * invLen) * 0.5 + 0.5) * 255);
      normalData.data[pIdx + 2] = Math.round(((dz * invLen) * 0.5 + 0.5) * 255);
      normalData.data[pIdx + 3] = 255;
    }
  }
  normalCtx.putImageData(normalData, 0, 0);

  const map = new THREE.CanvasTexture(albedoCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = maxAnisotropy;

  const normalMap = new THREE.CanvasTexture(normalCanvas);
  normalMap.wrapS = THREE.RepeatWrapping;
  normalMap.wrapT = THREE.RepeatWrapping;
  normalMap.anisotropy = maxAnisotropy;

  const roughnessMap = new THREE.CanvasTexture(roughCanvas);
  roughnessMap.wrapS = THREE.RepeatWrapping;
  roughnessMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.anisotropy = maxAnisotropy;

  const result = { map, normalMap, roughnessMap };
  textureCache.set(key, result);
  return result;
}

export function getFoliageTextures(
  quality: TextureQuality,
  maxAnisotropy = 4
): ProceduralTextureSet {
  if (quality === 'none') {
    return { map: null, normalMap: null, roughnessMap: null };
  }

  const key = `foliage_vein_${quality}`;
  const cached = textureCache.get(key);
  if (cached) return cached;

  const size = getResolution(quality);
  const albedoCanvas = document.createElement('canvas');
  albedoCanvas.width = size;
  albedoCanvas.height = size;
  const ctx = albedoCanvas.getContext('2d')!;
  const imgData = ctx.createImageData(size, size);

  const normalCanvas = document.createElement('canvas');
  normalCanvas.width = size;
  normalCanvas.height = size;
  const nCtx = normalCanvas.getContext('2d')!;
  const nData = nCtx.createImageData(size, size);

  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const distMid = Math.abs(u - 0.5) * 2;
      const midrib = Math.exp(-distMid * 18);
      const secVein = Math.pow(Math.abs(Math.sin((v - distMid * 0.45) * Math.PI * 10)), 8) * (1 - distMid * 0.5);
      const cell = valueNoise(u * 32, v * 32) * 0.12;

      const lum = Math.min(1, 0.78 + midrib * 0.18 + secVein * 0.12 + cell);
      const pIdx = (y * size + x) * 4;
      const c = Math.round(lum * 255);
      imgData.data[pIdx] = c;
      imgData.data[pIdx + 1] = c;
      imgData.data[pIdx + 2] = c;
      imgData.data[pIdx + 3] = 255;

      const nx = (u < 0.5 ? -1 : 1) * (midrib * 0.35 + secVein * 0.2);
      const ny = Math.cos((v - distMid * 0.45) * Math.PI * 10) * 0.22;
      nData.data[pIdx] = Math.round((nx * 0.5 + 0.5) * 255);
      nData.data[pIdx + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      nData.data[pIdx + 2] = 240;
      nData.data[pIdx + 3] = 255;
    }
  }

  ctx.putImageData(imgData, 0, 0);
  nCtx.putImageData(nData, 0, 0);

  const map = new THREE.CanvasTexture(albedoCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = maxAnisotropy;

  const normalMap = new THREE.CanvasTexture(normalCanvas);
  normalMap.wrapS = THREE.RepeatWrapping;
  normalMap.wrapT = THREE.RepeatWrapping;
  normalMap.anisotropy = maxAnisotropy;

  const result = { map, normalMap, roughnessMap: null };
  textureCache.set(key, result);
  return result;
}
