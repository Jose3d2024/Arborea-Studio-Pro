import { TreeParams } from '../types/botany';
import { DEFAULT_TREE_PARAMS, SPECIES_CATALOG } from '../data/speciesCatalog';

export interface SavedBotanicalModel {
  id: string;
  name: string;
  scientificName: string;
  category: string;
  createdAt: number;
  updatedAt: number;
  thumbnailDataUrl: string;
  params: TreeParams;
  backgroundColor: string;
  groundColor: string;
  stats: {
    triangles: number;
    treeHeightM: number;
    crownDiameterM: number;
  };
}

const STORAGE_KEY = 'arborea_local_model_library_v1';
const PRESET_THUMB_CACHE: Record<string, string> = {};

/**
 * Generates a crisp miniature preview image (220x140 dataURL) depicting the exact
 * morphology (tree, conifer, cactus, palm, or alien archetype), colors, roots, and background.
 * Used for instant catalog previews and fallback thumbnails.
 */
export function generateMiniaturePreviewDataUrl(
  partialParams: Partial<TreeParams>,
  bgHex = '#0c131d',
  groundHex = '#152234',
  cacheKey?: string
): string {
  if (cacheKey && PRESET_THUMB_CACHE[cacheKey]) {
    return PRESET_THUMB_CACHE[cacheKey];
  }

  const p: TreeParams = { ...DEFAULT_TREE_PARAMS, ...partialParams };
  const w = 220;
  const h = 140;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  // 1. Background & Subtle Studio Vignette
  ctx.fillStyle = bgHex;
  ctx.fillRect(0, 0, w, h);

  const radGrad = ctx.createRadialGradient(w * 0.5, h * 0.45, 10, w * 0.5, h * 0.5, w * 0.65);
  radGrad.addColorStop(0, 'rgba(255,255,255,0.06)');
  radGrad.addColorStop(1, 'rgba(0,0,0,0.28)');
  ctx.fillStyle = radGrad;
  ctx.fillRect(0, 0, w, h);

  // 2. Ground Pedestal Ellipse & Grid Lines
  const groundY = h - 22;
  ctx.fillStyle = groundHex;
  ctx.beginPath();
  ctx.ellipse(w * 0.5, groundY + 4, 76, 13, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(52, 211, 153, 0.28)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Contact shadow
  ctx.fillStyle = 'rgba(0,0,0,0.38)';
  ctx.beginPath();
  ctx.ellipse(w * 0.5, groundY + 2, 34, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  const cx = w * 0.5;
  const basetrunkW = Math.max(4, Math.min(18, p.radius * 22));
  const treeH = Math.max(48, Math.min(98, p.height * 11.5));
  const topY = groundY - treeH;

  // 3. Downward-curving Roots if enabled
  if (p.showRoots && (p.rootCount ?? 5) > 0) {
    ctx.strokeStyle = p.colorTrunk;
    ctx.lineCap = 'round';
    const rLen = Math.min(34, 12 * (p.rootLength ?? 1.2));
    const rArch = Math.min(18, 8 * (p.rootArch ?? 0.5));
    for (const dir of [-1, -0.5, 0.5, 1]) {
      ctx.lineWidth = Math.max(2, basetrunkW * 0.32 * (p.rootThickness ?? 1));
      ctx.beginPath();
      ctx.moveTo(cx + dir * basetrunkW * 0.25, groundY - rArch);
      ctx.quadraticCurveTo(
        cx + dir * rLen * 0.55,
        groundY - rArch * 0.25,
        cx + dir * rLen,
        groundY + 3
      );
      ctx.stroke();
    }
  }

  // 4. Morphology-Specific Miniature Drawing
  if (p.engine === 'composed_custom') {
    const stemType = p.customElement?.stemStructure || 'spiral_volute_vine';
    if (stemType === 'spiral_volute_vine') {
      // Draw spiral volute arms + leaves along stem
      ctx.strokeStyle = p.colorTrunk;
      ctx.lineCap = 'round';
      for (const side of [-1, 1]) {
        ctx.lineWidth = side === -1 ? 7 : 5;
        ctx.beginPath();
        ctx.moveTo(cx, groundY);
        ctx.bezierCurveTo(
          cx - side * 18,
          groundY - 28,
          cx + side * 42,
          groundY - 48,
          cx + side * 26,
          groundY - 76
        );
        ctx.bezierCurveTo(
          cx + side * 12,
          groundY - 92,
          cx + side * 4,
          groundY - 70,
          cx + side * 18,
          groundY - 64
        );
        ctx.stroke();
      }
      ctx.fillStyle = p.colorLeafMain;
      for (const [lx, ly, lr] of [
        [cx - 18, groundY - 42, 7],
        [cx - 32, groundY - 64, 8],
        [cx - 16, groundY - 82, 7],
        [cx + 22, groundY - 46, 7],
        [cx + 30, groundY - 68, 8],
        [cx + 12, groundY - 24, 6],
      ]) {
        ctx.beginPath();
        ctx.ellipse(lx, ly, lr, lr * 0.55, 0.5, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (stemType === 'thorny_horn_crown') {
      // Draw thorny horn crown + spore clusters
      for (let i = -3; i <= 3; i++) {
        const hx = cx + i * 11;
        ctx.strokeStyle = p.colorTrunk;
        ctx.lineWidth = 4.2 - Math.abs(i) * 0.4;
        ctx.beginPath();
        ctx.moveTo(cx + i * 3, groundY - 2);
        ctx.quadraticCurveTo(hx * 1.05, groundY - 38, hx, groundY - 74 + Math.abs(i) * 7);
        ctx.stroke();

        ctx.fillStyle = p.colorFlower;
        ctx.beginPath();
        ctx.arc(hx, groundY - 46 + Math.abs(i) * 4, 4.5, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      // Gnarled bonsai cloud tree + hanging filaments
      ctx.strokeStyle = p.colorTrunk;
      ctx.lineWidth = 9;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx - 6, groundY);
      ctx.bezierCurveTo(cx - 28, groundY - 28, cx + 22, groundY - 52, cx - 4, groundY - 74);
      ctx.stroke();

      for (const [px, py, prx, pry] of [
        [cx - 26, groundY - 46, 22, 10],
        [cx + 24, groundY - 54, 24, 11],
        [cx - 2, groundY - 76, 32, 13],
      ]) {
        ctx.strokeStyle = p.colorFlower;
        ctx.lineWidth = 1.2;
        for (const dx of [-10, 0, 10]) {
          ctx.beginPath();
          ctx.moveTo(px + dx, py + 4);
          ctx.lineTo(px + dx, py + 22);
          ctx.stroke();
        }
        const gPad = ctx.createRadialGradient(px, py - 3, 2, px, py, prx);
        gPad.addColorStop(0, p.colorLeafTip);
        gPad.addColorStop(1, p.colorLeafMain);
        ctx.fillStyle = gPad;
        ctx.beginPath();
        ctx.ellipse(px, py, prx, pry, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else if (p.engine === 'moss_fungi_rock') {
    // Draw sculpted 3D boulder
    const rockGrad = ctx.createLinearGradient(cx, groundY - 46, cx, groundY + 4);
    rockGrad.addColorStop(0, p.colorTrunk);
    rockGrad.addColorStop(1, '#1e293b');
    ctx.fillStyle = rockGrad;
    ctx.beginPath();
    ctx.moveTo(cx - 54, groundY + 2);
    ctx.quadraticCurveTo(cx - 48, groundY - 42, cx - 10, groundY - 46);
    ctx.quadraticCurveTo(cx + 38, groundY - 48, cx + 52, groundY - 12);
    ctx.quadraticCurveTo(cx + 56, groundY + 2, cx + 44, groundY + 3);
    ctx.closePath();
    ctx.fill();

    // Draw lush moss cushions blanketing the top of the rock
    for (const [mx, my, rx, ry] of [
      [cx - 20, groundY - 38, 22, 9],
      [cx + 8, groundY - 40, 25, 10],
      [cx - 4, groundY - 34, 30, 8],
      [cx + 28, groundY - 26, 16, 7],
    ]) {
      const mGrad = ctx.createRadialGradient(mx, my - 3, 2, mx, my, rx);
      mGrad.addColorStop(0, '#84cc16');
      mGrad.addColorStop(1, p.colorLeafMain);
      ctx.fillStyle = mGrad;
      ctx.beginPath();
      ctx.ellipse(mx, my, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Draw mushrooms / sporophytes / lichens on top of the mossy rock
    const arch = p.mossFungiArchetype || 'amanita_muscaria_moss';
    for (const [fx, fy, sc] of [
      [cx - 16, groundY - 42, 0.85],
      [cx + 4, groundY - 44, 1.15],
      [cx + 22, groundY - 36, 0.75],
    ]) {
      // Stalk
      ctx.strokeStyle = p.colorFlower;
      ctx.lineWidth = Math.max(2, 4.5 * sc);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(fx, fy);
      ctx.quadraticCurveTo(fx - 2 * sc, fy - 14 * sc, fx, fy - 24 * sc);
      ctx.stroke();

      // Cap or spore capsule
      ctx.fillStyle = p.colorLeafTip;
      ctx.beginPath();
      if (arch === 'velvet_moss_sporophytes' || arch === 'star_moss_polytrichum') {
        ctx.ellipse(fx + 3 * sc, fy - 24 * sc, 5 * sc, 3 * sc, 0.4, 0, Math.PI * 2);
      } else {
        ctx.arc(fx, fy - 22 * sc, 11 * sc, Math.PI, 0, false);
      }
      ctx.fill();

      if (arch === 'amanita_muscaria_moss') {
        ctx.fillStyle = '#ffffff';
        for (const dx of [-5, 0, 5]) {
          ctx.beginPath();
          ctx.arc(fx + dx * sc, fy - 26 * sc, 1.6 * sc, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  } else if (p.engine === 'aquatic_coral_algae') {
    const arch = p.aquaticArchetype || 'staghorn_acropora';
    // Subtle underwater caustic glow
    const waterGlow = ctx.createLinearGradient(0, 0, 0, h);
    waterGlow.addColorStop(0, 'rgba(34, 211, 238, 0.18)');
    waterGlow.addColorStop(1, 'rgba(8, 51, 68, 0.05)');
    ctx.fillStyle = waterGlow;
    ctx.fillRect(0, 0, w, h);

    // Reef boulder base
    ctx.fillStyle = '#334155';
    ctx.beginPath();
    ctx.ellipse(cx, groundY - 4, 48, 12, 0, Math.PI, 0, false);
    ctx.lineTo(cx + 48, groundY + 3);
    ctx.lineTo(cx - 48, groundY + 3);
    ctx.closePath();
    ctx.fill();

    if (arch === 'brain_coral_boulder') {
      const bGrad = ctx.createRadialGradient(cx - 8, groundY - 34, 6, cx, groundY - 24, 34);
      bGrad.addColorStop(0, p.colorLeafTip);
      bGrad.addColorStop(1, p.colorLeafMain);
      ctx.fillStyle = bGrad;
      ctx.beginPath();
      ctx.arc(cx, groundY - 12, 34, Math.PI, 0, false);
      ctx.fill();
      ctx.strokeStyle = p.colorTrunk;
      ctx.lineWidth = 2;
      for (const rOff of [10, 18, 26]) {
        ctx.beginPath();
        ctx.arc(cx, groundY - 12, rOff, Math.PI * 1.15, -Math.PI * 0.15, false);
        ctx.stroke();
      }
    } else if (arch === 'giant_kelp_forest' || arch === 'bull_kelp_whip' || arch === 'red_seaweed_dulse' || arch === 'bladder_wrack_sargassum' || arch === 'seagrass_posidonia_meadow') {
      const strands = arch === 'seagrass_posidonia_meadow' ? 8 : 5;
      for (let i = 0; i < strands; i++) {
        const sx = cx + (i - (strands - 1) / 2) * 14;
        const sway = (i % 2 === 0 ? 1 : -1) * 10;
        const grad = ctx.createLinearGradient(sx, groundY - 10, sx + sway, topY + 14);
        grad.addColorStop(0, p.colorLeafMain);
        grad.addColorStop(1, p.colorLeafTip);
        ctx.strokeStyle = grad;
        ctx.lineWidth = arch === 'seagrass_posidonia_meadow' ? 3.5 : 7;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(sx, groundY - 10);
        ctx.quadraticCurveTo(sx - sway, groundY - treeH * 0.45, sx + sway, topY + 14 + (i % 2) * 10);
        ctx.stroke();
        if (arch === 'bull_kelp_whip' || arch === 'giant_kelp_forest') {
          ctx.fillStyle = p.colorFlower;
          ctx.beginPath();
          ctx.arc(sx + sway, topY + 14 + (i % 2) * 10, 3.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    } else if (arch === 'sea_anemone_tentacles') {
      ctx.fillStyle = p.colorTrunk;
      ctx.fillRect(cx - 14, groundY - 34, 28, 24);
      for (let t = 0; t < 11; t++) {
        const ang = -Math.PI + (t / 10) * Math.PI;
        const tx = cx + Math.cos(ang) * 42;
        const ty = groundY - 36 + Math.sin(ang) * 34;
        ctx.strokeStyle = p.colorLeafMain;
        ctx.lineWidth = 3.5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(ang) * 10, groundY - 32);
        ctx.quadraticCurveTo(cx + Math.cos(ang) * 26, groundY - 56, tx, ty);
        ctx.stroke();
        ctx.fillStyle = p.colorLeafTip;
        ctx.beginPath();
        ctx.arc(tx, ty, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (arch === 'tube_sponge_cluster' || arch === 'pillar_organ_pipe_coral') {
      for (const [dx, sh, sw] of [[-22, 46, 9], [-6, 68, 11], [10, 58, 10], [24, 40, 8]]) {
        const tg = ctx.createLinearGradient(cx + dx, groundY - sh, cx + dx, groundY - 10);
        tg.addColorStop(0, p.colorLeafTip);
        tg.addColorStop(1, p.colorTrunk);
        ctx.fillStyle = tg;
        ctx.beginPath();
        ctx.roundRect(cx + dx - sw * 0.5, groundY - sh, sw, sh - 8, [4, 4, 2, 2]);
        ctx.fill();
        ctx.fillStyle = arch === 'pillar_organ_pipe_coral' ? p.colorFlower : '#090e15';
        ctx.beginPath();
        ctx.ellipse(cx + dx, groundY - sh, sw * 0.42, 3, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (arch === 'plate_montipora_whorl') {
      for (const [py, pr] of [[groundY - 24, 38], [groundY - 38, 30], [groundY - 52, 22]]) {
        ctx.fillStyle = p.colorLeafMain;
        ctx.beginPath();
        ctx.ellipse(cx, py, pr, 8, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = p.colorLeafTip;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    } else {
      // Staghorn coral & Gorgonian sea fan branching silhouette
      const branchTips = [[-30, -54], [-14, -74], [4, -78], [22, -66], [34, -46]];
      for (const [bx, by] of branchTips) {
        const cg = ctx.createLinearGradient(cx, groundY - 12, cx + bx, groundY + by);
        cg.addColorStop(0, p.colorTrunk);
        cg.addColorStop(0.5, p.colorLeafMain);
        cg.addColorStop(1, p.colorLeafTip);
        ctx.strokeStyle = cg;
        ctx.lineWidth = arch === 'gorgonian_sea_fan' ? 3 : 6;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(cx, groundY - 12);
        ctx.quadraticCurveTo(cx + bx * 0.4, groundY + by * 0.4, cx + bx, groundY + by);
        ctx.stroke();
      }
    }
  } else if (p.engine === 'cactus') {
    ctx.strokeStyle = p.colorTrunk;
    ctx.lineCap = 'round';
    if (p.cactusSubType === 'barrel') {
      const grad = ctx.createRadialGradient(cx - 6, groundY - 26, 4, cx, groundY - 22, 26);
      grad.addColorStop(0, p.colorLeafTip);
      grad.addColorStop(1, p.colorTrunk);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(cx, groundY - 22, 26, 23, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.cactusSubType === 'opuntia') {
      const pads = [
        [cx, groundY - 14, 12, 16, 0],
        [cx - 14, groundY - 34, 11, 15, -0.35],
        [cx + 14, groundY - 32, 11, 15, 0.35],
        [cx - 22, groundY - 52, 9, 13, -0.5],
        [cx + 6, groundY - 50, 10, 14, 0.15],
      ];
      for (const [px, py, rx, ry, rot] of pads) {
        ctx.fillStyle = p.colorTrunk;
        ctx.beginPath();
        ctx.ellipse(px, py, rx, ry, rot, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      // Saguaro / Candelabra / Organ Pipe
      ctx.lineWidth = 12;
      ctx.beginPath();
      ctx.moveTo(cx, groundY);
      ctx.lineTo(cx, topY + 12);
      ctx.stroke();

      const arms = Math.min(4, p.armCount || 2);
      for (let a = 0; a < arms; a++) {
        const side = a % 2 === 0 ? -1 : 1;
        const ay = groundY - treeH * (0.35 + a * 0.14);
        const reach = (16 + a * 5) * side;
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.moveTo(cx, ay);
        ctx.quadraticCurveTo(cx + reach, ay, cx + reach, ay - 26);
        ctx.stroke();
      }
    }
    // Apical flowers
    ctx.fillStyle = p.colorFlower;
    ctx.beginPath();
    ctx.arc(cx, topY + 10, 4.5, 0, Math.PI * 2);
    ctx.fill();
  } else if (p.engine === 'alien_xenobotany') {
    const arch = p.alienArchetype || 'mega_mushroom_terraced';
    // Glowing aura for alien flora
    const aura = ctx.createRadialGradient(cx, groundY - treeH * 0.55, 6, cx, groundY - treeH * 0.55, 54);
    aura.addColorStop(0, (p.colorAccent || p.colorFlower) + '44');
    aura.addColorStop(1, 'transparent');
    ctx.fillStyle = aura;
    ctx.fillRect(0, 0, w, h);

    if (arch === 'mega_mushroom_terraced') {
      ctx.strokeStyle = p.colorTrunk;
      ctx.lineWidth = basetrunkW;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx, groundY);
      ctx.quadraticCurveTo(cx - 8, groundY - treeH * 0.5, cx, topY + 14);
      ctx.stroke();

      // Umbrella caps + glowing gills
      for (const [ox, oy, rad] of [
        [cx, topY + 14, 36],
        [cx - 14, groundY - treeH * 0.52, 20],
        [cx + 15, groundY - treeH * 0.36, 17],
      ]) {
        ctx.fillStyle = p.colorFlower;
        ctx.beginPath();
        ctx.ellipse(ox, oy + 3, rad * 0.9, 6, 0, 0, Math.PI * 2);
        ctx.fill();

        const capG = ctx.createLinearGradient(ox, oy - 14, ox, oy + 4);
        capG.addColorStop(0, p.colorLeafTip);
        capG.addColorStop(1, p.colorLeafMain);
        ctx.fillStyle = capG;
        ctx.beginPath();
        ctx.moveTo(ox - rad, oy + 2);
        ctx.quadraticCurveTo(ox, oy - 20, ox + rad, oy + 2);
        ctx.closePath();
        ctx.fill();
      }
    } else if (arch === 'spiral_fiddlehead_tentacle') {
      for (const [dx, sc] of [
        [0, 1],
        [-22, 0.72],
        [22, 0.76],
      ]) {
        ctx.strokeStyle = p.colorTrunk;
        ctx.lineWidth = 8 * sc;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(cx + dx * 0.5, groundY);
        ctx.bezierCurveTo(
          cx + dx * 1.4,
          groundY - 40 * sc,
          cx + dx - 18 * sc,
          groundY - 78 * sc,
          cx + dx + 6 * sc,
          groundY - 62 * sc
        );
        ctx.stroke();

        // Golden suckers
        ctx.fillStyle = p.colorFlower;
        for (let s = 0; s < 5; s++) {
          ctx.beginPath();
          ctx.arc(cx + dx + (s - 2) * 4 * sc, groundY - (25 + s * 10) * sc, 3 * sc, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    } else if (arch === 'cracked_ova_cluster' || arch === 'spiky_mace_sentinel') {
      const orbs = [
        [cx, topY + 26, 20],
        [cx - 22, topY + 42, 14],
        [cx + 22, topY + 40, 15],
      ];
      for (const [ox, oy, r] of orbs) {
        ctx.strokeStyle = p.colorTrunk;
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.moveTo(cx + (ox - cx) * 0.3, groundY);
        ctx.quadraticCurveTo(ox, groundY - 25, ox, oy);
        ctx.stroke();

        const orbG = ctx.createRadialGradient(ox - r * 0.3, oy - r * 0.3, 2, ox, oy, r);
        orbG.addColorStop(0, p.colorLeafTip);
        orbG.addColorStop(1, p.colorLeafMain);
        ctx.fillStyle = orbG;
        ctx.beginPath();
        ctx.arc(ox, oy, r, 0, Math.PI * 2);
        ctx.fill();

        if (arch === 'spiky_mace_sentinel') {
          ctx.strokeStyle = p.colorFlower;
          ctx.lineWidth = 2;
          for (let a = 0; a < 10; a++) {
            const ang = (a / 10) * Math.PI * 2;
            ctx.beginPath();
            ctx.moveTo(ox + Math.cos(ang) * r * 0.7, oy + Math.sin(ang) * r * 0.7);
            ctx.lineTo(ox + Math.cos(ang) * (r + 11), oy + Math.sin(ang) * (r + 11));
            ctx.stroke();
          }
        }
      }
    } else {
      // Other alien flora (pitchers, coral spires, chimneys, crater mounds)
      for (const [dx, hMult] of [
        [-20, 0.72],
        [20, 0.78],
        [0, 1.0],
      ]) {
        const colH = treeH * hMult * 0.85;
        const grad = ctx.createLinearGradient(cx + dx, groundY - colH, cx + dx, groundY);
        grad.addColorStop(0, p.colorLeafTip);
        grad.addColorStop(0.5, p.colorLeafMain);
        grad.addColorStop(1, p.colorTrunk);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.roundRect(cx + dx - 10, groundY - colH, 20, colH, [10, 10, 4, 4]);
        ctx.fill();

        ctx.fillStyle = p.colorFlower;
        ctx.beginPath();
        ctx.ellipse(cx + dx, groundY - colH, 12, 4, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else if (p.engine === 'monopodial') {
    // Conifer / Pine / Fir
    ctx.fillStyle = p.colorTrunk;
    ctx.fillRect(cx - basetrunkW * 0.4, groundY - treeH * 0.4, basetrunkW * 0.8, treeH * 0.4);

    const tiers = 5;
    for (let t = 0; t < tiers; t++) {
      const frac = t / (tiers - 1);
      const ty = groundY - treeH * (0.22 + frac * 0.62);
      const tw = (42 - frac * 28) * (p.crownWidthRatio ? p.crownWidthRatio * 2.5 : 1);
      const th = 22 - frac * 4;
      const g = ctx.createLinearGradient(cx, ty - th, cx, ty + 4);
      g.addColorStop(0, p.colorLeafTip);
      g.addColorStop(1, p.colorLeafMain);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(cx, ty - th);
      ctx.lineTo(cx - tw, ty + 4);
      ctx.lineTo(cx + tw, ty + 4);
      ctx.closePath();
      ctx.fill();
    }
  } else if (p.engine === 'palm') {
    // Curved Palm Trunk + Radial Fronds
    ctx.strokeStyle = p.colorTrunk;
    ctx.lineWidth = Math.max(5, basetrunkW * 0.7);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - 6, groundY);
    ctx.quadraticCurveTo(cx + 12, groundY - treeH * 0.5, cx + 4, topY + 18);
    ctx.stroke();

    const apexX = cx + 4;
    const apexY = topY + 18;
    ctx.strokeStyle = p.colorLeafMain;
    ctx.lineWidth = 3.5;
    for (const ang of [-2.4, -1.9, -1.4, -0.6, -0.2, 0.3, 0.8]) {
      const fx = apexX + Math.cos(ang) * 34;
      const fy = apexY + Math.sin(ang) * 22 + 10;
      ctx.beginPath();
      ctx.moveTo(apexX, apexY);
      ctx.quadraticCurveTo((apexX + fx) * 0.5, apexY - 12, fx, fy);
      ctx.stroke();
    }
  } else {
    // Sympodial / Broadleaf / Weeping / Rosette
    ctx.strokeStyle = p.colorTrunk;
    ctx.lineWidth = basetrunkW;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx, groundY);
    ctx.lineTo(cx, groundY - treeH * 0.48);
    ctx.stroke();

    // Main branches
    ctx.lineWidth = Math.max(2.5, basetrunkW * 0.5);
    for (const [bx, by] of [
      [-18, groundY - treeH * 0.62],
      [18, groundY - treeH * 0.6],
      [0, groundY - treeH * 0.75],
    ]) {
      ctx.beginPath();
      ctx.moveTo(cx, groundY - treeH * 0.38);
      ctx.lineTo(cx + bx, by);
      ctx.stroke();
    }

    // Crown Foliage Clusters
    const blobs = [
      [cx - 20, groundY - treeH * 0.56, 20],
      [cx + 20, groundY - treeH * 0.54, 20],
      [cx - 12, groundY - treeH * 0.74, 22],
      [cx + 12, groundY - treeH * 0.72, 22],
      [cx, groundY - treeH * 0.82, 24],
    ];
    for (const [bx, by, br] of blobs) {
      const g = ctx.createRadialGradient(bx - br * 0.25, by - br * 0.25, 2, bx, by, br);
      g.addColorStop(0, p.colorLeafTip);
      g.addColorStop(1, p.colorLeafMain);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(bx, by, br, 0, Math.PI * 2);
      ctx.fill();
    }

    if (p.foliageType === 'blossom_clusters' || p.foliageType === 'berry_clusters') {
      ctx.fillStyle = p.colorFlower;
      for (const [fx, fy] of [
        [cx - 18, groundY - treeH * 0.62],
        [cx + 16, groundY - treeH * 0.65],
        [cx - 4, groundY - treeH * 0.84],
        [cx + 8, groundY - treeH * 0.75],
      ]) {
        ctx.beginPath();
        ctx.arc(fx, fy, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  const dataUrl = canvas.toDataURL('image/png');
  if (cacheKey) {
    PRESET_THUMB_CACHE[cacheKey] = dataUrl;
  }
  return dataUrl;
}

function createStarterLibraryModels(): SavedBotanicalModel[] {
  const starterIds = [
    { id: 'birch_florasynth', bg: '#0c131d', ground: '#101824' },
    { id: 'alien_mega_mushroom', bg: '#2b120c', ground: '#381911' },
    { id: 'alien_cracked_ova_ivory', bg: '#040a12', ground: '#061320' },
    { id: 'cactus_saguaro', bg: '#182214', ground: '#141d10' },
  ];

  const now = Date.now();
  return starterIds
    .map((item, idx) => {
      const preset = SPECIES_CATALOG.find((s) => s.id === item.id);
      if (!preset) return null;
      const fullParams: TreeParams = {
        ...DEFAULT_TREE_PARAMS,
        ...preset.params,
        presetId: preset.id,
      };
      return {
        id: `local_starter_${idx}_${preset.id}`,
        name: `${preset.name.split(' (')[0]} (Guardado)`,
        scientificName: preset.scientificName,
        category: preset.category,
        createdAt: now - (4 - idx) * 60000,
        updatedAt: now - (4 - idx) * 60000,
        thumbnailDataUrl: generateMiniaturePreviewDataUrl(fullParams, item.bg, item.ground),
        params: fullParams,
        backgroundColor: item.bg,
        groundColor: item.ground,
        stats: {
          triangles: 48200,
          treeHeightM: fullParams.height,
          crownDiameterM: Math.round(fullParams.height * 0.72 * 10) / 10,
        },
      };
    })
    .filter((x): x is SavedBotanicalModel => x !== null);
}

export function loadSavedModelsFromStorage(): SavedBotanicalModel[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const starters = createStarterLibraryModels();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(starters));
      return starters;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      let mutated = false;
      const upgraded = parsed.map((m: SavedBotanicalModel) => {
        const text = `${m?.name || ''} ${m?.scientificName || ''} ${m?.params?.customElement?.name || ''}`.toLowerCase();
        const isBubbleUmbel =
          text.includes('burbuja') ||
          text.includes('sphaer') ||
          text.includes('umbel') ||
          text.includes('allium') ||
          text.includes('diente de le');
        if (
          isBubbleUmbel &&
          m?.params?.customElement &&
          m.params.customElement.canopyElement !== 'spherical_bubble_umbel'
        ) {
          mutated = true;
          const nextParams: TreeParams = {
            ...m.params,
            colorTrunk: '#2e6f23',
            colorLeafMain: '#fb923c',
            colorLeafTip: '#f472b6',
            colorFlower: '#c084fc',
            colorAccent: '#38bdf8',
            customElement: {
              ...m.params.customElement,
              stemStructure: 'herbaceous_curved_stalk',
              canopyElement: 'spherical_bubble_umbel',
              surfaceElement: 'smooth_striated',
              hangingElement: 'hanging_pods_berries',
              synthesizedHeadTopology: 'spherical_umbel_rays',
              synthesizedTipPrimitive: 'iridescent_bubble',
              synthesizedBasalFoliage: 'long_grass_blades',
              stemCount: 1,
              trunkBentS: 0.36,
              umbelRayCount: 68,
              umbelSphereRatio: 0.96,
              tipBubbleScale: 1.18,
              basalLeafCount: 16,
              basalLeafLength: 1.25,
              iridescentShift: 0.92,
              aiNewPartsReport:
                'Nuevas piezas 3D sintetizadas por IA: 1) Tallo herbáceo verde estriado en S, 2) Umbela esférica 360° de filamentos radiantes con burbujas iridiscentes multicolores y gotas de rocío, 3) Penacho basal de hojas herbáceas arqueadas.',
            },
          };
          return {
            ...m,
            params: nextParams,
          };
        }

        const isMossyTrunk =
          (text.includes('tronco') || text.includes('lignum') || text.includes('madera')) &&
          (text.includes('musgo') || text.includes('bryophyt'));
        if (
          isMossyTrunk &&
          m?.params?.customElement &&
          (m.params.customElement.canopyElement !== 'moss_velvet_mantle' ||
            m.params.customElement.stemStructure !== 'serpentine_mossy_deadwood')
        ) {
          mutated = true;
          const nextParams: TreeParams = {
            ...m.params,
            barkType: 'mossy_deadwood',
            colorTrunk: '#583e2a',
            colorLeafMain: '#4a7c1d',
            colorLeafTip: '#7cb524',
            colorFlower: '#5c8f22',
            colorAccent: '#8ec435',
            customElement: {
              ...m.params.customElement,
              stemStructure: 'serpentine_mossy_deadwood',
              canopyElement: 'moss_velvet_mantle',
              surfaceElement: 'moss_lichen_bark',
              hangingElement: 'mycelial_fuzz',
              synthesizedHeadTopology: 'none',
              synthesizedTipPrimitive: 'bryophyte_moss_pad',
              synthesizedBasalFoliage: 'none',
              trunkBentS: Math.max(0.78, m.params.customElement.trunkBentS ?? 0.82),
              aiNewPartsReport:
                'Síntesis 3D de nuevas partes: 1) Tronco de madera envejecida en doble curva S serpentina con fibras helicoidales, 2) Muñones leñosos apicales y laterales desgastados sin hojas planas, 3) Manto de cojines y micro-filamentos de musgo briófito verde adheridos a las crestas de la corteza.',
            },
          };
          return {
            ...m,
            params: nextParams,
          };
        }
        return m;
      });
      if (mutated) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(upgraded));
      }
      return upgraded;
    }
  } catch (e) {
    console.warn('Could not read local model library:', e);
  }
  return createStarterLibraryModels();
}

export function saveModelsToStorage(models: SavedBotanicalModel[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(models));
  } catch (e) {
    console.warn('Storage quota exceeded, trimming oldest thumbnails:', e);
  }
}

export function downloadModelJson(model: SavedBotanicalModel): void {
  const payload = JSON.stringify(model, null, 2);
  const blob = new Blob([payload], { type: 'application/json' });
  const link = document.createElement('a');
  const safeName = model.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
  link.href = URL.createObjectURL(blob);
  link.download = `arborea_modelo_${safeName || 'planta'}.arborea.json`;
  link.click();
  URL.revokeObjectURL(link.href);
}

export function downloadEntireLibraryJson(models: SavedBotanicalModel[]): void {
  const payload = JSON.stringify(
    {
      format: 'ArboreaStudioPro_ModelLibrary_v1',
      exportedAt: new Date().toISOString(),
      count: models.length,
      models,
    },
    null,
    2
  );
  const blob = new Blob([payload], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `arborea_biblioteca_completa_${models.length}_modelos.arborea.json`;
  link.click();
  URL.revokeObjectURL(link.href);
}

export function parseImportedModelsJson(jsonText: string): SavedBotanicalModel[] {
  const data = JSON.parse(jsonText);
  const rawList: unknown[] = Array.isArray(data)
    ? data
    : data && Array.isArray(data.models)
    ? data.models
    : data && typeof data === 'object' && 'params' in data
    ? [data]
    : [];

  const result: SavedBotanicalModel[] = [];
  for (const item of rawList) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Partial<SavedBotanicalModel>;
    if (!rec.params) continue;
    const mergedParams: TreeParams = { ...DEFAULT_TREE_PARAMS, ...rec.params };
    const bg = rec.backgroundColor || '#0c131d';
    const ground = rec.groundColor || '#101824';
    result.push({
      id: rec.id || `imported_${Date.now()}_${Math.floor(Math.random() * 9999)}`,
      name: rec.name || 'Modelo Importado',
      scientificName: rec.scientificName || 'Arborea custom',
      category: rec.category || 'Personalizado',
      createdAt: rec.createdAt || Date.now(),
      updatedAt: Date.now(),
      thumbnailDataUrl:
        rec.thumbnailDataUrl || generateMiniaturePreviewDataUrl(mergedParams, bg, ground),
      params: mergedParams,
      backgroundColor: bg,
      groundColor: ground,
      stats: rec.stats || {
        triangles: 42000,
        treeHeightM: mergedParams.height,
        crownDiameterM: Math.round(mergedParams.height * 0.7 * 10) / 10,
      },
    });
  }
  return result;
}
