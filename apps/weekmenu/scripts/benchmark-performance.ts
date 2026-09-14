/**
 * How long does planning a week actually take?
 *
 * Two datasets, because they answer different questions. The demo catalogue is
 * what a user meets today; the synthetic one is several times larger, and shows
 * whether the search degrades gracefully or falls off a cliff once the recipe
 * book grows.
 *
 * Run with:  pnpm bench:perf
 */
import { cents } from '../src/domain/units';
import { buildIngredientIndex } from '../src/domain/ingredients/types';
import { normaliseRecipes } from '../src/domain/recipes/normalise';
import { resolveOffersForLocation } from '../src/domain/stores/offers';
import { roadDistanceKm } from '../src/domain/trip/distance';
import { optimiseWeek, type OptimizerInput } from '../src/domain/optimization/week-optimizer';
import type { StoreCandidate } from '../src/domain/optimization/store-selection';
import type { Recipe } from '../src/domain/recipes/types';
import { SEED_INGREDIENTS } from '../src/data/seed/ingredients';
import { SEED_RECIPES } from '../src/data/seed/recipes';
import { SEED_BRANDS } from '../src/data/seed/brands';
import { SEED_CHAINS, SEED_LOCATIONS } from '../src/data/seed/stores';
import {
  buildSeedPriceObservations,
  buildSeedProducts,
  buildSeedPromotions,
} from '../src/data/seed/products';
import { DEMO_HOUSEHOLD } from '../src/data/seed/demo-household';

const ON_DATE = '2026-03-02';
const TODAY = new Date('2026-03-02T09:00:00Z');

const ingredientIndex = buildIngredientIndex(SEED_INGREDIENTS);
const recipes = normaliseRecipes(SEED_RECIPES, ingredientIndex);
const catalogue = buildSeedProducts();

function stores(locationIds: readonly string[]): StoreCandidate[] {
  const promotions = buildSeedPromotions(ON_DATE);
  const observations = buildSeedPriceObservations(ON_DATE);
  const home = {
    latitude: DEMO_HOUSEHOLD.location.latitude!,
    longitude: DEMO_HOUSEHOLD.location.longitude!,
  };

  return SEED_LOCATIONS.filter((location) => locationIds.includes(location.id)).map((location) => {
    const chain = SEED_CHAINS.find((candidate) => candidate.id === location.chainId)!;
    const resolved = resolveOffersForLocation(location, {
      products: catalogue.products,
      observations,
      promotions,
      brands: SEED_BRANDS,
      productNutrition: catalogue.productNutrition,
      ingredients: ingredientIndex,
      onDate: ON_DATE,
    });
    return {
      location,
      chain,
      distanceKm: Math.round(roadDistanceKm(home, location) * 10) / 10,
      offers: resolved.offers,
    };
  });
}

/**
 * A bigger catalogue: more *different* dishes, not more copies of the same one.
 *
 * The obvious way to grow the recipe book is to clone it under new ids, and it
 * is wrong. Clones are the same dish, so the cheapest week becomes the same
 * pasta five nights running — which is genuinely cheap, buys one big bag of
 * everything, and makes the optimizer look slow for the wrong reason: a handful
 * of ingredients in enormous amounts is the hardest case for the packaging
 * solver. The measurement then says "large catalogues are slow" when what it
 * measured was "eating one dish all week is slow".
 *
 * So each copy is shifted instead: its ingredients rotate through the pantry,
 * its cuisine and protein move on, and the amounts change. The result is a book
 * of genuinely different dishes with a realistic ingredient overlap, which is
 * what the search actually has to sift through.
 */
function inflatedRecipes(factor: number): Recipe[] {
  const ingredientIds = [...ingredientIndex.keys()].sort();
  const cuisines = [...new Set(recipes.map((recipe) => recipe.cuisine))];
  const proteins = [...new Set(recipes.map((recipe) => recipe.primaryProtein))];

  const grown: Recipe[] = [];
  for (let copy = 0; copy < factor; copy += 1) {
    for (const [index, recipe] of recipes.entries()) {
      if (copy === 0) {
        grown.push(recipe);
        continue;
      }

      const shift = copy * 7 + index;
      grown.push({
        ...recipe,
        id: `${recipe.id}-v${copy}`,
        name: `${recipe.name} ${copy}`,
        cuisine: cuisines[(cuisines.indexOf(recipe.cuisine) + copy) % cuisines.length]!,
        primaryProtein:
          proteins[(proteins.indexOf(recipe.primaryProtein) + copy) % proteins.length]!,
        ingredients: recipe.ingredients.map((line, position) => ({
          ...line,
          ingredientId: ingredientIds[(shift + position * 3) % ingredientIds.length]!,
          perServing: {
            ...line.perServing,
            amount: Math.max(10, Math.round(line.perServing.amount * (0.7 + (shift % 7) * 0.1))),
          },
        })),
      });
    }
  }
  return grown;
}

function timed(label: string, input: OptimizerInput, runs = 5): void {
  const warmUp = optimiseWeek(input);
  if (warmUp.status !== 'OK') {
    console.log(`  ${label.padEnd(46)} FAILED (${warmUp.reason})`);
    return;
  }

  const samples: number[] = [];
  for (let run = 0; run < runs; run += 1) {
    const started = performance.now();
    optimiseWeek(input);
    samples.push(performance.now() - started);
  }
  samples.sort((a, b) => a - b);
  const mean = samples.reduce((sum, value) => sum + value, 0) / samples.length;

  console.log(
    `  ${label.padEnd(46)} ${mean.toFixed(0).padStart(5)} ms mean   ` +
      `${samples[0]!.toFixed(0).padStart(5)} ms fastest   ` +
      `${samples.at(-1)!.toFixed(0).padStart(5)} ms slowest   ` +
      `(${warmUp.plan.diagnostics.candidateRecipes} candidates, ` +
      `${warmUp.plan.diagnostics.weeksFullyEvaluated} weeks priced, ` +
      `${warmUp.plan.diagnostics.localSearchEvaluations} swaps, ` +
      `${warmUp.plan.diagnostics.localSearchPruned} pruned, ` +
      `${warmUp.plan.diagnostics.storeCombinationsEvaluated} store combinations)`,
  );
}

const threeStores = stores(['lidl-paterswoldseweg', 'jumbo-korreweg', 'ah-hoogkerk']);

function input(over: Partial<OptimizerInput> = {}): OptimizerInput {
  return {
    household: DEMO_HOUSEHOLD,
    recipes,
    ingredients: ingredientIndex,
    stores: threeStores,
    maxStores: 3,
    conveniencePreference: 'gebalanceerd',
    budget: {},
    startDate: ON_DATE,
    today: TODAY,
    ...over,
  };
}

console.log('\nWeek generation — the catalogue a user meets today\n');
timed('demo dataset, 1 shop', input({ maxStores: 1 }));
timed('demo dataset, 2 shops', input({ maxStores: 2 }));
timed('demo dataset, 3 shops', input({ maxStores: 3 }));
timed('demo dataset, hard budget maximum', input({ budget: { hardMaxCents: cents(3800) } }));

console.log('\nWeek generation — a catalogue several times larger\n');
for (const factor of [2, 4, 8]) {
  const grown = inflatedRecipes(factor);
  timed(`${grown.length} recipes, 3 shops`, input({ recipes: grown }), 3);
}

console.log('');
