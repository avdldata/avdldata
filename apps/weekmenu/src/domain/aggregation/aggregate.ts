import type { BaseUnit } from '../units';
import type {
  CanonicalIngredient,
  IngredientCategory,
  IngredientIndex,
} from '../ingredients/types';
import type { Recipe } from '../recipes/types';
import type { RecipePortions } from '../nutrition/portions';

export interface PlannedDay {
  /** 0 = Monday … 6 = Sunday. */
  readonly dayIndex: number;
  readonly recipe: Recipe;
  readonly portions: RecipePortions;
}

export interface DayUsage {
  readonly dayIndex: number;
  readonly amount: number;
}

export interface WeekIngredientRequirement {
  readonly ingredientId: string;
  readonly name: string;
  readonly category: IngredientCategory;
  readonly unit: BaseUnit;
  /** Total needed across the whole week, in the ingredient's base unit. */
  readonly totalAmount: number;
  readonly perDay: readonly DayUsage[];
  readonly pantryStaple: boolean;
  readonly perishability: CanonicalIngredient['perishability'];
}

export class MissingIngredientError extends Error {
  constructor(readonly ingredientId: string) {
    super(`Ingredient "${ingredientId}" is not in the catalogue`);
    this.name = 'MissingIngredientError';
  }
}

/**
 * Combine the seven dishes into one requirement per canonical ingredient.
 *
 * This runs BEFORE any packaging decision, which is the whole point: 300 g of
 * chicken on Monday and 200 g on Wednesday is a single 500 g requirement, and
 * one 500 g pack covers both. Optimising a recipe in isolation can never see that.
 *
 * Optional ingredients are not purchased — they are shown in the recipe but
 * never inflate the shopping list.
 */
export function aggregateWeekIngredients(
  days: readonly PlannedDay[],
  ingredients: IngredientIndex,
): WeekIngredientRequirement[] {
  const accumulator = new Map<
    string,
    { ingredient: CanonicalIngredient; total: number; perDay: Map<number, number> }
  >();

  for (const day of days) {
    for (const line of day.recipe.ingredients) {
      if (line.optional) continue;
      const ingredient = ingredients.get(line.ingredientId);
      if (!ingredient) throw new MissingIngredientError(line.ingredientId);

      const amount = line.perServing.amount * day.portions.totalServings;
      if (amount <= 0) continue;

      let entry = accumulator.get(line.ingredientId);
      if (!entry) {
        entry = { ingredient, total: 0, perDay: new Map() };
        accumulator.set(line.ingredientId, entry);
      }
      entry.total += amount;
      entry.perDay.set(day.dayIndex, (entry.perDay.get(day.dayIndex) ?? 0) + amount);
    }
  }

  return [...accumulator.values()]
    .map(({ ingredient, total, perDay }): WeekIngredientRequirement => ({
      ingredientId: ingredient.id,
      name: ingredient.canonicalName,
      category: ingredient.category,
      unit: ingredient.baseUnit,
      totalAmount: total,
      perDay: [...perDay.entries()]
        .map(([dayIndex, amount]) => ({ dayIndex, amount }))
        .sort((a, b) => a.dayIndex - b.dayIndex),
      pantryStaple: ingredient.pantryStaple === true,
      perishability: ingredient.perishability,
    }))
    .sort((a, b) => a.ingredientId.localeCompare(b.ingredientId));
}

/** Requirements that actually have to be bought (staples like salt are excluded). */
export function purchasableRequirements(
  requirements: readonly WeekIngredientRequirement[],
): WeekIngredientRequirement[] {
  return requirements.filter((r) => !r.pantryStaple);
}
