import { describe, expect, it } from 'vitest';
import { euros } from '@/domain/units';
import { optimiseWeek } from '@/domain/optimization/week-optimizer';
import { SeedStoreLocatorProvider } from '@/providers/locator/seed-locator';
import {
  demoHousehold,
  ingredientIndex,
  recipes,
  storeCandidates,
  TEST_DATE,
  TEST_TODAY,
} from '../support/fixtures';
import { makeHousehold, makeMember } from '../support/builders';

function input(overrides: Partial<Parameters<typeof optimiseWeek>[0]> = {}) {
  return {
    household: demoHousehold,
    recipes,
    ingredients: ingredientIndex,
    stores: storeCandidates(),
    maxStores: 2,
    conveniencePreference: 'gebalanceerd' as const,
    budget: {},
    startDate: TEST_DATE,
    today: TEST_TODAY,
    ...overrides,
  };
}

/**
 * The failure modes from the brief. The rule for all of them is the same:
 * fail clearly, never crash, and never quietly break a dietary rule to make a
 * number look better.
 */
describe('edge cases', () => {
  it('refuses to plan for a household with no members', () => {
    const result = optimiseWeek(input({ household: makeHousehold({ members: [] }) }));
    expect(result.status).toBe('FAILED');
    if (result.status === 'FAILED') expect(result.reason).toBe('NO_MEMBERS');
  });

  it('refuses to plan with no stores selected', () => {
    const result = optimiseWeek(input({ stores: [] }));
    expect(result.status).toBe('FAILED');
    if (result.status === 'FAILED') expect(result.reason).toBe('NO_STORES');
  });

  it('explains itself when no recipe survives the dietary rules', () => {
    const impossible = makeHousehold({
      members: [
        makeMember({ diet: 'veganistisch', allergies: ['gluten', 'soja', 'noten', 'sesam'] }),
      ],
      preferences: {
        ingredients: [],
        cuisines: [],
        tags: [
          { value: 'rijst', level: 'EXCLUDE' },
          { value: 'aardappelen', level: 'EXCLUDE' },
          { value: 'pasta', level: 'EXCLUDE' },
          { value: 'salade', level: 'EXCLUDE' },
          { value: 'soep', level: 'EXCLUDE' },
          { value: 'wraps', level: 'EXCLUDE' },
          { value: 'brood', level: 'EXCLUDE' },
          { value: 'noedels', level: 'EXCLUDE' },
          { value: 'eenpansgerecht', level: 'EXCLUDE' },
          { value: 'ovenschotel', level: 'EXCLUDE' },
        ],
      },
    });
    const result = optimiseWeek(input({ household: impossible }));
    expect(result.status).toBe('FAILED');
    if (result.status === 'FAILED') {
      expect(['NO_ELIGIBLE_RECIPES', 'NOT_ENOUGH_CANDIDATE_RECIPES']).toContain(result.reason);
      expect(result.excludedRecipes.length).toBeGreaterThan(0);
      expect(result.message).toMatch(/recept/i);
    }
  });

  it('says how many recipes are left when there are too few for a week', () => {
    const result = optimiseWeek(input({ recipes: recipes.slice(0, 3) }));
    expect(result.status).toBe('FAILED');
    if (result.status === 'FAILED') {
      expect(result.reason).toBe('NOT_ENOUGH_CANDIDATE_RECIPES');
      expect(result.message).toContain('3');
    }
  });

  it('never plans a dish containing an allergen, whatever it costs', () => {
    const household = makeHousehold({
      members: [makeMember({ allergies: ['gluten', 'melk'] })],
      location: demoHousehold.location,
    });
    const result = optimiseWeek(input({ household }));
    if (result.status !== 'OK') throw new Error(result.message);
    for (const day of result.plan.days) {
      expect(day.recipe.allergens).not.toContain('gluten');
      expect(day.recipe.allergens).not.toContain('melk');
    }
  });

  it('never plans a pregnancy-unsafe dish, even under a tight budget', () => {
    const result = optimiseWeek(input({ budget: { hardMaxCents: euros(20) } }));
    if (result.status !== 'OK') throw new Error(result.message);
    expect(result.plan.days.every((d) => d.recipe.pregnancySuitable)).toBe(true);
    expect(result.plan.budget.met).toBe(false);
  });

  it('honours an ingredient exclusion across the whole week', () => {
    const household = makeHousehold({
      members: [makeMember({ excludedIngredientIds: ['kipfilet', 'gehakt-rund'] })],
      location: demoHousehold.location,
    });
    const result = optimiseWeek(input({ household }));
    if (result.status !== 'OK') throw new Error(result.message);
    for (const day of result.plan.days) {
      const ids = day.recipe.ingredients.filter((l) => !l.optional).map((l) => l.ingredientId);
      expect(ids).not.toContain('kipfilet');
      expect(ids).not.toContain('gehakt-rund');
    }
  });

  it('shops at exactly one store when told to', () => {
    const result = optimiseWeek(input({ maxStores: 1 }));
    if (result.status !== 'OK') throw new Error(result.message);
    expect(result.plan.recommendedOption.locationIds).toHaveLength(1);
    expect(result.plan.alternativeOptions.every((o) => o.locationIds.length === 1)).toBe(true);
  });

  it('still produces a week when only one store is available at all', () => {
    const result = optimiseWeek(input({ stores: storeCandidates(['lidl-paterswoldseweg']) }));
    if (result.status !== 'OK') throw new Error(result.message);
    expect(result.plan.recommendedOption.chainIds).toEqual(['lidl']);
  });

  it('reports items it could not source rather than pretending they are free', () => {
    // A store list where one chain simply does not stock several things.
    const result = optimiseWeek(input({ stores: storeCandidates(['plus-beijum']), maxStores: 1 }));
    if (result.status !== 'OK') throw new Error(result.message);
    for (const item of result.plan.recommendedOption.unavailable) {
      expect(item.triedLocationIds.length).toBeGreaterThan(0);
    }
    // Anything unsourced must show up in the score as a penalty, not vanish.
    if (result.plan.recommendedOption.unavailable.length > 0) {
      expect(result.plan.score.unavailablePenaltyCents).toBeGreaterThan(0);
    }
  });

  it('copes with a member whose weight and height are unknown', () => {
    const household = makeHousehold({
      members: [makeMember({ name: 'Onbekend', ageYears: 40 })],
      location: demoHousehold.location,
    });
    const result = optimiseWeek(input({ household }));
    if (result.status !== 'OK') throw new Error(result.message);
    expect(result.plan.memberNutrition[0]!.estimateQuality).toBe('low');
    expect(result.plan.days).toHaveLength(7);
  });

  it('meets a generous budget and says so', () => {
    const result = optimiseWeek(input({ budget: { targetCents: euros(120) } }));
    if (result.status !== 'OK') throw new Error(result.message);
    expect(result.plan.budget.met).toBe(true);
    expect(result.plan.score.budgetPenaltyCents).toBe(0);
    expect(result.plan.reasons.map((r) => r.code)).toContain('BUDGET_MET');
  });

  it('reports the real cost when the hard budget is impossible', () => {
    const result = optimiseWeek(input({ budget: { hardMaxCents: euros(10) } }));
    if (result.status !== 'OK') throw new Error(result.message);
    expect(result.plan.budget.met).toBe(false);
    expect(result.plan.budget.shortfallCents).toBe(result.plan.totals.groceryCents - euros(10));
    expect(result.plan.reasons.map((r) => r.code)).toContain('BUDGET_EXCEEDED');
  });

  it('handles a household with no coordinates without crashing', () => {
    const household = makeHousehold({
      location: {
        postalCode: '9711 LM',
        city: 'Groningen',
        country: 'Nederland',
        precision: 'onbekend',
      },
    });
    const result = optimiseWeek(input({ household }));
    expect(result.status).toBe('OK');
  });
});

