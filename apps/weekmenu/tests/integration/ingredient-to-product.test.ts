import { describe, expect, it } from 'vitest';
import { buildIngredientIndex } from '@/domain/ingredients/types';
import { normaliseRecipes } from '@/domain/recipes/normalise';
import { computeRecipeNutrition, nutritionDeviation } from '@/domain/recipes/nutrition';
import { aggregateWeekIngredients, type PlannedDay } from '@/domain/aggregation/aggregate';
import { buildPackagingMatrix, evaluateStoreCombination } from '@/domain/optimization/store-selection';
import { DEFAULT_PACKAGING_CONFIG } from '@/domain/packaging/types';
import { optimiseWeek } from '@/domain/optimization/week-optimizer';
import { SEED_INGREDIENTS } from '@/data/seed/ingredients';
import { SEED_RECIPES } from '@/data/seed/recipes';
import {
  demoHousehold,
  ingredientIndex,
  recipes,
  storeCandidates,
  TEST_DATE,
  TEST_TODAY,
} from '../support/fixtures';

/**
 * The architectural rule, enforced.
 *
 *   recipe → canonical ingredient → weekly total → product candidates →
 *   packages → prices → checkout
 *
 * A recipe must never reach for a supermarket product, and the week's totals
 * must be settled before any product is chosen. Both are asserted here rather
 * than merely documented, because both are the kind of thing that quietly rots.
 */
describe('recipe ingredients never touch supermarket products', () => {
  it('every recipe line points at a canonical ingredient and nothing else', () => {
    const canonicalIds = new Set(SEED_INGREDIENTS.map((i) => i.id));
    for (const recipe of SEED_RECIPES) {
      for (const line of recipe.ingredients) {
        expect(canonicalIds.has(line.ingredientId)).toBe(true);
      }
    }
  });

  it('no recipe mentions a brand, a chain or a pack size', () => {
    const forbidden = /\b(ah|jumbo|lidl|plus|campina|conimex|hak|knorr|calv[ée])\b/i;
    for (const recipe of SEED_RECIPES) {
      for (const line of recipe.ingredients) {
        expect(line.ingredientId).not.toMatch(forbidden);
      }
    }
  });
});

