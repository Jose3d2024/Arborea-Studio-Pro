import {
  BarkType,
  CanopyElementType,
  CustomBotanicalElement,
  HangingElementType,
  SpeciesPreset,
  StemStructureType,
  SurfaceElementType,
  SynthesizedBasalFoliageType,
  SynthesizedTipPrimitive,
  TonalShaderMode,
  TreeParams,
} from '../types/botany';
import {
  BARK_TYPE_META,
  CANOPY_ELEMENT_META,
  DEFAULT_TREE_PARAMS,
  HANGING_ELEMENT_META,
  SPECIES_CATALOG,
  STEM_STRUCTURE_META,
  SURFACE_ELEMENT_META,
  SYNTHESIZED_BASAL_META,
  SYNTHESIZED_TIP_META,
  TONAL_PALETTE_PRESETS,
  TONAL_SHADER_META,
} from '../data/speciesCatalog';
import {
  loadSavedCustomSpecies,
  loadSavedPartsModules,
  replaceSavedPartModules,
  PartModuleType,
  SavedPartModule,
  saveCustomPartModule,
} from './aiPlantDesigner';

export type UnifiedPartCategory =
  | 'stem'
  | 'canopy'
  | 'surface'
  | 'hanging'
  | 'tip'
  | 'basal'
  | 'bark'
  | 'shader';

export type UnifiedPartSource = 'builtin' | 'species_preset' | 'ai_generated' | 'user_saved';

export interface UnifiedPartEntry {
  id: string;
  name: string;
  category: UnifiedPartCategory;
  /** Botanical subtype group (e.g. 'Flores y Corolas', 'Hongos y Setas', 'Bonsái y Escultóricos') */
  subGroup?: string;
  source: UnifiedPartSource;
  sourceSpeciesName?: string;
  description: string;
  signature: string;
  /** Value key used to render real 3D part thumbnails via renderReal3DPartThumbnail */
  thumbKind: 'stem' | 'canopy' | 'surface' | 'hanging' | 'tip' | 'basal' | 'bark' | null;
  thumbValue: string;
  palette: {
    trunk: string;
    main: string;
    tip: string;
    flower: string;
    accent: string;
  };
  customElementPatch?: Partial<CustomBotanicalElement>;
  barkType?: BarkType;
  tonalMode?: TonalShaderMode;
  shaderParams?: {
    emissiveIntensity?: number;
    iridescenceAmount?: number;
    patternScale?: number;
    patternContrast?: number;
    wetnessGloss?: number;
  };
  savedModuleId?: string;
  createdAt?: number;
}

function cleanLabel(raw: string): string {
  return raw.replace(/^\d+\.\s*✨?\s*/, '').trim();
}

function roundArray(arr?: number[]): number[] {
  if (!Array.isArray(arr)) return [];
  return arr.slice(0, 8).map((n) => Number((Number(n) || 0).toFixed(2)));
}

/**
 * Classifies any botanical part ID into a clean human-readable subtype group
 * so libraries and pickers are always organized by type instead of 200+ jumbled cards.
 */
