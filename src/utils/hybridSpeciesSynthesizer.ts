import * as THREE from 'three';
import {
  TreeParams,
  SpeciesPreset,
  FoliageType,
  BarkType,
  CrownEnvelopeShape,
  CactusSubType,
  AlienArchetype,
  MossFungiArchetype,
  AquaticArchetype,
  TonalShaderMode,
  CustomBotanicalElement,
  StemStructureType,
  CanopyElementType,
  SurfaceElementType,
  HangingElementType,
} from '../types/botany';
import {
  SPECIES_CATALOG,
  DEFAULT_TREE_PARAMS,
  TONAL_PALETTE_PRESETS,
} from '../data/speciesCatalog';
import {
  loadSavedCustomSpecies,
  loadSavedCustomElements,
} from './aiPlantDesigner';

export interface HybridGenerationResult {
  params: TreeParams;
  hybridName: string;
  lineageSummary: string;
}

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function blendHex(hexA: string, hexB: string, t: number): string {
  const ca = new THREE.Color(hexA);
  const cb = new THREE.Color(hexB);
  ca.lerp(cb, THREE.MathUtils.clamp(t, 0, 1));
  return '#' + ca.getHexString();
}

function shortSpeciesName(sp: SpeciesPreset): string {
  return sp.name.split(' (')[0].trim();
}

const SYMPODIAL_COMPATIBLE_FOLIAGE: FoliageType[] = [
  'broadleaf_lobed',
  'broadleaf_palmate',
  'broadleaf_ovate',
  'broadleaf_lanceolate',
  'broadleaf_ginkgo',
  'broadleaf_heart',
  'blossom_clusters',
  'berry_clusters',
  'weeping_strands',
  'needles_fascicle',
  'needles_scale',
  'needles_rosette',
  'alien_umbrella_caps',
  'alien_spore_bulbs',
  'alien_pitcher_traps',
  'alien_tentacle_coils',
];

const MONOPODIAL_COMPATIBLE_FOLIAGE: FoliageType[] = [
  'needles_fascicle',
  'needles_pectinate',
  'needles_radial',
  'needles_scale',
  'needles_rosette',
  'blossom_clusters',
  'berry_clusters',
  'broadleaf_ginkgo',
  'alien_umbrella_caps',
];

const PALM_COMPATIBLE_FOLIAGE: FoliageType[] = [
  'fronds_pinnate',
  'fronds_palmate',
  'fronds_fern',
  'paddle_banana',
];

const BAMBOO_COMPATIBLE_FOLIAGE: FoliageType[] = [
  'bamboo_lance',
  'broadleaf_lanceolate',
  'weeping_strands',
  'blossom_clusters',
  'needles_rosette',
];

const CROWN_SHAPES: CrownEnvelopeShape[] = [
  'spherical',
  'conical',
  'hemispherical',
  'flame',
  'umbrella',
  'tapered_cylinder',
  'inverse_conical',
];

const BARK_TYPES: BarkType[] = [
  'fissured',
  'pine_plates',
  'birch_paper',
  'smooth_ash',
  'fibrous_redwood',
  'palm_rings',
];

const CACTUS_SUBTYPES: CactusSubType[] = [
  'saguaro',
  'candelabra',
  'organ_pipe',
  'opuntia',
  'barrel',
];

const ALIEN_ARCHETYPES: AlienArchetype[] = [
  'mega_mushroom_terraced',
  'spiral_fiddlehead_tentacle',
  'carnivorous_pitcher_colony',
  'fenestrated_coral_spire',
  'cracked_ova_cluster',
  'star_flower_caudex',
  'azure_spore_chimneys',
  'sap_fissure_baobab',
  'spiky_mace_sentinel',
  'crimson_coral_plume',
  'biolum_crater_mounds',
  'albino_crystal_palm',
];

