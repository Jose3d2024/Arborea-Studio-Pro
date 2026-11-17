export type GrowthEngine =
  | 'sympodial'
  | 'monopodial'
  | 'palm'
  | 'weeping'
  | 'cactus'
  | 'bamboo'
  | 'rosette'
  | 'shrub'
  | 'alien_xenobotany'
  | 'moss_fungi_rock'
  | 'aquatic_coral_algae'
  | 'composed_custom';

export type StemStructureType =
  | 'spiral_volute_vine'
  | 'gnarled_bonsai'
  | 'thorny_horn_crown'
  | 'sympodial_tree'
  | 'weeping_willow'
  | 'rosette_cluster'
  | 'multi_stalk_umbel_colony'
  | 'herbaceous_curved_stalk'
  | 'serpentine_mossy_deadwood'
  | 'strangler_root_cage'
  | 'baobab_pachycaul_bottle'
  | 'mangrove_stilt_arch'
  | 'dichotomous_dragon_tree'
  | 'braided_helix_trunks'
  | 'segmented_bamboo_equisetum'
  | 'hollow_ancient_snag'
  | 'creeping_rhizome_runners'
  | 'scifi_tendril_cradle';

export type CanopyElementType =
  | 'cloud_bonsai_pads'
  | 'stem_hugging_leaves'
  | 'thorn_spur_clusters'
  | 'custom_leaf_lamina'
  | 'custom_flower_corolla'
  | 'custom_fungi_cap'
  | 'spherical_bubble_umbel'
  | 'radiating_floret_head'
  | 'hanging_bell_cluster'
  | 'crystal_prism_crown'
  | 'procedural_lathe_head'
  | 'moss_velvet_mantle'
  | 'scifi_biolum_plasma_globes'
  | 'scifi_voronoi_ova_balloons'
  | 'fenestrated_monstera_leaves'
  | 'palmate_maple_star_leaves'
  | 'pinnate_fern_palm_fronds'
  | 'succulent_fleshy_rosettes'
  | 'conifer_needle_brushes'
  | 'lotus_magnolia_corolla_crown'
  | 'passionflower_filament_corona'
  | 'heliconia_bract_candelabra'
  | 'dehiscent_seed_pods_coronas'
  | 'carnivorous_nepenthes_pitchers'
  | 'custom_spline_leaf_crown';

export type SurfaceElementType =
  | 'braided_vines'
  | 'curved_thorns_spines'
  | 'moss_lichen_bark'
  | 'smooth_striated'
  | 'strangler_root_web'
  | 'rose_hooked_prickles'
  | 'cactus_areole_spine_bursts'
  | 'armored_dragon_scales'
  | 'shelf_fungi_conks'
  | 'biolum_nodule_pustules';

export type HangingElementType =
  | 'weeping_filaments'
  | 'curling_tendrils'
  | 'mycelial_fuzz'
  | 'hanging_pods_berries'
  | 'aerial_root_curtains'
  | 'winged_samara_seeds'
  | 'tethered_scifi_lantern_globes'
  | 'spanish_moss_epiphyte_drapes'
  | 'thorny_barbed_whips'
  | 'none';

export type SynthesizedHeadTopology =
  | 'none'
  | 'spherical_umbel_rays'
  | 'revolved_lathe_chalice'
  | 'layered_petal_starburst'
  | 'hanging_bell_raceme'
  | 'crystal_spire_cluster'
  | 'spline_petal_corona';

export type SynthesizedTipPrimitive =
  | 'iridescent_bubble'
  | 'dewy_droplet'
  | 'micro_floret_star'
  | 'cupped_bell_calyx'
  | 'faceted_crystal_gem'
  | 'spotted_spore_dome'
  | 'lanceolate_blade'
  | 'bryophyte_moss_pad'
  | 'scifi_plasma_orb'
  | 'spiked_seed_burr'
  | 'winged_helicoid_seed'
  | 'crowned_pomegranate_pod'
  | 'recurved_thorn_claw'
  | 'feathery_pappus_plume'
  | 'sucker_tentacle_cup'
  | 'none';