export function getPartSubGroup(category: UnifiedPartCategory, key: string): string {
  if (category === 'canopy') {
    if (
      [
        'lotus_magnolia_corolla_crown',
        'passionflower_filament_corona',
        'spotted_orchid_labellum_corolla',
        'giant_arum_spathe_spadix',
        'king_protea_crown',
        'heliconia_bract_candelabra',
        'conical_floral_spike',
        'radiating_floret_head',
        'hanging_bell_cluster',
        'custom_flower_corolla',
        'perforated_blossom_urn',
      ].includes(key)
    ) {
      return '🌸 Flores y Corolas';
    }
    if (
      [
        'caladium_heart_leaf_cluster',
        'fenestrated_monstera_leaves',
        'palmate_maple_star_leaves',
        'pinnate_fern_palm_fronds',
        'conifer_needle_brushes',
        'cloud_bonsai_pads',
        'moss_velvet_mantle',
        'custom_leaf_lamina',
        'stem_hugging_leaves',
      ].includes(key)
    ) {
      return '🍃 Hojas y Follaje';
    }
    if (
      [
        'succulent_fleshy_rosettes',
        'curled_horn_rosette',
        'spiny_crater_dragon_orb',
        'thorn_spur_clusters',
        'dehiscent_seed_pods_coronas',
        'spiny_fenestrated_pods',
      ].includes(key)
    ) {
      return '🌵 Suculentas, Rosetas y Cápsulas';
    }
    if (
      [
        'custom_fungi_cap',
        'curled_witchhat_mushroom_cap',
        'lacy_veil_spiked_mushroom',
        'terraced_pagoda_caps',
        'coral_clavaria_fingers',
      ].includes(key)
    ) {
      return '🍄 Hongos, Setas y Corales';
    }
    if (
      [
        'toothed_venus_jaw_trap',
        'carnivorous_nepenthes_pitchers',
        'crater_tentacle_anemone',
      ].includes(key)
    ) {
      return '🪲 Carnívoras y Anémonas';
    }
    return '✨ Sci-Fi, Umbelas y Esculpidas';
  }

  if (category === 'stem') {
    if (
      [
        'ebony_fluted_bonsai_arch',
        'gnarled_bonsai',
        'serpentine_mossy_deadwood',
        'braided_helix_trunks',
        'spiral_volute_vine',
      ].includes(key)
    ) {
      return '🎋 Bonsái y Escultóricos';
    }
    if (
      [
        'sympodial_tree',
        'weeping_willow',
        'baobab_pachycaul_bottle',
        'mangrove_stilt_arch',
        'strangler_root_cage',
        'dichotomous_dragon_tree',
        'hollow_ancient_snag',
      ].includes(key)
    ) {
      return '🌳 Árboles y Raíces';
    }
    if (
      [
        'herbaceous_curved_stalk',
        'multi_stalk_umbel_colony',
        'swollen_ovary_calyx_stem',
        'creeping_rhizome_runners',
        'segmented_bamboo_equisetum',
      ].includes(key)
    ) {
      return '🌱 Tallos Florales y Colonias';
    }
    return '🌵 Caudex, Acorazados y Sci-Fi';
  }

  if (category === 'tip') {
    if (
      [
        'micro_floret_star',
        'cupped_bell_calyx',
        'iridescent_bubble',
        'dewy_droplet',
        'fuzzy_pom_floret_tuft',
      ].includes(key)
    ) {
      return '🌸 Flores, Gotas y Burbujas';
    }
    if (
      [
        'granulated_berry_cluster',
        'crowned_pomegranate_pod',
        'winged_helicoid_seed',
        'feathery_pappus_plume',
        'spiked_seed_burr',
        'spotted_spore_dome',
      ].includes(key)
    ) {
      return '🍓 Frutos, Semillas y Esporas';
    }
    return '💎 Cristales, Púas y Sci-Fi';
  }

  if (category === 'shader') {
    if (
      [
        'spotted_orchid_mottled',
        'freckled_polka_spots',
        'jaguar_rosette_mottled',
        'dalmatian_ink_splatter',
        'cosmic_speckled_dust',
      ].includes(key)
    ) {
      return '🐆 Moteados y Lunares';
    }
    if (
      [
        'caladium_neon_vein',
        'veined_vascular_rib',
        'zebra_tiger_stripes',
        'stained_glass_venation',
        'striated_banded',
      ].includes(key)
    ) {
      return '🦓 Venas, Rayas y Vitrales';
    }
    if (
      [
        'rainbow_umbel_spectrum',
        'marbled_polychrome_swirl',
        'picotee_rimmed_petal',
        'chlorophyll_variegated',
        'tri_tone_xenogradient',
        'iridescent_dragon_scales',
      ].includes(key)
    ) {
      return '🌈 Multicolor y Variegados';
    }
    return '🌌 Bioluminiscentes y Especiales';
  }

  if (category === 'surface') {
    if (
      ['curved_thorns_spines', 'rose_hooked_prickles', 'cactus_areole_spine_bursts'].includes(key)
    ) {
      return '🌵 Espinas y Aguijones';
    }
    if (['armored_dragon_scales', 'rhomboid_pinecone_scales', 'fleshy_tubercles_warts'].includes(key)) {
      return '🛡️ Escamas y Tubérculos';
    }
    return '🌿 Lianas, Musgo y Nódulos';
  }

  if (category === 'hanging') {
    if (['aerial_root_curtains', 'spanish_moss_epiphyte_drapes', 'mycelial_fuzz'].includes(key)) {
      return '🌿 Raíces y Cortinas';
    }
    if (['hanging_pods_berries', 'winged_samara_seeds', 'tethered_scifi_lantern_globes'].includes(key)) {
      return '🫐 Frutos, Semillas y Faroles';
    }
    return '➰ Filamentos, Zarcillos y Látigos';
  }

  if (category === 'bark') {
    if (['scifi_biolum_veins', 'volcanic_magma_crust', 'eucalyptus_rainbow'].includes(key)) {
      return '✨ Cortezas Exóticas y Biolum';
    }
    if (['armored_scale_bark', 'dragon_scales_cycad', 'cactus_ribs', 'palm_rings', 'bamboo_culm'].includes(key)) {
      return '🛡️ Cortezas Escamosas y Anilladas';
    }
    return '🪵 Cortezas Naturales y Musgosas';
  }

  return '🌿 Rosetas y Brotes Basales';
}

