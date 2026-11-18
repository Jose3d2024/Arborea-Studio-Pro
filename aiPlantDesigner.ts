import { DEFAULT_TREE_PARAMS, SPECIES_CATALOG, BACKGROUND_PRESETS } from '../data/speciesCatalog';
import {
  CustomBotanicalElement,
  EcosystemBaseType,
  SpeciesPreset,
  TreeParams,
} from '../types/botany';
import { DEFAULT_CUSTOM_ELEMENT } from '../engine/composedElementGenerator';
import {
  buildPartsLibraryPayloadForAI,
  registerAiNovelPartsIfNew,
} from './partsLibrary';

export type AiProviderId =
  | 'cloud_default'
  | 'ollama'
  | 'lmstudio'
  | 'llamacpp_openai'
  | 'local_vision_offline';

export interface AiProviderConfig {
  provider: AiProviderId;
  endpointUrl: string;
  modelName: string;
  temperature: number;
  autoFallback: boolean;
}

export const AI_PROVIDER_META: Record<
  AiProviderId,
  {
    label: string;
    shortLabel: string;
    defaultEndpoint: string;
    defaultModel: string;
    suggestedModels: string[];
    description: string;
    helpHint: string;
  }
> = {
  cloud_default: {
    label: 'IA en Nube Integrada (Por Defecto)',
    shortLabel: 'IA Nube',
    defaultEndpoint: '',
    defaultModel: 'cloud-vision-3d',
    suggestedModels: ['cloud-vision-3d'],
    description:
      'Usa el motor multimodal del servidor con síntesis morfológica automática.',
    helpHint: 'No requiere instalar nada adicional en tu PC.',
  },
  ollama: {
    label: 'Ollama Local en tu PC (Puerto 11434)',
    shortLabel: 'Ollama Local',
    defaultEndpoint: 'http://127.0.0.1:11434',
    defaultModel: 'llama3.2-vision',
    suggestedModels: [
      'llama3.2-vision',
      'llava:latest',
      'llava-llama3',
      'qwen2.5-vl',
      'minicpm-v',
      'gemma3:12b',
      'bakllava',
      'moondream',
    ],
    description:
      'Conecta directamente con Ollama ejecutándose en tu ordenador para analizar la imagen con modelos de visión locales.',
    helpHint:
      'Ejecuta "ollama serve" y descarga un modelo con visión, ej: "ollama pull llama3.2-vision" o "ollama pull llava".',
  },
  lmstudio: {
    label: 'LM Studio Local (Servidor Puerto 1234)',
    shortLabel: 'LM Studio',
    defaultEndpoint: 'http://127.0.0.1:1234/v1',
    defaultModel: 'qwen2.5-vl-7b-instruct',
    suggestedModels: [
      'qwen2.5-vl-7b-instruct',
      'llava-v1.5-7b',
      'pixtral-12b',
      'minicpm-v-2_6',
      'gemma-3-12b-it',
    ],
    description:
      'Usa el servidor local de LM Studio (pestaña Developer / Local Server) con cualquier modelo VLM cargado.',
    helpHint:
      'En LM Studio activa "Start Server" (puerto 1234) y habilita CORS si usas el navegador.',
  },
  llamacpp_openai: {
    label: 'Llama.cpp / LocalAI / Jan / vLLM (OpenAI Local)',
    shortLabel: 'Llama.cpp / LocalAI',
    defaultEndpoint: 'http://127.0.0.1:8080/v1',
    defaultModel: 'llava-v1.6',
    suggestedModels: ['llava-v1.6', 'qwen2-vl', 'minicpm-v', 'default'],
    description:
      'Conecta con cualquier servidor local compatible con la ruta /v1/chat/completions (llama-server, LocalAI, Jan, KoboldCpp, TextGenWebUI).',
    helpHint: 'Asegúrate de iniciar llama-server con soporte multimodal (--mmproj).',
  },
  local_vision_offline: {
    label: 'Visión Computacional Local Offline (Instantáneo sin LLM)',
    shortLabel: 'Visión Offline',
    defaultEndpoint: '',
    defaultModel: 'pixel-morph-v2',
    suggestedModels: ['pixel-morph-v2'],
    description:
      'Analiza en milisegundos la silueta, espinosidad, apertura y paleta cromática directamente desde los píxeles en tu PC sin depender de servidores externos.',
    helpHint: 'Funciona 100% sin conexión a internet ni modelos pesados.',
  },
};

const AI_CONFIG_STORAGE_KEY = 'arborea_ai_provider_config_v1';

export const DEFAULT_AI_PROVIDER_CONFIG: AiProviderConfig = {
  provider: 'cloud_default',
  endpointUrl: 'http://127.0.0.1:11434',
  modelName: 'llama3.2-vision',
  temperature: 0.3,
  autoFallback: true,
};

export function loadAiProviderConfig(): AiProviderConfig {
  try {
    const raw = localStorage.getItem(AI_CONFIG_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_AI_PROVIDER_CONFIG };
    const parsed = JSON.parse(raw);
    const provider: AiProviderId =
      parsed?.provider && AI_PROVIDER_META[parsed.provider as AiProviderId]
        ? (parsed.provider as AiProviderId)
        : 'cloud_default';
    const meta = AI_PROVIDER_META[provider];
    return {
      provider,
      endpointUrl:
        typeof parsed?.endpointUrl === 'string' && parsed.endpointUrl.trim()
          ? parsed.endpointUrl.trim()
          : meta.defaultEndpoint,
      modelName:
        typeof parsed?.modelName === 'string' && parsed.modelName.trim()
          ? parsed.modelName.trim()
          : meta.defaultModel,
      temperature:
        typeof parsed?.temperature === 'number' && Number.isFinite(parsed.temperature)
          ? Math.max(0, Math.min(1.2, parsed.temperature))
          : 0.3,
      autoFallback: parsed?.autoFallback !== false,
    };
  } catch {
    return { ...DEFAULT_AI_PROVIDER_CONFIG };
  }
}

export function saveAiProviderConfig(cfg: AiProviderConfig): void {
  try {
    localStorage.setItem(AI_CONFIG_STORAGE_KEY, JSON.stringify(cfg));
  } catch {
    // ignore storage quota errors
  }
}