export type SynthesizedBasalFoliageType =
  | 'none'
  | 'long_grass_blades'
  | 'broad_rosette_leaves'
  | 'spiny_succulent_claws'
  | 'fern_fiddleheads'
  | 'baby_umbel_sprouts';

export interface CustomBotanicalElement {
  id: string;
  name: string;
  scientificName: string;
  description: string;
  createdAt: number;
  stemStructure: StemStructureType;
  canopyElement: CanopyElementType;
  surfaceElement: SurfaceElementType;
  hangingElement: HangingElementType;
  spiralTurns: number;
  spiralArms: number;
  thornDensity: number;
  thornLength: number;
  filamentCount: number;
  filamentLength: number;
  padLayers: number;
  lobeCount: number;
  cupDepth: number;
  // Parametric Custom Trunk, Branch, Cap, Leaf & Petal Morphology
  stemCount?: number;
  trunkBentS?: number;
  branchSpread?: number;
  branchDroop?: number;
  capDomeHeight?: number;
  capSpotDensity?: number;
  gillCount?: number;
  petalOpenness?: number;
  leafSerration?: number;
  // Generative AI New Part Synthesis Blueprint (when existing parts are not enough)
  synthesizedHeadTopology?: SynthesizedHeadTopology;
  synthesizedTipPrimitive?: SynthesizedTipPrimitive;
  synthesizedBasalFoliage?: SynthesizedBasalFoliageType;
  umbelRayCount?: number;
  umbelSphereRatio?: number;
  tipBubbleScale?: number;
  basalLeafCount?: number;
  basalLeafLength?: number;
  iridescentShift?: number;
  latheProfileRadii?: number[];
  petalContourProfile?: number[];
  petalCupping?: number;
  petalTwistDeg?: number;
  petalMarginWave?: number;
  aiNewPartsReport?: string;
}

export type AlienArchetype =
  | 'mega_mushroom_terraced'
  | 'spiral_fiddlehead_tentacle'
  | 'carnivorous_pitcher_colony'
  | 'fenestrated_coral_spire'
  | 'cracked_ova_cluster'
  | 'star_flower_caudex'
  | 'azure_spore_chimneys'
  | 'sap_fissure_baobab'
  | 'spiky_mace_sentinel'
  | 'crimson_coral_plume'
  | 'biolum_crater_mounds'
  | 'albino_crystal_palm';

export type MossFungiArchetype =
  | 'velvet_moss_sporophytes'
  | 'star_moss_polytrichum'
  | 'sphagnum_bog_pillow'
  | 'amanita_muscaria_moss'
  | 'biolum_mycena_colony'
  | 'turkey_tail_bracket'
  | 'golden_enoki_cluster'
  | 'pixie_cup_lichen'
  | 'morel_sponge_moss'
  | 'coral_fungus_ramaria'
  | 'chanterelle_golden_moss'
  | 'puffball_birds_nest';

export type AquaticArchetype =
  | 'staghorn_acropora'
  | 'brain_coral_boulder'
  | 'gorgonian_sea_fan'
  | 'tube_sponge_cluster'
  | 'giant_kelp_forest'
  | 'bull_kelp_whip'
  | 'sea_anemone_tentacles'
  | 'plate_montipora_whorl'
  | 'pillar_organ_pipe_coral'
  | 'red_seaweed_dulse'
  | 'bladder_wrack_sargassum'
  | 'seagrass_posidonia_meadow';

export type TonalShaderMode =
  | 'natural_botanical'
  | 'bioluminescent_abyss'
  | 'voronoi_cracked'
  | 'iridescent_chitin'
  | 'translucent_jelly'
  | 'tri_tone_xenogradient'
  | 'striated_banded'
  | 'cel_concept_art'
  | 'spectral_thermal';

/**
 * Representation Styles inspired by Dr. Andrew Marsh's Tree3D-Web, Florasynth, and Wiskered TreeGen
 */