export function computePartSignature(
  category: UnifiedPartCategory,
  el?: Partial<CustomBotanicalElement>,
  extras?: { barkType?: BarkType; tonalMode?: TonalShaderMode }
): string {
  if (category === 'stem') {
    const s = el?.stemStructure || 'sympodial_tree';
    return `stem::${s}`;
  }
  if (category === 'canopy') {
    const c = el?.canopyElement || 'custom_leaf_lamina';
    const topo = el?.synthesizedHeadTopology || 'none';
    if (
      c === 'procedural_lathe_head' ||
      c === 'custom_spline_leaf_crown' ||
      topo === 'revolved_lathe_chalice' ||
      topo === 'spline_petal_corona'
    ) {
      const lathe = roundArray(el?.latheProfileRadii).join(',');
      const spline = roundArray(el?.petalContourProfile).join(',');
      const cup = `::cup${Number((el?.petalCupping ?? 0.38).toFixed(1))}::tw${Math.round(el?.petalTwistDeg ?? 14)}`;
      return `canopy::${c}::${topo}::${lathe}::${spline}${cup}`;
    }
    return `canopy::${c}`;
  }
  if (category === 'surface') {
    return `surface::${el?.surfaceElement || 'smooth_striated'}`;
  }
  if (category === 'hanging') {
    return `hanging::${el?.hangingElement || 'none'}`;
  }
  if (category === 'tip') {
    return `tip::${el?.synthesizedTipPrimitive || 'none'}`;
  }
  if (category === 'basal') {
    return `basal::${el?.synthesizedBasalFoliage || 'none'}`;
  }
  if (category === 'bark') {
    return `bark::${extras?.barkType || 'fissured'}`;
  }
  return `shader::${extras?.tonalMode || 'natural_botanical'}`;
}

/**
 * Single Unified Botanical Parts Library combining:
 * 1) Built-in modular primitives (stems, canopies, surfaces, hangings, tips, basal, barks, shaders)
 * 2) Extracted parts from ALL catalog species & AI-generated species
 * 3) Saved novel AI & user parts from persistent library storage
 */
