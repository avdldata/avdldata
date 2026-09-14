import { describe, expect, it } from 'vitest';
import { euros } from '@/domain/units';
import { DEFAULT_NUTRITION_CONFIG } from '@/domain/nutrition/config';
import { DEFAULT_OBJECTIVE_WEIGHTS, extraStorePenaltyFor } from '@/domain/optimization/config';
import { scoreNutrition, scoreRecipePreferences, scoreWeek } from '@/domain/optimization/scoring';
import type { StoreOption } from '@/domain/optimization/store-selection';
import type { WasteSummary } from '@/domain/aggregation/leftovers';
import { makeRecipe } from '../support/builders';

const weights = DEFAULT_OBJECTIVE_WEIGHTS;

const emptyWaste: WasteSummary = {
  totalLeftover: { g: 0, ml: 0, piece: 0 },
  perishableLeftover: { g: 0, ml: 0, piece: 0 },
  wasteScore: 0,
  reusedIngredientIds: [],
};

function option(groceryCents: number, overrides: Partial<StoreOption> = {}): StoreOption {
  return {
    locationIds: ['a'],
    chainIds: ['a'],
    assignments: [],
    unavailable: [],
    groceryCents: euros(groceryCents / 100),
    promotionSavingsCents: euros(0),
    belowReferenceSavingsCents: euros(0),
    purchasedByIngredient: new Map(),
    categoryWinners: new Map(),
    trip: {
      estimatedDistanceKm: 4,
      estimatedTravelCostCents: euros(0.92),
      estimatedMinutes: 20,
      storeCount: 1,
      route: ['a'],
      mode: 'auto',
    },
    extraStorePenaltyCents: euros(0),
    practicalTotalCents: euros(groceryCents / 100 + 0.92),
    unavailablePenaltyCents: euros(0),
    comparableTotalCents: euros(groceryCents / 100 + 0.92),
    ...overrides,
  };
}

describe('preference scoring', () => {
  const recipe = makeRecipe('r', {
    cuisine: 'italiaans',
    tags: ['pasta'],
    ingredients: [
      { ingredientId: 'spaghetti', perServing: { amount: 90, unit: 'g' }, optional: false },
    ],
  });

  it('is neutral when nothing is liked or disliked', () => {
    const score = scoreRecipePreferences(
      recipe,
      { ingredients: [], cuisines: [], tags: [] },
      weights,
    );
    expect(score.penaltyCents).toBe(0);
  });

  it('rewards a liked cuisine and punishes a disliked tag', () => {
    const liked = scoreRecipePreferences(
      recipe,
      { ingredients: [], cuisines: [{ value: 'italiaans', level: 'LIKE' }], tags: [] },
      weights,
    );
    expect(liked.penaltyCents).toBeLessThan(0);
    expect(liked.likedTerms).toContain('italiaans');

    const disliked = scoreRecipePreferences(
      recipe,
      { ingredients: [], cuisines: [], tags: [{ value: 'pasta', level: 'DISLIKE' }] },
      weights,
    );
    expect(disliked.penaltyCents).toBeGreaterThan(0);
    expect(disliked.dislikedTerms).toContain('pasta');
  });
});

