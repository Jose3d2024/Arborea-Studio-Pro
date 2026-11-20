import { DEFAULT_TREE_PARAMS, BACKGROUND_PRESETS } from '../data/speciesCatalog';
import {
  CustomBotanicalElement,
  EcosystemBaseType,
  PhotoSculptBlueprint,
  PhotoSculptInterval,
  PhotoSculptSlice,
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

  // 1. Try direct browser fetch to localhost (skip on HTTPS -> http:// to avoid Mixed Content delay)
  const isMixedContentBlocked =
    typeof window !== 'undefined' &&
    window.location?.protocol === 'https:' &&
    base.toLowerCase().startsWith('http://');

  if (!isMixedContentBlocked) {
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
  photoSculptData: PhotoSculptBlueprint;
  debugMaskDataUrl?: string;
  debugColorGridDataUrl?: string;
  scanResolution?: string;
  foregroundCoveragePct?: number;
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

function safePersistListWithQuotaFallback<T>(
  storageKey: string,
  items: T[],
  compactOlderItem?: (item: T) => T
): T[] {
  const tryWrite = (list: T[]): boolean => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(list));
      return true;
    } catch {
      return false;
    }
  };

  if (tryWrite(items)) return items;

  // QuotaExceededError fallback #1: trim history to 25 most recent items
  const trimmed25 = items.slice(0, 25);
  if (tryWrite(trimmed25)) return trimmed25;

  // QuotaExceededError fallback #2: compact bulky photoSculptData on older items (keep newest 6 intact)
  if (compactOlderItem) {
    const compacted = trimmed25.map((item, idx) => (idx < 6 ? item : compactOlderItem(item)));
    if (tryWrite(compacted)) return compacted;
    const compacted12 = compacted.slice(0, 12);
    if (tryWrite(compacted12)) return compacted12;
  }

  // Final fallback: keep newest 10 items
  const trimmed10 = items.slice(0, 10);
  tryWrite(trimmed10);
  return trimmed10;
}