export function getUnifiedPartsLibrary(): UnifiedPartEntry[] {
  const entries: UnifiedPartEntry[] = [];
  const seenSignatures = new Set<string>();

  // 1. Saved AI & User custom modular parts (highest priority so novel synthesized shapes come first)
  const savedModules = loadSavedPartsModules();
  for (const mod of savedModules) {
    const cat: UnifiedPartCategory =
      mod.partType === 'synthesizedTip'
        ? 'tip'
        : mod.partType === 'basalFoliage'
        ? 'basal'
        : mod.partType;
    const isAi =
      (mod.id && mod.id.includes('_ai_')) ||
      (mod.element?.aiNewPartsReport || '').toLowerCase().includes('ia');
    const sig = computePartSignature(cat, mod.element);
    seenSignatures.add(sig);
    entries.push({
      id: `saved::${mod.id}`,
      savedModuleId: mod.id,
      name: mod.name,
      category: cat,
      source: isAi ? 'ai_generated' : 'user_saved',
      description: mod.element?.aiNewPartsReport || mod.element?.description || 'Parte modular guardada.',
      signature: sig,
      thumbKind: cat,
      thumbValue:
        cat === 'stem'
          ? mod.element.stemStructure
          : cat === 'canopy'
          ? mod.element.canopyElement
          : cat === 'surface'
          ? mod.element.surfaceElement
          : cat === 'hanging'
          ? mod.element.hangingElement
          : cat === 'tip'
          ? mod.element.synthesizedTipPrimitive || 'iridescent_bubble'
          : mod.element.synthesizedBasalFoliage || 'long_grass_blades',
      palette: {
        trunk: '#583e2a',
        main: '#22c55e',
        tip: '#86efac',
        flower: '#f472b6',
        accent: '#38bdf8',
      },
      customElementPatch: { ...mod.element },
      createdAt: mod.createdAt,
    });
  }

  // 2. Native Built-in Primitives across all 8 anatomical categories
  (Object.keys(STEM_STRUCTURE_META) as StemStructureType[]).forEach((k) => {
    const sig = `stem::${k}::builtin`;
    seenSignatures.add(computePartSignature('stem', { stemStructure: k }));
    entries.push({
      id: `builtin::stem::${k}`,
      name: cleanLabel(STEM_STRUCTURE_META[k].label),
      category: 'stem',
      source: 'builtin',
      description: `Estructura de tallo/tronco nativa (${k}).`,
      signature: sig,
      thumbKind: 'stem',
      thumbValue: k,
      palette: { trunk: '#583e2a', main: '#22c55e', tip: '#86efac', flower: '#f472b6', accent: '#38bdf8' },
      customElementPatch: { stemStructure: k },
    });
  });

  (Object.keys(CANOPY_ELEMENT_META) as CanopyElementType[]).forEach((k) => {
    const sig = computePartSignature('canopy', { canopyElement: k });
    seenSignatures.add(sig);
    entries.push({
      id: `builtin::canopy::${k}`,
      name: cleanLabel(CANOPY_ELEMENT_META[k].label),
      category: 'canopy',
      source: 'builtin',
      description: `Órgano terminal / copa nativa (${k}).`,
      signature: sig,
      thumbKind: 'canopy',
      thumbValue: k,
      palette: { trunk: '#583e2a', main: '#22c55e', tip: '#86efac', flower: '#f472b6', accent: '#38bdf8' },
      customElementPatch: { canopyElement: k },
    });
  });

  (Object.keys(SURFACE_ELEMENT_META) as SurfaceElementType[]).forEach((k) => {
    const sig = computePartSignature('surface', { surfaceElement: k });
    seenSignatures.add(sig);
    entries.push({
      id: `builtin::surface::${k}`,
      name: cleanLabel(SURFACE_ELEMENT_META[k].label),
      category: 'surface',
      source: 'builtin',
      description: `Revestimiento superficial 3D sobre tronco (${k}).`,
      signature: sig,
      thumbKind: 'surface',
      thumbValue: k,
      palette: { trunk: '#583e2a', main: '#22c55e', tip: '#86efac', flower: '#f472b6', accent: '#38bdf8' },
      customElementPatch: { surfaceElement: k },
    });
  });

  (Object.keys(HANGING_ELEMENT_META) as HangingElementType[]).forEach((k) => {
    if (k === 'none') return;
    const sig = computePartSignature('hanging', { hangingElement: k });
    seenSignatures.add(sig);
    entries.push({
      id: `builtin::hanging::${k}`,
      name: cleanLabel(HANGING_ELEMENT_META[k].label),
      category: 'hanging',
      source: 'builtin',
      description: `Elemento colgante o aéreo (${k}).`,
      signature: sig,
      thumbKind: 'hanging',
      thumbValue: k,
      palette: { trunk: '#583e2a', main: '#22c55e', tip: '#86efac', flower: '#f472b6', accent: '#38bdf8' },
      customElementPatch: { hangingElement: k },
    });
  });

  (Object.keys(SYNTHESIZED_TIP_META) as SynthesizedTipPrimitive[]).forEach((k) => {
    if (k === 'none') return;
    const sig = computePartSignature('tip', { synthesizedTipPrimitive: k });
    seenSignatures.add(sig);
    entries.push({
      id: `builtin::tip::${k}`,
      name: cleanLabel(SYNTHESIZED_TIP_META[k].label),
      category: 'tip',
      source: 'builtin',
      description: `Micro-pieza terminal en puntas y rayos (${k}).`,
      signature: sig,
      thumbKind: 'tip',
      thumbValue: k,
      palette: { trunk: '#583e2a', main: '#22c55e', tip: '#86efac', flower: '#f472b6', accent: '#38bdf8' },
      customElementPatch: { synthesizedTipPrimitive: k },
    });
  });

  (Object.keys(SYNTHESIZED_BASAL_META) as SynthesizedBasalFoliageType[]).forEach((k) => {
    if (k === 'none') return;
    const sig = computePartSignature('basal', { synthesizedBasalFoliage: k });
    seenSignatures.add(sig);
    entries.push({
      id: `builtin::basal::${k}`,
      name: cleanLabel(SYNTHESIZED_BASAL_META[k].label),
      category: 'basal',
      source: 'builtin',
      description: `Follaje basal / cuello de raíz (${k}).`,
      signature: sig,
      thumbKind: 'basal',
      thumbValue: k,
      palette: { trunk: '#583e2a', main: '#22c55e', tip: '#86efac', flower: '#f472b6', accent: '#38bdf8' },
      customElementPatch: { synthesizedBasalFoliage: k },
    });
  });

  (Object.keys(BARK_TYPE_META) as BarkType[]).forEach((k) => {
    const sig = computePartSignature('bark', undefined, { barkType: k });
    seenSignatures.add(sig);
    entries.push({
      id: `builtin::bark::${k}`,
      name: cleanLabel(BARK_TYPE_META[k].label),
      category: 'bark',
      source: 'builtin',
      description: `Corteza procedural PBR con mapa de normales (${k}).`,
      signature: sig,
      thumbKind: 'bark',
      thumbValue: k,
      palette: { trunk: '#583e2a', main: '#22c55e', tip: '#86efac', flower: '#f472b6', accent: '#38bdf8' },
      barkType: k,
    });
  });

  // Shaders (built-in modes + tonal palette presets)
  TONAL_PALETTE_PRESETS.forEach((pal) => {
    entries.push({
      id: `builtin::shader_preset::${pal.id}`,
      name: `${pal.name} (${TONAL_SHADER_META[pal.tonalMode]?.short || pal.tonalMode})`,
      category: 'shader',
      source: 'builtin',
      description: TONAL_SHADER_META[pal.tonalMode]?.description || pal.badge,
      signature: `shader_preset::${pal.id}`,
      thumbKind: null,
      thumbValue: pal.tonalMode,
      palette: {
        trunk: pal.colorTrunk,
        main: pal.colorLeafMain,
        tip: pal.colorLeafTip,
        flower: pal.colorFlower,
        accent: pal.colorAccent,
      },
      tonalMode: pal.tonalMode,
      shaderParams: {
        emissiveIntensity: pal.emissiveIntensity,
        iridescenceAmount: pal.iridescenceAmount,
        patternScale: pal.patternScale,
        patternContrast: pal.patternContrast,
        wetnessGloss: pal.wetnessGloss,
      },
    });
  });

  // 3. Deconstruct parts from ALL catalog species + user/AI saved species
  const customSpecies = loadSavedCustomSpecies();
  const allSpecies: SpeciesPreset[] = [...customSpecies, ...SPECIES_CATALOG];
  for (const sp of allSpecies) {
    const p = { ...DEFAULT_TREE_PARAMS, ...sp.params };
    const el = p.customElement;
    if (!el) continue;

    const pal = {
      trunk: p.colorTrunk || '#583e2a',
      main: p.colorLeafMain || '#22c55e',
      tip: p.colorLeafTip || '#86efac',
      flower: p.colorFlower || '#f472b6',
      accent: p.colorAccent || '#38bdf8',
    };
    const spShort = sp.name.split('(')[0].trim();

    // Extract species canopy variant ONLY if its morphological signature is not already in the library (zero duplicates!)
    const cSig = computePartSignature('canopy', el);
    if (!seenSignatures.has(cSig)) {
      seenSignatures.add(cSig);
      entries.push({
        id: `species::${sp.id}::canopy`,
        name: `${el.name || cleanLabel(CANOPY_ELEMENT_META[el.canopyElement]?.label || el.canopyElement)}`,
        category: 'canopy',
        source: 'species_preset',
        sourceSpeciesName: spShort,
        description: `Extraída de "${spShort}": ${el.description || sp.description}`,
        signature: cSig,
        thumbKind: 'canopy',
        thumbValue: el.canopyElement,
        palette: pal,
        customElementPatch: {
          canopyElement: el.canopyElement,
          synthesizedHeadTopology: el.synthesizedHeadTopology,
          petalContourProfile: el.petalContourProfile,
          latheProfileRadii: el.latheProfileRadii,
          petalCupping: el.petalCupping,
          petalTwistDeg: el.petalTwistDeg,
          petalMarginWave: el.petalMarginWave,
          petalOpenness: el.petalOpenness,
          lobeCount: el.lobeCount,
          cupDepth: el.cupDepth,
          padLayers: el.padLayers,
          umbelRayCount: el.umbelRayCount,
          umbelSphereRatio: el.umbelSphereRatio,
          tipBubbleScale: el.tipBubbleScale,
          capDomeHeight: el.capDomeHeight,
          capSpotDensity: el.capSpotDensity,
          gillCount: el.gillCount,
        },
      });
    }

    // Extract species stem variant ONLY if unique (prevents duplicate "Tallo de Anémona" x4!)
    const sSig = computePartSignature('stem', el);
    if (!seenSignatures.has(sSig)) {
      seenSignatures.add(sSig);
      entries.push({
        id: `species::${sp.id}::stem`,
        name: `Tallo de ${spShort}`,
        category: 'stem',
        source: 'species_preset',
        sourceSpeciesName: spShort,
        description: `${cleanLabel(STEM_STRUCTURE_META[el.stemStructure]?.label || el.stemStructure)} (hereda curvatura y brazos de ${spShort}).`,
        signature: sSig,
        thumbKind: 'stem',
        thumbValue: el.stemStructure,
        palette: pal,
        customElementPatch: {
          stemStructure: el.stemStructure,
          stemCount: el.stemCount,
          spiralArms: el.spiralArms,
          spiralTurns: el.spiralTurns,
          trunkBentS: el.trunkBentS,
          branchSpread: el.branchSpread,
          branchDroop: el.branchDroop,
        },
      });
    }

    if (el.surfaceElement && el.surfaceElement !== 'smooth_striated') {
      const surfSig = computePartSignature('surface', el);
      if (!seenSignatures.has(surfSig)) {
        seenSignatures.add(surfSig);
        entries.push({
          id: `species::${sp.id}::surface`,
          name: `${cleanLabel(SURFACE_ELEMENT_META[el.surfaceElement]?.label || el.surfaceElement)} (${spShort})`,
          category: 'surface',
          source: 'species_preset',
          sourceSpeciesName: spShort,
          description: `Corteza y superficie 3D de "${spShort}".`,
          signature: surfSig,
          thumbKind: 'surface',
          thumbValue: el.surfaceElement,
          palette: pal,
          customElementPatch: {
            surfaceElement: el.surfaceElement,
            thornDensity: el.thornDensity,
            thornLength: el.thornLength,
          },
        });
      }
    }

    if (el.hangingElement && el.hangingElement !== 'none') {
      const hangSig = computePartSignature('hanging', el);
      if (!seenSignatures.has(hangSig)) {
        seenSignatures.add(hangSig);
        entries.push({
          id: `species::${sp.id}::hanging`,
          name: `${cleanLabel(HANGING_ELEMENT_META[el.hangingElement]?.label || el.hangingElement)} (${spShort})`,
          category: 'hanging',
          source: 'species_preset',
          sourceSpeciesName: spShort,
          description: `Colgantes 3D de "${spShort}".`,
          signature: hangSig,
          thumbKind: 'hanging',
          thumbValue: el.hangingElement,
          palette: pal,
          customElementPatch: {
            hangingElement: el.hangingElement,
            filamentCount: el.filamentCount,
            filamentLength: el.filamentLength,
          },
        });
      }
    }
  }

  for (const e of entries) {
    if (!e.subGroup) {
      const key =
        e.category === 'shader'
          ? e.tonalMode || e.thumbValue
          : e.category === 'bark'
          ? e.barkType || e.thumbValue
          : e.thumbValue;
      e.subGroup = getPartSubGroup(e.category, key);
    }
  }

  return entries;
}

