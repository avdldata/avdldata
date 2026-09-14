/**
 * Where does a real-data week actually spend its time?
 *
 * The candidate-explosion hypothesis says the optimizer drowns in near-identical
 * products. That is a testable claim, and testing it first avoids building a
 * pruning layer for a problem that turns out to be somewhere else entirely.
 *
 *   pnpm perf:real
 */
import { readFileSync } from 'node:fs';
import { cents, quantity, type Cents } from '../src/domain/units';
import { buildIngredientIndex } from '../src/domain/ingredients/types';
import { normaliseRecipes } from '../src/domain/recipes/normalise';
import { optimiseWeek } from '../src/domain/optimization/week-optimizer';
import { prepareOptimization } from '../src/domain/optimization/prepare';
import { generateCandidateWeeks } from '../src/domain/optimization/candidates';
import { evaluateWeek } from '../src/domain/optimization/evaluate-week';
import { weekLowerBound } from '../src/domain/optimization/lower-bound';
import {
  buildPackagingMatrix,
  enumerateStoreOptions,
  type PackagingCache,
  type StoreCandidate,
} from '../src/domain/optimization/store-selection';
import {
  aggregateWeekIngredients,
  purchasableRequirements,
} from '../src/domain/aggregation/aggregate';
import type { ProductOffer } from '../src/domain/stores/types';
import { parsePackage } from '../src/domain/ingestion/package-parser';
import { buildIngredientPhrases, matchProduct } from '../src/domain/ingestion/match-ingredient';
import { PRODUCT_MATCH_OVERRIDES } from '../src/data/matching/overrides';
import { SEED_INGREDIENTS, SEED_INGREDIENT_ALIASES } from '../src/data/seed/ingredients';
import { SEED_RECIPES } from '../src/data/seed/recipes';
import { DEMO_HOUSEHOLD } from '../src/data/seed/demo-household';

interface RawProduct {
  n?: string;
  l?: string;
  p?: number;
  s?: string;
}
const chains = JSON.parse(readFileSync('data/external/checkjebon-snapshot.json', 'utf8')) as {
  n?: string;
  c?: string;
  d?: RawProduct[];
}[];
const chain = chains.find((c) => c.n === 'ah')!;

const ingredientIndex = buildIngredientIndex(SEED_INGREDIENTS);
const recipes = normaliseRecipes(SEED_RECIPES, ingredientIndex);
const phrases = buildIngredientPhrases(SEED_INGREDIENTS, SEED_INGREDIENT_ALIASES);

const ingestStarted = performance.now();
const offers: ProductOffer[] = [];
for (const product of chain.d ?? []) {
  const productId = `ah:${product.l ?? ''}`;
  const match = matchProduct(
    { productId, productName: product.n ?? '' },
    phrases,
    PRODUCT_MATCH_OVERRIDES,
  );
  if (!match || (match.status !== 'AUTO_APPROVED' && match.status !== 'APPROVED')) continue;
  const pack = parsePackage(product.s);
  const price = product.p;
  if (pack.status !== 'OK') continue;
  if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) continue;
  const unitPrice = cents(Math.round(price * 100)) as Cents;
  offers.push({
    productId,
    chainId: 'ah',
    locationId: 'ah-shadow',
    ingredientId: match.canonicalIngredientId,
    name: product.n ?? '',
    brandName: 'AH',
    isPrivateLabel: false,
    packageAmount: quantity(pack.info.totalAmount, pack.info.baseUnit),
    normalUnitPriceCents: unitPrice,
    unitPriceCents: unitPrice,
    pricePerBaseUnitCents: unitPrice / Math.max(1, pack.info.totalAmount),
    nutritionOrigin: 'ingredient',
  });
}
const ingestMs = performance.now() - ingestStarted;

const store: StoreCandidate = {
  location: {
    id: 'ah-shadow',
    chainId: 'ah',
    name: 'AH',
    address: '',
    postalCode: '9711AA',
    city: 'Groningen',
    latitude: DEMO_HOUSEHOLD.location.latitude!,
    longitude: DEMO_HOUSEHOLD.location.longitude!,
    regionId: 'nl',
  },
  chain: { id: 'ah', name: 'AH', logoUrl: '', colorHex: '#00a0e2' },
  distanceKm: 2.5,
  offers,
};