const MOSS_FUNGI_ARCHETYPES: MossFungiArchetype[] = [
  'velvet_moss_sporophytes',
  'star_moss_polytrichum',
  'sphagnum_bog_pillow',
  'amanita_muscaria_moss',
  'biolum_mycena_colony',
  'turkey_tail_bracket',
  'golden_enoki_cluster',
  'pixie_cup_lichen',
  'morel_sponge_moss',
  'coral_fungus_ramaria',
  'chanterelle_golden_moss',
  'puffball_birds_nest',
];

const AQUATIC_ARCHETYPES: AquaticArchetype[] = [
  'staghorn_acropora',
  'brain_coral_boulder',
  'gorgonian_sea_fan',
  'tube_sponge_cluster',
  'giant_kelp_forest',
  'bull_kelp_whip',
  'sea_anemone_tentacles',
  'plate_montipora_whorl',
  'pillar_organ_pipe_coral',
  'red_seaweed_dulse',
  'bladder_wrack_sargassum',
  'seagrass_posidonia_meadow',
];

/**
 * Cross-Species Hybrid Vegetation Synthesizer:
 * Combines structural skeletons, foliage, barks, roots, shaders and color harmonies
 * from multiple catalog species (including AI-created species & elements) while enforcing
 * strict anatomical attachment and proportional unity ("que se vea una unidad, no trozos").
 */
