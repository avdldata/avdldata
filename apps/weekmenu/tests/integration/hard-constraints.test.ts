import { describe, expect, it } from 'vitest';
import { optimiseWeek } from '@/domain/optimization/week-optimizer';
import { cents } from '@/domain/units';
import type { Recipe } from '@/domain/recipes/types';
import type { Household } from '@/domain/household/types';
import {
  demoHousehold,
  ingredientIndex,
  recipes,
  storeCandidates,
  TEST_DATE,
  TEST_TODAY,
} from '../support/fixtures';

/**
 * A dietary rule is worth nothing if a low enough price can buy its way past it.
 *
 * The tests below do not merely check that a forbidden dish is absent — the
 * optimizer might be avoiding it for unrelated reasons. Each one plants a dish
 * that is deliberately irresistible: the cheapest ingredient in the catalogue,
 * in a tiny quantity, at exactly the household's energy target, tagged as
 * everything they like. If a constraint can be bought off, this dish buys it.
 */

/** The cheapest thing money can buy in this catalogue, in the smallest amount. */
function cheapestIngredientId(): string {
  const offers = storeCandidates().flatMap((store) => store.offers);
  return [...offers].sort((a, b) => a.pricePerBaseUnitCents - b.pricePerBaseUnitCents)[0]!
    .ingredientId;
}

function irresistibleDish(overrides: Partial<Recipe>): Recipe {
  const template = recipes[0]!;
  return {
    ...template,
    id: 'te-mooi-om-waar-te-zijn',
    name: 'Te mooi om waar te zijn',
    slug: 'te-mooi-om-waar-te-zijn',
    ingredients: [
      {
        ingredientId: cheapestIngredientId(),
        perServing: { amount: 1, unit: 'g' },
        optional: false,
        note: undefined,
      },
    ],
    // Hits the target squarely, so the nutrition penalty cannot be the reason
    // it loses either.
    nutritionPerServing: { ...template.nutritionPerServing, kcal: 700 },
    ...overrides,
  } as Recipe;
}

function planWith(dish: Recipe, household: Household) {
  return optimiseWeek({
    household,
    recipes: [dish, ...recipes],
    ingredients: ingredientIndex,
    stores: storeCandidates(),
    maxStores: 3,
    conveniencePreference: 'gebalanceerd',
    budget: {},
    startDate: TEST_DATE,
    today: TEST_TODAY,
  });
}

/** Proof that the bait works: without the rule, the dish does get picked. */
function assertTheBaitIsIrresistible(dish: Recipe): void {
  const control = planWith(dish, demoHousehold);
  if (control.status !== 'OK') throw new Error('control plan failed');
  expect(control.plan.days.map((d) => d.recipe.id)).toContain(dish.id);
}

const pregnant: Household = {
  ...demoHousehold,
  members: demoHousehold.members.map((member, index) =>
    index === 0 ? { ...member, pregnancy: { pregnant: true, trimester: 2 } } : member,
  ),
};

/**
 * Each of these plans the week twice — once with the bait dish in the
 * catalogue, once without — so a generous timeout is simply the cost of
 * checking the real optimizer rather than a stub. What the optimizer is allowed
 * to spend per plan is asserted in performance-determinism.test.ts.
 */