/**
 * Detects installed models in local Ollama / LM Studio / Llama.cpp:
 * Tries direct browser localhost connection first (works even if frontend is opened from remote preview),
 * then falls back to the local Express backend route `/api/ai/local-models`.
 */
export async function detectLocalAiModels(
  cfg: AiProviderConfig
): Promise<{ ok: boolean; models: string[]; message: string }> {
  if (cfg.provider === 'cloud_default' || cfg.provider === 'local_vision_offline') {
    const meta = AI_PROVIDER_META[cfg.provider];
    return {
      ok: true,
      models: meta.suggestedModels,
      message: `${meta.shortLabel} listo para usar.`,
    };
  }

  const base = (cfg.endpointUrl || AI_PROVIDER_META[cfg.provider].defaultEndpoint).replace(
    /\/+$/,
    ''
  );

  // 1. Try direct browser fetch to localhost (in case user has Ollama/LM Studio running on their machine)
  try {
    if (cfg.provider === 'ollama') {
      const r = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(2500) });
      if (r.ok) {
        const data = await r.json();
        const models: string[] = Array.isArray(data?.models)
          ? data.models.map((m: any) => String(m.name || m.model || '')).filter(Boolean)
          : [];
        return {
          ok: true,
          models,
          message:
            models.length > 0
              ? `Conectado a Ollama (${models.length} modelos detectados)`
              : 'Conectado a Ollama (0 modelos instalados; ejecuta "ollama pull llama3.2-vision")',
        };
      }
    } else {
      const modelsUrl = base.endsWith('/v1') ? `${base}/models` : `${base}/v1/models`;
      const r = await fetch(modelsUrl, { signal: AbortSignal.timeout(2500) });
      if (r.ok) {
        const data = await r.json();
        const models: string[] = Array.isArray(data?.data)
          ? data.data.map((m: any) => String(m.id || '')).filter(Boolean)
          : [];
        return {
          ok: true,
          models,
          message: `Conectado al servidor local (${models.length} modelos detectados)`,
        };
      }
    }
  } catch {
    // Browser direct fetch may be blocked by CORS if OLLAMA_ORIGINS is not set; try backend proxy next
  }

  // 2. Try via the Express backend proxy `/api/ai/local-models` (works with zero CORS when running locally on PC)
  try {
    const r = await fetch('/api/ai/local-models', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: cfg.provider,
        endpointUrl: base,
      }),
    });
    const data = await r.json().catch(() => ({}));
    if (r.ok && data?.ok) {
      const models: string[] = Array.isArray(data.models) ? data.models : [];
      return {
        ok: true,
        models,
        message:
          models.length > 0
            ? `Conectado vía servidor local (${models.length} modelos detectados)`
            : 'Servidor local conectado.',
      };
    }
    return {
      ok: false,
      models: [],
      message:
        data?.error ||
        `No se detectó ${AI_PROVIDER_META[cfg.provider].shortLabel} en ${base}.`,
    };
  } catch (err: any) {
    return {
      ok: false,
      models: [],
      message:
        err?.message ||
        `No se pudo conectar con ${AI_PROVIDER_META[cfg.provider].shortLabel} en ${base}.`,
    };
  }
}

export type DetectedBotanicalArchetype =
  | 'umbel_bubble_flower'
  | 'mossy_deadwood_trunk'
  | 'fungi_umbel_colony'
  | 'flower_bud_stalk'
  | 'spiny_claw_rosette'
  | 'spiral_volute_vine'
  | 'gnarled_bonsai_cloud'
  | 'weeping_tree'
  | 'sympodial_broadleaf_tree';

export interface ImageVisionFeatures {
  colorTrunk: string;
  colorLeafMain: string;
  colorLeafTip: string;
  colorFlower: string;
  colorAccent: string;
  aspectRatio: number;
  centerOpenness: number;
  topDensityRatio: number;
  edgeSpikiness: number;
  dominantHueCategory: 'green' | 'crimson' | 'violet' | 'golden' | 'cyan' | 'earthy';
  // Advanced 2D slice tomography & morphological measurements
  isDarkSceneBg: boolean;
  upperCapIslands: number;
  midStemIslands: number;
  vividClusterCount: number;
  capSpotVariance: number;
  trunkSCurve: number;
  upperWidthRatio: number;
  lowerWidthRatio: number;
  apexWidthRatio?: number;
  midBulgeRatio?: number;
  warmOrangeRatio: number;
  hasEnclosedCenterHole: boolean;
  iridescentScore: number;
  hasGreenBasalStem: boolean;
  silhouetteRadii: number[];
  colorUpper: string;
  colorLower: string;
  detectedArchetype: DetectedBotanicalArchetype;
}

export interface PreparedPlantImage {
  previewDataUrl: string;
  imageBase64: string;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  fileName: string;
  visionFeatures: ImageVisionFeatures;
}

export interface AiPlantDesignResult {
  identifiedName: string;
  scientificName: string;
  reasoningSummary: string;
  recommendedBase: EcosystemBaseType;
  recommendedBgId: string;
  backgroundHex: string;
  groundHex: string;
  params: TreeParams;
  createdElement: CustomBotanicalElement;
  createdPreset: SpeciesPreset;
  providerUsed?: string;
  partLibraryReport?: {
    newlySavedNames: string[];
    reusedNames: string[];
  };
}

const CUSTOM_ELEMENTS_STORAGE_KEY = 'arborea_custom_elements_v1';
const CUSTOM_SPECIES_STORAGE_KEY = 'arborea_custom_species_v1';