/**
 * Inspects an AI-designed plant and automatically registers any NEW / non-existing
 * anatomical parts (canopy, stem, surface, hanging, tip) into the persistent Parts Library!
 */
export function registerAiNovelPartsIfNew(
  element: CustomBotanicalElement,
  params: TreeParams,
  plantName: string
): { newlySavedNames: string[]; reusedNames: string[] } {
  const existingLib = getUnifiedPartsLibrary();
  const existingSigs = new Set(existingLib.map((e) => e.signature));

  const newlySavedNames: string[] = [];
  const reusedNames: string[] = [];

  const checkAndRegister = (
    cat: UnifiedPartCategory,
    modType: PartModuleType,
    labelPrefix: string
  ) => {
    const sig = computePartSignature(cat, element, {
      barkType: params.barkType,
      tonalMode: params.tonalMode,
    });
    // Strict deduplication: NEVER create a duplicate part if this signature already exists in native, species, or saved parts!
    const matched = existingLib.find((e) => e.signature === sig);
    if (matched || existingSigs.has(sig)) {
      if (matched) reusedNames.push(matched.name);
      return;
    }

    const partLabel = `${labelPrefix} (${plantName})`;
    const savedEl: CustomBotanicalElement = {
      ...element,
      id: `elem_ai_${modType}_${Date.now()}_${Math.floor(Math.random() * 900)}`,
      name: partLabel,
      aiNewPartsReport:
        element.aiNewPartsReport ||
        `Parte ${cat} generada por IA a partir de "${plantName}" (firma: ${sig}).`,
    };
    saveCustomPartModule(partLabel, modType, savedEl);
    existingSigs.add(sig);
    newlySavedNames.push(partLabel);
  };

  checkAndRegister('canopy', 'canopy', 'Copa IA');
  checkAndRegister('stem', 'stem', 'Tallo IA');
  if (element.surfaceElement && element.surfaceElement !== 'smooth_striated') {
    checkAndRegister('surface', 'surface', 'Superficie IA');
  }
  if (element.hangingElement && element.hangingElement !== 'none') {
    checkAndRegister('hanging', 'hanging', 'Colgante IA');
  }
  if (element.synthesizedTipPrimitive && element.synthesizedTipPrimitive !== 'none') {
    checkAndRegister('tip', 'synthesizedTip', 'Punta IA');
  }
  if (element.synthesizedBasalFoliage && element.synthesizedBasalFoliage !== 'none') {
    checkAndRegister('basal', 'basalFoliage', 'Base IA');
  }

  return { newlySavedNames, reusedNames };
}

