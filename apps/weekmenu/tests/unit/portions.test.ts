import { describe, expect, it } from 'vitest';
import { calculateHouseholdNutrition } from '@/domain/nutrition/calculate';
import { planPortions, summarisePortionNutrition } from '@/domain/nutrition/portions';
import { DEFAULT_NUTRITION_CONFIG } from '@/domain/nutrition/config';
import { makeMember, makeRecipe } from '../support/builders';

const TODAY = new Date('2026-03-02T00:00:00Z');

describe('portion scaling', () => {
  const members = [
    makeMember({
      id: 'arjan',
      name: 'Arjan',
      sex: 'man',
      heightCm: 175,
      weightKg: 87,
      ageYears: 38,
    }),
    makeMember({
      id: 'chimene',
      name: 'Chimene',
      sex: 'vrouw',
      heightCm: 182,
      weightKg: 74,
      ageYears: 34,
    }),
  ];
  const nutrition = calculateHouseholdNutrition(members, TODAY);

  it('gives each person their own factor and sums them for the pan', () => {
    const recipe = makeRecipe('r1', {
      nutritionPerServing: {
        kcal: 600,
        proteinGrams: 30,
        carbGrams: 60,
        fatGrams: 20,
        fiberGrams: 8,
        saltGrams: 1.4,
      },
    });
    const portions = planPortions(recipe, nutrition);
    expect(portions.perMember).toHaveLength(2);
    const total = portions.perMember.reduce((sum, p) => sum + p.factor, 0);
    expect(portions.totalServings).toBeCloseTo(total, 4);
  });

  it('rounds to a step a human can actually dish out', () => {
    const recipe = makeRecipe('r2', {
      nutritionPerServing: {
        kcal: 637,
        proteinGrams: 20,
        carbGrams: 60,
        fatGrams: 20,
        fiberGrams: 5,
        saltGrams: 1,
      },
    });
    const portions = planPortions(recipe, nutrition);
    for (const portion of portions.perMember) {
      expect(Math.round(portion.factor * 20)).toBeCloseTo(portion.factor * 20, 6);
    }
  });

  it('clamps absurd portions and says so', () => {
    const tiny = makeRecipe('tiny', {
      nutritionPerServing: {
        kcal: 90,
        proteinGrams: 2,
        carbGrams: 10,
        fatGrams: 2,
        fiberGrams: 1,
        saltGrams: 0.2,
      },
    });
    const huge = makeRecipe('huge', {
      nutritionPerServing: {
        kcal: 2400,
        proteinGrams: 90,
        carbGrams: 200,
        fatGrams: 90,
        fiberGrams: 20,
        saltGrams: 4,
      },
    });
    const { maxFactor, minFactor } = DEFAULT_NUTRITION_CONFIG.portionScaling;

    for (const portion of planPortions(tiny, nutrition).perMember) {
      expect(portion.factor).toBe(maxFactor);
      expect(portion.clamped).toBe(true);
    }
    for (const portion of planPortions(huge, nutrition).perMember) {
      expect(portion.factor).toBe(minFactor);
      expect(portion.clamped).toBe(true);
    }
  });

  it('scales the nutrition summary with the portions', () => {
    const recipe = makeRecipe('r3');
    const portions = planPortions(recipe, nutrition);
    const summary = summarisePortionNutrition(recipe, portions);
    expect(summary.kcal).toBe(Math.round(600 * portions.totalServings));
  });

  it('does not divide by zero for a recipe with no energy data', () => {
    const broken = makeRecipe('broken', {
      nutritionPerServing: {
        kcal: 0,
        proteinGrams: 0,
        carbGrams: 0,
        fatGrams: 0,
        fiberGrams: 0,
        saltGrams: 0,
      },
    });
    const portions = planPortions(broken, nutrition);
    expect(portions.perMember.every((p) => Number.isFinite(p.factor))).toBe(true);
  });
});
