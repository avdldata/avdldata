import { SEED_INGREDIENTS, SEED_INGREDIENT_ALIASES } from '@/data/seed/ingredients';
import { normalise } from '@/domain/ingestion/match-ingredient';
import { cleanName } from './ingredient-line';

/**
 * A recipe's ingredient line → one of our canonical ingredients.
 *
 * Two things make this harder than it sounds, and both are handled by refusing
 * rather than by cleverness.
 *
 * **The corpora are English and the catalogue is Dutch.** So there is a
 * translation table, written by hand, one entry per concept. A table is boring
 * and auditable; a fuzzy string metric across languages is neither, and it
 * would happily map "leek" onto "lek".
 *
 * **A recipe ingredient is not a product.** The flow is deliberately
 *
 *     raw recipe ingredient → canonical ingredient → retail product
 *
 * and never recipe → product. A recipe that says "chicken thighs" must land on
 * the canonical `kipdijfilet` and let the existing product matcher decide which
 * pack to buy, because that is the layer that already knows about pack sizes,
 * brand words and the difference between a garlic bulb and a clove.
 *
 * Precision over recall, as everywhere else on the ingestion side. An
 * unmatched line costs a recipe its score; a wrongly matched one puts the wrong
 * food on someone's plate.
 */

export type MatchKind =
  /** The line names a canonical ingredient we already have. */
  | 'EXACT'
  /** A known synonym or translation of one we have. */
  | 'SAFE_ALIAS'
  /** A real dinner ingredient we do not model yet. */
  | 'NEEDS_NEW_CANONICAL'
  /** Could be two different ingredients; refused. */
  | 'AMBIGUOUS'
  /** Not an ingredient a planner should buy (water, garnish, "to taste"). */
  | 'REJECT';

export interface IngredientMatch {
  readonly kind: MatchKind;
  readonly ingredientId?: string;
  /**
   * Which variant the line named, when it named one.
   *
   * "Risotto rice" is not "rice": carrying the variant here is what lets the
   * compatibility layer refuse long-grain later. Dropping it would turn a
   * specific requirement into a general one, which is the one direction the
   * taxonomy forbids.
   */
  readonly variantId?: string;
  /** The concept we think it is, when we have no canonical for it yet. */
  readonly concept?: string;
  readonly normalised: string;
}

/**
 * English (and occasionally Dutch) ingredient words → our canonical ids.
 *
 * Ordered longest-key-first at match time, so "spring onion" wins over "onion"
 * and "sweet potato" over "potato". That ordering is the whole reason this is a
 * table lookup with explicit keys rather than a set of regexes.
 */
