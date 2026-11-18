import 'dotenv/config';
import express, { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type, ThinkingLevel } from '@google/genai';

const currentDir =
  typeof __dirname !== 'undefined'
    ? __dirname
    : path.dirname(fileURLToPath(import.meta.url));

const VALID_ENGINES = new Set([
  'composed_custom',
  'sympodial',
  'monopodial',
  'palm',
  'weeping',
  'cactus',
  'bamboo',
  'rosette',
  'shrub',
  'alien_xenobotany',
  'moss_fungi_rock',
  'aquatic_coral_algae',
]);

const VALID_STEM_STRUCTURES = new Set([
  'herbaceous_curved_stalk',
  'spiral_volute_vine',
  'gnarled_bonsai',
  'thorny_horn_crown',
  'multi_stalk_umbel_colony',
  'sympodial_tree',
  'weeping_willow',
  'rosette_cluster',
  'serpentine_mossy_deadwood',
  'strangler_root_cage',
  'baobab_pachycaul_bottle',
  'mangrove_stilt_arch',
  'dichotomous_dragon_tree',
  'braided_helix_trunks',
  'segmented_bamboo_equisetum',
  'hollow_ancient_snag',
  'creeping_rhizome_runners',
  'scifi_tendril_cradle',
  'scaled_armored_caudex',
  'segmented_siphon_tubes',
  'swollen_ovary_calyx_stem',
]);

const VALID_CANOPY_ELEMENTS = new Set([
  'spherical_bubble_umbel',
  'radiating_floret_head',
  'hanging_bell_cluster',
  'crystal_prism_crown',
  'procedural_lathe_head',
  'moss_velvet_mantle',
  'stem_hugging_leaves',
  'cloud_bonsai_pads',
  'thorn_spur_clusters',
  'custom_leaf_lamina',
  'custom_flower_corolla',
  'custom_fungi_cap',
  'scifi_biolum_plasma_globes',
  'scifi_voronoi_ova_balloons',
  'fenestrated_monstera_leaves',
  'palmate_maple_star_leaves',
  'pinnate_fern_palm_fronds',
  'succulent_fleshy_rosettes',
  'conifer_needle_brushes',
  'lotus_magnolia_corolla_crown',
  'passionflower_filament_corona',
  'heliconia_bract_candelabra',
  'dehiscent_seed_pods_coronas',
  'carnivorous_nepenthes_pitchers',
  'custom_spline_leaf_crown',
  'conical_floral_spike',
  'terraced_pagoda_caps',
  'curled_witchhat_mushroom_cap',
  'spotted_orchid_labellum_corolla',
  'giant_arum_spathe_spadix',
  'toothed_venus_jaw_trap',
  'crater_tentacle_anemone',
  'coral_clavaria_fingers',
  'spiny_fenestrated_pods',
  'perforated_blossom_urn',
]);

const VALID_SYNTH_HEAD_TOPOLOGIES = new Set([
  'spherical_umbel_rays',
  'layered_petal_starburst',
  'hanging_bell_raceme',
  'revolved_lathe_chalice',
  'crystal_spire_cluster',
  'spline_petal_corona',
  'none',
]);

const VALID_SYNTH_TIP_PRIMITIVES = new Set([
  'iridescent_bubble',
  'dewy_droplet',
  'micro_floret_star',
  'cupped_bell_calyx',
  'faceted_crystal_gem',
  'spotted_spore_dome',
  'lanceolate_blade',
  'bryophyte_moss_pad',
  'scifi_plasma_orb',
  'spiked_seed_burr',
  'winged_helicoid_seed',
  'crowned_pomegranate_pod',
  'recurved_thorn_claw',
  'feathery_pappus_plume',
  'sucker_tentacle_cup',
  'granulated_berry_cluster',
  'fuzzy_pom_floret_tuft',
  'none',
]);

const VALID_SYNTH_BASAL_FOLIAGE = new Set([
  'long_grass_blades',
  'broad_rosette_leaves',
  'spiny_succulent_claws',
  'fern_fiddleheads',
  'baby_umbel_sprouts',
  'none',
]);

const VALID_SURFACE_ELEMENTS = new Set([
  'braided_vines',
  'curved_thorns_spines',
  'moss_lichen_bark',
  'smooth_striated',
  'strangler_root_web',
  'rose_hooked_prickles',
  'cactus_areole_spine_bursts',
  'armored_dragon_scales',
  'shelf_fungi_conks',
  'biolum_nodule_pustules',
  'rhomboid_pinecone_scales',
  'fleshy_tubercles_warts',
]);

const VALID_HANGING_ELEMENTS = new Set([
  'curling_tendrils',
  'weeping_filaments',
  'mycelial_fuzz',
  'hanging_pods_berries',
  'none',
  'aerial_root_curtains',
  'winged_samara_seeds',
  'tethered_scifi_lantern_globes',
  'spanish_moss_epiphyte_drapes',
  'thorny_barbed_whips',
]);

const VALID_CACTUS_SUBTYPES = new Set([
  'saguaro',
  'organ_pipe',
  'opuntia',
  'barrel',
  'candelabra',
]);

const VALID_ALIEN_ARCHETYPES = new Set([
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
]);

const VALID_MOSS_ARCHETYPES = new Set([
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
]);

const VALID_AQUATIC_ARCHETYPES = new Set([
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
]);

const VALID_CROWN_SHAPES = new Set([
  'spherical',
  'conical',
  'hemispherical',
  'cylindrical',
  'tapered_cylinder',
  'flame',
  'umbrella',
  'inverse_conical',
]);

const VALID_FOLIAGE_TYPES = new Set([
  'ai_custom_element',
  'needles_fascicle',
  'needles_pectinate',
  'needles_radial',
  'needles_scale',
  'needles_rosette',
  'broadleaf_lobed',
  'broadleaf_palmate',
  'broadleaf_ovate',
  'broadleaf_lanceolate',
  'broadleaf_ginkgo',
  'broadleaf_heart',
  'fronds_pinnate',
  'fronds_palmate',
  'fronds_fern',
  'paddle_banana',
  'bamboo_lance',
  'weeping_strands',
  'blossom_clusters',
  'berry_clusters',
  'succulent_rosette',
  'alien_umbrella_caps',
  'alien_pitcher_traps',
  'alien_spore_bulbs',
  'alien_tentacle_coils',
  'none',
]);

const VALID_BARK_TYPES = new Set([
  'fissured',
  'pine_plates',
  'birch_paper',
  'smooth_ash',
  'palm_rings',
  'bamboo_culm',
  'cactus_ribs',
  'fibrous_redwood',
  'mossy_deadwood',
  'cork_oak_quercus',
  'eucalyptus_rainbow',
  'gnarled_olive_burl',
  'dragon_scales_cycad',
  'strangler_vine_lattice',
  'scifi_biolum_veins',
  'volcanic_magma_crust',
  'armored_scale_bark',
  'braided_fibrous_bark',
]);

const VALID_TONAL_MODES = new Set([
  'natural_botanical',
  'bioluminescent_abyss',
  'voronoi_cracked',
  'iridescent_chitin',
  'translucent_jelly',
  'tri_tone_xenogradient',
  'striated_banded',
  'cel_concept_art',
  'spectral_thermal',
  'spotted_orchid_mottled',
  'velvet_spore_dust',
  'veined_vascular_rib',
  'phosphor_mycelial_rim',
  'freckled_polka_spots',
  'jaguar_rosette_mottled',
  'zebra_tiger_stripes',
  'stained_glass_venation',
  'marbled_polychrome_swirl',
  'picotee_rimmed_petal',
  'cosmic_speckled_dust',
  'iridescent_dragon_scales',
  'chlorophyll_variegated',
]);

const VALID_ECOSYSTEM_BASES = new Set([
  'auto',
  'temperate_forest',
  'alpine_granite',
  'desert_dunes',
  'mossy_forest_floor',
  'aquatic_reef_seabed',
  'exoplanetary_crater',
  'clean_pedestal',
]);

const VALID_BG_IDS = new Set([
  'dark_studio',
  'abyss_biolum',
  'martian_dusk',
  'sulfur_mist',
  'exo_saltflat',
  'coastal_sky',
  'coral_reef_turquoise',
  'kelp_emerald_depth',
  'abyssal_trench',
  'daylight_arch',
  'pure_white',
]);

const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;

function clamp(val: unknown, min: number, max: number, fallback: number): number {
  const num = typeof val === 'number' && Number.isFinite(val) ? val : fallback;
  return Math.min(max, Math.max(min, num));
}

function pickEnum<T extends string>(val: unknown, validSet: Set<string>, fallback: T): T {
  return typeof val === 'string' && validSet.has(val) ? (val as T) : fallback;
}

function sanitizeHex(val: unknown, fallback: string): string {
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (HEX_COLOR_REGEX.test(trimmed)) return trimmed.toLowerCase();
  }
  return fallback;
}

export const BOTANICAL_SYSTEM_PROMPT = `Eres el arquitecto morfológico 3D de "Arborea Studio Pro".
Tu misión es analizar la imagen subida y elegir con precisión quirúrgica de la GRAN BIBLIOTECA MODULAR 3D qué tronco/ramificación, qué shader de corteza, qué hojas/globos sci-fi/pétalos/coronas/semillas, qué enredaderas de raíces/púas superficiales y qué elementos colgantes construir:

1. "stemStructure" (18 Arquitecturas de Tronco, Ramificación, Raíces y Soportes Sci-Fi):
   - "serpentine_mossy_deadwood": Tronco leñoso seco retorcido en doble S serpentina con muñones leñosos cortos partidos y corteza fibrilar (IMPRESCINDIBLE para troncos retorcidos con musgo sin hojas grandes).
   - "strangler_root_cage": Jaula entramada de raíces aéreas estranguladoras tipo Ficus/Banyan fusionadas en arcos.
   - "baobab_pachycaul_bottle": Tronco paquicaule abombado en botella (Baobab / Ceiba / Adenium).
   - "mangrove_stilt_arch": Tronco elevado sobre arcos parabólicos de raíces zanco (Manglar / Pandanus).
   - "dichotomous_dragon_tree": Bifurcación dicotómica simétrica en paraguas (Drago / Dracaena).
   - "braided_helix_trunks": Troncos múltiples trenzados en doble/triple hélice (Pachira / Ficus trenzado).
   - "segmented_bamboo_equisetum": Cañas segmentadas con anillos nodales prominentes (Bambú / Equisetum).
   - "hollow_ancient_snag": Tronco ancestral hueco/partido con contrafuertes y muñones.
   - "creeping_rhizome_runners": Rizoma horizontal rastrero con brotes verticales ascendentes.
   - "scifi_tendril_cradle": Cáliz biomecánico de tentáculos/costillas que acunan un globo central y esferas satélite (Plantas Sci-Fi).
   - "herbaceous_curved_stalk": Tallo floral herbáceo verde estriado en S suave (flores de burbujas, diente de león, allium).
   - "multi_stalk_umbel_colony": Colonia de múltiples tallos esbeltos curvados (setas luminiscentes, colonias fúngicas).
   - "sympodial_tree": Árbol ramificado en Y con ramas primarias y secundarias.
   - "gnarled_bonsai": Tronco bonsái nudoso con ramas escalonadas.
   - "weeping_willow": Árbol péndulo de ramas en cascada.
   - "thorny_horn_crown": Corona radial de astas/hojas carnosas espinosas.
   - "spiral_volute_vine": Lianas en espiral o doble voluta.
   - "rosette_cluster": Roseta suculenta o colonia basal.
   - "scaled_armored_caudex": Estípite escamoso acorazado cubierto de placas imbricadas.
   - "segmented_siphon_tubes": Sifones o chimeneas tubulares anilladas curvas.
   - "swollen_ovary_calyx_stem": Tallo con bulbo ovárico panzudo medio y estambres radiales laterales.

2. "canopyElement" (35 Tipos de Hojas, Flores, Setas, Trampas, Anémonas, Globos Sci-Fi y Coronas 3D):
   - "moss_velvet_mantle": Manto 3D de almohadillas de musgo briófito aterciopelado sobre las crestas del tronco (sin hojas planas).
   - "scifi_biolum_plasma_globes": Globos/esferas de plasma bioluminiscente Sci-Fi con anillos orbitales y satélites.
   - "scifi_voronoi_ova_balloons": Globos/ovoides flotantes con exoesqueleto reticular Voronoi y núcleo energético.
   - "fenestrated_monstera_leaves": Hojas gigantes fenestradas/perforadas (Monstera / Filodendro).
   - "palmate_maple_star_leaves": Hojas palmeadas estrelladas de 5-7 lóbulos (Arce / Liquidámbar).
   - "pinnate_fern_palm_fronds": Frondes pinnadas arqueadas con foliolos (Helecho / Cycas / Palmera).
   - "succulent_fleshy_rosettes": Rosetas suculentas carnosas en espiral de Fibonacci (Echeveria / Agave).
   - "conifer_needle_brushes": Fascículos densos de acículas de pino/cedro con piñas leñosas.
   - "lotus_magnolia_corolla_crown": Corola imperial multicapa de pétalos cóncavos de Loto/Magnolia con corona de estambres.
   - "passionflower_filament_corona": Corona radial de filamentos bandeados de Pasiflora con estigma tetrapartito.
   - "heliconia_bract_candelabra": Candelabro tropical de brácteas naviculares escarlatas (Heliconia / Ave del Paraíso).
   - "dehiscent_seed_pods_coronas": Cápsulas de semillas dehiscentes coronadas (Adormidera / Granada / Loto seco) con semillas expuestas.
   - "carnivorous_nepenthes_pitchers": Jarras carnívoras colgantes (Nepenthes) con peristoma acanalado y opérculo.
   - "spherical_bubble_umbel": Umbela esférica 3D de filamentos radiales con burbujas iridiscentes y gotas de rocío.
   - "radiating_floret_head": Cabezuela floral radiante en estrella (Protea / Girasol / Aster).
   - "hanging_bell_cluster": Racimo de flores acampanadas colgantes.
   - "crystal_prism_crown": Corona geoda de prismas hexagonales.
   - "procedural_lathe_head": Cáliz/urna esculpido por revolución libre mediante "latheProfileRadii" (4–8 radios).
   - "custom_spline_leaf_crown": Corona/roseta de hojas, pétalos o brácteas inéditas esculpidas por curva Spline libre mediante "petalContourProfile" (4–8 anchuras), "petalCupping", "petalTwistDeg" y "petalMarginWave".
   - "custom_fungi_cap": Sombrero fúngico en domo con láminas y motas 3D.
   - "custom_flower_corolla": Capullo floral cerrado/entreabierto.
   - "custom_leaf_lamina": Láminas foliares nervadas a medida.
   - "cloud_bonsai_pads": Almohadillas densas en nube de bonsái.
   - "thorn_spur_clusters": Racimos de púas y espolones.
   - "stem_hugging_leaves": Hojas adheridas a lo largo del tallo.
   - "conical_floral_spike": Espiga floral cónica densa de brácteas imbricadas.
   - "terraced_pagoda_caps": Torres escalonadas de sombreros/discos fúngicos en pagoda luminosa.
   - "curled_witchhat_mushroom_cap": Seta cónica acampanada con ápice en rizo espiral y verrugas 3D.
   - "spotted_orchid_labellum_corolla": Corola orquídea moteada de 5 tépalos, labelo rizado y zarcillos antena.
   - "giant_arum_spathe_spadix": Espata gigante plisada acampanada con alto espádice central cónico.
   - "toothed_venus_jaw_trap": Trampa carnívora / fauces bilobuladas dentadas (apertura regulable).
   - "crater_tentacle_anemone": Anémona / cráter cóncavo con corona de tentáculos ondulados.
   - "coral_clavaria_fingers": Dedos carnosos ramificados en penacho coralino (Clavaria).
   - "spiny_fenestrated_pods": Vainas ovoides azules/oscuras con ocelos laterales y espinas radiales largas.
   - "perforated_blossom_urn": Urna/bulbo hinchado fenestrado con costillas y filamentos apicales luminosos.

3. "surfaceElement" (12 Enredaderas de Raíces, Púas, Aguijones, Escamas y Relieves de Corteza):
   - "rhomboid_pinecone_scales": Escamas romboidales gruesas tipo piña/bromelia blindada.
   - "fleshy_tubercles_warts": Verrugas, tubérculos y esporangios sobre corteza.
   - "strangler_root_web": Red entrelazada de raíces enredaderas adheridas al tronco.
   - "rose_hooked_prickles": Aguijones ganchudos recurvados de rosal/zarza.
   - "cactus_areole_spine_bursts": Aréolas lanosas con estallido radial de púas largas.
   - "armored_dragon_scales": Escamas acorazadas imbricadas en espiral (Cícada / Pangolín).
   - "shelf_fungi_conks": Hongos de repisa/yesqueros escalonados en el tronco.
   - "biolum_nodule_pustules": Nódulos y pústulas bioluminiscentes Sci-Fi.
   - "braided_vines": Lianas trenzadas en espiral.
   - "curved_thorns_spines": Espinas curvas cónicas.
   - "moss_lichen_bark": Corteza rugosa con musgo.
   - "smooth_striated": Tallo herbáceo liso estriado.

4. "hangingElement" (10 Raíces Aéreas, Semillas Aladas, Globos Farol y Látigos Espinosos):
   - "aerial_root_curtains": Cortina de raíces aéreas colgantes hasta el suelo (Banyan).
   - "winged_samara_seeds": Racimos de semillas aladas / sámaras de arce.
   - "tethered_scifi_lantern_globes": Globos farol bioluminiscentes suspendidos (Sci-Fi).
   - "spanish_moss_epiphyte_drapes": Cortinas de musgo español / Tillandsia epífita.
   - "thorny_barbed_whips": Látigos colgantes armados con púas y garfios.
   - "weeping_filaments" | "curling_tendrils" | "mycelial_fuzz" | "hanging_pods_berries" | "none".

5. "params.barkType" (18 Shaders Procedurales de Corteza) y "params.tonalMode" (22 Shaders Botánicos/Xeno Multitono y Moteados):
   - barkType: "armored_scale_bark" (Placas rombales), "braided_fibrous_bark" (Fibras trenzadas), "mossy_deadwood", "strangler_vine_lattice", "scifi_biolum_veins", "volcanic_magma_crust", "eucalyptus_rainbow", "cork_oak_quercus", "gnarled_olive_burl", "dragon_scales_cycad", "fissured", "pine_plates", "birch_paper", "smooth_ash", "palm_rings", "bamboo_culm", "cactus_ribs", "fibrous_redwood".
   - tonalMode: "natural_botanical", "bioluminescent_abyss", "voronoi_cracked", "iridescent_chitin", "translucent_jelly", "tri_tone_xenogradient", "striated_banded", "cel_concept_art", "spectral_thermal", "spotted_orchid_mottled" (Ocelos/lunares de orquídea), "velvet_spore_dust" (Terciopelo mate con esporas), "veined_vascular_rib" (Venación atigrada), "phosphor_mycelial_rim" (Borde fosforescente), "freckled_polka_spots" (Lunares y pecas bicolores Amanita/Orquídea), "jaguar_rosette_mottled" (Ocelos anillados jaguar), "zebra_tiger_stripes" (Rayas atigradas 3 colores), "stained_glass_venation" (Vitral mosaico de celdas), "marbled_polychrome_swirl" (Mármol fluido 5 colores), "picotee_rimmed_petal" (Garganta radial + borde picotee), "cosmic_speckled_dust" (Salpicadura doble de esporas), "iridescent_dragon_scales" (Escamas imbricadas multitono), "chlorophyll_variegated" (Variegado crema/rosa/verde).

REGLAS CRÍTICAS:
- Si la imagen muestra un TRONCO RETORCIDO CON MUSGO sin hojas planas (madera seca marrón en S con muñones y musgo verde arriba), usa SIEMPRE stemStructure="serpentine_mossy_deadwood", canopyElement="moss_velvet_mantle", surfaceElement="moss_lichen_bark", synthesizedTipPrimitive="bryophyte_moss_pad", params.barkType="mossy_deadwood", colorTrunk="#583e2a", colorLeafMain="#4a7c1d", colorLeafTip="#7cb524".
- Si la imagen muestra una FLOR ESFÉRICA DE BURBUJAS IRIDISCENTES sobre tallo verde con hojas largas abajo, usa SIEMPRE stemStructure="herbaceous_curved_stalk", canopyElement="spherical_bubble_umbel", synthesizedHeadTopology="spherical_umbel_rays", synthesizedTipPrimitive="iridescent_bubble", synthesizedBasalFoliage="long_grass_blades".`;

