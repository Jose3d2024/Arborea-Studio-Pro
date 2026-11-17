import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  Trees,
  Sliders,
  Shuffle,
  Wind,
  Flower2,
  Camera,
  Box,
  PanelLeftClose,
  PanelLeftOpen,
  Maximize2,
  Palette,
  Orbit,
  Bookmark,
  Save,
  Download,
  Upload,
  Trash2,
  Copy,
  RefreshCw,
  Check,
  HardDrive,
  Sprout,
  Grid3X3,
  Dna,
  Sparkles,
  Waves,
  ImagePlus,
  Wand2,
  X,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import {
  TreeParams,
  QualitySettings,
  MeshStats,
  FoliageType,
  BarkType,
  GrowthEngine,
  RepresentationStyle,
  CrownEnvelopeShape,
  PolygonLOD,
  CactusSubType,
  AlienArchetype,
  MossFungiArchetype,
  AquaticArchetype,
  TonalShaderMode,
  TonalPalettePreset,
  BackgroundPreset,
  EcosystemBaseType,
  SpeciesPreset,
  CustomBotanicalElement,
  StemStructureType,
  CanopyElementType,
  SurfaceElementType,
  HangingElementType,
  SynthesizedTipPrimitive,
  SynthesizedBasalFoliageType,
} from './types/botany';
import {
  SPECIES_CATALOG,
  DEFAULT_TREE_PARAMS,
  REPRESENTATION_STYLE_META,
  CROWN_SHAPE_META,
  FOLIAGE_TYPE_META,
  BARK_TYPE_META,
  ENGINE_META,
  ALIEN_ARCHETYPE_META,
  MOSS_FUNGI_ARCHETYPE_META,
  AQUATIC_ARCHETYPE_META,
  TONAL_SHADER_META,
  TONAL_PALETTE_PRESETS,
  BACKGROUND_PRESETS,
  ECOSYSTEM_BASE_META,
  STEM_STRUCTURE_META,
  CANOPY_ELEMENT_META,
  SURFACE_ELEMENT_META,
  HANGING_ELEMENT_META,
  SYNTHESIZED_TIP_META,
  SYNTHESIZED_BASAL_META,
} from './data/speciesCatalog';
import {
  TreeViewport,
  TreeViewportHandle,
  CameraPreset,
  ViewportHitPart,
} from './components/TreeViewport';
import { PartVisualThumb, PartThumbKind } from './components/BotanicalVisualThumb';
import {
  getCachedReal3DThumb,
  renderReal3DThumbnail,
} from './utils/real3DThumbRenderer';
import {
  SavedBotanicalModel,
  loadSavedModelsFromStorage,
  saveModelsToStorage,
  generateMiniaturePreviewDataUrl,
  downloadModelJson,
  downloadEntireLibraryJson,
  parseImportedModelsJson,
} from './utils/localModelLibrary';
import { synthesizeHybridSpecies } from './utils/hybridSpeciesSynthesizer';
import {
  PreparedPlantImage,
  preparePlantImageForAI,
  designPlantFromImageWithAI,
  loadSavedCustomElements,
  saveCustomElementToApp,
  loadSavedCustomSpecies,
  deleteCustomSpeciesFromApp,
  AiProviderId,
  AiProviderConfig,
  AI_PROVIDER_META,
  loadAiProviderConfig,
  saveAiProviderConfig,
  detectLocalAiModels,
  SavedPartModule,
  loadSavedPartsModules,
  saveCustomPartModule,
  deleteSavedPartModule,
  deleteCustomElementFromApp,
} from './utils/aiPlantDesigner';

type ActiveWorkspaceTab =
  | 'library'
  | 'ai_parts'
  | 'catalog'
  | 'aquatic'
  | 'moss_fungi'
  | 'xenobotany'
  | 'shaders'
  | 'architecture'
  | 'foliage'
  | 'representation';

const CATEGORIES = [
  'Todas',
  'Creadas por IA & Combinación de Elementos',
  'Mundo Acuático (Corales & Algas)',
  'Musgos, Líquenes & Hongos (Roca 3D)',
  'Xenobotánica & Extraterrestres',
  'Frondosos & Planifolios',
  'Coníferas & Aciculares',
  'Ornamentales & Floración',
  'Palmeras & Tropicales',
  'Cactáceas & Suculentas',
];

const DEFAULT_QUALITY: QualitySettings = {
  polygonLod: 'high',
  meshDensity: 1.0,
  shaderQuality: 'pbr_subsurface',
  textureQuality: 'med_512',
  viewportMode: 'lit',
  backgroundColor: '#0c131d',
  groundColor: '#101824',
  showGroundDisk: true,
  ecosystemBase: 'auto',
  ecosystemBaseScale: 1.0,
  includeBaseInExport: true,
  showGrid: true,
  showCompassSolar: true,
  showDimensions: false,
  showScaleRef: false,
  autoRotate: false,
};

interface SliderControlProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  onChange: (v: number) => void;
}

const SliderControl: React.FC<SliderControlProps> = ({
  label,
  value,
  min,
  max,
  step,
  unit = '',
  onChange,
}) => (
  <div className="flex flex-col gap-1">
    <div className="flex items-center justify-between text-[11px]">
      <span className="text-slate-300 font-medium truncate pr-2">{label}</span>
      <span className="font-mono text-emerald-400 tabular-nums shrink-0">
        {Number.isInteger(step) ? value : value.toFixed(step < 0.05 ? 2 : 1)}
        {unit}
      </span>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      className="studio-slider"
    />
  </div>
);

