/**
 * What the taxonomy expansion actually changed.
 *
 * Both sides are measured in one run, against the same real snapshot, by
 * rebuilding the matcher twice: once with the ingredient catalogue as it was
 * before this phase, once as it is now. Nothing is remembered from an earlier
 * report, so the two columns cannot drift apart.
 *
 *   pnpm taxonomy:impact
 */
import { existsSync, readFileSync } from 'node:fs';
import { SEED_INGREDIENTS } from '@/data/seed/ingredients';
import { SEED_INGREDIENT_VARIANTS, TAXONOMY_DECISIONS } from '@/data/seed/ingredient-taxonomy';
import { SEED_RECIPES } from '@/data/seed/recipes';
import { extractRetailerProductId } from '@/services/promotions/retailer-id';
import { loadPrijsProfeetSnapshot } from '@/services/promotions/load-snapshot';
import type { ExternalPromotion } from '@/services/promotions/types';
import { loadRealChains } from '../tests/support/real-data-store';

/** The fourteen ids this phase introduced, so "before" can be reconstructed. */
const NEW_INGREDIENT_IDS = new Set(
  TAXONOMY_DECISIONS.filter(
    (d) =>
      d.inFirstBatch &&
      (d.klass === 'NEW_CANONICAL_INGREDIENT' || d.klass === 'COMPOSITE_INGREDIENT'),
  ).map((d) => d.target!),
);
NEW_INGREDIENT_IDS.add('pasta');
NEW_INGREDIENT_IDS.add('rijst');

const before = {
  ingredients: SEED_INGREDIENTS.filter((i) => !NEW_INGREDIENT_IDS.has(i.id)),
  variants: [],
};
const after = { ingredients: SEED_INGREDIENTS, variants: SEED_INGREDIENT_VARIANTS };

const promo = loadPrijsProfeetSnapshot('data/external/promotions-snapshot.json', {
  readFile: (path) => readFileSync(path, 'utf8'),
  exists: existsSync,
});
if (promo.status !== 'LOADED') throw new Error(`snapshot niet geladen: ${promo.status}`);
const promotions: readonly ExternalPromotion[] = promo.promotions;

/** Category per promotion, for the dinner-relevant denominator. */
const rawCategory = new Map<string, string>();
{
  const raw = JSON.parse(
    readFileSync('data/external/promotions-snapshot.json', 'utf8').replace(/^﻿/, ''),
  ) as { products: { base_product_id: string; unified_category: string | null }[] };
  for (const record of raw.products)
    rawCategory.set(record.base_product_id, record.unified_category ?? '');
}

/*
 * The denominator, decided per category rather than by pattern.
 *
 * The snapshot uses eighteen fixed category values, so guessing with a regular
 * expression was both unnecessary and wrong: an unanchored `ijs` matched
 * "r*ijs*t" and moved the entire pasta-and-rice category out of the
 * denominator, which made our coverage look better by shrinking what it was
 * measured against. Listing the categories removes the guesswork.
 *
 * Where a category is mixed — `kaas` is half gratin and half sandwich, and
 * `zuivel-eieren` is half cooking and half drinking yoghurt — it is counted as
 * dinner-relevant *in full*. That is the conservative direction for us: it
 * makes the denominator larger and our own coverage number smaller.
 */
const DINNER_RELEVANT_CATEGORIES = new Set([
  'soepen-conserven-sauzen',
  'pasta-rijst-wereldkeuken',
  'zuivel-eieren',
  'kaas',
  'groente-fruit',
  'diepvries',
  'vega',
  'vis',
  'vlees',
]);
const OTHER_FOOD_CATEGORIES = new Set([
  'snoep-koek-chips',
  'bier-wijn-sterke-drank',
  'frisdrank',
  'koffie-thee',
  'ontbijt',
  'brood-bakkerij',
]);
const NON_FOOD_CATEGORIES = new Set(['drogisterij', 'huishouden']);

type Denominator = 'DINNER_RELEVANT_FOOD' | 'OTHER_FOOD' | 'NON_FOOD' | 'AMBIGUOUS';

/**
 * A conservative split of the folder.
 *
 * Conservative in the direction that matters: anything that cannot be placed
 * with confidence lands in AMBIGUOUS rather than being quietly excluded, so the
 * denominator is never flattered by pushing awkward records out of it.
 */
function denominatorOf(baseProductId: string | undefined): Denominator {
  const category = rawCategory.get(baseProductId ?? '') ?? '';
  if (DINNER_RELEVANT_CATEGORIES.has(category)) return 'DINNER_RELEVANT_FOOD';
  if (OTHER_FOOD_CATEGORIES.has(category)) return 'OTHER_FOOD';
  if (NON_FOOD_CATEGORIES.has(category)) return 'NON_FOOD';
  // "overig", or a category the snapshot added since. Never silently dropped.
  return 'AMBIGUOUS';
}

const denominators: Denominator[] = promotions.map((p) => denominatorOf(p.baseProductId));
const dinnerRelevant = denominators.filter((d: Denominator) => d === 'DINNER_RELEVANT_FOOD').length;

