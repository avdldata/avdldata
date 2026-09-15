/**
 * The words that decide whether a product is still the ingredient.
 *
 * Kept as data rather than as conditionals inside the matcher, because this is
 * the part that will keep changing: every new shop, every new season brings
 * words nobody thought of. A rule buried in an `if` is a rule nobody can
 * review; a list can be read, argued with, and extended by someone who knows
 * groceries rather than TypeScript.
 *
 * Three classes, and the difference between them is the whole matcher:
 *
 *   IGNORABLE     says nothing about what the food is — the shop's brand, a
 *                 quality claim, a pack size. "AH Terra Biologische tofu" is
 *                 tofu.
 *   PRESERVING    changes the form, not the food. Sliced onion is onion; grated
 *                 cheese is cheese; unsalted butter is butter.
 *   DISQUALIFYING names a different food. Garlic croutons are not garlic,
 *                 however much garlic is in them.
 *
 * Anything not in any of these lists is treated as unknown, and unknown means
 * review. That is the conservative default: the matcher never assumes a word it
 * has not been taught is harmless.
 */

/** Brands seen in the Dutch data. Never change what a product *is*. */
export const BRAND_WORDS: ReadonlySet<string> = new Set([
  'ah',
  'jumbo',
  'plus',
  'spar',
  'dirk',
  'coop',
  'aldi',
  'lidl',
  'vomar',
  'poiesz',
  'hoogvliet',
  'dekamarkt',
  'terra',
  'greenfields',
  'excellent',
  'biogarde',
  'conimex',
  'kikkoman',
  'go',
  'tan',
  'gotan',
  'dodoni',
  'duru',
  'verstegen',
  'euroma',
  'maggi',
  'garden',
  'gourmet',
  'biofan',
  'santa',
  'maria',
  'mamas',
  'fairtrade',
  'original',
  'knorr',
  'honig',
  'calve',
  'iglo',
  'bonduelle',
  'danish',
  'blue',
  'parmigiano',
  'reggiano',
  'trade',
  'mark',
  'mama',
  'mamas',
  'streeckgenoten',
  'oma',
  'omas',
  // A-brands. Albert Heijn's catalogue is mostly private label, so these only
  // showed up once Jumbo was measured — but they block matches in both chains.
  // Every one of them was checked against the products it would newly approve:
  // a brand word is only harmless when what is left after removing it is still
  // the ingredient. "Van de Boom" (apple juice) and "Drogheria" (ground spices)
  // failed that check and are deliberately absent — see MATCHING.md.
  'arla',
  'bertolli',
  'campina',
  'carapelli',
  'daawat',
  'dari',
  'efendi',
  'galbani',
  'grand',
  'hak',
  'heinz',
  'italia',
  'kanzi',
  'lassie',
  'lurpak',
  'president',
]);

/**
 * Dutch function words. They appear in the middle of perfectly ordinary names
 * — "rauw en gepeld", "verlaagd in zout" — and carry no information about what
 * the food is. Left unclassified they would send valid matches to review for no
 * reason at all.
 */
export const STOPWORDS: ReadonlySet<string> = new Set([
  'en',
  'in',
  'met',
  'van',
  'de',
  'het',
  'der',
  'aan',
  'op',
  'voor',
  'of',
  'uit',
  'bij',
  'te',
  'tot',
  'zoet',
  'zoete',
  // "aardappelen iets kruimig" — a hedge, not a property of the food.
  'iets',
]);

/**
 * Retail packaging and marketing words. Pack counts, size claims, quality
 * claims — all noise for the question "what food is this".
 */
export const RETAIL_WORDS: ReadonlySet<string> = new Set([
  'biologisch',
  'biologische',
  'bio',
  'scharrel',
  'huismerk',
  'voordeel',
  'voordeelverpakking',
  'grootverpakking',
  'kleinverpakking',
  'verpakking',
  'pack',
  'stuks',
  'stuk',
  'st',
  'gram',
  'kg',
  'g',
  'ml',
  'l',
  'per',
  'nl',
  'hollandse',
  'hollands',
  'griekse',
  'grieks',
  'luxe',
  'premium',
  'basic',
  'family',
  'jumboverpakking',
  'zak',
  'zakje',
  'doos',
  'pak',
  'fles',
  'pot',
  'blik',
  'kuipje',
  'bakje',
  'tray',
  'net',
  's',
  'm',
  'xl',
  // Size grades and multipack notation. Jumbo puts these in the name where AH
  // puts them in a separate size field.
  'x',
  'ca',
  'groot',
  'grote',
  'klein',
  'kleine',
  'middel',
  'medium',
  'voordeelpak',
  // Origin and product-line claims. "Classico", "Dolce" and "Authentieke" name
  // a variant of the same food, the way "Griekse" already did.
  'italiaanse',
  'authentieke',
  'classico',
  'dolce',
  'regular',
]);

/**
 * Preparation and variant words that keep the food substitutable.
 *
 * The judgement in this list is the heart of the matcher. Sliced, grated and
 * peeled are somebody else doing the knife work. Unsalted, low-salt, lactose-free
 * and fat percentages are variants of the same food. Freshness claims are claims.
 *
 * Deliberately *not* here: cooked, grilled, marinated, seasoned. Those are
 * arguable — a recipe that fries its own chicken does not want pre-grilled
 * chicken — so they stay unknown and land in review.
 */
