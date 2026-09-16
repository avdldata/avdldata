/* Every case here plans whole weeks with the real engines, so the default
 * five-second budget is far too tight; the suite is a few minutes by design. */
import { describe, expect, it } from 'vitest';
import { optimiseWeek } from '@/domain/optimization/week-optimizer';
import { findReplacements } from '@/domain/optimization/replace';
import { filterCandidateRecipes } from '@/domain/optimization/filter';
import { hardExcludedIngredientIds } from '@/domain/household/types';
import type { Household, HouseholdMember } from '@/domain/household/types';
import type { WeeklyPlan } from '@/domain/optimization/types';
import { SEED_RECIPES } from '@/data/seed/recipes';
import { SPRINT2_RECIPES } from '@/data/seed/recipes-sprint2';
import {
  demoHousehold,
  ingredientIndex,
  recipes,
  storeCandidates,
  TEST_TODAY,
} from '../support/fixtures';

/**
 * What a bigger library is actually for.
 *
 * Going from 56 dinners to 138 is only worth anything if the planner uses them:
 * if week after week comes back with the same seven dishes, the extra 82 are
 * decoration. These tests measure that — how many distinct recipes the planner
 * reaches across many households and many weeks, and whether "replace this
 * dish" still has somewhere to go once six days are locked.
 */
const stores = storeCandidates();

/** The library as it stood before Sprint 2, for the before/after comparison. */
const BASE_IDS = new Set(
  SEED_RECIPES.filter((r) => !SPRINT2_RECIPES.some((s) => s.id === r.id)).map((r) => r.id),
);

