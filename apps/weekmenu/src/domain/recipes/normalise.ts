import { toBaseQuantity } from '../units';
import type { CanonicalIngredient, IngredientIndex } from '../ingredients/types';
import type {
  AuthoredRecipe,
  Recipe,
  RecipeIngredient,
} from './types';
import type { Allergen } from '../ingredients/types';

export class RecipeNormalisationError extends Error {
  constructor(
    message: string,
    readonly detail: { recipeId: string; ingredientId?: string },
  ) {
    super(message);
    this.name = 'RecipeNormalisationError';
  }
}

const PREGNANCY_RISK_LABELS: Record<string, string> = {
  'rauw-vlees': 'bevat rauw of kort gegaard vlees',
  'rauwe-vis': 'bevat rauwe vis',
  'rauw-ei': 'bevat rauw ei',
  ongepasteuriseerd: 'bevat ongepasteuriseerde zuivel',
  'lever-vitamine-a': 'bevat lever (hoog in vitamine A)',
  'kwikrijke-vis': 'bevat vis die hoger in kwik kan zijn',
  alcohol: 'bevat alcohol',
  'rauwmelkse-kaas': 'bevat rauwmelkse kaas',
};

/**
 * Turn an authored recipe into the normalised form the engines use:
 * every ingredient in base units per single serving, and allergens /
 * vegetarian / vegan / pregnancy suitability derived from the ingredients
 * rather than hand-maintained (which always drifts).
 */
export function normaliseRecipe(authored: AuthoredRecipe, ingredients: IngredientIndex): Recipe {
  if (authored.baseServings <= 0) {
    throw new RecipeNormalisationError('baseServings must be positive', { recipeId: authored.id });
  }

  const resolved: { line: RecipeIngredient; ingredient: CanonicalIngredient }[] = [];

  for (const line of authored.ingredients) {
    const ingredient = ingredients.get(line.ingredientId);
    if (!ingredient) {
      throw new RecipeNormalisationError(`Unknown ingredient "${line.ingredientId}"`, {
        recipeId: authored.id,
        ingredientId: line.ingredientId,
      });
    }
    const total = toBaseQuantity(line.amount, line.unit, {
      baseUnit: ingredient.baseUnit,
      density: ingredient.density,
      pieceWeightGrams: ingredient.pieceWeightGrams,
    });
    resolved.push({
      ingredient,
      line: {
        ingredientId: line.ingredientId,
        perServing: {
          amount: total.amount / authored.baseServings,
          unit: total.unit,
        },
        optional: line.optional ?? false,
        ...(line.note !== undefined ? { note: line.note } : {}),
      },
    });
  }

  const allergens = new Set<Allergen>(authored.extraAllergens ?? []);
  const pregnancyReasons = new Set<string>();
  let vegetarian = true;
  let vegan = true;

  for (const { ingredient } of resolved) {
    for (const allergen of ingredient.allergens) allergens.add(allergen);
    for (const risk of ingredient.pregnancyRisks) {
      pregnancyReasons.add(PREGNANCY_RISK_LABELS[risk] ?? risk);
    }
    if (!ingredient.vegetarian) vegetarian = false;
    if (!ingredient.vegan) vegan = false;
  }

  const pregnancySuitable =
    authored.pregnancySuitableOverride ?? pregnancyReasons.size === 0;

  return {
    id: authored.id,
    name: authored.name,
    description: authored.description,
    imageUrl: authored.imageUrl,
    steps: authored.steps,
    prepMinutes: authored.prepMinutes,
    cookMinutes: authored.cookMinutes,
    totalMinutes: authored.prepMinutes + authored.cookMinutes,
    difficulty: authored.difficulty,
    cuisine: authored.cuisine,
    tags: authored.tags,
    baseServings: authored.baseServings,
    ingredients: resolved.map((r) => r.line),
    nutritionPerServing: authored.nutritionPerServing,
    primaryProtein: authored.primaryProtein,
    allergens: [...allergens].sort(),
    vegetarian,
    vegan,
    pregnancySuitable,
    pregnancyRiskReasons: [...pregnancyReasons].sort(),
  };
}

export function normaliseRecipes(
  authored: readonly AuthoredRecipe[],
  ingredients: IngredientIndex,
): Recipe[] {
  return authored.map((r) => normaliseRecipe(r, ingredients));
}
