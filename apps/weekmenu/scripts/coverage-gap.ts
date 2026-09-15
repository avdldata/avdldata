/**
 * Which real promotions fall outside our ingredient scope, and which of those
 * are worth pulling in?
 *
 *   pnpm coverage:gap
 *   pnpm coverage:gap -- --markdown > PROMOTION_COVERAGE_GAPS.md
 *
 * ## This is analysis, not behaviour
 *
 * The lexicon below maps words in product names onto *candidate* canonical
 * ingredients. It exists to prioritise a manual decision and it is wired into
 * nothing: no optimizer, no matcher, no import. When an ingredient is actually
 * adopted it gets a real entry in `src/data/seed/ingredients.ts` with aliases,
 * exclusions and matching tests, and this file has no say in that.
 *
 * Keeping it out of `src/` is deliberate. A fuzzy mapping that quietly becomes
 * production behaviour is exactly how a wrong product ends up in a basket, and
 * the whole ingestion side of this project is built to make that impossible.
 *
 * ## What it measures
 *
 * Each promotion is classified:
 *
 *   A  already covered by a canonical ingredient we have
 *   B  food, dinner-relevant, but no canonical ingredient yet
 *   C  food, but not sensible for a dinner planner (snacks, breakfast, dessert)
 *   D  non-food
 *   E  unclassifiable
 *
 * and every class-B candidate gets an opportunity score, so the expansion is
 * ordered by evidence rather than by what came to mind first.
 */
import { existsSync, readFileSync } from 'node:fs';
import { loadPrijsProfeetSnapshot } from '../src/services/promotions/load-snapshot';
import { extractRetailerProductId } from '../src/services/promotions/retailer-id';
import { toCandidate } from '../src/services/promotions/link-promotions';
import { resolvePackage } from '../src/domain/ingestion/package-parser';
import { SEED_INGREDIENTS } from '../src/data/seed/ingredients';
import { SEED_RECIPES } from '../src/data/seed/recipes';
import { loadRealChains } from '../tests/support/real-data-store';
import type { ExternalPromotion } from '../src/services/promotions/types';

const markdown = process.argv.includes('--markdown');
/** Print every candidate with a promotion, not just the top 30 — for the taxonomy pass. */
const showAll = process.argv.includes('--all');

/* ── The lexicon ─────────────────────────────────────────────────────────── */

/**
 * A candidate dinner ingredient, and how to recognise it in a product name.
 *
 * `deny` runs first and wins. It is what keeps "kipsaté in pindasaus" (a ready
 * meal) out of "kipfilet", and "pindakaas" out of "pinda".
 */
interface Candidate {
  readonly id: string;
  readonly label: string;
  readonly group: string;
  readonly match: RegExp;
  readonly deny?: RegExp;
  /** Our judgement of how many dinners could use it. 1 = niche, 5 = staple. */
  readonly utility: 1 | 2 | 3 | 4 | 5;
  /** Semantic risk of confusing it with something else. 1 = safe, 5 = hairy. */
  readonly risk: 1 | 2 | 3 | 4 | 5;
}

/** Ready meals, snacks and spreads: food, but not an ingredient for a dinner. */
const NOT_DINNER =
  /\b(ijs|ijssalon|magnum|cornetto|snack|chips|koek|koekje|cake|taart|gebak|croissant|hagel|vlokken|granola|muesli|ontbijt|pindakaas|hazelnootpasta|smoothie|shake|breaker|dessert|vla\b|pudding|mousse|kwarktaart|drinkyoghurt|yoghurtdrink|limonade|siroop|snoep|chocolade|reep|bonbon|poffertje|pannenkoek|appelflap|beschuit|cracker|borrel|bitterbal|frikandel|kroket|loempia|hotdog|pizza|maaltijdsalade|saladbowl|ovenschotel|maaltijdmix|wereldgerecht|kant-en-klaar|babyvoeding|knijpfruit|\d+m\+|peuter|dreumes)\b/i;

/** Charcuterie and sandwich fillings: lunch, not dinner. */
const SANDWICH =
  /\b(worst|salami|cervelaat|paté|pate|beenham|boterhamworst|leverworst|smeerkaas|smeerleverworst|spread|zuivelspread|roomkaas|chutney|hagelslag|jam)\b/i;