export type RepresentationStyle =
  | 'botanical_leaves'      // Detailed 3D botanical leaves, needles, fronds & blossoms (Florasynth / SpeedTree)
  | 'metaball_isosurface'   // Volumetric Marching Cubes Iso-Surface Metaball canopy (Andrew Marsh Tree3D-Web)
  | 'geodesic_clusters'     // Subdivided Geodesic / Perlin-displaced sphere clusters (Tree3D / Wiskered TreeGen)
  | 'fibonacci_phyllotaxis' // Golden-angle Fibonacci spiral leaf domes (Tree3D-Web)
  | 'tiered_plates'         // Horizontal stratified architectural canopy discs/plates (Tree3D-Web BIM)
  | 'architectural_envelope'// Parametric BIM Crown Envelope + internal branch skeleton (Tree3D-Web Solar)
  | 'voxel_grid';           // Volumetric 3D Voxel grid canopy

/**
 * Crown Envelope Shapes (Weber & Penn / Andrew Marsh Tree3D)
 */
export type CrownEnvelopeShape =
  | 'spherical'
  | 'conical'
  | 'hemispherical'
  | 'cylindrical'
  | 'tapered_cylinder'
  | 'flame'
  | 'umbrella'
  | 'inverse_conical';

export type FoliageType =
  | 'needles_fascicle'
  | 'needles_pectinate'
  | 'needles_radial'
  | 'needles_scale'
  | 'needles_rosette'
  | 'broadleaf_lobed'
  | 'broadleaf_palmate'
  | 'broadleaf_ovate'
  | 'broadleaf_lanceolate'
  | 'broadleaf_ginkgo'
  | 'broadleaf_heart'
  | 'fronds_pinnate'
  | 'fronds_palmate'
  | 'fronds_fern'
  | 'paddle_banana'
  | 'bamboo_lance'
  | 'weeping_strands'
  | 'blossom_clusters'
  | 'berry_clusters'
  | 'succulent_rosette'
  | 'alien_umbrella_caps'
  | 'alien_pitcher_traps'
  | 'alien_spore_bulbs'
  | 'alien_tentacle_coils'
  | 'ai_custom_element'
  | 'canopy_volume'
  | 'none';

export type BarkType =
  | 'fissured'
  | 'pine_plates'
  | 'birch_paper'
  | 'smooth_ash'
  | 'palm_rings'
  | 'bamboo_culm'
  | 'cactus_ribs'
  | 'fibrous_redwood'
  | 'mossy_deadwood'
  | 'cork_oak_quercus'
  | 'eucalyptus_rainbow'
  | 'gnarled_olive_burl'
  | 'dragon_scales_cycad'
  | 'strangler_vine_lattice'
  | 'scifi_biolum_veins'
  | 'volcanic_magma_crust';

export type PolygonLOD = 'low' | 'medium' | 'high' | 'ultra';
export type ShaderQuality = 'unlit' | 'lambert' | 'pbr_standard' | 'pbr_subsurface';
export type TextureQuality = 'none' | 'low_256' | 'med_512' | 'high_1024';
export type SeasonMode = 'spring' | 'summer' | 'autumn' | 'winter';
export type CactusSubType = 'saguaro' | 'organ_pipe' | 'opuntia' | 'barrel' | 'candelabra';
export type ViewportShadingMode = 'lit' | 'wireframe' | 'normals' | 'clay' | 'xray_canopy';
export type EcosystemBaseType =
  | 'auto'
  | 'temperate_forest'
  | 'alpine_granite'
  | 'desert_dunes'
  | 'mossy_forest_floor'
  | 'aquatic_reef_seabed'
  | 'exoplanetary_crater'
  | 'clean_pedestal';