const TO_CANONICAL: Readonly<Record<string, string>> = {
  // groente
  onion: 'ui',
  onions: 'ui',
  ui: 'ui',
  'yellow onion': 'ui',
  'red onion': 'rode-ui',
  'spring onion': 'bosui',
  'green onion': 'bosui',
  scallion: 'bosui',
  scallions: 'bosui',
  shallot: 'ui',
  shallots: 'ui',
  garlic: 'knoflook',
  'garlic clove': 'knoflook',
  'garlic cloves': 'knoflook',
  knoflook: 'knoflook',
  carrot: 'wortel',
  carrots: 'wortel',
  wortel: 'wortel',
  broccoli: 'broccoli',
  cauliflower: 'bloemkool',
  bloemkool: 'bloemkool',
  courgette: 'courgette',
  zucchini: 'courgette',
  aubergine: 'aubergine',
  eggplant: 'aubergine',
  'red pepper': 'paprika-rood',
  'red bell pepper': 'paprika-rood',
  'bell pepper': 'paprika-rood',
  paprika: 'paprika-rood',
  'yellow bell pepper': 'paprika-geel',
  tomato: 'tomaat',
  tomatoes: 'tomaat',
  tomaat: 'tomaat',
  'cherry tomatoes': 'cherrytomaat',
  'cherry tomato': 'cherrytomaat',
  mushroom: 'champignons',
  mushrooms: 'champignons',
  champignons: 'champignons',
  'cremini mushrooms': 'champignons',
  'button mushrooms': 'champignons',
  spinach: 'spinazie',
  spinazie: 'spinazie',
  'green beans': 'sperziebonen',
  'string beans': 'sperziebonen',
  sperziebonen: 'sperziebonen',
  leek: 'prei',
  leeks: 'prei',
  prei: 'prei',
  potato: 'aardappel',
  potatoes: 'aardappel',
  aardappel: 'aardappel',
  aardappelen: 'aardappel',
  'sweet potato': 'zoete-aardappel',
  'sweet potatoes': 'zoete-aardappel',
  cucumber: 'komkommer',
  komkommer: 'komkommer',
  lettuce: 'ijsbergsla',
  'iceberg lettuce': 'ijsbergsla',
  rocket: 'rucola',
  arugula: 'rucola',
  rucola: 'rucola',
  avocado: 'avocado',
  lemon: 'citroen',
  'lemon juice': 'citroen',
  citroen: 'citroen',
  lime: 'limoen',
  'lime juice': 'limoen',
  limoen: 'limoen',
  cabbage: 'spitskool',
  'pointed cabbage': 'spitskool',
  kale: 'boerenkool',
  boerenkool: 'boerenkool',
  endive: 'andijvie',
  pumpkin: 'pompoen',
  squash: 'pompoen',
  peas: 'doperwten',
  'green peas': 'doperwten',
  doperwten: 'doperwten',
  ginger: 'gember',
  'fresh ginger': 'gember',
  gember: 'gember',
  'bean sprouts': 'tauge',
  tauge: 'tauge',
  apple: 'appel',
  apples: 'appel',
  fennel: 'venkel',
  'red chili': 'rode-peper',
  'red chilli': 'rode-peper',
  chili: 'rode-peper',
  chilli: 'rode-peper',
  chile: 'rode-peper',
  jalapeno: 'rode-peper',

  // vlees, vis, vega
  chicken: 'kipfilet',
  'chicken breast': 'kipfilet',
  'chicken breasts': 'kipfilet',
  kipfilet: 'kipfilet',
  'chicken thigh': 'kipdijfilet',
  'chicken thighs': 'kipdijfilet',
  kipdijfilet: 'kipdijfilet',
  'ground beef': 'gehakt-rund',
  'minced beef': 'gehakt-rund',
  rundergehakt: 'gehakt-rund',
  'ground meat': 'gehakt-half',
  mince: 'gehakt-half',
  gehakt: 'gehakt-half',
  'beef stew meat': 'runderstoof',
  'stewing beef': 'runderstoof',
  'chuck roast': 'runderstoof',
  'pork tenderloin': 'varkenshaas',
  varkenshaas: 'varkenshaas',
  bacon: 'spekblokjes',
  pancetta: 'spekblokjes',
  spek: 'spekblokjes',
  spekblokjes: 'spekblokjes',
  salmon: 'zalmfilet',
  'salmon fillet': 'zalmfilet',
  zalm: 'zalmfilet',
  'smoked salmon': 'gerookte-zalm',
  tuna: 'tonijn-blik',
  'canned tuna': 'tonijn-blik',
  tonijn: 'tonijn-blik',
  'tuna steak': 'tonijnsteak',
  cod: 'kabeljauw',
  'cod fillet': 'kabeljauw',
  kabeljauw: 'kabeljauw',
  'white fish': 'kabeljauw',
  shrimp: 'garnalen',
  prawns: 'garnalen',
  garnalen: 'garnalen',
  egg: 'ei',
  eggs: 'ei',
  ei: 'ei',
  eieren: 'ei',
  tofu: 'tofu',
  tempeh: 'tempeh',
  falafel: 'falafel',

  // zuivel
  milk: 'melk',
  melk: 'melk',
  'whole milk': 'melk',
  yogurt: 'yoghurt',
  yoghurt: 'yoghurt',
  'greek yogurt': 'griekse-yoghurt',
  'greek yoghurt': 'griekse-yoghurt',
  cream: 'kookroom',
  'heavy cream': 'kookroom',
  'double cream': 'kookroom',
  room: 'kookroom',
  'creme fraiche': 'creme-fraiche',
  'sour cream': 'creme-fraiche',
  'grated cheese': 'geraspte-kaas',
  cheese: 'geraspte-kaas',
  kaas: 'geraspte-kaas',
  cheddar: 'geraspte-kaas',
  gruyere: 'geraspte-kaas',
  parmesan: 'parmezaan',
  'parmigiano reggiano': 'parmezaan',
  parmezaan: 'parmezaan',
  pecorino: 'parmezaan',
  mozzarella: 'mozzarella',
  feta: 'feta',
  'blue cheese': 'blauwe-kaas',
  gorgonzola: 'blauwe-kaas',
  butter: 'roomboter',
  'unsalted butter': 'roomboter',
  boter: 'roomboter',
  roomboter: 'roomboter',
  quark: 'kwark',
  kwark: 'kwark',

  // granen
  spaghetti: 'spaghetti',
  penne: 'penne',
  macaroni: 'macaroni',
  'lasagna noodles': 'lasagnebladen',
  'lasagne sheets': 'lasagnebladen',
  lasagnebladen: 'lasagnebladen',
  rice: 'witte-rijst',
  'white rice': 'witte-rijst',
  rijst: 'witte-rijst',
  'basmati rice': 'basmatirijst',
  basmati: 'basmatirijst',
  'brown rice': 'zilvervliesrijst',
  couscous: 'couscous',
  bulgur: 'bulgur',
  quinoa: 'quinoa',
  'egg noodles': 'mie',
  noodles: 'mie',
  mie: 'mie',
  tortillas: 'wraps',
  'flour tortillas': 'wraps',
  wraps: 'wraps',
  'pita bread': 'pitabrood',
  pita: 'pitabrood',
  baguette: 'stokbrood',
  stokbrood: 'stokbrood',
  breadcrumbs: 'paneermeel',
  paneermeel: 'paneermeel',
  flour: 'bloem',
  'all purpose flour': 'bloem',
  bloem: 'bloem',

  // conserven
  'canned tomatoes': 'tomatenblokjes',
  'chopped tomatoes': 'tomatenblokjes',
  'diced tomatoes': 'tomatenblokjes',
  'crushed tomatoes': 'tomatenblokjes',
  tomatenblokjes: 'tomatenblokjes',
  passata: 'passata',
  'tomato puree': 'tomatenpuree',
  'tomato paste': 'tomatenpuree',
  tomatenpuree: 'tomatenpuree',
  'coconut milk': 'kokosmelk',
  kokosmelk: 'kokosmelk',
  chickpeas: 'kikkererwten',
  'garbanzo beans': 'kikkererwten',
  kikkererwten: 'kikkererwten',
  'kidney beans': 'kidneybonen',
  kidneybonen: 'kidneybonen',
  'black beans': 'zwarte-bonen',
  'brown beans': 'bruine-bonen',
  lentils: 'linzen',
  'red lentils': 'linzen',
  linzen: 'linzen',
  corn: 'mais',
  'sweet corn': 'mais',
  mais: 'mais',
  olives: 'olijven',
  olijven: 'olijven',
  'sun dried tomatoes': 'zongedroogde-tomaten',

  // kruiden, oliën, sauzen
  salt: 'zout',
  'kosher salt': 'zout',
  'sea salt': 'zout',
  zout: 'zout',
  pepper: 'peper',
  'black pepper': 'peper',
  peper: 'peper',
  'olive oil': 'olijfolie',
  'extra virgin olive oil': 'olijfolie',
  olijfolie: 'olijfolie',
  'vegetable oil': 'zonnebloemolie',
  'sunflower oil': 'zonnebloemolie',
  'neutral oil': 'zonnebloemolie',
  'soy sauce': 'sojasaus',
  sojasaus: 'sojasaus',
  tamari: 'sojasaus',
  'kecap manis': 'ketjap',
  ketjap: 'ketjap',
  sambal: 'sambal',
  'red curry paste': 'rode-currypasta',
  'curry paste': 'rode-currypasta',
  'paprika powder': 'paprikapoeder',
  'smoked paprika': 'paprikapoeder',
  paprikapoeder: 'paprikapoeder',
  cumin: 'komijn',
  'ground cumin': 'komijn',
  komijn: 'komijn',
  'curry powder': 'kerriepoeder',
  turmeric: 'kurkuma',
  kurkuma: 'kurkuma',
  'italian herbs': 'italiaanse-kruiden',
  oregano: 'oregano',
  'chili powder': 'chilipoeder',
  cinnamon: 'kaneel',
  kaneel: 'kaneel',
  'vegetable stock': 'groentebouillon',
  'vegetable broth': 'groentebouillon',
  'stock cube': 'groentebouillon',
  groentebouillon: 'groentebouillon',
  parsley: 'verse-peterselie',
  peterselie: 'verse-peterselie',
  basil: 'verse-basilicum',
  basilicum: 'verse-basilicum',
  cilantro: 'verse-koriander',
  coriander: 'verse-koriander',
  koriander: 'verse-koriander',
  mustard: 'mosterd',
  'dijon mustard': 'mosterd',
  mosterd: 'mosterd',
  honey: 'honing',
  honing: 'honing',
  'peanut butter': 'pindakaas',
  pindakaas: 'pindakaas',
  'sesame seeds': 'sesamzaad',
  walnuts: 'walnoten',
  walnoten: 'walnoten',
  cashews: 'cashewnoten',
  'cashew nuts': 'cashewnoten',
  // Discovered by running the corpora: concepts that turned up in the missing
  // list but are things we already model under a Dutch name.
  'bread crumbs': 'paneermeel',
  breadcrumb: 'paneermeel',
  panko: 'paneermeel',
  'olive oil extra virgin': 'olijfolie',
  'sesame oil': 'sesamzaad',
  'chicken stock': 'groentebouillon',
  'chicken broth': 'groentebouillon',
  'beef stock': 'groentebouillon',
  'beef broth': 'groentebouillon',
  bouillon: 'groentebouillon',
  'stock cubes': 'groentebouillon',
  'plum tomatoes': 'tomaat',
  'roma tomatoes': 'tomaat',
  'baby spinach': 'spinazie',
  'new potatoes': 'aardappel',
  'waxy potatoes': 'aardappel',
  'floury potatoes': 'aardappel',
  'long grain rice': 'witte-rijst',
  'jasmine rice': 'basmatirijst',
  'wholemeal pasta': 'penne',
  'whole wheat pasta': 'penne',
  'chilli flakes': 'chilipoeder',
  'red pepper flakes': 'chilipoeder',
  'cayenne pepper': 'chilipoeder',
  // Taxonomie-uitbreiding: de nieuwe concepten, zoals een Engelstalig recept
  // ze schrijft.
  pasta: 'pasta',
  'dried pasta': 'pasta',
  asparagus: 'asperges',
  asperges: 'asperges',
  'goat cheese': 'geitenkaas',
  'goats cheese': 'geitenkaas',
  geitenkaas: 'geitenkaas',
  hummus: 'hummus',
  houmous: 'hummus',
  pesto: 'pesto',
  'basil pesto': 'pesto',
  'pasta sauce': 'pastasaus',
  marinara: 'pastasaus',
  'marinara sauce': 'pastasaus',
  pastasaus: 'pastasaus',
  'peanut sauce': 'satesaus',
  'satay sauce': 'satesaus',
  satesaus: 'satesaus',
  sriracha: 'sriracha',
  'taco seasoning': 'taco-kruidenmix',
  'smoked sausage': 'rookworst',
  rookworst: 'rookworst',
  shoarma: 'shoarmavlees',
  shoarmavlees: 'shoarmavlees',
  'corn tortilla': 'maistortilla',
  'corn tortillas': 'maistortilla',
  maistortilla: 'maistortilla',
  'stir fry vegetables': 'roerbakgroentemix',
  'stir-fry vegetables': 'roerbakgroentemix',
  roerbakgroentemix: 'roerbakgroentemix',
  vinegar: 'azijn',
  'white wine vinegar': 'azijn',
  'red wine vinegar': 'azijn',
  azijn: 'azijn',
};