export function upgradeSynthesizedCustomElement(
  el: CustomBotanicalElement
): CustomBotanicalElement {
  const text = `${el.name || ''} ${el.scientificName || ''} ${el.description || ''}`.toLowerCase();
  const isLegacyCanopy =
    el.canopyElement === 'custom_flower_corolla' ||
    el.canopyElement === 'cloud_bonsai_pads' ||
    el.canopyElement === 'custom_leaf_lamina';

  const isBubbleUmbel =
    isLegacyCanopy &&
    (text.includes('burbuja') ||
      text.includes('sphaer') ||
      text.includes('diente de le') ||
      (text.includes('iridisc') && text.includes('esf')));

  if (isBubbleUmbel) {
    return {
      ...el,
      stemStructure: 'herbaceous_curved_stalk',
      canopyElement: 'spherical_bubble_umbel',
      surfaceElement: 'smooth_striated',
      hangingElement: 'hanging_pods_berries',
      synthesizedHeadTopology: 'spherical_umbel_rays',
      synthesizedTipPrimitive: 'iridescent_bubble',
      synthesizedBasalFoliage: 'long_grass_blades',
      stemCount: 1,
      trunkBentS: Math.max(0.32, el.trunkBentS ?? 0.36),
      umbelRayCount: el.umbelRayCount ?? 68,
      umbelSphereRatio: el.umbelSphereRatio ?? 0.96,
      tipBubbleScale: el.tipBubbleScale ?? 1.18,
      basalLeafCount: el.basalLeafCount ?? 16,
      basalLeafLength: el.basalLeafLength ?? 1.25,
      iridescentShift: el.iridescentShift ?? 0.92,
      aiNewPartsReport:
        el.aiNewPartsReport ||
        'Nuevas piezas 3D sintetizadas por IA: 1) Tallo herbáceo verde estriado en S, 2) Umbela esférica 360° de filamentos radiantes con burbujas iridiscentes multicolores y gotas de rocío, 3) Penacho basal de hojas herbáceas arqueadas.',
    };
  }

  const isMossyTrunk =
    isLegacyCanopy &&
    (text.includes('tronco') || text.includes('lignum') || text.includes('muñon')) &&
    (text.includes('musgo') || text.includes('bryophyt'));

  if (isMossyTrunk) {
    return {
      ...el,
      stemStructure: 'serpentine_mossy_deadwood',
      canopyElement: 'moss_velvet_mantle',
      surfaceElement: 'moss_lichen_bark',
      hangingElement: 'mycelial_fuzz',
      synthesizedHeadTopology: 'none',
      synthesizedTipPrimitive: 'bryophyte_moss_pad',
      synthesizedBasalFoliage: 'none',
      trunkBentS: Math.max(0.78, el.trunkBentS ?? 0.82),
      aiNewPartsReport:
        'Síntesis 3D de nuevas partes: 1) Tronco de madera envejecida en doble curva S serpentina con fibras helicoidales, 2) Muñones leñosos apicales y laterales desgastados sin hojas planas, 3) Manto de cojines y micro-filamentos de musgo briófito verde adheridos a las crestas de la corteza.',
    };
  }

  return el;
}

