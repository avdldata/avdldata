import { describe, expect, it } from 'vitest';
import { euros } from '@/domain/units';
import { DEFAULT_PACKAGING_CONFIG } from '@/domain/packaging/types';
import { DEFAULT_TRIP_COST_CONFIG } from '@/domain/trip/trip-cost';
import {
  buildPackagingMatrix,
  enumerateStoreOptions,
  type StoreCandidate,
} from '@/domain/optimization/store-selection';
import type { WeekIngredientRequirement } from '@/domain/aggregation/aggregate';
import { makeOffer } from '../../support/builders';

/**
 * Three chains, and the two rules that decide whether the answer can be
 * trusted: a shop that cannot supply the week never wins, and the number of
 * shops the user agreed to is a limit rather than a preference.
 *
 * Both are cheap to get wrong in a way nobody notices — an incomplete basket is
 * genuinely cheaper, and a third shop genuinely saves money — so both are
 * pinned here rather than left to the ranking.
 */
const home = { latitude: 53.2194, longitude: 6.5665 };

function offersFor(
  chainId: string,
  rows: readonly { id: string; ingredientId: string; packAmount: number; priceCents: number }[],
) {
  return rows.map((r) =>
    makeOffer({
      productId: r.id,
      ingredientId: r.ingredientId,
      packAmount: r.packAmount,
      priceCents: r.priceCents,
      chainId,
      locationId: `${chainId}-1`,
    }),
  );
}

function store(
  chainId: string,
  offers: ReturnType<typeof makeOffer>[],
  km: number,
): StoreCandidate {
  return {
    location: {
      id: `${chainId}-1`,
      chainId,
      name: chainId,
      address: '',
      postalCode: '',
      city: 'Groningen',
      latitude: 53.22 + km / 1000,
      longitude: 6.57,
      regionId: 'noord',
    },
    chain: { id: chainId, name: chainId, logoUrl: '', colorHex: '#000' },
    distanceKm: km,
    offers,
  };
}

function need(id: string, amount: number): WeekIngredientRequirement {
  return {
    ingredientId: id,
    name: id,
    category: 'overig',
    unit: 'g',
    totalAmount: amount,
    perDay: [{ dayIndex: 0, amount }],
    pantryStaple: false,
    perishability: 'perishable',
  };
}

function optionsFor(
  stores: StoreCandidate[],
  requirements: WeekIngredientRequirement[],
  maxStores: number,
) {
  const matrix = buildPackagingMatrix(requirements, stores, DEFAULT_PACKAGING_CONFIG);
  return enumerateStoreOptions({
    requirements,
    stores,
    matrix,
    home,
    maxStores,
    extraStorePenaltyCents: euros(0),
    unavailableItemPenaltyCents: euros(6),
    tripConfig: DEFAULT_TRIP_COST_CONFIG,
  });
}

describe('an incomplete basket', () => {
  const requirements = [need('rijst', 500), need('zalmfilet', 400)];
  // Lidl is much cheaper on the one thing it stocks, and stocks nothing else.
  const stores = [
    store(
      'ah',
      offersFor('ah', [
        { id: 'ah-rijst', ingredientId: 'rijst', packAmount: 1000, priceCents: euros(3) },
        { id: 'ah-zalm', ingredientId: 'zalmfilet', packAmount: 500, priceCents: euros(9) },
      ]),
      2,
    ),
    store(
      'lidl',
      offersFor('lidl', [
        { id: 'lidl-rijst', ingredientId: 'rijst', packAmount: 1000, priceCents: euros(1) },
      ]),
      3,
    ),
  ];

  it('never wins on price, however much cheaper it looks', () => {
    const options = optionsFor(stores, requirements, 1);
    const best = options[0]!;
    expect(best.unavailable).toHaveLength(0);
    expect(best.locationIds).toEqual(['ah-1']);

    const lidlOnly = options.find((o) => o.locationIds.join() === 'lidl-1')!;
    expect(lidlOnly.unavailable.length).toBeGreaterThan(0);
    // It really is cheaper, which is exactly why completeness cannot be a
    // penalty you out-price.
    expect(lidlOnly.groceryCents).toBeLessThan(best.groceryCents);
    expect(options.indexOf(lidlOnly)).toBeGreaterThan(0);
  });

  it('is still offered when nothing can supply everything', () => {
    const options = optionsFor([stores[1]!], requirements, 1);
    expect(options).not.toHaveLength(0);
    expect(options[0]!.unavailable.length).toBeGreaterThan(0);
  });
});

describe('maxStores is a limit, not a preference', () => {
  // Each chain is cheapest on exactly one ingredient, so the optimizer has
  // every incentive to visit all three.
  const requirements = [need('rijst', 500), need('zalmfilet', 400), need('broccoli', 300)];
  const stores = [
    store(
      'ah',
      offersFor('ah', [
        { id: 'ah-rijst', ingredientId: 'rijst', packAmount: 1000, priceCents: euros(1) },
        { id: 'ah-zalm', ingredientId: 'zalmfilet', packAmount: 500, priceCents: euros(9) },
        { id: 'ah-broc', ingredientId: 'broccoli', packAmount: 500, priceCents: euros(3) },
      ]),
      2,
    ),
    store(
      'jumbo',
      offersFor('jumbo', [
        { id: 'ju-rijst', ingredientId: 'rijst', packAmount: 1000, priceCents: euros(3) },
        { id: 'ju-zalm', ingredientId: 'zalmfilet', packAmount: 500, priceCents: euros(5) },
        { id: 'ju-broc', ingredientId: 'broccoli', packAmount: 500, priceCents: euros(3) },
      ]),
      3,
    ),
    store(
      'lidl',
      offersFor('lidl', [
        { id: 'li-rijst', ingredientId: 'rijst', packAmount: 1000, priceCents: euros(3) },
        { id: 'li-zalm', ingredientId: 'zalmfilet', packAmount: 500, priceCents: euros(9) },
        { id: 'li-broc', ingredientId: 'broccoli', packAmount: 500, priceCents: euros(1) },
      ]),
      4,
    ),
  ];

  it('uses at most one chain when the user allows one', () => {
    for (const option of optionsFor(stores, requirements, 1)) {
      expect(option.locationIds.length).toBeLessThanOrEqual(1);
    }
  });

  it('never uses three chains when the user allows two', () => {
    const options = optionsFor(stores, requirements, 2);
    expect(options.length).toBeGreaterThan(0);
    for (const option of options) {
      expect(new Set(option.locationIds).size).toBeLessThanOrEqual(2);
    }
  });

  it('may use all three only when the user allows three', () => {
    const options = optionsFor(stores, requirements, 3);
    expect(options.some((o) => new Set(o.locationIds).size === 3)).toBe(true);
  });
});