export function synthesizeHybridSpecies(currentPresetId?: string): HybridGenerationResult {
  const customSpecies = loadSavedCustomSpecies();
  const customElements = loadSavedCustomElements();
  const pool = [...customSpecies, ...SPECIES_CATALOG];
  const donorA = pick(pool);
  let donorB = pick(pool);
  let guard = 0;
  while ((donorB.id === donorA.id || donorB.id === currentPresetId) && guard < 12) {
    donorB = pick(pool);
    guard++;
  }
  const donorC = pick(pool);

  const pA = { ...DEFAULT_TREE_PARAMS, ...donorA.params };
  const pB = { ...DEFAULT_TREE_PARAMS, ...donorB.params };
  const pC = { ...DEFAULT_TREE_PARAMS, ...donorC.params };

  const newSeed = Math.floor(1000 + Math.random() * 9000);

  // Pick one of structurally-bonded hybrid families (including modular composed elements)
  type HybridFamily =
    | 'composed_modular_hybrid'
    | 'sympodial_chimera'
    | 'monopodial_conifer'
    | 'weeping_hybrid'
    | 'palm_stipe'
    | 'cactus_hybrid'
    | 'bamboo_grove'
    | 'alien_chimera'
    | 'moss_rock_colony'
    | 'aquatic_reef_hybrid';

  const families: HybridFamily[] = [
    'composed_modular_hybrid',
    'composed_modular_hybrid',
    'sympodial_chimera',
    'sympodial_chimera',
    'monopodial_conifer',
    'weeping_hybrid',
    'palm_stipe',
    'cactus_hybrid',
    'bamboo_grove',
    'alien_chimera',
    'moss_rock_colony',
    'aquatic_reef_hybrid',
  ];
  const family = pick(families);

  // Harmonized color blending across donor species (with optional tonal shader accent)
  const useExoticShader = Math.random() < 0.38;
  const palPreset = pick(TONAL_PALETTE_PRESETS);

  let tonalMode: TonalShaderMode = 'natural_botanical';
  if (useExoticShader) {
    // Prefer organic shaders rather than thermal/cel unless chosen occasionally
    tonalMode = pick([
      'bioluminescent_abyss',
      'voronoi_cracked',
      'iridescent_chitin',
      'translucent_jelly',
      'tri_tone_xenogradient',
      'striated_banded',
    ]);
  }

  const mixRatioAB = randRange(0.25, 0.75);
  let colorTrunk = blendHex(pA.colorTrunk, pB.colorTrunk, mixRatioAB * 0.65);
  let colorLeafMain = blendHex(pB.colorLeafMain, pC.colorLeafMain, randRange(0.2, 0.8));
  let colorLeafTip = blendHex(pB.colorLeafTip, pC.colorLeafTip, randRange(0.2, 0.8));
  let colorFlower = blendHex(pB.colorFlower, pC.colorFlower, randRange(0.25, 0.75));
  let colorAccent = blendHex(
    pC.colorAccent || pC.colorFlower,
    palPreset.colorAccent,
    useExoticShader ? 0.65 : 0.25
  );

  if (useExoticShader && Math.random() < 0.55) {
    colorLeafMain = blendHex(colorLeafMain, palPreset.colorLeafMain, 0.55);
    colorLeafTip = blendHex(colorLeafTip, palPreset.colorLeafTip, 0.6);
    colorAccent = palPreset.colorAccent;
  }

  const baseParams: TreeParams = {
    ...DEFAULT_TREE_PARAMS,
    seed: newSeed,
    representationStyle: 'botanical_leaves',
    tonalMode,
    colorTrunk,
    colorLeafMain,
    colorLeafTip,
    colorFlower,
    colorAccent,
    emissiveIntensity: useExoticShader ? randRange(0.3, 0.85) : 0.14,
    iridescenceAmount: tonalMode === 'iridescent_chitin' ? randRange(0.45, 0.85) : 0.15,
    patternScale: randRange(0.85, 1.55),
    patternContrast: randRange(0.45, 0.82),
    wetnessGloss: tonalMode === 'translucent_jelly' ? 0.85 : randRange(0.12, 0.42),
    hueShift: 0,
    windEnabled: true,
    windStrength: 0.42,
    windTurbulence: 0.32,
  };

  // ───────────────────────────────────────────────────────────────────────────
  // 0. COMPOSED MODULAR 4-ELEMENT HYBRID (Stem + Surface + Canopy + Filaments)
  // ───────────────────────────────────────────────────────────────────────────
  if (family === 'composed_modular_hybrid') {
    const savedElem = customElements.length > 0 && Math.random() < 0.65 ? pick(customElements) : null;
    const stemChoice: StemStructureType = savedElem
      ? savedElem.stemStructure
      : pick<StemStructureType>([
          'spiral_volute_vine',
          'gnarled_bonsai',
          'thorny_horn_crown',
          'sympodial_tree',
          'weeping_willow',
          'rosette_cluster',
        ]);
    const canopyChoice: CanopyElementType = savedElem
      ? savedElem.canopyElement
      : pick<CanopyElementType>([
          'stem_hugging_leaves',
          'cloud_bonsai_pads',
          'thorn_spur_clusters',
          'custom_leaf_lamina',
          'custom_flower_corolla',
          'custom_fungi_cap',
        ]);
    const surfaceChoice: SurfaceElementType = savedElem
      ? savedElem.surfaceElement
      : pick<SurfaceElementType>([
          'braided_vines',
          'curved_thorns_spines',
          'moss_lichen_bark',
          'smooth_striated',
        ]);
    const hangingChoice: HangingElementType = savedElem
      ? savedElem.hangingElement
      : pick<HangingElementType>([
          'curling_tendrils',
          'weeping_filaments',
          'mycelial_fuzz',
          'hanging_pods_berries',
        ]);

    const hybridCustomElement: CustomBotanicalElement = {
      id: `elem_hyb_${newSeed}`,
      name: savedElem
        ? `${savedElem.name} × ${shortSpeciesName(donorB)}`
        : `Combinación Modular #${newSeed}`,
      scientificName: 'Botanica hybrida composita',
      description: 'Síntesis combinatoria de tallo, superficie, copa y filamentos.',
      createdAt: Date.now(),
      stemStructure: stemChoice,
      canopyElement: canopyChoice,
      surfaceElement: surfaceChoice,
      hangingElement: hangingChoice,
      lobeCount: Math.round(randRange(4, 8)),
      cupDepth: Number(randRange(0.2, 0.55).toFixed(2)),
      spiralTurns: Number(randRange(1.1, 1.75).toFixed(2)),
      spiralArms: Math.round(randRange(2, 8)),
      thornDensity: Number(randRange(0.2, 0.85).toFixed(2)),
      thornLength: Number(randRange(0.65, 1.35).toFixed(2)),
      filamentCount: Math.round(randRange(14, 28)),
      filamentLength: Number(randRange(0.75, 1.35).toFixed(2)),
      padLayers: Math.round(randRange(4, 8)),
    };

    const height = Number(randRange(4.2, 6.4).toFixed(1));
    return {
      params: {
        ...baseParams,
        presetId: donorA.id,
        engine: 'composed_custom',
        foliageType: 'ai_custom_element',
        height,
        radius: Number(randRange(0.30, 0.46).toFixed(2)),
        gnarl: Number(randRange(0.35, 0.68).toFixed(2)),
        leafScale: Number(randRange(1.05, 1.38).toFixed(2)),
        leafDensity: 5,
        showRoots: true,
        customElement: hybridCustomElement,
      },
      hybridName: `Combinación Modular: ${shortSpeciesName(donorA)} × ${shortSpeciesName(donorB)}`,
      lineageSummary: `Tallo (${stemChoice}) + Copa (${canopyChoice}) + Superficie (${surfaceChoice})`,
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 1. SYMPODIAL CHIMERA (Tree Skeleton + Blended Branches + Welded Roots + Foliage)
  // ───────────────────────────────────────────────────────────────────────────
  if (family === 'sympodial_chimera' || family === 'weeping_hybrid') {
    const isWeeping = family === 'weeping_hybrid';
    const height = THREE.MathUtils.clamp(
      THREE.MathUtils.lerp(pA.height, pB.height, 0.45) * randRange(0.88, 1.12),
      3.4,
      8.5
    );
    const radius = THREE.MathUtils.clamp(height * randRange(0.048, 0.088), 0.18, 0.65);

    const foliageChoices = isWeeping
      ? (['weeping_strands', 'broadleaf_lanceolate', 'blossom_clusters'] as FoliageType[])
      : SYMPODIAL_COMPATIBLE_FOLIAGE;

    const chosenFoliage: FoliageType =
      foliageChoices.includes(pB.foliageType) && Math.random() < 0.65
        ? pB.foliageType
        : pick(foliageChoices);

    const leafScale = THREE.MathUtils.clamp(height * randRange(0.19, 0.25), 0.95, 1.65);
    const crownShape: CrownEnvelopeShape = isWeeping
      ? pick(['hemispherical', 'umbrella', 'spherical'])
      : pick(CROWN_SHAPES);

    return {
      params: {
        ...baseParams,
        presetId: donorA.id,
        engine: isWeeping ? 'weeping' : Math.random() < 0.22 ? 'shrub' : 'sympodial',
        crownShape,
        height: Number(height.toFixed(1)),
        radius: Number(radius.toFixed(2)),
        taper: Number(randRange(0.66, 0.76).toFixed(2)),
        flare: Number(randRange(0.32, 0.68).toFixed(2)),
        trunkClearHeight: Number(randRange(0.2, 0.36).toFixed(2)),
        trunkSplitHeight: Number(randRange(0.24, 0.4).toFixed(2)),
        crownWidthRatio: Number(randRange(0.38, 0.58).toFixed(2)),
        levels: 4,
        branchCount: Math.round(randRange(3, 4)),
        angle: Math.round(randRange(28, 52)),
        decay: Number(randRange(0.73, 0.81).toFixed(2)),
        noise: Number(randRange(0.16, 0.36).toFixed(2)),
        gravity: isWeeping
          ? Number(randRange(-0.52, -0.28).toFixed(2))
          : Number(randRange(-0.08, 0.22).toFixed(2)),
        apicalDominance: Number(randRange(0.34, 0.74).toFixed(2)),
        gnarl: Number(randRange(0.12, 0.42).toFixed(2)),
        pruneRatio: Number(randRange(0.08, 0.22).toFixed(2)),
        showRoots: true,
        rootCount: Math.round(randRange(5, 8)),
        rootLength: Number(randRange(1.05, 1.55).toFixed(2)),
        rootThickness: Number(randRange(0.85, 1.25).toFixed(2)),
        rootArch: Number(randRange(0.25, 0.62).toFixed(2)),
        barkType: pick(BARK_TYPES),
        foliageType: chosenFoliage,
        leafScale: Number(leafScale.toFixed(2)),
        leafDensity: Math.round(randRange(4, 5)),
        leafWidthRatio: Number(randRange(0.35, 0.85).toFixed(2)),
        leafBend: Number(randRange(0.18, 0.42).toFixed(2)),
        needleLength: Number(randRange(0.85, 1.25).toFixed(2)),
        fascicleCount: Math.round(randRange(3, 5)),
        pineConeDensity: Number(randRange(0.2, 0.5).toFixed(2)),
      },
      hybridName: `${isWeeping ? 'Sauce Híbrido' : 'Árbol Quimera'}: ${shortSpeciesName(donorA)} × ${shortSpeciesName(donorB)}`,
      lineageSummary: `Esqueleto ${shortSpeciesName(donorA)} + Follaje ${shortSpeciesName(donorB)} + Tono ${shortSpeciesName(donorC)}`,
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 2. MONOPODIAL CONIFER HYBRID (Tiered Whorls + Lateral Branchlets + Cones/Needles)
  // ───────────────────────────────────────────────────────────────────────────
  if (family === 'monopodial_conifer') {
    const height = Number(randRange(5.2, 9.2).toFixed(1));
    const radius = Number(THREE.MathUtils.clamp(height * randRange(0.045, 0.085), 0.24, 0.72).toFixed(2));
    const chosenFoliage =
      MONOPODIAL_COMPATIBLE_FOLIAGE.includes(pB.foliageType) && Math.random() < 0.7
        ? pB.foliageType
        : pick(MONOPODIAL_COMPATIBLE_FOLIAGE);

    return {
      params: {
        ...baseParams,
        presetId: donorA.id,
        engine: 'monopodial',
        crownShape: pick(['conical', 'flame', 'tapered_cylinder', 'umbrella']),
        height,
        radius,
        taper: Number(randRange(0.60, 0.70).toFixed(2)),
        flare: Number(randRange(0.35, 0.70).toFixed(2)),
        trunkClearHeight: Number(randRange(0.12, 0.26).toFixed(2)),
        crownWidthRatio: Number(randRange(0.24, 0.46).toFixed(2)),
        levels: 4,
        whorlBranches: Math.round(randRange(4, 7)),
        angle: Math.round(randRange(38, 80)),
        decay: Number(randRange(0.68, 0.76).toFixed(2)),
        noise: Number(randRange(0.06, 0.18).toFixed(2)),
        gravity: Number(randRange(-0.18, 0.16).toFixed(2)),
        gnarl: Number(randRange(0.05, 0.22).toFixed(2)),
        showRoots: true,
        rootCount: Math.round(randRange(5, 8)),
        rootLength: Number(randRange(1.1, 1.6).toFixed(2)),
        rootThickness: Number(randRange(0.9, 1.3).toFixed(2)),
        rootArch: Number(randRange(0.24, 0.45).toFixed(2)),
        barkType: pick(['pine_plates', 'fibrous_redwood', 'fissured', 'smooth_ash']),
        foliageType: chosenFoliage,
        leafScale: Number(THREE.MathUtils.clamp(height * 0.2, 1.1, 1.65).toFixed(2)),
        leafDensity: Math.round(randRange(4, 5)),
        needleLength: Number(randRange(0.65, 1.35).toFixed(2)),
        needleDensity: Math.round(randRange(9, 13)),
        fascicleCount: Math.round(randRange(2, 6)),
        pineConeDensity: Number(randRange(0.25, 0.65).toFixed(2)),
      },
      hybridName: `Conífera Híbrida: ${shortSpeciesName(donorA)} × ${shortSpeciesName(donorB)}`,
      lineageSummary: `Porte Monopodial + Verticilos ${shortSpeciesName(donorA)} + Acículas/Tonos ${shortSpeciesName(donorB)}`,
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 3. PALM / TROPICAL STIPE HYBRID (Curved Stipe + Radial Fronds Welded at Apex)
  // ───────────────────────────────────────────────────────────────────────────
  if (family === 'palm_stipe') {
    const height = Number(randRange(3.6, 7.8).toFixed(1));
    const radius = Number(THREE.MathUtils.clamp(height * randRange(0.038, 0.055), 0.18, 0.38).toFixed(2));
    const stiltRoots = Math.random() < 0.65;

    return {
      params: {
        ...baseParams,
        presetId: donorA.id,
        engine: 'palm',
        crownShape: 'umbrella',
        height,
        radius,
        taper: Number(randRange(0.80, 0.88).toFixed(2)),
        flare: Number(randRange(0.32, 0.5).toFixed(2)),
        levels: 4,
        noise: Number(randRange(0.10, 0.36).toFixed(2)),
        showRoots: stiltRoots,
        rootCount: Math.round(randRange(6, 9)),
        rootLength: Number(randRange(1.0, 1.45).toFixed(2)),
        rootThickness: Number(randRange(0.75, 1.05).toFixed(2)),
        rootArch: Number(randRange(0.45, 0.85).toFixed(2)),
        barkType: pick(['palm_rings', 'fibrous_redwood', 'birch_paper']),
        foliageType: pick(PALM_COMPATIBLE_FOLIAGE),
        leafScale: Number(THREE.MathUtils.clamp(height * 0.27, 1.3, 1.9).toFixed(2)),
        leafDensity: 5,
        leafBend: Number(randRange(0.35, 0.58).toFixed(2)),
      },
      hybridName: `Palmera Híbrida: ${shortSpeciesName(donorA)} × ${shortSpeciesName(donorB)}`,
      lineageSummary: `Estípite Curvo + Frondas Apicales + Paleta ${shortSpeciesName(donorC)}`,
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 4. CACTUS HYBRID (Ribbed Column / Candelabra / Opuntia + Spines + Flowers)
  // ───────────────────────────────────────────────────────────────────────────
  if (family === 'cactus_hybrid') {
    const sub = pick(CACTUS_SUBTYPES);
    const isBarrel = sub === 'barrel';
    const height = isBarrel ? Number(randRange(1.8, 2.8).toFixed(1)) : Number(randRange(3.4, 6.4).toFixed(1));
    const radius = isBarrel ? Number(randRange(0.55, 0.78).toFixed(2)) : Number(randRange(0.24, 0.44).toFixed(2));

    // Blend green cactus chlorophyll with donor B/C accent tones
    const cactusTrunk = blendHex('#3f6212', pB.colorLeafMain, 0.38);

    return {
      params: {
        ...baseParams,
        presetId: donorA.id,
        engine: 'cactus',
        cactusSubType: sub,
        height,
        radius,
        taper: Number(randRange(0.84, 0.94).toFixed(2)),
        levels: isBarrel ? 2 : Math.round(randRange(3, 4)),
        showRoots: false,
        barkType: 'cactus_ribs',
        foliageType: 'none',
        cactusRibs: Math.round(randRange(9, 18)),
        ribDepth: Number(randRange(0.10, 0.17).toFixed(2)),
        armCount: Math.round(randRange(3, 8)),
        armSpread: Number(randRange(0.7, 1.15).toFixed(2)),
        armHeightMin: Number(randRange(0.18, 0.38).toFixed(2)),
        armElbowCurve: Number(randRange(0.45, 0.85).toFixed(2)),
        subArmProb: Number(randRange(0.25, 0.75).toFixed(2)),
        spineDensity: Number(randRange(1.1, 1.75).toFixed(2)),
        spineLength: Number(randRange(0.85, 1.45).toFixed(2)),
        spinesPerAreole: Math.round(randRange(5, 9)),
        cactusFlowerCount: Math.round(randRange(3, 7)),
        colorTrunk: cactusTrunk,
        colorSpine: blendHex('#fef08a', colorLeafTip, 0.45),
      },
      hybridName: `Cactus Híbrido (${sub}): ${shortSpeciesName(donorA)} × ${shortSpeciesName(donorB)}`,
      lineageSummary: `Cactácea ${sub} Acostillada + Púas & Floración ${shortSpeciesName(donorB)}`,
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 5. BAMBOO GROVE HYBRID (Multi-Culm Nodal Canes + Blended Foliage)
  // ───────────────────────────────────────────────────────────────────────────
  if (family === 'bamboo_grove') {
    const height = Number(randRange(4.8, 7.6).toFixed(1));
    return {
      params: {
        ...baseParams,
        presetId: donorA.id,
        engine: 'bamboo',
        crownShape: 'cylindrical',
        height,
        radius: Number(randRange(0.11, 0.18).toFixed(2)),
        taper: 0.91,
        levels: 4,
        noise: Number(randRange(0.10, 0.22).toFixed(2)),
        showRoots: false,
        barkType: 'bamboo_culm',
        foliageType: pick(BAMBOO_COMPATIBLE_FOLIAGE),
        leafScale: Number(randRange(1.05, 1.45).toFixed(2)),
        leafDensity: Math.round(randRange(4, 5)),
        colorTrunk: blendHex('#65a30d', colorTrunk, 0.42),
      },
      hybridName: `Bosquete Híbrido: ${shortSpeciesName(donorA)} × ${shortSpeciesName(donorB)}`,
      lineageSummary: `Cañas Nodales Articuladas + Follaje ${shortSpeciesName(donorB)}`,
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 6. ALIEN XENOBOTANY CHIMERA (Cohesive Exoplanetary Body + Grounded Roots)
  // ───────────────────────────────────────────────────────────────────────────
  if (family === 'alien_chimera') {
    const arch = pick(ALIEN_ARCHETYPES);
    const height = Number(randRange(3.8, 7.4).toFixed(1));
    const radius = Number(THREE.MathUtils.clamp(height * randRange(0.06, 0.11), 0.28, 0.62).toFixed(2));
    const alienShader = pick<TonalShaderMode>([
      'bioluminescent_abyss',
      'voronoi_cracked',
      'iridescent_chitin',
      'translucent_jelly',
      'tri_tone_xenogradient',
      'striated_banded',
    ]);

    return {
      params: {
        ...baseParams,
        presetId: donorA.id,
        engine: 'alien_xenobotany',
        alienArchetype: arch,
        tonalMode: alienShader,
        height,
        radius,
        taper: Number(randRange(0.62, 0.82).toFixed(2)),
        flare: Number(randRange(0.38, 0.65).toFixed(2)),
        crownWidthRatio: Number(randRange(0.40, 0.56).toFixed(2)),
        levels: 4,
        branchCount: Math.round(randRange(3, 6)),
        gnarl: Number(randRange(0.18, 0.45).toFixed(2)),
        leafScale: Number(randRange(0.95, 1.35).toFixed(2)),
        leafDensity: 4,
        showRoots: arch !== 'carnivorous_pitcher_colony' && arch !== 'azure_spore_chimneys' && arch !== 'biolum_crater_mounds',
        rootCount: Math.round(randRange(5, 8)),
        rootLength: Number(randRange(1.2, 1.65).toFixed(2)),
        rootThickness: Number(randRange(0.95, 1.3).toFixed(2)),
        rootArch: Number(randRange(0.45, 0.95).toFixed(2)),
        emissiveIntensity: Number(randRange(0.35, 0.95).toFixed(2)),
        wetnessGloss: Number(randRange(0.28, 0.78).toFixed(2)),
        colorTrunk: blendHex(palPreset.colorTrunk, pA.colorTrunk, 0.4),
        colorLeafMain: blendHex(palPreset.colorLeafMain, pB.colorLeafMain, 0.45),
        colorLeafTip: blendHex(palPreset.colorLeafTip, pB.colorLeafTip, 0.45),
        colorFlower: blendHex(palPreset.colorFlower, pC.colorFlower, 0.45),
        colorAccent: palPreset.colorAccent,
      },
      hybridName: `Quimera Xeno: ${shortSpeciesName(donorA)} × ${shortSpeciesName(donorB)}`,
      lineageSummary: `Cuerpo Xenobotánico + Paleta ${shortSpeciesName(donorB)} & ${palPreset.name}`,
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 7. MOSSY BOULDER & FUNGI ECOSYSTEM HYBRID (Rock + Moss Cushions + Fungi Colony)
  // ───────────────────────────────────────────────────────────────────────────
  if (family === 'moss_rock_colony') {
    const mossArch = pick(MOSS_FUNGI_ARCHETYPES);
    const rockColor = blendHex('#57534e', pA.colorTrunk, 0.25);
    const mossGreen = blendHex('#2d6a4f', pB.colorLeafMain, 0.35);

    return {
      params: {
        ...baseParams,
        presetId: donorA.id,
        engine: 'moss_fungi_rock',
        mossFungiArchetype: mossArch,
        rockScale: Number(randRange(0.85, 1.35).toFixed(2)),
        rockRoughness: Number(randRange(0.45, 0.95).toFixed(2)),
        mossCoverage: Number(randRange(0.72, 0.96).toFixed(2)),
        height: 2.0,
        radius: 0.44,
        showRoots: false,
        branchCount: Math.round(randRange(5, 9)),
        leafScale: Number(randRange(0.95, 1.35).toFixed(2)),
        leafDensity: Math.round(randRange(4, 6)),
        barkType: 'fissured',
        tonalMode: mossArch === 'biolum_mycena_colony' ? 'bioluminescent_abyss' : tonalMode,
        colorTrunk: rockColor,
        colorLeafMain: mossGreen,
        colorLeafTip: colorLeafTip,
        colorFlower: colorFlower,
        colorAccent: colorAccent,
        emissiveIntensity: mossArch === 'biolum_mycena_colony' ? 0.88 : useExoticShader ? 0.42 : 0.14,
        wetnessGloss: Number(randRange(0.28, 0.68).toFixed(2)),
      },
      hybridName: `Roca Musgosa Híbrida: ${shortSpeciesName(donorA)} × ${shortSpeciesName(donorB)}`,
      lineageSummary: `Roca 3D + Manto Briófito + Hongos/Tonos ${shortSpeciesName(donorB)}`,
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 8. AQUATIC CORAL & KELP REEF HYBRID (Reef Holdfast + Coral/Anemone/Algae)
  // ───────────────────────────────────────────────────────────────────────────
  const aqArch = pick(AQUATIC_ARCHETYPES);
  const isKelpLike = aqArch === 'giant_kelp_forest' || aqArch === 'bull_kelp_whip';
  return {
    params: {
      ...baseParams,
      presetId: donorA.id,
      engine: 'aquatic_coral_algae',
      aquaticArchetype: aqArch,
      rockScale: Number(randRange(0.85, 1.3).toFixed(2)),
      height: isKelpLike ? Number(randRange(4.4, 6.8).toFixed(1)) : Number(randRange(2.6, 4.2).toFixed(1)),
      radius: Number(randRange(0.26, 0.42).toFixed(2)),
      showRoots: false,
      branchCount: Math.round(randRange(4, 7)),
      leafScale: Number(randRange(0.95, 1.35).toFixed(2)),
      leafDensity: 5,
      gnarl: Number(randRange(0.18, 0.42).toFixed(2)),
      barkType: 'cactus_ribs',
      tonalMode: pick(['natural_botanical', 'bioluminescent_abyss', 'translucent_jelly', 'iridescent_chitin', 'tri_tone_xenogradient']),
      colorTrunk: blendHex('#0f766e', pA.colorTrunk, 0.45),
      colorLeafMain: blendHex('#06b6d4', pB.colorLeafMain, 0.5),
      colorLeafTip: blendHex('#f472b6', pB.colorLeafTip, 0.5),
      colorFlower: colorFlower,
      colorAccent: colorAccent,
      emissiveIntensity: Number(randRange(0.25, 0.78).toFixed(2)),
      wetnessGloss: Number(randRange(0.5, 0.92).toFixed(2)),
      windStrength: 0.62,
      windTurbulence: 0.45,
    },
    hybridName: `Arrecife Híbrido: ${shortSpeciesName(donorA)} × ${shortSpeciesName(donorB)}`,
    lineageSummary: `Roca Arrecifal + Morfología Acuática + Paleta ${shortSpeciesName(donorC)}`,
  };
}