const input = {
  household: DEMO_HOUSEHOLD,
  recipes,
  ingredients: ingredientIndex,
  stores: [store],
  maxStores: 1,
  conveniencePreference: 'gebalanceerd' as const,
  budget: {},
  startDate: '2026-09-14',
  today: new Date('2026-09-14T09:00:00Z'),
};

console.log(`\nProfiel met echte AH-data — ${offers.length} bruikbare aanbiedingen\n`);
console.log(`  ingest + matching (eenmalig)   ${ingestMs.toFixed(0)} ms`);

// --- stage by stage -------------------------------------------------------
const prepStarted = performance.now();
const prepared = prepareOptimization(input);
const prepMs = performance.now() - prepStarted;
if (prepared.status !== 'OK') throw new Error(prepared.reason);

const genStarted = performance.now();
const generated = generateCandidateWeeks({
  candidates: prepared.candidates,
  portionsByRecipe: prepared.portionsByRecipe,
  memberNutrition: prepared.memberNutrition,
  ingredients: ingredientIndex,
  stores: prepared.stores,
  preferences: DEMO_HOUSEHOLD.preferences,
  config: prepared.config,
});
const genMs = performance.now() - genStarted;

// One representative week, broken into its parts.
const week = generated.weeks[0]!.recipes;
const plannedDays = week.map((recipe, dayIndex) => ({
  dayIndex,
  recipe,
  portions: prepared.portionsByRecipe.get(recipe.id)!,
}));

const time = (label: string, runs: number, fn: () => unknown): number => {
  fn();
  const started = performance.now();
  for (let i = 0; i < runs; i += 1) fn();
  const per = (performance.now() - started) / runs;
  console.log(`  ${label.padEnd(30)} ${per.toFixed(3)} ms`);
  return per;
};

console.log(`\n  Per week, opgesplitst\n`);
const aggMs = time('aggregatie', 200, () => aggregateWeekIngredients(plannedDays, ingredientIndex));
const requirements = purchasableRequirements(
  aggregateWeekIngredients(plannedDays, ingredientIndex),
);
const matrixMs = time('verpakkingsmatrix', 100, () =>
  buildPackagingMatrix(requirements, prepared.stores, prepared.config.packaging),
);
const matrix = buildPackagingMatrix(requirements, prepared.stores, prepared.config.packaging);
const storeMs = time('winkelcombinaties', 200, () =>
  enumerateStoreOptions({
    requirements,
    stores: prepared.stores,
    matrix,
    home: prepared.home,
    maxStores: prepared.maxStores,
    extraStorePenaltyCents: prepared.extraStorePenalty,
    unavailableItemPenaltyCents: prepared.config.weights.unavailableItemPenalty,
    tripConfig: prepared.config.trip,
  }),
);
const cache: PackagingCache = new Map();
const evalMs = time('volledige evaluateWeek', 100, () =>
  evaluateWeek({
    recipes: week,
    portionsByRecipe: prepared.portionsByRecipe,
    household: DEMO_HOUSEHOLD,
    memberNutrition: prepared.memberNutrition,
    ingredients: ingredientIndex,
    stores: prepared.stores,
    matrixHome: prepared.home,
    maxStores: prepared.maxStores,
    extraStorePenalty: prepared.extraStorePenalty,
    budget: {},
    startDate: '2026-09-14',
    config: prepared.config,
    excluded: prepared.excluded,
    explain: false,
    packagingCache: cache,
  }),
);