describe('no price can buy its way past a hard constraint', () => {
  it('leaves out a pregnancy-unsafe dish that would otherwise be the cheapest of the week', () => {
    const dish = irresistibleDish({
      pregnancySuitable: false,
      pregnancyRiskReasons: ['rauwe vis'],
    });
    assertTheBaitIsIrresistible({ ...dish, pregnancySuitable: true, pregnancyRiskReasons: [] });

    const result = planWith(dish, pregnant);
    if (result.status !== 'OK') throw new Error(result.message);

    expect(result.plan.days.map((d) => d.recipe.id)).not.toContain(dish.id);
    expect(result.plan.days.every((d) => d.recipe.pregnancySuitable)).toBe(true);
    expect(result.plan.excludedRecipes.find((r) => r.recipeId === dish.id)?.reason).toBe(
      'PREGNANCY',
    );
  });

  it('leaves out an allergen dish that would otherwise be the cheapest of the week', () => {
    const dish = irresistibleDish({ allergens: ['noten'] });
    assertTheBaitIsIrresistible({ ...dish, allergens: [] });

    const allergic: Household = {
      ...demoHousehold,
      members: demoHousehold.members.map((member, index) =>
        index === 0 ? { ...member, allergies: ['noten' as const] } : member,
      ),
    };

    const result = planWith(dish, allergic);
    if (result.status !== 'OK') throw new Error(result.message);
    expect(result.plan.excludedRecipes.find((r) => r.recipeId === dish.id)?.reason).toBe(
      'ALLERGEN',
    );
    expect(result.plan.days.map((d) => d.recipe.id)).not.toContain(dish.id);
  });

  it('leaves out a meat dish for a vegan household, whatever it costs', () => {
    const dish = irresistibleDish({ vegetarian: false, vegan: false, primaryProtein: 'rund' });
    assertTheBaitIsIrresistible({ ...dish, vegetarian: true, vegan: true });

    const vegan: Household = {
      ...demoHousehold,
      members: demoHousehold.members.map((member, index) =>
        index === 0 ? { ...member, diet: 'veganistisch' as const } : member,
      ),
    };

    const result = planWith(dish, vegan);
    if (result.status !== 'OK') throw new Error(result.message);
    expect(result.plan.excludedRecipes.find((r) => r.recipeId === dish.id)?.reason).toBe(
      'VEGAN_REQUIRED',
    );
    expect(result.plan.days.map((d) => d.recipe.id)).not.toContain(dish.id);
    expect(result.plan.days.every((d) => d.recipe.vegan)).toBe(true);
  });

  it('leaves out a dish with an excluded ingredient, whatever it costs', () => {
    const excludedId = cheapestIngredientId();
    const dish = irresistibleDish({});
    assertTheBaitIsIrresistible(dish);

    const fussy: Household = {
      ...demoHousehold,
      preferences: {
        ...demoHousehold.preferences,
        ingredients: [
          ...demoHousehold.preferences.ingredients,
          { value: excludedId, level: 'EXCLUDE' },
        ],
      },
    };

    const result = planWith(dish, fussy);
    if (result.status !== 'OK') throw new Error(result.message);
    expect(result.plan.excludedRecipes.find((r) => r.recipeId === dish.id)?.reason).toBe(
      'EXCLUDED_INGREDIENT',
    );
    expect(result.plan.days.map((d) => d.recipe.id)).not.toContain(dish.id);
    for (const day of result.plan.days) {
      expect(
        day.recipe.ingredients.filter((l) => !l.optional).map((l) => l.ingredientId),
      ).not.toContain(excludedId);
    }
  });

  it('holds even when the budget is impossible to meet', () => {
    const dish = irresistibleDish({
      pregnancySuitable: false,
      pregnancyRiskReasons: ['rauwe vis'],
    });
    const result = optimiseWeek({
      household: pregnant,
      recipes: [dish, ...recipes],
      ingredients: ingredientIndex,
      stores: storeCandidates(),
      maxStores: 3,
      conveniencePreference: 'gebalanceerd',
      budget: { hardMaxCents: cents(500) },
      startDate: TEST_DATE,
      today: TEST_TODAY,
    });
    if (result.status !== 'OK') throw new Error(result.message);

    expect(result.plan.budget.met).toBe(false);
    expect(result.plan.days.map((d) => d.recipe.id)).not.toContain(dish.id);
  });
}, 120_000);

describe('a variety rule may narrow the choice, never block it', () => {
  /**
   * Ten of the forty-nine dishes are vegan and seven of those are legume-based.
   * With at most three dishes per protein source and one soup a week, no
   * combination of seven satisfies every variety rule — so the rules have to
   * give way, not the plan. Repetition is priced by the objective function
   * instead, and the week still respects every dietary rule.
   */
  const vegan: Household = {
    ...demoHousehold,
    members: demoHousehold.members.map((member, index) =>
      index === 0 ? { ...member, diet: 'veganistisch' as const } : member,
    ),
  };

  const result = optimiseWeek({
    household: vegan,
    recipes,
    ingredients: ingredientIndex,
    stores: storeCandidates(),
    maxStores: 3,
    conveniencePreference: 'gebalanceerd',
    budget: {},
    startDate: TEST_DATE,
    today: TEST_TODAY,
  });

  it('still plans a full week for a household with few eligible dishes', () => {
    if (result.status !== 'OK') throw new Error(result.message);
    expect(result.plan.days).toHaveLength(7);
    expect(new Set(result.plan.days.map((d) => d.recipe.id)).size).toBe(7);
  });

  it('keeps every dish vegan while doing so', () => {
    if (result.status !== 'OK') throw new Error(result.message);
    expect(result.plan.days.every((d) => d.recipe.vegan)).toBe(true);
  });

  it('charges the repetition to the score rather than hiding it', () => {
    if (result.status !== 'OK') throw new Error(result.message);
    expect(result.plan.score.repetitionPenaltyCents).toBeGreaterThan(0);
  });
});