export function saveCustomElementToApp(el: CustomBotanicalElement): CustomBotanicalElement[] {
  const upgradedEl = upgradeSynthesizedCustomElement(el);
  const existing = loadSavedCustomElements().filter((item) => item.id !== upgradedEl.id);
  const next = [upgradedEl, ...existing].slice(0, 60);
  return safePersistListWithQuotaFallback(CUSTOM_ELEMENTS_STORAGE_KEY, next, (item) => {
    const { photoSculptData: _dropped, ...rest } = item;
    return rest;
  });
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
  return safePersistListWithQuotaFallback(CUSTOM_SPECIES_STORAGE_KEY, next, (sp) => {
    if (!sp.params?.customElement?.photoSculptData) return sp;
    const { photoSculptData: _dropped, ...restEl } = sp.params.customElement;
    return {
      ...sp,
      params: {
        ...sp.params,
        customElement: restEl,
      },
    };
  });
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

export function replaceSavedPartModules(next: SavedPartModule[]): SavedPartModule[] {
  try {
    localStorage.setItem(SAVED_PARTS_KEY, JSON.stringify(next));
  } catch {
    // ignore storage quota errors
  }
  return next;
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


/**
 * Direct Image-to-3D Reconstruction Extractor (v2 — Border Flood-Fill + Multi-Interval Raycasting):
 * 1) Runs a 4-connected adaptive Flood-Fill BFS from all 4 image edges to remove sky gradients,
 *    studio shadows, and backgrounds WITHOUT punching holes inside the plant subject.
 * 2) Scans 16 vertical slices to extract MULTIPLE separated horizontal matter intervals per height
 *    (detecting cactus arms, bifurcated trunks, open branches, and gaps!).
 * 3) Samples a tight 16x16 foreground pixel color map to wrap exact photo colors onto 3D geometry.
 */
function extractPhotoSculptBlueprint(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  vf: ImageVisionFeatures
): PhotoSculptBlueprint {
  const imgData = ctx.getImageData(0, 0, w, h).data;

  // 1. Full HD native resolution up to 1024x1024 (1:1 pixel accuracy) for Border Flood-Fill & fine-stem/spine detection
  const GW = Math.min(1024, Math.max(48, w));
  const GH = Math.min(1024, Math.max(48, h));
  const gridR = new Float32Array(GW * GH);
  const gridG = new Float32Array(GW * GH);
  const gridB = new Float32Array(GW * GH);
  const gridA = new Uint8Array(GW * GH);

  for (let gy = 0; gy < GH; gy++) {
    const sy = Math.min(h - 1, Math.floor((gy / GH) * h));
    for (let gx = 0; gx < GW; gx++) {
      const sx = Math.min(w - 1, Math.floor((gx / GW) * w));
      const pIdx = (sy * w + sx) * 4;
      const gIdx = gy * GW + gx;
      gridR[gIdx] = imgData[pIdx];
      gridG[gIdx] = imgData[pIdx + 1];
      gridB[gIdx] = imgData[pIdx + 2];
      gridA[gIdx] = imgData[pIdx + 3];
    }
  }

  // Sample the 4 corners first (cleanest background anchors; avoid top/bottom midpoints where tall plants touch the frame!)
  const cornerCoords: [number, number][] = [
    [1, 1],
    [GW - 2, 1],
    [1, GH - 2],
    [GW - 2, GH - 2],
    [1, Math.floor(GH * 0.5)],
    [GW - 2, Math.floor(GH * 0.5)],
  ];
  const borderSeedsR: number[] = [];
  const borderSeedsG: number[] = [];
  const borderSeedsB: number[] = [];
  for (const [sx, sy] of cornerCoords) {
    const cx = Math.max(0, Math.min(GW - 1, sx));
    const cy = Math.max(0, Math.min(GH - 1, sy));
    const idx = cy * GW + cx;
    if (gridA[idx] > 160) {
      borderSeedsR.push(gridR[idx]);
      borderSeedsG.push(gridG[idx]);
      borderSeedsB.push(gridB[idx]);
    }
  }

  // Returns both Euclidean RGB distance AND illumination-invariant chroma distance to the nearest border seed!
  // This lets smooth lighting gradients (bright->dark beige wall) pass while blocking hue shifts (green bokeh -> lavender petals)!
  const distToNearestBorderSeed = (r: number, g: number, b: number): { rgb: number; chroma: number } => {
    if (borderSeedsR.length === 0) return { rgb: 999, chroma: 999 };
    const lum = (r + g + b) / 3;
    const cr = r - lum;
    const cg = g - lum;
    const cb = b - lum;
    let bestRgb = 999;
    let bestChroma = 999;
    for (let k = 0; k < borderSeedsR.length; k++) {
      const sr = borderSeedsR[k];
      const sg = borderSeedsG[k];
      const sb = borderSeedsB[k];
      const dRgb = Math.hypot(r - sr, g - sg, b - sb);
      const sLum = (sr + sg + sb) / 3;
      const dChr = Math.hypot(cr - (sr - sLum), cg - (sg - sLum), cb - (sb - sLum));
      if (dRgb < bestRgb) {
        bestRgb = dRgb;
        bestChroma = dChr;
      }
    }
    return { rgb: bestRgb, chroma: bestChroma };
  };

  const pixelSat = (r: number, g: number, b: number): number => {
    const mx = Math.max(r, g, b);
    if (mx <= 1) return 0;
    const mn = Math.min(r, g, b);
    return (mx - mn) / mx;
  };

  const isBg = new Uint8Array(GW * GH);
  const queue = new Int32Array(GW * GH);
  let qHead = 0;
  let qTail = 0;

  // Seed perimeter pixels that belong to the background (skipping foreground petals/stems touching top/bottom frame)
  const seedBorderCell = (gx: number, gy: number) => {
    const idx = gy * GW + gx;
    if (isBg[idx]) return;
    if (gridA[idx] < 80) {
      isBg[idx] = 1;
      queue[qTail++] = idx;
      return;
    }
    const r = gridR[idx];
    const g = gridG[idx];
    const b = gridB[idx];
    const d = distToNearestBorderSeed(r, g, b);
    if (d.rgb <= 46 && d.chroma <= 24) {
      isBg[idx] = 1;
      queue[qTail++] = idx;
    }
  };

  // Always seed the 4 corners first
  seedBorderCell(0, 0);
  seedBorderCell(GW - 1, 0);
  seedBorderCell(0, GH - 1);
  seedBorderCell(GW - 1, GH - 1);
  for (let x = 0; x < GW; x++) {
    seedBorderCell(x, 0);
    seedBorderCell(x, GH - 1);
  }
  for (let y = 1; y < GH - 1; y++) {
    seedBorderCell(0, y);
    seedBorderCell(GW - 1, y);
  }

  // Pass 1: Illumination-Gradient & Chroma-Locked BFS Flood-Fill
  // Absorbs smooth wall/sky brightness gradients (low chroma shift), stops cold on hue changes (e.g. lavender petals on green bokeh)!
  const dxArr = [-1, 1, 0, 0];
  const dyArr = [0, 0, -1, 1];

  while (qHead < qTail) {
    const cur = queue[qHead++];
    const cx = cur % GW;
    const cy = (cur - cx) / GW;
    const cr = gridR[cur];
    const cg = gridG[cur];
    const cb = gridB[cur];

    for (let d = 0; d < 4; d++) {
      const nx = cx + dxArr[d];
      const ny = cy + dyArr[d];
      if (nx < 0 || nx >= GW || ny < 0 || ny >= GH) continue;
      const nIdx = ny * GW + nx;
      if (isBg[nIdx]) continue;

      if (gridA[nIdx] < 80) {
        isBg[nIdx] = 1;
        queue[qTail++] = nIdx;
        continue;
      }

      const nr = gridR[nIdx];
      const ng = gridG[nIdx];
      const nb = gridB[nIdx];
      const dNeighbor = Math.hypot(nr - cr, ng - cg, nb - cb);
      const dist = distToNearestBorderSeed(nr, ng, nb);
      const sat = pixelSat(nr, ng, nb);

      if (
        (dNeighbor <= 13 && sat < 0.44 && dist.rgb <= 92 && dist.chroma <= 26) ||
        (dNeighbor <= 20 && dist.rgb <= 54 && dist.chroma <= 22) ||
        (dist.rgb <= 24 && dist.chroma <= 16)
      ) {
        isBg[nIdx] = 1;
        queue[qTail++] = nIdx;
      }
    }
  }

  // Pass 2: Clean enclosed background pockets trapped inside bonsai loops & between branches (strict chroma lock!)
  for (let y = 1; y < GH - 1; y++) {
    for (let x = 1; x < GW - 1; x++) {
      const idx = y * GW + x;
      if (isBg[idx]) continue;
      const r = gridR[idx];
      const g = gridG[idx];
      const b = gridB[idx];
      const sat = pixelSat(r, g, b);
      if (sat >= 0.40) continue;
      const dist = distToNearestBorderSeed(r, g, b);
      if (dist.rgb > 36 || dist.chroma > 18) continue;
      // Check local smoothness (4-neighbor max delta): walls/sky are smooth, bark/leaves have texture
      const idxL = idx - 1;
      const idxR = idx + 1;
      const idxU = idx - GW;
      const idxD = idx + GW;
      const gMax = Math.max(
        Math.hypot(r - gridR[idxL], g - gridG[idxL], b - gridB[idxL]),
        Math.hypot(r - gridR[idxR], g - gridG[idxR], b - gridB[idxR]),
        Math.hypot(r - gridR[idxU], g - gridG[idxU], b - gridB[idxU]),
        Math.hypot(r - gridR[idxD], g - gridG[idxD], b - gridB[idxD])
      );
      if (gMax <= 12) {
        isBg[idx] = 1;
      }
    }
  }

  // Find tight bounding box of the foreground subject in grid coordinates
  let minGX = GW;
  let maxGX = 0;
  let minGY = GH;
  let maxGY = 0;
  let fgCount = 0;
  for (let y = 0; y < GH; y++) {
    for (let x = 0; x < GW; x++) {
      if (!isBg[y * GW + x]) {
        if (x < minGX) minGX = x;
        if (x > maxGX) maxGX = x;
        if (y < minGY) minGY = y;
        if (y > maxGY) maxGY = y;
        fgCount++;
      }
    }
  }

  // Fallback if flood-fill ate too much (e.g., very low-contrast monochrome photo)
  if (fgCount < GW * GH * 0.03 || maxGX - minGX < GW * 0.08 || maxGY - minGY < GH * 0.08) {
    minGX = Math.floor(GW * 0.1);
    maxGX = Math.floor(GW * 0.9);
    minGY = Math.floor(GH * 0.06);
    maxGY = Math.floor(GH * 0.94);
    for (let y = minGY; y <= maxGY; y++) {
      for (let x = minGX; x <= maxGX; x++) {
        isBg[y * GW + x] = 0;
      }
    }
  }

  const cropGW = Math.max(4, maxGX - minGX);
  const cropGH = Math.max(4, maxGY - minGY);
  const aspectRatio = Number(
    Math.max(0.45, Math.min(2.6, (cropGH / GH * h) / Math.max(1, (cropGW / GW) * w))).toFixed(2)
  );

  // 2. High-Resolution Multi-Interval Raycasting across 32 vertical slices (bottom y=0 .. top y=1)
  const SLICE_COUNT = 32;
  const slices: PhotoSculptSlice[] = [];
  let maxBranchColumns = 1;
  let multiIntervalSlices = 0;
  const bandHalfH = Math.max(1, Math.min(4, Math.round(cropGH / (SLICE_COUNT * 2.5))));

  for (let s = 0; s < SLICE_COUNT; s++) {
    const yNorm = s / (SLICE_COUNT - 1);
    const gyCenter = Math.max(0, Math.min(GH - 1, Math.round(maxGY - yNorm * cropGH)));
    const gyStart = Math.max(minGY, gyCenter - bandHalfH);
    const gyEnd = Math.min(maxGY, gyCenter + bandHalfH);

    // Build a 1D foreground occupancy array across cropGW for this slice band
    const occ = new Uint8Array(cropGW + 1);
    for (let xx = 0; xx <= cropGW; xx++) {
      const gx = minGX + xx;
      let hits = 0;
      for (let yy = gyStart; yy <= gyEnd; yy++) {
        if (!isBg[yy * GW + gx]) hits++;
      }
      if (hits > 0) occ[xx] = 1;
    }

    // Bridge tiny 1px noise gaps
    for (let xx = 1; xx < cropGW; xx++) {
      if (!occ[xx] && occ[xx - 1] && occ[xx + 1]) occ[xx] = 1;
    }

    // Extract distinct horizontal matter intervals [start..end]
    const minRunPx = Math.max(2, Math.round(cropGW * 0.035));
    const intervals: PhotoSculptInterval[] = [];
    let runStart = -1;
    const flushInterval = (rs: number, re: number) => {
      if (re - rs + 1 < minRunPx) return;
      let ir = 0;
      let ig = 0;
      let ib = 0;
      let icnt = 0;
      for (let xx = rs; xx <= re; xx++) {
        const gIdx = gyCenter * GW + (minGX + xx);
        if (!isBg[gIdx]) {
          ir += gridR[gIdx];
          ig += gridG[gIdx];
          ib += gridB[gIdx];
          icnt++;
        }
      }
      const startN = Number((rs / cropGW - 0.5).toFixed(3));
      const endN = Number((re / cropGW - 0.5).toFixed(3));
      const cxN = Number(((startN + endN) * 0.5).toFixed(3));
      const hwN = Number(Math.max(0.025, (endN - startN) * 0.5).toFixed(3));
      const col =
        icnt > 0 ? rgbToHex(ir / icnt, ig / icnt, ib / icnt) : vf.colorLeafMain;
      intervals.push({ start: startN, end: endN, cx: cxN, hw: hwN, color: col });
    };

    for (let xx = 0; xx <= cropGW; xx++) {
      if (occ[xx]) {
        if (runStart === -1) runStart = xx;
      } else if (runStart !== -1) {
        flushInterval(runStart, xx - 1);
        runStart = -1;
      }
    }
    if (runStart !== -1) flushInterval(runStart, cropGW);

    if (intervals.length >= 2) {
      multiIntervalSlices++;
      if (intervals.length > maxBranchColumns) maxBranchColumns = Math.min(5, intervals.length);
    }

    const fallbackCol = yNorm < 0.3 ? vf.colorTrunk : yNorm > 0.72 ? vf.colorLeafTip : vf.colorLeafMain;
    const outerStart = intervals.length > 0 ? intervals[0].start : -0.18;
    const outerEnd = intervals.length > 0 ? intervals[intervals.length - 1].end : 0.18;
    const cx = Number(((outerStart + outerEnd) * 0.5).toFixed(3));
    const hw = Number(Math.max(0.035, Math.min(0.52, (outerEnd - outerStart) * 0.5)).toFixed(3));
    const primaryInterval =
      intervals.length > 0
        ? intervals.reduce((best, cur) => (cur.hw > best.hw ? cur : best), intervals[0])
        : null;
    const color = primaryInterval ? primaryInterval.color : fallbackCol;
    const edgeColor = intervals.length > 0 ? intervals[intervals.length - 1].color : color;

    slices.push({
      y: Number(yNorm.toFixed(3)),
      cx,
      hw,
      color,
      edgeColor,
      intervals: intervals.length > 0 ? intervals : [{ start: cx - hw, end: cx + hw, cx, hw, color }],
    });
  }

  // Detect stem-to-crown transition (proportional to SLICE_COUNT)
  let stemTopFrac = 0.26;
  const baseW = (slices[0].hw + slices[1].hw + slices[2].hw) / 3;
  const upperStart = Math.floor(SLICE_COUNT * 0.3);
  const upperEnd = Math.floor(SLICE_COUNT * 0.88);
  const upperMaxW = Math.max(...slices.slice(upperStart, upperEnd).map((sl) => sl.hw));
  if (baseW > upperMaxW * 0.62) {
    stemTopFrac = 0.14;
  } else {
    let bestJump = 0;
    let bestY = 0.34;
    const searchStart = Math.max(2, Math.floor(SLICE_COUNT * 0.12));
    const searchEnd = Math.min(SLICE_COUNT - 3, Math.floor(SLICE_COUNT * 0.65));
    for (let i = searchStart; i <= searchEnd; i++) {
      const jump = slices[i + 2].hw - slices[i - 2].hw;
      if (jump > bestJump) {
        bestJump = jump;
        bestY = slices[i].y;
      }
    }
    stemTopFrac = Number(Math.max(0.18, Math.min(0.62, bestY)).toFixed(2));
  }

  // 3. Sample a clean HD 32x32 foreground color map (only reading non-background flood-fill pixels!)
  const colorGridW = 32;
  const colorGridH = 32;
  const sampleWin = Math.max(2, Math.min(6, Math.round(Math.min(cropGW, cropGH) / (colorGridW * 1.8))));
  const colorGridHex: string[] = [];
  for (let gy = 0; gy < colorGridH; gy++) {
    const yNorm = (gy + 0.5) / colorGridH;
    const targetGY = Math.max(minGY, Math.min(maxGY, Math.round(maxGY - yNorm * cropGH)));
    const sliceRef = slices[Math.min(SLICE_COUNT - 1, Math.floor(yNorm * SLICE_COUNT))];
    for (let gx = 0; gx < colorGridW; gx++) {
      const xNorm = (gx + 0.5) / colorGridW;
      const targetGX = Math.max(minGX, Math.min(maxGX, Math.round(minGX + xNorm * cropGW)));
      let sr = 0;
      let sg = 0;
      let sb = 0;
      let cnt = 0;
      for (let dy = -sampleWin; dy <= sampleWin; dy++) {
        for (let dx = -sampleWin; dx <= sampleWin; dx++) {
          const sx = Math.max(minGX, Math.min(maxGX, targetGX + dx));
          const sy = Math.max(minGY, Math.min(maxGY, targetGY + dy));
          const idx = sy * GW + sx;
          if (!isBg[idx]) {
            sr += gridR[idx];
            sg += gridG[idx];
            sb += gridB[idx];
            cnt++;
          }
        }
      }
      colorGridHex.push(cnt > 0 ? rgbToHex(sr / cnt, sg / cnt, sb / cnt) : sliceRef.color);
    }
  }

  const isRadialLobes = vf.edgeSpikiness >= 0.24 || vf.upperCapIslands >= 1.55;
  const lobeCount = Math.max(
    5,
    Math.min(14, Math.round(6 + vf.edgeSpikiness * 12 + (vf.vividClusterCount >= 3 ? 2 : 0)))
  );

  const blueprint: PhotoSculptBlueprint = {
    aspectRatio,
    stemTopFrac,
    isRadialLobes,
    edgeSpikiness: vf.edgeSpikiness,
    lobeCount,
    maxBranchColumns,
    hasMultiBranchGaps: multiIntervalSlices >= Math.max(3, Math.round(SLICE_COUNT * 0.16)) && maxBranchColumns >= 2,
    photoEnvelopeStrength: 0.72,
    slices,
    colorGridW,
    colorGridH,
    colorGridHex,
  };

  // Optional visual diagnostic previews (Flood-Fill mask + 32 multi-interval slices + 32x32 color map)
  let debugMaskDataUrl: string | undefined;
  let debugColorGridDataUrl: string | undefined;
  const foregroundCoveragePct = Math.round((fgCount / Math.max(1, GW * GH)) * 100);
  if (typeof document !== 'undefined') {
    try {
      const mCanvas = document.createElement('canvas');
      const mW = 192;
      const mH = Math.max(96, Math.min(240, Math.round((GH / Math.max(1, GW)) * mW)));
      mCanvas.width = mW;
      mCanvas.height = mH;
      const mCtx = mCanvas.getContext('2d');
      if (mCtx) {
        const imgOut = mCtx.createImageData(mW, mH);
        for (let py = 0; py < mH; py++) {
          const gy = Math.min(GH - 1, Math.floor((py / mH) * GH));
          for (let px = 0; px < mW; px++) {
            const gx = Math.min(GW - 1, Math.floor((px / mW) * GW));
            const gIdx = gy * GW + gx;
            const oIdx = (py * mW + px) * 4;
            if (isBg[gIdx]) {
              // Dark slate-blue checkerboard tint for removed background
              const chk = ((px >> 3) + (py >> 3)) % 2 === 0 ? 18 : 28;
              imgOut.data[oIdx] = chk;
              imgOut.data[oIdx + 1] = chk + 8;
              imgOut.data[oIdx + 2] = chk + 24;
              imgOut.data[oIdx + 3] = 255;
            } else {
              imgOut.data[oIdx] = Math.round(gridR[gIdx]);
              imgOut.data[oIdx + 1] = Math.round(gridG[gIdx]);
              imgOut.data[oIdx + 2] = Math.round(gridB[gIdx]);
              imgOut.data[oIdx + 3] = 255;
            }
          }
        }
        mCtx.putImageData(imgOut, 0, 0);

        // Draw crop bounding box
        const bx = (minGX / GW) * mW;
        const by = (minGY / GH) * mH;
        const bw = (cropGW / GW) * mW;
        const bh = (cropGH / GH) * mH;
        mCtx.strokeStyle = 'rgba(148, 163, 184, 0.7)';
        mCtx.lineWidth = 1;
        mCtx.strokeRect(bx, by, bw, bh);

        // Draw 32 multi-interval raycast slices in bright emerald/cyan
        mCtx.lineWidth = 1.5;
        for (const sl of slices) {
          const sy = by + (1 - sl.y) * bh;
          const ivs = sl.intervals || [];
          mCtx.strokeStyle = ivs.length >= 2 ? '#22d3ee' : '#34d399';
          for (const iv of ivs) {
            const x1 = bx + (iv.start + 0.5) * bw;
            const x2 = bx + (iv.end + 0.5) * bw;
            mCtx.beginPath();
            mCtx.moveTo(x1, sy);
            mCtx.lineTo(x2, sy);
            mCtx.stroke();
          }
        }

        // Draw stemTopFrac transition line in amber
        const stemLineY = by + (1 - stemTopFrac) * bh;
        mCtx.strokeStyle = '#fbbf24';
        mCtx.lineWidth = 1.5;
        mCtx.beginPath();
        mCtx.moveTo(bx, stemLineY);
        mCtx.lineTo(bx + bw, stemLineY);
        mCtx.stroke();

        debugMaskDataUrl = mCanvas.toDataURL('image/png');
      }

      const cCanvas = document.createElement('canvas');
      cCanvas.width = colorGridW * 4;
      cCanvas.height = colorGridH * 4;
      const cCtx = cCanvas.getContext('2d');
      if (cCtx) {
        for (let gy = 0; gy < colorGridH; gy++) {
          for (let gx = 0; gx < colorGridW; gx++) {
            cCtx.fillStyle = colorGridHex[gy * colorGridW + gx] || '#22c55e';
            // Flip Y so top of plant is at top of preview
            cCtx.fillRect(gx * 4, (colorGridH - 1 - gy) * 4, 4, 4);
          }
        }
        debugColorGridDataUrl = cCanvas.toDataURL('image/png');
      }
    } catch {
      // ignore canvas debug preview errors
    }
  }

  // 4. Recalibrate true foreground-only 5-color palette & archetype using the clean Flood-Fill mask!
  let trR = 0, trG = 0, trB = 0, trCnt = 0;
  let darkTrR = 0, darkTrG = 0, darkTrB = 0, darkTrCnt = 0;
  const upperLavenderRose: { r: number; g: number; b: number; sat: number; lum: number }[] = [];
  const upperVivid: { r: number; g: number; b: number; sat: number; lum: number }[] = [];
  const upperAll: { r: number; g: number; b: number; sat: number; lum: number }[] = [];

  const palStep = Math.max(1, Math.floor(Math.min(cropGW, cropGH) / 96));
  for (let gy = minGY; gy <= maxGY; gy += palStep) {
    const yNorm = (maxGY - gy) / Math.max(1, cropGH);
    for (let gx = minGX; gx <= maxGX; gx += palStep) {
      const idx = gy * GW + gx;
      if (isBg[idx]) continue;
      const r = gridR[idx];
      const g = gridG[idx];
      const b = gridB[idx];
      const sat = pixelSat(r, g, b);
      const lum = (r * 0.299 + g * 0.587 + b * 0.114) / 255;

      if (yNorm < 0.36) {
        trR += r; trG += g; trB += b; trCnt++;
        if (lum < 0.42 && sat < 0.52) {
          darkTrR += r; darkTrG += g; darkTrB += b; darkTrCnt++;
        }
      } else {
        upperAll.push({ r, g, b, sat, lum });
        // Distinguish lavender/lilac/rose petals (blue >= green - 3, red > green + 4) from brown bark (where green >> blue)!
        const isLavenderOrRose = b >= g - 3 && r >= g + 4 && lum > 0.26 && lum < 0.92;
        if (isLavenderOrRose) {
          upperLavenderRose.push({ r, g, b, sat: Math.max(sat, 0.52), lum });
        }
        if ((sat > 0.34 || isLavenderOrRose) && lum > 0.12 && lum < 0.92) {
          upperVivid.push({
            r,
            g,
            b,
            sat: isLavenderOrRose ? Math.max(sat, 0.52) : sat,
            lum,
          });
        }
      }
    }
  }

  const cleanPalette: Partial<ImageVisionFeatures> = {};
  if (darkTrCnt >= 8) {
    cleanPalette.colorTrunk = rgbToHex(darkTrR / darkTrCnt, darkTrG / darkTrCnt, darkTrB / darkTrCnt);
  } else if (trCnt >= 8) {
    cleanPalette.colorTrunk = rgbToHex(trR / trCnt, trG / trCnt, trB / trCnt);
  }

  const foliagePool =
    upperLavenderRose.length >= 14
      ? upperLavenderRose
      : upperVivid.length >= 16
      ? upperVivid
      : upperAll;
  if (upperLavenderRose.length >= 14) {
    cleanPalette.dominantHueCategory = 'violet';
  }
  if (foliagePool.length >= 10) {
    // Sort by luminance for deep main foliage vs bright tip/flower highlights
    const byLum = [...foliagePool].sort((a, b) => a.lum - b.lum);
    const bySat = [...foliagePool].sort((a, b) => b.sat - a.sat);
    const avgSlice = (arr: typeof foliagePool, a: number, b: number) => {
      const sub = arr.slice(a, Math.max(a + 1, b));
      const rr = sub.reduce((s, p) => s + p.r, 0) / sub.length;
      const gg = sub.reduce((s, p) => s + p.g, 0) / sub.length;
      const bb = sub.reduce((s, p) => s + p.b, 0) / sub.length;
      return rgbToHex(rr, gg, bb);
    };
    const n = byLum.length;
    cleanPalette.colorLeafMain = avgSlice(byLum, Math.floor(n * 0.15), Math.floor(n * 0.52));
    cleanPalette.colorLeafTip = avgSlice(byLum, Math.floor(n * 0.58), Math.floor(n * 0.88));
    cleanPalette.colorFlower = avgSlice(bySat, 0, Math.max(4, Math.floor(n * 0.22)));
    cleanPalette.colorAccent = avgSlice(byLum, Math.floor(n * 0.82), n);
  }

  // Refine 2D archetype using the clean Flood-Fill lower vs upper silhouette & multi-branch topology!
  const lowerAvgHw =
    slices.slice(1, Math.max(4, Math.floor(SLICE_COUNT * 0.3))).reduce((s, sl) => s + sl.hw, 0) /
    Math.max(1, Math.floor(SLICE_COUNT * 0.3) - 1);
  const upperAvgHw =
    slices.slice(Math.floor(SLICE_COUNT * 0.55), SLICE_COUNT - 1).reduce((s, sl) => s + sl.hw, 0) /
    Math.max(1, SLICE_COUNT - 1 - Math.floor(SLICE_COUNT * 0.55));
  const hasBonsaiMultiBranchSilhouette =
    (lowerAvgHw < 0.34 && upperAvgHw > lowerAvgHw * 1.25 && maxBranchColumns >= 2) ||
    (maxBranchColumns >= 3 &&
      multiIntervalSlices >= Math.max(3, Math.round(SLICE_COUNT * 0.16)) &&
      aspectRatio >= 1.1);
  const isSpikyAutumnBonsaiMisreadAsFungi =
    vf.detectedArchetype === 'fungi_umbel_colony' &&
    vf.edgeSpikiness >= 0.38 &&
    stemTopFrac >= 0.32 &&
    maxBranchColumns >= 3;

  if (
    isSpikyAutumnBonsaiMisreadAsFungi ||
    (hasBonsaiMultiBranchSilhouette &&
      (vf.detectedArchetype === 'sympodial_broadleaf_tree' ||
        vf.detectedArchetype === 'spiny_claw_rosette'))
  ) {
    cleanPalette.detectedArchetype = 'gnarled_bonsai_cloud';
  }

  return Object.assign(blueprint, {
    __debugMaskDataUrl: debugMaskDataUrl,
    __debugColorGridDataUrl: debugColorGridDataUrl,
    __foregroundCoveragePct: foregroundCoveragePct,
    __cleanPalette: cleanPalette,
  });
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

  const maxDimension = 1024;
  let targetW = img.naturalWidth || img.width || 1024;
  let targetH = img.naturalHeight || img.height || 1024;

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
  const rawVisionFeatures = extractVisionFeaturesFromCanvas(ctx, targetW, targetH);
  const rawPhotoSculpt = extractPhotoSculptBlueprint(ctx, targetW, targetH, rawVisionFeatures) as PhotoSculptBlueprint & {
    __debugMaskDataUrl?: string;
    __debugColorGridDataUrl?: string;
    __foregroundCoveragePct?: number;
    __cleanPalette?: Partial<ImageVisionFeatures>;
  };
  const {
    __debugMaskDataUrl: debugMaskDataUrl,
    __debugColorGridDataUrl: debugColorGridDataUrl,
    __foregroundCoveragePct: foregroundCoveragePct,
    __cleanPalette: cleanPalette,
    ...photoSculptData
  } = rawPhotoSculpt;

  const visionFeatures: ImageVisionFeatures = {
    ...rawVisionFeatures,
    ...(cleanPalette || {}),
  };

  // Keep local Flood-Fill scan at full 1024px HD, while sending a fast 512px JPEG to the VLM (just like before when Cloud & Ollama responded in 4s without timeouts!)
  const sendMaxDim = 512;
  let sendW = targetW;
  let sendH = targetH;
  if (sendW > sendMaxDim || sendH > sendMaxDim) {
    const sRatio = Math.min(sendMaxDim / sendW, sendMaxDim / sendH);
    sendW = Math.max(64, Math.round(sendW * sRatio));
    sendH = Math.max(64, Math.round(sendH * sRatio));
  }
  const sendCanvas = document.createElement('canvas');
  sendCanvas.width = sendW;
  sendCanvas.height = sendH;
  const sendCtx = sendCanvas.getContext('2d')!;
  sendCtx.fillStyle = '#0f172a';
  sendCtx.fillRect(0, 0, sendW, sendH);
  sendCtx.drawImage(img, 0, 0, sendW, sendH);

  const outputMime: 'image/jpeg' = 'image/jpeg';
  const compressedDataUrl = sendCanvas.toDataURL(outputMime, 0.82);
  const base64Payload = compressedDataUrl.split(',')[1] || '';

  return {
    previewDataUrl: rawDataUrl,
    imageBase64: base64Payload,
    mimeType: outputMime,
    fileName: file.name.replace(/\.[^.]+$/, ''),
    visionFeatures,
    photoSculptData,
    debugMaskDataUrl,
    debugColorGridDataUrl,
    scanResolution: `${targetW}×${targetH}`,
    foregroundCoveragePct,
  };
}

export async function designPlantFromImageWithAI(
  prepared: PreparedPlantImage,
  userNotes: string,
  aiConfigOverride?: AiProviderConfig,
  reconstructFromPhoto = true
): Promise<AiPlantDesignResult> {
  const aiConfig = aiConfigOverride || loadAiProviderConfig();
  const unifiedLibraryParts = buildPartsLibraryPayloadForAI(32);

  const enrichedVisionFeatures = {
    ...prepared.visionFeatures,
    maxBranchColumns: prepared.photoSculptData.maxBranchColumns ?? 1,
    hasMultiBranchGaps: prepared.photoSculptData.hasMultiBranchGaps ?? false,
    stemTopFrac: prepared.photoSculptData.stemTopFrac ?? 0.28,
  };

  const response = await fetch('/api/ai/design-plant', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(130000),
    body: JSON.stringify({
      imageBase64: prepared.imageBase64,
      mimeType: prepared.mimeType,
      userNotes: userNotes.trim(),
      visionFeatures: enrichedVisionFeatures,
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

  // FRONTEND FALLBACK GUARD: If Cloud returned 429/503 or Ollama timed out (providerUsed starts with "Síntesis" or "Visión Local")
  // and the running Node server returned a generic flower (Pasiflora/Anémona/Loto) for a multi-branch tree/bonsai/succulent,
  // upgrade the design right here in the frontend using the high-definition Step 1 measurements!
  const isLocalFallbackResult =
    typeof payload.providerUsed === 'string' &&
    (payload.providerUsed.includes('Síntesis Morfológica Local') ||
      payload.providerUsed.includes('Visión Local'));

  const vfNow = prepared.visionFeatures;
  const bpNow = prepared.photoSculptData;
  if (
    isLocalFallbackResult &&
    (vfNow.detectedArchetype === 'gnarled_bonsai_cloud' ||
      ((bpNow.maxBranchColumns ?? 1) >= 2 && bpNow.hasMultiBranchGaps))
  ) {
    const isSucculentCaudex =
      (bpNow.stemTopFrac ?? 0.28) <= 0.22 &&
      vfNow.upperCapIslands >= 3.0 &&
      vfNow.warmOrangeRatio < 0.14 &&
      vfNow.dominantHueCategory !== 'green';

    if (isSucculentCaudex) {
      res.identifiedName = 'Árbol Caudex Suculento de Rosetas Lavanda';
      res.scientificName = 'Graptopetalum caudiciforme';
      res.reasoningSummary =
        'Tronco caudex leñoso grueso ramificado en brazos coronados por rosetas suculentas carnosas en la paleta extraída de la imagen.';
      rawCustomEl.stemStructure = 'caudex_rosette_branch_tree';
      rawCustomEl.canopyElement = 'succulent_fleshy_rosettes';
      rawCustomEl.surfaceElement = 'fleshy_tubercles_warts';
      rawCustomEl.hangingElement = 'none';
      rawCustomEl.synthesizedTipPrimitive = 'none';
      rawCustomEl.synthesizedBasalFoliage = 'none';
      rawCustomEl.stemCount = 6;
      rawCustomEl.lobeCount = 12;
      rawCustomEl.petalOpenness = 0.76;
      aiParams.barkType = 'cork_oak_quercus';
      aiParams.tonalMode = 'velvet_spore_dust';
      aiParams.colorTrunk = vfNow.colorTrunk || '#7c624c';
      aiParams.colorLeafMain = vfNow.dominantHueCategory === 'violet' ? vfNow.colorLeafMain : '#9b7fa6';
      aiParams.colorLeafTip = vfNow.dominantHueCategory === 'violet' ? vfNow.colorLeafTip : '#cbb4d4';
      aiParams.colorFlower = vfNow.dominantHueCategory === 'violet' ? vfNow.colorFlower : '#b388c8';
      aiParams.colorAccent = vfNow.dominantHueCategory === 'violet' ? vfNow.colorAccent : '#e9d8f2';
    } else if (vfNow.dominantHueCategory === 'green' && vfNow.edgeSpikiness >= 0.34) {
      res.identifiedName = 'Bonsái de Pino / Enebro sobre Roca';
      res.scientificName = 'Juniperus chinensis bonsai';
      rawCustomEl.stemStructure = 'ebony_fluted_bonsai_arch';
      rawCustomEl.canopyElement = 'conifer_needle_brushes';
      rawCustomEl.surfaceElement = 'moss_lichen_bark';
      rawCustomEl.hangingElement = 'none';
      rawCustomEl.synthesizedTipPrimitive = 'none';
      rawCustomEl.synthesizedBasalFoliage = 'none';
      aiParams.barkType = 'gnarled_olive_burl';
      aiParams.tonalMode = 'natural_botanical';
    } else if (vfNow.warmOrangeRatio >= 0.20 && vfNow.edgeSpikiness >= 0.36) {
      res.identifiedName = 'Bonsái de Arce Japonés Otoñal (Acer palmatum)';
      res.scientificName = 'Acer palmatum autumnale';
      rawCustomEl.stemStructure = 'gnarled_bonsai';
      rawCustomEl.canopyElement = 'palmate_maple_star_leaves';
      rawCustomEl.surfaceElement = 'moss_lichen_bark';
      rawCustomEl.hangingElement = 'none';
      rawCustomEl.synthesizedTipPrimitive = 'none';
      rawCustomEl.synthesizedBasalFoliage = 'none';
      rawCustomEl.lobeCount = 7;
      aiParams.barkType = 'fissured';
      aiParams.tonalMode = 'natural_botanical';
    } else {
      res.identifiedName = 'Bonsái Escultural Acanalado Multi-Copa';
      res.scientificName = 'Ebenus tortuosa bonsai';
      rawCustomEl.stemStructure = 'ebony_fluted_bonsai_arch';
      rawCustomEl.canopyElement = 'cloud_bonsai_pads';
      rawCustomEl.surfaceElement = 'smooth_striated';
      rawCustomEl.hangingElement = 'none';
      rawCustomEl.synthesizedTipPrimitive = 'none';
      rawCustomEl.synthesizedBasalFoliage = 'none';
      aiParams.barkType = 'fissured';
      aiParams.tonalMode = 'natural_botanical';
    }
  }

  const customElId = `el_ai_${Date.now()}_${Math.floor(Math.random() * 900 + 100)}`;
  const customPresetId = `ai_species_${Date.now()}_${Math.floor(Math.random() * 900 + 100)}`;

  const baseElement: CustomBotanicalElement = upgradeSynthesizedCustomElement({
    ...DEFAULT_CUSTOM_ELEMENT,
    ...rawCustomEl,
    id: customElId,
    name: res.identifiedName || 'Elemento Botánico IA',
    scientificName: res.scientificName || 'Botanica composita sp.',
    description:
      res.reasoningSummary ||
      'Elemento 3D generado en modo híbrido: esqueleto botánico IA + envolvente 3D y mapa cromático real de la foto.',
    createdAt: Date.now(),
    photoSculptData: {
      ...prepared.photoSculptData,
      photoEnvelopeStrength: reconstructFromPhoto ? 0.78 : 0.0,
    },
  });

  // Guard against false-positive hanging filaments on non-weeping bonsai/trees/flowers/succulents
  // Check only the species name + user notes + explicit weeping/vine/aerial-root stem structures
  const nameAndNotes = `${res.identifiedName || ''} ${res.scientificName || ''} ${userNotes || ''}`.toLowerCase();
  const allowsHangingFilaments =
    prepared.visionFeatures.detectedArchetype === 'weeping_tree' ||
    prepared.visionFeatures.detectedArchetype === 'spiral_volute_vine' ||
    baseElement.stemStructure === 'weeping_willow' ||
    baseElement.stemStructure === 'strangler_root_cage' ||
    baseElement.stemStructure === 'spiral_volute_vine' ||
    baseElement.canopyElement === 'lacy_veil_spiked_mushroom' ||
    baseElement.canopyElement === 'carnivorous_nepenthes_pitchers' ||
    /llor[oó]n|weeping|wisteria|glicinia|banyan|ficus|ra[ií]ces a[eé]reas|aerial root|zarcill|tendril|musgo espa[nñ]ol|spanish moss|velo|encaje|jarra|pitcher/.test(
      nameAndNotes
    );

  const sanitizedBaseElement: CustomBotanicalElement =
    !allowsHangingFilaments &&
    baseElement.hangingElement &&
    baseElement.hangingElement !== 'none'
      ? {
          ...baseElement,
          hangingElement: 'none',
          filamentCount: 0,
        }
      : baseElement;

  // HYBRID MODE: Let the VLM control real botanical anatomy (branches, needles, petals, spines, caps)
  // while injecting photoSculptData as a 3D bounding envelope + 32×32 real pixel color map!
  // Only fall back to pure 'photo_sculpted_reconstruction' if the VLM returned a generic placeholder.
  const isGenericFallbackCanopy =
    !sanitizedBaseElement.canopyElement ||
    sanitizedBaseElement.canopyElement === 'photo_sculpted_reconstruction' ||
    sanitizedBaseElement.canopyElement === 'custom_leaf_lamina' ||
    sanitizedBaseElement.canopyElement === 'custom_flower_corolla';

  const useDirectPhotoMesh = reconstructFromPhoto && isGenericFallbackCanopy;
  const sliceCountLabel = prepared.photoSculptData.slices.length;
  const colorGridLabel = `${prepared.photoSculptData.colorGridW}×${prepared.photoSculptData.colorGridH}`;

  const createdElement: CustomBotanicalElement = reconstructFromPhoto
    ? {
        ...sanitizedBaseElement,
        canopyElement: useDirectPhotoMesh
          ? 'photo_sculpted_reconstruction'
          : sanitizedBaseElement.canopyElement,
        lobeCount: sanitizedBaseElement.lobeCount || prepared.photoSculptData.lobeCount,
        petalOpenness: sanitizedBaseElement.petalOpenness ?? 0.68,
        photoSculptData: {
          ...prepared.photoSculptData,
          photoEnvelopeStrength: 0.78,
        },
        aiNewPartsReport: useDirectPhotoMesh
          ? `Reconstrucción 3D multi-intervalo desde la foto (Flood-Fill HD + ${sliceCountLabel} cortes + ${prepared.photoSculptData.maxBranchColumns ?? 1} columnas + mapa de color ${colorGridLabel}). ${sanitizedBaseElement.aiNewPartsReport || ''}`.trim()
          : `Modo Híbrido IA + Foto: esqueleto "${sanitizedBaseElement.stemStructure}" + copa "${sanitizedBaseElement.canopyElement}" moldeados por la envolvente 3D (${sliceCountLabel} cortes, ${prepared.photoSculptData.maxBranchColumns ?? 1} columnas) y color real ${colorGridLabel} en follaje. ${sanitizedBaseElement.aiNewPartsReport || ''}`.trim(),
      }
    : sanitizedBaseElement;

  const bgPreset =
    BACKGROUND_PRESETS.find((b) => b.id === res.recommendedBg) || BACKGROUND_PRESETS[0];

  const isMossResult =
    createdElement.canopyElement === 'moss_velvet_mantle' ||
    createdElement.stemStructure === 'serpentine_mossy_deadwood';

  // Preserve true dark/rich trunk color extracted from the clean Flood-Fill foreground (e.g., #262625 black ebony)
  const hexLum = (hex?: string): number => {
    if (!hex || !/^#[0-9a-f]{6}$/i.test(hex)) return 0.5;
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    return r * 0.299 + g * 0.587 + b * 0.114;
  };
  const photoTrunkHex = prepared.visionFeatures.colorTrunk;
  const resolvedTrunkHex =
    reconstructFromPhoto &&
    photoTrunkHex &&
    hexLum(photoTrunkHex) < 0.28 &&
    hexLum(aiParams.colorTrunk) > hexLum(photoTrunkHex) + 0.12
      ? photoTrunkHex
      : aiParams.colorTrunk || photoTrunkHex || DEFAULT_TREE_PARAMS.colorTrunk;

  // Avoid pastel wash-out from generic gradient shaders (like tri_tone_xenogradient) when projecting real 32x32 photo colors
  const washedOutInHybrid =
    reconstructFromPhoto &&
    (aiParams.tonalMode === 'tri_tone_xenogradient' || aiParams.tonalMode === 'translucent_jelly');

  const mergedParams: TreeParams = {
    ...DEFAULT_TREE_PARAMS,
    ...aiParams,
    colorTrunk: resolvedTrunkHex,
    engine: 'composed_custom',
    foliageType: 'ai_custom_element',
    tonalMode:
      useDirectPhotoMesh || washedOutInHybrid
        ? 'natural_botanical'
        : aiParams.tonalMode || DEFAULT_TREE_PARAMS.tonalMode,
    barkType: isMossResult ? 'mossy_deadwood' : aiParams.barkType || DEFAULT_TREE_PARAMS.barkType,
    height: reconstructFromPhoto
      ? Number(
          Math.max(
            2.6,
            Math.min(
              6.4,
              aiParams.height
                ? aiParams.height * 0.55 + prepared.photoSculptData.aspectRatio * 3.5 * 0.45
                : prepared.photoSculptData.aspectRatio * 3.5
            )
          ).toFixed(1)
        )
      : aiParams.height || DEFAULT_TREE_PARAMS.height,
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