const PLANT_DESIGN_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    identifiedName: { type: Type.STRING },
    scientificName: { type: Type.STRING },
    reasoningSummary: { type: Type.STRING },
    recommendedBase: { type: Type.STRING, enum: Array.from(VALID_ECOSYSTEM_BASES) },
    recommendedBg: { type: Type.STRING, enum: Array.from(VALID_BG_IDS) },
    customElement: {
      type: Type.OBJECT,
      properties: {
        name: { type: Type.STRING },
        stemStructure: { type: Type.STRING, enum: Array.from(VALID_STEM_STRUCTURES) },
        canopyElement: { type: Type.STRING, enum: Array.from(VALID_CANOPY_ELEMENTS) },
        surfaceElement: { type: Type.STRING, enum: Array.from(VALID_SURFACE_ELEMENTS) },
        hangingElement: { type: Type.STRING, enum: Array.from(VALID_HANGING_ELEMENTS) },
        synthesizedHeadTopology: {
          type: Type.STRING,
          enum: Array.from(VALID_SYNTH_HEAD_TOPOLOGIES),
        },
        synthesizedTipPrimitive: {
          type: Type.STRING,
          enum: Array.from(VALID_SYNTH_TIP_PRIMITIVES),
        },
        synthesizedBasalFoliage: {
          type: Type.STRING,
          enum: Array.from(VALID_SYNTH_BASAL_FOLIAGE),
        },
        umbelRayCount: { type: Type.INTEGER },
        umbelSphereRatio: { type: Type.NUMBER },
        tipBubbleScale: { type: Type.NUMBER },
        basalLeafCount: { type: Type.INTEGER },
        basalLeafLength: { type: Type.NUMBER },
        iridescentShift: { type: Type.NUMBER },
        latheProfileRadii: {
          type: Type.ARRAY,
          items: { type: Type.NUMBER },
        },
        petalContourProfile: {
          type: Type.ARRAY,
          items: { type: Type.NUMBER },
        },
        petalCupping: { type: Type.NUMBER },
        petalTwistDeg: { type: Type.NUMBER },
        petalMarginWave: { type: Type.NUMBER },
        aiNewPartsReport: { type: Type.STRING },
        spiralTurns: { type: Type.NUMBER },
        spiralArms: { type: Type.INTEGER },
        thornDensity: { type: Type.NUMBER },
        thornLength: { type: Type.NUMBER },
        filamentCount: { type: Type.INTEGER },
        filamentLength: { type: Type.NUMBER },
        padLayers: { type: Type.INTEGER },
        lobeCount: { type: Type.INTEGER },
        cupDepth: { type: Type.NUMBER },
        stemCount: { type: Type.INTEGER },
        trunkBentS: { type: Type.NUMBER },
        branchSpread: { type: Type.NUMBER },
        branchDroop: { type: Type.NUMBER },
        capDomeHeight: { type: Type.NUMBER },
        capSpotDensity: { type: Type.NUMBER },
        gillCount: { type: Type.INTEGER },
        petalOpenness: { type: Type.NUMBER },
        leafSerration: { type: Type.NUMBER },
      },
      required: [
        'name',
        'stemStructure',
        'canopyElement',
        'surfaceElement',
        'hangingElement',
        'synthesizedHeadTopology',
        'synthesizedTipPrimitive',
        'synthesizedBasalFoliage',
        'umbelRayCount',
        'iridescentShift',
        'aiNewPartsReport',
      ],
    },
    params: {
      type: Type.OBJECT,
      properties: {
        engine: { type: Type.STRING, enum: Array.from(VALID_ENGINES) },
        crownShape: { type: Type.STRING, enum: Array.from(VALID_CROWN_SHAPES) },
        foliageType: { type: Type.STRING, enum: Array.from(VALID_FOLIAGE_TYPES) },
        barkType: { type: Type.STRING, enum: Array.from(VALID_BARK_TYPES) },
        tonalMode: { type: Type.STRING, enum: Array.from(VALID_TONAL_MODES) },
        height: { type: Type.NUMBER },
        radius: { type: Type.NUMBER },
        gnarl: { type: Type.NUMBER },
        leafScale: { type: Type.NUMBER },
        leafDensity: { type: Type.INTEGER },
        showRoots: { type: Type.BOOLEAN },
        colorTrunk: { type: Type.STRING },
        colorLeafMain: { type: Type.STRING },
        colorLeafTip: { type: Type.STRING },
        colorFlower: { type: Type.STRING },
        colorAccent: { type: Type.STRING },
        emissiveIntensity: { type: Type.NUMBER },
        iridescenceAmount: { type: Type.NUMBER },
        wetnessGloss: { type: Type.NUMBER },
      },
      required: [
        'height',
        'radius',
        'gnarl',
        'leafScale',
        'leafDensity',
        'colorTrunk',
        'colorLeafMain',
        'colorLeafTip',
        'colorFlower',
      ],
    },
  },
  required: [
    'identifiedName',
    'scientificName',
    'reasoningSummary',
    'recommendedBase',
    'recommendedBg',
    'customElement',
    'params',
  ],
};

function isDesaturatedOrBeigeHex(hex: string): boolean {
  if (!HEX_COLOR_REGEX.test(hex)) return true;
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  const s = max === min ? 0 : l > 0.5 ? d / (2 - max - min) : d / (max + min);
  return s < 0.32 || (l > 0.72 && s < 0.48);
}