const CANDIDATES: readonly Candidate[] = [
  // ---- pasta, rijst, noedels ---------------------------------------------
  { id: 'fusilli', label: 'Fusilli', group: 'grains', match: /\bfusilli\b/i, utility: 4, risk: 1 },
  {
    id: 'tagliatelle',
    label: 'Tagliatelle',
    group: 'grains',
    match: /\btagliatelle\b/i,
    utility: 4,
    risk: 1,
  },
  {
    id: 'rigatoni',
    label: 'Rigatoni',
    group: 'grains',
    match: /\brigatoni\b/i,
    utility: 3,
    risk: 1,
  },
  {
    id: 'farfalle',
    label: 'Farfalle',
    group: 'grains',
    match: /\bfarfalle\b/i,
    utility: 3,
    risk: 1,
  },
  { id: 'orzo', label: 'Orzo', group: 'grains', match: /\borzo\b/i, utility: 2, risk: 1 },
  {
    id: 'pandanrijst',
    label: 'Pandanrijst',
    group: 'grains',
    match: /\bpandan(rijst)?\b/i,
    utility: 4,
    risk: 1,
  },
  {
    id: 'risottorijst',
    label: 'Risottorijst',
    group: 'grains',
    match: /\b(risotto|arborio)\b/i,
    deny: /kant-en-klaar/i,
    utility: 3,
    risk: 1,
  },
  {
    id: 'rijstnoedels',
    label: 'Rijstnoedels',
    group: 'grains',
    match: /\brijstnoedels?\b|\bmihoen\b/i,
    utility: 3,
    risk: 1,
  },
  { id: 'udon', label: 'Udonnoedels', group: 'grains', match: /\budon\b/i, utility: 2, risk: 1 },
  { id: 'naanbrood', label: 'Naanbrood', group: 'grains', match: /\bnaan\b/i, utility: 3, risk: 1 },
  {
    id: 'tortilla-mais',
    label: 'Maïstortilla',
    group: 'grains',
    match: /\btortilla\b/i,
    deny: /chips|wraps/i,
    utility: 2,
    risk: 2,
  },
  {
    id: 'volkorenbrood',
    label: 'Volkorenbrood',
    group: 'grains',
    match: /\bvolkoren (brood|heel|gesneden)\b|\brond volkoren\b/i,
    utility: 2,
    risk: 2,
  },

  // ---- groenten ------------------------------------------------------------
  {
    id: 'spruitjes',
    label: 'Spruitjes',
    group: 'vegetables',
    match: /\bspruit(je)?s?\b/i,
    utility: 3,
    risk: 1,
  },
  {
    id: 'rode-kool',
    label: 'Rode kool',
    group: 'vegetables',
    match: /\brode kool\b/i,
    utility: 3,
    risk: 1,
  },
  {
    id: 'knolselderij',
    label: 'Knolselderij',
    group: 'vegetables',
    match: /\bknolselderij\b/i,
    utility: 2,
    risk: 1,
  },
  {
    id: 'pastinaak',
    label: 'Pastinaak',
    group: 'vegetables',
    match: /\bpastinaak\b/i,
    utility: 2,
    risk: 1,
  },
  { id: 'paksoi', label: 'Paksoi', group: 'vegetables', match: /\bpaksoi\b/i, utility: 3, risk: 1 },
  {
    id: 'kastanjechampignons',
    label: 'Kastanjechampignons',
    group: 'vegetables',
    match: /\bkastanjechampignon/i,
    utility: 3,
    risk: 1,
  },
  {
    id: 'krieltjes',
    label: 'Krieltjes',
    group: 'vegetables',
    match: /\bkriel(tjes)?\b/i,
    utility: 4,
    risk: 1,
  },
  {
    id: 'aardappelpartjes',
    label: 'Aardappelpartjes',
    group: 'vegetables',
    match: /\baardappel(partjes|schijfjes|blokjes)\b/i,
    utility: 3,
    risk: 1,
  },
  {
    id: 'roerbakgroente',
    label: 'Roerbakgroentemix',
    group: 'vegetables',
    match: /\b(roerbakgroente|wokgroente)\b/i,
    utility: 4,
    risk: 2,
  },
  {
    id: 'soepgroente',
    label: 'Soepgroente',
    group: 'vegetables',
    match: /\bsoepgroente\b/i,
    utility: 2,
    risk: 1,
  },
  {
    id: 'bloemkoolrijst',
    label: 'Bloemkoolrijst',
    group: 'vegetables',
    match: /\bbloemkoolrijst\b/i,
    utility: 2,
    risk: 1,
  },
  {
    id: 'little-gem',
    label: 'Little gem',
    group: 'vegetables',
    match: /\blittle gem\b|\bromainesla\b/i,
    utility: 2,
    risk: 1,
  },
  { id: 'radijs', label: 'Radijs', group: 'vegetables', match: /\bradijs\b/i, utility: 1, risk: 1 },
  {
    id: 'asperges',
    label: 'Asperges',
    group: 'vegetables',
    match: /\basperge/i,
    utility: 2,
    risk: 1,
  },
  {
    id: 'bleekselderij',
    label: 'Bleekselderij',
    group: 'vegetables',
    match: /\bbleekselderij\b/i,
    utility: 2,
    risk: 1,
  },
  { id: 'witlof', label: 'Witlof', group: 'vegetables', match: /\bwitlof\b/i, utility: 2, risk: 1 },

  // ---- diepvriesgroente ---------------------------------------------------
  {
    id: 'diepvries-spinazie',
    label: 'Diepvriesspinazie',
    group: 'frozen',
    match: /\bspinazie\b/i,
    deny: /verse/i,
    utility: 3,
    risk: 2,
  },
  {
    id: 'tuinbonen',
    label: 'Tuinbonen',
    group: 'frozen',
    match: /\btuinbo(o)?n/i,
    utility: 2,
    risk: 1,
  },
  {
    id: 'diepvries-groentemix',
    label: 'Diepvriesgroentemix',
    group: 'frozen',
    match: /\bgroente(n)?mix\b/i,
    utility: 3,
    risk: 2,
  },

  // ---- vlees ---------------------------------------------------------------
  {
    id: 'kipschnitzel',
    label: 'Kipschnitzel',
    group: 'meat',
    match: /\bkip(filet)?schnitzel\b|\bkipschnitzel\b/i,
    utility: 3,
    risk: 2,
  },
  {
    id: 'kipdrumsticks',
    label: 'Kipdrumsticks',
    group: 'meat',
    match: /\b(drumstick|kippenpoot|kippenbout)/i,
    utility: 3,
    risk: 1,
  },
  {
    id: 'shoarmavlees',
    label: 'Shoarmavlees',
    group: 'meat',
    match: /\bshoarma\b|\bgyros\b/i,
    deny: /kruiden|mix/i,
    utility: 4,
    risk: 2,
  },
  {
    id: 'speklapjes',
    label: 'Speklapjes',
    group: 'meat',
    match: /\bspeklap/i,
    utility: 2,
    risk: 1,
  },
  {
    id: 'hamburger',
    label: 'Hamburger',
    group: 'meat',
    match: /\bhamburger\b|\brundvleesburger\b/i,
    deny: /broodje|cheeseburger/i,
    utility: 3,
    risk: 2,
  },
  {
    id: 'rookworst',
    label: 'Rookworst',
    group: 'meat',
    match: /\brookworst\b/i,
    utility: 3,
    risk: 1,
  },
  {
    id: 'varkensribeye',
    label: 'Varkensribeye',
    group: 'meat',
    match: /\b(varkensribeye|procureur|varkenslap)/i,
    utility: 2,
    risk: 1,
  },
  {
    id: 'kipgehakt',
    label: 'Kipgehakt',
    group: 'meat',
    match: /\bkipgehakt\b/i,
    utility: 2,
    risk: 1,
  },
  {
    id: 'gehakt-gemengd',
    label: 'Gemengd gehakt',
    group: 'meat',
    match: /\bgemengd gehakt\b/i,
    utility: 3,
    risk: 1,
  },
  {
    id: 'biefstuk',
    label: 'Biefstuk',
    group: 'meat',
    match: /\bbiefstuk\b|\brunderlap/i,
    utility: 3,
    risk: 1,
  },
  {
    id: 'kalkoenfilet',
    label: 'Kalkoenfilet',
    group: 'meat',
    match: /\bkalkoen(filet)?\b/i,
    deny: /worst|filet vleeswaren/i,
    utility: 2,
    risk: 2,
  },

  // ---- vis -----------------------------------------------------------------
  {
    id: 'pangasius',
    label: 'Pangasiusfilet',
    group: 'fish',
    match: /\bpangasius\b/i,
    utility: 3,
    risk: 1,
  },
  {
    id: 'makreel',
    label: 'Makreelfilet',
    group: 'fish',
    match: /\bmakreel\b/i,
    utility: 2,
    risk: 1,
  },
  {
    id: 'heek',
    label: 'Heekfilet',
    group: 'fish',
    match: /\bheek(filet)?\b/i,
    utility: 2,
    risk: 1,
  },
  {
    id: 'vissticks',
    label: 'Vissticks',
    group: 'fish',
    match: /\bvisstick|\bvissticks\b/i,
    utility: 2,
    risk: 1,
  },
  {
    id: 'tilapia',
    label: 'Tilapiafilet',
    group: 'fish',
    match: /\btilapia\b/i,
    utility: 2,
    risk: 1,
  },
  { id: 'ansjovis', label: 'Ansjovis', group: 'fish', match: /\bansjovis\b/i, utility: 1, risk: 1 },

  // ---- vegetarisch ---------------------------------------------------------
  { id: 'hummus', label: 'Hummus', group: 'vegetarian', match: /\bhummus\b/i, utility: 3, risk: 1 },
  {
    id: 'vega-burger',
    label: 'Vegetarische burger',
    group: 'vegetarian',
    match: /\b(vega|plantaardige?|vegetarische?) burger\b|\bgroenteburger\b/i,
    utility: 3,
    risk: 2,
  },
  {
    id: 'plantaardig-gehakt',
    label: 'Plantaardig gehakt',
    group: 'vegetarian',
    match: /\bplantaardig(e)? gehakt/i,
    utility: 3,
    risk: 1,
  },
  { id: 'seitan', label: 'Seitan', group: 'vegetarian', match: /\bseitan\b/i, utility: 1, risk: 1 },
  {
    id: 'vega-schnitzel',
    label: 'Vegetarische schnitzel',
    group: 'vegetarian',
    match: /\b(vega|plantaardige?) (schnitzel|stukjes|reepjes)\b/i,
    utility: 2,
    risk: 2,
  },

  // ---- zuivel & kaas -------------------------------------------------------
  {
    id: 'sojadrink',
    label: 'Sojadrink',
    group: 'dairy',
    match: /\bsoja ?drink\b/i,
    utility: 2,
    risk: 1,
  },
  {
    id: 'karnemelk',
    label: 'Karnemelk',
    group: 'dairy',
    match: /\bkarnemelk\b/i,
    utility: 1,
    risk: 1,
  },
  {
    id: 'slagroom',
    label: 'Slagroom',
    group: 'dairy',
    match: /\bslagroom\b/i,
    utility: 2,
    risk: 1,
  },
  {
    id: 'huttenkase',
    label: 'Hüttenkäse',
    group: 'dairy',
    match: /\bhuttenk(ä|a)se\b|\bcottage cheese\b/i,
    utility: 2,
    risk: 1,
  },
  {
    id: 'geitenkaas',
    label: 'Geitenkaas',
    group: 'cheese',
    match: /\bgeitenkaas\b/i,
    utility: 3,
    risk: 1,
  },
  {
    id: 'halloumi',
    label: 'Halloumi',
    group: 'cheese',
    match: /\bhalloumi\b/i,
    utility: 2,
    risk: 1,
  },
  {
    id: 'kaasplakken',
    label: 'Kaasplakken',
    group: 'cheese',
    match: /\b(jong )?belegen\b.*\bplakken\b|\bplakken\b.*\bkaas\b/i,
    deny: /smeer|room/i,
    utility: 2,
    risk: 3,
  },

  // ---- sauzen, conserven, pasta's ------------------------------------------
  { id: 'pesto', label: 'Pesto', group: 'sauces', match: /\bpesto\b/i, utility: 4, risk: 1 },
  {
    id: 'satesaus',
    label: 'Satésaus',
    group: 'sauces',
    match: /\bsat(é|e)saus\b|\bpindasaus\b/i,
    deny: /kipsat|varkenssat|mora|hebro/i,
    utility: 3,
    risk: 2,
  },
  {
    id: 'currysaus',
    label: 'Currysaus',
    group: 'sauces',
    match: /\b(kerrie|curry)saus\b/i,
    utility: 2,
    risk: 1,
  },
  {
    id: 'sriracha',
    label: 'Sriracha',
    group: 'sauces',
    match: /\bsriracha\b/i,
    deny: /bowl|salade/i,
    utility: 2,
    risk: 1,
  },
  {
    id: 'chilisaus',
    label: 'Chilisaus',
    group: 'sauces',
    match: /\b(sweet )?chilisaus\b/i,
    utility: 2,
    risk: 1,
  },
  {
    id: 'oestersaus',
    label: 'Oestersaus',
    group: 'sauces',
    match: /\boestersaus\b/i,
    utility: 2,
    risk: 1,
  },
  { id: 'vissaus', label: 'Vissaus', group: 'sauces', match: /\bvissaus\b/i, utility: 2, risk: 1 },
  {
    id: 'tahin',
    label: 'Tahin',
    group: 'sauces',
    match: /\btahin\b|\btahini\b/i,
    utility: 2,
    risk: 1,
  },
  {
    id: 'pastasaus',
    label: 'Pastasaus',
    group: 'sauces',
    match: /\bpastasaus\b|\bbolognese\b|\barrabiata\b|\bnapoletana\b/i,
    deny: /rio mare|kant-en-klaar maaltijd/i,
    utility: 3,
    risk: 2,
  },
  {
    id: 'tzatziki',
    label: 'Tzatziki',
    group: 'sauces',
    match: /\btzatziki\b/i,
    utility: 2,
    risk: 1,
  },
  {
    id: 'guacamole',
    label: 'Guacamole',
    group: 'sauces',
    match: /\bguacamole\b/i,
    utility: 2,
    risk: 1,
  },
  {
    id: 'kruidenmix-nasi',
    label: 'Nasi/bami kruidenmix',
    group: 'sauces',
    match: /\bmix voor (nasi|bami)\b|\b(nasi|bami) ?kruiden/i,
    utility: 3,
    risk: 1,
  },
  {
    id: 'kruidenmix-taco',
    label: 'Taco kruidenmix',
    group: 'sauces',
    match: /\b(taco|fajita|burrito|chili con carne) ?kruiden/i,
    utility: 3,
    risk: 1,
  },
  {
    id: 'bouillon-kip',
    label: 'Kippenbouillon',
    group: 'sauces',
    match: /\bkippenbouillon\b|\bkip bouillon\b/i,
    utility: 3,
    risk: 1,
  },
  {
    id: 'runderbouillon',
    label: 'Runderbouillon',
    group: 'sauces',
    match: /\brunderbouillon\b/i,
    utility: 2,
    risk: 1,
  },

  // ---- conserven ------------------------------------------------------------
  {
    id: 'witte-bonen',
    label: 'Witte bonen',
    group: 'canned',
    match: /\bwitte bonen\b|\bcannellini\b/i,
    utility: 2,
    risk: 1,
  },
  { id: 'augurken', label: 'Augurken', group: 'canned', match: /\baugurk/i, utility: 1, risk: 1 },
  {
    id: 'kappertjes',
    label: 'Kappertjes',
    group: 'canned',
    match: /\bkapper(tje)?s\b/i,
    utility: 1,
    risk: 1,
  },
  {
    id: 'artisjokharten',
    label: 'Artisjokharten',
    group: 'canned',
    match: /\bartisjok/i,
    utility: 1,
    risk: 1,
  },
  {
    id: 'bamboescheuten',
    label: 'Bamboescheuten',
    group: 'canned',
    match: /\bbamboescheut/i,
    utility: 1,
    risk: 1,
  },
  {
    id: 'ananas-blik',
    label: 'Ananas op sap',
    group: 'canned',
    match: /\bananas\b/i,
    deny: /sap\b|drink|ijs|smoothie/i,
    utility: 1,
    risk: 2,
  },
];

