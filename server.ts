import 'dotenv/config';
import express, { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type, ThinkingLevel } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
]);

const VALID_SYNTH_HEAD_TOPOLOGIES = new Set([
  'spherical_umbel_rays',
  'layered_petal_starburst',
  'hanging_bell_raceme',
  'revolved_lathe_chalice',
  'crystal_spire_cluster',
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

2. "canopyElement" (24 Tipos de Hojas, Globos Sci-Fi, Pétalos, Coronas, Semillas y Musgos 3D):
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
   - "procedural_lathe_head": Cáliz/urna esculpido por revolución.
   - "custom_fungi_cap": Sombrero fúngico en domo con láminas y motas 3D.
   - "custom_flower_corolla": Capullo floral cerrado/entreabierto.
   - "custom_leaf_lamina": Láminas foliares nervadas a medida.
   - "cloud_bonsai_pads": Almohadillas densas en nube de bonsái.
   - "thorn_spur_clusters": Racimos de púas y espolones.
   - "stem_hugging_leaves": Hojas adheridas a lo largo del tallo.

3. "surfaceElement" (10 Enredaderas de Raíces, Púas, Aguijones, Escamas y Relieves de Corteza):
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

5. "params.barkType" (16 Shaders Procedurales de Corteza de Tronco):
   - "mossy_deadwood" (Madera seca retorcida con musgo), "strangler_vine_lattice" (Entramado de raíces), "scifi_biolum_veins" (Venas bioluminiscentes Sci-Fi), "volcanic_magma_crust" (Corteza volcánica de magma), "eucalyptus_rainbow" (Eucalipto arcoíris), "cork_oak_quercus" (Alcornoque corchoso), "gnarled_olive_burl" (Olivo milenario nudoso), "dragon_scales_cycad" (Escamas de dragón), "fissured", "pine_plates", "birch_paper", "smooth_ash", "palm_rings", "bamboo_culm", "cactus_ribs", "fibrous_redwood".

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
    combinedAiText.includes('esfera') ||
    combinedAiText.includes('esféric') ||
    combinedAiText.includes('globo') ||
    (combinedAiText.includes('iridisc') &&
      (combinedAiText.includes('flor') ||
        combinedAiText.includes('umbela') ||
        combinedAiText.includes('rocío') ||
        combinedAiText.includes('gota') ||
        combinedAiText.includes('vitre'))) ||
    vf.detectedArchetype === 'umbel_bubble_flower';

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
    (vf.detectedArchetype === 'mossy_deadwood_trunk' ||
      ((combinedAiText.includes('tronco') ||
        combinedAiText.includes('lignum') ||
        combinedAiText.includes('madera') ||
        combinedAiText.includes('muñon') ||
        combinedAiText.includes('munon')) &&
        (combinedAiText.includes('musgo') ||
          combinedAiText.includes('bryophyt') ||
          combinedAiText.includes('retorcid')) &&
        !combinedAiText.includes('bonsai') &&
        !combinedAiText.includes('bonsái')));

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

  if (mentionsMossyDeadwoodTrunk) {
    stemStructure = 'serpentine_mossy_deadwood';
    canopyElement = 'moss_velvet_mantle';
  } else if (mentionsBubbleUmbel) {
    canopyElement = 'spherical_bubble_umbel';
    if (stemStructure === 'gnarled_bonsai' || stemStructure === 'sympodial_tree') {
      stemStructure = 'herbaceous_curved_stalk';
    }
  } else if (mentionsHangingBells && canopyElement === 'custom_flower_corolla') {
    canopyElement = 'hanging_bell_cluster';
  } else if (mentionsStarburstFloret && canopyElement === 'custom_flower_corolla') {
    canopyElement = 'radiating_floret_head';
  } else if (mentionsCrystalCrown && canopyElement !== 'crystal_prism_crown') {
    canopyElement = 'crystal_prism_crown';
  } else if (mentionsChalicePitcher && canopyElement === 'custom_flower_corolla') {
    canopyElement = 'carnivorous_nepenthes_pitchers';
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
      : 'iridescent_bubble'
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
    petalOpenness: clamp(ce.petalOpenness, 0.05, 1.0, 0.35),
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
  if (canopyElement === 'spherical_bubble_umbel' || mentionsBubbleUmbel) {
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

  if (canopyElement === 'moss_velvet_mantle' || mentionsMossyDeadwoodTrunk) {
    colorTrunk = '#583e2a';
    colorLeafMain = '#4a7c1d';
    colorLeafTip = '#7cb524';
    colorFlower = '#5c8f22';
    colorAccent = '#8ec435';
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

  const isBubbleUmbelFlower =
    notes.includes('burbuja') ||
    notes.includes('bubble') ||
    notes.includes('iridisc') ||
    notes.includes('diente de le') ||
    notes.includes('allium') ||
    notes.includes('rocío') ||
    notes.includes('esfera') ||
    archetype === 'umbel_bubble_flower' ||
    (typeof vf.iridescentScore === 'number' && vf.iridescentScore >= 0.52 && vf.hasGreenBasalStem);

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

  const isFungiUmbelColony =
    notes.includes('hongo') ||
    notes.includes('seta') ||
    notes.includes('umbela') ||
    notes.includes('espora') ||
    notes.includes('colonia') ||
    notes.includes('micel') ||
    archetype === 'fungi_umbel_colony' ||
    (vf.dominantHueCategory === 'golden' &&
      (vf.isDarkSceneBg || (typeof vf.upperCapIslands === 'number' && vf.upperCapIslands >= 1.6)));

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

  // 2. CAPULLO FLORAL / COROLA ESCULTÓRICA SOBRE TALLO TRENZADO
  if (isBudOrLotus) {
    const openness = clamp(
      typeof vf.upperWidthRatio === 'number' ? (vf.upperWidthRatio - 0.2) * 1.1 : 0.25,
      0.15,
      0.85,
      0.28
    );
    return sanitizeAiPayload(
      {
        identifiedName: 'Capullo Floral Trenzado',
        scientificName: 'Xenolotus purpureus',
        reasoningSummary:
          'Capullo floral acopado de pétalos cóncavos carmesí-violáceos con estambres interiores soldado sobre un tallo de fibras leñosas trenzadas y raíces.',
        recommendedBase: 'exoplanetary_crater',
        recommendedBg: 'dark_studio',
        customElement: {
          name: 'Capullo Floral sobre Tallo Trenzado',
          stemStructure: 'gnarled_bonsai',
          canopyElement: 'custom_flower_corolla',
          surfaceElement: 'braided_vines',
          hangingElement: 'curling_tendrils',
          spiralTurns: 1.25,
          spiralArms: 1,
          stemCount: 1,
          trunkBentS: clamp(vf.trunkSCurve, 0.2, 0.75, 0.38),
          petalOpenness: openness,
          thornDensity: 0.45,
          thornLength: 1.0,
          filamentCount: 14,
          filamentLength: 0.9,
          padLayers: 1,
          lobeCount: 9,
          cupDepth: 0.78,
        },
        params: {
          engine: 'composed_custom',
          foliageType: 'ai_custom_element',
          tonalMode: 'natural_botanical',
          height: 4.8,
          radius: 0.36,
          gnarl: 0.52,
          leafScale: 1.25,
          leafDensity: 5,
          showRoots: true,
          colorTrunk: vf.colorTrunk || '#4a3528',
          colorLeafMain: vf.colorLeafMain || '#9f1239',
          colorLeafTip: vf.colorLeafTip || '#fb7185',
          colorFlower: vf.colorFlower || '#e11d48',
          colorAccent: vf.colorAccent || '#fda4af',
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
    "canopyElement": "moss_velvet_mantle | scifi_biolum_plasma_globes | scifi_voronoi_ova_balloons | fenestrated_monstera_leaves | palmate_maple_star_leaves | pinnate_fern_palm_fronds | succulent_fleshy_rosettes | conifer_needle_brushes | lotus_magnolia_corolla_crown | passionflower_filament_corona | heliconia_bract_candelabra | dehiscent_seed_pods_coronas | carnivorous_nepenthes_pitchers | spherical_bubble_umbel | radiating_floret_head | hanging_bell_cluster | crystal_prism_crown | procedural_lathe_head | custom_fungi_cap | custom_leaf_lamina | custom_flower_corolla | cloud_bonsai_pads | thorn_spur_clusters | stem_hugging_leaves",
    "surfaceElement": "strangler_root_web | rose_hooked_prickles | cactus_areole_spine_bursts | armored_dragon_scales | shelf_fungi_conks | biolum_nodule_pustules | smooth_striated | moss_lichen_bark | braided_vines | curved_thorns_spines",
    "hangingElement": "aerial_root_curtains | winged_samara_seeds | tethered_scifi_lantern_globes | spanish_moss_epiphyte_drapes | thorny_barbed_whips | weeping_filaments | curling_tendrils | mycelial_fuzz | hanging_pods_berries | none",
    "synthesizedHeadTopology": "spherical_umbel_rays | layered_petal_starburst | hanging_bell_raceme | revolved_lathe_chalice | crystal_spire_cluster | none",
    "synthesizedTipPrimitive": "bryophyte_moss_pad | scifi_plasma_orb | spiked_seed_burr | winged_helicoid_seed | crowned_pomegranate_pod | recurved_thorn_claw | feathery_pappus_plume | sucker_tentacle_cup | iridescent_bubble | dewy_droplet | micro_floret_star | cupped_bell_calyx | faceted_crystal_gem | spotted_spore_dome | lanceolate_blade | none",
    "synthesizedBasalFoliage": "long_grass_blades | broad_rosette_leaves | spiny_succulent_claws | fern_fiddleheads | baby_umbel_sprouts | none",
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
    const { imageBase64, mimeType, userNotes, visionFeatures, aiConfig } = req.body || {};
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
      ? `\nAnálisis morfológico 2D de la imagen: arquetipoDetectado=${visionFeatures.detectedArchetype}, scoreIridiscencia=${visionFeatures.iridescentScore ?? 0}, talloVerdeBasal=${visionFeatures.hasGreenBasalStem ?? false}, tronco=${visionFeatures.colorTrunk}, colorPrincipal=${visionFeatures.colorLeafMain}, colorPunta=${visionFeatures.colorLeafTip}, colorFlor=${visionFeatures.colorFlower}, acento=${visionFeatures.colorAccent}.`
      : '';


    // ─────────────────────────────────────────────────────────────────────────
    // OPTION 1: OFFLINE LOCAL COMPUTER VISION ENGINE (Instant, Zero LLM)
    // ─────────────────────────────────────────────────────────────────────────
    if (provider === 'local_vision_offline') {
      const synthesized = buildVisionFallbackPayload(visionFeatures, userNotes);
      res.json({ result: synthesized, providerUsed: 'local_vision_offline' });
      return;
    }

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
        const ollamaRes = await fetch(`${ollamaBase}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: ollamaModel,
            stream: false,
            format: 'json',
            options: { temperature },
            messages: [
              {
                role: 'system',
                content: `${BOTANICAL_SYSTEM_PROMPT}\n\n${LOCAL_JSON_PROMPT_TEMPLATE}`,
              },
              {
                role: 'user',
                content: `Analiza esta imagen de planta/árbol y devuelve el JSON de configuración 3D.${visionHint}${notesBlock}`,
                images: [cleanBase64],
              },
            ],
          }),
          signal: AbortSignal.timeout(45000),
        });

        if (!ollamaRes.ok) {
          const errText = await ollamaRes.text().catch(() => '');
          throw new Error(
            `Ollama (${ollamaModel}) respondió con HTTP ${ollamaRes.status}: ${errText.slice(0, 140)}`
          );
        }

        const ollamaData: any = await ollamaRes.json();
        const rawContent = ollamaData?.message?.content || ollamaData?.response || '';
        const parsed = extractJsonFromText(rawContent);
        const sanitized = sanitizeAiPayload(parsed, visionFeatures);
        res.json({ result: sanitized, providerUsed: `Ollama (${ollamaModel})` });
        return;
      } catch (err: any) {
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
          providerUsed: 'Visión Local (Fallback tras Ollama no disponible)',
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
                content: `${BOTANICAL_SYSTEM_PROMPT}\n\n${LOCAL_JSON_PROMPT_TEMPLATE}`,
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
    // OPTION 4: CLOUD AI ENGINE (Default)
    // ─────────────────────────────────────────────────────────────────────────
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
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

    let lastErr: any = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await ai.models.generateContent({
          model: 'gemini-4-hydrogen',
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
          config: {
            systemInstruction: BOTANICAL_SYSTEM_PROMPT,
            responseMimeType: 'application/json',
            responseSchema: PLANT_DESIGN_SCHEMA,
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          },
        });

        const rawText = response.text;
        if (rawText) {
          const parsed = JSON.parse(rawText);
          const sanitized = sanitizeAiPayload(parsed, visionFeatures);
          res.json({ result: sanitized, providerUsed: 'Cloud Vision IA' });
          return;
        }
      } catch (err: any) {
        lastErr = err;
        console.warn(`Intento ${attempt + 1} en /api/ai/design-plant:`, err?.status || err?.message);
        if (attempt === 0) {
          await new Promise((r) => setTimeout(r, 450));
        }
      }
    }

    console.warn('Usando síntesis morfológica por visión artificial tras saturación 503:', lastErr?.message);
    const synthesized = buildVisionFallbackPayload(visionFeatures, userNotes);
    res.json({ result: synthesized, providerUsed: 'Síntesis Morfológica Local' });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
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