/**
 * Removes all duplicate saved part modules (both duplicates of native/species catalog parts
 * and duplicate entries among user/AI saved modules), keeping only genuinely unique parts.
 */
export function deduplicateUnifiedPartsLibrary(): {
  removedCount: number;
  remaining: SavedPartModule[];
} {
  const saved = loadSavedPartsModules();
  if (saved.length === 0) return { removedCount: 0, remaining: [] };

  // Build baseline signature set of all native & catalog-species parts
  const baselineSigs = new Set<string>();
  const allLib = getUnifiedPartsLibrary();
  for (const entry of allLib) {
    if (entry.source !== 'ai_generated' && entry.source !== 'user_saved') {
      baselineSigs.add(entry.signature);
    }
  }

  const modTypeToCat: Record<PartModuleType, UnifiedPartCategory> = {
    canopy: 'canopy',
    stem: 'stem',
    surface: 'surface',
    hanging: 'hanging',
    synthesizedTip: 'tip',
    basalFoliage: 'basal',
  };

  const seenSavedSigs = new Set<string>();
  const kept: SavedPartModule[] = [];
  let removedCount = 0;

  for (const mod of saved) {
    const cat = modTypeToCat[mod.partType] || 'canopy';
    const sig = computePartSignature(cat, mod.element);
    if (baselineSigs.has(sig) || seenSavedSigs.has(sig)) {
      removedCount++;
    } else {
      seenSavedSigs.add(sig);
      kept.push(mod);
    }
  }

  const remaining = replaceSavedPartModules(kept);
  return { removedCount, remaining };
}

