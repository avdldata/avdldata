import { describe, expect, it } from 'vitest';
import {
  buildPackagingMatrix,
  cheapestChainPerCategory,
  enumerateStoreOptions,
  type StoreCandidate,
} from '@/domain/optimization/store-selection';
import { DEFAULT_PACKAGING_CONFIG } from '@/domain/packaging/types';
import { DEFAULT_TRIP_COST_CONFIG } from '@/domain/trip/trip-cost';
import { cents, euros } from '@/domain/units';
import type { WeekIngredientRequirement } from '@/domain/aggregation/aggregate';
import type { ProductOffer } from '@/domain/stores/types';

/**
 * A store that does not stock half the list has a lower bill purely because it
 * buys less. Ranking on that bill recommends an incomplete basket at a price
 * that is not the price of the week you planned — which is what these tests
 * exist to prevent.
 */

function offer(
  productId: string,
  ingredientId: string,
  amount: number,
  price: number,
): ProductOffer {
  return {
    productId,
    chainId: 'c',
    locationId: 'l',
    ingredientId,
    name: productId,
    brandName: 'Merk',
    isPrivateLabel: true,
    packageAmount: { amount, unit: 'g' },
    normalUnitPriceCents: cents(price),
    unitPriceCents: cents(price),
    pricePerBaseUnitCents: price / amount,
    nutritionOrigin: 'none',
  };
}

function store(id: string, offers: readonly ProductOffer[], latitude: number): StoreCandidate {
  return {
    location: {
      id,
      chainId: id,
      name: id,
      regionId: 'groningen',
      address: 'Teststraat 1',
      postalCode: '9711AA',
      city: 'Groningen',
      latitude,
      longitude: 6.56,
    },
    chain: { id, name: id.toUpperCase(), logoUrl: `/${id}.svg`, colorHex: '#123456' },
    distanceKm: 2,
    offers: offers.map((o) => ({ ...o, locationId: id, chainId: id })),
  };
}

function requirement(
  ingredientId: string,
  name: string,
  totalAmount: number,
  category: WeekIngredientRequirement['category'] = 'vlees-vis-vega',
): WeekIngredientRequirement {
  return {
    ingredientId,
    name,
    category,
    unit: 'g',
    totalAmount,
    perDay: [{ dayIndex: 0, amount: totalAmount }],
    pantryStaple: false,
    perishability: 'perishable',
  };
}

const requirements = [requirement('kip', 'Kipfilet', 500), requirement('zalm', 'Zalmfilet', 400)];

const partial = store('partial', [offer('p1', 'kip', 500, 400)], 53.2);
const complete = store(
  'complete',
  [offer('p2', 'kip', 500, 450), offer('p3', 'zalm', 400, 900)],
  53.21,
);

function optionsFor(stores: readonly StoreCandidate[], maxStores: number) {
  const matrix = buildPackagingMatrix(requirements, stores, DEFAULT_PACKAGING_CONFIG);
  return enumerateStoreOptions({
    requirements,
    stores,
    matrix,
    home: { latitude: 53.2, longitude: 6.56 },
    maxStores,
    extraStorePenaltyCents: euros(2.5),
    unavailableItemPenaltyCents: euros(6),
    tripConfig: DEFAULT_TRIP_COST_CONFIG,
  });
}

describe('a store that cannot supply the list never wins on price alone', () => {
  it('recommends the complete basket over the cheaper incomplete one', () => {
    const options = optionsFor([partial, complete], 2);
    const recommended = options[0]!;

    // The incomplete store really is cheaper on paper — that is the trap.
    const incomplete = options.find((o) => o.locationIds.join() === 'partial')!;
    expect(incomplete.groceryCents).toBeLessThan(recommended.groceryCents);
    expect(incomplete.practicalTotalCents).toBeLessThan(recommended.practicalTotalCents);
    expect(incomplete.unavailable.map((u) => u.name)).toEqual(['Zalmfilet']);

    // Every complete combination outranks it, and the cheapest of those wins.
    expect(recommended.unavailable).toHaveLength(0);
    expect(recommended.locationIds).toEqual(['complete']);
    expect(options.at(-1)).toBe(incomplete);
  });

  it('keeps the missing-item charge out of what the week actually costs', () => {
    const incomplete = optionsFor([partial, complete], 2).find(
      (o) => o.locationIds.join() === 'partial',
    )!;

    expect(incomplete.practicalTotalCents).toBe(
      incomplete.groceryCents +
        incomplete.trip.estimatedTravelCostCents +
        incomplete.extraStorePenaltyCents,
    );
    expect(incomplete.unavailablePenaltyCents).toBe(euros(6));
    expect(incomplete.comparableTotalCents).toBe(
      incomplete.practicalTotalCents + incomplete.unavailablePenaltyCents,
    );
  });

  it('still offers the incomplete option when it is the only one there is', () => {
    const options = optionsFor([partial], 1);
    expect(options).toHaveLength(1);
    expect(options[0]!.unavailable).toHaveLength(1);
  });
});

describe('the cheapest-per-category claim is backed by a real comparison', () => {
  it('names the chain that is genuinely cheapest for that category', () => {
    const cheapMeat = store(
      'cheapmeat',
      [offer('a1', 'kip', 500, 300), offer('a2', 'zalm', 400, 950)],
      53.2,
    );
    const cheapFish = store(
      'cheapfish',
      [offer('b1', 'kip', 500, 500), offer('b2', 'zalm', 400, 700)],
      53.21,
    );
    const stores = [cheapMeat, cheapFish];
    const matrix = buildPackagingMatrix(requirements, stores, DEFAULT_PACKAGING_CONFIG);

    // Meat + fish are one category here, so the winner is whoever is cheapest
    // across both: 300 + 950 = 1250 versus 500 + 700 = 1200.
    expect(cheapestChainPerCategory(requirements, stores, matrix).get('vlees-vis-vega')).toBe(
      'cheapfish',
    );
  });

  it('makes no claim when only one chain can supply the category', () => {
    const stores = [partial, complete];
    const matrix = buildPackagingMatrix(requirements, stores, DEFAULT_PACKAGING_CONFIG);
    expect(cheapestChainPerCategory(requirements, stores, matrix).size).toBe(0);
  });

  it('makes no claim when two chains cost exactly the same', () => {
    const a = store('a', [offer('a1', 'kip', 500, 400), offer('a2', 'zalm', 400, 800)], 53.2);
    const b = store('b', [offer('b1', 'kip', 500, 400), offer('b2', 'zalm', 400, 800)], 53.21);
    const stores = [a, b];
    const matrix = buildPackagingMatrix(requirements, stores, DEFAULT_PACKAGING_CONFIG);
    expect(cheapestChainPerCategory(requirements, stores, matrix).size).toBe(0);
  });
});