/* ── Classification ──────────────────────────────────────────────────────── */

type Klass = 'A' | 'B' | 'C' | 'D' | 'E';

const FOOD_CATEGORIES = new Set([
  'groente-fruit',
  'vlees',
  'vis',
  'vega',
  'zuivel-eieren',
  'kaas',
  'diepvries',
  'soepen-conserven-sauzen',
  'pasta-rijst-wereldkeuken',
  'brood-bakkerij',
  'ontbijt',
]);
const NON_FOOD = new Set([
  'drogisterij',
  'huishouden',
  'snoep-koek-chips',
  'bier-wijn-sterke-drank',
  'frisdrank',
  'koffie-thee',
]);

const promo = loadPrijsProfeetSnapshot('data/external/promotions-snapshot.json', {
  readFile: (path) => readFileSync(path, 'utf8'),
  exists: existsSync,
});
if (promo.status === 'ABSENT') {
  console.error('\n  Geen promotiemomentopname. Zie PRIJSPROFEET_INTEGRATION.md.\n');
  process.exit(1);
}

const fixture = loadRealChains(['ah', 'jumbo']);
const covered = new Map<string, string>(); // article id → ingredient id
for (const chain of fixture.chains) {
  for (const offer of chain.allOffers) {
    const id = extractRetailerProductId(
      chain.chainId,
      offer.productId.slice(chain.chainId.length + 1),
    );
    if (id) covered.set(`${chain.chainId}:${id.id.toLowerCase()}`, offer.ingredientId);
  }
}