describe('store locator radius', () => {
  const locator = new SeedStoreLocatorProvider();
  const home = { latitude: 53.2194, longitude: 6.5665 };

  it('finds the three priority chains within ten kilometres', async () => {
    const stores = await locator.findNearbyStores({ ...home, radiusKm: 10 });
    const chains = new Set(stores.map((s) => s.location.chainId));
    expect(chains.has('lidl')).toBe(true);
    expect(chains.has('jumbo')).toBe(true);
    expect(chains.has('ah')).toBe(true);
  });

  it('excludes stores beyond the radius and includes them when it grows', async () => {
    const near = await locator.findNearbyStores({ ...home, radiusKm: 5 });
    const wide = await locator.findNearbyStores({ ...home, radiusKm: 25 });
    expect(wide.length).toBeGreaterThan(near.length);
    expect(near.every((s) => s.distanceKm <= 5)).toBe(true);
  });

  it('returns nothing at all for an absurdly small radius, without failing', async () => {
    expect(await locator.findNearbyStores({ ...home, radiusKm: 0.1 })).toEqual([]);
  });

  it('can be filtered to specific chains', async () => {
    const stores = await locator.findNearbyStores({ ...home, radiusKm: 25, chainIds: ['lidl'] });
    expect(stores.every((s) => s.location.chainId === 'lidl')).toBe(true);
  });

  it('sorts nearest first', async () => {
    const stores = await locator.findNearbyStores({ ...home, radiusKm: 25 });
    const distances = stores.map((s) => s.distanceKm);
    expect([...distances].sort((a, b) => a - b)).toEqual(distances);
  });
});