/**
 * Recipe words that name a *variant* rather than an ingredient.
 *
 * Mapped to the parent plus the variant id, so "fusilli" becomes pasta-as-
 * fusilli and "arborio" becomes rice-as-risotto-rice. The second one is the
 * reason this table exists at all: mapping arborio to plain rice would let a
 * risotto be planned with long-grain, silently.
 */
const TO_VARIANT: Readonly<Record<string, { ingredientId: string; variantId: string }>> = {
  fusilli: { ingredientId: 'pasta', variantId: 'fusilli' },
  tagliatelle: { ingredientId: 'pasta', variantId: 'tagliatelle' },
  orzo: { ingredientId: 'pasta', variantId: 'orzo' },
  rigatoni: { ingredientId: 'pasta', variantId: 'rigatoni' },
  farfalle: { ingredientId: 'pasta', variantId: 'farfalle' },
  'risotto rice': { ingredientId: 'rijst', variantId: 'risottorijst' },
  arborio: { ingredientId: 'rijst', variantId: 'risottorijst' },
  'arborio rice': { ingredientId: 'rijst', variantId: 'risottorijst' },
  carnaroli: { ingredientId: 'rijst', variantId: 'risottorijst' },
  'pandan rice': { ingredientId: 'rijst', variantId: 'pandanrijst' },
  'frozen spinach': { ingredientId: 'spinazie', variantId: 'spinazie-diepvries' },
  'baby potatoes': { ingredientId: 'aardappel', variantId: 'krieltjes' },
  krieltjes: { ingredientId: 'aardappel', variantId: 'krieltjes' },
};

