import { buildIngredientIndex } from '@/domain/ingredients/types';
import { normaliseRecipes } from '@/domain/recipes/normalise';
import { resolveOffersForLocation } from '@/domain/stores/offers';
import type { StoreCandidate } from '@/domain/optimization/store-selection';
import { roadDistanceKm } from '@/domain/trip/distance';
import { SEED_INGREDIENTS } from '@/data/seed/ingredients';
import { SEED_RECIPES } from '@/data/seed/recipes';
import { SEED_CHAINS, SEED_LOCATIONS } from '@/data/seed/stores';
import { buildSeedProducts, buildSeedPromotions } from '@/data/seed/products';
import { DEMO_HOUSEHOLD } from '@/data/seed/demo-household';

/** A fixed date so every test runs against the same promotions. */
export const TEST_DATE = '2026-03-02'; // a Monday
export const TEST_TODAY = new Date('2026-03-02T09:00:00Z');

export const ingredientIndex = buildIngredientIndex(SEED_INGREDIENTS);
export const recipes = normaliseRecipes(SEED_RECIPES, ingredientIndex);
export const demoHousehold = DEMO_HOUSEHOLD;

const catalogue = buildSeedProducts();

export function storeCandidates(
  locationIds: readonly string[] = ['lidl-paterswoldseweg', 'jumbo-korreweg', 'ah-hoogkerk'],
  onDate = TEST_DATE,
): StoreCandidate[] {
  const promotions = buildSeedPromotions(onDate);
  const home = {
    latitude: DEMO_HOUSEHOLD.location.latitude!,
    longitude: DEMO_HOUSEHOLD.location.longitude!,
  };

  return SEED_LOCATIONS.filter((l) => locationIds.includes(l.id)).map((location) => {
    const chain = SEED_CHAINS.find((c) => c.id === location.chainId)!;
    const resolved = resolveOffersForLocation(location, {
      products: catalogue.products,
      prices: catalogue.prices,
      promotions,
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