describe('weekly aggregation happens before any product is chosen', () => {
  const index = buildIngredientIndex(SEED_INGREDIENTS);
  const catalogue = normaliseRecipes(SEED_RECIPES, index);

  const monday = catalogue.find((r) => r.id === 'kip-broccoli-rijst')!;
  const thursday = catalogue.find((r) => r.id === 'bami-met-kip')!;

  const days: PlannedDay[] = [
    {
      dayIndex: 0,
      recipe: monday,
      portions: { recipeId: monday.id, perMember: [], totalServings: 2 },
    },
    {
      dayIndex: 3,
      recipe: thursday,
      portions: { recipeId: thursday.id, perMember: [], totalServings: 2 },
    },
  ];

  it('adds the same canonical ingredient from two recipes into one requirement', () => {
    const requirements = aggregateWeekIngredients(days, index);
    const chicken = requirements.find((r) => r.ingredientId === 'kipfilet')!;

    const mondayAmount =
      monday.ingredients.find((l) => l.ingredientId === 'kipfilet')!.perServing.amount * 2;
    const thursdayAmount =
      thursday.ingredients.find((l) => l.ingredientId === 'kipfilet')!.perServing.amount * 2;

    expect(chicken.totalAmount).toBeCloseTo(mondayAmount + thursdayAmount, 6);
    expect(chicken.perDay.map((d) => d.dayIndex)).toEqual([0, 3]);
  });

  it('buys packs against the combined total, not per recipe', () => {
    const stores = storeCandidates(['jumbo-korreweg']);
    const requirements = aggregateWeekIngredients(days, index);
    const chicken = requirements.find((r) => r.ingredientId === 'kipfilet')!;

    const matrix = buildPackagingMatrix(requirements, stores, DEFAULT_PACKAGING_CONFIG);
    const combined = evaluateStoreCombination(requirements, stores, matrix);
    const combinedChicken = combined.assignments.find((a) => a.ingredientId === 'kipfilet')!;

    // Priced per recipe instead, each day would round up to its own pack.
    const perRecipeCost = days.reduce((sum, day) => {
      const perDay = aggregateWeekIngredients([day], index);
      const dayMatrix = buildPackagingMatrix(perDay, stores, DEFAULT_PACKAGING_CONFIG);
      const evaluated = evaluateStoreCombination(perDay, stores, dayMatrix);
      return sum + (evaluated.assignments.find((a) => a.ingredientId === 'kipfilet')?.packaging.totalCents ?? 0);
    }, 0);

    expect(combinedChicken.packaging.requiredAmount).toBeCloseTo(chicken.totalAmount, 6);
    expect(combinedChicken.packaging.totalCents).toBeLessThanOrEqual(perRecipeCost);
  });

  it('produces exactly one purchase decision per ingredient for the whole week', () => {
    const stores = storeCandidates();
    const requirements = aggregateWeekIngredients(days, index);
    const matrix = buildPackagingMatrix(requirements, stores, DEFAULT_PACKAGING_CONFIG);
    const combination = evaluateStoreCombination(requirements, stores, matrix);

    const ids = combination.assignments.map((a) => a.ingredientId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('a full generated week never buys the same ingredient twice over', () => {
    const result = optimiseWeek({
      household: demoHousehold,
      recipes,
      ingredients: ingredientIndex,
      stores: storeCandidates(),
      maxStores: 2,
      conveniencePreference: 'gebalanceerd',
      budget: {},
      startDate: TEST_DATE,
      today: TEST_TODAY,
    });
    if (result.status !== 'OK') throw new Error(result.message);

    const ids = result.plan.recommendedOption.assignments.map((a) => a.ingredientId);
    expect(new Set(ids).size).toBe(ids.length);

    // And every purchase covers the week's total for that ingredient.
    for (const assignment of result.plan.recommendedOption.assignments) {
      const requirement = result.plan.requirements.find(
        (r) => r.ingredientId === assignment.ingredientId,
      )!;
      expect(assignment.packaging.requiredAmount).toBeCloseTo(requirement.totalAmount, 6);
      expect(assignment.packaging.purchasedAmount).toBeGreaterThanOrEqual(
        requirement.totalAmount - 1e-6,
      );
    }
  });
});

describe('recipe nutrition is derived from the ingredient catalogue', () => {
  const index = buildIngredientIndex(SEED_INGREDIENTS);
  const catalogue = normaliseRecipes(SEED_RECIPES, index);

  it('derives every seeded recipe rather than trusting the hand-written value', () => {
    expect(catalogue.every((r) => r.nutritionSource === 'derived')).toBe(true);
    expect(catalogue.every((r) => r.nutritionCoverage === 1)).toBe(true);
  });

  it('stays close to the hand-written values, which cross-checks both datasets', () => {
    const deviations = catalogue
      .map((r) => nutritionDeviation(r.nutritionPerServing, r.authoredNutritionPerServing))
      .sort((a, b) => a - b);
    const median = deviations[Math.floor(deviations.length / 2)]!;
    const worst = deviations[deviations.length - 1]!;

    expect(median).toBeLessThan(0.15);
    expect(worst).toBeLessThan(0.35);
  });

  it('falls back to the authored value when an ingredient has no nutrition', () => {
    const withoutNutrition = SEED_INGREDIENTS.map((ingredient) =>
      ingredient.id === 'kipfilet'
        ? { ...ingredient, nutritionPer100: undefined, nutritionSource: undefined }
        : ingredient,
    );
    const [chicken] = normaliseRecipes(
      SEED_RECIPES.filter((r) => r.id === 'kip-broccoli-rijst'),
      buildIngredientIndex(withoutNutrition),
    );
    expect(chicken!.nutritionSource).toBe('authored');
    expect(chicken!.nutritionCoverage).toBeLessThan(1);
    expect(chicken!.nutritionPerServing).toEqual(chicken!.authoredNutritionPerServing);
  });

  it('counts pantry staples but not optional ingredients', () => {
    const spaghetti = catalogue.find((r) => r.id === 'spaghetti-bolognese')!;
    const withoutOptional = computeRecipeNutrition(
      spaghetti.ingredients.filter((l) => !l.optional),
      index,
    );
    expect(withoutOptional.perServing.kcal).toBe(spaghetti.nutritionPerServing.kcal);

    // Salt is a pantry staple: never bought, but definitely eaten.
    const salted = spaghetti.ingredients.some((l) => l.ingredientId === 'zout');
    expect(salted).toBe(true);
    expect(spaghetti.nutritionPerServing.saltGrams).toBeGreaterThan(0);
  });
});