/**
 * Concepts a dinner planner should not buy.
 *
 * Water is free and comes out of a tap. "To taste" is not an amount. Garnishes
 * and the cook's own equipment are not shopping-list lines. Putting these on a
 * list would be worse than useless: it would make the list look careless and
 * the totals wrong.
 */
const REJECTED =
  /^(?:(?:\d+[\s\d/.,]*)?(?:l|liter|liters|litre|litres|ml|dl|cl|g|kg|cup|cups|quart|quarts|pint|pints)\s+)?(?:cold|hot|warm|boiling|iced|lukewarm|ice)?\s*(?:water|ice|ice cubes)$|^(?:to taste|salt and pepper|salt & pepper|seasoning|garnish|for serving|for garnish|cooking spray|nonstick spray|parchment|toothpicks|kitchen twine|foil|skewers|as needed|optional|nothing|more|extra)$/i;

/**
 * Words that mean the line names two different foods at once.
 *
 * "salt and pepper" is a real line in real corpora, and mapping it to either
 * one is wrong in a way that compounds: the shopping list then says 8 g of salt
 * when the recipe wanted both.
 */
const AMBIGUOUS_JOIN = /\b(and|or|en|of)\b/;

const CANONICAL_IDS = new Set(SEED_INGREDIENTS.map((i) => i.id));
const CANONICAL_BY_NAME = new Map(
  SEED_INGREDIENTS.map((i) => [normalise(i.canonicalName), i.id] as const),
);
/** Longest first, so a two-word concept beats the one-word one inside it. */
const LOOKUP_KEYS = Object.keys(TO_CANONICAL).sort((a, b) => b.length - a.length);
/** The catalogue's own Dutch synonyms ("uien", "teentje knoflook"), exact only. */
const ALIAS_BY_NAME = new Map(
  SEED_INGREDIENT_ALIASES.map((a) => [normalise(a.alias), a.ingredientId] as const),
);

