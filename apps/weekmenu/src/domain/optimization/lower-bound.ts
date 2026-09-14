import type { Household } from '../household/types';
import type { IngredientIndex } from '../ingredients/types';
import type { Recipe } from '../recipes/types';
import type { MemberNutrition } from '../nutrition/calculate';
import type { RecipePortions } from '../nutrition/portions';
import {
  aggregateWeekIngredients,
  purchasableRequirements,
  type PlannedDay,
} from '../aggregation/aggregate';
import { cents } from '../units';
import type { OptimizerConfig } from './config';
import { varietyScore, weekDiversityViolations } from './diversity';
import { scoreNutrition, scoreRecipePreferences } from './scoring';
import {
  buildPackagingMatrix,
  type PackagingCache,
  type StoreCandidate,
} from './store-selection';

/**
 * A floor under what a week can possibly score.
 *
 * Used to skip pricing a candidate that cannot beat the week already in hand.
 * That only stays honest if the floor is genuinely unreachable — a bound that
 * is "usually right" is not a bound, it is a heuristic wearing a bound's hat,
 * and it silently throws away the optimum on the cases where it is wrong.
 *
 * So every term here is either exact or deliberately omitted:
 *
 *   groceries   the cheapest each ingredient can be packaged at *any* single
 *               shop, ignoring the limit on how many shops may be visited.
 *               Relaxing a constraint can only lower the answer.
 *   nutrition   exact — it depends on the dishes and the household, nothing else
 *   repetition  exact — likewise a property of the seven dishes
 *   preferences exact — likewise, and the only term that can be negative
 *
 * Omitted, every one of them never negative: travel, the extra-shop allowance,
 * waste, the budget overrun, and the charge for anything unavailable.
 *
 * The last cent is given away on purpose. `scoreWeek` rounds its total half-up,
 * so a true score can land one step below the sum of its parts; conceding a
 * cent costs a negligible amount of pruning and removes the whole question.
 */

export interface WeekLowerBoundInput {
  readonly recipes: readonly Recipe[];
  readonly portionsByRecipe: ReadonlyMap<string, RecipePortions>;
  readonly household: Household;
  readonly memberNutrition: readonly MemberNutrition[];
  readonly ingredients: IngredientIndex;
  readonly stores: readonly StoreCandidate[];
  readonly config: OptimizerConfig;
  readonly packagingCache?: PackagingCache;
}

export function weekLowerBound(input: WeekLowerBoundInput): number {
  const { config } = input;

  const plannedDays: PlannedDay[] = input.recipes.map((recipe, dayIndex) => ({
    dayIndex,
    recipe,
    portions: input.portionsByRecipe.get(recipe.id)!,
  }));

  const requirements = purchasableRequirements(
    aggregateWeekIngredients(plannedDays, input.ingredients),
  );
  const matrix = buildPackagingMatrix(
    requirements,
    input.stores,
    config.packaging,
    input.packagingCache,
  );

  let groceries = 0;
  for (const requirement of requirements) {
    const row = matrix.get(requirement.ingredientId);
    if (!row) continue;
    let cheapest = Number.POSITIVE_INFINITY;
    for (const result of row.values()) {
      if (result.status !== 'OK') continue;
      cheapest = Math.min(cheapest, result.solution.totalCents);
    }
    // Nowhere stocks it: the real week pays an unavailability charge instead,
    // and that charge is never negative, so counting nothing here is safe.
    if (Number.isFinite(cheapest)) groceries += cheapest;
  }

  const nutrition = scoreNutrition({
    days: plannedDays,
    members: input.memberNutrition,
    nutritionConfig: config.nutrition,
    weights: config.weights,
  });

  // Reproduced exactly as `scoreWeek` builds it, nested rounding included.
  const monotony = cents(Math.max(0, 1 - varietyScore(input.recipes)) * config.weights.monotonyPenalty);
  const repetition = cents(
    weekDiversityViolations(input.recipes, config.diversity).length *
      config.weights.repetitionPerViolation +
      monotony,
  );

  const preferences = cents(
    input.recipes.reduce(
      (sum, recipe) =>
        sum +
        scoreRecipePreferences(recipe, input.household.preferences, config.weights).penaltyCents,
      0,
    ),
  );

  return groceries + nutrition.penaltyCents + repetition + preferences - 1;
}