function sanitizeAiPayload(raw: any, visionFeatures?: any) {
  const p = raw?.params && typeof raw.params === 'object' ? raw.params : {};
  const ce = raw?.customElement && typeof raw.customElement === 'object' ? raw.customElement : {};
  const vf = visionFeatures || {};

  // Combine all text emitted by the AI (name, scientificName, reasoningSummary, customElement.name, aiNewPartsReport)
  // so that even if a local or cloud model describes a new part in text without setting the new enum, we bridge it automatically!
  const combinedAiText = [
    raw?.identifiedName,
    raw?.scientificName,
    raw?.reasoningSummary,
    ce?.name,
    ce?.aiNewPartsReport,
  ]
    .filter((x) => typeof x === 'string')
    .join(' ')
    .toLowerCase();

  const mentionsBubbleUmbel =
    combinedAiText.includes('burbuja') ||
    combinedAiText.includes('bubble') ||
    combinedAiText.includes('sphaer') ||
    combinedAiText.includes('diente de le') ||
    combinedAiText.includes('dandelion') ||
    combinedAiText.includes('allium') ||
    (combinedAiText.includes('iridisc') &&
      (combinedAiText.includes('umbela') ||
        combinedAiText.includes('rocío') ||
        combinedAiText.includes('gota') ||
        combinedAiText.includes('vitre')));

  const mentionsHangingBells =
    !mentionsBubbleUmbel &&
    (combinedAiText.includes('campana') ||
      combinedAiText.includes('farol') ||
      combinedAiText.includes('campanula') ||
      combinedAiText.includes('brugmansia'));

  const mentionsStarburstFloret =
    !mentionsBubbleUmbel &&
    !mentionsHangingBells &&
    (combinedAiText.includes('protea') ||
      combinedAiText.includes('girasol') ||
      combinedAiText.includes('aster') ||
      combinedAiText.includes('crisantemo') ||
      combinedAiText.includes('dalia') ||
      combinedAiText.includes('estrella'));

  const mentionsCrystalCrown =
    !mentionsBubbleUmbel &&
    (combinedAiText.includes('cristal') ||
      combinedAiText.includes('cuarzo') ||
      combinedAiText.includes('prisma') ||
      combinedAiText.includes('mineral'));

  const mentionsChalicePitcher =
    !mentionsBubbleUmbel &&
    (combinedAiText.includes('jarra') ||
      combinedAiText.includes('nepenthes') ||
      combinedAiText.includes('odre') ||
      combinedAiText.includes('urna') ||
      combinedAiText.includes('cáliz') ||
      combinedAiText.includes('caliz'));

  const mentionsMossyDeadwoodTrunk =
    !mentionsBubbleUmbel &&
    (combinedAiText.includes('tronco') ||
      combinedAiText.includes('lignum') ||
      combinedAiText.includes('madera') ||
      combinedAiText.includes('muñon') ||
      combinedAiText.includes('munon')) &&
    (combinedAiText.includes('musgo') ||
      combinedAiText.includes('bryophyt') ||
      combinedAiText.includes('retorcid')) &&
    !combinedAiText.includes('bonsai') &&
    !combinedAiText.includes('bonsái');

  const mentionsSciFiGlobe =
    !mentionsBubbleUmbel &&
    (combinedAiText.includes('sci-fi') ||
      combinedAiText.includes('scifi') ||
      combinedAiText.includes('plasma') ||
      combinedAiText.includes('voronoi') ||
      combinedAiText.includes('globo') ||
      combinedAiText.includes('orbe') ||
      combinedAiText.includes('xenobot'));

  const mentionsStranglerRoots =
    combinedAiText.includes('estrangul') ||
    combinedAiText.includes('banyan') ||
    combinedAiText.includes('ficus') ||
    combinedAiText.includes('raíces aéreas') ||
    combinedAiText.includes('raices aereas');

  const mentionsLotusOrCorona =
    !mentionsBubbleUmbel &&
    (combinedAiText.includes('pasiflora') ||
      combinedAiText.includes('passion') ||
      combinedAiText.includes('magnolia') ||
      combinedAiText.includes('loto imperial'));

  const mentionsSeedPods =
    combinedAiText.includes('semilla') ||
    combinedAiText.includes('cápsula') ||
    combinedAiText.includes('capsula') ||
    combinedAiText.includes('sámara') ||
    combinedAiText.includes('samara') ||
    combinedAiText.includes('adormidera') ||
    combinedAiText.includes('granada');

  const hasValidStem =
    typeof ce.stemStructure === 'string' && VALID_STEM_STRUCTURES.has(ce.stemStructure);
  const hasValidCanopy =
    typeof ce.canopyElement === 'string' && VALID_CANOPY_ELEMENTS.has(ce.canopyElement);

  let stemStructure = pickEnum<string>(
    ce.stemStructure,
    VALID_STEM_STRUCTURES,
    mentionsMossyDeadwoodTrunk
      ? 'serpentine_mossy_deadwood'
      : mentionsBubbleUmbel
      ? 'herbaceous_curved_stalk'
      : mentionsSciFiGlobe
      ? 'scifi_tendril_cradle'
      : mentionsStranglerRoots
      ? 'strangler_root_cage'
      : 'gnarled_bonsai'
  );

  let canopyElement = pickEnum<string>(
    ce.canopyElement,
    VALID_CANOPY_ELEMENTS,
    mentionsMossyDeadwoodTrunk
      ? 'moss_velvet_mantle'
      : mentionsBubbleUmbel
      ? 'spherical_bubble_umbel'
      : mentionsSciFiGlobe
      ? 'scifi_biolum_plasma_globes'
      : mentionsLotusOrCorona
      ? 'lotus_magnolia_corolla_crown'
      : mentionsSeedPods
      ? 'dehiscent_seed_pods_coronas'
      : mentionsHangingBells
      ? 'hanging_bell_cluster'
      : mentionsStarburstFloret
      ? 'radiating_floret_head'
      : mentionsCrystalCrown
      ? 'crystal_prism_crown'
      : mentionsChalicePitcher
      ? 'carnivorous_nepenthes_pitchers'
      : stemStructure === 'multi_stalk_umbel_colony'
      ? 'custom_fungi_cap'
      : stemStructure === 'spiral_volute_vine'
      ? 'stem_hugging_leaves'
      : stemStructure === 'thorny_horn_crown'
      ? 'thorn_spur_clusters'
      : stemStructure === 'sympodial_tree' || stemStructure === 'weeping_willow'
      ? 'custom_leaf_lamina'
      : 'cloud_bonsai_pads'
  );

  // Only apply semantic fallback repairs if the AI omitted/failed a valid enum
  if (!hasValidCanopy) {
    if (mentionsMossyDeadwoodTrunk) {
      if (!hasValidStem) stemStructure = 'serpentine_mossy_deadwood';
      canopyElement = 'moss_velvet_mantle';
    } else if (mentionsBubbleUmbel) {
      canopyElement = 'spherical_bubble_umbel';
      if (!hasValidStem) stemStructure = 'herbaceous_curved_stalk';
    }
  }

  const synthesizedHeadTopology = pickEnum<string>(
    ce.synthesizedHeadTopology,
    VALID_SYNTH_HEAD_TOPOLOGIES,
    canopyElement === 'moss_velvet_mantle'
      ? 'none'
      : canopyElement === 'spherical_bubble_umbel'
      ? 'spherical_umbel_rays'
      : canopyElement === 'radiating_floret_head'
      ? 'layered_petal_starburst'
      : canopyElement === 'hanging_bell_cluster'
      ? 'hanging_bell_raceme'
      : canopyElement === 'crystal_prism_crown'
      ? 'crystal_spire_cluster'
      : canopyElement === 'procedural_lathe_head'
      ? 'revolved_lathe_chalice'
      : canopyElement === 'custom_spline_leaf_crown'
      ? 'spline_petal_corona'
      : 'none'
  );

  const synthesizedTipPrimitive = pickEnum<string>(
    ce.synthesizedTipPrimitive,
    VALID_SYNTH_TIP_PRIMITIVES,
    canopyElement === 'moss_velvet_mantle'
      ? 'bryophyte_moss_pad'
      : canopyElement === 'spherical_bubble_umbel'
      ? 'iridescent_bubble'
      : canopyElement === 'scifi_biolum_plasma_globes' || canopyElement === 'scifi_voronoi_ova_balloons'
      ? 'scifi_plasma_orb'
      : canopyElement === 'dehiscent_seed_pods_coronas'
      ? 'crowned_pomegranate_pod'
      : canopyElement === 'hanging_bell_cluster'
      ? 'cupped_bell_calyx'
      : canopyElement === 'crystal_prism_crown'
      ? 'faceted_crystal_gem'
      : canopyElement === 'radiating_floret_head'
      ? 'micro_floret_star'
      : 'none'
  );

  const synthesizedBasalFoliage = pickEnum<string>(
    ce.synthesizedBasalFoliage,
    VALID_SYNTH_BASAL_FOLIAGE,
    canopyElement === 'moss_velvet_mantle'
      ? 'none'
      : stemStructure === 'herbaceous_curved_stalk' || canopyElement === 'spherical_bubble_umbel'
      ? 'long_grass_blades'
      : stemStructure === 'multi_stalk_umbel_colony'
      ? 'baby_umbel_sprouts'
      : 'none'
  );

  const surfaceElement = pickEnum<string>(
    ce.surfaceElement,
    VALID_SURFACE_ELEMENTS,
    canopyElement === 'moss_velvet_mantle'
      ? 'moss_lichen_bark'
      : stemStructure === 'strangler_root_cage'
      ? 'strangler_root_web'
      : stemStructure === 'scifi_tendril_cradle'
      ? 'biolum_nodule_pustules'
      : stemStructure === 'herbaceous_curved_stalk' || stemStructure === 'multi_stalk_umbel_colony'
      ? 'smooth_striated'
      : stemStructure === 'spiral_volute_vine'
      ? 'braided_vines'
      : stemStructure === 'thorny_horn_crown'
      ? 'curved_thorns_spines'
      : 'moss_lichen_bark'
  );

  const hangingElement = pickEnum<string>(
    ce.hangingElement,
    VALID_HANGING_ELEMENTS,
    canopyElement === 'moss_velvet_mantle'
      ? 'mycelial_fuzz'
      : canopyElement === 'spherical_bubble_umbel'
      ? 'none'
      : stemStructure === 'strangler_root_cage'
      ? 'aerial_root_curtains'
      : stemStructure === 'scifi_tendril_cradle'
      ? 'tethered_scifi_lantern_globes'
      : stemStructure === 'multi_stalk_umbel_colony'
      ? 'weeping_filaments'
      : stemStructure === 'spiral_volute_vine'
      ? 'curling_tendrils'
      : stemStructure === 'gnarled_bonsai' || stemStructure === 'weeping_willow'
      ? 'weeping_filaments'
      : 'none'
  );

  const rawLatheRadii = Array.isArray(ce.latheProfileRadii)
    ? ce.latheProfileRadii.map((n: any) => clamp(Number(n), 0.08, 1.35, 0.5)).slice(0, 8)
    : [0.16, 0.68, 0.88, 0.56, 0.78, 0.92];

  const rawPetalContour = Array.isArray(ce.petalContourProfile)
    ? ce.petalContourProfile.map((n: any) => clamp(Number(n), 0.02, 1.45, 0.5)).slice(0, 8)
    : [0.14, 0.62, 0.98, 0.72, 0.94, 0.42, 0.08];

  const defaultNewPartsReport =
    canopyElement === 'moss_velvet_mantle'
      ? 'Síntesis 3D de nuevas partes: 1) Tronco de madera envejecida en doble curva S serpentina con fibras helicoidales, 2) Muñones leñosos apicales y laterales desgastados sin hojas planas, 3) Manto de cojines y micro-filamentos de musgo briófito verde adheridos a las crestas de la corteza.'
      : canopyElement === 'spherical_bubble_umbel'
      ? 'Síntesis 3D de nuevas partes: 1) Tallo herbáceo verde estriado en curva S, 2) Hojas basales largas acanaladas + hojas caulinares abrazadoras, 3) Umbela esférica 3D de filamentos radiales con burbujas vítreas iridiscentes multicolor y micro-gotas de rocío.'
      : canopyElement === 'scifi_biolum_plasma_globes' || canopyElement === 'scifi_voronoi_ova_balloons'
      ? 'Síntesis 3D de nuevas partes: Cáliz biomecánico de tentáculos sosteniendo globos de plasma bioluminiscentes con anillos orbitales y faroles colgantes.'
      : canopyElement === 'radiating_floret_head'
      ? 'Síntesis 3D de nuevas partes: Cabezuela floral compuesta con disco central abombado de micro-flósculos y doble corona de pétalos radiales.'
      : canopyElement === 'hanging_bell_cluster'
      ? 'Síntesis 3D de nuevas partes: Racimo péndulo de cálices acampanados 3D con pistilos luminiscentes internos.'
      : canopyElement === 'crystal_prism_crown'
      ? 'Síntesis 3D de nuevas partes: Corona geoda de prismas hexagonales biselados con refracción iridiscente.'
      : canopyElement === 'procedural_lathe_head'
      ? 'Síntesis 3D de nuevas partes: Cáliz/urna esculpido por revolución a medida con estambres emergentes.'
      : canopyElement === 'custom_spline_leaf_crown'
      ? 'Síntesis 3D de nuevas partes: Corona/hojas de contorno libre esculpidas por curva Spline 3D con acopamiento, torsión y ondulado marginal.'
      : 'Combinación anatómica 3D soldada de tronco, corteza, copa modular y elementos colgantes.';

  const customElement = {
    id: `elem_ai_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    name:
      typeof ce.name === 'string' && ce.name.trim()
        ? ce.name.trim().slice(0, 75)
        : typeof raw?.identifiedName === 'string' && raw.identifiedName.trim()
        ? `Elemento: ${raw.identifiedName.trim().slice(0, 55)}`
        : 'Elemento Sintetizado IA',
    scientificName:
      typeof raw?.scientificName === 'string' && raw.scientificName.trim()
        ? raw.scientificName.trim().slice(0, 75)
        : 'Botanica composita sp.',
    description:
      typeof raw?.reasoningSummary === 'string' && raw.reasoningSummary.trim()
        ? raw.reasoningSummary.trim().slice(0, 220)
        : defaultNewPartsReport,
    createdAt: Date.now(),
    stemStructure,
    canopyElement,
    surfaceElement,
    hangingElement,
    synthesizedHeadTopology,
    synthesizedTipPrimitive,
    synthesizedBasalFoliage,
    umbelRayCount: Math.round(
      clamp(
        ce.umbelRayCount,
        16,
        110,
        canopyElement === 'spherical_bubble_umbel' ? 74 : 36
      )
    ),
    umbelSphereRatio: clamp(
      ce.umbelSphereRatio,
      0.35,
      1.0,
      canopyElement === 'spherical_bubble_umbel' ? 0.88 : 0.65
    ),
    tipBubbleScale: clamp(
      ce.tipBubbleScale,
      0.35,
      2.2,
      canopyElement === 'spherical_bubble_umbel' ? 1.08 : 1.0
    ),
    basalLeafCount: Math.round(
      clamp(
        ce.basalLeafCount,
        0,
        30,
        synthesizedBasalFoliage === 'long_grass_blades' ? 18 : 12
      )
    ),
    basalLeafLength: clamp(ce.basalLeafLength, 0.35, 2.0, 1.05),
    iridescentShift: clamp(
      ce.iridescentShift,
      0.0,
      1.0,
      canopyElement === 'spherical_bubble_umbel' || combinedAiText.includes('iridisc')
        ? 0.92
        : vf.iridescentScore || 0.25
    ),
    latheProfileRadii: rawLatheRadii.length >= 4 ? rawLatheRadii : [0.16, 0.68, 0.88, 0.56, 0.78, 0.92],
    petalContourProfile:
      rawPetalContour.length >= 4 ? rawPetalContour : [0.14, 0.62, 0.98, 0.72, 0.94, 0.42, 0.08],
    petalCupping: clamp(ce.petalCupping, -0.65, 0.95, 0.38),
    petalTwistDeg: clamp(ce.petalTwistDeg, 0, 95, 14),
    petalMarginWave: clamp(ce.petalMarginWave, 0, 0.5, 0.16),
    aiNewPartsReport:
      typeof ce.aiNewPartsReport === 'string' && ce.aiNewPartsReport.trim()
        ? ce.aiNewPartsReport.trim().slice(0, 280)
        : defaultNewPartsReport,
    lobeCount: Math.round(clamp(ce.lobeCount, 1, 14, 7)),
    cupDepth: clamp(ce.cupDepth, 0, 1, canopyElement === 'custom_flower_corolla' ? 0.65 : 0.45),
    spiralTurns: clamp(ce.spiralTurns, 0.5, 3.0, 1.35),
    spiralArms: Math.round(
      clamp(
        ce.spiralArms,
        1,
        14,
        stemStructure === 'herbaceous_curved_stalk' ||
          (canopyElement === 'custom_flower_corolla' && stemStructure === 'gnarled_bonsai')
          ? 1
          : stemStructure === 'multi_stalk_umbel_colony'
          ? 8
          : stemStructure === 'thorny_horn_crown'
          ? 8
          : 4
      )
    ),
    thornDensity: clamp(
      ce.thornDensity,
      0,
      1,
      surfaceElement === 'curved_thorns_spines' ? 0.85 : 0.0
    ),
    thornLength: clamp(ce.thornLength, 0.2, 2.2, 1.0),
    filamentCount: Math.round(clamp(ce.filamentCount, 0, 48, 22)),
    filamentLength: clamp(ce.filamentLength, 0.2, 2.5, 1.15),
    padLayers: Math.round(
      clamp(
        ce.padLayers,
        1,
        12,
        canopyElement === 'custom_flower_corolla' || canopyElement === 'spherical_bubble_umbel'
          ? 1
          : 6
      )
    ),
    stemCount: Math.round(
      clamp(
        ce.stemCount,
        1,
        14,
        stemStructure === 'herbaceous_curved_stalk'
          ? 1
          : stemStructure === 'multi_stalk_umbel_colony'
          ? 8
          : 5
      )
    ),
    trunkBentS: clamp(ce.trunkBentS, 0.05, 1.0, vf.trunkSCurve || 0.38),
    branchSpread: clamp(ce.branchSpread, 0.2, 1.3, vf.upperWidthRatio || 0.65),
    branchDroop: clamp(
      ce.branchDroop,
      -0.4,
      1.0,
      stemStructure === 'weeping_willow' ? 0.55 : 0.15
    ),
    capDomeHeight: clamp(ce.capDomeHeight, 0.25, 1.1, 0.58),
    capSpotDensity: clamp(
      ce.capSpotDensity,
      0.0,
      1.0,
      canopyElement === 'custom_fungi_cap' ? 0.82 : 0.0
    ),
    gillCount: Math.round(clamp(ce.gillCount, 8, 40, 24)),
    petalOpenness: clamp(
      ce.petalOpenness,
      0.0,
      1.0,
      canopyElement === 'custom_flower_corolla' ? 0.35 : 0.78
    ),
    leafSerration: clamp(ce.leafSerration, 0.0, 1.0, 0.38),
  };

  let engine = pickEnum<string>(p.engine, VALID_ENGINES, 'composed_custom');
  if (engine === 'alien_xenobotany' || engine === 'sympodial' || engine === 'weeping') {
    engine = 'composed_custom';
  }

  let tonalMode = pickEnum<string>(
    p.tonalMode,
    VALID_TONAL_MODES,
    canopyElement === 'spherical_bubble_umbel' ? 'iridescent_chitin' : 'natural_botanical'
  );
  if (tonalMode === 'cel_concept_art' || tonalMode === 'spectral_thermal') {
    tonalMode = 'natural_botanical';
  }

  let colorTrunk = sanitizeHex(
    p.colorTrunk,
    vf.colorTrunk || (stemStructure === 'herbaceous_curved_stalk' ? '#2e6f21' : '#523a28')
  );
  let colorLeafMain = sanitizeHex(p.colorLeafMain, vf.colorLeafMain || '#f97316');
  let colorLeafTip = sanitizeHex(p.colorLeafTip, vf.colorLeafTip || '#f472b6');
  let colorFlower = sanitizeHex(p.colorFlower, vf.colorFlower || '#ec4899');
  let colorAccent = sanitizeHex(p.colorAccent, vf.colorAccent || '#38bdf8');

  // Protect spherical bubble umbels / iridescent flowers from washed-out beige colors!
  if (canopyElement === 'spherical_bubble_umbel') {
    if (isDesaturatedOrBeigeHex(colorTrunk)) {
      colorTrunk = '#2e6f21';
    }
    if (isDesaturatedOrBeigeHex(colorLeafMain)) {
      colorLeafMain = '#f97316'; // Warm Coral Orange
    }
    if (isDesaturatedOrBeigeHex(colorLeafTip)) {
      colorLeafTip = '#f472b6'; // Iridescent Rose Pink
    }
    if (isDesaturatedOrBeigeHex(colorFlower)) {
      colorFlower = '#fb7185'; // Luminous Coral Rose
    }
    if (isDesaturatedOrBeigeHex(colorAccent)) {
      colorAccent = '#38bdf8'; // Prismatic Cyan Blue
    }
  }

  if (canopyElement === 'moss_velvet_mantle') {
    if (isDesaturatedOrBeigeHex(colorTrunk)) colorTrunk = '#583e2a';
    if (isDesaturatedOrBeigeHex(colorLeafMain)) colorLeafMain = '#4a7c1d';
    if (isDesaturatedOrBeigeHex(colorLeafTip)) colorLeafTip = '#7cb524';
    if (isDesaturatedOrBeigeHex(colorFlower)) colorFlower = '#5c8f22';
    if (isDesaturatedOrBeigeHex(colorAccent)) colorAccent = '#8ec435';
  }

  const cleanParams = {
    engine,
    cactusSubType: pickEnum(p.cactusSubType, VALID_CACTUS_SUBTYPES, 'saguaro'),
    alienArchetype: pickEnum(p.alienArchetype, VALID_ALIEN_ARCHETYPES, 'spiky_mace_sentinel'),
    mossFungiArchetype: pickEnum(
      p.mossFungiArchetype,
      VALID_MOSS_ARCHETYPES,
      'chanterelle_golden_moss'
    ),
    aquaticArchetype: pickEnum(p.aquaticArchetype, VALID_AQUATIC_ARCHETYPES, 'staghorn_acropora'),
    crownShape: pickEnum(p.crownShape, VALID_CROWN_SHAPES, 'spherical'),
    foliageType:
      engine === 'composed_custom'
        ? 'ai_custom_element'
        : pickEnum(p.foliageType, VALID_FOLIAGE_TYPES, 'ai_custom_element'),
    barkType: pickEnum(
      p.barkType,
      VALID_BARK_TYPES,
      canopyElement === 'moss_velvet_mantle' || stemStructure === 'serpentine_mossy_deadwood'
        ? 'mossy_deadwood'
        : stemStructure === 'strangler_root_cage' || surfaceElement === 'strangler_root_web'
        ? 'strangler_vine_lattice'
        : stemStructure === 'scifi_tendril_cradle' || surfaceElement === 'biolum_nodule_pustules'
        ? 'scifi_biolum_veins'
        : stemStructure === 'herbaceous_curved_stalk'
        ? 'smooth_ash'
        : surfaceElement === 'braided_vines'
        ? 'fibrous_redwood'
        : 'fissured'
    ),
    tonalMode,
    height: clamp(p.height, 1.5, 12.0, 4.8),
    radius: clamp(p.radius, 0.14, 0.95, 0.32),
    trunkClearHeight: clamp(p.trunkClearHeight, 0.05, 0.72, 0.24),
    crownWidthRatio: clamp(p.crownWidthRatio, 0.22, 0.88, 0.56),
    taper: clamp(p.taper, 0.48, 0.92, 0.72),
    flare: clamp(p.flare, 0.15, 1.2, 0.48),
    levels: Math.round(clamp(p.levels, 2, 5, 4)),
    branchCount: Math.round(clamp(p.branchCount, 2, 8, 4)),
    angle: clamp(p.angle, 18, 82, 42),
    decay: clamp(p.decay, 0.5, 0.9, 0.76),
    noise: clamp(p.noise, 0.05, 0.75, 0.28),
    gravity: clamp(p.gravity, -0.6, 0.5, -0.08),
    apicalDominance: clamp(p.apicalDominance, 0.15, 0.9, 0.48),
    gnarl: clamp(p.gnarl, 0.1, 0.85, 0.45),
    trunkSplitHeight: clamp(p.trunkSplitHeight, 0.12, 0.75, 0.28),
    pruneRatio: clamp(p.pruneRatio, 0.0, 0.55, 0.12),
    leafScale: clamp(p.leafScale, 0.55, 2.2, 1.22),
    leafDensity: Math.round(clamp(p.leafDensity, 2, 7, 5)),
    leafWidthRatio: clamp(p.leafWidthRatio, 0.25, 1.1, 0.65),
    leafBend: clamp(p.leafBend, 0.05, 0.85, 0.32),
    needleLength: clamp(p.needleLength, 0.4, 2.0, 1.0),
    fascicleCount: Math.round(clamp(p.fascicleCount, 2, 10, 3)),
    whorlBranches: Math.round(clamp(p.whorlBranches, 3, 8, 5)),
    pineConeDensity: clamp(p.pineConeDensity, 0.0, 1.0, 0.25),
    cactusRibs: Math.round(clamp(p.cactusRibs, 6, 22, 12)),
    armCount: Math.round(clamp(p.armCount, 0, 10, 4)),
    spinesPerAreole: Math.round(clamp(p.spinesPerAreole, 0, 12, 6)),
    showRoots: typeof p.showRoots === 'boolean' ? p.showRoots : true,
    rootCount: Math.round(clamp(p.rootCount, 3, 12, 6)),
    rootLength: clamp(p.rootLength, 0.5, 2.5, 1.2),
    rootThickness: clamp(p.rootThickness, 0.5, 1.8, 1.0),
    rootArch: clamp(p.rootArch, 0.15, 1.4, 0.35),
    rockScale: clamp(p.rockScale, 0.6, 1.6, 1.05),
    mossCoverage: clamp(p.mossCoverage, 0.2, 1.0, 0.78),
    colorTrunk,
    colorLeafMain,
    colorLeafTip,
    colorFlower,
    colorAccent,
    emissiveIntensity: clamp(
      p.emissiveIntensity,
      0.0,
      1.6,
      canopyElement === 'spherical_bubble_umbel' || canopyElement === 'custom_fungi_cap'
        ? 0.45
        : 0.16
    ),
    iridescenceAmount: clamp(
      p.iridescenceAmount,
      0.0,
      1.0,
      canopyElement === 'spherical_bubble_umbel' ? 0.88 : customElement.iridescentShift || 0.2
    ),
    wetnessGloss: clamp(
      p.wetnessGloss,
      0.0,
      1.0,
      canopyElement === 'spherical_bubble_umbel' ? 0.85 : canopyElement === 'custom_fungi_cap' ? 0.55 : 0.25
    ),
    customElement,
  };

  return {
    identifiedName:
      typeof raw?.identifiedName === 'string' && raw.identifiedName.trim()
        ? raw.identifiedName.trim().slice(0, 80)
        : 'Espécimen Modular IA',
    scientificName:
      typeof raw?.scientificName === 'string' && raw.scientificName.trim()
        ? raw.scientificName.trim().slice(0, 80)
        : 'Botanica composita sp.',
    reasoningSummary:
      typeof raw?.reasoningSummary === 'string' && raw.reasoningSummary.trim()
        ? raw.reasoningSummary.trim().slice(0, 320)
        : defaultNewPartsReport,
    recommendedBase: pickEnum(raw?.recommendedBase, VALID_ECOSYSTEM_BASES, 'mossy_forest_floor'),
    recommendedBg: pickEnum(raw?.recommendedBg, VALID_BG_IDS, 'dark_studio'),
    customElement,
    params: cleanParams,
  };
}

function buildVisionFallbackPayload(visionFeatures: any, userNotes?: string) {
  const vf = visionFeatures || {};
  const notes = (userNotes || '').toLowerCase();
  const archetype = vf.detectedArchetype || '';

  // ───────────────────────────────────────────────────────────────────────────
  // QUICK SEMANTIC MATCHING FROM USER NOTES (Full 25 Canopies & 18 Stems Library)
  // ───────────────────────────────────────────────────────────────────────────
  const buildFromSpec = (spec: {
    name: string;
    sci: string;
    summary: string;
    base: string;
    bg: string;
    stem: string;
    canopy: string;
    surface: string;
    hanging: string;
    bark: string;
    tonal: string;
    tip?: string;
    basal?: string;
    headTopo?: string;
    latheProfileRadii?: number[];
    petalContourProfile?: number[];
    stemCount?: number;
    lobeCount?: number;
    petalOpenness?: number;
    leafScale?: number;
    h?: number;
    r?: number;
    colTrunk?: string;
    colMain?: string;
    colTip?: string;
    colFlower?: string;
    colAccent?: string;
  }) =>
    sanitizeAiPayload(
      {
        identifiedName: spec.name,
        scientificName: spec.sci,
        reasoningSummary: spec.summary,
        recommendedBase: spec.base,
        recommendedBg: spec.bg,
        customElement: {
          name: spec.name,
          stemStructure: spec.stem,
          canopyElement: spec.canopy,
          surfaceElement: spec.surface,
          hangingElement: spec.hanging,
          synthesizedHeadTopology: spec.headTopo || 'none',
          synthesizedTipPrimitive: spec.tip || 'none',
          synthesizedBasalFoliage: spec.basal || 'none',
          latheProfileRadii: spec.latheProfileRadii,
          petalContourProfile: spec.petalContourProfile,
          trunkBentS: clamp(vf.trunkSCurve, 0.12, 0.72, 0.30),
          branchSpread: clamp(vf.upperWidthRatio, 0.35, 1.0, 0.65),
          stemCount:
            spec.stemCount ??
            (spec.stem === 'herbaceous_curved_stalk' || spec.stem === 'baobab_pachycaul_bottle'
              ? 1
              : 5),
          lobeCount: spec.lobeCount ?? 7,
          petalOpenness: spec.petalOpenness ?? 0.45,
        },
        params: {
          engine: 'composed_custom',
          foliageType: 'ai_custom_element',
          barkType: spec.bark,
          tonalMode: spec.tonal,
          height: spec.h || 4.4,
          radius: spec.r || 0.28,
          gnarl: 0.36,
          leafScale: spec.leafScale ?? 1.25,
          leafDensity: 5,
          showRoots: true,
          colorTrunk: spec.colTrunk || vf.colorTrunk || '#3b5d2a',
          colorLeafMain: spec.colMain || vf.colorLeafMain || '#3f7d20',
          colorLeafTip: spec.colTip || vf.colorLeafTip || '#84cc16',
          colorFlower: spec.colFlower || vf.colorFlower || '#f472b6',
          colorAccent: spec.colAccent || vf.colorAccent || '#38bdf8',
        },
      },
      vf
    );

  if (notes.includes('sci-fi') || notes.includes('scifi') || notes.includes('plasma') || notes.includes('alien') || notes.includes('voronoi')) {
    const isVoronoi = notes.includes('voronoi') || notes.includes('aerostato');
    return buildFromSpec({
      name: isVoronoi ? 'Aerostato Celular Voronoi' : 'Cuna Xenobotánica de Plasma',
      sci: isVoronoi ? 'Xenopneumis reticulata' : 'Plasmaphyta bioluminescens',
      summary: 'Estructura sci-fi de tentáculos biomecánicos sosteniendo globos bioluminiscentes con nódulos de savia y faroles suspendidos.',
      base: 'exoplanetary_crater',
      bg: 'abyss_biolum',
      stem: 'scifi_tendril_cradle',
      canopy: isVoronoi ? 'scifi_voronoi_ova_balloons' : 'scifi_biolum_plasma_globes',
      surface: 'biolum_nodule_pustules',
      hanging: 'tethered_scifi_lantern_globes',
      bark: 'scifi_biolum_veins',
      tonal: 'bioluminescent_abyss',
      tip: 'scifi_plasma_orb',
      colTrunk: vf.colorTrunk || '#1e1b4b',
      colMain: vf.colorLeafMain || '#06b6d4',
      colTip: vf.colorLeafTip || '#a855f7',
      colFlower: vf.colorFlower || '#22d3ee',
      colAccent: vf.colorAccent || '#f472b6',
    });
  }
  if (notes.includes('monstera') || notes.includes('filodendro')) {
    return buildFromSpec({
      name: 'Monstera Tropical Fenestrada',
      sci: 'Monstera fenestrata',
      summary: 'Hojas tropicales fenestradas de gran porte sobre raíces aéreas y rizoma.',
      base: 'mossy_forest_floor',
      bg: 'dark_studio',
      stem: 'creeping_rhizome_runners',
      canopy: 'fenestrated_monstera_leaves',
      surface: 'strangler_root_web',
      hanging: 'aerial_root_curtains',
      bark: 'strangler_vine_lattice',
      tonal: 'natural_botanical',
      basal: 'broad_rosette_leaves',
    });
  }
  if (notes.includes('arce') || notes.includes('maple')) {
    return buildFromSpec({
      name: 'Arce Palmeado Estrellado',
      sci: 'Acer palmatum sp.',
      summary: 'Árbol simpodial de hojas palmeadas de 5–7 lóbulos con racimos de sámaras aladas.',
      base: 'temperate_forest',
      bg: 'dark_studio',
      stem: 'sympodial_tree',
      canopy: 'palmate_maple_star_leaves',
      surface: 'moss_lichen_bark',
      hanging: 'winged_samara_seeds',
      bark: 'fissured',
      tonal: 'natural_botanical',
      tip: 'winged_helicoid_seed',
    });
  }
  if (notes.includes('helecho') || notes.includes('palmera') || notes.includes('fern') || notes.includes('palm')) {
    return buildFromSpec({
      name: 'Helecho / Palmera de Frondes Pinnadas',
      sci: 'Cyathea pinnata',
      summary: 'Frondes pinnadas arqueadas con foliolos desplegados desde brotes en báculo.',
      base: 'mossy_forest_floor',
      bg: 'dark_studio',
      stem: 'dichotomous_dragon_tree',
      canopy: 'pinnate_fern_palm_fronds',
      surface: 'armored_dragon_scales',
      hanging: 'none',
      bark: 'palm_rings',
      tonal: 'natural_botanical',
      basal: 'fern_fiddleheads',
    });
  }
  if (notes.includes('pino') || notes.includes('conífer') || notes.includes('conifer') || notes.includes('cedro')) {
    return buildFromSpec({
      name: 'Conífera de Acículas y Piñas',
      sci: 'Pinus sylvestris var.',
      summary: 'Ramas con escobillas densas de acículas y piñas leñosas dehiscentes.',
      base: 'alpine_granite',
      bg: 'dark_studio',
      stem: 'gnarled_bonsai',
      canopy: 'conifer_needle_brushes',
      surface: 'moss_lichen_bark',
      hanging: 'hanging_pods_berries',
      bark: 'pine_plates',
      tonal: 'natural_botanical',
    });
  }
  if (notes.includes('loto') || notes.includes('magnolia') || notes.includes('pasiflora')) {
    const isPasiflora = notes.includes('pasiflora');
    return buildFromSpec({
      name: isPasiflora ? 'Pasiflora de Corona Radial' : 'Loto / Magnolia Imperial',
      sci: isPasiflora ? 'Passiflora filamentosa' : 'Nelumbo imperialis',
      summary: 'Corola floral multicapa con pétalos cóncavos y corona radial de filamentos.',
      base: 'mossy_forest_floor',
      bg: 'dark_studio',
      stem: 'herbaceous_curved_stalk',
      canopy: isPasiflora ? 'passionflower_filament_corona' : 'lotus_magnolia_corolla_crown',
      surface: 'smooth_striated',
      hanging: 'curling_tendrils',
      bark: 'smooth_ash',
      tonal: 'natural_botanical',
      basal: 'broad_rosette_leaves',
    });
  }
  if (notes.includes('titan') || notes.includes('titán') || notes.includes('arum') || notes.includes('aro') || notes.includes('espata') || notes.includes('espadice')) {
    return buildFromSpec({
      name: 'Aro Titán / Espata Gigante con Espádice',
      sci: 'Amorphophallus titanum',
      summary: 'Espata acanalada con volantes alrededor de un gran espádice central vertical.',
      base: 'mossy_forest_floor',
      bg: 'dark_studio',
      stem: 'herbaceous_curved_stalk',
      canopy: 'giant_arum_spathe_spadix',
      surface: 'fluted_grooves',
      hanging: 'none',
      bark: 'smooth_ash',
      tonal: 'veined_vascular_rib',
      basal: 'broad_rosette_leaves',
      petalOpenness: 0.72,
    });
  }
  if (notes.includes('orquid') || notes.includes('orchid') || notes.includes('motead')) {
    return buildFromSpec({
      name: 'Orquídea Moteada de Labelo',
      sci: 'Phalaenopsis maculata',
      summary: 'Pétalos radiales y labelo trilobulado con patrón moteado celular orgánico.',
      base: 'mossy_forest_floor',
      bg: 'dark_studio',
      stem: 'herbaceous_curved_stalk',
      canopy: 'spotted_orchid_labellum_corolla',
      surface: 'smooth_striated',
      hanging: 'curling_tendrils',
      bark: 'smooth_ash',
      tonal: 'spotted_orchid_mottled',
      basal: 'broad_rosette_leaves',
      petalOpenness: 0.78,
    });
  }
  if (notes.includes('venus') || notes.includes('atrapamoscas') || notes.includes('trampa') || notes.includes('mandib')) {
    return buildFromSpec({
      name: 'Trampa Dentada Carnívora',
      sci: 'Dionaea muscipula var.',
      summary: 'Mandíbulas bilobuladas dentadas con nervaduras vasculares carmesí.',
      base: 'mossy_forest_floor',
      bg: 'daylight_arch',
      stem: 'herbaceous_curved_stalk',
      canopy: 'toothed_venus_jaw_trap',
      surface: 'thorny_spines',
      hanging: 'none',
      bark: 'smooth_ash',
      tonal: 'veined_vascular_rib',
      tip: 'recurved_thorn_claw',
      basal: 'broad_rosette_leaves',
      petalOpenness: 0.75,
    });
  }
  if (notes.includes('anemona') || notes.includes('anémona') || notes.includes('aseroe') || notes.includes('tentac') || notes.includes('tentác')) {
    return buildFromSpec({
      name: 'Anémona / Hongo Estrella de Tentáculos',
      sci: 'Aseroe rubra var.',
      summary: 'Cráter central oscuro rodeado de tentáculos radiales carnosos con ventosas.',
      base: 'mossy_forest_floor',
      bg: 'dark_studio',
      stem: 'herbaceous_curved_stalk',
      canopy: 'crater_tentacle_anemone',
      surface: 'biolum_nodule_pustules',
      hanging: 'curling_tendrils',
      bark: 'smooth_ash',
      tonal: 'velvet_spore_dust',
      tip: 'sucker_tentacle_cup',
      petalOpenness: 0.85,
    });
  }
  if (notes.includes('urna') || notes.includes('overflower') || notes.includes('perforad')) {
    return buildFromSpec({
      name: 'Urna Floral Perforada / Overflower',
      sci: 'Sarracenia perforata',
      summary: 'Urna bulbosa perforada en tonos cálidos sobre raíces retorcidas.',
      base: 'mossy_forest_floor',
      bg: 'daylight_arch',
      stem: 'stilt_root_mangrove',
      canopy: 'perforated_blossom_urn',
      surface: 'fluted_grooves',
      hanging: 'none',
      bark: 'armored_scale_bark',
      tonal: 'veined_vascular_rib',
      petalOpenness: 0.55,
    });
  }
  if (notes.includes('bruja') || notes.includes('sombrero') || notes.includes('witch')) {
    return buildFromSpec({
      name: 'Seta de Sombrero Curvo Moteado',
      sci: 'Mycena uncinata',
      summary: 'Sombrero cónico curvo en espiral con verrugas aterciopeladas y borde micelial.',
      base: 'mossy_forest_floor',
      bg: 'dark_studio',
      stem: 'herbaceous_curved_stalk',
      canopy: 'curled_witchhat_mushroom_cap',
      surface: 'biolum_nodule_pustules',
      hanging: 'mycelial_fuzz',
      bark: 'scifi_biolum_veins',
      tonal: 'freckled_polka_spots',
      tip: 'spotted_spore_dome',
    });
  }
  if (notes.includes('carnívora') || notes.includes('carnivora') || notes.includes('jarra') || notes.includes('nepenthes')) {
    return buildFromSpec({
      name: 'Nepenthes de Jarras Carnívoras',
      sci: 'Nepenthes ascidia',
      summary: 'Liana trepadora con odres y jarras carnívoras colgantes de peristoma acanalado.',
      base: 'mossy_forest_floor',
      bg: 'dark_studio',
      stem: 'spiral_volute_vine',
      canopy: 'carnivorous_nepenthes_pitchers',
      surface: 'braided_vines',
      hanging: 'curling_tendrils',
      bark: 'strangler_vine_lattice',
      tonal: 'natural_botanical',
    });
  }
  if (notes.includes('baobab') || notes.includes('botella')) {
    return buildFromSpec({
      name: 'Baobab Paquicaule',
      sci: 'Adansonia pachycaulis',
      summary: 'Tronco botella abombado de corteza nudosa con copa abierta y cápsulas.',
      base: 'desert_dunes',
      bg: 'daylight_arch',
      stem: 'baobab_pachycaul_bottle',
      canopy: 'custom_leaf_lamina',
      surface: 'moss_lichen_bark',
      hanging: 'hanging_pods_berries',
      bark: 'gnarled_olive_burl',
      tonal: 'natural_botanical',
      h: 5.8,
      r: 0.55,
    });
  }
  if (notes.includes('mangle') || notes.includes('manglar') || notes.includes('estrangul') || notes.includes('banyan') || notes.includes('ficus')) {
    const isMangrove = notes.includes('mangle') || notes.includes('manglar');
    return buildFromSpec({
      name: isMangrove ? 'Manglar de Raíces Zanco' : 'Higuera Estranguladora Banyan',
      sci: isMangrove ? 'Rhizophora mangle' : 'Ficus benghalensis',
      summary: 'Estructura arbórea sostenida por arcos de raíces aéreas y cortinas descendentes.',
      base: 'aquatic_reef_seabed',
      bg: 'coastal_sky',
      stem: isMangrove ? 'mangrove_stilt_arch' : 'strangler_root_cage',
      canopy: 'custom_leaf_lamina',
      surface: 'strangler_root_web',
      hanging: 'aerial_root_curtains',
      bark: 'strangler_vine_lattice',
      tonal: 'natural_botanical',
    });
  }
  if (notes.includes('bambú') || notes.includes('bambu') || notes.includes('caña')) {
    return buildFromSpec({
      name: 'Bambú Articulado de Nudos',
      sci: 'Bambusa nodosa',
      summary: 'Cañas segmentadas con anillos nodales y penachos de hojas lanceoladas.',
      base: 'temperate_forest',
      bg: 'daylight_arch',
      stem: 'segmented_bamboo_equisetum',
      canopy: 'stem_hugging_leaves',
      surface: 'smooth_striated',
      hanging: 'none',
      bark: 'bamboo_culm',
      tonal: 'natural_botanical',
    });
  }
  if (notes.includes('cristal') || notes.includes('cuarzo') || notes.includes('gema')) {
    return buildFromSpec({
      name: 'Corona Cristalina Mineral',
      sci: 'Crystallophyta prismatica',
      summary: 'Cúspide de prismas hexagonales translúcidos sobre tallo mineralizado.',
      base: 'exoplanetary_crater',
      bg: 'dark_studio',
      stem: 'dichotomous_dragon_tree',
      canopy: 'crystal_prism_crown',
      surface: 'armored_dragon_scales',
      hanging: 'none',
      bark: 'volcanic_magma_crust',
      tonal: 'iridescent_chitin',
      tip: 'faceted_crystal_gem',
      headTopo: 'crystal_spire_cluster',
    });
  }

  const isBubbleUmbelFlower =
    notes.includes('burbuja') ||
    notes.includes('bubble') ||
    notes.includes('iridisc') ||
    notes.includes('diente de le') ||
    notes.includes('allium') ||
    notes.includes('rocío') ||
    archetype === 'umbel_bubble_flower';

  // 0. FLOR DE BURBUJAS IRIDISCENTES / UMBELA ESFÉRICA SOBRE TALLO HERBÁCEO CON HOJAS BASALES
  if (isBubbleUmbelFlower) {
    return sanitizeAiPayload(
      {
        identifiedName: 'Flor de Burbujas Iridiscentes',
        scientificName: 'Sphaeranthus vitreus',
        reasoningSummary:
          'Umbela esférica 3D compuesta por decenas de filamentos radiales coronados por burbujas vítreas iridiscentes multicolor (coral, rosa, cian y oro) y gotas de rocío, sostenida por un tallo herbáceo verde arqueado con hojas basales largas acanaladas.',
        recommendedBase: 'mossy_forest_floor',
        recommendedBg: 'dark_studio',
        customElement: {
          name: 'Umbela Esférica de Burbujas Iridiscentes & Tallo Herbáceo',
          stemStructure: 'herbaceous_curved_stalk',
          canopyElement: 'spherical_bubble_umbel',
          surfaceElement: 'smooth_striated',
          hangingElement: 'none',
          synthesizedHeadTopology: 'spherical_umbel_rays',
          synthesizedTipPrimitive: 'iridescent_bubble',
          synthesizedBasalFoliage: 'long_grass_blades',
          umbelRayCount: 76,
          umbelSphereRatio: 0.9,
          tipBubbleScale: 1.12,
          basalLeafCount: 18,
          basalLeafLength: 1.1,
          iridescentShift: 0.95,
          aiNewPartsReport:
            'Creadas 3 partes nuevas 3D: 1) Tallo herbáceo verde estriado en curva S, 2) Roseta basal de 18 hojas largas acanaladas verdes + hojas caulinares, 3) Umbela esférica de 76 filamentos radiales con burbujas iridiscentes y micro-gotas de rocío.',
          spiralTurns: 1.15,
          spiralArms: 1,
          stemCount: 1,
          trunkBentS: clamp(vf.trunkSCurve, 0.25, 0.65, 0.42),
          branchSpread: 0.72,
          thornDensity: 0.0,
          thornLength: 0.5,
          filamentCount: 18,
          filamentLength: 1.0,
          padLayers: 1,
          lobeCount: 8,
          cupDepth: 0.45,
        },
        params: {
          engine: 'composed_custom',
          foliageType: 'ai_custom_element',
          tonalMode: 'iridescent_chitin',
          height: 4.8,
          radius: 0.3,
          gnarl: 0.44,
          leafScale: 1.28,
          leafDensity: 5,
          showRoots: true,
          emissiveIntensity: 0.48,
          iridescenceAmount: 0.92,
          wetnessGloss: 0.88,
          colorTrunk: '#2e6f21',
          colorLeafMain: '#f97316',
          colorLeafTip: '#f472b6',
          colorFlower: '#fb7185',
          colorAccent: '#38bdf8',
        },
      },
      vf
    );
  }

  const isMossyDeadwood =
    archetype === 'mossy_deadwood_trunk' ||
    ((notes.includes('tronco') || notes.includes('madera') || notes.includes('lignum')) &&
      (notes.includes('musgo') || notes.includes('retorcid')));

  if (isMossyDeadwood) {
    return sanitizeAiPayload(
      {
        identifiedName: 'Tronco Retorcido con Musgo',
        scientificName: 'Lignum contortum bryophyta',
        reasoningSummary:
          'Estructura leñosa envejecida en doble curva S serpentina con corteza fisurada marrón, muñones apicales secos y manto de almohadillas de musgo briófito verde sobre las crestas de la madera.',
        recommendedBase: 'mossy_forest_floor',
        recommendedBg: 'pure_white',
        customElement: {
          name: 'Tronco Serpenteante con Muñones & Manto de Musgo 3D',
          stemStructure: 'serpentine_mossy_deadwood',
          canopyElement: 'moss_velvet_mantle',
          surfaceElement: 'moss_lichen_bark',
          hangingElement: 'mycelial_fuzz',
          synthesizedHeadTopology: 'none',
          synthesizedTipPrimitive: 'bryophyte_moss_pad',
          synthesizedBasalFoliage: 'none',
          trunkBentS: 0.85,
          branchSpread: 0.65,
          aiNewPartsReport:
            'Síntesis 3D de nuevas partes: 1) Tronco de madera envejecida en doble curva S serpentina con fibras helicoidales, 2) Muñones leñosos apicales y laterales desgastados sin hojas planas, 3) Manto de cojines y micro-filamentos de musgo briófito verde adheridos a las crestas de la corteza.',
        },
        params: {
          engine: 'composed_custom',
          foliageType: 'ai_custom_element',
          barkType: 'mossy_deadwood',
          tonalMode: 'natural_botanical',
          height: 3.6,
          radius: 0.36,
          gnarl: 0.78,
          leafScale: 1.05,
          leafDensity: 5,
          showRoots: true,
          colorTrunk: '#583e2a',
          colorLeafMain: '#4a7c1d',
          colorLeafTip: '#7cb524',
          colorFlower: '#5c8f22',
          colorAccent: '#8ec435',
        },
      },
      vf
    );
  }

  // Diverse image-driven fallback when no explicit keyword/notes matched
  if (!notes) {
    const ar = typeof vf.aspectRatio === 'number' ? vf.aspectRatio : 1.1;
    const spiky = typeof vf.edgeSpikiness === 'number' ? vf.edgeSpikiness : 0.25;
    const topDens = typeof vf.topDensityRatio === 'number' ? vf.topDensityRatio : 0.55;
    const upW = typeof vf.upperWidthRatio === 'number' ? vf.upperWidthRatio : 0.55;
    const lowW = typeof vf.lowerWidthRatio === 'number' ? vf.lowerWidthRatio : 0.4;
    const apexW = typeof vf.apexWidthRatio === 'number' ? vf.apexWidthRatio : 0.65;
    const midBulge = typeof vf.midBulgeRatio === 'number' ? vf.midBulgeRatio : 1.0;
    const spotVar = typeof vf.capSpotVariance === 'number' ? vf.capSpotVariance : 0.15;
    const clusters = typeof vf.vividClusterCount === 'number' ? vf.vividClusterCount : 1;
    const capIsl = typeof vf.upperCapIslands === 'number' ? vf.upperCapIslands : 1.0;
    const stemIsl = typeof vf.midStemIslands === 'number' ? vf.midStemIslands : 1.2;
    const scurve = typeof vf.trunkSCurve === 'number' ? vf.trunkSCurve : 0.18;
    const centerOpen = typeof vf.centerOpenness === 'number' ? vf.centerOpenness : 0.25;
    const darkBg = Boolean(vf.isDarkSceneBg);

    const silRadii =
      Array.isArray(vf.silhouetteRadii) && vf.silhouetteRadii.length >= 4
        ? vf.silhouetteRadii.map((x: any) => clamp(x, 0.14, 1.15, 0.55))
        : undefined;
    const upperCol = vf.colorUpper || vf.colorLeafTip || vf.colorFlower || '#ec4899';
    const lowerCol = vf.colorLower || vf.colorTrunk || '#2e5c24';

    // 1. MULTI-CLUSTER SPHERICAL UMBEL / SLIME MOLD COLONY (e.g. yellow/cyan/orange beads on thin stalks)
    if (
      clusters >= 3 &&
      capIsl >= 1.65 &&
      lowW < 0.45 &&
      spiky < 0.36 &&
      !(vf.dominantHueCategory === 'golden' && darkBg && clusters >= 5 && capIsl >= 2.2)
    ) {
      return buildFromSpec({
        name: 'Colonia de Esferas / Umbela de Esporas',
        sci: 'Physarum sphaerocephalum',
        summary: 'Múltiples tallos delgados coronados por esferas/glóbulos botánicos en la paleta de la foto.',
        base: 'mossy_forest_floor',
        bg: darkBg ? 'dark_studio' : 'daylight_arch',
        stem: clusters >= 4 ? 'multi_stalk_umbel_colony' : 'herbaceous_curved_stalk',
        canopy: 'spherical_bubble_umbel',
        surface: 'biolum_nodule_pustules',
        hanging: 'none',
        bark: 'smooth_ash',
        tonal: darkBg ? 'velvet_spore_dust' : 'natural_botanical',
        stemCount: clamp(clusters + 1, 3, 8, 5),
        tip: vf.dominantHueCategory === 'cyan' ? 'iridescent_bubble' : 'granulated_berry_cluster',
        colTrunk: lowerCol,
        colMain: vf.colorLeafMain || upperCol,
        colTip: upperCol,
        colFlower: vf.colorFlower || upperCol,
        colAccent: vf.colorAccent || '#fde047',
      });
    }

    // 2. CURLED WITCH-HAT MUSHROOM / POINTED SPOTTED FUNGUS CAP (narrow curved apex + spotted cap)
    if (
      (apexW <= 0.48 && topDens >= 0.52 && spotVar >= 0.22 && ar >= 0.95) ||
      (spotVar >= 0.34 && upW >= 0.40 && lowW < 0.34 && (vf.dominantHueCategory === 'violet' || vf.dominantHueCategory === 'cyan' || vf.dominantHueCategory === 'crimson'))
    ) {
      return buildFromSpec({
        name: 'Seta / Sombrero Curvo Moteado',
        sci: 'Mycena spiralis',
        summary: 'Sombrero cónico de ápice curvado con verrugas/motas en relieve sobre estípite esbelto.',
        base: 'mossy_forest_floor',
        bg: darkBg ? 'dark_studio' : 'daylight_arch',
        stem: 'herbaceous_curved_stalk',
        canopy: 'curled_witchhat_mushroom_cap',
        surface: 'biolum_nodule_pustules',
        hanging: 'mycelial_fuzz',
        bark: 'scifi_biolum_veins',
        tonal: 'freckled_polka_spots',
        stemCount: 1,
        tip: 'spotted_spore_dome',
        colTrunk: lowerCol,
        colMain: vf.colorLeafMain || upperCol,
        colTip: upperCol,
        colFlower: vf.colorFlower || upperCol,
        colAccent: vf.colorAccent || '#f8fafc',
      });
    }

    // 3. GIANT TITAN ARUM / TALL SPATHE & CENTRAL SPADIX (narrow tall apex spire + wide mid collar)
    if (
      ar >= 1.18 &&
      apexW <= 0.44 &&
      upW >= 0.34 &&
      (vf.dominantHueCategory === 'crimson' || vf.dominantHueCategory === 'violet' || vf.dominantHueCategory === 'earthy') &&
      midBulge >= 0.92
    ) {
      return buildFromSpec({
        name: 'Espata Gigante con Espádice Central (Aro)',
        sci: 'Amorphophallus speciosus',
        summary: 'Espata acampanada y rizada envolviendo un gran espádice vertical central en los tonos de la imagen.',
        base: 'mossy_forest_floor',
        bg: darkBg ? 'dark_studio' : 'daylight_arch',
        stem: 'herbaceous_curved_stalk',
        canopy: 'giant_arum_spathe_spadix',
        surface: 'fluted_grooves',
        hanging: 'none',
        bark: 'smooth_ash',
        tonal: 'veined_vascular_rib',
        stemCount: 1,
        petalOpenness: 0.72,
        basal: vf.hasGreenBasalStem ? 'broad_rosette_leaves' : 'none',
        colTrunk: lowerCol,
        colMain: vf.colorLeafMain || '#7f1d1d',
        colTip: upperCol,
        colFlower: vf.colorFlower || upperCol,
        colAccent: vf.colorAccent || '#fef08a',
      });
    }

    // 4. PERFORATED URN / CARNIVOROUS PITCHER / SWOLLEN BULBOUS CUP (bulbous mid bulge + open top cavity)
    if (
      (midBulge >= 1.18 && centerOpen >= 0.24 && ar >= 0.95) ||
      (midBulge >= 1.08 && ar >= 1.15 && upW >= 0.42 && lowW <= 0.38 && spiky < 0.32)
    ) {
      return buildFromSpec({
        name: 'Urna / Jarra Carnívora Perforada',
        sci: 'Nepenthes urceolata',
        summary: 'Estructura acopada o en urna bulbosa con peristoma vascular y cavidad interior profunda.',
        base: 'mossy_forest_floor',
        bg: darkBg ? 'dark_studio' : 'daylight_arch',
        stem: scurve >= 0.28 ? 'stilt_root_mangrove' : 'herbaceous_curved_stalk',
        canopy: 'perforated_blossom_urn',
        surface: 'fluted_grooves',
        hanging: 'none',
        bark: 'armored_scale_bark',
        tonal: 'veined_vascular_rib',
        stemCount: 1,
        petalOpenness: clamp(upW * 1.1, 0.35, 0.85, 0.58),
        colTrunk: lowerCol,
        colMain: vf.colorLeafMain || '#d97706',
        colTip: upperCol,
        colFlower: vf.colorFlower || upperCol,
        colAccent: vf.colorAccent || '#fde047',
      });
    }

    // 5. SPOTTED ORCHID LABELLUM COROLLA (high spot variance + multi-lobed upper flower + colorful)
    if (
      spotVar >= 0.26 &&
      capIsl >= 1.6 &&
      ar >= 0.80 &&
      ar <= 1.38 &&
      (vf.dominantHueCategory === 'cyan' || vf.dominantHueCategory === 'golden' || vf.dominantHueCategory === 'violet' || vf.dominantHueCategory === 'crimson')
    ) {
      return buildFromSpec({
        name: 'Orquídea Moteada de Labelo Simétrico',
        sci: 'Orchidaceae maculata',
        summary: 'Corola zigomorfa con pétalos estrellados, labelo central y moteado celular extraído de la foto.',
        base: 'mossy_forest_floor',
        bg: darkBg ? 'dark_studio' : 'daylight_arch',
        stem: 'herbaceous_curved_stalk',
        canopy: 'spotted_orchid_labellum_corolla',
        surface: 'smooth_striated',
        hanging: 'curling_tendrils',
        bark: 'smooth_ash',
        tonal: 'spotted_orchid_mottled',
        stemCount: 1,
        petalOpenness: 0.82,
        basal: vf.hasGreenBasalStem ? 'broad_rosette_leaves' : 'none',
        colTrunk: lowerCol,
        colMain: vf.colorLeafMain || upperCol,
        colTip: upperCol,
        colFlower: vf.colorFlower || upperCol,
        colAccent: vf.colorAccent || '#f59e0b',
      });
    }

    // 6. CRATER TENTACLE ANEMONE / STARFISH FUNGUS (very high radial spikiness + crater center + warm/crimson/violet)
    if (spiky >= 0.36 && upW >= 0.50 && centerOpen >= 0.22) {
      return buildFromSpec({
        name: 'Anémona / Estrella de Tentáculos Radiales',
        sci: 'Aseroe tentaculata',
        summary: 'Cráter central oscuro rodeado de brazos o tentáculos radiales afilados en el color exacto de la imagen.',
        base: 'mossy_forest_floor',
        bg: darkBg ? 'dark_studio' : 'daylight_arch',
        stem: 'herbaceous_curved_stalk',
        canopy: 'crater_tentacle_anemone',
        surface: 'biolum_nodule_pustules',
        hanging: 'curling_tendrils',
        bark: 'smooth_ash',
        tonal: 'velvet_spore_dust',
        stemCount: 1,
        petalOpenness: 0.86,
        tip: 'sucker_tentacle_cup',
        colTrunk: lowerCol,
        colMain: vf.colorLeafMain || '#dc2626',
        colTip: upperCol,
        colFlower: vf.colorFlower || upperCol,
        colAccent: vf.colorAccent || '#450a0a',
      });
    }

    // 7. TOOTHED VENUS JAW TRAP (spiky hinged bilobed trap + wide lower base or curved jaws)
    if (
      spiky >= 0.31 &&
      midBulge >= 0.90 &&
      ar <= 1.32 &&
      (vf.dominantHueCategory === 'green' || vf.dominantHueCategory === 'crimson')
    ) {
      return buildFromSpec({
        name: 'Trampa Bilobulada Dentada',
        sci: 'Dionaea dentata',
        summary: 'Mandíbulas vegetales dentadas con nervaduras vasculares y cilios marginales rígidos.',
        base: 'mossy_forest_floor',
        bg: darkBg ? 'dark_studio' : 'daylight_arch',
        stem: 'herbaceous_curved_stalk',
        canopy: 'toothed_venus_jaw_trap',
        surface: 'thorny_spines',
        hanging: 'none',
        bark: 'smooth_ash',
        tonal: 'veined_vascular_rib',
        stemCount: 1,
        petalOpenness: 0.72,
        tip: 'recurved_thorn_claw',
        basal: 'broad_rosette_leaves',
        colTrunk: lowerCol,
        colMain: vf.colorLeafMain || '#16a34a',
        colTip: upperCol,
        colFlower: vf.colorFlower || '#dc2626',
        colAccent: vf.colorAccent || '#fef08a',
      });
    }

    // 8. TALL CONICAL FLORAL SPIKE (very tall vertical column ar > 1.35)
    if (ar >= 1.32 && upW <= 0.56 && lowW <= 0.45) {
      return buildFromSpec({
        name: 'Espiga / Inflorescencia Cónica Vertical',
        sci: 'Aloeformis spicata',
        summary: 'Eje columnar elevado cubierto de brácteas florales ascendentes sobre roseta basal.',
        base: 'desert_dunes',
        bg: darkBg ? 'dark_studio' : 'daylight_arch',
        stem: 'herbaceous_curved_stalk',
        canopy: 'conical_floral_spike',
        surface: 'armored_dragon_scales',
        hanging: 'none',
        bark: 'armored_scale_bark',
        tonal: 'natural_botanical',
        stemCount: 1,
        basal: vf.hasGreenBasalStem ? 'broad_rosette_leaves' : 'agave_spiny_rosette',
        colTrunk: lowerCol,
        colMain: vf.colorLeafMain || upperCol,
        colTip: upperCol,
        colFlower: vf.colorFlower || upperCol,
        colAccent: vf.colorAccent || '#fde047',
      });
    }

    // 9. BRAIDED TRUNK TREE WITH PENDANT FRUITS/FLOWERS (high trunk S-curve + woody base + dense canopy)
    if (scurve >= 0.28 && topDens >= 0.48 && stemIsl >= 1.45 && lowW >= 0.24) {
      return buildFromSpec({
        name: 'Árbol de Tronco Trenzado con Frutos',
        sci: 'Ficus tortilis',
        summary: 'Tronco leñoso trenzado en hélice con copa frondosa y frutos o racimos colgantes.',
        base: 'temperate_forest',
        bg: darkBg ? 'dark_studio' : 'daylight_arch',
        stem: 'braided_liana_trunk',
        canopy: 'custom_leaf_lamina',
        surface: 'braided_fibers',
        hanging: 'hanging_pods_berries',
        bark: 'braided_fibrous_bark',
        tonal: 'natural_botanical',
        colTrunk: lowerCol,
        colMain: vf.colorLeafMain || '#15803d',
        colTip: upperCol,
        colFlower: vf.colorFlower || '#f97316',
        colAccent: vf.colorAccent || '#fbbf24',
      });
    }

    if (vf.dominantHueCategory === 'cyan') {
      return buildFromSpec({
        name: darkBg ? 'Orbe Bioluminiscente Cian' : 'Corona Cristalina Azur',
        sci: 'Cyanophyta luminosa',
        summary: 'Morfología en tonos cian/turquesa extraída directamente de la imagen.',
        base: 'exoplanetary_crater',
        bg: darkBg ? 'abyss_biolum' : 'dark_studio',
        stem: spiky > 0.32 ? 'scifi_tendril_cradle' : 'dichotomous_dragon_tree',
        canopy: darkBg ? 'scifi_biolum_plasma_globes' : 'crystal_prism_crown',
        surface: 'biolum_nodule_pustules',
        hanging: darkBg ? 'tethered_scifi_lantern_globes' : 'none',
        bark: 'scifi_biolum_veins',
        tonal: darkBg ? 'bioluminescent_abyss' : 'iridescent_chitin',
        tip: darkBg ? 'scifi_plasma_orb' : 'faceted_crystal_gem',
        headTopo: darkBg ? 'none' : 'crystal_spire_cluster',
        colTrunk: lowerCol,
        colMain: vf.colorLeafMain || '#06b6d4',
        colTip: upperCol,
        colFlower: vf.colorFlower || upperCol,
        colAccent: vf.colorAccent || '#a855f7',
      });
    }

    if (vf.dominantHueCategory === 'violet') {
      const isRadial = spiky > 0.3 || upW > 0.52;
      return buildFromSpec({
        name: darkBg ? 'Flor Xenobotánica Violácea' : isRadial ? 'Pasiflora / Estrella Violácea' : 'Campanas Péndulas Violáceas',
        sci: 'Violaceum morphologica',
        summary: 'Morfología floral violácea/magenta adaptada a la silueta y proporciones de la imagen.',
        base: darkBg ? 'exoplanetary_crater' : 'mossy_forest_floor',
        bg: darkBg ? 'abyss_biolum' : 'dark_studio',
        stem: darkBg ? 'scifi_tendril_cradle' : 'herbaceous_curved_stalk',
        canopy: darkBg
          ? 'scifi_voronoi_ova_balloons'
          : isRadial
          ? 'passionflower_filament_corona'
          : 'hanging_bell_cluster',
        surface: darkBg ? 'biolum_nodule_pustules' : 'smooth_striated',
        hanging: darkBg ? 'tethered_scifi_lantern_globes' : 'curling_tendrils',
        bark: darkBg ? 'scifi_biolum_veins' : 'smooth_ash',
        tonal: darkBg ? 'bioluminescent_abyss' : 'natural_botanical',
        tip: darkBg ? 'scifi_plasma_orb' : 'cupped_bell_calyx',
        basal: darkBg ? 'none' : 'broad_rosette_leaves',
        colTrunk: lowerCol,
        colMain: vf.colorLeafMain || '#7c3aed',
        colTip: upperCol,
        colFlower: vf.colorFlower || upperCol,
        colAccent: vf.colorAccent || '#38bdf8',
      });
    }

    if (vf.dominantHueCategory === 'crimson' || vf.dominantHueCategory === 'golden') {
      const hasMultiClusters = clusters >= 5 && capIsl >= 2.1;
      if (hasMultiClusters && darkBg && (vf.dominantHueCategory === 'golden' || vf.warmOrangeRatio > 0.12)) {
        // Handled cleanly by isFungiUmbelColony right below
      } else if (ar < 0.98 && lowW >= upW * 0.85 && spiky > 0.25) {
        return buildFromSpec({
          name: 'Roseta / Suculenta Cromática de Roca',
          sci: 'Crassulaceae rosulata',
          summary: 'Roseta carnosa de hojas/pétalos radiales en la paleta extraída de la imagen.',
          base: 'mossy_forest_floor',
          bg: darkBg ? 'dark_studio' : 'daylight_arch',
          stem: 'rosette_cluster',
          canopy: 'succulent_fleshy_rosettes',
          surface: 'smooth_striated',
          hanging: 'none',
          bark: 'smooth_ash',
          tonal: 'natural_botanical',
          basal: vf.hasGreenBasalStem ? 'broad_rosette_leaves' : 'none',
          h: 3.4,
          r: 0.36,
          colTrunk: lowerCol,
          colMain: vf.colorLeafMain || '#be185d',
          colTip: upperCol,
          colFlower: upperCol,
          colAccent: vf.colorAccent || '#f472b6',
        });
      } else if (spiky >= 0.30 && upW >= 0.48) {
        return buildFromSpec({
          name: 'Pasiflora / Corona Estrellada de Filamentos',
          sci: 'Passiflora radiata',
          summary: 'Corola radial con corona de filamentos y brácteas abiertas según el contorno detectado.',
          base: 'mossy_forest_floor',
          bg: darkBg ? 'dark_studio' : 'daylight_arch',
          stem: 'herbaceous_curved_stalk',
          canopy: 'passionflower_filament_corona',
          surface: 'smooth_striated',
          hanging: 'curling_tendrils',
          bark: 'smooth_ash',
          tonal: 'natural_botanical',
          stemCount: 1,
          petalOpenness: 0.78,
          basal: vf.hasGreenBasalStem ? 'broad_rosette_leaves' : 'none',
          colTrunk: lowerCol,
          colMain: vf.colorLeafMain || upperCol,
          colTip: upperCol,
          colFlower: vf.colorFlower || upperCol,
          colAccent: vf.colorAccent || '#fde047',
        });
      } else {
        const isLotusLike = upW >= 0.48 && apexW >= 0.42;
        return buildFromSpec({
          name: isLotusLike ? 'Corola Floral / Loto Esculpido' : 'Flor Esculpida en Tallo Fino',
          sci: 'Magnoliophyta speciosa',
          summary: 'Tallo único limpio con follaje basal y corola floral orgánica en los colores exactos de la fotografía.',
          base: 'mossy_forest_floor',
          bg: darkBg ? 'dark_studio' : 'daylight_arch',
          stem: 'herbaceous_curved_stalk',
          canopy: isLotusLike ? 'lotus_magnolia_corolla_crown' : 'custom_flower_corolla',
          surface: 'smooth_striated',
          hanging: 'none',
          bark: 'smooth_ash',
          tonal: 'natural_botanical',
          stemCount: 1,
          lobeCount: 8,
          petalOpenness: clamp(upW * 1.15, 0.32, 0.85, 0.55),
          tip: 'micro_floret_star',
          basal: vf.hasGreenBasalStem ? 'broad_rosette_leaves' : 'long_grass_blades',
          latheProfileRadii: silRadii,
          h: clamp(ar * 3.2, 2.8, 4.8, 3.8),
          r: 0.24,
          leafScale: 1.35,
          colTrunk: vf.hasGreenBasalStem ? lowerCol : '#2e6b27',
          colMain: vf.colorLeafMain || upperCol,
          colTip: upperCol,
          colFlower: vf.colorFlower || upperCol,
          colAccent: vf.colorAccent || '#fde047',
        });
      }
    }

    if (typeof vf.iridescentScore === 'number' && vf.iridescentScore >= 0.42 && upW < 0.55) {
      return buildFromSpec({
        name: 'Espiral Cónica Xenobotánica Moteada',
        sci: 'Xenomyxa spiralis',
        summary: 'Espira cónica enrollada en hélice con textura moteada y tonos vivos extraídos de la imagen.',
        base: 'mossy_forest_floor',
        bg: darkBg ? 'dark_studio' : 'abyss_biolum',
        stem: 'spiral_volute_vine',
        canopy: 'procedural_lathe_head',
        surface: 'biolum_nodule_pustules',
        hanging: 'curling_tendrils',
        bark: 'scifi_biolum_veins',
        tonal: 'iridescent_chitin',
        tip: 'spotted_spore_dome',
        headTopo: 'revolved_lathe_chalice',
      });
    }

    if (vf.dominantHueCategory === 'green' && archetype !== 'mossy_deadwood_trunk') {
      if (ar < 0.95 || lowW > upW + 0.08) {
        return buildFromSpec({
          name: spiky > 0.32 ? 'Conífera / Roseta Acicular' : 'Roseta Suculenta Esculpida',
          sci: 'Agavophyta compacta',
          summary: 'Morfología verde compacta con base ancha extraída de la silueta de la imagen.',
          base: 'alpine_granite',
          bg: darkBg ? 'dark_studio' : 'daylight_arch',
          stem: spiky > 0.32 ? 'gnarled_bonsai' : 'rosette_cluster',
          canopy: spiky > 0.32 ? 'conifer_needle_brushes' : 'succulent_fleshy_rosettes',
          surface: 'armored_dragon_scales',
          hanging: 'none',
          bark: 'pine_plates',
          tonal: 'natural_botanical',
        });
      }
      if (spiky > 0.34) {
        return buildFromSpec({
          name: 'Helecho / Fronda Pinnada Tropical',
          sci: 'Pteridophyta pinnata',
          summary: 'Frondes pinnadas arqueadas detectadas por el contorno dentado verde de la imagen.',
          base: 'mossy_forest_floor',
          bg: darkBg ? 'dark_studio' : 'daylight_arch',
          stem: 'dichotomous_dragon_tree',
          canopy: 'pinnate_fern_palm_fronds',
          surface: 'moss_lichen_bark',
          hanging: 'spanish_moss_epiphyte_drapes',
          bark: 'palm_rings',
          tonal: 'natural_botanical',
          basal: 'fern_fiddleheads',
        });
      }
      if (topDens > 0.56) {
        return buildFromSpec({
          name: 'Monstera / Hoja Tropical Fenestrada',
          sci: 'Philodendron fenestratum',
          summary: 'Copa foliar verde amplia con hojas fenestradas y raíces aéreas.',
          base: 'mossy_forest_floor',
          bg: darkBg ? 'dark_studio' : 'daylight_arch',
          stem: 'creeping_rhizome_runners',
          canopy: 'fenestrated_monstera_leaves',
          surface: 'strangler_root_web',
          hanging: 'aerial_root_curtains',
          bark: 'strangler_vine_lattice',
          tonal: 'natural_botanical',
        });
      }
    }
  }

  const isFungiUmbelColony =
    notes.includes('hongo') ||
    notes.includes('seta') ||
    notes.includes('espora') ||
    notes.includes('colonia') ||
    notes.includes('micel') ||
    archetype === 'fungi_umbel_colony';

  const isBudOrLotus =
    !isFungiUmbelColony &&
    (notes.includes('capullo') ||
      notes.includes('flor') ||
      notes.includes('loto') ||
      notes.includes('rosa') ||
      notes.includes('pétalo') ||
      notes.includes('petalo') ||
      archetype === 'flower_bud_stalk');

  const isThorny =
    !isFungiUmbelColony &&
    !isBudOrLotus &&
    (notes.includes('espin') ||
      notes.includes('spine') ||
      notes.includes('corona') ||
      notes.includes('aloe') ||
      notes.includes('suculent') ||
      notes.includes('garra') ||
      archetype === 'spiny_claw_rosette');

  const isSpiralVine =
    !isFungiUmbelColony &&
    !isBudOrLotus &&
    !isThorny &&
    (notes.includes('espiral') ||
      notes.includes('liana') ||
      notes.includes('enredadera') ||
      notes.includes('voluta') ||
      archetype === 'spiral_volute_vine');

  const isCrimsonBonsai =
    !isFungiUmbelColony &&
    !isBudOrLotus &&
    !isThorny &&
    !isSpiralVine &&
    (notes.includes('bonsai') ||
      notes.includes('bonsái') ||
      notes.includes('nube') ||
      archetype === 'gnarled_bonsai_cloud');

  const isWeeping =
    !isFungiUmbelColony &&
    !isBudOrLotus &&
    !isThorny &&
    !isSpiralVine &&
    !isCrimsonBonsai &&
    (notes.includes('sauce') ||
      notes.includes('llorón') ||
      notes.includes('pendul') ||
      notes.includes('cascada') ||
      archetype === 'weeping_tree');

  // 1. COLONIA DE DOMOS / UMBELAS FÚNGICAS BIOLUMINISCENTES (como la imagen de domos naranjas con motas y filamentos)
  if (isFungiUmbelColony) {

    const detectedStems = Math.round(
      clamp(
        Math.max(
          (vf.vividClusterCount || 6) + 1,
          Math.round((vf.midStemIslands || 3.5) * 2.2)
        ),
        6,
        11,
        8
      )
    );
    const spotDensity = clamp(
      typeof vf.capSpotVariance === 'number' && vf.capSpotVariance > 0.1
        ? 0.55 + vf.capSpotVariance * 0.45
        : 0.82,
      0.35,
      0.98,
      0.85
    );
    const domeHeight = clamp(
      vf.aspectRatio && vf.aspectRatio > 1.1 ? 0.58 : 0.48,
      0.35,
      0.85,
      0.56
    );

    const isAmberOrange =
      vf.dominantHueCategory === 'golden' ||
      vf.dominantHueCategory === 'crimson' ||
      (typeof vf.warmOrangeRatio === 'number' && vf.warmOrangeRatio > 0.08);

    return sanitizeAiPayload(
      {
        identifiedName: isAmberOrange
          ? 'Colonia de Umbelas Bioluminiscentes Moteadas'
          : 'Colonia de Domos Fúngicos & Filamentos',
        scientificName: isAmberOrange
          ? 'Mycena aurantiaca var. filifera'
          : 'Umbellamyces bioluminescens',
        reasoningSummary:
          'Colonia de tallos esbeltos curvados a distintas alturas coronados por domos acampanados con motas oscuras en relieve, láminas inferiores, filamentos colgantes luminosos y brotes jóvenes en la base.',
        recommendedBase: 'mossy_forest_floor',
        recommendedBg: 'dark_studio',
        customElement: {
          name: 'Colonia de Domos Moteados & Filamentos sobre Tallos Esbeltos',
          stemStructure: 'multi_stalk_umbel_colony',
          canopyElement: 'custom_fungi_cap',
          surfaceElement: 'smooth_striated',
          hangingElement: 'weeping_filaments',
          spiralTurns: 1.15,
          spiralArms: detectedStems,
          stemCount: detectedStems,
          trunkBentS: clamp(vf.trunkSCurve, 0.18, 0.65, 0.32),
          branchSpread: clamp(vf.upperWidthRatio, 0.45, 0.95, 0.68),
          capDomeHeight: domeHeight,
          capSpotDensity: spotDensity,
          gillCount: 24,
          thornDensity: 0.0,
          thornLength: 0.4,
          filamentCount: 28,
          filamentLength: 1.35,
          padLayers: 6,
          lobeCount: 8,
          cupDepth: 0.62,
        },
        params: {
          engine: 'composed_custom',
          foliageType: 'ai_custom_element',
          tonalMode: 'natural_botanical',
          height: 5.5,
          radius: 0.34,
          gnarl: 0.44,
          leafScale: 1.25,
          leafDensity: 5,
          showRoots: true,
          emissiveIntensity: 0.46,
          wetnessGloss: 0.55,
          colorTrunk: isAmberOrange ? '#261b18' : vf.colorTrunk || '#2b1e19',
          colorLeafMain: isAmberOrange ? '#d9531e' : vf.colorLeafMain || '#d9531e',
          colorLeafTip: isAmberOrange ? '#f59e0b' : vf.colorLeafTip || '#f59e0b',
          colorFlower: isAmberOrange ? '#ef4444' : vf.colorFlower || '#ef4444',
          colorAccent: isAmberOrange ? '#2b1810' : vf.colorAccent || '#2b1810',
        },
      },
      vf
    );
  }

  // 2. CAPULLO FLORAL / COROLA ESCULTÓRICA O BULBO DE REVOLUCIÓN
  if (isBudOrLotus) {
    const openness = clamp(
      typeof vf.upperWidthRatio === 'number' ? (vf.upperWidthRatio - 0.2) * 1.1 : 0.25,
      0.15,
      0.85,
      0.28
    );
    const isGoldenBulb = vf.dominantHueCategory === 'golden' || vf.dominantHueCategory === 'earthy';
    return sanitizeAiPayload(
      {
        identifiedName: isGoldenBulb ? 'Bulbo Cáliz Ámbar Esculpido' : 'Capullo Floral Trenzado',
        scientificName: isGoldenBulb ? 'Xenobulbus aureus' : 'Xenolotus purpureus',
        reasoningSummary: isGoldenBulb
          ? 'Cáliz bulboso acanalado en tonos ámbar y ocre sobre base leñosa robusta con lóbulos convergentes.'
          : 'Capullo floral acopado de pétalos cóncavos carmesí-violáceos con estambres interiores soldado sobre un tallo de fibras leñosas trenzadas y raíces.',
        recommendedBase: isGoldenBulb ? 'mossy_forest_floor' : 'exoplanetary_crater',
        recommendedBg: vf.isDarkSceneBg ? 'dark_studio' : 'pure_white',
        customElement: {
          name: isGoldenBulb ? 'Bulbo Cáliz Esculpido sobre Base Caudex' : 'Capullo Floral sobre Tallo Trenzado',
          stemStructure: isGoldenBulb ? 'baobab_pachycaul_bottle' : 'gnarled_bonsai',
          canopyElement: isGoldenBulb ? 'custom_spline_leaf_crown' : 'custom_flower_corolla',
          surfaceElement: isGoldenBulb ? 'armored_dragon_scales' : 'braided_vines',
          hangingElement: isGoldenBulb ? 'none' : 'curling_tendrils',
          synthesizedHeadTopology: isGoldenBulb ? 'spline_petal_corona' : 'none',
          petalContourProfile: isGoldenBulb
            ? [0.22, 0.78, 1.05, 0.95, 0.68, 0.34, 0.08]
            : [0.14, 0.62, 0.98, 0.72, 0.94, 0.42, 0.08],
          petalCupping: isGoldenBulb ? 0.68 : 0.38,
          petalTwistDeg: isGoldenBulb ? 8 : 14,
          petalMarginWave: isGoldenBulb ? 0.12 : 0.16,
          spiralTurns: 1.25,
          spiralArms: 1,
          stemCount: 1,
          trunkBentS: clamp(vf.trunkSCurve, 0.15, 0.65, 0.25),
          petalOpenness: isGoldenBulb ? 0.22 : openness,
          thornDensity: 0.25,
          thornLength: 0.8,
          filamentCount: isGoldenBulb ? 0 : 14,
          filamentLength: 0.9,
          padLayers: isGoldenBulb ? 2 : 1,
          lobeCount: isGoldenBulb ? 6 : 9,
          cupDepth: 0.78,
        },
        params: {
          engine: 'composed_custom',
          foliageType: 'ai_custom_element',
          barkType: isGoldenBulb ? 'gnarled_olive_burl' : 'fibrous_redwood',
          tonalMode: 'natural_botanical',
          height: isGoldenBulb ? 3.8 : 4.8,
          radius: isGoldenBulb ? 0.48 : 0.36,
          gnarl: 0.42,
          leafScale: 1.25,
          leafDensity: 5,
          showRoots: true,
          colorTrunk: vf.colorTrunk || (isGoldenBulb ? '#4a3c24' : '#4a3528'),
          colorLeafMain: vf.colorLeafMain || (isGoldenBulb ? '#d97706' : '#9f1239'),
          colorLeafTip: vf.colorLeafTip || (isGoldenBulb ? '#fbbf24' : '#fb7185'),
          colorFlower: vf.colorFlower || (isGoldenBulb ? '#f59e0b' : '#e11d48'),
          colorAccent: vf.colorAccent || (isGoldenBulb ? '#fef08a' : '#fda4af'),
        },
      },
      vf
    );
  }

  // 3. CORONA RADIAL DE GARRAS / HOJAS CARNOSAS ESPINOSAS
  if (isThorny) {
    const detectedArms = Math.round(
      clamp((vf.midStemIslands || 4) * 2.2, 6, 12, 9)
    );
    return sanitizeAiPayload(
      {
        identifiedName: 'Corona de Hojas Carnosas & Espinas',
        scientificName: 'Aloe ferox var. rubra',
        reasoningSummary:
          'Corona radial de hojas suculentas carnosas curvadas hacia adentro y erizadas de espinas marginales sobre caudex leñoso.',
        recommendedBase: 'desert_dunes',
        recommendedBg: 'dark_studio',
        customElement: {
          name: 'Corona Radial de Hojas Carnosas Espinosas',
          stemStructure: 'thorny_horn_crown',
          canopyElement: 'thorn_spur_clusters',
          surfaceElement: 'curved_thorns_spines',
          hangingElement: 'mycelial_fuzz',
          spiralTurns: 1.15,
          spiralArms: detectedArms,
          stemCount: detectedArms,
          thornDensity: 0.92,
          thornLength: 1.25,
          filamentCount: 14,
          filamentLength: 0.7,
          padLayers: 5,
          lobeCount: 6,
          cupDepth: 0.45,
        },
        params: {
          engine: 'composed_custom',
          foliageType: 'ai_custom_element',
          tonalMode: 'natural_botanical',
          height: 4.4,
          radius: 0.38,
          gnarl: 0.45,
          leafScale: 1.22,
          leafDensity: 5,
          showRoots: true,
          colorTrunk: vf.colorTrunk || '#4a3222',
          colorLeafMain: vf.colorLeafMain || '#991b1b',
          colorLeafTip: vf.colorLeafTip || '#ef4444',
          colorFlower: vf.colorFlower || '#dc2626',
          colorAccent: vf.colorAccent || '#fef08a',
        },
      },
      vf
    );
  }

  // 4. BONSÁI RETORCIDO EN S CON NUBES ESTRATIFICADAS Y FILAMENTOS
  if (isCrimsonBonsai) {
    return sanitizeAiPayload(
      {
        identifiedName: 'Bonsái Nube Carmesí & Filamentos',
        scientificName: 'Acer rubrum var. nebulosa',
        reasoningSummary:
          'Combinación modular de tronco bonsái retorcido en S con sub-ramas leñosas, copas estratificadas en nube carmesí y filamentos colgantes.',
        recommendedBase: 'alpine_granite',
        recommendedBg: 'dark_studio',
        customElement: {
          name: 'Nube Bonsái & Filamentos Colgantes',
          stemStructure: 'gnarled_bonsai',
          canopyElement: 'cloud_bonsai_pads',
          surfaceElement: 'moss_lichen_bark',
          hangingElement: 'weeping_filaments',
          spiralTurns: 1.25,
          spiralArms: 5,
          trunkBentS: clamp(vf.trunkSCurve, 0.35, 0.85, 0.55),
          branchSpread: clamp(vf.upperWidthRatio, 0.48, 0.95, 0.68),
          thornDensity: 0.1,
          thornLength: 0.5,
          filamentCount: 26,
          filamentLength: 1.28,
          padLayers: 7,
          lobeCount: 7,
          cupDepth: 0.25,
        },
        params: {
          engine: 'composed_custom',
          foliageType: 'ai_custom_element',
          tonalMode: 'natural_botanical',
          height: 5.4,
          radius: 0.44,
          gnarl: 0.65,
          leafScale: 1.25,
          leafDensity: 5,
          showRoots: true,
          colorTrunk: vf.colorTrunk || '#3b231e',
          colorLeafMain: vf.colorLeafMain || '#881322',
          colorLeafTip: vf.colorLeafTip || '#dc2626',
          colorFlower: vf.colorFlower || '#ef4444',
          colorAccent: vf.colorAccent || '#f87171',
        },
      },
      vf
    );
  }

  // 5. LIANA VOLUTA EN ESPIRAL & ZARCILLOS
  if (isSpiralVine) {
    return sanitizeAiPayload(
      {
        identifiedName: 'Liana Voluta en Espiral & Zarcillos',
        scientificName: 'Liana voluta spiralis',
        reasoningSummary:
          'Combinación modular de tallos leñosos trenzados en doble voluta espiral, hojas adheridas a lo largo del tallo y zarcillos rizados.',
        recommendedBase: 'mossy_forest_floor',
        recommendedBg: 'dark_studio',
        customElement: {
          name: 'Voluta Espiral Trenzada con Zarcillos',
          stemStructure: 'spiral_volute_vine',
          canopyElement: 'stem_hugging_leaves',
          surfaceElement: 'braided_vines',
          hangingElement: 'curling_tendrils',
          spiralTurns: 1.5,
          spiralArms: 2,
          thornDensity: 0.12,
          thornLength: 0.6,
          filamentCount: 22,
          filamentLength: 1.1,
          padLayers: 5,
          lobeCount: 5,
          cupDepth: 0.2,
        },
        params: {
          engine: 'composed_custom',
          foliageType: 'ai_custom_element',
          tonalMode: 'natural_botanical',
          height: 5.2,
          radius: 0.34,
          gnarl: 0.55,
          leafScale: 1.18,
          leafDensity: 5,
          showRoots: true,
          colorTrunk: vf.colorTrunk || '#523a28',
          colorLeafMain: vf.colorLeafMain || '#3f7d20',
          colorLeafTip: vf.colorLeafTip || '#84cc16',
          colorFlower: vf.colorFlower || '#a3e635',
          colorAccent: vf.colorAccent || '#65a30d',
        },
      },
      vf
    );
  }

  // 6. ÁRBOL PÉNDULO / EN CASCADA CON RAMAS ARQUEADAS Y HOJAS ESCULPIDAS
  if (isWeeping) {
    return sanitizeAiPayload(
      {
        identifiedName: 'Árbol Péndulo de Copa en Cascada',
        scientificName: 'Salix morphologica pendula',
        reasoningSummary:
          'Tronco leñoso con ramas primarias y secundarias arqueadas en cascada, láminas foliares lanceoladas a medida y filamentos péndulos.',
        recommendedBase: 'temperate_forest',
        recommendedBg: 'dark_studio',
        customElement: {
          name: 'Ramas Péndulas & Láminas Foliares en Cascada',
          stemStructure: 'weeping_willow',
          canopyElement: 'custom_leaf_lamina',
          surfaceElement: 'moss_lichen_bark',
          hangingElement: 'weeping_filaments',
          spiralTurns: 1.15,
          spiralArms: 5,
          stemCount: 5,
          trunkBentS: clamp(vf.trunkSCurve, 0.18, 0.7, 0.34),
          branchSpread: clamp(vf.upperWidthRatio, 0.5, 1.0, 0.72),
          branchDroop: 0.62,
          leafSerration: clamp(vf.edgeSpikiness, 0.15, 0.85, 0.42),
          thornDensity: 0.08,
          thornLength: 0.5,
          filamentCount: 24,
          filamentLength: 1.3,
          padLayers: 6,
          lobeCount: 7,
          cupDepth: 0.22,
        },
        params: {
          engine: 'composed_custom',
          foliageType: 'ai_custom_element',
          tonalMode: 'natural_botanical',
          height: 5.4,
          radius: 0.4,
          gnarl: 0.48,
          leafScale: 1.2,
          leafDensity: 5,
          showRoots: true,
          colorTrunk: vf.colorTrunk || '#4a3525',
          colorLeafMain: vf.colorLeafMain || '#3f7d20',
          colorLeafTip: vf.colorLeafTip || '#84cc16',
          colorFlower: vf.colorFlower || '#a3e635',
          colorAccent: vf.colorAccent || '#65a30d',
        },
      },
      vf
    );
  }

  // 7. ÁRBOL RAMIFICADO SIMPODIAL CON TRONCO, RAMAS EN Y & HOJAS ESCULPIDAS A MEDIDA
  const boughs = Math.round(clamp((vf.midStemIslands || 2.5) * 1.8, 4, 7, 5));
  return sanitizeAiPayload(
    {
      identifiedName: 'Árbol Ramificado de Hojas Esculpidas',
      scientificName: 'Arborea sympodialis sp.',
      reasoningSummary:
        'Tronco principal esculpido a medida con ramas primarias y ramillas secundarias bifurcadas en Y, rosetas de hojas nervadas y paleta cromática extraída de la imagen.',
      recommendedBase: 'temperate_forest',
      recommendedBg: 'dark_studio',
      customElement: {
        name: 'Tronco Bifurcado en Y & Láminas Foliares Nervadas',
        stemStructure: 'sympodial_tree',
        canopyElement: 'custom_leaf_lamina',
        surfaceElement: 'moss_lichen_bark',
        hangingElement: 'hanging_pods_berries',
        spiralTurns: 1.15,
        spiralArms: boughs,
        stemCount: boughs,
        trunkBentS: clamp(vf.trunkSCurve, 0.15, 0.75, 0.32),
        branchSpread: clamp(vf.upperWidthRatio, 0.42, 0.95, 0.65),
        branchDroop: 0.18,
        leafSerration: clamp(vf.edgeSpikiness, 0.15, 0.85, 0.42),
        thornDensity: 0.1,
        thornLength: 0.5,
        filamentCount: 16,
        filamentLength: 0.85,
        padLayers: 6,
        lobeCount: 7,
        cupDepth: 0.25,
      },
      params: {
        engine: 'composed_custom',
        foliageType: 'ai_custom_element',
        tonalMode: 'natural_botanical',
        height: 5.3,
        radius: 0.4,
        gnarl: 0.48,
        leafScale: 1.22,
        leafDensity: 5,
        showRoots: true,
        colorTrunk: vf.colorTrunk || '#523a28',
        colorLeafMain: vf.colorLeafMain || '#3f7d20',
        colorLeafTip: vf.colorLeafTip || '#84cc16',
        colorFlower: vf.colorFlower || '#e11d48',
        colorAccent: vf.colorAccent || '#f59e0b',
      },
    },
    vf
  );
}

/**
 * Extracts a JSON object from raw LLM text (useful for Ollama / LM Studio / Llama.cpp responses)
 */
function extractJsonFromText(text: string): any {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const firstBrace = trimmed.indexOf('{');
    const lastBrace = trimmed.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
    }
    throw new Error('La respuesta del modelo local no contenía JSON válido.');
  }
}

const LOCAL_JSON_PROMPT_TEMPLATE = `Devuelve EXCLUSIVAMENTE un objeto JSON válido (sin bloques markdown) con esta estructura exacta para diseñar la planta de la imagen en 3D (incluyendo síntesis de nuevas partes si no encaja en un árbol o capullo simple):
{
  "identifiedName": "Nombre descriptivo en español",
  "scientificName": "Nombre científico",
  "reasoningSummary": "Explicación breve en español",
  "recommendedBase": "mossy_forest_floor",
  "recommendedBg": "dark_studio",
  "customElement": {
    "name": "Nombre del elemento",
    "stemStructure": "serpentine_mossy_deadwood | strangler_root_cage | baobab_pachycaul_bottle | mangrove_stilt_arch | dichotomous_dragon_tree | braided_helix_trunks | segmented_bamboo_equisetum | hollow_ancient_snag | creeping_rhizome_runners | scifi_tendril_cradle | herbaceous_curved_stalk | multi_stalk_umbel_colony | sympodial_tree | gnarled_bonsai | weeping_willow | thorny_horn_crown | spiral_volute_vine | rosette_cluster",
    "canopyElement": "moss_velvet_mantle | scifi_biolum_plasma_globes | scifi_voronoi_ova_balloons | fenestrated_monstera_leaves | palmate_maple_star_leaves | pinnate_fern_palm_fronds | succulent_fleshy_rosettes | conifer_needle_brushes | lotus_magnolia_corolla_crown | passionflower_filament_corona | heliconia_bract_candelabra | dehiscent_seed_pods_coronas | carnivorous_nepenthes_pitchers | custom_spline_leaf_crown | spherical_bubble_umbel | radiating_floret_head | hanging_bell_cluster | crystal_prism_crown | procedural_lathe_head | custom_fungi_cap | custom_leaf_lamina | custom_flower_corolla | cloud_bonsai_pads | thorn_spur_clusters | stem_hugging_leaves",
    "surfaceElement": "strangler_root_web | rose_hooked_prickles | cactus_areole_spine_bursts | armored_dragon_scales | shelf_fungi_conks | biolum_nodule_pustules | smooth_striated | moss_lichen_bark | braided_vines | curved_thorns_spines",
    "hangingElement": "aerial_root_curtains | winged_samara_seeds | tethered_scifi_lantern_globes | spanish_moss_epiphyte_drapes | thorny_barbed_whips | weeping_filaments | curling_tendrils | mycelial_fuzz | hanging_pods_berries | none",
    "synthesizedHeadTopology": "spherical_umbel_rays | layered_petal_starburst | hanging_bell_raceme | revolved_lathe_chalice | crystal_spire_cluster | spline_petal_corona | none",
    "synthesizedTipPrimitive": "bryophyte_moss_pad | scifi_plasma_orb | spiked_seed_burr | winged_helicoid_seed | crowned_pomegranate_pod | recurved_thorn_claw | feathery_pappus_plume | sucker_tentacle_cup | iridescent_bubble | dewy_droplet | micro_floret_star | cupped_bell_calyx | faceted_crystal_gem | spotted_spore_dome | lanceolate_blade | none",
    "synthesizedBasalFoliage": "long_grass_blades | broad_rosette_leaves | spiny_succulent_claws | fern_fiddleheads | baby_umbel_sprouts | none",
    "latheProfileRadii": [0.16, 0.68, 0.88, 0.56, 0.78, 0.92],
    "petalContourProfile": [0.14, 0.62, 0.98, 0.72, 0.94, 0.42, 0.08],
    "petalCupping": 0.38,
    "petalTwistDeg": 14,
    "petalMarginWave": 0.16,
    "umbelRayCount": 76,
    "umbelSphereRatio": 0.9,
    "tipBubbleScale": 1.1,
    "basalLeafCount": 18,
    "basalLeafLength": 1.05,
    "iridescentShift": 0.92,
    "aiNewPartsReport": "Resumen de las nuevas partes 3D diseñadas para esta especie",
    "spiralTurns": 1.3,
    "spiralArms": 6,
    "stemCount": 8,
    "trunkBentS": 0.35,
    "branchSpread": 0.65,
    "branchDroop": 0.18,
    "capDomeHeight": 0.58,
    "capSpotDensity": 0.85,
    "gillCount": 24,
    "petalOpenness": 0.35,
    "leafSerration": 0.4,
    "thornDensity": 0.2,
    "thornLength": 1.0,
    "filamentCount": 24,
    "filamentLength": 1.2,
    "padLayers": 6,
    "lobeCount": 7,
    "cupDepth": 0.55
  },
  "params": {
    "engine": "composed_custom",
    "foliageType": "ai_custom_element",
    "tonalMode": "iridescent_chitin",
    "height": 4.8,
    "radius": 0.32,
    "gnarl": 0.45,
    "leafScale": 1.22,
    "leafDensity": 5,
    "showRoots": true,
    "colorTrunk": "#2e6f21",
    "colorLeafMain": "#f97316",
    "colorLeafTip": "#f472b6",
    "colorFlower": "#fb7185",
    "colorAccent": "#38bdf8"
  }
}`;

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '15mb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true, service: 'arborea-studio-pro' });
  });

  // Endpoint to query local models installed in Ollama / LM Studio / Llama.cpp when running on local PC
  app.post('/api/ai/local-models', async (req: Request, res: Response) => {
    const { provider, endpointUrl } = req.body || {};
    try {
      if (provider === 'ollama') {
        const base = (
          typeof endpointUrl === 'string' && endpointUrl.trim()
            ? endpointUrl.trim()
            : process.env.OLLAMA_HOST || 'http://127.0.0.1:11434'
        ).replace(/\/+$/, '');

        const r = await fetch(`${base}/api/tags`, {
          signal: AbortSignal.timeout(3500),
        });
        if (!r.ok) {
          res.status(502).json({ error: `Ollama respondió con HTTP ${r.status}` });
          return;
        }
        const data: any = await r.json();
        const models: string[] = Array.isArray(data?.models)
          ? data.models.map((m: any) => String(m.name || m.model || '')).filter(Boolean)
          : [];
        res.json({ ok: true, provider: 'ollama', models });
        return;
      }

      if (provider === 'lmstudio' || provider === 'llamacpp_openai') {
        const defaultUrl =
          provider === 'lmstudio' ? 'http://127.0.0.1:1234/v1' : 'http://127.0.0.1:8080/v1';
        const base = (
          typeof endpointUrl === 'string' && endpointUrl.trim()
            ? endpointUrl.trim()
            : defaultUrl
        ).replace(/\/+$/, '');

        const modelsUrl = base.endsWith('/v1') ? `${base}/models` : `${base}/v1/models`;
        const r = await fetch(modelsUrl, {
          signal: AbortSignal.timeout(3500),
        });
        if (!r.ok) {
          res.status(502).json({ error: `Servidor local respondió con HTTP ${r.status}` });
          return;
        }
        const data: any = await r.json();
        const models: string[] = Array.isArray(data?.data)
          ? data.data.map((m: any) => String(m.id || '')).filter(Boolean)
          : [];
        res.json({ ok: true, provider, models });
        return;
      }

      res.json({ ok: true, provider: provider || 'cloud_default', models: [] });
    } catch (err: any) {
      res.status(503).json({
        ok: false,
        error:
          err?.message ||
          'No se pudo conectar al servidor IA local desde el backend. Asegúrate de que Ollama / LM Studio esté en ejecución.',
      });
    }
  });

  app.post('/api/ai/design-plant', async (req: Request, res: Response) => {
    const { imageBase64, mimeType, userNotes, visionFeatures, aiConfig, customParts } = req.body || {};
    if (typeof imageBase64 !== 'string' || imageBase64.length < 32) {
      res.status(400).json({ error: 'Debes adjuntar una imagen válida de la planta o árbol.' });
      return;
    }

    const provider: string = aiConfig?.provider || 'cloud_default';
    const autoFallback: boolean = aiConfig?.autoFallback !== false;
    const temperature: number = clamp(aiConfig?.temperature, 0.0, 1.2, 0.35);

    const safeMime =
      typeof mimeType === 'string' &&
      ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(mimeType)
        ? mimeType
        : 'image/jpeg';

    const cleanBase64 = imageBase64.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '');

    const notesBlock =
      typeof userNotes === 'string' && userNotes.trim().length > 0
        ? `\nIndicaciones del usuario: "${userNotes.trim().slice(0, 350)}"`
        : '';

    const visionHint = visionFeatures
      ? `\nAnálisis morfológico 2D de la imagen: arquetipoDetectado=${visionFeatures.detectedArchetype}, proporcionAltoAncho=${visionFeatures.aspectRatio}, perfilAnchuraSilueta=${JSON.stringify(visionFeatures.silhouetteRadii || [])}, colorSuperior=${visionFeatures.colorUpper || visionFeatures.colorLeafTip}, colorInferior=${visionFeatures.colorLower || visionFeatures.colorTrunk}, scoreIridiscencia=${visionFeatures.iridescentScore ?? 0}, talloVerdeBasal=${visionFeatures.hasGreenBasalStem ?? false}, tronco=${visionFeatures.colorTrunk}, colorPrincipal=${visionFeatures.colorLeafMain}, colorPunta=${visionFeatures.colorLeafTip}, colorFlor=${visionFeatures.colorFlower}, acento=${visionFeatures.colorAccent}.`
      : '';

    let customPartsContext = '';
    if (Array.isArray(customParts) && customParts.length > 0) {
      customPartsContext = `\n\n=== BIBLIOTECA UNIFICADA DE PARTES (${Math.min(32, customParts.length)} piezas disponibles de especies, IA y usuario) ===\nBusca primero aquí si la imagen coincide con partes ya existentes y reutiliza o combina sus valores exactos en "customElement". Si la parte NO existe en esta biblioteca, sintetiza una nueva morfología (nuevos valores, "petalContourProfile" o "latheProfileRadii") para que el sistema la guarde automáticamente:\n`;
      customParts.slice(0, 32).forEach((part: any) => {
        const el = part?.element || {};
        customPartsContext += `- [${part?.name || el?.name || 'Parte'} | ${part?.category || 'parte'} | ${part?.source || 'library'}]: stemStructure=${el.stemStructure || '-'}, canopyElement=${el.canopyElement || '-'}, surfaceElement=${el.surfaceElement || '-'}, hangingElement=${el.hangingElement || '-'}, synthesizedHeadTopology=${el.synthesizedHeadTopology || 'none'}, synthesizedTipPrimitive=${el.synthesizedTipPrimitive || 'none'}, synthesizedBasalFoliage=${el.synthesizedBasalFoliage || 'none'}, latheProfileRadii=${JSON.stringify(el.latheProfileRadii || [])}, petalContourProfile=${JSON.stringify(el.petalContourProfile || [])}, petalCupping=${el.petalCupping ?? 0.38}, petalTwistDeg=${el.petalTwistDeg ?? 14}, petalMarginWave=${el.petalMarginWave ?? 0.16}, umbelRayCount=${el.umbelRayCount ?? 64}, petalOpenness=${el.petalOpenness ?? 0.4}, thornDensity=${el.thornDensity ?? 0}\n`;
      });
    }


    // ─────────────────────────────────────────────────────────────────────────
    // OPTION 1: OFFLINE LOCAL COMPUTER VISION ENGINE (Instant, Zero LLM)
    // ─────────────────────────────────────────────────────────────────────────
    if (provider === 'local_vision_offline') {
      const synthesized = buildVisionFallbackPayload(visionFeatures, userNotes);
      res.json({ result: synthesized, providerUsed: 'local_vision_offline' });
      return;
    }

    // Helper to query a local Ollama model (used explicitly or as auto-fallback when Cloud fails)
    const runOllamaVisionChat = async (ollamaBase: string, ollamaModel: string) => {
      const compactLocalSystemPrompt = `Eres un diseñador botánico 3D. Analiza la imagen y devuelve SOLO JSON válido.\n${LOCAL_JSON_PROMPT_TEMPLATE}${customPartsContext}`;
      const sendOllamaChat = async (withImage: boolean) => {
        return fetch(`${ollamaBase}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: ollamaModel,
            stream: false,
            format: 'json',
            options: { temperature, num_predict: 700, num_ctx: 8192 },
            messages: [
              { role: 'system', content: compactLocalSystemPrompt },
              withImage
                ? {
                    role: 'user',
                    content: `Describe la planta/árbol/estructura exacta de esta imagen y devuelve el JSON de configuración 3D.${visionHint}${notesBlock}`,
                    images: [cleanBase64],
                  }
                : {
                    role: 'user',
                    content: `Diseña en JSON 3D una planta/árbol acorde a estas mediciones y notas (el modelo actual es solo texto):${visionHint}${notesBlock}`,
                  },
            ],
          }),
          signal: AbortSignal.timeout(120000),
        });
      };

      let ollamaRes = await sendOllamaChat(true);
      let usedTextOnlyFallback = false;

      if (!ollamaRes.ok) {
        const errText = await ollamaRes.text().catch(() => '');
        if (ollamaRes.status === 400 && errText.toLowerCase().includes('multimodal')) {
          ollamaRes = await sendOllamaChat(false);
          usedTextOnlyFallback = true;
          if (!ollamaRes.ok) {
            const retryErr = await ollamaRes.text().catch(() => '');
            throw new Error(`HTTP ${ollamaRes.status}: ${retryErr.slice(0, 120)}`);
          }
        } else {
          throw new Error(`HTTP ${ollamaRes.status}: ${errText.slice(0, 120)}`);
        }
      }

      const ollamaData: any = await ollamaRes.json();
      const rawContent = ollamaData?.message?.content || ollamaData?.response || '';
      const parsed = extractJsonFromText(rawContent);
      const sanitized = sanitizeAiPayload(parsed, visionFeatures);
      return { sanitized, usedTextOnlyFallback };
    };

    // ─────────────────────────────────────────────────────────────────────────
    // OPTION 2: OLLAMA LOCAL VISION ENGINE (http://127.0.0.1:11434)
    // ─────────────────────────────────────────────────────────────────────────
    if (provider === 'ollama') {
      const ollamaBase = (
        typeof aiConfig?.endpointUrl === 'string' && aiConfig.endpointUrl.trim()
          ? aiConfig.endpointUrl.trim()
          : process.env.OLLAMA_HOST || 'http://127.0.0.1:11434'
      ).replace(/\/+$/, '');
      const ollamaModel =
        typeof aiConfig?.modelName === 'string' && aiConfig.modelName.trim()
          ? aiConfig.modelName.trim()
          : 'llama3.2-vision';

      try {
        const { sanitized, usedTextOnlyFallback } = await runOllamaVisionChat(ollamaBase, ollamaModel);
        res.json({
          result: sanitized,
          providerUsed: usedTextOnlyFallback
            ? `Ollama (${ollamaModel} · solo texto)`
            : `Ollama (${ollamaModel})`,
        });
        return;
      } catch (err: any) {
        const reason = String(err?.message || 'error').slice(0, 60);
        console.warn('Error llamando a Ollama desde servidor:', err?.message);
        if (!autoFallback) {
          res.status(502).json({
            error: `No se pudo conectar con Ollama en ${ollamaBase} (modelo "${ollamaModel}"): ${err?.message}. Verifica que Ollama esté ejecutándose ("ollama serve") y tengas descargado el modelo ("ollama pull ${ollamaModel}").`,
          });
          return;
        }
        const synthesized = buildVisionFallbackPayload(visionFeatures, userNotes);
        res.json({
          result: synthesized,
          providerUsed: `Visión Local (Ollama: ${reason})`,
        });
        return;
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // OPTION 3: LM STUDIO / LLAMA.CPP / LOCALAI / VLLM (OpenAI-Compatible Local Server)
    // ─────────────────────────────────────────────────────────────────────────
    if (provider === 'lmstudio' || provider === 'llamacpp_openai') {
      const defaultEndpoint =
        provider === 'lmstudio' ? 'http://127.0.0.1:1234/v1' : 'http://127.0.0.1:8080/v1';
      const base = (
        typeof aiConfig?.endpointUrl === 'string' && aiConfig.endpointUrl.trim()
          ? aiConfig.endpointUrl.trim()
          : defaultEndpoint
      ).replace(/\/+$/, '');
      const chatUrl = base.endsWith('/v1')
        ? `${base}/chat/completions`
        : `${base}/v1/chat/completions`;
      const localModel =
        typeof aiConfig?.modelName === 'string' && aiConfig.modelName.trim()
          ? aiConfig.modelName.trim()
          : 'local-vision-model';

      try {
        const oaiRes = await fetch(chatUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: localModel,
            temperature,
            messages: [
              {
                role: 'system',
                content: `${BOTANICAL_SYSTEM_PROMPT}\n\n${LOCAL_JSON_PROMPT_TEMPLATE}${customPartsContext}`,
              },
              {
                role: 'user',
                content: [
                  {
                    type: 'text',
                    text: `Analiza esta imagen de planta/árbol y devuelve el JSON de configuración 3D.${visionHint}${notesBlock}`,
                  },
                  {
                    type: 'image_url',
                    image_url: {
                      url: `data:${safeMime};base64,${cleanBase64}`,
                    },
                  },
                ],
              },
            ],
          }),
          signal: AbortSignal.timeout(45000),
        });

        if (!oaiRes.ok) {
          const errText = await oaiRes.text().catch(() => '');
          throw new Error(`Servidor local respondió con HTTP ${oaiRes.status}: ${errText.slice(0, 140)}`);
        }

        const oaiData: any = await oaiRes.json();
        const rawContent = oaiData?.choices?.[0]?.message?.content || '';
        const parsed = extractJsonFromText(rawContent);
        const sanitized = sanitizeAiPayload(parsed, visionFeatures);
        res.json({ result: sanitized, providerUsed: `${provider} (${localModel})` });
        return;
      } catch (err: any) {
        console.warn(`Error llamando a ${provider} desde servidor:`, err?.message);
        if (!autoFallback) {
          res.status(502).json({
            error: `No se pudo conectar con el servidor IA local en ${base}: ${err?.message}.`,
          });
          return;
        }
        const synthesized = buildVisionFallbackPayload(visionFeatures, userNotes);
        res.json({
          result: synthesized,
          providerUsed: `Visión Local (Fallback tras ${provider} no disponible)`,
        });
        return;
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // OPTION 4: CLOUD AI ENGINE (Default) -> auto-fallback to local Ollama if available
    // ─────────────────────────────────────────────────────────────────────────
    const tryAutoLocalOllama = async (): Promise<boolean> => {
      const ollamaBase = (process.env.OLLAMA_HOST || 'http://127.0.0.1:11434').replace(/\/+$/, '');
      try {
        const tagsRes = await fetch(`${ollamaBase}/api/tags`, {
          signal: AbortSignal.timeout(1200),
        });
        if (!tagsRes.ok) return false;
        const tagsData: any = await tagsRes.json();
        const models: string[] = Array.isArray(tagsData?.models)
          ? tagsData.models.map((m: any) => String(m?.name || m?.model || '')).filter(Boolean)
          : [];
        if (models.length === 0) return false;
        const preferred =
          models.find((m) => /vision|llava|vl|minicpm|gemma3|moondream/i.test(m)) || models[0];
        const { sanitized, usedTextOnlyFallback } = await runOllamaVisionChat(ollamaBase, preferred);
        res.json({
          result: sanitized,
          providerUsed: usedTextOnlyFallback
            ? `Ollama Auto (${preferred} · texto)`
            : `Ollama Auto (${preferred})`,
        });
        return true;
      } catch {
        return false;
      }
    };

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
      if (await tryAutoLocalOllama()) return;
      const fallback = buildVisionFallbackPayload(visionFeatures, userNotes);
      res.json({ result: fallback, providerUsed: 'Visión Local (Sin clave Cloud)' });
      return;
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: { 'User-Agent': 'aistudio-build' },
      },
    });

    const cloudModels = [
      { id: 'gemini-2.5-flash', useThinking: true },
      { id: 'gemini-2.0-flash', useThinking: false },
      { id: 'gemini-4-hydrogen', useThinking: true },
    ];
    let lastErr: any = null;
    for (let attempt = 0; attempt < cloudModels.length; attempt++) {
      const mCfg = cloudModels[attempt];
      try {
        const genConfig: any = {
          systemInstruction: `${BOTANICAL_SYSTEM_PROMPT}${customPartsContext}`,
          responseMimeType: 'application/json',
          responseSchema: PLANT_DESIGN_SCHEMA,
        };
        if (mCfg.useThinking) {
          genConfig.thinkingConfig = { thinkingLevel: ThinkingLevel.LOW };
        }
        const response = await Promise.race([
          ai.models.generateContent({
            model: mCfg.id,
            contents: [
              {
                inlineData: {
                  mimeType: safeMime,
                  data: cleanBase64,
                },
              },
              {
                text: `Analiza esta imagen y construye un elemento 3D a medida combinando stemStructure, canopyElement, surfaceElement y hangingElement en Arborea Studio Pro.${visionHint}${notesBlock}`,
              },
            ],
            config: genConfig,
          }),
          new Promise<never>((_, reject) =>
            setTimeout(
              () => reject(new Error(`Timeout esperando respuesta de Cloud IA (${mCfg.id}, 18s)`)),
              18000
            )
          ),
        ]);

        const rawText = response.text;
        if (rawText) {
          const parsed = JSON.parse(rawText);
          const sanitized = sanitizeAiPayload(parsed, visionFeatures);
          res.json({ result: sanitized, providerUsed: `Cloud Vision IA (${mCfg.id})` });
          return;
        }
      } catch (err: any) {
        lastErr = err;
        console.warn(
          `Intento ${attempt + 1} (${mCfg.id}) en /api/ai/design-plant:`,
          err?.status || err?.message
        );
        await new Promise((r) => setTimeout(r, 250));
      }
    }

    if (await tryAutoLocalOllama()) return;
    console.warn('Usando síntesis morfológica por visión artificial tras fallo Cloud:', lastErr?.message);
    const synthesized = buildVisionFallbackPayload(visionFeatures, userNotes);
    const errTag = lastErr?.status
      ? ` (Cloud ${lastErr.status})`
      : String(lastErr?.message || '').includes('Timeout')
      ? ' (Cloud Timeout)'
      : '';
    res.json({ result: synthesized, providerUsed: `Síntesis Morfológica Local${errTag}` });
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const candidates = [
      path.resolve(process.cwd(), 'dist'),
      path.resolve(currentDir, 'dist'),
      path.resolve(currentDir, '..', 'dist'),
    ];
    const distPath = candidates.find((p) => fs.existsSync(path.join(p, 'index.html'))) || candidates[0];
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Arborea Studio Pro server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