/**
 * The Dutch singular a plural could have come from — for exact lookups only.
 *
 * Only the last word changes, and a candidate counts only when it is exactly a
 * canonical name or alias. That is what keeps this precise: "aubergines" finds
 * "aubergine", while "semi zongedroogde tomaten" finds nothing, because no
 * canonical ingredient is called "semi zongedroogde tomaat" — and falling back
 * to plain tomato there would put fresh tomatoes on the list for a jar of
 * sun-dried ones.
 */
function dutchSingulars(name: string): string[] {
  const words = name.split(' ');
  const last = words.pop() ?? '';
  const head = words.length > 0 ? `${words.join(' ')} ` : '';
  const forms: string[] = [];
  if (last.endsWith('s')) forms.push(last.slice(0, -1)); // aubergines, paprika s → paprika
  if (last.endsWith('en') && last.length > 4) {
    const stem = last.slice(0, -2); // wortelen → wortel, uien → ui
    forms.push(stem);
    // tomaten → tomaat, bonen → boon: the vowel was doubled away in the plural.
    const open = /^(.*[^aeiou])([aeiou])([^aeiou])$/.exec(stem);
    if (open) forms.push(`${open[1]}${open[2]}${open[2]}${open[3]}`);
    // sjalotten → sjalot: the consonant was doubled in the plural.
    if (/([^aeiou])\1$/.test(stem)) forms.push(stem.slice(0, -1));
  }
  return forms.map((form) => `${head}${form}`);
}