/** Twenty Mondays in a row, so the promotions and the seed date both move. */
function mondays(count: number): string[] {
  const dates: string[] = [];
  const start = new Date('2026-03-02T00:00:00Z');
  for (let i = 0; i < count; i += 1) {
    const d = new Date(start.getTime() + i * 7 * 24 * 3600 * 1000);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

function member(overrides: Partial<HouseholdMember> = {}): HouseholdMember {
  return {
    id: `m-${overrides.name ?? 'x'}`,
    name: 'Test',
    ageYears: 38,
    sex: 'vrouw',
    heightCm: 172,
    weightKg: 68,
    activityLevel: 'matig-actief',
    goal: 'behouden',
    diet: 'alles',
    allergies: [],
    excludedIngredientIds: [],
    ...overrides,
  };
}

function household(id: string, overrides: Partial<Household> = {}): Household {
  return { ...demoHousehold, id, ...overrides };
}

/**
 * Fifty households that differ in the ways the filter actually cares about:
 * size, diet, allergy, time budget and taste. Deterministic by construction —
 * the list is written out, not generated from a seed.
 */
const DIETS = ['alles', 'vegetarisch', 'veganistisch', 'pescotarisch'] as const;

function scenarios() {
  const out: { name: string; household: Household; maxMinutes?: number }[] = [];
  let n = 0;
  for (const diet of DIETS) {
    for (const size of [1, 2, 4, 5]) {
      for (const maxMinutes of [undefined, 30, 45]) {
        n += 1;
        if (out.length >= 48) break;
        out.push({
          name: `${diet}-${size}p-${maxMinutes ?? 'geen'}min`,
          household: household(`h-${n}`, {
            members: Array.from({ length: size }, (_, i) =>
              member({ name: `lid${i}`, diet, ageYears: i === 0 ? 38 : 8 + i * 6 }),
            ),
          }),
          ...(maxMinutes !== undefined ? { maxMinutes } : {}),
        });
      }
    }
  }
  out.push({
    name: 'glutenallergie',
    household: household('h-gluten', {
      members: [member({ name: 'a', allergies: ['gluten'] }), member({ name: 'b' })],
    }),
  });
  out.push({
    name: 'zwanger',
    household: household('h-zwanger', {
      members: [member({ name: 'a', pregnancy: { pregnant: true, trimester: 2 } })],
    }),
  });
  return out;
}

function planFor(input: {
  household: Household;
  startDate: string;
  maxMinutes?: number;
  lockedRecipeIds?: ReadonlyMap<number, string>;
  /** Narrower catalogue, for the "what has not been served yet" measurement. */
  pool?: readonly (typeof recipes)[number][];
}) {
  return optimiseWeek({
    household: input.household,
    recipes: input.pool ?? recipes,
    ingredients: ingredientIndex,
    stores,
    maxStores: 3,
    conveniencePreference: 'gebalanceerd',
    budget: {},
    startDate: input.startDate,
    today: TEST_TODAY,
    ...(input.maxMinutes !== undefined ? { maxMinutes: input.maxMinutes } : {}),
    ...(input.lockedRecipeIds ? { lockedRecipeIds: input.lockedRecipeIds } : {}),
  });
}

describe('generation across fifty households', { timeout: 600_000 }, () => {
  const cases = scenarios();
  const results = cases.map((c) => ({
    ...c,
    result: planFor({
      household: c.household,
      startDate: '2026-03-02',
      ...(c.maxMinutes !== undefined ? { maxMinutes: c.maxMinutes } : {}),
    }),
  }));

  it('runs fifty deliberately different households', () => {
    expect(cases.length).toBeGreaterThanOrEqual(50);
  });

  it('produces a full week for every one of them', () => {
    const failed = results.filter((r) => r.result.status !== 'OK').map((r) => r.name);
    expect(failed).toEqual([]);
    for (const { result } of results) {
      if (result.status !== 'OK') continue;
      expect(result.plan.days).toHaveLength(7);
    }
  });

  it('never serves the same dish twice in one week', () => {
    for (const { name, result } of results) {
      if (result.status !== 'OK') continue;
      const ids = result.plan.days.map((d) => d.recipe.id);
      expect(new Set(ids).size, name).toBe(7);
    }
  });

  it('reaches well beyond the seven dishes one household gets', () => {
    const used = new Set<string>();
    for (const { result } of results) {
      if (result.status !== 'OK') continue;
      for (const day of result.plan.days) used.add(day.recipe.id);
    }
    // Fifty households share a price list and an objective function, so they
    // converge on the cheap end of the library; what separates them is diet,
    // allergy and time budget. Forty distinct dishes is what that spread
    // actually produces — five and a half weeks of dinners with no overlap.
    expect(used.size).toBeGreaterThanOrEqual(40);
  });

  it('serves recipes written in this sprint, not only the original fifty-six', () => {
    const used = new Set<string>();
    for (const { result } of results) {
      if (result.status !== 'OK') continue;
      for (const day of result.plan.days) used.add(day.recipe.id);
    }
    const fresh = [...used].filter((id) => !BASE_IDS.has(id));
    expect(fresh.length).toBeGreaterThan(0);
  });

  it('is deterministic: the same household twice gives the same week', () => {
    const first = planFor({ household: cases[0]!.household, startDate: '2026-03-02' });
    const second = planFor({ household: cases[0]!.household, startDate: '2026-03-02' });
    if (first.status !== 'OK' || second.status !== 'OK') throw new Error('planning failed');
    expect(second.plan.days.map((d) => d.recipe.id)).toEqual(
      first.plan.days.map((d) => d.recipe.id),
    );
  });
});

describe('variation over twenty consecutive weeks', { timeout: 600_000 }, () => {
  const weeks = mondays(20).map((startDate) => {
    const result = planFor({ household: demoHousehold, startDate });
    if (result.status !== 'OK') throw new Error(`${startDate}: ${result.message}`);
    return { startDate, ids: result.plan.days.map((d) => d.recipe.id) };
  });

  const frequency = new Map<string, number>();
  for (const week of weeks) {
    for (const id of week.ids) frequency.set(id, (frequency.get(id) ?? 0) + 1);
  }

  it('plans all twenty weeks', () => {
    expect(weeks).toHaveLength(20);
  });

  /*
   * The finding this sprint should not bury.
   *
   * Asked the same question twenty weeks running, the planner gives the same
   * seven dishes back nineteen times. That is not a shortage of recipes — the
   * test below shows the library carries nineteen weeks of never-repeating
   * dinners — it is that the optimizer has no memory. Its repetition penalty
   * counts repeats *within* a week; nothing anywhere records what the household
   * ate last week, so for unchanged inputs the cheapest week is a constant.
   *
   * Growing the library from 56 to 138 therefore does nothing for
   * week-over-week variety on its own. Cross-week history is a change to the
   * optimizer, which this sprint is explicitly not allowed to touch, so the
   * behaviour is pinned here rather than quietly worked around. When that
   * history lands, this expectation is meant to fail.
   */
  it('gives the same week back, because nothing remembers last week', () => {
    const signatures = weeks.map((w) => [...w.ids].sort().join('|'));
    expect(new Set(signatures).size).toBe(1);
    expect(frequency.size).toBe(7);
  });
});

describe(
  'what the library can supply when it is asked for something new',
  { timeout: 600_000 },
  () => {
    /*
     * The library question, separated from the planner question above: how many
     * weeks of dinners are actually in here? Each week is planned from the
     * recipes that have not been served yet, which is the same thing a
     * cross-week history would do, without touching the optimizer.
     */
    function weeksWithoutRepeating(pool: typeof recipes) {
      const used = new Set<string>();
      let planned = 0;
      for (let i = 0; i < 30; i += 1) {
        const remaining = pool.filter((r) => !used.has(r.id));
        const result = planFor({
          household: demoHousehold,
          startDate: '2026-03-02',
          pool: remaining,
        });
        if (result.status !== 'OK') break;
        for (const day of result.plan.days) used.add(day.recipe.id);
        planned += 1;
      }
      return { planned, used };
    }

    // Each of these costs a few dozen full week optimisations, so both sides are
    // computed once and the assertions read from the result.
    const now = weeksWithoutRepeating(recipes);
    const then = weeksWithoutRepeating(recipes.filter((r) => BASE_IDS.has(r.id)));

    it('carries at least sixteen weeks of dinners with no dish ever repeating', () => {
      expect(now.planned).toBeGreaterThanOrEqual(16);
      expect(now.used.size).toBeGreaterThanOrEqual(112);
    });

    it('carries far more than it did before the library was grown', () => {
      // The original 56 ran dry after seven weeks. The floor here is what makes
      // the growth worth something: more than double that.
      expect(then.planned).toBeLessThanOrEqual(8);
      expect(now.planned).toBeGreaterThan(2 * then.planned);
    });

    it('keeps a real spread of cuisines across those weeks', () => {
      const byId = new Map(recipes.map((r) => [r.id, r]));
      const cuisines = new Set([...now.used].map((id) => byId.get(id)!.cuisine));
      expect(cuisines.size).toBeGreaterThanOrEqual(7);
    });
  },
);

describe('replacing a dish', { timeout: 600_000 }, () => {
  const base = planFor({ household: demoHousehold, startDate: '2026-03-02' });
  if (base.status !== 'OK') throw new Error(base.message);
  const plan: WeeklyPlan = base.plan;

  const attempts = [0, 1, 2, 3, 4, 5, 6].flatMap((dayIndex) =>
    [1, 2, 3].map((limit) => ({ dayIndex, limit })),
  );

  it('offers alternatives for more than twenty separate requests', () => {
    expect(attempts.length).toBeGreaterThanOrEqual(20);
    for (const { dayIndex, limit } of attempts) {
      const options = findReplacements({
        household: demoHousehold,
        recipes,
        ingredients: ingredientIndex,
        stores,
        maxStores: 3,
        conveniencePreference: 'gebalanceerd',
        budget: {},
        startDate: '2026-03-02',
        today: TEST_TODAY,
        currentPlan: plan,
        dayIndex,
        limit,
      });
      expect(options.length, `dag ${dayIndex}`).toBeGreaterThan(0);
      for (const option of options) {
        expect(option.recipe.id).not.toBe(plan.days[dayIndex]!.recipe.id);
        // The other six days must survive untouched, or "replace this dish"
        // silently rewrites the week.
        const kept = option.plan.days.filter((d) => d.dayIndex !== dayIndex);
        for (const day of kept) {
          expect(day.recipe.id).toBe(plan.days.find((d) => d.dayIndex === day.dayIndex)!.recipe.id);
        }
      }
    }
  });
});

describe('hard constraints hold on the new recipes too', () => {
  it('excludes every recipe containing an ingredient the household cannot eat', () => {
    const noOnion = household('h-ui', {
      members: [member({ name: 'a', excludedIngredientIds: ['ui', 'knoflook'] })],
    });
    const excluded = hardExcludedIngredientIds(noOnion);
    const { candidates } = filterCandidateRecipes({ household: noOnion, recipes });
    for (const recipe of candidates) {
      for (const line of recipe.ingredients) {
        expect(excluded.has(line.ingredientId), `${recipe.id}`).toBe(false);
      }
    }
    expect(candidates.length).toBeGreaterThan(0);
  });

  it('serves a vegan household only vegan dishes', () => {
    const vegan = household('h-vegan', {
      members: [member({ name: 'a', diet: 'veganistisch' })],
    });
    const { candidates } = filterCandidateRecipes({ household: vegan, recipes });
    expect(candidates.length).toBeGreaterThanOrEqual(7);
    for (const recipe of candidates) expect(recipe.vegan, recipe.id).toBe(true);
  });

  it('keeps gluten out of a coeliac household', () => {
    const coeliac = household('h-gluten', {
      members: [member({ name: 'a', allergies: ['gluten'] })],
    });
    const { candidates } = filterCandidateRecipes({ household: coeliac, recipes });
    expect(candidates.length).toBeGreaterThanOrEqual(7);
    for (const recipe of candidates) expect(recipe.allergens).not.toContain('gluten');
  });

  it('drops pregnancy-risk dishes for a pregnant member', () => {
    const pregnant = household('h-zw', {
      members: [member({ name: 'a', pregnancy: { pregnant: true, trimester: 2 } })],
    });
    const { candidates } = filterCandidateRecipes({ household: pregnant, recipes });
    expect(candidates.length).toBeGreaterThanOrEqual(7);
    for (const recipe of candidates) expect(recipe.pregnancySuitable, recipe.id).toBe(true);
  });

  it('never picks a disliked cuisine when something else will do', () => {
    const noItalian = household('h-nl', {
      preferences: {
        ingredients: [],
        cuisines: [{ value: 'italiaans', level: 'EXCLUDE' }],
        tags: [],
      },
    });
    const { candidates } = filterCandidateRecipes({ household: noItalian, recipes });
    for (const recipe of candidates) expect(recipe.cuisine).not.toBe('italiaans');
  });
});