describe('nutrition scoring', () => {
  const members = [
    {
      memberId: 'a',
      name: 'A',
      bmrKcal: 1700,
      tdeeKcal: 2400,
      targetEnergyKcal: 2400,
      dinnerEnergyKcal: 720,
      proteinGuidelineGrams: 85,
      fiberGuidelineGrams: 34,
      estimateQuality: 'high' as const,
      assumptions: [],
    },
  ];

  const onTargetDay = {
    recipe: makeRecipe('good', {
      nutritionPerServing: {
        kcal: 600,
        proteinGrams: 40,
        carbGrams: 60,
        fatGrams: 18,
        fiberGrams: 12,
        saltGrams: 1.2,
      },
    }),
    portions: {
      recipeId: 'good',
      perMember: [
        { memberId: 'a', name: 'A', factor: 1.2, kcal: 720, targetKcal: 720, clamped: false },
      ],
      totalServings: 1.2,
    },
  };

  it('costs nothing when everybody hits their target', () => {
    const result = scoreNutrition({
      days: [onTargetDay],
      members,
      nutritionConfig: DEFAULT_NUTRITION_CONFIG,
      weights,
    });
    expect(result.totalKcalDeviation).toBe(0);
    expect(result.penaltyCents).toBeGreaterThanOrEqual(0);
  });

  it('penalises a plate that is far off target', () => {
    const offTarget = {
      ...onTargetDay,
      portions: {
        ...onTargetDay.portions,
        perMember: [
          { memberId: 'a', name: 'A', factor: 0.6, kcal: 360, targetKcal: 720, clamped: true },
        ],
      },
    };
    const good = scoreNutrition({
      days: [onTargetDay],
      members,
      nutritionConfig: DEFAULT_NUTRITION_CONFIG,
      weights,
    });
    const bad = scoreNutrition({
      days: [offTarget],
      members,
      nutritionConfig: DEFAULT_NUTRITION_CONFIG,
      weights,
    });
    expect(bad.penaltyCents).toBeGreaterThan(good.penaltyCents);
    expect(bad.totalKcalDeviation).toBe(360);
  });

  it('notices a protein shortfall and a salt excess', () => {
    const salty = {
      recipe: makeRecipe('salty', {
        nutritionPerServing: {
          kcal: 600,
          proteinGrams: 3,
          carbGrams: 90,
          fatGrams: 18,
          fiberGrams: 1,
          saltGrams: 6,
        },
      }),
      portions: onTargetDay.portions,
    };
    const result = scoreNutrition({
      days: [salty],
      members,
      nutritionConfig: DEFAULT_NUTRITION_CONFIG,
      weights,
    });
    expect(result.proteinShortfallGrams).toBeGreaterThan(0);
    expect(result.saltExcessGrams).toBeGreaterThan(0);
    expect(result.fiberShortfallGrams).toBeGreaterThan(0);
  });
});

describe('week scoring', () => {
  const nutrition = {
    penaltyCents: euros(0),
    totalKcalDeviation: 0,
    proteinShortfallGrams: 0,
    fiberShortfallGrams: 0,
    saltExcessGrams: 0,
  };

  const base = {
    nutrition,
    waste: emptyWaste,
    diversityViolations: [],
    preferencePenaltyCents: euros(0),
    budget: {},
    weights,
    variety: 1,
  };

  it('sums to the practical total when nothing else is wrong', () => {
    const score = scoreWeek({ ...base, option: option(5000) });
    expect(score.totalPenaltyCents).toBe(score.practicalTotalCents);
    expect(score.displayScore).toBe(100);
  });

  it('penalises going over a target budget', () => {
    const within = scoreWeek({ ...base, option: option(5000), budget: { targetCents: euros(60) } });
    const over = scoreWeek({ ...base, option: option(7000), budget: { targetCents: euros(60) } });
    expect(within.budgetPenaltyCents).toBe(0);
    expect(over.budgetPenaltyCents).toBeGreaterThan(0);
  });

  it('penalises waste, repetition and monotony', () => {
    const wasteful = scoreWeek({
      ...base,
      option: option(5000),
      waste: { ...emptyWaste, wasteScore: 1000 },
    });
    expect(wasteful.wastePenaltyCents).toBeGreaterThan(0);

    const repetitive = scoreWeek({
      ...base,
      option: option(5000),
      diversityViolations: [{ rule: 'TOO_MUCH_PASTA', detail: '3' }],
    });
    expect(repetitive.repetitionPenaltyCents).toBeGreaterThan(0);

    const monotonous = scoreWeek({ ...base, option: option(5000), variety: 0.2 });
    expect(monotonous.repetitionPenaltyCents).toBeGreaterThan(0);
  });

  it('penalises anything it could not source', () => {
    const withGap = scoreWeek({
      ...base,
      option: option(5000, {
        unavailable: [{ ingredientId: 'x', name: 'X', triedLocationIds: ['a'] }],
      }),
    });
    expect(withGap.unavailablePenaltyCents).toBe(weights.unavailableItemPenalty);
  });

  it('lets health outweigh a small price difference', () => {
    const cheapButUnbalanced = scoreWeek({
      ...base,
      option: option(4800),
      nutrition: { ...nutrition, penaltyCents: euros(6) },
    });
    const pricierButBalanced = scoreWeek({ ...base, option: option(5000) });
    expect(pricierButBalanced.totalPenaltyCents).toBeLessThan(cheapButUnbalanced.totalPenaltyCents);
  });
});

describe('settings that outlive the code that wrote them', () => {
  it('falls back to the middle allowance for an unknown convenience preference', () => {
    // Persisted settings are JSON: a preference renamed in a later version must
    // not reach the objective function as undefined and NaN the whole score.
    expect(extraStorePenaltyFor('gebalanceerd')).toBe(euros(2.5));
    expect(extraStorePenaltyFor('laagste-prijs')).toBe(euros(0));
    expect(extraStorePenaltyFor('een-instelling-uit-2029')).toBe(euros(2.5));
  });
});