// The lower bound was added to make the refinement cheaper. On real data it is
// worth checking whether it still is: it prices a packaging matrix of its own
// for every neighbour it rules out.
const boundCache: PackagingCache = new Map();
time('ondergrens per buur', 100, () =>
  weekLowerBound({
    recipes: week,
    portionsByRecipe: prepared.portionsByRecipe,
    household: DEMO_HOUSEHOLD,
    memberNutrition: prepared.memberNutrition,
    ingredients: ingredientIndex,
    stores: prepared.stores,
    config: prepared.config,
    packagingCache: boundCache,
  }),
);
const coldBound = (() => {
  const started = performance.now();
  for (let i = 0; i < 20; i += 1) {
    weekLowerBound({
      recipes: week,
      portionsByRecipe: prepared.portionsByRecipe,
      household: DEMO_HOUSEHOLD,
      memberNutrition: prepared.memberNutrition,
      ingredients: ingredientIndex,
      stores: prepared.stores,
      config: prepared.config,
      packagingCache: new Map(),
    });
  }
  return (performance.now() - started) / 20;
})();
console.log(`  ondergrens, koude cache        ${coldBound.toFixed(3)} ms`);

const totalStarted = performance.now();
const result = optimiseWeek(input);
const totalMs = performance.now() - totalStarted;

// The bound is path-preserving, so switching it off must give the same week.
// If it ever does not, the bound is unsound and that is a correctness bug.
const withoutBoundConfig = {
  ...prepared.config,
  search: {
    ...prepared.config.search,
    localSearch: { ...prepared.config.search.localSearch, useLowerBound: false },
  },
};
const offStarted = performance.now();
const withoutBound = optimiseWeek({ ...input, config: withoutBoundConfig });
const offMs = performance.now() - offStarted;
console.log(`\n  zonder ondergrens              ${offMs.toFixed(0)} ms`);
if (result.status === 'OK' && withoutBound.status === 'OK') {
  const same =
    result.plan.days.map((d) => d.recipe.id).join('|') ===
      withoutBound.plan.days.map((d) => d.recipe.id).join('|') &&
    result.plan.score.totalPenaltyCents === withoutBound.plan.score.totalPenaltyCents;
  console.log(`  zelfde week?                   ${same ? 'ja' : 'nee'}`);
  console.log(
    `  score met ondergrens           ${result.plan.score.totalPenaltyCents}  ` +
      `(boodschappen ${result.plan.totals.groceryCents})`,
  );
  console.log(
    `  score zonder ondergrens        ${withoutBound.plan.score.totalPenaltyCents}  ` +
      `(boodschappen ${withoutBound.plan.totals.groceryCents})`,
  );
  console.log(
    `  geprijsd met / zonder          ${result.plan.diagnostics.weeksFullyEvaluated} / ` +
      `${withoutBound.plan.diagnostics.weeksFullyEvaluated}`,
  );
}

console.log(`\n  Hele run\n`);
console.log(`  voorbereiding                  ${prepMs.toFixed(1)} ms`);
console.log(`  stage A kandidaatgeneratie     ${genMs.toFixed(1)} ms`);
console.log(`  optimiseWeek totaal            ${totalMs.toFixed(0)} ms`);
if (result.status === 'OK') {
  const d = result.plan.diagnostics;
  console.log(`\n  weken geprijsd                 ${d.weeksFullyEvaluated}`);
  console.log(`  waarvan swaps                  ${d.localSearchEvaluations}`);
  console.log(`  gesnoeid door ondergrens       ${d.localSearchPruned}`);
  console.log(`  winkelcombinaties              ${d.storeCombinationsEvaluated}`);
  console.log(`  ingrediënten in de week        ${requirements.length}`);
  console.log(
    `\n  ${d.weeksFullyEvaluated} × ${evalMs.toFixed(2)} ms = ` +
      `${(d.weeksFullyEvaluated * evalMs).toFixed(0)} ms van de ${totalMs.toFixed(0)} ms`,
  );
  console.log(
    `  waarvan verpakkingsmatrix      ${((matrixMs / evalMs) * 100).toFixed(0)}% van elke evaluatie`,
  );
  console.log(
    `  ${d.localSearchPruned} × ${coldBound.toFixed(2)} ms ondergrens = ` +
      `${(d.localSearchPruned * coldBound).toFixed(0)} ms`,
  );
}
console.log('');
void aggMs;
void storeMs;
