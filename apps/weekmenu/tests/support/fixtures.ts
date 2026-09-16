import { buildIngredientIndex } from '@/domain/ingredients/types';
import { SEED_BRANDS } from '@/data/seed/brands';
import { normaliseRecipes } from '@/domain/recipes/normalise';
import { resolveOffersForLocation } from '@/domain/stores/offers';
import type { StoreCandidate } from '@/domain/optimization/store-selection';
import { roadDistanceKm } from '@/domain/trip/distance';
import { SEED_INGREDIENTS } from '@/data/seed/ingredients';
import { SEED_RECIPES } from '@/data/seed/recipes';
import { SPRINT2_RECIPES } from '@/data/seed/recipes-sprint2';
import { SEED_CHAINS, SEED_LOCATIONS } from '@/data/seed/stores';
import {
  buildSeedPriceObservations,
  buildSeedProducts,
  buildSeedPromotions,
} from '@/data/seed/products';
import { DEMO_HOUSEHOLD } from '@/data/seed/demo-household';

/** A fixed date so every test runs against the same promotions. */
export const TEST_DATE = '2026-03-02'; // a Monday
export const TEST_TODAY = new Date('2026-03-02T09:00:00Z');

export const ingredientIndex = buildIngredientIndex(SEED_INGREDIENTS);
export const recipes = normaliseRecipes(SEED_RECIPES, ingredientIndex);

/**
 * The fifty-six dishes the demo dataset was priced around.
 *
 * A handful of tests assert what the *demo prices* make possible — that every
 * chain wins some aisle, that splitting the shopping is visibly cheaper. Those
 * claims are about the price list, but they can only be read off a concrete
 * week, and the week moves whenever the recipe library grows: at 138 recipes
 * the optimizer finds a cheaper menu whose shopping happens to spread across
 * fewer chains. Pinning those tests to the original menu keeps them about the
 * thing they are named after. The library has its own tests.
 */
export const demoMenuRecipes = recipes.filter(
  (recipe) => !SPRINT2_RECIPES.some((r) => r.id === recipe.id),
);
export const demoHousehold = DEMO_HOUSEHOLD;

const catalogue = buildSeedProducts();

export function storeCandidates(
  locationIds: readonly string[] = ['lidl-paterswoldseweg', 'jumbo-korreweg', 'ah-hoogkerk'],
  onDate = TEST_DATE,
): StoreCandidate[] {
  const promotions = buildSeedPromotions(onDate);
  const observations = buildSeedPriceObservations(onDate);
  const home = {
    latitude: DEMO_HOUSEHOLD.location.latitude!,
    longitude: DEMO_HOUSEHOLD.location.longitude!,
  };

  return SEED_LOCATIONS.filter((l) => locationIds.includes(l.id)).map((location) => {
    const chain = SEED_CHAINS.find((c) => c.id === location.chainId)!;
    const resolved = resolveOffersForLocation(location, {
      products: catalogue.products,
      observations,
      promotions,
      brands: SEED_BRANDS,
      productNutrition: catalogue.productNutrition,
      ingredients: ingredientIndex,
      onDate,
    });
    return {
      location,
      chain,
      distanceKm: Math.round(roadDistanceKm(home, location) * 10) / 10,
      offers: resolved.offers,
    };
  });
}

export function offersFor(ingredientId: string, locationId: string, onDate = TEST_DATE) {
  const store = storeCandidates([locationId], onDate)[0]!;
  return store.offers.filter((o) => o.ingredientId === ingredientId);
}