export const PRESERVING_WORDS: ReadonlySet<string> = new Set([
  'gesneden',
  'fijngesneden',
  'grofgesneden',
  'voorgesneden',
  'geraspt',
  'geraspte',
  'gepeld',
  'geschild',
  'gebroken',
  'deelblokjes',
  'roosjes',
  'blokjes',
  'reepjes',
  'plakjes',
  'schijfjes',
  'partjes',
  'heel',
  'hele',
  'half',
  'halve',
  'fijn',
  'fijne',
  'grof',
  'grove',
  'mild',
  'naturel',
  'puur',
  'vers',
  'verse',
  'rauw',
  'rauwe',
  'ongezouten',
  'gezouten',
  'ongebrand',
  'zout',
  'zoutarm',
  'mager',
  'magere',
  'halfvol',
  'halfvolle',
  'vol',
  'volle',
  'light',
  'vet',
  'lactosevrij',
  'lactosevrije',
  'glutenvrij',
  'houdbaar',
  'houdbare',
  'minder',
  'verlaagd',
  'toegevoegd',
  'zonder',
  'extra',
  'vierge',
  'traditioneel',
  'vloeibaar',
  'vriesdroog',
  'volkoren',
  // Inflections and forms the Jumbo data proved were missing.
  'ongebrande',
  'vlugkokend',
  'vlugkokende',
  'snelkokend',
  'snelkokende',
  'platte',
  'eetrijp',
  'flinterdun',
  'mini',
  // "zonder pit", "op huid": what was left in or taken out, not another food.
  'pit',
  'huid',
  'wit',
  'witte',
  'bruin',
  'bruine',
  'rood',
  'rode',
  'geel',
  'gele',
  'groen',
  'groene',
  'zwart',
  'zwarte',
  'diepvries',
  'ingevroren',
  'elstar',
  'jonagold',
  'kruimig',
  'kruimige',
  'vastkokend',
  'vastkokende',
  'winterpeen',
  'belegen',
  'jong',
  'oud',
  'dijon',
  'manis',
]);

/**
 * Words that name a different food, or a preparation that has become one.
 *
 * Presence of any of these outside the matched ingredient is decisive: the
 * product is rejected rather than sent to review, because there is nothing for
 * a human to weigh up. Garlic croutons are bread.
 */
export const DISQUALIFYING_WORDS: ReadonlySet<string> = new Set([
  // prepared dishes and meal components
  'maaltijd',
  'maaltijdhapje',
  'maaltijdsalade',
  'maaltijdmix',
  'groentehapje',
  'verspakket',
  'stamppot',
  'stamppotje',
  'hutspot',
  'ovenschotel',
  'quiche',
  'pizza',
  'lasagne',
  'wok',
  'bolognese',
  'goreng',
  'potje',
  'kant',
  'klaar',
  'boreks',
  'gnocchi',
  'shoarma',
  // bakery and snacks
  'cake',
  'custardcakes',
  'koek',
  'koeken',
  'taart',
  'appeltaart',
  'croissant',
  'croutons',
  'stokbrood',
  'brood',
  'broodje',
  'digestive',
  'crackers',
  'wafels',
  'wafel',
  'rijstwafels',
  'maiswafels',
  'zoutjes',
  'rijstzoutjes',
  'chips',
  'pinda',
  'pindas',
  'reep',
  'snack',
  'shuttles',
  'flappen',
  'appelflappen',
  'nootjes',
  'borrel',
  // sauces, spreads, condiments made *from* the ingredient
  'soep',
  'saus',
  'sauzen',
  'ketchup',
  'mayonaise',
  'dressing',
  'marinade',
  'salademix',
  'spread',
  'moes',
  'appelmoes',
  'puree',
  'pesto',
  'dip',
  // drinks
  'sap',
  'sappen',
  'water',
  'mineraalwater',
  'limonade',
  'smoothie',
  'shake',
  'milkshake',
  'thee',
  'koffie',
  'wijn',
  'bier',
  'likeur',
  'advocaat',
  'chocolademelk',
  // flavour additions that make a base ingredient no longer plain
  'aardbei',
  'vanille',
  'stracciatella',
  'chocolade',
  'melkchocolade',
  'karamel',
  'honingmeloen',
  'munt',
  'peertjes',
  'kaneelsmaak',
  // other foods that commonly co-occur
  'worst',
  'braadworst',
  'grillworst',
  'rookworst',
  'salade',
  'aardappelsalade',
  'geitenkaas',
  'melange',
  'mix',
  'pluche',
  'ringen',
  'uienringen',
  'balletjes',
  'gepofte',
  'zoutloos',
  // Infant food. A 125 g jar of purée is not the vegetable, and the age marker
  // is the only thing on the label that says so. Found by reading the products
  // fifty real weeks actually bought: "AH Biologisch Pompoen 4m+" was being
  // bought as pumpkin, nineteen times over.
  '4m',
  '6m',
  '8m',
  '10m',
  '12m',
  '4m+',
  '6m+',
  '8m+',
  'olvarit',
  'nutrilon',
  'babyvoeding',
  'knijpfruit',
]);

/** Words we know are harmless: brand, retail packaging, or a preserving form. */
export function isIgnorableWord(word: string): boolean {
  return (
    BRAND_WORDS.has(word) ||
    RETAIL_WORDS.has(word) ||
    PRESERVING_WORDS.has(word) ||
    STOPWORDS.has(word)
  );
}