export function loadSavedCustomElements(): CustomBotanicalElement[] {
  try {
    const raw = localStorage.getItem(CUSTOM_ELEMENTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    let mutated = false;
    const upgraded = parsed.map((item: CustomBotanicalElement) => {
      const next = upgradeSynthesizedCustomElement(item);
      if (next !== item) mutated = true;
      return next;
    });
    if (mutated) {
      localStorage.setItem(CUSTOM_ELEMENTS_STORAGE_KEY, JSON.stringify(upgraded));
    }
    return upgraded;
  } catch {
    return [];
  }
}

export function saveCustomElementToApp(el: CustomBotanicalElement): CustomBotanicalElement[] {
  const upgradedEl = upgradeSynthesizedCustomElement(el);
  const existing = loadSavedCustomElements().filter((item) => item.id !== upgradedEl.id);
  const next = [upgradedEl, ...existing].slice(0, 60);
  try {
    localStorage.setItem(CUSTOM_ELEMENTS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore storage quota errors
  }
  return next;
}

export function deleteCustomElementFromApp(elementId: string, matchName?: string): CustomBotanicalElement[] {
  const existing = loadSavedCustomElements();
  const next = existing.filter(
    (item) => item.id !== elementId && (!matchName || item.name !== matchName)
  );
  try {
    localStorage.setItem(CUSTOM_ELEMENTS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore storage quota errors
  }
  return next;
}

export function loadSavedCustomSpecies(): SpeciesPreset[] {
  try {
    const raw = localStorage.getItem(CUSTOM_SPECIES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    let mutated = false;
    const upgraded = parsed.map((sp: SpeciesPreset) => {
      if (!sp?.params?.customElement) return sp;
      const nextEl = upgradeSynthesizedCustomElement(sp.params.customElement);
      if (nextEl !== sp.params.customElement) {
        mutated = true;
        const isMoss = nextEl.canopyElement === 'moss_velvet_mantle';
        return {
          ...sp,
          params: {
            ...sp.params,
            barkType: isMoss ? 'mossy_deadwood' : sp.params.barkType,
            colorTrunk: isMoss ? '#583e2a' : '#2e6f23',
            colorLeafMain: isMoss ? '#4a7c1d' : '#fb923c',
            colorLeafTip: isMoss ? '#7cb524' : '#f472b6',
            colorFlower: isMoss ? '#5c8f22' : '#c084fc',
            colorAccent: isMoss ? '#8ec435' : '#38bdf8',
            customElement: nextEl,
          },
        };
      }
      return sp;
    });
    if (mutated) {
      localStorage.setItem(CUSTOM_SPECIES_STORAGE_KEY, JSON.stringify(upgraded));
    }
    return upgraded;
  } catch {
    return [];
  }
}

export function saveCustomSpeciesToApp(preset: SpeciesPreset): SpeciesPreset[] {
  const existing = loadSavedCustomSpecies().filter((item) => item.id !== preset.id);
  const next = [preset, ...existing].slice(0, 60);
  try {
    localStorage.setItem(CUSTOM_SPECIES_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore storage quota errors
  }
  return next;
}

export function deleteCustomSpeciesFromApp(presetId: string): SpeciesPreset[] {
  const existing = loadSavedCustomSpecies().filter((item) => item.id !== presetId);
  try {
    localStorage.setItem(CUSTOM_SPECIES_STORAGE_KEY, JSON.stringify(existing));
  } catch {
    // ignore storage quota errors
  }
  return existing;
}

export type PartModuleType =
  | 'stem'
  | 'canopy'
  | 'surface'
  | 'hanging'
  | 'synthesizedTip'
  | 'basalFoliage';

export interface SavedPartModule {
  id: string;
  name: string;
  partType: PartModuleType;
  element: CustomBotanicalElement;
  createdAt: number;
}

const SAVED_PARTS_KEY = 'arborea_saved_parts_modules_v1';

export function loadSavedPartsModules(): SavedPartModule[] {
  try {
    const raw = localStorage.getItem(SAVED_PARTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveCustomPartModule(
  partName: string,
  partType: PartModuleType,
  element: CustomBotanicalElement
): SavedPartModule[] {
  try {
    const cleanName = partName.trim() || element.name || 'Parte Modular';
    const existing = loadSavedPartsModules().filter((p) => p.name !== cleanName);
    const newPart: SavedPartModule = {
      id: `part_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      name: cleanName,
      partType,
      element: {
        ...element,
        name: cleanName,
        aiNewPartsReport:
          element.aiNewPartsReport ||
          'Parte modular guardada en la biblioteca para reutilización con IA.',
      },
      createdAt: Date.now(),
    };
    const next = [newPart, ...existing].slice(0, 100);
    localStorage.setItem(SAVED_PARTS_KEY, JSON.stringify(next));
    return next;
  } catch (e) {
    console.error('Error guardando la parte modular en localStorage:', e);
    return loadSavedPartsModules();
  }
}

export function deleteSavedPartModule(partId: string): SavedPartModule[] {
  try {
    const next = loadSavedPartsModules().filter((p) => p.id !== partId);
    localStorage.setItem(SAVED_PARTS_KEY, JSON.stringify(next));
    return next;
  } catch {
    return loadSavedPartsModules();
  }
}

function rgbToHex(r: number, g: number, b: number): string {
  const clampByte = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return (
    '#' +
    [clampByte(r), clampByte(g), clampByte(b)]
      .map((x) => x.toString(16).padStart(2, '0'))
      .join('')
  );
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }
  return [h * 360, s, l];
}

function extractVisionFeaturesFromCanvas(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number
): ImageVisionFeatures {
  const imgData = ctx.getImageData(0, 0, w, h).data;

  // 1. Sample border pixels (top, left, right margins) to detect background color & luminance
  const borderSamples: [number, number, number, number, number][] = []; // r, g, b, sat, lum
  const borderStep = Math.max(2, Math.floor(Math.min(w, h) / 40));
  for (let x = 0; x < w; x += borderStep) {
    for (const y of [2, Math.min(h - 1, Math.floor(h * 0.04))]) {
      const idx = (y * w + x) * 4;
      if (imgData[idx + 3] > 40) {
        const [, sat, lum] = rgbToHsl(imgData[idx], imgData[idx + 1], imgData[idx + 2]);
        borderSamples.push([imgData[idx], imgData[idx + 1], imgData[idx + 2], sat, lum]);
      }
    }
  }
  for (let y = 0; y < Math.floor(h * 0.7); y += borderStep) {
    for (const x of [2, Math.max(0, w - 3)]) {
      const idx = (y * w + x) * 4;
      if (imgData[idx + 3] > 40) {
        const [, sat, lum] = rgbToHsl(imgData[idx], imgData[idx + 1], imgData[idx + 2]);
        borderSamples.push([imgData[idx], imgData[idx + 1], imgData[idx + 2], sat, lum]);
      }
    }
  }

  let avgBorderLum = 0.85;
  let avgBorderR = 240;
  let avgBorderG = 240;
  let avgBorderB = 240;
  if (borderSamples.length > 0) {
    let sumL = 0,
      sumR = 0,
      sumG = 0,
      sumB = 0;
    for (const [r, g, b, , l] of borderSamples) {
      sumR += r;
      sumG += g;
      sumB += b;
      sumL += l;
    }
    avgBorderR = sumR / borderSamples.length;
    avgBorderG = sumG / borderSamples.length;
    avgBorderB = sumB / borderSamples.length;
    avgBorderLum = sumL / borderSamples.length;
  }

  const isDarkSceneBg = avgBorderLum < 0.32;

  const isPixelForeground = (r: number, g: number, b: number, a: number): boolean => {
    if (a < 60) return false;
    const [, sat, lum] = rgbToHsl(r, g, b);
    if (!isDarkSceneBg) {
      const isCheckerboardGrey = sat < 0.08 && lum > 0.7;
      const isNearWhite = lum > 0.9 && sat < 0.2;
      const distToBorder = Math.hypot(r - avgBorderR, g - avgBorderG, b - avgBorderB);
      if (isCheckerboardGrey || isNearWhite || (distToBorder < 26 && sat < 0.15)) {
        return false;
      }
      return true;
    } else {
      const distToBorder = Math.hypot(r - avgBorderR, g - avgBorderG, b - avgBorderB);
      if (lum < 0.05) return false;
      if (distToBorder < 34 && sat < 0.35 && lum < avgBorderLum + 0.1) return false;
      if (sat < 0.22 && lum < avgBorderLum + 0.06) return false;
      return true;
    }
  };

  let minX = w;
  let maxX = 0;
  let minY = h;
  let maxY = 0;

  const trunkSamples: [number, number, number][] = [];
  const woodBarkSamples: [number, number, number][] = [];
  const mossGreenSamples: [number, number, number][] = [];
  const lowerGreenSamples: [number, number, number][] = [];
  const leafMainSamples: [number, number, number][] = [];
  const leafTipSamples: [number, number, number][] = [];
  const accentSamples: [number, number, number][] = [];
  const darkSpotSamples: [number, number, number][] = [];

  // Hue-specific buckets in the upper crown so complementary iridescent colors never cancel out into beige!
  const upperWarmCoralSamples: [number, number, number][] = [];
  const upperPinkVioletSamples: [number, number, number][] = [];
  const upperCyanBlueSamples: [number, number, number][] = [];
  const upperZoneAllSamples: [number, number, number][] = [];
  const lowerZoneAllSamples: [number, number, number][] = [];

  let fgCount = 0;
  let centerMidCount = 0;
  let topHalfFg = 0;
  let botHalfFg = 0;
  let edgeTransitions = 0;

  let hueGreenVotes = 0;
  let hueCrimsonVotes = 0;
  let hueVioletVotes = 0;
  let hueGoldenVotes = 0;
  let hueCyanVotes = 0;
  let warmOrangePixels = 0;

  const step = Math.max(1, Math.floor(Math.min(w, h) / 96));

  const NUM_BANDS = 10;
  const bandFgRuns = new Array<number>(NUM_BANDS).fill(0);
  const bandVividRuns = new Array<number>(NUM_BANDS).fill(0);
  const bandMinX = new Array<number>(NUM_BANDS).fill(w);
  const bandMaxX = new Array<number>(NUM_BANDS).fill(0);
  const bandCentroidXSum = new Array<number>(NUM_BANDS).fill(0);
  const bandFgCount = new Array<number>(NUM_BANDS).fill(0);
  const bandSpotTransitions = new Array<number>(NUM_BANDS).fill(0);

  for (let y = 0; y < h; y += step) {
    let prevIsFg = false;
    let prevIsVivid = false;
    let currentFgRunLen = 0;
    let currentVividRunLen = 0;
    const bandIdx = Math.min(NUM_BANDS - 1, Math.floor((y / h) * NUM_BANDS));

    for (let x = 0; x < w; x += step) {
      const idx = (y * w + x) * 4;
      const r = imgData[idx];
      const g = imgData[idx + 1];
      const b = imgData[idx + 2];
      const a = imgData[idx + 3];

      const [hue, sat, lum] = rgbToHsl(r, g, b);
      const isFg = isPixelForeground(r, g, b, a);
      const isVivid = isFg && sat > 0.35 && lum > 0.25 && lum < 0.88;

      if (isFg !== prevIsFg) {
        edgeTransitions++;
        if (!isFg && currentFgRunLen >= 2) {
          bandFgRuns[bandIdx]++;
        }
        currentFgRunLen = 0;
        prevIsFg = isFg;
      }
      if (isFg) currentFgRunLen++;

      if (isVivid !== prevIsVivid) {
        if (!isVivid && currentVividRunLen >= 2) {
          bandVividRuns[bandIdx]++;
        }
        if (isFg && bandIdx <= 6) {
          bandSpotTransitions[bandIdx]++;
        }
        currentVividRunLen = 0;
        prevIsVivid = isVivid;
      }
      if (isVivid) currentVividRunLen++;

      if (!isFg) continue;

      fgCount++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;

      if (x < bandMinX[bandIdx]) bandMinX[bandIdx] = x;
      if (x > bandMaxX[bandIdx]) bandMaxX[bandIdx] = x;
      bandCentroidXSum[bandIdx] += x / w;
      bandFgCount[bandIdx]++;

      const normX = x / w;
      const normY = y / h;
      if (normY < 0.56) topHalfFg++;
      else botHalfFg++;

      if (normX > 0.36 && normX < 0.64 && normY > 0.25 && normY < 0.68) {
        centerMidCount++;
      }

      // Collect upper-crown hue buckets (y < 0.65, central 76% width so bokeh forest edges don't dominate)
      if (normY < 0.66 && normX > 0.12 && normX < 0.88 && sat > 0.26 && lum > 0.22 && lum < 0.88) {
        if ((hue >= 345 || hue <= 52) && sat > 0.32) {
          upperWarmCoralSamples.push([r, g, b]);
        } else if (hue >= 255 && hue < 345 && sat > 0.26) {
          upperPinkVioletSamples.push([r, g, b]);
        } else if (hue >= 170 && hue < 255 && sat > 0.25) {
          upperCyanBlueSamples.push([r, g, b]);
        }
      }

      // Collect lower-half chlorophyll green stem/basal leaf samples
      if (normY >= 0.52 && hue >= 65 && hue <= 165 && sat > 0.22 && lum > 0.12 && lum < 0.70) {
        lowerGreenSamples.push([r, g, b]);
      }
      if (normY < 0.44 && sat > 0.14 && lum > 0.12 && lum < 0.90) {
        upperZoneAllSamples.push([r, g, b]);
      } else if (normY > 0.58 && sat > 0.12 && lum > 0.10 && lum < 0.85) {
        lowerZoneAllSamples.push([r, g, b]);
      }

      // Collect pure brown wood bark samples vs chlorophyll moss green samples
      if (hue >= 14 && hue <= 48 && sat >= 0.16 && sat <= 0.65 && lum >= 0.10 && lum <= 0.52) {
        woodBarkSamples.push([r, g, b]);
      } else if (hue >= 58 && hue <= 158 && sat >= 0.26 && lum >= 0.14 && lum <= 0.62) {
        mossGreenSamples.push([r, g, b]);
      }

      if (sat > 0.18) {
        if (hue >= 10 && hue <= 46 && sat > 0.38 && lum > 0.25) {
          warmOrangePixels++;
        }
        if ((hue >= 335 || hue <= 18) && sat > 0.25) hueCrimsonVotes += 2;
        else if (hue > 18 && hue < 68 && lum > 0.28) hueGoldenVotes += 2.1;
        else if (hue >= 68 && hue <= 165) hueGreenVotes += 2;
        else if (hue >= 245 && hue < 335) hueVioletVotes += 2;
        else if (hue > 165 && hue < 245) hueCyanVotes += 1.8;
      }

      const isWoodyOrStalk =
        (sat < 0.38 && lum > 0.05 && lum < 0.48) ||
        (hue >= 12 && hue <= 48 && sat < 0.62 && lum < 0.46);

      // Ignore white-background anti-aliased fringe pixels (lum > 0.72 with moderate saturation) for foliage colors
      const isWhiteHaloFringe = !isDarkSceneBg && lum > 0.70 && sat < 0.52;

      if (isWoodyOrStalk && normY > 0.32) {
        trunkSamples.push([r, g, b]);
      } else if (isWoodyOrStalk && normY <= 0.55) {
        darkSpotSamples.push([r, g, b]);
        trunkSamples.push([r, g, b]);
      } else if (!isWhiteHaloFringe && sat > 0.42 && lum > 0.36 && lum <= 0.70) {
        leafTipSamples.push([r, g, b]);
        if (sat > 0.58) accentSamples.push([r, g, b]);
      } else if (!isWhiteHaloFringe && sat > 0.22 && lum <= 0.66) {
        leafMainSamples.push([r, g, b]);
      } else if (lum < 0.55) {
        trunkSamples.push([r, g, b]);
      }
    }
    if (currentFgRunLen >= 2) bandFgRuns[bandIdx]++;
    if (currentVividRunLen >= 2) bandVividRuns[bandIdx]++;
  }

  const avgColor = (
    arr: [number, number, number][],
    fallback: string
  ): string => {
    if (arr.length === 0) return fallback;
    let sr = 0;
    let sg = 0;
    let sb = 0;
    for (const [r, g, b] of arr) {
      sr += r;
      sg += g;
      sb += b;
    }
    return rgbToHex(sr / arr.length, sg / arr.length, sb / arr.length);
  };

  // Compute multi-hue iridescence score (high when warm coral/orange + cool cyan/blue or pink/violet coexist in upper head)
  const upperHueTotal = Math.max(
    1,
    upperWarmCoralSamples.length + upperPinkVioletSamples.length + upperCyanBlueSamples.length
  );
  const warmFrac = upperWarmCoralSamples.length / upperHueTotal;
  const pinkFrac = upperPinkVioletSamples.length / upperHueTotal;
  const cyanFrac = upperCyanBlueSamples.length / upperHueTotal;
  const activeHueBuckets =
    (upperWarmCoralSamples.length > 48 ? 1 : 0) +
    (upperPinkVioletSamples.length > 40 ? 1 : 0) +
    (upperCyanBlueSamples.length > 40 ? 1 : 0);

  const iridescentScore = Number(
    Math.min(
      1,
      activeHueBuckets >= 2
        ? 0.55 + Math.min(warmFrac, cyanFrac + pinkFrac) * 1.4
        : 0.08
    ).toFixed(2)
  );

  const hasGreenBasalStem = lowerGreenSamples.length > 24;

  let dominantHueCategory: ImageVisionFeatures['dominantHueCategory'] = 'green';
  const maxVotes = Math.max(
    hueGreenVotes,
    hueCrimsonVotes,
    hueVioletVotes,
    hueGoldenVotes,
    hueCyanVotes
  );
  if (maxVotes < 8) dominantHueCategory = 'earthy';
  else if (iridescentScore >= 0.55 && upperWarmCoralSamples.length > 20) dominantHueCategory = 'golden';
  else if (maxVotes === hueGoldenVotes) dominantHueCategory = 'golden';
  else if (maxVotes === hueCrimsonVotes) dominantHueCategory = 'crimson';
  else if (maxVotes === hueVioletVotes) dominantHueCategory = 'violet';
  else if (maxVotes === hueCyanVotes) dominantHueCategory = 'cyan';
  else dominantHueCategory = 'green';

  // If the image has an iridescent multi-hue head (like image_290829a3.png), pick each color from its pure hue bucket
  // instead of averaging orange + cyan into washed-out beige!
  const hasSignificantWoodAndMoss =
    woodBarkSamples.length > 25 && mossGreenSamples.length > 20 && iridescentScore < 0.45;

  let colorTrunk = hasSignificantWoodAndMoss
    ? avgColor(woodBarkSamples, '#583e2a')
    : hasGreenBasalStem && iridescentScore >= 0.48
    ? avgColor(lowerGreenSamples, '#2f6e24')
    : avgColor(woodBarkSamples.length > 15 ? woodBarkSamples : trunkSamples, '#4a3525');

  let colorLeafMain: string;
  let colorLeafTip: string;
  let colorFlower: string;
  let colorAccent: string;

  if (iridescentScore >= 0.52) {
    colorLeafMain = avgColor(upperWarmCoralSamples, '#f97316');
    colorFlower =
      upperPinkVioletSamples.length >= upperCyanBlueSamples.length
        ? avgColor(upperPinkVioletSamples, '#f472b6')
        : avgColor(upperWarmCoralSamples, '#fb7185');
    colorLeafTip = avgColor(upperPinkVioletSamples, '#f472b6');
    colorAccent = avgColor(upperCyanBlueSamples, '#38bdf8');
    if (hasGreenBasalStem) {
      colorTrunk = avgColor(lowerGreenSamples, '#2e6f21');
    }
  } else if (hasSignificantWoodAndMoss && dominantHueCategory === 'green') {
    colorTrunk = avgColor(woodBarkSamples, '#583e2a');
    colorLeafMain = avgColor(mossGreenSamples, '#4a7c1d');
    colorLeafTip = '#7cb524';
    colorFlower = '#5c8f22';
    colorAccent = '#8ec435';
  } else {
    colorLeafMain = avgColor(
      mossGreenSamples.length > leafMainSamples.length * 0.4 && dominantHueCategory === 'green'
        ? mossGreenSamples
        : leafMainSamples,
      dominantHueCategory === 'golden'
        ? '#d97706'
        : dominantHueCategory === 'crimson'
        ? '#881337'
        : dominantHueCategory === 'violet'
        ? '#6d28d9'
        : '#3f7a1d'
    );
    colorLeafTip = avgColor(
      leafTipSamples,
      dominantHueCategory === 'golden'
        ? '#f59e0b'
        : dominantHueCategory === 'crimson'
        ? '#dc2626'
        : dominantHueCategory === 'violet'
        ? '#c084fc'
        : '#7cb524'
    );
    colorFlower = avgColor(accentSamples, colorLeafTip);
    colorAccent =
      darkSpotSamples.length > 15
        ? avgColor(darkSpotSamples, '#291d18')
        : colorFlower;
  }

  const bboxW = Math.max(10, maxX - minX);
  const bboxH = Math.max(10, maxY - minY);
  const aspectRatio = Number((bboxH / bboxW).toFixed(2));
  const totalSampleCells = Math.max(1, (w / step) * (h / step));
  const centerOpenness = Number(
    Math.max(0, Math.min(1, 1 - centerMidCount / Math.max(1, fgCount * 0.22))).toFixed(2)
  );
  const topDensityRatio = Number(
    (topHalfFg / Math.max(1, topHalfFg + botHalfFg)).toFixed(2)
  );
  const edgeSpikiness = Number(
    Math.min(1, edgeTransitions / Math.max(1, totalSampleCells * 0.22)).toFixed(2)
  );

  const rowsPerBand = Math.max(1, Math.floor(h / step / NUM_BANDS));
  const avgRunsInBands = (startB: number, endB: number, arr: number[]) => {
    let sum = 0;
    let count = 0;
    for (let b = startB; b <= endB; b++) {
      sum += arr[b] / rowsPerBand;
      count++;
    }
    return count > 0 ? sum / count : 0;
  };

  const upperCapIslands = Number(
    Math.max(
      avgRunsInBands(1, 5, bandVividRuns),
      avgRunsInBands(1, 4, bandFgRuns) * 0.85
    ).toFixed(2)
  );
  const midStemIslands = Number(avgRunsInBands(4, 7, bandFgRuns).toFixed(2));
  const vividClusterCount = Math.round(
    Math.max(1, avgRunsInBands(1, 6, bandVividRuns) * 2.2)
  );

  const upperSpotScore =
    (bandSpotTransitions[1] +
      bandSpotTransitions[2] +
      bandSpotTransitions[3] +
      bandSpotTransitions[4] +
      bandSpotTransitions[5]) /
    Math.max(1, rowsPerBand * 5 * 4);
  const capSpotVariance = Number(Math.min(1, upperSpotScore).toFixed(2));

  let upperWidthSum = 0;
  let lowerWidthSum = 0;
  for (let b = 1; b <= 4; b++) {
    if (bandMaxX[b] > bandMinX[b]) upperWidthSum += (bandMaxX[b] - bandMinX[b]) / w;
  }
  for (let b = 6; b <= 8; b++) {
    if (bandMaxX[b] > bandMinX[b]) lowerWidthSum += (bandMaxX[b] - bandMinX[b]) / w;
  }
  const upperWidthRatio = Number((upperWidthSum / 4).toFixed(2));
  const lowerWidthRatio = Number((lowerWidthSum / 3).toFixed(2));

  const centroids: number[] = [];
  for (let b = 3; b <= 8; b++) {
    if (bandFgCount[b] > 4) {
      centroids.push(bandCentroidXSum[b] / bandFgCount[b]);
    }
  }
  let trunkSCurve = 0.15;
  if (centroids.length >= 3) {
    const minC = Math.min(...centroids);
    const maxC = Math.max(...centroids);
    trunkSCurve = Number(Math.min(1, (maxC - minC) * 2.4).toFixed(2));
  }

  const warmOrangeRatio = Number(
    (warmOrangePixels / Math.max(1, fgCount)).toFixed(2)
  );

  const hasEnclosedCenterHole =
    !isDarkSceneBg &&
    centerOpenness > 0.36 &&
    midStemIslands >= 1.6 &&
    midStemIslands <= 3.6 &&
    lowerWidthRatio < 0.48 &&
    warmOrangeRatio < 0.18 &&
    iridescentScore < 0.45;

  // Deterministic botanical archetype classification from 2D tomography
  let detectedArchetype: DetectedBotanicalArchetype = 'sympodial_broadleaf_tree';

  if (
    activeHueBuckets === 3 &&
    iridescentScore >= 0.65 &&
    hasGreenBasalStem &&
    topDensityRatio >= 0.58 &&
    upperWidthRatio >= 0.50
  ) {
    detectedArchetype = 'umbel_bubble_flower';
  } else if (
    hasSignificantWoodAndMoss &&
    (dominantHueCategory === 'green' || dominantHueCategory === 'earthy') &&
    mossGreenSamples.length > 40 &&
    trunkSCurve >= 0.22 &&
    upperWidthRatio < 0.58 &&
    !hasEnclosedCenterHole
  ) {
    detectedArchetype = 'mossy_deadwood_trunk';
  } else if (
    edgeSpikiness > 0.28 &&
    topDensityRatio < 0.68 &&
    midStemIslands >= 2.1 &&
    !isDarkSceneBg
  ) {
    detectedArchetype = 'spiny_claw_rosette';
  } else if (
    isDarkSceneBg &&
    dominantHueCategory === 'golden' &&
    vividClusterCount >= 5 &&
    upperCapIslands >= 2.2 &&
    midStemIslands >= 2.5
  ) {
    detectedArchetype = 'fungi_umbel_colony';
  } else if (
    dominantHueCategory === 'violet' ||
    ((dominantHueCategory === 'crimson' || dominantHueCategory === 'golden') &&
      midStemIslands < 2.2 &&
      upperWidthRatio < 0.68)
  ) {
    detectedArchetype = 'flower_bud_stalk';
  } else if (
    hasEnclosedCenterHole &&
    (dominantHueCategory === 'green' || dominantHueCategory === 'earthy')
  ) {
    detectedArchetype = 'spiral_volute_vine';
  } else if (
    dominantHueCategory === 'crimson' ||
    (trunkSCurve > 0.22 && upperWidthRatio > 0.48 && lowerWidthRatio < 0.45)
  ) {
    detectedArchetype = 'gnarled_bonsai_cloud';
  } else if (edgeSpikiness > 0.28 && topDensityRatio > 0.56 && upperWidthRatio > 0.55) {
    detectedArchetype = 'weeping_tree';
  } else {
    detectedArchetype = 'sympodial_broadleaf_tree';
  }

  const rawBandWidths = [8, 7, 5, 4, 3, 1].map((bIdx) =>
    bandMaxX[bIdx] > bandMinX[bIdx] ? (bandMaxX[bIdx] - bandMinX[bIdx]) / w : 0.2
  );
  const maxBandW = Math.max(0.15, ...rawBandWidths);
  const silhouetteRadii = rawBandWidths.map((bw) =>
    Number(Math.max(0.14, Math.min(1.08, (bw / maxBandW) * 0.96)).toFixed(2))
  );
  const apexBandW =
    bandMaxX[0] > bandMinX[0]
      ? (bandMaxX[0] - bandMinX[0]) / w
      : bandMaxX[1] > bandMinX[1]
      ? (bandMaxX[1] - bandMinX[1]) / w
      : 0.2;
  const midBandW =
    ((bandMaxX[4] > bandMinX[4] ? (bandMaxX[4] - bandMinX[4]) / w : 0.2) +
      (bandMaxX[5] > bandMinX[5] ? (bandMaxX[5] - bandMinX[5]) / w : 0.2)) *
    0.5;
  const apexWidthRatio = Number(
    Math.min(1.5, apexBandW / Math.max(0.08, upperWidthRatio)).toFixed(2)
  );
  const midBulgeRatio = Number(
    Math.min(2.2, midBandW / Math.max(0.08, lowerWidthRatio)).toFixed(2)
  );
  const colorUpper = avgColor(upperZoneAllSamples, colorLeafTip);
  const colorLower = avgColor(lowerZoneAllSamples, colorTrunk);

  return {
    colorTrunk,
    colorLeafMain,
    colorLeafTip,
    colorFlower,
    colorAccent,
    aspectRatio,
    centerOpenness,
    topDensityRatio,
    edgeSpikiness,
    dominantHueCategory,
    isDarkSceneBg,
    upperCapIslands,
    midStemIslands,
    vividClusterCount,
    capSpotVariance,
    trunkSCurve,
    upperWidthRatio,
    lowerWidthRatio,
    apexWidthRatio,
    midBulgeRatio,
    warmOrangeRatio,
    hasEnclosedCenterHole,
    iridescentScore,
    hasGreenBasalStem,
    silhouetteRadii,
    colorUpper,
    colorLower,
    detectedArchetype,
  };
}


export async function preparePlantImageForAI(file: File): Promise<PreparedPlantImage> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Selecciona un archivo de imagen válido (JPG, PNG o WEBP).');
  }

  const rawDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('No se pudo leer la imagen seleccionada.'));
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('No se pudo decodificar la imagen seleccionada.'));
    image.src = rawDataUrl;
  });

  const maxDimension = 512;
  let targetW = img.naturalWidth || img.width || 512;
  let targetH = img.naturalHeight || img.height || 512;

  if (targetW > maxDimension || targetH > maxDimension) {
    const ratio = Math.min(maxDimension / targetW, maxDimension / targetH);
    targetW = Math.max(64, Math.round(targetW * ratio));
    targetH = Math.max(64, Math.round(targetH * ratio));
  }

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('No se pudo preparar el lienzo de análisis de imagen.');
  }

  ctx.clearRect(0, 0, targetW, targetH);
  ctx.drawImage(img, 0, 0, targetW, targetH);
  const visionFeatures = extractVisionFeaturesFromCanvas(ctx, targetW, targetH);

  const sendCanvas = document.createElement('canvas');
  sendCanvas.width = targetW;
  sendCanvas.height = targetH;
  const sendCtx = sendCanvas.getContext('2d')!;
  sendCtx.fillStyle = '#0f172a';
  sendCtx.fillRect(0, 0, targetW, targetH);
  sendCtx.drawImage(img, 0, 0, targetW, targetH);

  const outputMime: 'image/jpeg' = 'image/jpeg';
  const compressedDataUrl = sendCanvas.toDataURL(outputMime, 0.82);
  const base64Payload = compressedDataUrl.split(',')[1] || '';

  return {
    previewDataUrl: rawDataUrl,
    imageBase64: base64Payload,
    mimeType: outputMime,
    fileName: file.name.replace(/\.[^.]+$/, ''),
    visionFeatures,
  };
}

export async function designPlantFromImageWithAI(
  prepared: PreparedPlantImage,
  userNotes: string,
  aiConfigOverride?: AiProviderConfig
): Promise<AiPlantDesignResult> {
  const aiConfig = aiConfigOverride || loadAiProviderConfig();
  const unifiedLibraryParts = buildPartsLibraryPayloadForAI(32);

  const response = await fetch('/api/ai/design-plant', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(130000),
    body: JSON.stringify({
      imageBase64: prepared.imageBase64,
      mimeType: prepared.mimeType,
      userNotes: userNotes.trim(),
      visionFeatures: prepared.visionFeatures,
      aiConfig,
      customParts: unifiedLibraryParts,
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.result) {
    throw new Error(
      payload?.error || 'No se pudo completar el diseño 3D con IA para esta imagen.'
    );
  }

  const res = payload.result;
  const aiParams = res.params || {};
  const rawCustomEl = res.customElement || {};

  const customElId = `el_ai_${Date.now()}_${Math.floor(Math.random() * 900 + 100)}`;
  const customPresetId = `ai_species_${Date.now()}_${Math.floor(Math.random() * 900 + 100)}`;

  const createdElement: CustomBotanicalElement = upgradeSynthesizedCustomElement({
    ...DEFAULT_CUSTOM_ELEMENT,
    ...rawCustomEl,
    id: customElId,
    name: res.identifiedName || 'Elemento Botánico IA',
    scientificName: res.scientificName || 'Botanica composita sp.',
    description:
      res.reasoningSummary ||
      'Elemento 3D generado mediante combinación modular de tallo, superficie, follaje y filamentos.',
    createdAt: Date.now(),
  });

  const bgPreset =
    BACKGROUND_PRESETS.find((b) => b.id === res.recommendedBg) || BACKGROUND_PRESETS[0];

  const isMossResult =
    createdElement.canopyElement === 'moss_velvet_mantle' ||
    createdElement.stemStructure === 'serpentine_mossy_deadwood';

  const mergedParams: TreeParams = {
    ...DEFAULT_TREE_PARAMS,
    ...aiParams,
    barkType: isMossResult ? 'mossy_deadwood' : aiParams.barkType || DEFAULT_TREE_PARAMS.barkType,
    presetId: customPresetId,
    seed: Math.floor(1000 + Math.random() * 9000),
    representationStyle: 'botanical_leaves',
    customElement: createdElement,
  };

  const createdPreset: SpeciesPreset = {
    id: customPresetId,
    name: `${res.identifiedName} (IA)`,
    scientificName: res.scientificName || 'Botanica composita sp.',
    category: 'Creadas por IA & Combinación de Elementos',
    description:
      res.reasoningSummary ||
      'Especie diseñada por IA a partir de imagen mediante combinación de elementos 3D.',
    params: { ...mergedParams },
  };

  saveCustomElementToApp(createdElement);
  saveCustomSpeciesToApp(createdPreset);

  // Inspect every slot (canopy, stem, surface, hanging, tip, basal) against the Unified Parts Library
  // and automatically register any newly generated part that does not already exist!
  const partLibraryReport = registerAiNovelPartsIfNew(
    createdElement,
    mergedParams,
    res.identifiedName || createdElement.name || 'Espécimen IA'
  );

  if (!SPECIES_CATALOG.some((s) => s.id === createdPreset.id)) {
    SPECIES_CATALOG.unshift(createdPreset);
  }

  return {
    identifiedName: res.identifiedName || 'Espécimen Botánico IA',
    scientificName: res.scientificName || 'Botanica composita sp.',
    reasoningSummary: res.reasoningSummary || '',
    recommendedBase: res.recommendedBase || 'auto',
    recommendedBgId: bgPreset.id,
    backgroundHex: bgPreset.bg,
    groundHex: bgPreset.ground,
    params: mergedParams,
    createdElement,
    createdPreset,
    providerUsed: payload.providerUsed || AI_PROVIDER_META[aiConfig.provider].shortLabel,
    partLibraryReport,
  };
}
