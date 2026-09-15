/**
 * Where does a real-data week actually spend its time?
 *
 * The candidate-explosion hypothesis says the optimizer drowns in near-identical
 * products. That is a testable claim, and testing it first avoids building a
 * pruning layer for a problem that turns out to be somewhere else entirely.
 *
 *   pnpm perf:real
 */
import { optimiseWeek } from '../src/domain/optimization/week-optimizer';
import { prepareOptimization } from '../src/domain/optimization/prepare';
import { generateCandidateWeeks } from '../src/domain/optimization/candidates';
import { evaluateWeek } from '../src/domain/optimization/evaluate-week';
import { weekLowerBound } from '../src/domain/optimization/lower-bound';
import {
  buildPackagingMatrix,
  enumerateStoreOptions,
  type PackagingCache,
} from '../src/domain/optimization/store-selection';
import {
  aggregateWeekIngredients,
  purchasableRequirements,
} from '../src/domain/aggregation/aggregate';
import { DEMO_HOUSEHOLD } from '../src/data/seed/demo-household';
import { loadRealChains, type RealChainId } from '../tests/support/real-data-store';

const args = process.argv.slice(2);
const chainIds = (args.indexOf('--chains') !== -1 ? args[args.indexOf('--chains') + 1]! : 'ah')
  .split(',')
  .map((c) => c.trim()) as RealChainId[];
const maxStores = Number(
  args.indexOf('--max-stores') !== -1 ? args[args.indexOf('--max-stores') + 1] : 1,
);

const ingestStarted = performance.now();
const fixture = loadRealChains(chainIds);
const ingestMs = performance.now() - ingestStarted;
const ingredientIndex = fixture.ingredientIndex;
const recipes = fixture.recipes;
const offers = fixture.chains.flatMap((c) => c.reducedOffers);

const input = {
  household: DEMO_HOUSEHOLD,
  recipes,
  ingredients: ingredientIndex,
  stores: fixture.stores,
  maxStores,
  conveniencePreference: 'gebalanceerd' as const,
  budget: {},
  startDate: '2026-09-14',
  today: new Date('2026-09-14T09:00:00Z'),
};

console.log(
  `\nProfiel met echte data — ${chainIds.join(' + ')}, ` +
    `maximaal ${maxStores} winkel${maxStores === 1 ? '' : 's'}, ` +
    `${offers.length} bruikbare aanbiedingen\n`,
);
for (const chain of fixture.chains) {
  const perIngredient = new Map<string, number>();
  for (const offer of chain.reducedOffers) {
    perIngredient.set(offer.ingredientId, (perIngredient.get(offer.ingredientId) ?? 0) + 1);
  }
  const counts = [...perIngredient.values()].sort((a, b) => a - b);
  const mean = counts.reduce((sum, n) => sum + n, 0) / Math.max(1, counts.length);
  console.log(
    `  ${chain.chainId.padEnd(6)} ${String(chain.reducedOffers.length).padStart(4)} aanbiedingen over ` +
      `${counts.length} ingrediënten — gemiddeld ${mean.toFixed(1)}, ` +
      `mediaan ${counts[Math.floor(counts.length / 2)] ?? 0}, max ${counts.at(-1) ?? 0}`,
  );
}
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

/*
 * Cache hit rate, measured rather than asserted.
 *
 * `buildPackagingMatrix` memoises on (ingredient, amount, shop). A run that
 * prices dozens of weeks over the same catalogue should hit that memo almost
 * always; if it does not, the key is wrong and the packaging solver is being
 * paid for over and over.
 */
const counting: PackagingCache = new Map();
let lookups = 0;
let misses = 0;
const instrumented: PackagingCache = {
  get(key: string) {
    lookups += 1;
    const hit = counting.get(key);
    if (hit === undefined) misses += 1;
    return hit;
  },
  set(key: string, value: NonNullable<ReturnType<PackagingCache['get']>>) {
    counting.set(key, value);
    return instrumented;
  },
} as unknown as PackagingCache;
for (const candidate of generated.weeks.slice(0, 40)) {
  evaluateWeek({
    recipes: candidate.recipes,
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
    packagingCache: instrumented,
  });
}
console.log(
  `\n  verpakkingscache               ${lookups} opzoekingen, ${misses} missers, ` +
    `${(((lookups - misses) / Math.max(1, lookups)) * 100).toFixed(1)}% raak`,
);

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