/**
 * Formats a compact, searchable Parts Library summary for the AI Designer endpoint
 * (prioritizing AI/User custom parts + unique species parts + key new shapes).
 */
export function buildPartsLibraryPayloadForAI(limit = 32): Array<{
  name: string;
  category: UnifiedPartCategory;
  /** Botanical subtype group (e.g. 'Flores y Corolas', 'Hongos y Setas', 'Bonsái y Escultóricos') */
  subGroup?: string;
  source: UnifiedPartSource;
  sourceSpecies?: string;
  element: Partial<CustomBotanicalElement>;
}> {
  const lib = getUnifiedPartsLibrary();
  const prioritized = [
    ...lib.filter((e) => e.source === 'ai_generated' || e.source === 'user_saved'),
    ...lib.filter((e) => e.source === 'species_preset' && e.category === 'canopy'),
    ...lib.filter((e) => e.source === 'species_preset' && e.category === 'stem'),
  ];

  const seenNames = new Set<string>();
  const out: Array<{
    name: string;
    category: UnifiedPartCategory;
    source: UnifiedPartSource;
    sourceSpecies?: string;
    element: Partial<CustomBotanicalElement>;
  }> = [];

  for (const item of prioritized) {
    if (seenNames.has(item.name) || !item.customElementPatch) continue;
    seenNames.add(item.name);
    out.push({
      name: item.name,
      category: item.category,
      source: item.source,
      sourceSpecies: item.sourceSpeciesName,
      element: item.customElementPatch,
    });
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Applies a single UnifiedPartEntry cleanly onto existing TreeParams
 * without discarding unrelated anatomical slots.
 */
export function applyUnifiedPartToTreeParams(
  prev: TreeParams,
  part: UnifiedPartEntry,
  baseElement: CustomBotanicalElement
): TreeParams {
  if (part.category === 'bark' && part.barkType) {
    return {
      ...prev,
      barkType: part.barkType,
    };
  }
  if (part.category === 'shader' && part.tonalMode) {
    return {
      ...prev,
      tonalMode: part.tonalMode,
      emissiveIntensity: part.shaderParams?.emissiveIntensity ?? prev.emissiveIntensity,
      iridescenceAmount: part.shaderParams?.iridescenceAmount ?? prev.iridescenceAmount,
      patternScale: part.shaderParams?.patternScale ?? prev.patternScale,
      patternContrast: part.shaderParams?.patternContrast ?? prev.patternContrast,
      wetnessGloss: part.shaderParams?.wetnessGloss ?? prev.wetnessGloss,
    };
  }

  const patch = part.customElementPatch || {};
  const nextEl: CustomBotanicalElement = {
    ...baseElement,
    ...patch,
    id: `elem_mix_${Date.now()}`,
  };
  if (part.category === 'canopy' && !patch.synthesizedHeadTopology) {
    nextEl.synthesizedHeadTopology = 'none';
  }

  return {
    ...prev,
    engine: 'composed_custom',
    foliageType: 'ai_custom_element',
    customElement: nextEl,
  };
}
