import type { Recipe } from '../recipes/types';
import { DEFAULT_NUTRITION_CONFIG, type NutritionConfig } from './config';
import type { MemberNutrition } from './calculate';

export interface MemberPortion {
  readonly memberId: string;
  readonly name: string;
  /** Number of standard servings for this person, e.g. 1.15. */
  readonly factor: number;
  /** What that portion actually delivers, kcal. */
  readonly kcal: number;
  /** What we were aiming for, kcal — the gap drives the nutrition penalty. */
  readonly targetKcal: number;
  /** True when the clamp kicked in and we could not hit the target. */
  readonly clamped: boolean;
}

export interface RecipePortions {
  readonly recipeId: string;
  readonly perMember: readonly MemberPortion[];
  /** Sum of all individual factors — the amount actually cooked. */
  readonly totalServings: number;
}

/**
 * Scale a single dish to each member's dinner energy target.
 *
 * The household cooks one pot, but the amount in that pot is the sum of the
 * individual portions — that sum is what the shopping list is built from.
 * Factors are clamped so nobody is served a third of a plate or a triple
 * helping, and rounded to a step a human can actually dish out.
 */
export function planPortions(
  recipe: Recipe,
  nutrition: readonly MemberNutrition[],
  config: NutritionConfig = DEFAULT_NUTRITION_CONFIG,
): RecipePortions {
  const { minFactor, maxFactor, step } = config.portionScaling;
  const kcalPerServing = recipe.nutritionPerServing.kcal;

  const perMember = nutrition.map((member): MemberPortion => {
    const ideal = kcalPerServing > 0 ? member.dinnerEnergyKcal / kcalPerServing : 1;
    const clampedFactor = Math.min(maxFactor, Math.max(minFactor, ideal));
    const factor = roundToStep(clampedFactor, step);
    return {
      memberId: member.memberId,
      name: member.name,
      factor,
      kcal: Math.round(factor * kcalPerServing),
      targetKcal: member.dinnerEnergyKcal,
      clamped: Math.abs(clampedFactor - ideal) > 1e-9,
    };
  });

  return {
    recipeId: recipe.id,
    perMember,
    totalServings: roundToStep(
      perMember.reduce((sum, p) => sum + p.factor, 0),
      step,
    ),
  };
}

/** Nutrition actually delivered by a dish at the planned portions. */
export interface PortionNutritionSummary {
  readonly kcal: number;
  readonly proteinGrams: number;
  readonly carbGrams: number;
  readonly fatGrams: number;
  readonly fiberGrams: number;
  readonly saltGrams: number;
}

export function summarisePortionNutrition(
  recipe: Recipe,
  portions: RecipePortions,
): PortionNutritionSummary {
  const n = recipe.nutritionPerServing;
  const s = portions.totalServings;
  return {
    kcal: Math.round(n.kcal * s),
    proteinGrams: round1(n.proteinGrams * s),
    carbGrams: round1(n.carbGrams * s),
    fatGrams: round1(n.fatGrams * s),
    fiberGrams: round1(n.fiberGrams * s),
    saltGrams: round1(n.saltGrams * s),
  };
}

function roundToStep(value: number, step: number): number {
  const rounded = Math.round(value / step) * step;
  // Kill binary-float dust like 1.1500000000000001.
  return Number(rounded.toFixed(4));
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