/** Which category a promotion sits in, from the raw record. */
const rawCategory = new Map<string, string>();
{
  const raw = JSON.parse(
    readFileSync('data/external/promotions-snapshot.json', 'utf8').replace(/^﻿/, ''),
  ) as { products: { base_product_id: string; unified_category: string | null }[] };
  for (const record of raw.products) {
    rawCategory.set(record.base_product_id, record.unified_category ?? '');
  }
}

interface Classified {
  readonly promotion: ExternalPromotion;
  readonly klass: Klass;
  readonly category: string;
  readonly candidate?: Candidate;
}

function classify(promotion: ExternalPromotion): Classified {
  const category = rawCategory.get(promotion.baseProductId ?? '') ?? '';
  const article = extractRetailerProductId(promotion.chainId, promotion.url);
  if (article && covered.has(`${promotion.chainId}:${article.id.toLowerCase()}`)) {
    return { promotion, klass: 'A', category };
  }
  if (NON_FOOD.has(category)) return { promotion, klass: 'D', category };
  if (!FOOD_CATEGORIES.has(category)) return { promotion, klass: 'E', category };

  const name = promotion.productName;
  if (NOT_DINNER.test(name) || SANDWICH.test(name)) return { promotion, klass: 'C', category };

  for (const candidate of CANDIDATES) {
    if (candidate.deny?.test(name)) continue;
    if (candidate.match.test(name)) return { promotion, klass: 'B', category, candidate };
  }
  return { promotion, klass: 'C', category };
}

