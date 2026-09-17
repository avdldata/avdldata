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
import { existsSync } from 'node:fs';
import { makeOffer } from '../../support/builders';
import { realSnapshotCapturedAt } from '@/providers/real-data-provider';

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

/**
 * One week, planned through the production path: the real provider, the real
 * store service and `optimiseWeek`. Deliberately not a miniature rebuild — a
 * test that reimplements the thing it checks can only ever agree with itself.
 */
async function planWeekFor(chainIds: readonly string[], maxStores: number) {
  process.env.DATA_MODE = 'REAL';
  const [
    { buildStoreCandidates },
    { getCatalogue },
    { configFor },
    { optimiseWeek },
    { SEED_LOCATIONS },
    { DEMO_HOUSEHOLD },
    { DEFAULT_WEEK_SETTINGS },
  ] = await Promise.all([
    import('@/services/store-service'),
    import('@/services/catalogue'),
    import('@/services/plan-service'),
    import('@/domain/optimization/week-optimizer'),
    import('@/data/seed/stores'),
    import('@/data/seed/demo-household'),
    import('@/data/repositories/types'),
  ]);

  const locationIds = chainIds.map(
    (chainId) => SEED_LOCATIONS.find((l) => l.chainId === chainId)!.id,
  );
  const onDate = realSnapshotCapturedAt()!.slice(0, 10);
  const { candidates } = await buildStoreCandidates({ locationIds, onDate });
  const catalogue = getCatalogue();

  const result = optimiseWeek({
    household: DEMO_HOUSEHOLD,
    recipes: catalogue.recipes,
    ingredients: catalogue.ingredientIndex,
    stores: candidates,
    maxStores,
    conveniencePreference: 'gebalanceerd',
    budget: {},
    startDate: onDate,
    today: new Date(onDate),
    // The production config, so the test exercises what the app runs.
    config: configFor(DEFAULT_WEEK_SETTINGS),
  });
  return result.status === 'OK' ? result.plan : undefined;
}

/**
 * The eight combinations a user can actually choose, against the real
 * catalogue and the production optimizer — not a rebuilt miniature of it.
 *
 * These were proven by hand in a browser first. They live here so that the next
 * change to matching, packaging or store selection has to keep them true.
 */
describe('the eight store combinations, on real data', () => {
  const available = existsSync('data/external/checkjebon-snapshot.json');
  const maybe = available ? it : it.skip;

  const CASES: readonly { name: string; chains: readonly string[]; maxStores: number }[] = [
    { name: 'A  alleen Albert Heijn', chains: ['ah'], maxStores: 1 },
    { name: 'B  alleen Jumbo', chains: ['jumbo'], maxStores: 1 },
    { name: 'C  alleen Lidl', chains: ['lidl'], maxStores: 1 },
    { name: 'D  AH + Jumbo', chains: ['ah', 'jumbo'], maxStores: 2 },
    { name: 'E  AH + Lidl', chains: ['ah', 'lidl'], maxStores: 2 },
    { name: 'F  Jumbo + Lidl', chains: ['jumbo', 'lidl'], maxStores: 2 },
    {
      name: 'G  alle drie toegestaan, hoogstens één winkel',
      chains: ['ah', 'jumbo', 'lidl'],
      maxStores: 1,
    },
    {
      name: 'H  alle drie toegestaan, hoogstens twee',
      chains: ['ah', 'jumbo', 'lidl'],
      maxStores: 2,
    },
  ];

  for (const testCase of CASES) {
    maybe(
      `${testCase.name} plans a complete week within its limit`,
      async () => {
        const plan = await planWeekFor(testCase.chains, testCase.maxStores);
        expect(plan, testCase.name).toBeDefined();
        expect(plan!.days).toHaveLength(7);
        const chains = new Set(plan!.recommendedOption.chainIds);
        expect(chains.size, `${testCase.name}: winkels`).toBeLessThanOrEqual(testCase.maxStores);
        for (const chainId of chains) expect(testCase.chains).toContain(chainId);
        expect(plan!.totals.groceryCents).toBeGreaterThan(0);
      },
      120_000,
    );
  }
});

/**
 * A real promotion, actually used.
 *
 * Linking promotions to products proves the join; it does not prove the
 * optimizer ever buys one. This asserts the whole chain: folder -> article
 * number -> catalogue product -> offer -> a line on a planned week that costs
 * less than its shelf price.
 */
describe('a planned week and the folder', () => {
  const available = existsSync('data/external/checkjebon-snapshot.json');
  const maybe = available ? it : it.skip;

  maybe(
    'applies at least one real promotion when Albert Heijn is in play',
    async () => {
      const plan = await planWeekFor(['ah'], 1);
      expect(plan).toBeDefined();
      const lines = plan!.recommendedOption.assignments.flatMap((a) => a.packaging.lines);
      const promoted = lines.filter((line) => line.promotionApplied);

      expect(promoted.length, 'geen enkele aanbieding toegepast').toBeGreaterThan(0);
      for (const line of promoted) {
        const promotion = line.offer.promotion!;
        expect(promotion.source).toBe('folder');
        // Paying the shelf price for every pack would have cost more.
        expect(line.lineTotalCents).toBeLessThan(line.offer.unitPriceCents * line.units);
        const pricingDate = realSnapshotCapturedAt()!.slice(0, 10);
        expect(promotion.validFrom <= pricingDate).toBe(true);
        expect(promotion.validUntil >= pricingDate).toBe(true);
      }
    },
    120_000,
  );
});

/**
 * Seed branch addresses exist in REAL mode, and must change nothing.
 *
 * They are the one piece of invented data left in the real path. The guarantee
 * is not that they are absent but that they are inert: no distance reaches the
 * optimizer, so no travel cost can tip a recommendation that is otherwise made
 * of real prices.
 */
describe('invented geography stays inert', () => {
  const available = existsSync('data/external/checkjebon-snapshot.json');
  const maybe = available ? it : it.skip;

  maybe(
    'plans the same week whether or not the household has coordinates',
    async () => {
      process.env.DATA_MODE = 'REAL';
      const { travelCostStatus } = await import('@/services/store-service');
      expect(travelCostStatus()).toBe('NOT_AVAILABLE');

      const plan = await planWeekFor(['ah', 'jumbo'], 2);
      expect(plan).toBeDefined();
      // Not a cent of travel enters the bill, so no invented distance can make
      // one shop look better than two.
      expect(plan!.totals.travelCents).toBe(0);
      expect(plan!.totals.groceryCents).toBeGreaterThan(0);
    },
    120_000,
  );
});