export default function App() {
  const [params, setParams] = useState<TreeParams>(() => ({
    ...DEFAULT_TREE_PARAMS,
    ...SPECIES_CATALOG[0].params,
    presetId: SPECIES_CATALOG[0].id,
  }));
  const [quality, setQuality] = useState<QualitySettings>(() => ({ ...DEFAULT_QUALITY }));
  const [selectedCategory, setSelectedCategory] = useState<string>('Todas');
  const [activeTab, setActiveTab] = useState<ActiveWorkspaceTab>('foliage');
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(true);
  const [stats, setStats] = useState<MeshStats>({
    vertices: 0,
    triangles: 0,
    trunkTriangles: 0,
    foliageTriangles: 0,
    crownDiameterM: 4.2,
    treeHeightM: 6.5,
    drawCalls: 2,
    generationTimeMs: 0,
  });

  // Local Model Library State
  const [savedModels, setSavedModels] = useState<SavedBotanicalModel[]>(() =>
    loadSavedModelsFromStorage()
  );
  const [activeSavedModelId, setActiveSavedModelId] = useState<string | null>(null);
  const [customModelName, setCustomModelName] = useState<string>('');
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [livePresetThumbs, setLivePresetThumbs] = useState<Record<string, string>>({});
  const [activeHybridInfo, setActiveHybridInfo] = useState<{
    name: string;
    lineage: string;
  } | null>(null);

  // AI Image-to-3D Botanical Designer State & Local AI Provider Configuration (Ollama, LM Studio, etc.)
  const [aiModalOpen, setAiModalOpen] = useState<boolean>(false);
  const [aiConfigTabOpen, setAiConfigTabOpen] = useState<boolean>(false);
  const [aiProviderConfig, setAiProviderConfig] = useState<AiProviderConfig>(() =>
    loadAiProviderConfig()
  );
  const [detectedLocalModels, setDetectedLocalModels] = useState<string[]>([]);
  const [aiDetectStatus, setAiDetectStatus] = useState<{
    loading: boolean;
    ok?: boolean;
    message?: string;
  }>({ loading: false });
  const [aiPreparedImage, setAiPreparedImage] = useState<PreparedPlantImage | null>(null);
  const [aiUserNotes, setAiUserNotes] = useState<string>('');
  const [aiLoading, setAiLoading] = useState<boolean>(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [activeAiDesignInfo, setActiveAiDesignInfo] = useState<{
    name: string;
    scientificName: string;
    summary: string;
    previewDataUrl: string;
    providerUsed?: string;
  } | null>(null);

  // Permanent AI-created custom elements & custom species saved in the app
  const [customElements, setCustomElements] = useState<CustomBotanicalElement[]>(() =>
    loadSavedCustomElements()
  );
  const [savedPartModules, setSavedPartModules] = useState<SavedPartModule[]>(() =>
    loadSavedPartsModules()
  );
  const [newPartNameInput, setNewPartNameInput] = useState<string>('');
  const [activePartPicker, setActivePartPicker] = useState<PartThumbKind | null>(null);
  const [customSpeciesList, setCustomSpeciesList] = useState<SpeciesPreset[]>(() =>
    loadSavedCustomSpecies()
  );
  const [hiddenSpeciesIds, setHiddenSpeciesIds] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem('arborea_hidden_species_v1');
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  // Merge user's saved AI species into the full catalog, filtering out deleted/hidden ones
  const allCatalogSpecies = React.useMemo(() => {
    const hiddenSet = new Set(hiddenSpeciesIds);
    const existingIds = new Set(SPECIES_CATALOG.map((s) => s.id));
    const uniqueCustom = customSpeciesList.filter((s) => !existingIds.has(s.id));
    return [...uniqueCustom, ...SPECIES_CATALOG].filter((s) => !hiddenSet.has(s.id));
  }, [customSpeciesList, hiddenSpeciesIds]);

  // Progressive True 3D Thumbnail Renderer for every Species Card in Catalog / Aquatic / Moss / Xeno
  useEffect(() => {
    let cancelled = false;

    // 1. Hydrate any already cached 3D thumbnails immediately
    const preCached: Record<string, string> = {};
    allCatalogSpecies.forEach((sp) => {
      const hit = getCachedReal3DThumb(`species_${sp.id}`);
      if (hit) preCached[sp.id] = hit;
    });
    if (Object.keys(preCached).length > 0) {
      setLivePresetThumbs((prev) => ({ ...preCached, ...prev }));
    }

    // 2. Prioritize visible tab species first, then render the rest smoothly in background
    const priorityFn = (sp: SpeciesPreset) => {
      if (activeTab === 'aquatic' && sp.params.engine === 'aquatic_coral_algae') return 0;
      if (activeTab === 'moss_fungi' && sp.params.engine === 'moss_fungi_rock') return 0;
      if (activeTab === 'xenobotany' && sp.params.engine === 'alien_xenobotany') return 0;
      if (activeTab === 'catalog' && (selectedCategory === 'Todas' || sp.category === selectedCategory)) return 0;
      return 1;
    };

    const queue = allCatalogSpecies
      .filter((sp) => !getCachedReal3DThumb(`species_${sp.id}`))
      .sort((a, b) => priorityFn(a) - priorityFn(b));

    let idx = 0;
    const step = () => {
      if (cancelled || idx >= queue.length) return;
      const sp = queue[idx++];
      const isAquatic = sp.category === 'Mundo Acuático (Corales & Algas)';
      const isAlien = sp.category === 'Xenobotánica & Extraterrestres';
      const isMoss = sp.category === 'Musgos, Líquenes & Hongos (Roca 3D)';
      const bgHex = isAquatic ? '#062c38' : isAlien ? '#120d24' : isMoss ? '#0c1914' : '#0a111a';
      const url = renderReal3DThumbnail(
        `species_${sp.id}`,
        { ...DEFAULT_TREE_PARAMS, ...sp.params },
        bgHex,
        'full'
      );
      if (url && !cancelled) {
        setLivePresetThumbs((prev) => ({ ...prev, [sp.id]: url }));
      }
      if (!cancelled && idx < queue.length) {
        window.setTimeout(step, 35);
      }
    };

    const startId = window.setTimeout(step, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(startId);
    };
  }, [allCatalogSpecies, activeTab, selectedCategory]);

  const viewportRef = useRef<TreeViewportHandle | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const aiFileInputRef = useRef<HTMLInputElement | null>(null);
  const trunkSectionRef = useRef<HTMLDetailsElement | null>(null);
  const canopySectionRef = useRef<HTMLDetailsElement | null>(null);
  const rootsSectionRef = useRef<HTMLDetailsElement | null>(null);
  const baseSectionRef = useRef<HTMLDivElement | null>(null);
  const [highlightedPart, setHighlightedPart] = useState<ViewportHitPart | null>(null);

  const currentSpecies =
    allCatalogSpecies.find((s) => s.id === params.presetId) || allCatalogSpecies[0] || SPECIES_CATALOG[0];

  const handleRemoveSpecies = useCallback(
    (sp: SpeciesPreset, e: React.MouseEvent) => {
      e.stopPropagation();
      const isCustom = customSpeciesList.some((c) => c.id === sp.id);
      if (isCustom) {
        const nextCustom = deleteCustomSpeciesFromApp(sp.id);
        setCustomSpeciesList(nextCustom);
      } else {
        setHiddenSpeciesIds((prev) => {
          if (prev.includes(sp.id)) return prev;
          const next = [...prev, sp.id];
          try {
            localStorage.setItem('arborea_hidden_species_v1', JSON.stringify(next));
          } catch {
            // ignore storage errors
          }
          return next;
        });
      }
      if (params.presetId === sp.id) {
        const fallback = allCatalogSpecies.find((s) => s.id !== sp.id) || SPECIES_CATALOG[0];
        if (fallback) {
          setParams((prev) => ({
            ...DEFAULT_TREE_PARAMS,
            ...fallback.params,
            presetId: fallback.id,
            sunElevation: prev.sunElevation,
            sunAzimuth: prev.sunAzimuth,
          }));
        }
      }
      setSaveNotice(`Especie "${sp.name}" eliminada`);
      window.setTimeout(() => setSaveNotice(null), 2200);
    },
    [customSpeciesList, allCatalogSpecies, params.presetId]
  );

  // Ensure the currently viewed preset has a clean real-3D thumbnail if not yet rendered offscreen
  useEffect(() => {
    if (!params.presetId) return;
    const cached = getCachedReal3DThumb(`species_${params.presetId}`);
    if (cached) return;
    const sp = allCatalogSpecies.find((s) => s.id === params.presetId);
    if (!sp) return;
    const isAquatic = sp.category === 'Mundo Acuático (Corales & Algas)';
    const isAlien = sp.category === 'Xenobotánica & Extraterrestres';
    const isMoss = sp.category === 'Musgos, Líquenes & Hongos (Roca 3D)';
    const bgHex = isAquatic ? '#062c38' : isAlien ? '#120d24' : isMoss ? '#0c1914' : '#0a111a';
    const url = renderReal3DThumbnail(
      `species_${sp.id}`,
      { ...DEFAULT_TREE_PARAMS, ...sp.params },
      bgHex,
      'full'
    );
    if (url) {
      setLivePresetThumbs((prev) => ({ ...prev, [sp.id]: url }));
    }
  }, [params.presetId, allCatalogSpecies]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLSelectElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;
      if (e.key === 'h' || e.key === 'H') {
        setSidebarOpen((prev) => !prev);
      } else if (e.key === 'f' || e.key === 'F') {
        viewportRef.current?.setCameraPreset('overview');
      } else if (e.key === 'g' || e.key === 'G') {
        setQuality((prev) => ({ ...prev, showGrid: !prev.showGrid }));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const showTempNotice = useCallback((msg: string) => {
    setSaveNotice(msg);
    window.setTimeout(() => {
      setSaveNotice((prev) => (prev === msg ? null : prev));
    }, 2600);
  }, []);

  const handleViewportPartClick = useCallback(
    (part: ViewportHitPart) => {
      setSidebarOpen(true);
      setHighlightedPart(part);
      window.setTimeout(() => {
        setHighlightedPart((prev) => (prev === part ? null : prev));
      }, 3200);

      if (part === 'ecosystem_base') {
        setActiveTab('shaders');
        showTempNotice('Base del Ecosistema seleccionada en el visor');
        window.setTimeout(() => {
          baseSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 60);
        return;
      }

      setActiveTab('foliage');
      const labels: Record<Exclude<ViewportHitPart, 'ecosystem_base'>, string> = {
        trunk: 'Tronco / Tallos / Roca',
        canopy: 'Copa / Flores / Hojas',
        roots: 'Raíces / Filamentos / Espinas',
      };
      showTempNotice(`Parte seleccionada: ${labels[part]}`);

      window.setTimeout(() => {
        const targetRef =
          part === 'canopy'
            ? canopySectionRef.current || trunkSectionRef.current
            : part === 'roots'
            ? rootsSectionRef.current || trunkSectionRef.current
            : trunkSectionRef.current;
        if (targetRef) {
          targetRef.open = true;
          targetRef.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }, 60);
    },
    [showTempNotice]
  );

  const updateParam = useCallback(<K extends keyof TreeParams>(key: K, value: TreeParams[K]) => {
    setParams((prev) => ({ ...prev, [key]: value }));
  }, []);

  const updateQuality = useCallback(
    <K extends keyof QualitySettings>(key: K, value: QualitySettings[K]) => {
      setQuality((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

  const selectSpeciesPreset = (presetId: string) => {
    const found = allCatalogSpecies.find((s) => s.id === presetId);
    if (found) {
      setActiveSavedModelId(null);
      setActiveHybridInfo(null);
      setActiveAiDesignInfo(null);
      setCustomModelName(found.name.split(' (')[0]);
      setParams((prev) => ({
        ...DEFAULT_TREE_PARAMS,
        ...found.params,
        presetId: found.id,
        seed: prev.seed,
        sunElevation: prev.sunElevation,
        sunAzimuth: prev.sunAzimuth,
        representationStyle: found.params.representationStyle || 'botanical_leaves',
      }));
    }
  };

  // Capture live 3D thumbnail and save as a new model in Local Library
  const handleSaveNewLocalModel = useCallback(() => {
    const capturedThumb =
      viewportRef.current?.captureThumbnail(280, 190) ||
      generateMiniaturePreviewDataUrl(params, quality.backgroundColor, quality.groundColor);

    const baseName =
      customModelName.trim() ||
      (activeAiDesignInfo
        ? activeAiDesignInfo.name
        : activeHybridInfo
        ? activeHybridInfo.name
        : `${currentSpecies.name.split(' (')[0]} #${params.seed}`);

    const newEntry: SavedBotanicalModel = {
      id: `local_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      name: baseName,
      scientificName: activeAiDesignInfo
        ? activeAiDesignInfo.scientificName
        : activeHybridInfo
        ? activeHybridInfo.lineage
        : currentSpecies.scientificName,
      category: activeAiDesignInfo
        ? 'Diseño IA desde Imagen'
        : activeHybridInfo
        ? 'Híbrido Generativo'
        : currentSpecies.category,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      thumbnailDataUrl: capturedThumb,
      params: { ...params },
      backgroundColor: quality.backgroundColor,
      groundColor: quality.groundColor,
      stats: {
        triangles: stats.triangles,
        treeHeightM: stats.treeHeightM,
        crownDiameterM: stats.crownDiameterM,
      },
    };

    setSavedModels((prev) => {
      const next = [newEntry, ...prev];
      saveModelsToStorage(next);
      return next;
    });
    setActiveSavedModelId(newEntry.id);
    setCustomModelName('');
    showTempNotice(`Guardado "${newEntry.name}" en Biblioteca Local`);
  }, [
    customModelName,
    activeAiDesignInfo,
    activeHybridInfo,
    currentSpecies,
    params,
    quality.backgroundColor,
    quality.groundColor,
    stats,
    showTempNotice,
  ]);

  // Overwrite an existing saved model with current 3D params and fresh WebGL thumbnail
  const handleUpdateSavedModel = useCallback(
    (targetId: string) => {
      const capturedThumb =
        viewportRef.current?.captureThumbnail(280, 190) ||
        generateMiniaturePreviewDataUrl(params, quality.backgroundColor, quality.groundColor);

      setSavedModels((prev) => {
        const next = prev.map((m) => {
          if (m.id !== targetId) return m;
          return {
            ...m,
            name: customModelName.trim() ? customModelName.trim() : m.name,
            updatedAt: Date.now(),
            thumbnailDataUrl: capturedThumb,
            params: { ...params },
            backgroundColor: quality.backgroundColor,
            groundColor: quality.groundColor,
            stats: {
              triangles: stats.triangles,
              treeHeightM: stats.treeHeightM,
              crownDiameterM: stats.crownDiameterM,
            },
          };
        });
        saveModelsToStorage(next);
        return next;
      });
      showTempNotice('Modelo y miniatura 3D actualizados en local');
    },
    [customModelName, params, quality.backgroundColor, quality.groundColor, stats, showTempNotice]
  );

  // Load a saved model from Local Library into the 3D Studio
  const handleLoadSavedModel = useCallback(
    (model: SavedBotanicalModel) => {
      setParams({ ...DEFAULT_TREE_PARAMS, ...model.params });
      setQuality((prev) => ({
        ...prev,
        backgroundColor: model.backgroundColor || prev.backgroundColor,
        groundColor: model.groundColor || prev.groundColor,
      }));
      setActiveSavedModelId(model.id);
      setActiveHybridInfo(null);
      setActiveAiDesignInfo(null);
      setCustomModelName(model.name);
      showTempNotice(`Cargado: ${model.name}`);
    },
    [showTempNotice]
  );

  // Duplicate a saved model
  const handleDuplicateSavedModel = useCallback(
    (model: SavedBotanicalModel, e: React.MouseEvent) => {
      e.stopPropagation();
      const copy: SavedBotanicalModel = {
        ...model,
        id: `local_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        name: `${model.name} (Copia)`,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      setSavedModels((prev) => {
        const next = [copy, ...prev];
        saveModelsToStorage(next);
        return next;
      });
      showTempNotice(`Duplicado: ${copy.name}`);
    },
    [showTempNotice]
  );

  // Delete a saved model from Local Library
  const handleDeleteSavedModel = useCallback(
    (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      setSavedModels((prev) => {
        const next = prev.filter((m) => m.id !== id);
        saveModelsToStorage(next);
        return next;
      });
      if (activeSavedModelId === id) {
        setActiveSavedModelId(null);
      }
      showTempNotice('Modelo eliminado de la biblioteca local');
    },
    [activeSavedModelId, showTempNotice]
  );

  // Import .json / .arborea.json models from local disk
  const handleImportFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result || '');
        const imported = parseImportedModelsJson(text);
        if (imported.length > 0) {
          setSavedModels((prev) => {
            const next = [...imported, ...prev];
            saveModelsToStorage(next);
            return next;
          });
          handleLoadSavedModel(imported[0]);
          showTempNotice(`${imported.length} modelo(s) importado(s) desde disco`);
        }
      } catch (err) {
        console.warn('Error importing JSON model library:', err);
        showTempNotice('Archivo JSON no válido');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const applyTonalPalette = (pal: TonalPalettePreset) => {
    setParams((prev) => ({
      ...prev,
      tonalMode: pal.tonalMode,
      colorTrunk: pal.colorTrunk,
      colorLeafMain: pal.colorLeafMain,
      colorLeafTip: pal.colorLeafTip,
      colorFlower: pal.colorFlower,
      colorAccent: pal.colorAccent,
      emissiveIntensity: pal.emissiveIntensity,
      iridescenceAmount: pal.iridescenceAmount,
      patternScale: pal.patternScale,
      patternContrast: pal.patternContrast,
      wetnessGloss: pal.wetnessGloss,
      hueShift: 0,
    }));
  };

  const applyBackgroundPreset = (bgPreset: BackgroundPreset) => {
    setQuality((prev) => ({
      ...prev,
      backgroundColor: bgPreset.bg,
      groundColor: bgPreset.ground,
    }));
  };

  const randomizeSeed = () => {
    updateParam('seed', Math.floor(1000 + Math.random() * 9000));
  };

  const generateHybridVegetation = () => {
    const hybrid = synthesizeHybridSpecies(params.presetId);
    setActiveSavedModelId(null);
    setActiveAiDesignInfo(null);
    setActiveHybridInfo({ name: hybrid.hybridName, lineage: hybrid.lineageSummary });
    setCustomModelName(hybrid.hybridName);
    setParams((prev) => ({
      ...hybrid.params,
      presetId: `hybrid_${hybrid.params.seed}_${Date.now()}`,
      sunElevation: prev.sunElevation,
      sunAzimuth: prev.sunAzimuth,
      representationStyle: hybrid.params.representationStyle || 'botanical_leaves',
    }));
    showTempNotice(`Nuevo híbrido: ${hybrid.hybridName}`);
  };

  const handleSelectAiImageFile = async (file: File | undefined | null) => {
    if (!file) return;
    setAiError(null);
    try {
      const prepared = await preparePlantImageForAI(file);
      setAiPreparedImage(prepared);
    } catch (err: any) {
      setAiError(err?.message || 'No se pudo procesar la imagen seleccionada.');
    }
  };

  const updateAiConfig = useCallback((patch: Partial<AiProviderConfig>) => {
    setAiProviderConfig((prev) => {
      const next = { ...prev, ...patch };
      saveAiProviderConfig(next);
      return next;
    });
  }, []);

  const handleSelectAiProvider = useCallback((provider: AiProviderId) => {
    const meta = AI_PROVIDER_META[provider];
    setAiProviderConfig((prev) => {
      const next: AiProviderConfig = {
        ...prev,
        provider,
        endpointUrl: meta.defaultEndpoint || prev.endpointUrl,
        modelName: meta.defaultModel || prev.modelName,
      };
      saveAiProviderConfig(next);
      return next;
    });
    setDetectedLocalModels([]);
    setAiDetectStatus({ loading: false });
  }, []);

  const handleDetectLocalModels = useCallback(async () => {
    setAiDetectStatus({ loading: true, message: 'Buscando modelos locales...' });
    const res = await detectLocalAiModels(aiProviderConfig);
    setDetectedLocalModels(res.models);
    if (res.ok && res.models.length > 0 && !res.models.includes(aiProviderConfig.modelName)) {
      updateAiConfig({ modelName: res.models[0] });
    }
    setAiDetectStatus({
      loading: false,
      ok: res.ok,
      message: res.message,
    });
  }, [aiProviderConfig, updateAiConfig]);

  const handleRunAiPlantDesign = async () => {
    if (!aiPreparedImage || aiLoading) return;
    setAiLoading(true);
    setAiError(null);
    try {
      const designed = await designPlantFromImageWithAI(
        aiPreparedImage,
        aiUserNotes,
        aiProviderConfig
      );
      // Refresh permanent custom elements, species & auto-saved modular parts lists
      setCustomElements(loadSavedCustomElements());
      setCustomSpeciesList(loadSavedCustomSpecies());
      setSavedPartModules(loadSavedPartsModules());

      setActiveSavedModelId(null);
      setActiveHybridInfo(null);
      setActiveAiDesignInfo({
        name: designed.identifiedName,
        scientificName: designed.scientificName,
        summary: designed.reasoningSummary,
        previewDataUrl: aiPreparedImage.previewDataUrl,
        providerUsed: designed.providerUsed,
      });
      setCustomModelName(designed.identifiedName);
      setParams((prev) => ({
        ...designed.params,
        sunElevation: prev.sunElevation,
        sunAzimuth: prev.sunAzimuth,
      }));
      setQuality((prev) => ({
        ...prev,
        ecosystemBase: designed.recommendedBase,
        showGroundDisk: true,
        backgroundColor: designed.backgroundHex,
        groundColor: designed.groundHex,
      }));
      setAiModalOpen(false);
      setActiveTab('foliage');
      showTempNotice(
        `Elemento "${designed.identifiedName}" creado con ${designed.providerUsed || 'IA'}`
      );
      window.setTimeout(() => {
        viewportRef.current?.setCameraPreset('overview');
        // Also capture the live 3D thumbnail and save to Local Library automatically
        const thumb =
          viewportRef.current?.captureThumbnail(280, 190) ||
          aiPreparedImage.previewDataUrl;
        const autoSavedEntry: SavedBotanicalModel = {
          id: `local_ai_${Date.now()}`,
          name: designed.identifiedName,
          scientificName: designed.scientificName,
          category: 'Creadas por IA & Combinación de Elementos',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          thumbnailDataUrl: thumb,
          params: { ...designed.params },
          backgroundColor: designed.backgroundHex,
          groundColor: designed.groundHex,
          stats: {
            triangles: stats.triangles,
            treeHeightM: stats.treeHeightM,
            crownDiameterM: stats.crownDiameterM,
          },
        };
        setSavedModels((prev) => {
          const next = [autoSavedEntry, ...prev];
          saveModelsToStorage(next);
          return next;
        });
      }, 220);
    } catch (err: any) {
      setAiError(
        err?.message || 'Error al analizar la imagen con IA. Inténtalo de nuevo.'
      );
    } finally {
      setAiLoading(false);
    }
  };

  const inferDefaultCustomElement = useCallback((p: TreeParams): CustomBotanicalElement => {
    if (p.customElement) return p.customElement;
    const stemStructure: StemStructureType =
      p.engine === 'weeping'
        ? 'weeping_willow'
        : p.engine === 'palm'
        ? 'herbaceous_curved_stalk'
        : p.engine === 'bamboo'
        ? 'segmented_bamboo_equisetum'
        : p.engine === 'rosette'
        ? 'rosette_cluster'
        : p.engine === 'cactus'
        ? 'thorny_horn_crown'
        : 'sympodial_tree';
    const canopyElement: CanopyElementType =
      p.engine === 'palm'
        ? 'pinnate_fern_palm_fronds'
        : p.engine === 'rosette'
        ? 'succulent_fleshy_rosettes'
        : p.foliageType === 'blossom_clusters'
        ? 'custom_flower_corolla'
        : p.foliageType === 'alien_umbrella_caps'
        ? 'custom_fungi_cap'
        : p.foliageType === 'fronds_pinnate' || p.foliageType === 'fronds_palmate' || p.foliageType === 'fronds_fern'
        ? 'pinnate_fern_palm_fronds'
        : 'custom_leaf_lamina';
    const hangingElement: HangingElementType =
      p.engine === 'weeping' || p.foliageType === 'weeping_strands' ? 'weeping_filaments' : 'none';
    return {
      id: `elem_custom_${Date.now()}`,
      name: `Elemento Modular #${p.seed}`,
      scientificName: 'Botanica modularis sp.',
      description: 'Combinación modular de tallo, copa, superficie y filamentos.',
      createdAt: Date.now(),
      stemStructure,
      canopyElement,
      surfaceElement: 'smooth_striated',
      hangingElement,
      lobeCount: 6,
      cupDepth: 0.45,
      spiralTurns: 1.25,
      spiralArms: Math.max(2, p.branchCount || 5),
      stemCount: Math.max(2, p.branchCount || 5),
      trunkBentS: 0.25,
      branchSpread: 0.65,
      branchDroop: p.engine === 'weeping' ? 0.55 : 0.15,
      capDomeHeight: 0.56,
      capSpotDensity: 0.45,
      gillCount: 20,
      petalOpenness: 0.4,
      leafSerration: 0.35,
      thornDensity: p.engine === 'cactus' ? 0.75 : 0.1,
      thornLength: 0.9,
      filamentCount: hangingElement === 'none' ? 8 : 24,
      filamentLength: 1.2,
      padLayers: 6,
    };
  }, []);

  const updateCustomPart = useCallback(
    (patch: Partial<CustomBotanicalElement>) => {
      setParams((prev) => {
        const base = inferDefaultCustomElement(prev);
        return {
          ...prev,
          engine: 'composed_custom',
          foliageType: 'ai_custom_element',
          customElement: {
            ...base,
            ...patch,
          },
        };
      });
    },
    [inferDefaultCustomElement]
  );

  const filteredSpecies =
    selectedCategory === 'Todas'
      ? allCatalogSpecies
      : allCatalogSpecies.filter((s) => s.category === selectedCategory);

  const mossFungiPresets = allCatalogSpecies.filter(
    (s) => s.category === 'Musgos, Líquenes & Hongos (Roca 3D)'
  );

  const aquaticPresets = allCatalogSpecies.filter(
    (s) => s.category === 'Mundo Acuático (Corales & Algas)'
  );

  const underwaterBgPresets = BACKGROUND_PRESETS.filter((b) =>
    ['coral_reef_turquoise', 'kelp_emerald_depth', 'abyssal_trench'].includes(b.id)
  );

  const tonalModeNow: TonalShaderMode = params.tonalMode || 'natural_botanical';

  return (
    <div className="w-screen h-screen overflow-hidden bg-[#0a0f16] text-slate-100 flex flex-col select-none">
      {/* Hidden File Input for Local Disk JSON Import */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,.arborea.json"
        onChange={handleImportFileChange}
        className="hidden"
      />

      {/* Hidden File Input for AI Plant Image Upload */}
      <input
        ref={aiFileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) {
            handleSelectAiImageFile(f);
            setAiModalOpen(true);
          }
          e.target.value = '';
        }}
        className="hidden"
      />

      {/* Single-Row Ergonomic Top Bar: Organized with Dropdown Menus to Maximize 3D Viewport Space */}
      <header className="h-11 shrink-0 bg-[#0d141d] border-b border-slate-800/80 px-3 flex items-center justify-between gap-2 z-30">
        {/* Left Zone: Brand + Panel Toggle + Active Species Selector + Seed */}
        <div className="flex items-center gap-2 min-w-0 shrink-0">
          <span className="font-bold tracking-tight text-xs sm:text-sm text-emerald-400 whitespace-nowrap">
            Arborea Studio Pro
          </span>

          <button
            onClick={() => setSidebarOpen((prev) => !prev)}
            className="px-2 py-1 rounded bg-slate-800/90 hover:bg-slate-700 text-emerald-400 text-[11px] font-medium flex items-center gap-1 cursor-pointer border border-slate-700/80 whitespace-nowrap shrink-0"
            title="Mostrar / Ocultar Panel Lateral (Tecla H)"
          >
            {sidebarOpen ? (
              <>
                <PanelLeftClose className="w-3.5 h-3.5" /> Panel
              </>
            ) : (
              <>
                <PanelLeftOpen className="w-3.5 h-3.5" /> Inspector
              </>
            )}
          </button>

          <button
            onClick={() => {
              setSidebarOpen(true);
              setActiveTab('catalog');
            }}
            title="Abrir Catálogo visual con miniaturas 3D de todas las especies"
            className="max-w-[210px] px-2.5 py-1 rounded bg-[#141e2d] hover:bg-slate-800 border border-slate-700/80 hover:border-emerald-500/50 text-xs font-medium text-slate-100 flex items-center gap-1.5 cursor-pointer truncate"
          >
            <Trees className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span className="truncate">
              {activeAiDesignInfo
                ? activeAiDesignInfo.name
                : activeHybridInfo
                ? activeHybridInfo.name
                : currentSpecies.name}
            </span>
          </button>

          <button
            onClick={randomizeSeed}
            className="px-2 py-1 rounded bg-slate-800/90 hover:bg-slate-700 text-emerald-300 border border-slate-700/80 font-mono text-[11px] flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
            title="Nueva semilla aleatoria dentro de esta especie"
          >
            <Shuffle className="w-3 h-3" /> #{params.seed}
          </button>
        </div>

        {/* Center Zone: Clean Dropdown Menus (Cámara/Vista, Entorno/Base/Calidad) + IA & Híbrido */}
        <div className="flex items-center gap-1.5 text-[11px] shrink-0">
          <button
            onClick={() => viewportRef.current?.setCameraPreset('overview')}
            className="px-2 py-1 rounded bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/25 font-medium flex items-center gap-1 cursor-pointer whitespace-nowrap"
            title="Encuadrar modelo completo (Tecla F)"
          >
            <Maximize2 className="w-3 h-3" /> Encuadrar
          </button>

          {/* Dropdown 1: Vista, Cámara & Ayudas Visuales */}
          <details className="relative group">
            <summary className="list-none px-2.5 py-1 rounded bg-[#141e2d] hover:bg-slate-800 border border-slate-700/80 text-slate-200 font-medium flex items-center gap-1.5 cursor-pointer whitespace-nowrap">
              <Grid3X3 className="w-3.5 h-3.5 text-emerald-400" />
              <span>Vista & Cámara</span>
              <span className="text-[9px] text-slate-400">▾</span>
            </summary>
            <div className="absolute left-0 mt-1.5 w-60 bg-[#0f1722] border border-slate-700 rounded-lg shadow-2xl p-2.5 z-50 space-y-2.5">
              <div className="space-y-1">
                <span className="text-[10px] font-semibold text-slate-400 block">
                  Vistas de Cámara 3D
                </span>
                <div className="grid grid-cols-2 gap-1">
                  {(
                    [
                      { id: 'overview', label: 'Perspectiva (F)' },
                      { id: 'front', label: 'Alzado Frontal' },
                      { id: 'top', label: 'Vista en Planta' },
                      { id: 'trunk', label: 'Zoom Base/Roca' },
                    ] as { id: CameraPreset; label: string }[]
                  ).map((cam) => (
                    <button
                      key={cam.id}
                      onClick={() => viewportRef.current?.setCameraPreset(cam.id)}
                      className="px-2 py-1 rounded bg-[#162232] hover:bg-emerald-500/20 text-slate-200 hover:text-emerald-300 border border-slate-700/70 text-left text-[11px] cursor-pointer"
                    >
                      {cam.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5 pt-2 border-t border-slate-800">
                <span className="text-[10px] font-semibold text-slate-400 block">
                  Capas & Ayudas del Visor
                </span>
                <label className="flex items-center justify-between text-xs text-slate-200 cursor-pointer py-0.5">
                  <span>Rejilla del Suelo (Tecla G)</span>
                  <input
                    type="checkbox"
                    checked={quality.showGrid}
                    onChange={(e) => updateQuality('showGrid', e.target.checked)}
                    className="accent-emerald-500 w-3.5 h-3.5"
                  />
                </label>
                <label className="flex items-center justify-between text-xs text-slate-200 cursor-pointer py-0.5">
                  <span>Mostrar Raíces 3D</span>
                  <input
                    type="checkbox"
                    checked={params.showRoots}
                    onChange={(e) => updateParam('showRoots', e.target.checked)}
                    className="accent-emerald-500 w-3.5 h-3.5"
                  />
                </label>
                <label className="flex items-center justify-between text-xs text-slate-200 cursor-pointer py-0.5">
                  <span>Malla de Alambre (Wireframe)</span>
                  <input
                    type="checkbox"
                    checked={quality.viewportMode === 'wireframe'}
                    onChange={(e) =>
                      updateQuality('viewportMode', e.target.checked ? 'wireframe' : 'lit')
                    }
                    className="accent-emerald-500 w-3.5 h-3.5"
                  />
                </label>
                <label className="flex items-center justify-between text-xs text-slate-200 cursor-pointer py-0.5">
                  <span>Rosa de los Vientos y Sol</span>
                  <input
                    type="checkbox"
                    checked={quality.showCompassSolar}
                    onChange={(e) => updateQuality('showCompassSolar', e.target.checked)}
                    className="accent-emerald-500 w-3.5 h-3.5"
                  />
                </label>
                <label className="flex items-center justify-between text-xs text-slate-200 cursor-pointer py-0.5">
                  <span>Cotas de Altura y Diámetro</span>
                  <input
                    type="checkbox"
                    checked={quality.showDimensions}
                    onChange={(e) => updateQuality('showDimensions', e.target.checked)}
                    className="accent-emerald-500 w-3.5 h-3.5"
                  />
                </label>
                <label className="flex items-center justify-between text-xs text-slate-200 cursor-pointer py-0.5">
                  <span>Animación de Viento</span>
                  <input
                    type="checkbox"
                    checked={params.windEnabled}
                    onChange={(e) => updateParam('windEnabled', e.target.checked)}
                    className="accent-emerald-500 w-3.5 h-3.5"
                  />
                </label>
              </div>
            </div>
          </details>

          {/* Dropdown 2: Entorno, Base 3D, Estilo & Densidad de Vértices */}
          <details className="relative group">
            <summary className="list-none px-2.5 py-1 rounded bg-[#141e2d] hover:bg-slate-800 border border-slate-700/80 text-slate-200 font-medium flex items-center gap-1.5 cursor-pointer whitespace-nowrap">
              <Palette className="w-3.5 h-3.5 text-cyan-400" />
              <span>Entorno & Calidad</span>
              <span className="text-[9px] text-slate-400">▾</span>
            </summary>
            <div className="absolute left-0 mt-1.5 w-72 bg-[#0f1722] border border-slate-700 rounded-lg shadow-2xl p-3 z-50 space-y-2.5">
              <div className="space-y-1">
                <span className="text-[10px] font-semibold text-cyan-300 block">
                  Base de Terreno / Ecosistema Integrado
                </span>
                <select
                  value={quality.ecosystemBase}
                  onChange={(e) =>
                    updateQuality('ecosystemBase', e.target.value as EcosystemBaseType)
                  }
                  className="w-full bg-[#162232] border border-cyan-500/40 rounded px-2 py-1 text-xs text-cyan-200"
                >
                  {(Object.keys(ECOSYSTEM_BASE_META) as EcosystemBaseType[]).map((eb) => (
                    <option key={eb} value={eb}>
                      Base: {ECOSYSTEM_BASE_META[eb].label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <span className="text-[10px] font-semibold text-slate-300 block">
                  Fondo del Estudio 3D
                </span>
                <div className="flex items-center gap-1.5">
                  <input
                    type="color"
                    value={quality.backgroundColor}
                    onChange={(e) => updateQuality('backgroundColor', e.target.value)}
                    className="w-7 h-6 rounded cursor-pointer bg-transparent border-0 shrink-0"
                  />
                  <select
                    value={
                      BACKGROUND_PRESETS.find(
                        (b) => b.bg.toLowerCase() === quality.backgroundColor.toLowerCase()
                      )?.id || 'custom'
                    }
                    onChange={(e) => {
                      const found = BACKGROUND_PRESETS.find((b) => b.id === e.target.value);
                      if (found) applyBackgroundPreset(found);
                    }}
                    className="flex-1 bg-[#162232] border border-slate-700 rounded px-2 py-1 text-xs text-slate-200"
                  >
                    <option value="custom" disabled>
                      Color Personalizado...
                    </option>
                    {BACKGROUND_PRESETS.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <span className="text-[10px] font-semibold text-emerald-300 block">
                  Estilo de Geometría & Shader
                </span>
                <select
                  value={params.representationStyle}
                  onChange={(e) =>
                    updateParam('representationStyle', e.target.value as RepresentationStyle)
                  }
                  className="w-full bg-[#162232] border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 mb-1"
                >
                  {(Object.keys(REPRESENTATION_STYLE_META) as RepresentationStyle[]).map((st) => (
                    <option key={st} value={st}>
                      Estilo: {REPRESENTATION_STYLE_META[st].short}
                    </option>
                  ))}
                </select>
                <select
                  value={tonalModeNow}
                  onChange={(e) =>
                    updateParam('tonalMode', e.target.value as TonalShaderMode)
                  }
                  className="w-full bg-[#162232] border border-slate-700 rounded px-2 py-1 text-xs text-emerald-300"
                >
                  {(Object.keys(TONAL_SHADER_META) as TonalShaderMode[]).map((tm) => (
                    <option key={tm} value={tm}>
                      Shader: {TONAL_SHADER_META[tm].short}
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-1.5 border-t border-slate-800">
                <SliderControl
                  label="Densidad de Vértices (LOD)"
                  value={quality.meshDensity}
                  min={0.2}
                  max={2.0}
                  step={0.05}
                  unit="×"
                  onChange={(v) => updateQuality('meshDensity', v)}
                />
              </div>
            </div>
          </details>

          {/* Direct 7-Styles Quick Switcher right in the Top Bar */}
          <select
            value={params.representationStyle}
            onChange={(e) =>
              updateParam('representationStyle', e.target.value as RepresentationStyle)
            }
            title="Los 7 Estilos de Geometría 3D (Botánico, Metaballs, Geodésico, Fibonacci, Placas BIM, Envolvente, Voxel)"
            className="bg-[#141e2d] border border-emerald-500/45 rounded px-2 py-1 text-[11px] font-medium text-emerald-300 focus:outline-none focus:border-emerald-400 cursor-pointer"
          >
            {(Object.keys(REPRESENTATION_STYLE_META) as RepresentationStyle[]).map((st, idx) => (
              <option key={st} value={st}>
                {idx + 1}. {REPRESENTATION_STYLE_META[st].short}
              </option>
            ))}
          </select>

          <button
            onClick={generateHybridVegetation}
            className="px-2.5 py-1 rounded bg-indigo-500/20 hover:bg-indigo-500/35 text-indigo-200 border border-indigo-400/50 font-semibold flex items-center gap-1 cursor-pointer transition-colors whitespace-nowrap"
            title="Crear un nuevo modelo híbrido combinando rasgos de distintas especies"
          >
            <Dna className="w-3 h-3 text-indigo-300" /> Híbrido
          </button>

          <button
            onClick={() => {
              setAiConfigTabOpen(false);
              setAiModalOpen(true);
            }}
            className="px-2.5 py-1 rounded bg-emerald-500/25 hover:bg-emerald-500/40 text-emerald-100 border border-emerald-400/60 font-semibold flex items-center gap-1 cursor-pointer transition-colors whitespace-nowrap"
            title="Subir imagen de una planta, árbol, hongo o flor para diseñarlo en 3D con IA"
          >
            <ImagePlus className="w-3.5 h-3.5 text-emerald-300" /> IA Imagen → 3D
          </button>

          <button
            onClick={() => {
              setAiConfigTabOpen(true);
              setAiModalOpen(true);
            }}
            className="px-2 py-1 rounded bg-slate-800/90 hover:bg-slate-700 text-violet-200 border border-violet-400/45 font-medium flex items-center gap-1 cursor-pointer transition-colors whitespace-nowrap"
            title="Configurar proveedor IA: Ollama Local, LM Studio, Llama.cpp, Visión Offline o Nube"
          >
            <HardDrive className="w-3 h-3 text-violet-300" />
            <span className="hidden xl:inline">IA:</span>
            <span>{AI_PROVIDER_META[aiProviderConfig.provider].shortLabel}</span>
          </button>
        </div>

        {/* Right Zone: Quick Save + Export Dropdown */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => {
              handleSaveNewLocalModel();
            }}
            className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-emerald-500/40 font-semibold text-xs flex items-center gap-1 cursor-pointer whitespace-nowrap"
            title="Guardar modelo actual con su captura 3D en tu biblioteca local"
          >
            <Save className="w-3.5 h-3.5" /> Guardar
          </button>

          <details className="relative group">
            <summary className="list-none px-3 py-1 rounded bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs flex items-center gap-1 cursor-pointer whitespace-nowrap">
              <Download className="w-3.5 h-3.5" />
              <span>Exportar</span>
              <span className="text-[10px]">▾</span>
            </summary>
            <div className="absolute right-0 mt-1.5 w-52 bg-[#0f1722] border border-slate-700 rounded-lg shadow-2xl p-2 z-50 space-y-1">
              <button
                onClick={() => viewportRef.current?.exportGLB()}
                className="w-full text-left px-2.5 py-1.5 rounded bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 font-semibold text-xs flex items-center justify-between cursor-pointer"
              >
                <span>Exportar Malla .GLB</span>
                <span className="text-[10px] font-mono">3D</span>
              </button>
              <button
                onClick={() => viewportRef.current?.exportOBJ()}
                className="w-full text-left px-2.5 py-1.5 rounded hover:bg-slate-800 text-slate-200 text-xs flex items-center justify-between cursor-pointer"
              >
                <span>Exportar Malla .OBJ</span>
                <span className="text-[10px] font-mono text-slate-400">CAD</span>
              </button>
              <button
                onClick={() => viewportRef.current?.captureSnapshot()}
                className="w-full text-left px-2.5 py-1.5 rounded hover:bg-slate-800 text-slate-200 text-xs flex items-center justify-between cursor-pointer"
              >
                <span>Capturar Imagen .PNG</span>
                <Camera className="w-3.5 h-3.5 text-emerald-400" />
              </button>
              <div className="border-t border-slate-800 my-1 pt-1 space-y-1">
                <button
                  onClick={() => downloadEntireLibraryJson(savedModels)}
                  className="w-full text-left px-2.5 py-1 rounded hover:bg-slate-800 text-slate-300 text-[11px] flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3 h-3 text-emerald-400" /> Respaldar Biblioteca (.JSON)
                </button>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full text-left px-2.5 py-1 rounded hover:bg-slate-800 text-slate-300 text-[11px] flex items-center gap-1.5 cursor-pointer"
                >
                  <Upload className="w-3 h-3 text-sky-400" /> Importar Modelos (.JSON)
                </button>
              </div>
            </div>
          </details>
        </div>
      </header>

      {/* Split-Screen Studio Workspace: Optimized Left Inspector + Full-Height Unobstructed 3D Viewport */}
      <div className="flex-1 flex overflow-hidden relative">
        {sidebarOpen && (
          <aside className="w-[375px] shrink-0 h-full bg-[#0e151f] border-r border-slate-800/90 flex flex-col z-20">
            {/* Ultra-Compact Sidebar Top Bar: 4 Main Tabs + Dropdown for Secondary Sections */}
            <div className="p-2 bg-[#0c121b] border-b border-slate-800/80 flex flex-col gap-1.5 shrink-0">
              <div className="grid grid-cols-3 gap-1 text-[11px] font-medium">
                <button
                  onClick={() => setActiveTab('foliage')}
                  className={`px-2 py-1.5 rounded flex items-center justify-center gap-1 transition-colors cursor-pointer whitespace-nowrap ${
                    activeTab === 'foliage'
                      ? 'bg-emerald-500 text-slate-950 font-semibold'
                      : 'bg-[#14222b] text-emerald-300 border border-emerald-500/35 hover:bg-[#192b36]'
                  }`}
                  title="Modificar con sliders todas las partes del objeto creado (tallos, ramas, sombreros, pétalos, hojas, espinas, raíces y colores)"
                >
                  <Sliders className="w-3.5 h-3.5 shrink-0" />
                  <span>Sliders / Partes</span>
                </button>

                <button
                  onClick={() => setActiveTab('library')}
                  className={`px-2 py-1.5 rounded flex items-center justify-center gap-1 transition-colors cursor-pointer whitespace-nowrap ${
                    activeTab === 'library'
                      ? 'bg-emerald-500 text-slate-950 font-semibold'
                      : 'bg-[#141d2b] text-slate-300 hover:text-white border border-slate-800'
                  }`}
                  title="Ver mis modelos guardados localmente"
                >
                  <Bookmark className="w-3 h-3 shrink-0" />
                  <span>Local ({savedModels.length})</span>
                </button>

                <button
                  onClick={() => setActiveTab('ai_parts')}
                  className={`px-2 py-1.5 rounded flex items-center justify-center gap-1 transition-colors cursor-pointer whitespace-nowrap ${
                    activeTab === 'ai_parts'
                      ? 'bg-emerald-500 text-slate-950 font-semibold'
                      : 'bg-[#141d2b] text-amber-200 hover:text-white border border-amber-500/35'
                  }`}
                  title="Ver y gestionar las partes modulares inventadas o guardadas para la IA"
                >
                  <Sparkles className="w-3 h-3 shrink-0" />
                  <span>Partes IA ({savedPartModules.length})</span>
                </button>
              </div>

              <div className="flex items-center gap-1 text-[11px] font-medium">
                <button
                  onClick={() => setActiveTab('catalog')}
                  className={`flex-1 px-2 py-1 rounded flex items-center justify-center gap-1 transition-colors cursor-pointer whitespace-nowrap ${
                    activeTab === 'catalog'
                      ? 'bg-emerald-500 text-slate-950 font-semibold'
                      : 'bg-[#141d2b] text-slate-300 hover:text-white border border-slate-800'
                  }`}
                  title="Explorar catálogo completo de especies"
                >
                  <Trees className="w-3 h-3 shrink-0" />
                  <span>Catálogo ({allCatalogSpecies.length})</span>
                </button>

                <select
                  value={
                    ['foliage', 'library', 'ai_parts', 'catalog'].includes(activeTab)
                      ? 'more'
                      : activeTab
                  }
                  onChange={(e) => {
                    if (e.target.value !== 'more') {
                      setActiveTab(e.target.value as ActiveWorkspaceTab);
                    }
                  }}
                  title="Más paneles especializados"
                  className={`flex-1 bg-[#141d2b] border rounded px-2 py-1 text-[11px] cursor-pointer focus:outline-none ${
                    !['foliage', 'library', 'ai_parts', 'catalog'].includes(activeTab)
                      ? 'border-emerald-400 text-emerald-300 font-semibold'
                      : 'border-slate-700/80 text-slate-300'
                  }`}
                >
                  <option value="more" disabled>
                    Más secciones...
                  </option>
                  <option value="architecture">Tronco / Raíces</option>
                  <option value="shaders">Shaders / Bases</option>
                  <option value="aquatic">Corales / Algas</option>
                  <option value="moss_fungi">Musgos / Hongos</option>
                  <option value="xenobotany">Alien Xenobotánica</option>
                  <option value="representation">Vértices / LOD</option>
                </select>
              </div>

              {/* Compact 1-Line Active AI Banner or Save Notice (Takes minimal vertical space) */}
              {activeAiDesignInfo && (
                <div className="px-2 py-1 rounded bg-[#13222e] border border-emerald-500/40 text-[11px] flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <img
                      src={activeAiDesignInfo.previewDataUrl}
                      alt={activeAiDesignInfo.name}
                      className="w-7 h-7 rounded object-cover border border-emerald-400/40 shrink-0 bg-slate-950"
                    />
                    <div className="min-w-0">
                      <div className="font-semibold text-emerald-200 truncate text-[11px]">
                        {activeAiDesignInfo.name}
                      </div>
                      <div className="text-[9px] text-slate-400 truncate">
                        {activeAiDesignInfo.providerUsed ? `${activeAiDesignInfo.providerUsed} · ` : ''}
                        {activeAiDesignInfo.scientificName}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {activeTab !== 'foliage' && (
                      <button
                        onClick={() => setActiveTab('foliage')}
                        className="px-1.5 py-0.5 rounded bg-emerald-500 text-slate-950 font-semibold text-[10px] cursor-pointer"
                      >
                        Sliders
                      </button>
                    )}
                    <button
                      onClick={() => setAiModalOpen(true)}
                      className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-emerald-300 text-[10px] cursor-pointer border border-slate-700"
                    >
                      Foto
                    </button>
                  </div>
                </div>
              )}

              {saveNotice && (
                <div className="px-2 py-1 rounded bg-emerald-950/90 border border-emerald-500/60 text-emerald-300 text-[10px] flex items-center gap-1.5 font-medium">
                  <Check className="w-3 h-3 text-emerald-400 shrink-0" />
                  <span className="truncate">{saveNotice}</span>
                </div>
              )}
            </div>

            {/* Scrollable Inspector Body — Now has 85%+ of Full Screen Height! */}
            <div className="flex-1 overflow-y-auto studio-scroll p-2.5 space-y-3">
              {/* TAB 0: LOCAL MODEL LIBRARY — COMPACT HEADER + FULL-HEIGHT MODEL GRID */}
              {activeTab === 'library' && (
                <div className="flex flex-col gap-2.5">
                  <div className="bg-[#131f2e] border border-emerald-500/35 rounded-lg p-2 space-y-1.5">
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        value={customModelName}
                        onChange={(e) => setCustomModelName(e.target.value)}
                        placeholder={`${currentSpecies.name.split(' (')[0]} #${params.seed}`}
                        className="flex-1 min-w-0 bg-[#0b1119] border border-slate-700 rounded px-2 py-1 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
                      />
                      <button
                        onClick={handleSaveNewLocalModel}
                        className="px-2.5 py-1 rounded bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-[11px] flex items-center gap-1 cursor-pointer shrink-0"
                      >
                        <Camera className="w-3 h-3" />
                        Guardar
                      </button>
                      {activeSavedModelId && (
                        <button
                          onClick={() => handleUpdateSavedModel(activeSavedModelId)}
                          title="Sobrescribir modelo activo con la vista actual"
                          className="px-2 py-1 rounded bg-sky-500/20 hover:bg-sky-500/30 border border-sky-500/40 text-sky-300 text-[11px] font-medium flex items-center gap-1 cursor-pointer shrink-0"
                        >
                          <RefreshCw className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between px-0.5">
                      <span className="text-[11px] font-semibold text-slate-300">
                        Mis Modelos Guardados ({savedModels.length})
                      </span>
                      <div className="flex items-center gap-1.5 text-[10px]">
                        <button
                          onClick={() => downloadEntireLibraryJson(savedModels)}
                          className="text-emerald-400 hover:underline cursor-pointer"
                        >
                          Exportar .JSON
                        </button>
                        <span className="text-slate-600">·</span>
                        <button
                          onClick={() => fileInputRef.current?.click()}
                          className="text-sky-400 hover:underline cursor-pointer"
                        >
                          Importar .JSON
                        </button>
                      </div>
                    </div>

                    {savedModels.length === 0 ? (
                      <div className="bg-[#141d2b] border border-slate-800 rounded-lg p-6 text-center space-y-2">
                        <p className="text-xs text-slate-300 font-medium">
                          Tu biblioteca local está vacía.
                        </p>
                        <p className="text-[11px] text-slate-400">
                          Personaliza cualquier árbol, roca con musgo u hongo y pulsa «Guardar» para almacenar el modelo con su miniatura 3D.
                        </p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-2">
                        {savedModels.map((model) => {
                          const isSelected = activeSavedModelId === model.id;
                          const isAlien =
                            model.category === 'Xenobotánica & Extraterrestres' ||
                            model.params.engine === 'alien_xenobotany';

                          return (
                            <div
                              key={model.id}
                              onClick={() => handleLoadSavedModel(model)}
                              className={`group rounded-lg border overflow-hidden transition-all cursor-pointer flex flex-col justify-between ${
                                isSelected
                                  ? 'bg-emerald-950/40 border-emerald-400 shadow-md'
                                  : isAlien
                                  ? 'bg-[#161527] border-purple-500/35 hover:border-purple-400/70'
                                  : 'bg-[#141d2b] border-slate-800/90 hover:border-slate-600'
                              }`}
                            >
                              <div className="relative w-full h-24 bg-[#090e15] overflow-hidden border-b border-slate-800/80">
                                <img
                                  src={model.thumbnailDataUrl}
                                  alt={model.name}
                                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                                />
                                <div className="absolute bottom-1 left-1.5 right-1.5 flex items-center justify-between text-[9px] font-mono text-slate-300 bg-slate-950/75 px-1.5 py-0.5 rounded">
                                  <span>H {model.stats?.treeHeightM ?? model.params.height}m</span>
                                  <span>·</span>
                                  <span>
                                    {Math.round((model.stats?.triangles || 42000) / 1000)}k tris
                                  </span>
                                </div>
                              </div>

                              <div className="p-2 flex flex-col gap-1">
                                <div className="font-semibold text-[11px] text-slate-100 leading-tight truncate">
                                  {model.name}
                                </div>
                                <div className="flex items-center justify-between pt-1 border-t border-slate-800/80 gap-1">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleLoadSavedModel(model);
                                      setActiveTab('foliage');
                                    }}
                                    className="flex-1 py-0.5 rounded bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 font-semibold text-[10px] text-center cursor-pointer"
                                    title="Cargar modelo y abrir sus sliders"
                                  >
                                    Editar 3D
                                  </button>

                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      downloadModelJson(model);
                                    }}
                                    title="Descargar este modelo (.arborea.json)"
                                    className="p-1 rounded bg-slate-800/90 hover:bg-slate-700 text-emerald-400 cursor-pointer"
                                  >
                                    <Download className="w-3 h-3" />
                                  </button>

                                  <button
                                    onClick={(e) => handleDuplicateSavedModel(model, e)}
                                    title="Duplicar modelo"
                                    className="p-1 rounded bg-slate-800/90 hover:bg-slate-700 text-slate-300 cursor-pointer"
                                  >
                                    <Copy className="w-3 h-3" />
                                  </button>

                                  <button
                                    onClick={(e) => handleDeleteSavedModel(model.id, e)}
                                    title="Eliminar de la biblioteca local"
                                    className="p-1 rounded bg-slate-800/90 hover:bg-rose-950 text-rose-400 cursor-pointer"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 0B: PARTES IA — TARJETAS DE PARTES MODULARES GUARDADAS / INVENTADAS POR IA */}
              {activeTab === 'ai_parts' && (
                <div className="flex flex-col gap-2.5">
                  <div className="bg-[#131f2e] border border-amber-500/35 rounded-lg p-2.5 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-semibold text-amber-200 flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        Biblioteca de Partes IA ({savedPartModules.length})
                      </span>
                      <button
                        onClick={() => setAiModalOpen(true)}
                        className="px-2 py-0.5 rounded bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-200 text-[10px] font-semibold cursor-pointer"
                      >
                        + Diseñar con Foto
                      </button>
                    </div>
                    <p className="text-[10px] text-slate-400 leading-snug">
                      Cada parte guardada o sintetizada por la IA se comparte con Ollama, LM Studio y Gemini para reutilizarla en futuras especies.
                    </p>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        value={newPartNameInput}
                        onChange={(e) => setNewPartNameInput(e.target.value)}
                        placeholder="Nombre para guardar parte actual..."
                        className="flex-1 min-w-0 bg-[#0b1119] border border-slate-700 rounded px-2 py-1 text-[11px] text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-400"
                      />
                      <button
                        onClick={() => {
                          const currentElem: CustomBotanicalElement = params.customElement || {
                            id: `elem_custom_${Date.now()}`,
                            name: `Elemento Modular #${params.seed}`,
                            scientificName: 'Botanica modularis sp.',
                            description:
                              'Combinación personalizada de tallo, superficie, copa y filamentos.',
                            createdAt: Date.now(),
                            stemStructure: 'multi_stalk_umbel_colony',
                            canopyElement: 'custom_fungi_cap',
                            surfaceElement: 'smooth_striated',
                            hangingElement: 'weeping_filaments',
                            lobeCount: 6,
                            cupDepth: 0.45,
                            spiralTurns: 1.35,
                            spiralArms: 8,
                            stemCount: 8,
                            trunkBentS: 0.32,
                            branchSpread: 0.65,
                            branchDroop: 0.18,
                            capDomeHeight: 0.56,
                            capSpotDensity: 0.85,
                            gillCount: 24,
                            petalOpenness: 0.35,
                            leafSerration: 0.4,
                            thornDensity: 0.15,
                            thornLength: 0.9,
                            filamentCount: 24,
                            filamentLength: 1.2,
                            padLayers: 6,
                          };
                          const autoLabel = `${STEM_STRUCTURE_META[currentElem.stemStructure]?.label.split(' ')[0] || 'Parte'} + ${CANOPY_ELEMENT_META[currentElem.canopyElement]?.label.split(' ')[0] || 'Copa'} #${params.seed}`;
                          const finalName = newPartNameInput.trim() || autoLabel;
                          const toSave: CustomBotanicalElement = {
                            ...currentElem,
                            id: `elem_user_${Date.now()}`,
                            name: finalName,
                            createdAt: Date.now(),
                          };
                          const updated = saveCustomElementToApp(toSave);
                          setCustomElements(updated);
                          const updatedModules = saveCustomPartModule(finalName, 'canopy', toSave);
                          setSavedPartModules(updatedModules);
                          setNewPartNameInput('');
                          updateParam('engine', 'composed_custom');
                          updateParam('foliageType', 'ai_custom_element');
                          updateParam('customElement', toSave);
                          showTempNotice(`Parte "${finalName}" guardada en Partes IA`);
                        }}
                        className="px-2 py-1 rounded bg-amber-500/20 hover:bg-amber-500/35 border border-amber-400/50 text-amber-200 text-[10px] font-semibold cursor-pointer shrink-0"
                      >
                        + Guardar actual
                      </button>
                    </div>
                  </div>

                  {savedPartModules.length === 0 ? (
                    <div className="bg-[#141d2b] border border-slate-800 rounded-lg p-6 text-center space-y-2">
                      <p className="text-xs text-slate-300 font-medium">
                        No hay partes guardadas todavía.
                      </p>
                      <p className="text-[11px] text-slate-400 leading-relaxed">
                        Guarda cualquier combinación desde «Sliders / Partes» o diseña una planta desde una imagen con la IA para que aparezcan aquí.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {savedPartModules.map((part) => {
                        const stemLabel =
                          STEM_STRUCTURE_META[part.element.stemStructure]?.label ||
                          part.element.stemStructure;
                        const canopyLabel =
                          CANOPY_ELEMENT_META[part.element.canopyElement]?.label ||
                          part.element.canopyElement;
                        const formattedDate = new Date(part.createdAt).toLocaleDateString('es-ES', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        });
                        const isSpline =
                          part.element.canopyElement === 'custom_spline_leaf_crown' ||
                          part.element.synthesizedHeadTopology === 'spline_petal_corona';
                        const isLathe =
                          part.element.canopyElement === 'procedural_lathe_head' ||
                          part.element.synthesizedHeadTopology === 'revolved_lathe_chalice';
                        const isCurrent = params.customElement?.name === part.name;

                        return (
                          <div
                            key={part.id}
                            className={`rounded-lg border p-2.5 space-y-2 transition-colors ${
                              isCurrent
                                ? 'bg-emerald-950/35 border-emerald-400/70'
                                : 'bg-[#141d2b] border-slate-800/90 hover:border-slate-700'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <PartVisualThumb
                                  kind="stem"
                                  value={part.element.stemStructure}
                                  size={34}
                                />
                                <PartVisualThumb
                                  kind="canopy"
                                  value={part.element.canopyElement}
                                  size={34}
                                />
                                <div className="min-w-0">
                                  <div className="font-semibold text-xs text-slate-100 truncate">
                                    {part.name}
                                  </div>
                                  <div className="text-[10px] text-slate-400 mt-0.5">
                                    {formattedDate}
                                  </div>
                                </div>
                              </div>
                              {(isSpline || isLathe) && (
                                <span className="px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-500/40 text-amber-300 text-[9px] font-semibold shrink-0">
                                  {isSpline ? 'Spline IA' : 'Revolución IA'}
                                </span>
                              )}
                            </div>

                            <div className="bg-[#0d141d] border border-slate-800/80 rounded px-2 py-1.5 space-y-1 text-[10px]">
                              <div className="flex items-baseline gap-1.5">
                                <span className="text-slate-400 shrink-0">Tallo:</span>
                                <span className="text-slate-200 truncate">{stemLabel}</span>
                              </div>
                              <div className="flex items-baseline gap-1.5">
                                <span className="text-slate-400 shrink-0">Copa:</span>
                                <span className="text-emerald-300 truncate">{canopyLabel}</span>
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 pt-0.5">
                              <button
                                onClick={() => {
                                  updateParam('engine', 'composed_custom');
                                  updateParam('foliageType', 'ai_custom_element');
                                  updateParam('customElement', { ...part.element });
                                  setActiveTab('foliage');
                                  showTempNotice(`Parte "${part.name}" aplicada al visor 3D`);
                                }}
                                className="flex-1 py-1 rounded bg-emerald-500/20 hover:bg-emerald-500/35 border border-emerald-500/40 text-emerald-200 text-[11px] font-semibold cursor-pointer"
                              >
                                Aplicar y Editar 3D
                              </button>
                              <button
                                onClick={() => {
                                  const nextModules = deleteSavedPartModule(part.id);
                                  setSavedPartModules(nextModules);
                                  const nextCustom = deleteCustomElementFromApp(
                                    part.element.id,
                                    part.name
                                  );
                                  setCustomElements(nextCustom);
                                  showTempNotice(`Parte "${part.name}" borrada`);
                                }}
                                className="px-2.5 py-1 rounded bg-rose-950/60 hover:bg-rose-900/80 border border-rose-500/40 text-rose-300 text-[11px] font-medium flex items-center gap-1 cursor-pointer shrink-0"
                                title="Eliminar esta parte de la biblioteca IA"
                              >
                                <Trash2 className="w-3 h-3" />
                                <span>Borrar</span>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 1: FULL SPECIES CATALOG — SINGLE DROPDOWN FILTER + FULL-HEIGHT GRID */}
              {activeTab === 'catalog' && (
                <div className="flex flex-col gap-2.5">
                  <div className="flex items-center justify-between gap-2 bg-[#131d2b] border border-slate-800 rounded-lg px-2.5 py-1.5">
                    <span className="text-[11px] font-medium text-slate-300 shrink-0">
                      Categoría:
                    </span>
                    <select
                      value={selectedCategory}
                      onChange={(e) => setSelectedCategory(e.target.value)}
                      className="flex-1 min-w-0 bg-[#0c131d] border border-slate-700 rounded px-2 py-1 text-xs text-emerald-300 font-medium focus:outline-none"
                    >
                      {CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat === 'Todas'
                            ? `Todas las Especies (${allCatalogSpecies.length})`
                            : cat}
                        </option>
                      ))}
                    </select>
                    {hiddenSpeciesIds.length > 0 && (
                      <button
                        onClick={() => {
                          setHiddenSpeciesIds([]);
                          try {
                            localStorage.removeItem('arborea_hidden_species_v1');
                          } catch {
                            // ignore
                          }
                          showTempNotice('Especies ocultas restauradas');
                        }}
                        className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 border border-slate-600 text-[10px] text-amber-300 font-medium cursor-pointer shrink-0"
                        title="Restaurar especies eliminadas del catálogo"
                      >
                        Restaurar ({hiddenSpeciesIds.length})
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    {filteredSpecies.map((sp) => {
                      const isSelected = sp.id === params.presetId && !activeSavedModelId;
                      const isAquatic = sp.category === 'Mundo Acuático (Corales & Algas)';
                      const isAlien = sp.category === 'Xenobotánica & Extraterrestres';
                      const isMoss = sp.category === 'Musgos, Líquenes & Hongos (Roca 3D)';
                      const thumbUrl =
                        livePresetThumbs[sp.id] ||
                        generateMiniaturePreviewDataUrl(
                          sp.params,
                          isAquatic ? '#062c38' : isAlien ? '#120d24' : isMoss ? '#0c1914' : '#0c131d',
                          isAquatic ? '#083b4a' : isAlien ? '#1d1536' : isMoss ? '#14261d' : '#101824',
                          sp.id
                        );

                      return (
                        <div
                          key={sp.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => selectSpeciesPreset(sp.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              selectSpeciesPreset(sp.id);
                            }
                          }}
                          className={`group text-left rounded-lg border overflow-hidden transition-all cursor-pointer flex flex-col justify-between ${
                            isSelected
                              ? 'bg-emerald-950/50 border-emerald-500/80 shadow-sm'
                              : isAquatic
                              ? 'bg-[#0c202c] border-cyan-500/30 hover:border-cyan-400/60'
                              : isMoss
                              ? 'bg-[#11221c] border-lime-500/30 hover:border-lime-400/60'
                              : isAlien
                              ? 'bg-[#171528] border-purple-500/30 hover:border-purple-400/60'
                              : 'bg-[#151e2c] border-slate-800/80 hover:border-slate-700'
                          }`}
                        >
                          <div className="relative w-full h-20 bg-[#090e15] border-b border-slate-800/80 overflow-hidden">
                            <img
                              src={thumbUrl}
                              alt={sp.name}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                            />
                            <button
                              onClick={(e) => handleRemoveSpecies(sp, e)}
                              title="Eliminar esta especie del catálogo"
                              className="absolute top-1.5 left-1.5 p-1 rounded bg-slate-950/85 hover:bg-rose-900 border border-slate-700 hover:border-rose-400 text-slate-300 hover:text-rose-200 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                            <div className="absolute top-1.5 right-1.5 flex items-center gap-0.5 bg-slate-950/80 px-1 py-0.5 rounded border border-slate-800">
                              <span
                                className="w-2 h-2 rounded-xs"
                                style={{ backgroundColor: sp.params.colorTrunk || '#78350f' }}
                              />
                              <span
                                className="w-2 h-2 rounded-xs"
                                style={{ backgroundColor: sp.params.colorLeafMain || '#15803d' }}
                              />
                              <span
                                className="w-2 h-2 rounded-xs"
                                style={{ backgroundColor: sp.params.colorLeafTip || '#84cc16' }}
                              />
                            </div>
                          </div>

                          <div className="p-2 flex flex-col gap-1">
                            <div className="font-semibold text-[11px] text-slate-100 leading-tight line-clamp-1">
                              {sp.name}
                            </div>
                            <div className="text-[10px] italic text-slate-400 leading-tight truncate">
                              {sp.scientificName}
                            </div>

                            <div className="flex items-center justify-between pt-1 border-t border-slate-800/80 text-[10px]">
                              <span
                                className={`truncate ${
                                  isAquatic
                                    ? 'text-cyan-300 font-medium'
                                    : isMoss
                                    ? 'text-lime-300 font-medium'
                                    : isAlien
                                    ? 'text-purple-300 font-medium'
                                    : 'text-emerald-400'
                                }`}
                              >
                                {isAquatic
                                  ? 'Arrecife / Marino 3D'
                                  : isMoss
                                  ? 'Roca 3D + Briófitos'
                                  : sp.params.tonalMode &&
                                    sp.params.tonalMode !== 'natural_botanical'
                                  ? TONAL_SHADER_META[sp.params.tonalMode].short
                                  : sp.params.representationStyle &&
                                    sp.params.representationStyle !== 'botanical_leaves'
                                  ? REPRESENTATION_STYLE_META[sp.params.representationStyle].short
                                  : FOLIAGE_TYPE_META[sp.params.foliageType || 'broadleaf_ovate']
                                      .badge}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* TAB 1B: MUNDO ACUÁTICO — CORALES, ANÉMONAS, ESPONJAS & ALGAS 3D */}
              {activeTab === 'aquatic' && (
                <div className="flex flex-col gap-3.5">
                  <div className="bg-[#0d2430] border border-cyan-500/40 rounded-lg p-3 space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-cyan-300 flex items-center gap-1.5">
                        <Waves className="w-3.5 h-3.5 text-cyan-400" />
                        {aquaticPresets.length} Especies Acuáticas (Corales & Algas 3D)
                      </span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {hiddenSpeciesIds.length > 0 && (
                          <button
                            onClick={() => {
                              setHiddenSpeciesIds([]);
                              try {
                                localStorage.removeItem('arborea_hidden_species_v1');
                              } catch {
                                // ignore
                              }
                              showTempNotice('Especies ocultas restauradas');
                            }}
                            className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 border border-slate-600 text-[9px] text-amber-300 cursor-pointer"
                          >
                            Restaurar ({hiddenSpeciesIds.length})
                          </button>
                        )}
                        <span className="text-[10px] font-mono text-cyan-400">MARINO-3D</span>
                      </div>
                    </div>

                    {/* Quick 1-click Underwater Background Environment Switcher */}
                    <div className="grid grid-cols-3 gap-1">
                      {underwaterBgPresets.map((bgp) => {
                        const activeBg =
                          quality.backgroundColor.toLowerCase() === bgp.bg.toLowerCase();
                        return (
                          <button
                            key={bgp.id}
                            onClick={() => applyBackgroundPreset(bgp)}
                            className={`px-1.5 py-1 rounded border text-[10px] flex items-center justify-between gap-1 cursor-pointer transition-all ${
                              activeBg
                                ? 'bg-cyan-500/25 border-cyan-400 text-cyan-200 font-semibold'
                                : 'bg-[#081922] border-slate-700/80 text-slate-300 hover:border-cyan-500/50'
                            }`}
                          >
                            <span className="truncate">{bgp.name}</span>
                            <span
                              className="w-2.5 h-2.5 rounded-xs border border-white/30 shrink-0"
                              style={{ backgroundColor: bgp.bg }}
                            />
                          </button>
                        );
                      })}
                    </div>

                    <div className="grid grid-cols-2 gap-1.5 max-h-[300px] overflow-y-auto studio-scroll pr-1">
                      {aquaticPresets.map((sp) => {
                        const active = sp.id === params.presetId;
                        const thumbUrl =
                          livePresetThumbs[sp.id] ||
                          generateMiniaturePreviewDataUrl(
                            sp.params,
                            '#062c38',
                            '#083b4a',
                            sp.id
                          );
                        return (
                          <div
                            key={sp.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => selectSpeciesPreset(sp.id)}
                            className={`group relative text-left rounded-lg border overflow-hidden transition-all cursor-pointer flex flex-col justify-between ${
                              active
                                ? 'bg-cyan-950/80 border-cyan-400 shadow-xs'
                                : 'bg-[#091b24] border-slate-800 hover:border-cyan-500/50'
                            }`}
                          >
                            <img
                              src={thumbUrl}
                              alt={sp.name}
                              className="w-full h-20 object-cover border-b border-slate-800/80 bg-[#04141d]"
                            />
                            <button
                              onClick={(e) => handleRemoveSpecies(sp, e)}
                              title="Eliminar esta especie"
                              className="absolute top-1 left-1 p-1 rounded bg-slate-950/85 hover:bg-rose-900 border border-slate-700 hover:border-rose-400 text-slate-300 hover:text-rose-200 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                            <div className="p-1.5">
                              <div className="text-[11px] font-semibold text-slate-100 leading-tight truncate">
                                {sp.name}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Aquatic Coral, Kelp & Reef Rock Customizer */}
                  <div className="bg-[#151e2c] border border-slate-800/80 rounded-lg p-3 space-y-3">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-cyan-400">
                      Morfología de Arrecife, Corales, Anémonas & Algas
                    </div>

                    <SliderControl
                      label="Altura de Coral / Bosque Kelp"
                      value={params.height}
                      min={1.4}
                      max={9.0}
                      step={0.2}
                      unit="m"
                      onChange={(v) => {
                        updateParam('engine', 'aquatic_coral_algae');
                        updateParam('height', v);
                      }}
                    />
                    <SliderControl
                      label="Grosor de Esqueleto / Estípite / Domo"
                      value={params.radius}
                      min={0.14}
                      max={0.75}
                      step={0.02}
                      unit="m"
                      onChange={(v) => {
                        updateParam('engine', 'aquatic_coral_algae');
                        updateParam('radius', v);
                      }}
                    />
                    <SliderControl
                      label="Ramas / Tubos / Frondas"
                      value={params.branchCount}
                      min={2}
                      max={10}
                      step={1}
                      onChange={(v) => {
                        updateParam('engine', 'aquatic_coral_algae');
                        updateParam('branchCount', v);
                      }}
                    />
                    <SliderControl
                      label="Tamaño de Láminas / Pólipos / Tentáculos"
                      value={params.leafScale}
                      min={0.5}
                      max={2.2}
                      step={0.05}
                      unit="×"
                      onChange={(v) => {
                        updateParam('engine', 'aquatic_coral_algae');
                        updateParam('leafScale', v);
                      }}
                    />
                    <SliderControl
                      label="Ondulación por Corriente Marina"
                      value={params.gnarl}
                      min={0}
                      max={0.8}
                      step={0.05}
                      onChange={(v) => {
                        updateParam('engine', 'aquatic_coral_algae');
                        updateParam('gnarl', v);
                      }}
                    />
                    <SliderControl
                      label="Tamaño de Roca Arrecifal Base"
                      value={params.rockScale ?? 1.0}
                      min={0.5}
                      max={1.8}
                      step={0.05}
                      unit="×"
                      onChange={(v) => {
                        updateParam('engine', 'aquatic_coral_algae');
                        updateParam('rockScale', v);
                      }}
                    />
                  </div>
                </div>
              )}

              {/* TAB 2: NEW SECTION — MUSGOS, LÍQUENES & HONGOS SOBRE ROCA 3D */}
              {activeTab === 'moss_fungi' && (
                <div className="flex flex-col gap-3.5">
                  <div className="bg-[#11231d] border border-lime-500/40 rounded-lg p-3 space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-lime-300 flex items-center gap-1.5">
                        <Sprout className="w-3.5 h-3.5 text-lime-400" />
                        {mossFungiPresets.length} Musgos, Líquenes & Setas sobre Roca 3D
                      </span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {hiddenSpeciesIds.length > 0 && (
                          <button
                            onClick={() => {
                              setHiddenSpeciesIds([]);
                              try {
                                localStorage.removeItem('arborea_hidden_species_v1');
                              } catch {
                                // ignore
                              }
                              showTempNotice('Especies ocultas restauradas');
                            }}
                            className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 border border-slate-600 text-[9px] text-amber-300 cursor-pointer"
                          >
                            Restaurar ({hiddenSpeciesIds.length})
                          </button>
                        )}
                        <span className="text-[10px] font-mono text-emerald-400">ROCA-3D</span>
                      </div>
                    </div>

                    <p className="text-[11px] text-slate-300 leading-relaxed">
                      Selecciona una porción de roca natural 3D tapizada con almohadillas de musgo briófito, esporofitos, líquenes o colonias de hongos del bosque:
                    </p>

                    <div className="grid grid-cols-2 gap-1.5 max-h-[300px] overflow-y-auto studio-scroll pr-1">
                      {mossFungiPresets.map((sp) => {
                        const active = sp.id === params.presetId;
                        const thumbUrl =
                          livePresetThumbs[sp.id] ||
                          generateMiniaturePreviewDataUrl(
                            sp.params,
                            '#0c1914',
                            '#14261d',
                            sp.id
                          );
                        return (
                          <div
                            key={sp.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => selectSpeciesPreset(sp.id)}
                            className={`group relative text-left rounded-lg border overflow-hidden transition-all cursor-pointer flex flex-col justify-between ${
                              active
                                ? 'bg-emerald-950/80 border-lime-400 shadow-xs'
                                : 'bg-[#0e1a16] border-slate-800 hover:border-lime-500/50'
                            }`}
                          >
                            <img
                              src={thumbUrl}
                              alt={sp.name}
                              className="w-full h-20 object-cover border-b border-slate-800/80 bg-[#090e15]"
                            />
                            <button
                              onClick={(e) => handleRemoveSpecies(sp, e)}
                              title="Eliminar esta especie"
                              className="absolute top-1 left-1 p-1 rounded bg-slate-950/85 hover:bg-rose-900 border border-slate-700 hover:border-rose-400 text-slate-300 hover:text-rose-200 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                            <div className="p-1.5">
                              <div className="text-[11px] font-semibold text-slate-100 leading-tight truncate">
                                {sp.name}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Rock Substrate, Moss Blanket & Fungi Colony Customizer */}
                  <div className="bg-[#151e2c] border border-slate-800/80 rounded-lg p-3 space-y-3">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-emerald-400">
                      Morfología de Roca 3D, Manto de Musgo & Hongos
                    </div>

                    <SliderControl
                      label="Tamaño de la Roca 3D (Sustrato)"
                      value={params.rockScale ?? 1.0}
                      min={0.5}
                      max={1.8}
                      step={0.05}
                      unit="×"
                      onChange={(v) => {
                        updateParam('engine', 'moss_fungi_rock');
                        updateParam('rockScale', v);
                      }}
                    />

                    <SliderControl
                      label="Rugosidad & Estratos de Roca"
                      value={params.rockRoughness ?? 0.65}
                      min={0.15}
                      max={1.3}
                      step={0.05}
                      onChange={(v) => {
                        updateParam('engine', 'moss_fungi_rock');
                        updateParam('rockRoughness', v);
                      }}
                    />

                    <SliderControl
                      label="Cobertura & Espesor de Musgo"
                      value={params.mossCoverage ?? 0.85}
                      min={0.15}
                      max={1.0}
                      step={0.05}
                      onChange={(v) => {
                        updateParam('engine', 'moss_fungi_rock');
                        updateParam('mossCoverage', v);
                      }}
                    />

                    <SliderControl
                      label="Cantidad de Hongos / Esporofitos / Líquenes"
                      value={params.branchCount}
                      min={1}
                      max={12}
                      step={1}
                      onChange={(v) => updateParam('branchCount', v)}
                    />

                    <SliderControl
                      label="Tamaño de Sombreros / Cápsulas / Copas"
                      value={params.leafScale}
                      min={0.5}
                      max={2.2}
                      step={0.05}
                      unit="×"
                      onChange={(v) => updateParam('leafScale', v)}
                    />

                    <SliderControl
                      label="Densidad de Micro-Brotes Briófitos"
                      value={params.leafDensity}
                      min={1}
                      max={8}
                      step={1}
                      onChange={(v) => updateParam('leafDensity', v)}
                    />
                  </div>
                </div>
              )}

              {/* TAB 3: XENOBOTÁNICA & FLORA EXTRATERRESTRE (12 DESIGNS FROM FOLIOS 1, 2 & 3) */}
              {activeTab === 'xenobotany' && (
                <div className="flex flex-col gap-3.5">
                  <div className="bg-[#16152b] border border-purple-500/40 rounded-lg p-3 space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-purple-300">
                        {allCatalogSpecies.filter((s) => s.category === 'Xenobotánica & Extraterrestres').length} Especies Extraterrestres
                      </span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {hiddenSpeciesIds.length > 0 && (
                          <button
                            onClick={() => {
                              setHiddenSpeciesIds([]);
                              try {
                                localStorage.removeItem('arborea_hidden_species_v1');
                              } catch {
                                // ignore
                              }
                              showTempNotice('Especies ocultas restauradas');
                            }}
                            className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 border border-slate-600 text-[9px] text-amber-300 cursor-pointer"
                          >
                            Restaurar ({hiddenSpeciesIds.length})
                          </button>
                        )}
                        <span className="text-[10px] font-mono text-emerald-400">XENO-3D</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-1.5 max-h-[300px] overflow-y-auto studio-scroll pr-1">
                      {allCatalogSpecies.filter(
                        (s) => s.category === 'Xenobotánica & Extraterrestres'
                      ).map((sp) => {
                        const active = sp.id === params.presetId;
                        const thumbUrl =
                          livePresetThumbs[sp.id] ||
                          generateMiniaturePreviewDataUrl(
                            sp.params,
                            '#120d24',
                            '#1d1536',
                            sp.id
                          );
                        return (
                          <div
                            key={sp.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => selectSpeciesPreset(sp.id)}
                            className={`group relative text-left rounded-lg border overflow-hidden transition-all cursor-pointer flex flex-col justify-between ${
                              active
                                ? 'bg-purple-950/70 border-emerald-400'
                                : 'bg-[#121624] border-slate-800 hover:border-purple-500/50'
                            }`}
                          >
                            <img
                              src={thumbUrl}
                              alt={sp.name}
                              className="w-full h-20 object-cover border-b border-slate-800/80 bg-[#090e15]"
                            />
                            <button
                              onClick={(e) => handleRemoveSpecies(sp, e)}
                              title="Eliminar esta especie"
                              className="absolute top-1 left-1 p-1 rounded bg-slate-950/85 hover:bg-rose-900 border border-slate-700 hover:border-rose-400 text-slate-300 hover:text-rose-200 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                            <div className="p-1.5">
                              <div className="text-[11px] font-semibold text-slate-100 leading-tight truncate">
                                {sp.name}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Alien Morphology & Archetype Customizer */}
                  <div className="bg-[#151e2c] border border-slate-800/80 rounded-lg p-3 space-y-3">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-emerald-400">
                      Arquetipo Xenobotánico & Morfología Orgánica
                    </div>

                    <SliderControl
                      label="Altura de Estructura Xenobotánica"
                      value={params.height}
                      min={1.8}
                      max={12.0}
                      step={0.2}
                      unit="m"
                      onChange={(v) => updateParam('height', v)}
                    />
                    <SliderControl
                      label="Grosor de Estípite / Bulbo / Domo"
                      value={params.radius}
                      min={0.15}
                      max={1.1}
                      step={0.02}
                      unit="m"
                      onChange={(v) => updateParam('radius', v)}
                    />
                    <SliderControl
                      label="Colonias / Tentáculos / Domos"
                      value={params.branchCount}
                      min={1}
                      max={10}
                      step={1}
                      onChange={(v) => updateParam('branchCount', v)}
                    />
                    <SliderControl
                      label="Escala de Sombreros / Esferas / Flores"
                      value={params.leafScale}
                      min={0.4}
                      max={2.4}
                      step={0.05}
                      unit="×"
                      onChange={(v) => updateParam('leafScale', v)}
                    />
                    <SliderControl
                      label="Torsión Espiral / Sinuosidad"
                      value={params.gnarl}
                      min={0}
                      max={0.9}
                      step={0.05}
                      onChange={(v) => updateParam('gnarl', v)}
                    />
                  </div>
                </div>
              )}

              {/* TAB 4: SHADERS, BASES DE ECOSISTEMA & COLOR DE FONDO */}
              {activeTab === 'shaders' && (
                <div className="flex flex-col gap-3.5">
                  {/* Integrated 3D Ecosystem Bases (Biomes / Dioramas) */}
                  <div
                    ref={baseSectionRef}
                    className={`bg-[#11202b] border rounded-lg p-3 space-y-3 transition-all ${
                      highlightedPart === 'ecosystem_base'
                        ? 'border-cyan-400 ring-2 ring-cyan-400/70 shadow-lg'
                        : 'border-cyan-500/40'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-cyan-300">
                        Bases de Ecosistema 3D (Terreno Integrado)
                      </span>
                      <label className="flex items-center gap-1.5 text-[11px] text-slate-200 cursor-pointer">
                        <span>Visible</span>
                        <input
                          type="checkbox"
                          checked={quality.showGroundDisk}
                          onChange={(e) => updateQuality('showGroundDisk', e.target.checked)}
                          className="accent-cyan-400 w-3.5 h-3.5"
                        />
                      </label>
                    </div>

                    <div className="grid grid-cols-2 gap-1.5">
                      {(Object.keys(ECOSYSTEM_BASE_META) as EcosystemBaseType[]).map((eb) => {
                        const meta = ECOSYSTEM_BASE_META[eb];
                        const isCur = quality.ecosystemBase === eb;
                        return (
                          <button
                            key={eb}
                            onClick={() => {
                              updateQuality('showGroundDisk', true);
                              updateQuality('ecosystemBase', eb);
                            }}
                            title={meta.description}
                            className={`px-2 py-1.5 rounded border text-left flex items-center justify-between gap-1.5 text-[11px] cursor-pointer transition-all ${
                              isCur
                                ? 'bg-cyan-950/70 border-cyan-400 text-cyan-200 font-semibold'
                                : 'bg-[#0b151d] border-slate-700/80 text-slate-300 hover:border-cyan-500/50'
                            }`}
                          >
                            <span className="truncate">{meta.short}</span>
                            <div className="flex items-center gap-0.5 shrink-0">
                              <span
                                className="w-2.5 h-2.5 rounded-xs border border-white/25"
                                style={{ backgroundColor: meta.swatchA }}
                              />
                              <span
                                className="w-2.5 h-2.5 rounded-xs border border-white/25"
                                style={{ backgroundColor: meta.swatchB }}
                              />
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    <p className="text-[10px] text-slate-400 leading-relaxed">
                      {ECOSYSTEM_BASE_META[quality.ecosystemBase || 'auto'].description}
                    </p>

                    <SliderControl
                      label="Escala / Amplitud de la Base"
                      value={quality.ecosystemBaseScale ?? 1.0}
                      min={0.4}
                      max={2.4}
                      step={0.05}
                      unit="×"
                      onChange={(v) => updateQuality('ecosystemBaseScale', v)}
                    />

                    <label className="flex items-center justify-between text-xs text-slate-300 cursor-pointer">
                      <span>Incluir Base 3D al Exportar (.GLB / .OBJ)</span>
                      <input
                        type="checkbox"
                        checked={quality.includeBaseInExport ?? true}
                        onChange={(e) => updateQuality('includeBaseInExport', e.target.checked)}
                        className="accent-cyan-400 w-4 h-4"
                      />
                    </label>
                  </div>

                  {/* Background Color, Grid Toggle & Preset Environments */}
                  <div className="bg-[#151e2c] border border-slate-800/80 rounded-lg p-3 space-y-3">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-emerald-400">
                      Color de Fondo, Rejilla & Atmósfera
                    </div>

                    <div className="grid grid-cols-2 gap-1.5">
                      {BACKGROUND_PRESETS.map((bgp) => {
                        const isCurrent =
                          quality.backgroundColor.toLowerCase() === bgp.bg.toLowerCase();
                        return (
                          <button
                            key={bgp.id}
                            onClick={() => applyBackgroundPreset(bgp)}
                            className={`px-2 py-1.5 rounded border text-left flex items-center justify-between gap-2 text-[11px] cursor-pointer transition-all ${
                              isCurrent
                                ? 'bg-emerald-950/60 border-emerald-400 text-emerald-300 font-semibold'
                                : 'bg-[#0e151f] border-slate-700/80 text-slate-300 hover:border-slate-500'
                            }`}
                          >
                            <span className="truncate">{bgp.name}</span>
                            <span
                              className="w-4 h-4 rounded-sm border border-white/30 shrink-0"
                              style={{ backgroundColor: bgp.bg }}
                            />
                          </button>
                        );
                      })}
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <div className="flex items-center justify-between bg-[#0e151f] border border-slate-700/80 rounded px-2 py-1">
                        <span className="text-[11px] text-slate-300">Fondo Libre</span>
                        <input
                          type="color"
                          value={quality.backgroundColor}
                          onChange={(e) => updateQuality('backgroundColor', e.target.value)}
                          className="w-7 h-5 rounded cursor-pointer bg-transparent"
                        />
                      </div>
                      <div className="flex items-center justify-between bg-[#0e151f] border border-slate-700/80 rounded px-2 py-1">
                        <span className="text-[11px] text-slate-300">Color Suelo CAD</span>
                        <input
                          type="color"
                          value={quality.groundColor}
                          onChange={(e) => updateQuality('groundColor', e.target.value)}
                          className="w-7 h-5 rounded cursor-pointer bg-transparent"
                        />
                      </div>
                    </div>

                    <label className="flex items-center justify-between text-xs text-slate-300 cursor-pointer">
                      <span>Mostrar Rejilla de Referencia (Grid)</span>
                      <input
                        type="checkbox"
                        checked={quality.showGrid}
                        onChange={(e) => updateQuality('showGrid', e.target.checked)}
                        className="accent-emerald-500 w-4 h-4"
                      />
                    </label>
                  </div>

                  {/* 9 Tonal & Xenobotanical GLSL Shader Modes */}
                  <div className="bg-[#151e2c] border border-slate-800/80 rounded-lg p-3 space-y-3">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-emerald-400">
                      Motor de Shaders Orgánicos & Tonalidades (9 Modos GLSL)
                    </div>

                    <select
                      value={tonalModeNow}
                      onChange={(e) =>
                        updateParam('tonalMode', e.target.value as TonalShaderMode)
                      }
                      className="w-full bg-[#0e151f] border border-emerald-500/50 rounded px-2 py-1.5 text-xs text-emerald-300 font-medium"
                    >
                      {(Object.keys(TONAL_SHADER_META) as TonalShaderMode[]).map((tm) => (
                        <option key={tm} value={tm}>
                          {TONAL_SHADER_META[tm].label}
                        </option>
                      ))}
                    </select>
                    <p className="text-[10px] text-slate-400 leading-relaxed">
                      {TONAL_SHADER_META[tonalModeNow].description}
                    </p>

                    <SliderControl
                      label="Rotación de Matiz / Tonalidad Global"
                      value={params.hueShift ?? 0}
                      min={-180}
                      max={180}
                      step={5}
                      unit="°"
                      onChange={(v) => updateParam('hueShift', v)}
                    />
                    <SliderControl
                      label="Intensidad Bioluminiscente / Emisiva"
                      value={params.emissiveIntensity ?? 0.25}
                      min={0}
                      max={2.2}
                      step={0.05}
                      onChange={(v) => updateParam('emissiveIntensity', v)}
                    />
                    <SliderControl
                      label="Iridiscencia / Cambio Angular Quitina"
                      value={params.iridescenceAmount ?? 0.2}
                      min={0}
                      max={1.0}
                      step={0.05}
                      onChange={(v) => updateParam('iridescenceAmount', v)}
                    />
                    <SliderControl
                      label="Escala de Membranas / Venas Orgánicas"
                      value={params.patternScale ?? 1.0}
                      min={0.25}
                      max={2.8}
                      step={0.05}
                      unit="×"
                      onChange={(v) => updateParam('patternScale', v)}
                    />
                    <SliderControl
                      label="Contraste de Venas / Estrías"
                      value={params.patternContrast ?? 0.55}
                      min={0}
                      max={1.0}
                      step={0.05}
                      onChange={(v) => updateParam('patternContrast', v)}
                    />
                    <SliderControl
                      label="Humedad / Brillo Mucílago (Clearcoat)"
                      value={params.wetnessGloss ?? 0.2}
                      min={0}
                      max={1.0}
                      step={0.05}
                      onChange={(v) => updateParam('wetnessGloss', v)}
                    />

                    <div className="grid grid-cols-5 gap-1.5 pt-1">
                      <div className="flex flex-col items-center gap-1">
                        <span className="text-[9px] text-slate-400">Tronco/Roca</span>
                        <input
                          type="color"
                          value={params.colorTrunk}
                          onChange={(e) => updateParam('colorTrunk', e.target.value)}
                          className="w-full h-6 rounded cursor-pointer bg-transparent"
                        />
                      </div>
                      <div className="flex flex-col items-center gap-1">
                        <span className="text-[9px] text-slate-400">Base/Musgo</span>
                        <input
                          type="color"
                          value={params.colorLeafMain}
                          onChange={(e) => updateParam('colorLeafMain', e.target.value)}
                          className="w-full h-6 rounded cursor-pointer bg-transparent"
                        />
                      </div>
                      <div className="flex flex-col items-center gap-1">
                        <span className="text-[9px] text-slate-400">Ápice/Seta</span>
                        <input
                          type="color"
                          value={params.colorLeafTip}
                          onChange={(e) => updateParam('colorLeafTip', e.target.value)}
                          className="w-full h-6 rounded cursor-pointer bg-transparent"
                        />
                      </div>
                      <div className="flex flex-col items-center gap-1">
                        <span className="text-[9px] text-slate-400">Flor/Pie</span>
                        <input
                          type="color"
                          value={params.colorFlower}
                          onChange={(e) => updateParam('colorFlower', e.target.value)}
                          className="w-full h-6 rounded cursor-pointer bg-transparent"
                        />
                      </div>
                      <div className="flex flex-col items-center gap-1">
                        <span className="text-[9px] text-emerald-400">Biolum</span>
                        <input
                          type="color"
                          value={params.colorAccent || params.colorFlower}
                          onChange={(e) => updateParam('colorAccent', e.target.value)}
                          className="w-full h-6 rounded cursor-pointer bg-transparent"
                        />
                      </div>
                    </div>
                  </div>

                  {/* 12 Curated One-Click Tonal Palettes */}
                  <div className="bg-[#151e2c] border border-slate-800/80 rounded-lg p-3 space-y-2.5">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-emerald-400">
                      12 Tonalidades & Shaders Predefinidos (1 Clic)
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {TONAL_PALETTE_PRESETS.map((pal) => (
                        <button
                          key={pal.id}
                          onClick={() => applyTonalPalette(pal)}
                          className="p-2 rounded border border-slate-800 bg-[#0e151f] hover:border-emerald-500/60 text-left flex flex-col gap-1 cursor-pointer transition-all"
                        >
                          <div className="text-[11px] font-semibold text-slate-100 truncate">
                            {pal.name}
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-[9px] text-emerald-400 truncate">
                              {pal.badge}
                            </span>
                            <div className="flex items-center gap-0.5">
                              <span
                                className="w-2.5 h-2.5 rounded-xs"
                                style={{ backgroundColor: pal.colorTrunk }}
                              />
                              <span
                                className="w-2.5 h-2.5 rounded-xs"
                                style={{ backgroundColor: pal.colorLeafMain }}
                              />
                              <span
                                className="w-2.5 h-2.5 rounded-xs"
                                style={{ backgroundColor: pal.colorLeafTip }}
                              />
                              <span
                                className="w-2.5 h-2.5 rounded-xs"
                                style={{ backgroundColor: pal.colorAccent }}
                              />
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 5: ROOTS, TRUNK & BRANCH ARCHITECTURE */}
              {activeTab === 'architecture' && (
                <div className="flex flex-col gap-3.5">
                  <div className="bg-[#151e2c] border border-emerald-500/40 rounded-lg p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-400">
                        Sistema Radicular (Cuello Radicular sin Tronco Colgante)
                      </span>
                      <label className="flex items-center gap-1.5 text-xs text-slate-200 cursor-pointer">
                        <span>Mostrar</span>
                        <input
                          type="checkbox"
                          checked={params.showRoots}
                          onChange={(e) => updateParam('showRoots', e.target.checked)}
                          className="accent-emerald-500 w-4 h-4"
                        />
                      </label>
                    </div>

                    {params.showRoots && (
                      <>
                        <SliderControl
                          label="Cantidad de Raíces Principales"
                          value={params.rootCount ?? 5}
                          min={1}
                          max={16}
                          step={1}
                          onChange={(v) => updateParam('rootCount', v)}
                        />
                        <SliderControl
                          label="Extensión / Tamaño de Raíces"
                          value={params.rootLength ?? 1.2}
                          min={0.3}
                          max={3.5}
                          step={0.1}
                          unit="×"
                          onChange={(v) => updateParam('rootLength', v)}
                        />
                        <SliderControl
                          label="Grosor / Tablares de Raíz"
                          value={params.rootThickness ?? 1.0}
                          min={0.3}
                          max={2.2}
                          step={0.05}
                          unit="×"
                          onChange={(v) => updateParam('rootThickness', v)}
                        />
                        <SliderControl
                          label="Altura de Arranque (Superficial ↔ Zanco)"
                          value={params.rootArch ?? 0.35}
                          min={0.1}
                          max={2.0}
                          step={0.05}
                          unit="×"
                          onChange={(v) => updateParam('rootArch', v)}
                        />
                      </>
                    )}
                  </div>

                  <div className="bg-[#151e2c] border border-slate-800/80 rounded-lg p-3 space-y-3">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-emerald-400">
                      Motor de Crecimiento & Fuste Principal
                    </div>

                    <select
                      value={params.engine}
                      onChange={(e) => updateParam('engine', e.target.value as GrowthEngine)}
                      className="w-full bg-[#0e151f] border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200"
                    >
                      {(Object.keys(ENGINE_META) as GrowthEngine[]).map((eng) => (
                        <option key={eng} value={eng}>
                          {ENGINE_META[eng].label}
                        </option>
                      ))}
                    </select>

                    <SliderControl
                      label="Altura Base"
                      value={params.height}
                      min={1.2}
                      max={14}
                      step={0.2}
                      unit="m"
                      onChange={(v) => updateParam('height', v)}
                    />
                    <SliderControl
                      label="Radio Basal del Tronco"
                      value={params.radius}
                      min={0.08}
                      max={1.2}
                      step={0.02}
                      unit="m"
                      onChange={(v) => updateParam('radius', v)}
                    />
                    <SliderControl
                      label="Conicidad (Taper)"
                      value={params.taper}
                      min={0.45}
                      max={0.95}
                      step={0.02}
                      onChange={(v) => updateParam('taper', v)}
                    />
                    <SliderControl
                      label="Ensanchamiento Cuello (Buttress Flare)"
                      value={params.flare}
                      min={0.0}
                      max={1.5}
                      step={0.05}
                      onChange={(v) => updateParam('flare', v)}
                    />
                  </div>

                  <div className="bg-[#151e2c] border border-slate-800/80 rounded-lg p-3 space-y-3">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-emerald-400">
                      Ramificación, Dominancia & Corteza
                    </div>
                    <SliderControl
                      label="Órdenes de Ramificación"
                      value={params.levels}
                      min={1}
                      max={5}
                      step={1}
                      onChange={(v) => updateParam('levels', v)}
                    />
                    <SliderControl
                      label="Ramas por Nodo"
                      value={params.branchCount}
                      min={1}
                      max={8}
                      step={1}
                      onChange={(v) => updateParam('branchCount', v)}
                    />
                    <SliderControl
                      label="Ángulo de Inserción"
                      value={params.angle}
                      min={12}
                      max={85}
                      step={1}
                      unit="°"
                      onChange={(v) => updateParam('angle', v)}
                    />
                    <SliderControl
                      label="Dominancia Apical (Guía Central)"
                      value={params.apicalDominance}
                      min={0.1}
                      max={0.95}
                      step={0.05}
                      onChange={(v) => updateParam('apicalDominance', v)}
                    />
                    <SliderControl
                      label="Gravitropismo (Péndulo ↔ Erecto)"
                      value={params.gravity}
                      min={-0.65}
                      max={0.65}
                      step={0.02}
                      onChange={(v) => updateParam('gravity', v)}
                    />
                    <SliderControl
                      label="Torsión / Nudosidad (Gnarl)"
                      value={params.gnarl}
                      min={0}
                      max={0.85}
                      step={0.02}
                      onChange={(v) => updateParam('gnarl', v)}
                    />

                    <select
                      value={params.barkType}
                      onChange={(e) => updateParam('barkType', e.target.value as BarkType)}
                      className="w-full bg-[#0e151f] border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200"
                    >
                      {(Object.keys(BARK_TYPE_META) as BarkType[]).map((bt) => (
                        <option key={bt} value={bt}>
                          {BARK_TYPE_META[bt].label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* TAB: SLIDERS DE TODAS LAS PARTES DEL OBJETO CREADO */}
              {activeTab === 'foliage' && (
                <div className="flex flex-col gap-2.5">
                  {/* 1. PARTES MODULARES DEL OBJETO (4 CAPAS) Y ELEMENTOS IA GUARDADOS */}
                  <details open className="bg-[#131d2b] border border-emerald-500/40 rounded-lg overflow-hidden group">
                    <summary className="px-3 py-2 bg-[#162334] cursor-pointer flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-emerald-400 select-none">
                      <span>1. Partes y Anatomía del Objeto ({customElements.length} IA)</span>
                      <span className="text-[10px] text-slate-400 group-open:rotate-180 transition-transform">▾</span>
                    </summary>
                    <div className="p-2.5 space-y-2.5">
                      {/* Quick 7 Representation Styles 1-Click Pills */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-semibold text-emerald-300">
                            7 Estilos de Representación 3D
                          </span>
                          <span className="text-[9px] text-slate-400">
                            {REPRESENTATION_STYLE_META[params.representationStyle].short}
                          </span>
                        </div>
                        <div className="grid grid-cols-4 gap-1">
                          {(Object.keys(REPRESENTATION_STYLE_META) as RepresentationStyle[]).map(
                            (st) => {
                              const active = params.representationStyle === st;
                              return (
                                <button
                                  key={st}
                                  onClick={() => updateParam('representationStyle', st)}
                                  title={REPRESENTATION_STYLE_META[st].description}
                                  className={`px-1 py-1 rounded text-[9px] font-medium truncate border cursor-pointer transition-colors ${
                                    active
                                      ? 'bg-emerald-500 text-slate-950 border-emerald-400 font-bold'
                                      : 'bg-[#0d141d] text-slate-300 border-slate-700/80 hover:border-emerald-500/50'
                                  }`}
                                >
                                  {REPRESENTATION_STYLE_META[st].short}
                                </button>
                              );
                            }
                          )}
                        </div>
                      </div>

                      <button
                        onClick={() => setActiveTab('ai_parts')}
                        className="w-full py-1 px-2 rounded bg-[#0d141d] hover:bg-amber-950/40 border border-amber-500/35 text-[10px] text-amber-200 font-medium flex items-center justify-between cursor-pointer"
                      >
                        <span className="flex items-center gap-1.5">
                          <Sparkles className="w-3 h-3 text-amber-400" />
                          Ver tarjetas visuales de Partes guardadas ({savedPartModules.length})
                        </span>
                        <span className="text-amber-400">Abrir →</span>
                      </button>

                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          value={newPartNameInput}
                          onChange={(e) => setNewPartNameInput(e.target.value)}
                          placeholder="Nombre opcional para guardar parte..."
                          className="flex-1 min-w-0 bg-[#0d141d] border border-slate-700 rounded px-2 py-1 text-[10px] text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
                        />
                        <button
                          onClick={() => {
                            const currentElem: CustomBotanicalElement = params.customElement || {
                              id: `elem_custom_${Date.now()}`,
                              name: `Elemento Modular #${params.seed}`,
                              scientificName: 'Botanica modularis sp.',
                              description: 'Combinación personalizada de tallo, superficie, copa y filamentos.',
                              createdAt: Date.now(),
                              stemStructure: 'multi_stalk_umbel_colony',
                              canopyElement: 'custom_fungi_cap',
                              surfaceElement: 'smooth_striated',
                              hangingElement: 'weeping_filaments',
                              lobeCount: 6,
                              cupDepth: 0.45,
                              spiralTurns: 1.35,
                              spiralArms: 8,
                              stemCount: 8,
                              trunkBentS: 0.32,
                              branchSpread: 0.65,
                              branchDroop: 0.18,
                              capDomeHeight: 0.56,
                              capSpotDensity: 0.85,
                              gillCount: 24,
                              petalOpenness: 0.35,
                              leafSerration: 0.4,
                              thornDensity: 0.15,
                              thornLength: 0.9,
                              filamentCount: 24,
                              filamentLength: 1.2,
                              padLayers: 6,
                            };
                            const autoLabel = `${STEM_STRUCTURE_META[currentElem.stemStructure]?.label.split(' ')[0] || 'Parte'} + ${CANOPY_ELEMENT_META[currentElem.canopyElement]?.label.split(' ')[0] || 'Copa'} #${params.seed}`;
                            const finalName = newPartNameInput.trim() || autoLabel;
                            const toSave: CustomBotanicalElement = {
                              ...currentElem,
                              id: `elem_user_${Date.now()}`,
                              name: finalName,
                              createdAt: Date.now(),
                            };
                            const updated = saveCustomElementToApp(toSave);
                            setCustomElements(updated);
                            const updatedModules = saveCustomPartModule(finalName, 'canopy', toSave);
                            setSavedPartModules(updatedModules);
                            setNewPartNameInput('');
                            updateParam('engine', 'composed_custom');
                            updateParam('foliageType', 'ai_custom_element');
                            updateParam('customElement', toSave);
                            showTempNotice(`Parte "${finalName}" guardada en biblioteca IA`);
                          }}
                          className="px-2 py-1 rounded bg-emerald-500/20 hover:bg-emerald-500/35 border border-emerald-400/50 text-emerald-200 text-[10px] font-semibold cursor-pointer shrink-0"
                        >
                          + Guardar Parte
                        </button>
                      </div>

                      {(() => {
                        const cleanPartName = (raw: string) =>
                          raw.replace(/^\d+\.\s*✨?\s*/, '').split('(')[0].trim();

                        const inferred = inferDefaultCustomElement(params);
                        const curStem = inferred.stemStructure;
                        const curCanopy = inferred.canopyElement;
                        const curSurface = inferred.surfaceElement;
                        const curHanging = inferred.hangingElement;
                        const curTip = inferred.synthesizedTipPrimitive || 'none';
                        const curBasal = inferred.synthesizedBasalFoliage || 'none';
                        const curBark = params.barkType;

                        const slots: Array<{
                          kind: PartThumbKind;
                          title: string;
                          value: string;
                          label: string;
                          fullWidth?: boolean;
                        }> = [
                          {
                            kind: 'stem',
                            title: 'Tallo / Tronco',
                            value: curStem,
                            label: cleanPartName(STEM_STRUCTURE_META[curStem]?.label || curStem),
                          },
                          {
                            kind: 'canopy',
                            title: 'Copa / Flor',
                            value: curCanopy,
                            label: cleanPartName(CANOPY_ELEMENT_META[curCanopy]?.label || curCanopy),
                          },
                          {
                            kind: 'surface',
                            title: 'Superficie',
                            value: curSurface,
                            label: cleanPartName(SURFACE_ELEMENT_META[curSurface]?.label || curSurface),
                          },
                          {
                            kind: 'hanging',
                            title: 'Colgantes',
                            value: curHanging,
                            label: cleanPartName(HANGING_ELEMENT_META[curHanging]?.label || curHanging),
                          },
                          {
                            kind: 'tip',
                            title: 'Puntas',
                            value: curTip,
                            label: cleanPartName(SYNTHESIZED_TIP_META[curTip]?.label || curTip),
                          },
                          {
                            kind: 'basal',
                            title: 'Base',
                            value: curBasal,
                            label: cleanPartName(SYNTHESIZED_BASAL_META[curBasal]?.label || curBasal),
                          },
                          {
                            kind: 'bark',
                            title: 'Shader Corteza',
                            value: curBark,
                            label: cleanPartName(BARK_TYPE_META[curBark]?.label || curBark),
                            fullWidth: true,
                          },
                        ];

                        const pickerOptions: Record<
                          PartThumbKind,
                          Array<{ id: string; label: string }>
                        > = {
                          stem: (Object.keys(STEM_STRUCTURE_META) as StemStructureType[]).map((k) => ({
                            id: k,
                            label: cleanPartName(STEM_STRUCTURE_META[k].label),
                          })),
                          canopy: (Object.keys(CANOPY_ELEMENT_META) as CanopyElementType[]).map((k) => ({
                            id: k,
                            label: cleanPartName(CANOPY_ELEMENT_META[k].label),
                          })),
                          surface: (Object.keys(SURFACE_ELEMENT_META) as SurfaceElementType[]).map((k) => ({
                            id: k,
                            label: cleanPartName(SURFACE_ELEMENT_META[k].label),
                          })),
                          hanging: (Object.keys(HANGING_ELEMENT_META) as HangingElementType[]).map((k) => ({
                            id: k,
                            label: cleanPartName(HANGING_ELEMENT_META[k].label),
                          })),
                          tip: (Object.keys(SYNTHESIZED_TIP_META) as SynthesizedTipPrimitive[]).map((k) => ({
                            id: k,
                            label: cleanPartName(SYNTHESIZED_TIP_META[k].label),
                          })),
                          basal: (Object.keys(SYNTHESIZED_BASAL_META) as SynthesizedBasalFoliageType[]).map((k) => ({
                            id: k,
                            label: cleanPartName(SYNTHESIZED_BASAL_META[k].label),
                          })),
                          bark: (Object.keys(BARK_TYPE_META) as BarkType[]).map((k) => ({
                            id: k,
                            label: cleanPartName(BARK_TYPE_META[k].label),
                          })),
                        };

                        const activeSlot = slots.find((s) => s.kind === activePartPicker);

                        return (
                          <div className="space-y-2">
                            <div className="grid grid-cols-2 gap-1.5">
                              {slots.map((slot) => {
                                const isOpen = activePartPicker === slot.kind;
                                return (
                                  <button
                                    key={slot.kind}
                                    onClick={() =>
                                      setActivePartPicker(isOpen ? null : slot.kind)
                                    }
                                    className={`${
                                      slot.fullWidth ? 'col-span-2' : ''
                                    } flex items-center gap-2 p-1.5 rounded-md border text-left transition-colors cursor-pointer ${
                                      isOpen
                                        ? 'bg-emerald-950/60 border-emerald-400'
                                        : 'bg-[#0d141d] border-slate-700/80 hover:border-emerald-500/50'
                                    }`}
                                    title={`Elegir ${slot.title} visualmente`}
                                  >
                                    <PartVisualThumb
                                      kind={slot.kind}
                                      value={slot.value}
                                      colorTrunk={params.colorTrunk}
                                      colorMain={params.colorLeafMain}
                                      colorTip={params.colorLeafTip}
                                      colorFlower={params.colorFlower}
                                      colorAccent={params.colorAccent}
                                      size={32}
                                    />
                                    <div className="min-w-0 flex-1">
                                      <div className="text-[9px] uppercase tracking-wider text-slate-400 font-semibold">
                                        {slot.title}
                                      </div>
                                      <div className="text-[10px] text-slate-100 font-medium truncate">
                                        {slot.label}
                                      </div>
                                    </div>
                                    <span className="text-[10px] text-slate-400 shrink-0">
                                      {isOpen ? '▴' : '▾'}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>

                            {activePartPicker && activeSlot && (
                              <div className="bg-[#0a1018] border border-emerald-500/45 rounded-lg p-2 space-y-1.5">
                                <div className="flex items-center justify-between">
                                  <span className="text-[10px] font-semibold text-emerald-300">
                                    Elige {activeSlot.title} ({pickerOptions[activePartPicker].length})
                                  </span>
                                  <button
                                    onClick={() => setActivePartPicker(null)}
                                    className="text-[10px] text-slate-400 hover:text-white cursor-pointer"
                                  >
                                    Cerrar ✕
                                  </button>
                                </div>
                                <div className="grid grid-cols-3 gap-1.5 max-h-56 overflow-y-auto studio-scroll pr-0.5">
                                  {pickerOptions[activePartPicker].map((opt) => {
                                    const selected = activeSlot.value === opt.id;
                                    return (
                                      <button
                                        key={opt.id}
                                        onClick={() => {
                                          if (activePartPicker === 'stem') {
                                            updateCustomPart({ stemStructure: opt.id as StemStructureType });
                                          } else if (activePartPicker === 'canopy') {
                                            const nextCanopy = opt.id as CanopyElementType;
                                            updateCustomPart({
                                              canopyElement: nextCanopy,
                                              synthesizedHeadTopology:
                                                nextCanopy === 'procedural_lathe_head'
                                                  ? 'revolved_lathe_chalice'
                                                  : nextCanopy === 'custom_spline_leaf_crown'
                                                  ? 'spline_petal_corona'
                                                  : 'none',
                                            });
                                          } else if (activePartPicker === 'surface') {
                                            updateCustomPart({ surfaceElement: opt.id as SurfaceElementType });
                                          } else if (activePartPicker === 'hanging') {
                                            updateCustomPart({ hangingElement: opt.id as HangingElementType });
                                          } else if (activePartPicker === 'tip') {
                                            updateCustomPart({ synthesizedTipPrimitive: opt.id as SynthesizedTipPrimitive });
                                          } else if (activePartPicker === 'basal') {
                                            updateCustomPart({ synthesizedBasalFoliage: opt.id as SynthesizedBasalFoliageType });
                                          } else if (activePartPicker === 'bark') {
                                            updateParam('barkType', opt.id as BarkType);
                                          }
                                        }}
                                        className={`flex flex-col items-center gap-1 p-1.5 rounded border text-center cursor-pointer transition-colors ${
                                          selected
                                            ? 'bg-emerald-500/20 border-emerald-400 text-emerald-200'
                                            : 'bg-[#111926] border-slate-800 hover:border-slate-600 text-slate-300'
                                        }`}
                                        title={opt.label}
                                      >
                                        <PartVisualThumb
                                          kind={activePartPicker}
                                          value={opt.id}
                                          colorTrunk={params.colorTrunk}
                                          colorMain={params.colorLeafMain}
                                          colorTip={params.colorLeafTip}
                                          colorFlower={params.colorFlower}
                                          colorAccent={params.colorAccent}
                                          size={38}
                                        />
                                        <span className="text-[9px] leading-tight line-clamp-2 w-full">
                                          {opt.label}
                                        </span>
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })()}

                      {params.customElement?.aiNewPartsReport && (
                        <div className="bg-emerald-950/40 border border-emerald-500/30 rounded px-2 py-1.5 text-[10px] text-emerald-200/90 leading-snug">
                          <span className="font-semibold text-emerald-300">Síntesis IA → 3D: </span>
                          {params.customElement.aiNewPartsReport}
                        </div>
                      )}
                    </div>
                  </details>

                  {/* 1B. CREADOR VISUAL DE NUEVAS PARTES (PERFIL REVOLUCIÓN & CURVA SPLINE PARA IA) */}
                  <details className="bg-[#131d2b] border border-amber-500/40 rounded-lg overflow-hidden group">
                    <summary className="px-3 py-2 bg-[#1a2232] cursor-pointer flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-amber-300 select-none">
                      <span className="flex items-center gap-1.5">
                        <Wand2 className="w-3.5 h-3.5 text-amber-400" />
                        Creador Visual de Nuevas Partes (IA)
                      </span>
                      <span className="text-[10px] text-slate-400 group-open:rotate-180 transition-transform">▾</span>
                    </summary>
                    <div className="p-2.5 space-y-2.5">
                      <p className="text-[10px] text-slate-400 leading-snug">
                        Esculpe una silueta 3D nueva por <strong className="text-amber-200">Revolución</strong> o <strong className="text-emerald-200">Curva Spline</strong> y guárdala para que la IA la reutilice.
                      </p>

                      <div className="grid grid-cols-2 gap-1.5">
                        <button
                          onClick={() =>
                            updateCustomPart({
                              canopyElement: 'procedural_lathe_head',
                              synthesizedHeadTopology: 'revolved_lathe_chalice',
                              latheProfileRadii:
                                params.customElement?.latheProfileRadii?.length &&
                                params.customElement.latheProfileRadii.length >= 4
                                  ? params.customElement.latheProfileRadii
                                  : [0.16, 0.68, 0.88, 0.56, 0.78, 0.92],
                            })
                          }
                          className={`py-1 px-2 rounded text-[10px] font-semibold border cursor-pointer ${
                            params.customElement?.canopyElement === 'procedural_lathe_head'
                              ? 'bg-amber-500 text-slate-950 border-amber-400'
                              : 'bg-[#0d141d] text-amber-200 border-amber-500/35 hover:border-amber-400'
                          }`}
                        >
                          Modo Revolución 3D
                        </button>
                        <button
                          onClick={() =>
                            updateCustomPart({
                              canopyElement: 'custom_spline_leaf_crown',
                              synthesizedHeadTopology: 'spline_petal_corona',
                              petalContourProfile:
                                params.customElement?.petalContourProfile?.length &&
                                params.customElement.petalContourProfile.length >= 4
                                  ? params.customElement.petalContourProfile
                                  : [0.14, 0.62, 0.98, 0.72, 0.94, 0.42, 0.08],
                            })
                          }
                          className={`py-1 px-2 rounded text-[10px] font-semibold border cursor-pointer ${
                            params.customElement?.canopyElement === 'custom_spline_leaf_crown'
                              ? 'bg-emerald-500 text-slate-950 border-emerald-400'
                              : 'bg-[#0d141d] text-emerald-200 border-emerald-500/35 hover:border-emerald-400'
                          }`}
                        >
                          Modo Hoja / Pétalo Spline
                        </button>
                      </div>

                      {params.customElement?.canopyElement === 'custom_spline_leaf_crown' ? (
                        (() => {
                          const contour =
                            Array.isArray(params.customElement?.petalContourProfile) &&
                            params.customElement.petalContourProfile.length >= 4
                              ? params.customElement.petalContourProfile
                              : [0.14, 0.62, 0.98, 0.72, 0.94, 0.42, 0.08];
                          const rightPts = contour
                            .map((w, idx) => {
                              const y = 92 - (idx / (contour.length - 1)) * 84;
                              const x = 60 + Math.min(1.4, Math.max(0.02, w)) * 36;
                              return `${x.toFixed(1)},${y.toFixed(1)}`;
                            })
                            .join(' ');
                          const leftPts = [...contour]
                            .reverse()
                            .map((w, rIdx) => {
                              const idx = contour.length - 1 - rIdx;
                              const y = 92 - (idx / (contour.length - 1)) * 84;
                              const x = 60 - Math.min(1.4, Math.max(0.02, w)) * 36;
                              return `${x.toFixed(1)},${y.toFixed(1)}`;
                            })
                            .join(' ');

                          return (
                            <div className="space-y-2 bg-[#0d141d] border border-emerald-500/30 rounded p-2">
                              <div className="flex items-center gap-2">
                                <svg
                                  viewBox="0 0 120 100"
                                  className="w-20 h-16 bg-[#080d14] rounded border border-slate-800 shrink-0"
                                >
                                  <line x1="60" y1="6" x2="60" y2="94" stroke="#1e293b" strokeDasharray="2 2" />
                                  <polygon
                                    points={`${rightPts} ${leftPts}`}
                                    fill="rgba(16, 185, 129, 0.28)"
                                    stroke="#34d399"
                                    strokeWidth="1.5"
                                  />
                                </svg>
                                <div className="flex-1 grid grid-cols-2 gap-1 text-[9px]">
                                  {[
                                    { label: 'Orquídea', pts: [0.16, 0.75, 1.15, 0.62, 1.08, 0.52, 0.1] },
                                    { label: 'Lanza', pts: [0.08, 0.42, 0.72, 0.68, 0.48, 0.24, 0.04] },
                                    { label: 'Corazón', pts: [0.22, 0.95, 1.12, 0.88, 0.56, 0.26, 0.05] },
                                    { label: 'Garra', pts: [0.45, 0.65, 0.48, 0.34, 0.22, 0.12, 0.03] },
                                  ].map((tpl) => (
                                    <button
                                      key={tpl.label}
                                      onClick={() =>
                                        updateCustomPart({
                                          canopyElement: 'custom_spline_leaf_crown',
                                          synthesizedHeadTopology: 'spline_petal_corona',
                                          petalContourProfile: tpl.pts,
                                        })
                                      }
                                      className="px-1.5 py-1 rounded bg-slate-800 hover:bg-emerald-950 border border-slate-700 text-emerald-200 cursor-pointer"
                                    >
                                      {tpl.label}
                                    </button>
                                  ))}
                                </div>
                              </div>

                              <div className="space-y-1">
                                <div className="text-[9px] text-slate-400">Anchura de contorno (Base → Punta):</div>
                                <div className="grid grid-cols-7 gap-1">
                                  {contour.map((val, idx) => (
                                    <div key={idx} className="flex flex-col items-center gap-0.5">
                                      <input
                                        type="range"
                                        min={0.04}
                                        max={1.35}
                                        step={0.04}
                                        value={val}
                                        onChange={(e) => {
                                          const next = [...contour];
                                          next[idx] = parseFloat(e.target.value);
                                          updateCustomPart({
                                            canopyElement: 'custom_spline_leaf_crown',
                                            synthesizedHeadTopology: 'spline_petal_corona',
                                            petalContourProfile: next,
                                          });
                                        }}
                                        className="w-full accent-emerald-400 cursor-pointer"
                                        title={`Punto ${idx + 1}: ${val.toFixed(2)}`}
                                      />
                                      <span className="text-[8px] font-mono text-emerald-300">
                                        {val.toFixed(1)}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>

                              <SliderControl
                                label="Acopamiento / Concavidad"
                                value={params.customElement?.petalCupping ?? 0.38}
                                min={-0.6}
                                max={0.95}
                                step={0.05}
                                onChange={(v) => updateCustomPart({ petalCupping: v })}
                              />
                              <SliderControl
                                label="Torsión Helicoidal"
                                value={params.customElement?.petalTwistDeg ?? 14}
                                min={0}
                                max={90}
                                step={2}
                                unit="°"
                                onChange={(v) => updateCustomPart({ petalTwistDeg: v })}
                              />
                              <SliderControl
                                label="Ondulación del Borde"
                                value={params.customElement?.petalMarginWave ?? 0.16}
                                min={0}
                                max={0.5}
                                step={0.02}
                                onChange={(v) => updateCustomPart({ petalMarginWave: v })}
                              />
                            </div>
                          );
                        })()
                      ) : (
                        (() => {
                          const radii =
                            Array.isArray(params.customElement?.latheProfileRadii) &&
                            params.customElement.latheProfileRadii.length >= 4
                              ? params.customElement.latheProfileRadii
                              : [0.16, 0.68, 0.88, 0.56, 0.78, 0.92];
                          const rightPts = radii
                            .map((r, idx) => {
                              const y = 92 - (idx / (radii.length - 1)) * 84;
                              const x = 60 + Math.min(1.3, Math.max(0.08, r)) * 38;
                              return `${x.toFixed(1)},${y.toFixed(1)}`;
                            })
                            .join(' ');
                          const leftPts = [...radii]
                            .reverse()
                            .map((r, rIdx) => {
                              const idx = radii.length - 1 - rIdx;
                              const y = 92 - (idx / (radii.length - 1)) * 84;
                              const x = 60 - Math.min(1.3, Math.max(0.08, r)) * 38;
                              return `${x.toFixed(1)},${y.toFixed(1)}`;
                            })
                            .join(' ');

                          return (
                            <div className="space-y-2 bg-[#0d141d] border border-amber-500/30 rounded p-2">
                              <div className="flex items-center gap-2">
                                <svg
                                  viewBox="0 0 120 100"
                                  className="w-20 h-16 bg-[#080d14] rounded border border-slate-800 shrink-0"
                                >
                                  <line x1="60" y1="6" x2="60" y2="94" stroke="#1e293b" strokeDasharray="2 2" />
                                  <polygon
                                    points={`${rightPts} ${leftPts}`}
                                    fill="rgba(245, 158, 11, 0.25)"
                                    stroke="#fbbf24"
                                    strokeWidth="1.5"
                                  />
                                </svg>
                                <div className="flex-1 grid grid-cols-2 gap-1 text-[9px]">
                                  {[
                                    { label: 'Cáliz', pts: [0.16, 0.68, 0.88, 0.56, 0.78, 0.92] },
                                    { label: 'Cono Espira', pts: [0.95, 0.76, 0.58, 0.4, 0.24, 0.1] },
                                    { label: 'Campana', pts: [0.98, 0.74, 0.52, 0.42, 0.34, 0.14] },
                                    { label: 'Odre / Bulbo', pts: [0.22, 0.92, 1.05, 0.78, 0.42, 0.55] },
                                  ].map((tpl) => (
                                    <button
                                      key={tpl.label}
                                      onClick={() =>
                                        updateCustomPart({
                                          canopyElement: 'procedural_lathe_head',
                                          synthesizedHeadTopology: 'revolved_lathe_chalice',
                                          latheProfileRadii: tpl.pts,
                                        })
                                      }
                                      className="px-1.5 py-1 rounded bg-slate-800 hover:bg-amber-950 border border-slate-700 text-amber-200 cursor-pointer"
                                    >
                                      {tpl.label}
                                    </button>
                                  ))}
                                </div>
                              </div>

                              <div className="space-y-1">
                                <div className="text-[9px] text-slate-400">Radios de revolución (Base → Borde):</div>
                                <div className="grid grid-cols-6 gap-1">
                                  {radii.map((val, idx) => (
                                    <div key={idx} className="flex flex-col items-center gap-0.5">
                                      <input
                                        type="range"
                                        min={0.08}
                                        max={1.3}
                                        step={0.04}
                                        value={val}
                                        onChange={(e) => {
                                          const next = [...radii];
                                          next[idx] = parseFloat(e.target.value);
                                          updateCustomPart({
                                            canopyElement: 'procedural_lathe_head',
                                            synthesizedHeadTopology: 'revolved_lathe_chalice',
                                            latheProfileRadii: next,
                                          });
                                        }}
                                        className="w-full accent-amber-400 cursor-pointer"
                                        title={`Radio ${idx + 1}: ${val.toFixed(2)}`}
                                      />
                                      <span className="text-[8px] font-mono text-amber-300">
                                        {val.toFixed(1)}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          );
                        })()
                      )}

                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          value={newPartNameInput}
                          onChange={(e) => setNewPartNameInput(e.target.value)}
                          placeholder="Nombre de esta nueva parte..."
                          className="flex-1 min-w-0 bg-[#0d141d] border border-slate-700 rounded px-2 py-1 text-[10px] text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-amber-400"
                        />
                        <button
                          onClick={() => {
                            const currentElem: CustomBotanicalElement = params.customElement || {
                              id: `elem_custom_${Date.now()}`,
                              name: `Parte Revolución #${params.seed}`,
                              scientificName: 'Botanica modularis sp.',
                              description: 'Silueta esculpida con el Creador Visual de Partes.',
                              createdAt: Date.now(),
                              stemStructure: 'herbaceous_curved_stalk',
                              canopyElement: 'procedural_lathe_head',
                              surfaceElement: 'smooth_striated',
                              hangingElement: 'none',
                              synthesizedHeadTopology: 'revolved_lathe_chalice',
                              latheProfileRadii: [0.16, 0.68, 0.88, 0.56, 0.78, 0.92],
                              lobeCount: 6,
                              cupDepth: 0.45,
                              spiralTurns: 1.25,
                              spiralArms: 6,
                              stemCount: 1,
                              trunkBentS: 0.25,
                              branchSpread: 0.55,
                              branchDroop: 0.15,
                              capDomeHeight: 0.56,
                              capSpotDensity: 0.5,
                              gillCount: 20,
                              petalOpenness: 0.45,
                              leafSerration: 0.35,
                              thornDensity: 0.1,
                              thornLength: 0.8,
                              filamentCount: 12,
                              filamentLength: 1.0,
                              padLayers: 6,
                            };
                            const isSpline = currentElem.canopyElement === 'custom_spline_leaf_crown';
                            const finalName =
                              newPartNameInput.trim() ||
                              `${isSpline ? 'Hoja Spline' : 'Cáliz Revolución'} #${params.seed}`;
                            const toSave: CustomBotanicalElement = {
                              ...currentElem,
                              id: `elem_user_${Date.now()}`,
                              name: finalName,
                              createdAt: Date.now(),
                            };
                            setCustomElements(saveCustomElementToApp(toSave));
                            setSavedPartModules(saveCustomPartModule(finalName, 'canopy', toSave));
                            setNewPartNameInput('');
                            updateParam('engine', 'composed_custom');
                            updateParam('foliageType', 'ai_custom_element');
                            updateParam('customElement', toSave);
                            showTempNotice(`Nueva parte "${finalName}" guardada para la IA`);
                          }}
                          className="px-2.5 py-1 rounded bg-amber-500/20 hover:bg-amber-500/35 border border-amber-400/50 text-amber-200 text-[10px] font-semibold cursor-pointer shrink-0"
                        >
                          + Guardar para IA
                        </button>
                      </div>
                    </div>
                  </details>

                  {/* 2, 3 y 4: SLIDERS CONTEXTUALES — SOLO LOS ÚTILES PARA LA ESPECIE EN EL VISOR */}
                  {(() => {
                    const isComposed = params.engine === 'composed_custom';
                    const isCactus = params.engine === 'cactus';
                    const isConifer = params.engine === 'monopodial';
                    const isMossFungiEngine = params.engine === 'moss_fungi_rock';
                    const isAquatic = params.engine === 'aquatic_coral_algae';
                    const isTreeLike = ['sympodial', 'monopodial', 'weeping', 'palm', 'shrub', 'bamboo'].includes(params.engine);

                    const stem = params.customElement?.stemStructure || 'multi_stalk_umbel_colony';
                    const canopy = params.customElement?.canopyElement || 'custom_fungi_cap';
                    const surface = params.customElement?.surfaceElement || 'smooth_striated';
                    const hanging = params.customElement?.hangingElement || 'none';
                    const basal = params.customElement?.synthesizedBasalFoliage || 'none';
                    const headTopo = params.customElement?.synthesizedHeadTopology || 'none';

                    const showMultiStemSlider =
                      isComposed && !['herbaceous_curved_stalk', 'baobab_pachycaul_bottle'].includes(stem);
                    const showSCurveSlider =
                      isComposed && !['rosette_cluster', 'segmented_bamboo_equisetum'].includes(stem);
                    const showBranchSpreadSlider =
                      isComposed && !['rosette_cluster', 'creeping_rhizome_runners'].includes(stem);
                    const showDroopSlider =
                      isComposed && ['weeping_willow', 'sympodial_tree', 'mangrove_stilt_arch', 'dichotomous_dragon_tree'].includes(stem);
                    const showSpiralSlider =
                      isComposed && (stem === 'spiral_volute_vine' || stem === 'braided_helix_trunks' || surface === 'braided_vines' || hanging === 'curling_tendrils');
                    const showGnarlSlider =
                      isTreeLike || (isComposed && !['herbaceous_curved_stalk', 'segmented_bamboo_equisetum'].includes(stem));

                    const showFungiSliders = isComposed && canopy === 'custom_fungi_cap';
                    const showUmbelOrSciFiSliders =
                      isComposed &&
                      (canopy === 'spherical_bubble_umbel' ||
                        headTopo === 'spherical_umbel_rays' ||
                        canopy === 'scifi_biolum_plasma_globes' ||
                        canopy === 'scifi_voronoi_ova_balloons');
                    const showBasalSliders = isComposed && basal !== 'none';
                    const showFlowerSliders =
                      isComposed &&
                      [
                        'custom_flower_corolla',
                        'radiating_floret_head',
                        'lotus_magnolia_corolla_crown',
                        'passionflower_filament_corona',
                        'heliconia_bract_candelabra',
                        'custom_spline_leaf_crown',
                        'hanging_bell_cluster',
                        'crystal_prism_crown',
                        'succulent_fleshy_rosettes',
                      ].includes(canopy);
                    const showLeafShapeSliders =
                      (isTreeLike && params.foliageType !== 'none') ||
                      (isComposed &&
                        [
                          'custom_leaf_lamina',
                          'stem_hugging_leaves',
                          'fenestrated_monstera_leaves',
                          'palmate_maple_star_leaves',
                          'pinnate_fern_palm_fronds',
                          'custom_spline_leaf_crown',
                        ].includes(canopy));
                    const showPadLayerSlider =
                      isComposed &&
                      ['cloud_bonsai_pads', 'succulent_fleshy_rosettes', 'lotus_magnolia_corolla_crown', 'custom_spline_leaf_crown'].includes(canopy);

                    const showFilamentSliders =
                      isComposed &&
                      (hanging !== 'none' || canopy === 'custom_fungi_cap' || canopy === 'passionflower_filament_corona');
                    const showThornSliders =
                      isComposed &&
                      (['curved_thorns_spines', 'rose_hooked_prickles', 'cactus_areole_spine_bursts'].includes(surface) ||
                        canopy === 'thorn_spur_clusters' ||
                        stem === 'thorny_horn_crown' ||
                        hanging === 'thorny_barbed_whips');

                    const showRootsControls =
                      !['moss_fungi_rock', 'aquatic_coral_algae', 'cactus', 'rosette', 'bamboo'].includes(params.engine);
                    const showSection4 = showFilamentSliders || showThornSliders || showRootsControls;

                    return (
                      <>
                        {/* 2. SLIDERS DE TRONCO, TALLOS Y RAMAS / ROCA */}
                        <details
                          ref={trunkSectionRef}
                          open
                          className={`bg-[#131d2b] border rounded-lg overflow-hidden group transition-all ${
                            highlightedPart === 'trunk'
                              ? 'border-emerald-400 ring-2 ring-emerald-400/70 shadow-lg'
                              : 'border-slate-800/90'
                          }`}
                        >
                          <summary className="px-3 py-2 bg-[#162130] cursor-pointer flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-emerald-400 select-none">
                            <span>
                              {isMossFungiEngine
                                ? '2. Roca 3D, Musgo y Colonia'
                                : isAquatic
                                ? '2. Arrecife, Corales y Frondas'
                                : '2. Tronco, Tallos y Ramas'}
                            </span>
                            <span className="text-[10px] text-slate-400 group-open:rotate-180 transition-transform">▾</span>
                          </summary>
                          <div className="p-2.5 space-y-2">
                            {!isMossFungiEngine && (
                              <>
                                <SliderControl
                                  label="Altura Total del Espécimen"
                                  value={params.height}
                                  min={1.5}
                                  max={22}
                                  step={0.2}
                                  unit="m"
                                  onChange={(v) => updateParam('height', v)}
                                />
                                <SliderControl
                                  label="Grosor de Tronco / Tallos"
                                  value={params.radius}
                                  min={0.08}
                                  max={1.8}
                                  step={0.02}
                                  unit="m"
                                  onChange={(v) => updateParam('radius', v)}
                                />
                              </>
                            )}
                            {isTreeLike && (
                              <>
                                <SliderControl
                                  label="Nº de Ramas por Nivel"
                                  value={params.branchCount}
                                  min={2}
                                  max={9}
                                  step={1}
                                  onChange={(v) => updateParam('branchCount', v)}
                                />
                                <SliderControl
                                  label="Ángulo de Ramificación"
                                  value={params.angle}
                                  min={15}
                                  max={82}
                                  step={1}
                                  unit="°"
                                  onChange={(v) => updateParam('angle', v)}
                                />
                              </>
                            )}
                            {isCactus && (
                              <>
                                <SliderControl
                                  label="Costillas del Cactus"
                                  value={params.cactusRibs}
                                  min={6}
                                  max={24}
                                  step={1}
                                  onChange={(v) => updateParam('cactusRibs', v)}
                                />
                                <SliderControl
                                  label="Brazos del Cactus"
                                  value={params.armCount}
                                  min={0}
                                  max={10}
                                  step={1}
                                  onChange={(v) => updateParam('armCount', v)}
                                />
                                <SliderControl
                                  label="Espinas por Aréola"
                                  value={params.spinesPerAreole}
                                  min={0}
                                  max={14}
                                  step={1}
                                  onChange={(v) => updateParam('spinesPerAreole', v)}
                                />
                              </>
                            )}
                            {isMossFungiEngine && (
                              <>
                                <SliderControl
                                  label="Escala de Roca Base"
                                  value={params.rockScale ?? 1.0}
                                  min={0.5}
                                  max={1.8}
                                  step={0.05}
                                  unit="×"
                                  onChange={(v) => updateParam('rockScale', v)}
                                />
                                <SliderControl
                                  label="Rugosidad & Estratos de Roca"
                                  value={params.rockRoughness ?? 0.65}
                                  min={0.15}
                                  max={1.3}
                                  step={0.05}
                                  onChange={(v) => updateParam('rockRoughness', v)}
                                />
                                <SliderControl
                                  label="Cobertura de Musgo"
                                  value={params.mossCoverage ?? 0.75}
                                  min={0.1}
                                  max={1}
                                  step={0.05}
                                  onChange={(v) => updateParam('mossCoverage', v)}
                                />
                                <SliderControl
                                  label="Cantidad de Hongos / Esporofitos"
                                  value={params.branchCount}
                                  min={1}
                                  max={12}
                                  step={1}
                                  onChange={(v) => updateParam('branchCount', v)}
                                />
                              </>
                            )}
                            {isAquatic && (
                              <>
                                <SliderControl
                                  label="Ramas / Tubos / Frondas"
                                  value={params.branchCount}
                                  min={2}
                                  max={10}
                                  step={1}
                                  onChange={(v) => updateParam('branchCount', v)}
                                />
                                <SliderControl
                                  label="Tamaño de Pólipos / Frondas"
                                  value={params.leafScale}
                                  min={0.5}
                                  max={2.2}
                                  step={0.05}
                                  unit="×"
                                  onChange={(v) => updateParam('leafScale', v)}
                                />
                                <SliderControl
                                  label="Escala de Roca Arrecifal"
                                  value={params.rockScale ?? 1.0}
                                  min={0.5}
                                  max={1.8}
                                  step={0.05}
                                  unit="×"
                                  onChange={(v) => updateParam('rockScale', v)}
                                />
                                <SliderControl
                                  label="Ondulación Corriente Marina"
                                  value={params.gnarl}
                                  min={0}
                                  max={0.8}
                                  step={0.05}
                                  onChange={(v) => updateParam('gnarl', v)}
                                />
                              </>
                            )}
                            {showMultiStemSlider && (
                              <SliderControl
                                label="Nº de Tallos / Ramas Principales"
                                value={params.customElement?.stemCount ?? params.customElement?.spiralArms ?? 6}
                                min={1}
                                max={12}
                                step={1}
                                onChange={(v) => updateCustomPart({ stemCount: v, spiralArms: v })}
                              />
                            )}
                            {showSCurveSlider && (
                              <SliderControl
                                label="Curvatura en S del Tronco / Tallo"
                                value={params.customElement?.trunkBentS ?? 0.35}
                                min={0}
                                max={1}
                                step={0.05}
                                onChange={(v) => updateCustomPart({ trunkBentS: v })}
                              />
                            )}
                            {showBranchSpreadSlider && (
                              <SliderControl
                                label="Apertura / Extensión de Ramas"
                                value={params.customElement?.branchSpread ?? 0.65}
                                min={0.15}
                                max={1.2}
                                step={0.05}
                                onChange={(v) => {
                                  updateParam('angle', Math.round(18 + v * 52));
                                  updateCustomPart({ branchSpread: v });
                                }}
                              />
                            )}
                            {showDroopSlider && (
                              <SliderControl
                                label="Caída Péndula de Ramas"
                                value={params.customElement?.branchDroop ?? Math.max(0, -params.gravity)}
                                min={0}
                                max={1}
                                step={0.05}
                                onChange={(v) => {
                                  updateParam('gravity', -v * 0.55);
                                  updateCustomPart({ branchDroop: v });
                                }}
                              />
                            )}
                            {showSpiralSlider && (
                              <SliderControl
                                label="Vueltas de Espiral / Voluta"
                                value={params.customElement?.spiralTurns ?? 1.35}
                                min={0.4}
                                max={2.6}
                                step={0.05}
                                onChange={(v) => updateCustomPart({ spiralTurns: v })}
                              />
                            )}
                            {showGnarlSlider && (
                              <SliderControl
                                label="Torsión / Nudosidad de Corteza"
                                value={params.gnarl}
                                min={0}
                                max={1}
                                step={0.05}
                                onChange={(v) => updateParam('gnarl', v)}
                              />
                            )}
                          </div>
                        </details>

                        {/* 3. SLIDERS CONTEXTUALES DE COPA, FLORES U HOJAS */}
                        {!isCactus && !isAquatic && (
                          <details
                            ref={canopySectionRef}
                            open
                            className={`bg-[#131d2b] border rounded-lg overflow-hidden group transition-all ${
                              highlightedPart === 'canopy'
                                ? 'border-emerald-400 ring-2 ring-emerald-400/70 shadow-lg'
                                : 'border-slate-800/90'
                            }`}
                          >
                            <summary className="px-3 py-2 bg-[#162130] cursor-pointer flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-emerald-400 select-none">
                              <span>3. Copa, Flores y Hojas</span>
                              <span className="text-[10px] text-slate-400 group-open:rotate-180 transition-transform">▾</span>
                            </summary>
                            <div className="p-2.5 space-y-2">
                              <SliderControl
                                label="Tamaño de Copa / Flor / Hoja"
                                value={params.leafScale}
                                min={0.35}
                                max={2.6}
                                step={0.05}
                                unit="×"
                                onChange={(v) => updateParam('leafScale', v)}
                              />
                              <SliderControl
                                label="Densidad de Copa / Follaje"
                                value={params.leafDensity}
                                min={1}
                                max={8}
                                step={1}
                                onChange={(v) => updateParam('leafDensity', v)}
                              />
                              {isConifer && (
                                <>
                                  <SliderControl
                                    label="Longitud de Acículas"
                                    value={params.needleLength}
                                    min={0.4}
                                    max={2.0}
                                    step={0.05}
                                    unit="×"
                                    onChange={(v) => updateParam('needleLength', v)}
                                  />
                                  <SliderControl
                                    label="Densidad de Piñas"
                                    value={params.pineConeDensity}
                                    min={0}
                                    max={1}
                                    step={0.05}
                                    onChange={(v) => updateParam('pineConeDensity', v)}
                                  />
                                </>
                              )}
                              {showUmbelOrSciFiSliders && (
                                <>
                                  <SliderControl
                                    label="Radios de Umbela Esférica"
                                    value={params.customElement?.umbelRayCount ?? 64}
                                    min={16}
                                    max={110}
                                    step={2}
                                    onChange={(v) => updateCustomPart({ umbelRayCount: v })}
                                  />
                                  <SliderControl
                                    label="Esfericidad 3D de Umbela"
                                    value={params.customElement?.umbelSphereRatio ?? 0.94}
                                    min={0.25}
                                    max={1.0}
                                    step={0.02}
                                    onChange={(v) => updateCustomPart({ umbelSphereRatio: v })}
                                  />
                                  <SliderControl
                                    label="Tamaño de Burbujas / Orbes"
                                    value={params.customElement?.tipBubbleScale ?? 1.15}
                                    min={0.4}
                                    max={2.2}
                                    step={0.05}
                                    unit="×"
                                    onChange={(v) => updateCustomPart({ tipBubbleScale: v })}
                                  />
                                  <SliderControl
                                    label="Iridiscencia Multicolor"
                                    value={params.customElement?.iridescentShift ?? 0.85}
                                    min={0}
                                    max={1}
                                    step={0.05}
                                    onChange={(v) => updateCustomPart({ iridescentShift: v })}
                                  />
                                </>
                              )}
                              {showBasalSliders && (
                                <>
                                  <SliderControl
                                    label="Nº Hojas Basales"
                                    value={params.customElement?.basalLeafCount ?? 14}
                                    min={0}
                                    max={28}
                                    step={1}
                                    onChange={(v) => updateCustomPart({ basalLeafCount: v })}
                                  />
                                  <SliderControl
                                    label="Longitud Hojas Basales"
                                    value={params.customElement?.basalLeafLength ?? 1.15}
                                    min={0.4}
                                    max={2.2}
                                    step={0.05}
                                    unit="×"
                                    onChange={(v) => updateCustomPart({ basalLeafLength: v })}
                                  />
                                </>
                              )}
                              {showFungiSliders && (
                                <>
                                  <SliderControl
                                    label="Abombamiento de Domo / Sombrero"
                                    value={params.customElement?.capDomeHeight ?? 0.62}
                                    min={0.15}
                                    max={1.25}
                                    step={0.05}
                                    onChange={(v) => updateCustomPart({ capDomeHeight: v })}
                                  />
                                  <SliderControl
                                    label="Motas / Verrugas 3D en Sombrero"
                                    value={params.customElement?.capSpotDensity ?? 0.65}
                                    min={0}
                                    max={1}
                                    step={0.05}
                                    onChange={(v) => updateCustomPart({ capSpotDensity: v })}
                                  />
                                  <SliderControl
                                    label="Nº de Laminillas Inferiores"
                                    value={params.customElement?.gillCount ?? 22}
                                    min={8}
                                    max={36}
                                    step={2}
                                    onChange={(v) => updateCustomPart({ gillCount: v })}
                                  />
                                </>
                              )}
                              {showFlowerSliders && (
                                <>
                                  <SliderControl
                                    label="Apertura de Pétalos / Corola"
                                    value={params.customElement?.petalOpenness ?? 0.45}
                                    min={0.05}
                                    max={1}
                                    step={0.05}
                                    onChange={(v) => updateCustomPart({ petalOpenness: v })}
                                  />
                                  <SliderControl
                                    label="Nº de Pétalos / Lóbulos"
                                    value={params.customElement?.lobeCount ?? 6}
                                    min={3}
                                    max={12}
                                    step={1}
                                    onChange={(v) => updateCustomPart({ lobeCount: v })}
                                  />
                                  <SliderControl
                                    label="Concavidad de Copa / Flor"
                                    value={params.customElement?.cupDepth ?? 0.45}
                                    min={0.05}
                                    max={0.95}
                                    step={0.05}
                                    onChange={(v) => updateCustomPart({ cupDepth: v })}
                                  />
                                </>
                              )}
                              {showPadLayerSlider && (
                                <SliderControl
                                  label="Capas / Niveles de Copa"
                                  value={params.customElement?.padLayers ?? 6}
                                  min={2}
                                  max={12}
                                  step={1}
                                  onChange={(v) => updateCustomPart({ padLayers: v })}
                                />
                              )}
                              {showLeafShapeSliders && (
                                <>
                                  {isComposed && (
                                    <SliderControl
                                      label="Aserrado de Borde de Hoja"
                                      value={params.customElement?.leafSerration ?? 0.35}
                                      min={0}
                                      max={1}
                                      step={0.05}
                                      onChange={(v) => updateCustomPart({ leafSerration: v })}
                                    />
                                  )}
                                  <SliderControl
                                    label="Ancho de Lámina Foliar"
                                    value={params.leafWidthRatio}
                                    min={0.2}
                                    max={1.2}
                                    step={0.05}
                                    onChange={(v) => updateParam('leafWidthRatio', v)}
                                  />
                                  <SliderControl
                                    label="Curvatura / Arco de Hoja"
                                    value={params.leafBend}
                                    min={0}
                                    max={0.9}
                                    step={0.05}
                                    onChange={(v) => updateParam('leafBend', v)}
                                  />
                                </>
                              )}
                            </div>
                          </details>
                        )}

                        {/* 4. SLIDERS CONTEXTUALES DE FILAMENTOS, ESPINAS Y RAÍCES */}
                        {showSection4 && (
                        <details
                          ref={rootsSectionRef}
                          open
                          className={`bg-[#131d2b] border rounded-lg overflow-hidden group transition-all ${
                            highlightedPart === 'roots'
                              ? 'border-emerald-400 ring-2 ring-emerald-400/70 shadow-lg'
                              : 'border-slate-800/90'
                          }`}
                        >
                          <summary className="px-3 py-2 bg-[#162130] cursor-pointer flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-emerald-400 select-none">
                            <span>
                              4.{' '}
                              {[
                                showFilamentSliders ? 'Filamentos' : '',
                                showThornSliders ? 'Espinas' : '',
                                showRootsControls ? 'Raíces' : '',
                              ]
                                .filter(Boolean)
                                .join(', ')}
                            </span>
                            <span className="text-[10px] text-slate-400 group-open:rotate-180 transition-transform">▾</span>
                          </summary>
                          <div className="p-2.5 space-y-2">
                            {showFilamentSliders && (
                              <>
                                <SliderControl
                                  label="Cantidad de Filamentos / Zarcillos"
                                  value={params.customElement?.filamentCount ?? 22}
                                  min={0}
                                  max={48}
                                  step={2}
                                  onChange={(v) => updateCustomPart({ filamentCount: v })}
                                />
                                <SliderControl
                                  label="Longitud de Filamentos Colgantes"
                                  value={params.customElement?.filamentLength ?? 1.15}
                                  min={0.2}
                                  max={2.5}
                                  step={0.05}
                                  unit="×"
                                  onChange={(v) => updateCustomPart({ filamentLength: v })}
                                />
                              </>
                            )}
                            {showThornSliders && (
                              <>
                                <SliderControl
                                  label="Densidad de Espinas / Aguijones"
                                  value={params.customElement?.thornDensity ?? 0.2}
                                  min={0}
                                  max={1}
                                  step={0.05}
                                  onChange={(v) => updateCustomPart({ thornDensity: v })}
                                />
                                <SliderControl
                                  label="Longitud de Espinas"
                                  value={params.customElement?.thornLength ?? 0.85}
                                  min={0.2}
                                  max={2.2}
                                  step={0.05}
                                  unit="×"
                                  onChange={(v) => updateCustomPart({ thornLength: v })}
                                />
                              </>
                            )}
                            {showRootsControls && (
                              <>
                                <div className="pt-1 border-t border-slate-800/80 flex items-center justify-between">
                                  <span className="text-[11px] text-slate-300">Raíces Superficiales Visibles</span>
                                  <input
                                    type="checkbox"
                                    checked={params.showRoots}
                                    onChange={(e) => updateParam('showRoots', e.target.checked)}
                                    className="accent-emerald-400 cursor-pointer"
                                  />
                                </div>
                                {params.showRoots && (
                                  <>
                                    <SliderControl
                                      label="Número de Raíces Principales"
                                      value={params.rootCount ?? 5}
                                      min={2}
                                      max={14}
                                      step={1}
                                      onChange={(v) => updateParam('rootCount', v)}
                                    />
                                    <SliderControl
                                      label="Extensión Radial de Raíces"
                                      value={params.rootLength ?? 1.2}
                                      min={0.6}
                                      max={4.5}
                                      step={0.1}
                                      unit="m"
                                      onChange={(v) => updateParam('rootLength', v)}
                                    />
                                    <SliderControl
                                      label="Grosor de Raíces"
                                      value={params.rootThickness ?? 1.0}
                                      min={0.25}
                                      max={1.5}
                                      step={0.05}
                                      unit="×"
                                      onChange={(v) => updateParam('rootThickness', v)}
                                    />
                                  </>
                                )}
                              </>
                            )}
                          </div>
                        </details>
                        )}
                      </>
                    );
                  })()}

                  {/* 5. COLORES Y BRILLO DE CADA PARTE */}
                  <details open className="bg-[#131d2b] border border-slate-800/90 rounded-lg overflow-hidden group">
                    <summary className="px-3 py-2 bg-[#162130] cursor-pointer flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-emerald-400 select-none">
                      <span>5. Colores y Brillo por Parte</span>
                      <span className="text-[10px] text-slate-400 group-open:rotate-180 transition-transform">▾</span>
                    </summary>
                    <div className="p-2.5 space-y-2.5">
                      <div className="grid grid-cols-5 gap-1.5 text-center">
                        <label className="flex flex-col items-center gap-1 text-[10px] text-slate-400">
                          <span>Tallo/Tronco</span>
                          <input
                            type="color"
                            value={params.colorTrunk}
                            onChange={(e) => updateParam('colorTrunk', e.target.value)}
                            className="w-full h-6 rounded cursor-pointer bg-transparent border border-slate-700"
                          />
                        </label>
                        <label className="flex flex-col items-center gap-1 text-[10px] text-slate-400">
                          <span>Copa/Domo</span>
                          <input
                            type="color"
                            value={params.colorLeafMain}
                            onChange={(e) => updateParam('colorLeafMain', e.target.value)}
                            className="w-full h-6 rounded cursor-pointer bg-transparent border border-slate-700"
                          />
                        </label>
                        <label className="flex flex-col items-center gap-1 text-[10px] text-slate-400">
                          <span>Borde/Ápice</span>
                          <input
                            type="color"
                            value={params.colorLeafTip}
                            onChange={(e) => updateParam('colorLeafTip', e.target.value)}
                            className="w-full h-6 rounded cursor-pointer bg-transparent border border-slate-700"
                          />
                        </label>
                        <label className="flex flex-col items-center gap-1 text-[10px] text-slate-400">
                          <span>Lámina/Flor</span>
                          <input
                            type="color"
                            value={params.colorFlower}
                            onChange={(e) => updateParam('colorFlower', e.target.value)}
                            className="w-full h-6 rounded cursor-pointer bg-transparent border border-slate-700"
                          />
                        </label>
                        <label className="flex flex-col items-center gap-1 text-[10px] text-emerald-400">
                          <span>Motas/Biol.</span>
                          <input
                            type="color"
                            value={params.colorAccent || params.colorFlower}
                            onChange={(e) => updateParam('colorAccent', e.target.value)}
                            className="w-full h-6 rounded cursor-pointer bg-transparent border border-emerald-500/50"
                          />
                        </label>
                      </div>

                      <SliderControl
                        label="Intensidad Bioluminiscente (Motas/Hifas)"
                        value={params.emissiveIntensity ?? 0.35}
                        min={0}
                        max={2.5}
                        step={0.05}
                        onChange={(v) => updateParam('emissiveIntensity', v)}
                      />
                      <SliderControl
                        label="Humedad / Brillo Superficial"
                        value={params.wetnessGloss ?? 0.25}
                        min={0}
                        max={1}
                        step={0.05}
                        onChange={(v) => updateParam('wetnessGloss', v)}
                      />
                      <SliderControl
                        label="Rotación Global de Tono (Hue)"
                        value={params.hueShift ?? 0}
                        min={-180}
                        max={180}
                        step={5}
                        unit="°"
                        onChange={(v) => updateParam('hueShift', v)}
                      />
                    </div>
                  </details>
                </div>
              )}

              {/* TAB 7: CONTINUOUS VERTEX SLIDER, TREE3D REPRESENTATION STYLES, LOD & EXPORT */}
              {activeTab === 'representation' && (
                <div className="flex flex-col gap-3.5">
                  <div className="bg-[#132229] border border-emerald-500/40 rounded-lg p-3 space-y-3">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-emerald-400">
                      Control Continuo de Vértices & Polígonos (Low-Poly ↔ Máximo)
                    </div>

                    <SliderControl
                      label="Densidad de Vértices (Low Polígonos ↔ Máx)"
                      value={quality.meshDensity}
                      min={0.2}
                      max={2.0}
                      step={0.05}
                      unit="×"
                      onChange={(v) => updateQuality('meshDensity', v)}
                    />

                    <div className="grid grid-cols-4 gap-1">
                      {(['low', 'medium', 'high', 'ultra'] as PolygonLOD[]).map((lod) => (
                        <button
                          key={lod}
                          onClick={() => updateQuality('polygonLod', lod)}
                          className={`py-1 rounded border text-[11px] font-mono uppercase cursor-pointer ${
                            quality.polygonLod === lod
                              ? 'bg-emerald-500 text-slate-950 font-bold border-emerald-400'
                              : 'bg-[#0e151f] text-slate-300 border-slate-700'
                          }`}
                        >
                          {lod}
                        </button>
                      ))}
                    </div>

                    <SliderControl
                      label="Segmentos Radiales Tronco / Tallo"
                      value={params.radialSegments}
                      min={4}
                      max={20}
                      step={1}
                      onChange={(v) => updateParam('radialSegments', v)}
                    />

                    <label className="flex items-center justify-between text-xs text-slate-300 cursor-pointer pt-1">
                      <span>Normales Suavizadas Orgánicas (Smooth Shading)</span>
                      <input
                        type="checkbox"
                        checked={params.smoothShading}
                        onChange={(e) => updateParam('smoothShading', e.target.checked)}
                        className="accent-emerald-500 w-4 h-4"
                      />
                    </label>
                  </div>

                  <div className="bg-[#151e2c] border border-slate-800/80 rounded-lg p-3 space-y-2.5">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-emerald-400">
                      7 Estilos de Representación (Tree3D-Web / Florasynth)
                    </div>
                    {(Object.keys(REPRESENTATION_STYLE_META) as RepresentationStyle[]).map((st) => {
                      const info = REPRESENTATION_STYLE_META[st];
                      const active = params.representationStyle === st;
                      return (
                        <button
                          key={st}
                          onClick={() => updateParam('representationStyle', st)}
                          className={`w-full text-left p-2 rounded border transition-all cursor-pointer flex items-center justify-between gap-2 ${
                            active
                              ? 'bg-emerald-950/60 border-emerald-500'
                              : 'bg-[#0e151f] border-slate-800 hover:border-slate-700'
                          }`}
                        >
                          <div>
                            <div className="text-xs font-semibold text-slate-100">{info.short}</div>
                            <div className="text-[10px] text-slate-400 line-clamp-1">
                              {info.description}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  <div className="bg-[#151e2c] border border-slate-800/80 rounded-lg p-3 space-y-3">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-emerald-400">
                      Envolvente, Sol & Exportación 3D
                    </div>

                    <select
                      value={params.crownShape}
                      onChange={(e) =>
                        updateParam('crownShape', e.target.value as CrownEnvelopeShape)
                      }
                      className="w-full bg-[#0e151f] border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200"
                    >
                      {(Object.keys(CROWN_SHAPE_META) as CrownEnvelopeShape[]).map((sh) => (
                        <option key={sh} value={sh}>
                          {CROWN_SHAPE_META[sh].label}
                        </option>
                      ))}
                    </select>

                    <SliderControl
                      label="Opacidad de Copa (Rayos X)"
                      value={params.canopyOpacity}
                      min={0.2}
                      max={1.0}
                      step={0.05}
                      onChange={(v) => updateParam('canopyOpacity', v)}
                    />
                    <SliderControl
                      label="Elevación Solar"
                      value={params.sunElevation}
                      min={10}
                      max={88}
                      step={1}
                      unit="°"
                      onChange={(v) => updateParam('sunElevation', v)}
                    />
                    <SliderControl
                      label="Acimut Solar (Brújula)"
                      value={params.sunAzimuth}
                      min={0}
                      max={360}
                      step={2}
                      unit="°"
                      onChange={(v) => updateParam('sunAzimuth', v)}
                    />

                    <div className="flex items-center justify-between pt-1">
                      <span className="text-xs text-slate-300 flex items-center gap-1.5">
                        <Wind className="w-3.5 h-3.5 text-emerald-400" /> Animación de Viento
                      </span>
                      <input
                        type="checkbox"
                        checked={params.windEnabled}
                        onChange={(e) => updateParam('windEnabled', e.target.checked)}
                        className="accent-emerald-500 w-4 h-4"
                      />
                    </div>

                    <div className="grid grid-cols-3 gap-1.5 pt-1">
                      <button
                        onClick={() => viewportRef.current?.exportGLB()}
                        className="py-1.5 rounded bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-[11px] cursor-pointer"
                      >
                        .GLB
                      </button>
                      <button
                        onClick={() => viewportRef.current?.exportOBJ()}
                        className="py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold text-[11px] cursor-pointer"
                      >
                        .OBJ
                      </button>
                      <button
                        onClick={() => viewportRef.current?.captureSnapshot()}
                        className="py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold text-[11px] flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <Camera className="w-3 h-3 text-emerald-400" /> PNG
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </aside>
        )}

        {/* Right 3D Viewport Pane — 100% Clean & Unobstructed (All Toolbars Moved Up to the Compact Top Header Bar) */}
        <main className="flex-1 h-full relative overflow-hidden">
          <TreeViewport
            ref={viewportRef}
            params={params}
            quality={quality}
            onStatsUpdate={setStats}
            onPartClick={handleViewportPartClick}
          />

          {/* Compact Telemetry Badge at Bottom-Right Corner */}
          <div className="absolute bottom-2.5 right-3 pointer-events-none z-20">
            <div className="pointer-events-auto bg-[#0e151f] border border-slate-800/90 rounded-lg px-3 py-1.5 flex items-center gap-2 text-xs shadow-md">
              <span className="font-semibold text-slate-100">
                {activeAiDesignInfo
                  ? activeAiDesignInfo.name
                  : activeHybridInfo
                  ? activeHybridInfo.name
                  : currentSpecies.name}
              </span>
              <span className="text-slate-600">·</span>
              <span className="text-emerald-400 font-medium">
                {TONAL_SHADER_META[tonalModeNow].short}
              </span>
              <span className="text-slate-600">·</span>
              <span className="font-mono text-sky-400 tabular-nums">
                H {stats.treeHeightM}m × Ø {stats.crownDiameterM}m
              </span>
              <span className="text-slate-600">·</span>
              <span className="font-mono text-slate-300 tabular-nums">
                {stats.triangles.toLocaleString()} tris ({stats.vertices.toLocaleString()} verts)
              </span>
            </div>
          </div>
        </main>
      </div>

      {/* AI Image-to-3D Botanical Designer & Local AI Provider Configuration Modal */}
      {aiModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/80 flex items-center justify-center p-4"
          onClick={() => !aiLoading && setAiModalOpen(false)}
        >
          <div
            className="w-full max-w-xl bg-[#0f1723] border border-emerald-500/45 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 bg-[#131e2e] border-b border-slate-800 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-emerald-500/20 border border-emerald-400/50 flex items-center justify-center">
                  <Wand2 className="w-4 h-4 text-emerald-300" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-100">
                    Diseñador Botánico IA & Configuración de Motor (Local / Nube)
                  </h2>
                  <p className="text-[11px] text-slate-400">
                    Motor activo:{' '}
                    <span className="text-emerald-300 font-semibold">
                      {AI_PROVIDER_META[aiProviderConfig.provider].label}
                    </span>
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setAiConfigTabOpen((prev) => !prev)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer border transition-colors ${
                    aiConfigTabOpen
                      ? 'bg-violet-500 text-slate-950 border-violet-400'
                      : 'bg-slate-800/90 hover:bg-slate-700 text-violet-200 border-violet-400/40'
                  }`}
                >
                  <HardDrive className="w-3.5 h-3.5" />
                  {aiConfigTabOpen ? 'Ver Subida de Imagen' : 'Configuración IA (Ollama / Local)'}
                </button>
                <button
                  onClick={() => !aiLoading && setAiModalOpen(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
                  title="Cerrar"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-4 space-y-3.5 overflow-y-auto studio-scroll">
              {/* PANEL DE CONFIGURACIÓN DE PROVEEDOR IA (Ollama, LM Studio, Llama.cpp, Offline, Nube) */}
              {aiConfigTabOpen && (
                <div className="bg-[#0b121c] border border-violet-500/45 rounded-xl p-3.5 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-violet-300 flex items-center gap-1.5">
                      <HardDrive className="w-3.5 h-3.5 text-violet-400" />
                      Configuración de Motor IA (Ejecución en PC Local o Nube)
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-violet-500/20 text-violet-200 border border-violet-500/35">
                      Guardado en tu navegador
                    </span>
                  </div>

                  {/* Selector de Proveedor IA */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-slate-300 block">
                      1. Selecciona con qué IA quieres que funcione la aplicación:
                    </label>
                    <div className="grid grid-cols-1 gap-1.5">
                      {(Object.keys(AI_PROVIDER_META) as AiProviderId[]).map((provId) => {
                        const meta = AI_PROVIDER_META[provId];
                        const isSelected = aiProviderConfig.provider === provId;
                        return (
                          <button
                            key={provId}
                            type="button"
                            onClick={() => handleSelectAiProvider(provId)}
                            className={`w-full text-left p-2.5 rounded-lg border transition-all cursor-pointer flex items-start justify-between gap-2 ${
                              isSelected
                                ? 'bg-violet-950/60 border-violet-400 shadow-xs'
                                : 'bg-[#111926] border-slate-800 hover:border-slate-700'
                            }`}
                          >
                            <div className="space-y-0.5">
                              <div className="text-xs font-semibold text-slate-100 flex items-center gap-1.5">
                                <span
                                  className={`w-2 h-2 rounded-full ${
                                    isSelected ? 'bg-emerald-400' : 'bg-slate-600'
                                  }`}
                                />
                                {meta.label}
                              </div>
                              <p className="text-[10px] text-slate-400 leading-snug">
                                {meta.description}
                              </p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Opciones específicas para motores locales (Ollama, LM Studio, Llama.cpp / LocalAI) */}
                  {(aiProviderConfig.provider === 'ollama' ||
                    aiProviderConfig.provider === 'lmstudio' ||
                    aiProviderConfig.provider === 'llamacpp_openai') && (
                    <div className="space-y-2.5 pt-2 border-t border-slate-800/90">
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <label className="text-[11px] font-medium text-slate-300">
                            2. URL del Servidor Local ({AI_PROVIDER_META[aiProviderConfig.provider].shortLabel}):
                          </label>
                          <button
                            type="button"
                            onClick={handleDetectLocalModels}
                            disabled={aiDetectStatus.loading}
                            className="px-2 py-0.5 rounded bg-emerald-500/20 hover:bg-emerald-500/35 border border-emerald-400/50 text-emerald-200 text-[10px] font-semibold flex items-center gap-1 cursor-pointer"
                          >
                            <RefreshCw
                              className={`w-3 h-3 ${aiDetectStatus.loading ? 'animate-spin' : ''}`}
                            />
                            Detectar Modelos en mi PC
                          </button>
                        </div>
                        <input
                          type="text"
                          value={aiProviderConfig.endpointUrl}
                          onChange={(e) => updateAiConfig({ endpointUrl: e.target.value })}
                          placeholder={AI_PROVIDER_META[aiProviderConfig.provider].defaultEndpoint}
                          className="w-full bg-[#131d2b] border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-mono text-emerald-300 focus:outline-none focus:border-emerald-500"
                        />
                      </div>

                      {aiDetectStatus.message && (
                        <div
                          className={`px-2.5 py-1.5 rounded text-[11px] border flex items-center gap-1.5 ${
                            aiDetectStatus.ok
                              ? 'bg-emerald-950/60 border-emerald-500/50 text-emerald-200'
                              : 'bg-amber-950/60 border-amber-500/50 text-amber-200'
                          }`}
                        >
                          <Check className="w-3.5 h-3.5 shrink-0" />
                          <span>{aiDetectStatus.message}</span>
                        </div>
                      )}

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <label className="text-[11px] font-medium text-slate-300 block">
                            3. Modelos Sugeridos / Detectados:
                          </label>
                          <select
                            value={
                              (detectedLocalModels.length > 0
                                ? detectedLocalModels
                                : AI_PROVIDER_META[aiProviderConfig.provider].suggestedModels
                              ).includes(aiProviderConfig.modelName)
                                ? aiProviderConfig.modelName
                                : 'custom'
                            }
                            onChange={(e) => {
                              if (e.target.value !== 'custom') {
                                updateAiConfig({ modelName: e.target.value });
                              }
                            }}
                            className="w-full bg-[#131d2b] border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-200"
                          >
                            {(detectedLocalModels.length > 0
                              ? detectedLocalModels
                              : AI_PROVIDER_META[aiProviderConfig.provider].suggestedModels
                            ).map((mName) => (
                              <option key={mName} value={mName}>
                                {mName}
                              </option>
                            ))}
                            <option value="custom">Otro modelo personalizado...</option>
                          </select>
                        </div>

                        <div className="space-y-1">
                          <label className="text-[11px] font-medium text-slate-300 block">
                            Nombre exacto del modelo:
                          </label>
                          <input
                            type="text"
                            value={aiProviderConfig.modelName}
                            onChange={(e) => updateAiConfig({ modelName: e.target.value })}
                            placeholder="Ej: llama3.2-vision, llava, qwen2.5-vl..."
                            className="w-full bg-[#131d2b] border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-mono text-slate-100 focus:outline-none focus:border-emerald-500"
                          />
                        </div>
                      </div>

                      <div className="text-[10px] text-slate-400 bg-[#111926] border border-slate-800 rounded p-2">
                        💡 {AI_PROVIDER_META[aiProviderConfig.provider].helpHint}
                      </div>
                    </div>
                  )}

                  {/* Temperatura y Fallback */}
                  <div className="pt-2 border-t border-slate-800/90 space-y-2">
                    <SliderControl
                      label="Temperatura Creativa del Modelo IA"
                      value={aiProviderConfig.temperature}
                      min={0.0}
                      max={1.0}
                      step={0.05}
                      onChange={(v) => updateAiConfig({ temperature: v })}
                    />

                    <label className="flex items-center justify-between text-xs text-slate-300 cursor-pointer pt-1">
                      <span>
                        Respaldo morfológico automático si el servidor local está apagado
                      </span>
                      <input
                        type="checkbox"
                        checked={aiProviderConfig.autoFallback}
                        onChange={(e) => updateAiConfig({ autoFallback: e.target.checked })}
                        className="accent-emerald-500 w-4 h-4"
                      />
                    </label>
                  </div>
                </div>
              )}

              {/* Drag & Drop / Click File Zone */}
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const dropped = e.dataTransfer.files?.[0];
                  if (dropped) handleSelectAiImageFile(dropped);
                }}
                onClick={() => !aiLoading && aiFileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-700 hover:border-emerald-400/70 rounded-xl bg-[#0a1019] p-4 transition-colors cursor-pointer flex flex-col items-center justify-center gap-2 text-center"
              >
                {aiPreparedImage ? (
                  <div className="flex items-center gap-3.5 w-full text-left">
                    <img
                      src={aiPreparedImage.previewDataUrl}
                      alt="Imagen subida"
                      className="w-24 h-24 rounded-lg object-cover border border-emerald-500/40 shrink-0 bg-slate-900"
                    />
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="text-xs font-semibold text-emerald-300">
                        Imagen lista para análisis botánico 3D
                      </div>
                      <p className="text-[11px] text-slate-400 leading-snug">
                        Se analizará con{' '}
                        <strong className="text-violet-300">
                          {AI_PROVIDER_META[aiProviderConfig.provider].shortLabel}
                          {aiProviderConfig.provider === 'ollama' ||
                          aiProviderConfig.provider === 'lmstudio' ||
                          aiProviderConfig.provider === 'llamacpp_openai'
                            ? ` (${aiProviderConfig.modelName})`
                            : ''}
                        </strong>
                        .
                      </p>
                      <span className="inline-block text-[11px] text-sky-400 underline">
                        Cambiar imagen o arrastrar otra...
                      </span>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="w-10 h-10 rounded-full bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center">
                      <ImagePlus className="w-5 h-5 text-emerald-300" />
                    </div>
                    <div className="text-xs font-semibold text-slate-200">
                      Haz clic para subir o arrastra aquí una imagen
                    </div>
                    <p className="text-[11px] text-slate-400 max-w-sm">
                      Admite fotos reales, láminas botánicas o bocetos de árboles, pinos, cactus, palmeras, musgos, setas, corales o algas (JPG, PNG, WEBP).
                    </p>
                  </>
                )}
              </div>

              {/* Optional Refinement Notes */}
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-slate-300 block">
                  Indicaciones opcionales para el diseño 3D (opcional):
                </label>
                <textarea
                  value={aiUserNotes}
                  onChange={(e) => setAiUserNotes(e.target.value)}
                  disabled={aiLoading}
                  rows={2}
                  placeholder="Ej: haz el tronco más retorcido, enfatiza las flores rosas, o añade base de arrecife..."
                  className="w-full bg-[#0a1019] border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500 resize-none"
                />
              </div>

              {aiError && (
                <div className="p-2.5 rounded-lg bg-rose-950/60 border border-rose-500/50 text-rose-200 text-xs flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <span>{aiError}</span>
                </div>
              )}
            </div>

            <div className="px-4 py-3 bg-[#131e2e] border-t border-slate-800 flex items-center justify-between gap-2">
              <button
                onClick={() => aiFileInputRef.current?.click()}
                disabled={aiLoading}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Upload className="w-3.5 h-3.5 text-sky-400" />
                Elegir Archivo
              </button>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => !aiLoading && setAiModalOpen(false)}
                  disabled={aiLoading}
                  className="px-3 py-1.5 rounded-lg text-slate-300 hover:bg-slate-800 text-xs font-medium cursor-pointer disabled:opacity-50"
                >
                  Cerrar
                </button>
                <button
                  onClick={handleRunAiPlantDesign}
                  disabled={!aiPreparedImage || aiLoading}
                  className="px-4 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed shadow-sm"
                >
                  {aiLoading ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Analizando con {AI_PROVIDER_META[aiProviderConfig.provider].shortLabel}...
                    </>
                  ) : (
                    <>
                      <Wand2 className="w-3.5 h-3.5" />
                      Diseñar 3D ({AI_PROVIDER_META[aiProviderConfig.provider].shortLabel})
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