const classified = promo.promotions.map(classify);

/* ── The opportunity score ───────────────────────────────────────────────── */

const catalogue = JSON.parse(readFileSync('data/external/checkjebon-snapshot.json', 'utf8')) as {
  n: string;
  d: { n: string; l: string; p: number; s?: string }[];
}[];

interface Opportunity {
  readonly candidate: Candidate;
  readonly promotions: number;
  readonly ah: number;
  readonly jumbo: number;
  readonly medianDiscountPercent: number;
  readonly catalogueProducts: number;
  readonly withPackage: number;
  readonly supportedType: number;
  readonly score: number;
}

const recipeIngredients = new Set(
  SEED_RECIPES.flatMap((r) => r.ingredients.map((i) => i.ingredientId)),
);

function opportunities(): Opportunity[] {
  const rows: Opportunity[] = [];
  for (const candidate of CANDIDATES) {
    const hits = classified.filter((c) => c.candidate?.id === candidate.id);
    if (hits.length === 0) continue;

    const discounts: number[] = [];
    let supported = 0;
    for (const hit of hits) {
      const { regularPriceCents: regular, promotionalPriceCents: now } = hit.promotion;
      if (regular !== undefined && now !== undefined && regular > 0 && now < regular) {
        discounts.push(((regular - now) / regular) * 100);
      }
      if (toCandidate(hit.promotion).params) supported += 1;
    }
    discounts.sort((a, b) => a - b);

    // How many products the catalogue carries under this name, and how many of
    // those state a package we can read. A promotion we cannot buy a package
    // for is a promotion we cannot price.
    let catalogueProducts = 0;
    let withPackage = 0;
    for (const chain of catalogue) {
      if (chain.n !== 'ah' && chain.n !== 'jumbo') continue;
      for (const product of chain.d) {
        if (candidate.deny?.test(product.n)) continue;
        if (!candidate.match.test(product.n)) continue;
        if (NOT_DINNER.test(product.n) || SANDWICH.test(product.n)) continue;
        catalogueProducts += 1;
        if (resolvePackage(product.s, product.n).status === 'OK') withPackage += 1;
      }
    }

    /*
     * The score, spelled out so it can be argued with.
     *
     * Everything is normalised to roughly 0–1 and multiplied, because these are
     * conjunctive requirements: an ingredient with wonderful promotions and no
     * catalogue is worth nothing, and so is one with a huge catalogue and no
     * promotions. Multiplying makes a zero anywhere a zero overall, which is
     * the behaviour we want; adding would let one strong term carry a candidate
     * that fails on another.
     */
    const promotionFrequency = Math.min(1, hits.length / 40);
    const recipeUtility = candidate.utility / 5;
    const catalogAvailability = Math.min(1, catalogueProducts / 30);
    const packageQuality = catalogueProducts === 0 ? 0 : withPackage / catalogueProducts;
    const median = discounts.length === 0 ? 0 : (discounts[Math.floor(discounts.length / 2)] ?? 0);
    const savingsPotential = Math.min(1, median / 40);
    const typeQuality = hits.length === 0 ? 0 : supported / hits.length;

    const semanticRisk = (candidate.risk - 1) / 8; // 0 – 0,5
    const rarityPenalty = catalogueProducts < 3 ? 0.4 : 0;

    const score = Math.max(
      0,
      promotionFrequency *
        recipeUtility *
        catalogAvailability *
        packageQuality *
        Math.max(0.35, savingsPotential) *
        Math.max(0.4, typeQuality) *
        (1 - semanticRisk) *
        (1 - rarityPenalty),
    );

    rows.push({
      candidate,
      promotions: hits.length,
      ah: hits.filter((h) => h.promotion.chainId === 'ah').length,
      jumbo: hits.filter((h) => h.promotion.chainId === 'jumbo').length,
      medianDiscountPercent: median,
      catalogueProducts,
      withPackage,
      supportedType: supported,
      score,
    });
  }
  return rows.sort((a, b) => b.score - a.score);
}