function exactCanonical(name: string): string | undefined {
  const key = normalise(name);
  return CANONICAL_BY_NAME.get(key) ?? (CANONICAL_IDS.has(key) ? key : ALIAS_BY_NAME.get(key));
}

/**
 * A unit word that survived the line parser.
 *
 * The archive writes "500 g sugar" and "1 teaspoon sugar", and each corpus
 * parser strips what it knows about. Doing it once more here, at the point
 * where a concept name is decided, means a new corpus cannot reintroduce
 * "g sugar" as a missing ingredient — which is exactly what the first run of
 * the report produced.
 */
const LEADING_UNIT =
  /^(?:g|gr|gram|grams|kg|ml|cl|dl|l|liter|liters|litre|litres|oz|ounce|ounces|lb|lbs|pound|pounds|cup|cups|cupful|cupfuls|tsp|teaspoon|teaspoons|teaspoonful|teaspoonfuls|tbsp|tablespoon|tablespoons|tablespoonful|tablespoonfuls|pint|pints|quart|quarts|spoonful|spoonfuls|gill|gills|dram|drams|el|tl|eetlepels?|theelepels?|teentjes?|tenen|teen)\s+(?:of\s+)?/i;

export function matchCanonicalIngredient(rawName: string): IngredientMatch {
  const cleaned = cleanName(rawName).replace(LEADING_UNIT, '').trim();
  const normalised = normalise(cleaned);

  if (normalised === '') return { kind: 'REJECT', normalised };
  if (REJECTED.test(cleaned.trim())) return { kind: 'REJECT', normalised };

  const direct = CANONICAL_BY_NAME.get(normalised);
  if (direct) return { kind: 'EXACT', ingredientId: direct, normalised };
  if (CANONICAL_IDS.has(normalised)) return { kind: 'EXACT', ingredientId: normalised, normalised };

  // Variants are checked before the plain table, so "risotto rice" cannot fall
  // through to "rice" and lose the very thing that makes it specific.
  const variant = TO_VARIANT[cleaned];
  if (variant) {
    return {
      kind: 'SAFE_ALIAS',
      ingredientId: variant.ingredientId,
      variantId: variant.variantId,
      normalised,
    };
  }

  const exactKey = TO_CANONICAL[cleaned];
  if (exactKey) return { kind: 'SAFE_ALIAS', ingredientId: exactKey, normalised };

  // The catalogue's own Dutch synonyms, then Dutch plurals of the whole name.
  // Both exact, both before the substring search below.
  const alias = ALIAS_BY_NAME.get(normalised);
  if (alias) return { kind: 'SAFE_ALIAS', ingredientId: alias, normalised };
  for (const singular of dutchSingulars(normalised)) {
    const id = exactCanonical(singular);
    if (id) return { kind: 'SAFE_ALIAS', ingredientId: id, normalised };
  }

  // A substring hit, longest key first. Guarded by the ambiguity check, so a
  // line naming two foods is refused rather than resolved to the first.
  const hits = LOOKUP_KEYS.filter((key) => new RegExp(`\\b${key}\\b`).test(cleaned));
  if (hits.length > 0) {
    const ids = new Set(hits.map((key) => TO_CANONICAL[key]!));
    if (ids.size === 1) return { kind: 'SAFE_ALIAS', ingredientId: [...ids][0]!, normalised };
    if (AMBIGUOUS_JOIN.test(cleaned)) return { kind: 'AMBIGUOUS', normalised };
    // Several concepts, no conjunction: the longest key is the head noun.
    return { kind: 'SAFE_ALIAS', ingredientId: TO_CANONICAL[hits[0]!]!, normalised };
  }

  if (AMBIGUOUS_JOIN.test(cleaned)) return { kind: 'AMBIGUOUS', normalised };
  return { kind: 'NEEDS_NEW_CANONICAL', concept: normalised, normalised };
}
