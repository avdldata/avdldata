import { cents, type Cents } from '../units';
import type { Recipe } from '../recipes/types';
import { optimiseWeek, type OptimizerInput } from './week-optimizer';
import { violationsIfAdded } from './diversity';
import { filterCandidateRecipes } from './filter';
import { DEFAULT_OPTIMIZER_CONFIG } from './config';
import type { WeeklyPlan } from './types';

export interface ReplacementCandidate {
  readonly recipe: Recipe;
  readonly plan: WeeklyPlan;
  /** Positive = this week gets more expensive, negative = cheaper. */
  readonly deltaCents: Cents;
  /** How many ingredients it shares with what you were already buying. */
  readonly sharedIngredients: number;
  readonly deltaKcalPerPerson: number;
}

export interface ReplaceDishInput extends OptimizerInput {
  readonly currentPlan: WeeklyPlan;
  readonly dayIndex: number;
  /** How many alternatives to return. */
  readonly limit?: number;
  /** Cap on how many candidates get a full re-price; keeps the screen snappy. */
  readonly maxEvaluated?: number;
}

/**
 * Offer alternatives for one day and re-price the entire week for each.
 *
 * Swapping a dish changes what you buy, which changes packs, which changes
 * which store is cheapest — so the only honest answer is to run the whole
 * calculation again with the other six days locked. That is exactly what this
 * does, and the price delta shown to the user is the real difference between
 * two fully-costed weeks.
 */
export function findReplacements(input: ReplaceDishInput): ReplacementCandidate[] {
  const config = input.config ?? DEFAULT_OPTIMIZER_CONFIG;
  const limit = input.limit ?? 3;
  const maxEvaluated = input.maxEvaluated ?? 12;

  const currentDay = input.currentPlan.days.find((d) => d.dayIndex === input.dayIndex);
  if (!currentDay) return [];

  const keptRecipes = input.currentPlan.days
    .filter((d) => d.dayIndex !== input.dayIndex)
    .map((d) => d.recipe);
  const keptIds = new Set(keptRecipes.map((r) => r.id));

  const currentIngredientIds = new Set(
    input.currentPlan.requirements.map((r) => r.ingredientId),
  );

  const { candidates } = filterCandidateRecipes({
    household: input.household,
    recipes: input.recipes,
    ...(input.maxMinutes !== undefined ? { maxMinutes: input.maxMinutes } : {}),
  });

  // Rank cheaply first: prefer dishes that reuse what we already buy and that
  // do not break the variety rules, then re-price only the best few.
  const shortlist = candidates
    .filter((recipe) => !keptIds.has(recipe.id) && recipe.id !== currentDay.recipe.id)
    .filter((recipe) => violationsIfAdded(keptRecipes, recipe, config.diversity).length === 0)
    .map((recipe) => ({
      recipe,
      shared: recipe.ingredients.filter(
        (line) => !line.optional && currentIngredientIds.has(line.ingredientId),
      ).length,
      kcalGap: Math.abs(
        recipe.nutritionPerServing.kcal - currentDay.recipe.nutritionPerServing.kcal,
      ),
    }))
    .sort(
      (a, b) =>
        b.shared - a.shared || a.kcalGap - b.kcalGap || a.recipe.id.localeCompare(b.recipe.id),
    )
    .slice(0, maxEvaluated);

  const results: ReplacementCandidate[] = [];

  for (const entry of shortlist) {
    const locked = new Map<number, string>();
    for (const day of input.currentPlan.days) {
      locked.set(day.dayIndex, day.dayIndex === input.dayIndex ? entry.recipe.id : day.recipe.id);
    }

    const outcome = optimiseWeek({ ...input, lockedRecipeIds: locked });
    if (outcome.status !== 'OK') continue;

    const currentPerPerson = averagePerPersonKcal(input.currentPlan, input.dayIndex);
    const nextPerPerson = averagePerPersonKcal(outcome.plan, input.dayIndex);

    results.push({
      recipe: entry.recipe,
      plan: outcome.plan,
      deltaCents: cents(
        outcome.plan.totals.groceryCents - input.currentPlan.totals.groceryCents,
      ),
      sharedIngredients: entry.shared,
      deltaKcalPerPerson: Math.round(nextPerPerson - currentPerPerson),
    });
  }

  results.sort(
    (a, b) =>
      a.deltaCents - b.deltaCents ||
      b.sharedIngredients - a.sharedIngredients ||
      a.recipe.id.localeCompare(b.recipe.id),
  );

  return results.slice(0, limit);
}

function averagePerPersonKcal(plan: WeeklyPlan, dayIndex: number): number {
  const day = plan.days.find((d) => d.dayIndex === dayIndex);
  if (!day || day.portions.perMember.length === 0) return 0;
  return (
    day.portions.perMember.reduce((sum, p) => sum + p.kcal, 0) / day.portions.perMember.length
  );
}
