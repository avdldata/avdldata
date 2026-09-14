import { describe, expect, it } from 'vitest';
import { euros } from '@/domain/units';
import { DEFAULT_PACKAGING_CONFIG } from '@/domain/packaging/types';
import { DEFAULT_TRIP_COST_CONFIG } from '@/domain/trip/trip-cost';
import {
  buildPackagingMatrix,
  enumerateStoreOptions,
  evaluateStoreCombination,
  representativeStoresPerChain,
  type StoreCandidate,
} from '@/domain/optimization/store-selection';
import type { WeekIngredientRequirement } from '@/domain/aggregation/aggregate';
import { makeOffer } from '../support/builders';

const home = { latitude: 53.2194, longitude: 6.5665 };

function candidate(
  chainId: string,
  latitude: number,
  longitude: number,
  offers: ReturnType<typeof makeOffer>[],
  distanceKm: number,
  locationId = `${chainId}-1`,
): StoreCandidate {
  return {
    location: {
      id: locationId,
      chainId,
      name: chainId,
      address: '',
      postalCode: '',
      city: 'Groningen',
      latitude,
      longitude,
      regionId: 'noord',
    },
    chain: { id: chainId, name: chainId, logoUrl: '', colorHex: '#000' },
    distanceKm,
    offers,
  };
}

function requirement(
  id: string,
  amount: number,
  category: WeekIngredientRequirement['category'] = 'overig',
): WeekIngredientRequirement {
  return {
    ingredientId: id,
    name: id,
    category,
    unit: 'g',
    totalAmount: amount,
    perDay: [{ dayIndex: 0, amount }],
    pantryStaple: false,
    perishability: 'perishable',
  };
}