export interface TreeParams {
  presetId: string;
  seed: number;
  engine: GrowthEngine;
  customElement?: CustomBotanicalElement;
  alienArchetype?: AlienArchetype;
  mossFungiArchetype?: MossFungiArchetype;
  aquaticArchetype?: AquaticArchetype;
  rockScale?: number;
  rockRoughness?: number;
  mossCoverage?: number;
  // Representation & Crown Envelope (Tree3D-Web / Florasynth / TreeGen)
  representationStyle: RepresentationStyle;
  crownShape: CrownEnvelopeShape;
  canopyOpacity: number;
  metaballThreshold: number;
  metaballResolution: number;
  clusterNoise: number;
  clusterFlatten: number;
  smoothShading: boolean;
  // Granular Polygon Topology Overrides (Tree3D / TreeGen)
  radialSegments: number;
  curveSteps: number;
  subdivisionDetail: number;
  // Trunk & Branch Architecture (Florasynth / proctree)
  levels: number;
  height: number;
  trunkClearHeight: number;
  crownWidthRatio: number;
  radius: number;
  taper: number;
  flare: number;
  // Roots System (Downward Ground-Hugging & Arching Buttress/Stilt Roots)
  showRoots: boolean;
  rootCount: number;
  rootLength: number;
  rootThickness: number;
  rootArch: number;
  // Branching & Tropism (Florasynth / GrowFX)
  angle: number;
  decay: number;
  noise: number;
  gravity: number;
  apicalDominance: number;
  gnarl: number;
  branchCount: number;
  trunkSplitHeight: number;
  pruneRatio: number;
  // Foliage & Leaves
  foliageType: FoliageType;
  leafScale: number;
  leafDensity: number;
  leafWidthRatio: number;
  leafBend: number;
  // Bark, Palette & Xenobotanical Shaders / Tonalities
  barkType: BarkType;
  barkRoughness: number;
  colorTrunk: string;
  colorLeafMain: string;
  colorLeafTip: string;
  colorFlower: string;
  colorAccent?: string;
  tonalMode?: TonalShaderMode;
  emissiveIntensity?: number;
  iridescenceAmount?: number;
  patternScale?: number;
  patternContrast?: number;
  wetnessGloss?: number;
  hueShift?: number;
  // Conifer / Needle Specifics
  needleLength: number;
  needleDensity: number;
  fascicleCount: number;
  needleSpreadAngle: number;
  pineConeDensity: number;
  whorlBranches: number;
  // Cactus & Succulent Specifics
  cactusSubType: CactusSubType;
  cactusRibs: number;
  ribDepth: number;
  armCount: number;
  armSpread: number;
  armHeightMin: number;
  armElbowCurve: number;
  subArmProb: number;
  spineDensity: number;
  spineLength: number;
  spinesPerAreole: number;
  colorSpine: string;
  cactusFlowerCount: number;
  // Environment, Solar Path & Wind (Andrew Marsh Tree3D-Web)
  season: SeasonMode;
  windEnabled: boolean;
  windStrength: number;
  windTurbulence: number;
  sunElevation: number;
  sunAzimuth: number;
}

export interface QualitySettings {
  polygonLod: PolygonLOD;
  meshDensity: number; // Continuous slider from 0.15 (Low-Poly) to 2.20 (Max Organic Vertices)
  shaderQuality: ShaderQuality;
  textureQuality: TextureQuality;
  viewportMode: ViewportShadingMode;
  backgroundColor: string;
  groundColor: string;
  showGroundDisk: boolean;
  ecosystemBase: EcosystemBaseType;
  ecosystemBaseScale?: number;
  includeBaseInExport?: boolean;
  showGrid: boolean;
  showCompassSolar: boolean;
  showDimensions: boolean;
  showScaleRef: boolean;
  autoRotate: boolean;
}

export interface SpeciesPreset {
  id: string;
  name: string;
  scientificName: string;
  category: string;
  description: string;
  params: Partial<TreeParams>;
}

export interface TonalPalettePreset {
  id: string;
  name: string;
  badge: string;
  tonalMode: TonalShaderMode;
  colorTrunk: string;
  colorLeafMain: string;
  colorLeafTip: string;
  colorFlower: string;
  colorAccent: string;
  emissiveIntensity: number;
  iridescenceAmount: number;
  patternScale: number;
  patternContrast: number;
  wetnessGloss: number;
}

export interface BackgroundPreset {
  id: string;
  name: string;
  bg: string;
  ground: string;
}

export interface MeshStats {
  triangles: number;
  vertices: number;
  trunkTriangles: number;
  foliageTriangles: number;
  crownDiameterM: number;
  treeHeightM: number;
  drawCalls: number;
  generationTimeMs: number;
}