interface Measured {
  readonly ingredients: number;
  readonly variants: number;
  readonly ah: number;
  readonly jumbo: number;
  readonly reachable: number;
  readonly reachableDinner: number;
  readonly uniqueProducts: number;
}

function measure(catalogue: typeof after, recipeIngredients: ReadonlySet<string>): Measured {
  // The same pipeline the optimizer uses, with only the catalogue swapped: the
  // package must parse and the price must be real, or the offer does not exist.
  const fixture = loadRealChains(['ah', 'jumbo'], catalogue);
  const per: Record<string, number> = { ah: 0, jumbo: 0 };
  const articles = new Map<string, Set<string>>();
  const unique = new Set<string>();

  for (const chain of fixture.chains) {
    const set = new Set<string>();
    for (const offer of chain.allOffers) {
      if (!recipeIngredients.has(offer.ingredientId)) continue;
      per[chain.chainId] = (per[chain.chainId] ?? 0) + 1;
      unique.add(offer.productId);
      const id = extractRetailerProductId(
        chain.chainId,
        offer.productId.slice(chain.chainId.length + 1),
      );
      if (id) set.add(id.id.toLowerCase());
    }
    articles.set(chain.chainId, set);
  }

  // Counted per promotion, never per ingredient: a fusilli promotion reachable
  // through both `pasta` and the fusilli variant is one promotion.
  const reachableIndexes = promotions
    .map((p: ExternalPromotion, index: number) => ({ p, index }))
    .filter(({ p }: { p: ExternalPromotion }) => {
      const id = extractRetailerProductId(p.chainId, p.url);
      return id !== undefined && (articles.get(p.chainId)?.has(id.id.toLowerCase()) ?? false);
    });

  return {
    ingredients: catalogue.ingredients.length,
    variants: catalogue.variants.length,
    ah: per.ah ?? 0,
    jumbo: per.jumbo ?? 0,
    reachable: reachableIndexes.length,
    reachableDinner: reachableIndexes.filter(
      ({ index }: { index: number }) => denominators[index] === 'DINNER_RELEVANT_FOOD',
    ).length,
    uniqueProducts: unique.size,
  };
}

const recipeIngredients = new Set(
  SEED_RECIPES.flatMap((r) => r.ingredients.map((i) => i.ingredientId)),
);
/** The batch is only reachable once a recipe asks for it, so both are measured. */
const withBatch = new Set([...recipeIngredients, ...NEW_INGREDIENT_IDS]);

const beforeM = measure(before, recipeIngredients);
const afterCurrent = measure(after, recipeIngredients);
const afterProjected = measure(after, withBatch);

const pct = (n: number, d: number) => `${((n / d) * 100).toFixed(1)}%`;
const row = (label: string, a: number, b: number, c: number) =>
  console.log(
    '  ' +
      label.padEnd(38) +
      String(a).padStart(8) +
      String(b).padStart(11) +
      String(c).padStart(13),
  );

console.log(`\nTAXONOMIE-IMPACT — ${promotions.length} echte promoties\n`);
console.log(
  '  ' + 'metriek'.padEnd(38) + 'vóór'.padStart(8) + 'na'.padStart(11) + 'na + batch'.padStart(13),
);
console.log('  ' + '-'.repeat(68));
row(
  'canonical ingredients',
  beforeM.ingredients,
  afterCurrent.ingredients,
  afterProjected.ingredients,
);
row('varianten/vormen', beforeM.variants, afterCurrent.variants, afterProjected.variants);
row('optimizer-eligible AH-producten', beforeM.ah, afterCurrent.ah, afterProjected.ah);
row('optimizer-eligible Jumbo-producten', beforeM.jumbo, afterCurrent.jumbo, afterProjected.jumbo);
row(
  'unieke producten',
  beforeM.uniqueProducts,
  afterCurrent.uniqueProducts,
  afterProjected.uniqueProducts,
);
row('bereikbare promoties', beforeM.reachable, afterCurrent.reachable, afterProjected.reachable);
row(
  'waarvan dinerrelevant',
  beforeM.reachableDinner,
  afterCurrent.reachableDinner,
  afterProjected.reachableDinner,
);

console.log('\n  De noemer\n');
const counts: Record<Denominator, number> = {
  DINNER_RELEVANT_FOOD: 0,
  OTHER_FOOD: 0,
  NON_FOOD: 0,
  AMBIGUOUS: 0,
};
for (const d of denominators) counts[d] += 1;
for (const [key, value] of Object.entries(counts)) {
  console.log(
    `    ${key.padEnd(24)} ${String(value).padStart(5)}  ${pct(value, promotions.length)}`,
  );
}

console.log('\n  Dekking\n');
console.log(
  `    A  van alle ${promo.promotions.length} promoties        ${pct(beforeM.reachable, promo.promotions.length)} → ${pct(afterProjected.reachable, promo.promotions.length)}`,
);
console.log(
  `    B  van ${dinnerRelevant} dinerrelevante        ${pct(beforeM.reachableDinner, dinnerRelevant)} → ${pct(afterProjected.reachableDinner, dinnerRelevant)}`,
);
console.log('');