/* ── Output ──────────────────────────────────────────────────────────────── */

const counts: Record<Klass, number> = { A: 0, B: 0, C: 0, D: 0, E: 0 };
for (const row of classified) counts[row.klass] += 1;
const total = classified.length;
const share = (n: number) => `${((n / total) * 100).toFixed(1)}%`;
const rows = opportunities();

if (!markdown) {
  console.log(
    `\nCOVERAGE GAP — ${total} echte promoties tegen ${SEED_INGREDIENTS.length} canonical ingredients\n`,
  );
  console.log(
    `  A  al gedekt door een canonical ingredient   ${String(counts.A).padStart(5)}  ${share(counts.A)}`,
  );
  console.log(
    `  B  food, dinerrelevant, ingredient ontbreekt ${String(counts.B).padStart(5)}  ${share(counts.B)}`,
  );
  console.log(
    `  C  food, niet logisch voor een dinerplanner  ${String(counts.C).padStart(5)}  ${share(counts.C)}`,
  );
  console.log(
    `  D  non-food                                  ${String(counts.D).padStart(5)}  ${share(counts.D)}`,
  );
  console.log(
    `  E  niet te classificeren                     ${String(counts.E).padStart(5)}  ${share(counts.E)}\n`,
  );
  console.log(`  ${showAll ? 'Alle' : 'Top-30'} kandidaten op opportunity score\n`);
  const head =
    '    ' +
    'ingredient'.padEnd(26) +
    'groep'.padEnd(12) +
    'promo'.padStart(7) +
    'AH'.padStart(6) +
    'JU'.padStart(6) +
    'med%'.padStart(7) +
    'cat'.padStart(6) +
    'pkg'.padStart(6) +
    'score'.padStart(8);
  console.log(head);
  console.log('    ' + '-'.repeat(head.length - 4));
  for (const row of showAll ? rows : rows.slice(0, 30)) {
    console.log(
      '    ' +
        row.candidate.label.padEnd(26) +
        row.candidate.group.padEnd(12) +
        String(row.promotions).padStart(7) +
        String(row.ah).padStart(6) +
        String(row.jumbo).padStart(6) +
        row.medianDiscountPercent.toFixed(0).padStart(7) +
        String(row.catalogueProducts).padStart(6) +
        `${((row.withPackage / Math.max(1, row.catalogueProducts)) * 100).toFixed(0)}%`.padStart(
          6,
        ) +
        row.score.toFixed(3).padStart(8),
    );
  }
  console.log(
    `\n  ${rows.length} kandidaten met minstens één promotie, samen ${rows.reduce((n, r) => n + r.promotions, 0)} promoties.\n` +
      `  ${recipeIngredients.size} van ${SEED_INGREDIENTS.length} canonical ingredients worden nu in een recept gebruikt.\n`,
  );
}

export {};