describe('store combinations', () => {
  const requirements = [
    requirement('groente', 1000, 'groente-fruit'),
    requirement('vlees', 1000, 'vlees-vis-vega'),
  ];

  /**
   * Two complementary stores: Lidl is far cheaper on greens, Jumbo far cheaper
   * on meat. Either store alone costs €13,00; splitting costs €6,00.
   */
  const lidl = candidate(
    'lidl',
    53.2094,
    6.549,
    [
      makeOffer({
        ingredientId: 'groente',
        packAmount: 1000,
        priceCents: 100,
        chainId: 'lidl',
        locationId: 'lidl-1',
        productId: 'lidl-groente',
      }),
      makeOffer({
        ingredientId: 'vlees',
        packAmount: 1000,
        priceCents: 1200,
        chainId: 'lidl',
        locationId: 'lidl-1',
        productId: 'lidl-vlees',
      }),
    ],
    2.1,
  );
  const jumbo = candidate(
    'jumbo',
    53.2344,
    6.5966,
    [
      makeOffer({
        ingredientId: 'groente',
        packAmount: 1000,
        priceCents: 800,
        chainId: 'jumbo',
        locationId: 'jumbo-1',
        productId: 'jumbo-groente',
      }),
      makeOffer({
        ingredientId: 'vlees',
        packAmount: 1000,
        priceCents: 500,
        chainId: 'jumbo',
        locationId: 'jumbo-1',
        productId: 'jumbo-vlees',
      }),
    ],
    3.4,
  );

  const stores = [lidl, jumbo];
  const matrix = buildPackagingMatrix(requirements, stores, DEFAULT_PACKAGING_CONFIG);

  const options = (input: {
    stores: readonly StoreCandidate[];
    maxStores: number;
    penalty: number;
  }) => {
    const localMatrix = buildPackagingMatrix(requirements, input.stores, DEFAULT_PACKAGING_CONFIG);
    return enumerateStoreOptions({
      requirements,
      stores: input.stores,
      matrix: localMatrix,
      home,
      maxStores: input.maxStores,
      extraStorePenaltyCents: euros(input.penalty),
      unavailableItemPenaltyCents: euros(6),
      tripConfig: DEFAULT_TRIP_COST_CONFIG,
    });
  };

  it('buys each ingredient wherever it is cheapest within the chosen set', () => {
    const combination = evaluateStoreCombination(requirements, stores, matrix);
    expect(combination.groceryCents).toBe(600); // €1,00 at Lidl + €5,00 at Jumbo
    expect(combination.locationIds).toEqual(['jumbo-1', 'lidl-1']);
  });

  it('collapses to one store when the second adds nothing', () => {
    const onlyGreens = [requirement('groente', 1000, 'groente-fruit')];
    const onlyGreensMatrix = buildPackagingMatrix(onlyGreens, stores, DEFAULT_PACKAGING_CONFIG);
    const combination = evaluateStoreCombination(onlyGreens, stores, onlyGreensMatrix);
    expect(combination.locationIds).toEqual(['lidl-1']);
  });

  it('never exceeds the maximum number of stores', () => {
    const result = options({ stores, maxStores: 1, penalty: 0 });
    expect(result.length).toBeGreaterThan(0);
    for (const option of result) expect(option.locationIds).toHaveLength(1);
    // Both single stores cost €13,00 on groceries; Lidl is nearer, so it wins.
    expect(result[0]!.locationIds).toEqual(['lidl-1']);
    expect(result[0]!.groceryCents).toBe(1300);
  });

  it('recommends two stores when the saving is worth the detour', () => {
    const result = options({ stores, maxStores: 2, penalty: 2.5 });
    expect(result[0]!.locationIds).toHaveLength(2);
    expect(result[0]!.groceryCents).toBe(600);
  });

  it('recommends one store when the saving is trivial', () => {
    // Now the second store only saves €0,10 on the whole list.
    const nearlyIdentical = [
      candidate(
        'lidl',
        53.2094,
        6.549,
        [
          makeOffer({
            ingredientId: 'groente',
            packAmount: 1000,
            priceCents: 100,
            chainId: 'lidl',
            locationId: 'lidl-1',
            productId: 'l-g',
          }),
          makeOffer({
            ingredientId: 'vlees',
            packAmount: 1000,
            priceCents: 500,
            chainId: 'lidl',
            locationId: 'lidl-1',
            productId: 'l-v',
          }),
        ],
        2.1,
      ),
      candidate(
        'jumbo',
        53.2344,
        6.5966,
        [
          makeOffer({
            ingredientId: 'groente',
            packAmount: 1000,
            priceCents: 150,
            chainId: 'jumbo',
            locationId: 'jumbo-1',
            productId: 'j-g',
          }),
          makeOffer({
            ingredientId: 'vlees',
            packAmount: 1000,
            priceCents: 490,
            chainId: 'jumbo',
            locationId: 'jumbo-1',
            productId: 'j-v',
          }),
        ],
        3.4,
      ),
    ];
    const result = options({ stores: nearlyIdentical, maxStores: 2, penalty: 2.5 });
    expect(result[0]!.locationIds).toEqual(['lidl-1']);

    // The cheaper-on-paper split still exists — it simply does not win.
    const split = result.find((o) => o.locationIds.length === 2)!;
    expect(split.groceryCents).toBeLessThan(result[0]!.groceryCents);
    expect(split.practicalTotalCents).toBeGreaterThan(result[0]!.practicalTotalCents);
  });

  it('chooses the cheapest split when convenience is not valued at all', () => {
    const result = options({ stores, maxStores: 2, penalty: 0 });
    expect(result[0]!.locationIds).toHaveLength(2);
    expect(result[0]!.groceryCents).toBe(600);
  });

  it('reports an ingredient that no chosen store sells', () => {
    const missing = [...requirements, requirement('exoot', 100)];
    const missingMatrix = buildPackagingMatrix(missing, stores, DEFAULT_PACKAGING_CONFIG);
    const combination = evaluateStoreCombination(missing, stores, missingMatrix);
    expect(combination.unavailable.map((u) => u.ingredientId)).toEqual(['exoot']);
    expect(combination.assignments).toHaveLength(2);
  });

  it('falls back to another store when one chain does not stock an item', () => {
    const jumboWithoutGreens = candidate(
      'jumbo',
      53.2344,
      6.5966,
      [
        makeOffer({
          ingredientId: 'vlees',
          packAmount: 1000,
          priceCents: 500,
          chainId: 'jumbo',
          locationId: 'jumbo-1',
          productId: 'j-v3',
        }),
      ],
      3.4,
    );
    const mixed = [lidl, jumboWithoutGreens];
    const mixedMatrix = buildPackagingMatrix(requirements, mixed, DEFAULT_PACKAGING_CONFIG);
    const combination = evaluateStoreCombination(requirements, mixed, mixedMatrix);
    expect(combination.unavailable).toHaveLength(0);
    expect(combination.assignments.find((a) => a.ingredientId === 'groente')!.chainId).toBe('lidl');
  });

  it('visits only the nearest branch of a chain', () => {
    const far = candidate('lidl', 53.25, 6.62, [], 6.4, 'lidl-2');
    const nearest = representativeStoresPerChain([far, lidl, jumbo]);
    expect(nearest.map((s) => s.location.id).sort()).toEqual(['jumbo-1', 'lidl-1']);
  });

  it('keeps travel cost separate from the grocery bill', () => {
    const best = options({ stores, maxStores: 2, penalty: 0 })[0]!;
    expect(best.practicalTotalCents).toBe(
      best.groceryCents + best.trip.estimatedTravelCostCents + best.extraStorePenaltyCents,
    );
    expect(best.trip.estimatedTravelCostCents).toBeGreaterThan(0);
  });
});
