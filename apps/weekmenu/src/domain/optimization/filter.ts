import type { Recipe } from '../recipes/types';
import type { Allergen, IngredientId } from '../ingredients/types';
import {
  hardExcludedIngredientIds,
  householdAllergens,
  householdHasPregnancy,
  householdRequiresPescetarianSafe,
  householdRequiresVegan,
  householdRequiresVegetarian,
  type Household,
} from '../household/types';

export const EXCLUSION_REASONS = [
  'ALLERGEN',
  'PREGNANCY',
  'VEGETARIAN_REQUIRED',
  'VEGAN_REQUIRED',
  'PESCETARIAN_REQUIRED',
  'EXCLUDED_INGREDIENT',
  'DISLIKED_EXCLUDED_TAG',
  'DISLIKED_EXCLUDED_CUISINE',
  'TOO_MUCH_TIME',
] as const;
export type ExclusionReason = (typeof EXCLUSION_REASONS)[number];

export interface ExcludedRecipe {
  readonly recipeId: string;
  readonly name: string;
  readonly reason: ExclusionReason;
  readonly detail: string;
}

export interface CandidateFilterInput {
  readonly household: Household;
  readonly recipes: readonly Recipe[];
  /** Optional cap on total cooking time, in minutes. */
  readonly maxMinutes?: number;
}

export interface CandidateFilterResult {
  readonly candidates: readonly Recipe[];
  readonly excluded: readonly ExcludedRecipe[];
}

/**
 * Hard constraints.
 *
 * These are filters, not penalties. An allergy, a pregnancy exclusion, a vegan
 * household or an explicitly excluded ingredient can never be traded away for a
 * cheaper week — no weight in the objective function can reach them.
 */
export function filterCandidateRecipes(input: CandidateFilterInput): CandidateFilterResult {
  const { household, recipes, maxMinutes } = input;

  const allergens = householdAllergens(household);
  const excludedIngredients = hardExcludedIngredientIds(household);
  const needsVegetarian = householdRequiresVegetarian(household);
  const needsVegan = householdRequiresVegan(household);
  const needsPescetarian = householdRequiresPescetarianSafe(household);
  const pregnant = householdHasPregnancy(household);
  const excludedTags = new Set(
    household.preferences.tags.filter((t) => t.level === 'EXCLUDE').map((t) => t.value),
  );
  const excludedCuisines = new Set(
    household.preferences.cuisines.filter((c) => c.level === 'EXCLUDE').map((c) => c.value),
  );

  const candidates: Recipe[] = [];
  const excluded: ExcludedRecipe[] = [];

  for (const recipe of recipes) {
    const hit = firstViolation(recipe, {
      allergens,
      excludedIngredients,
      needsVegetarian,
      needsVegan,
      needsPescetarian,
      pregnant,
      excludedTags,
      excludedCuisines,
      maxMinutes,
    });
    if (hit) {
      excluded.push({ recipeId: recipe.id, name: recipe.name, ...hit });
    } else {
      candidates.push(recipe);
    }
  }

  return { candidates, excluded };
}

interface Constraints {
  allergens: ReadonlySet<Allergen>;
  excludedIngredients: ReadonlySet<IngredientId>;
  needsVegetarian: boolean;
  needsVegan: boolean;
  needsPescetarian: boolean;
  pregnant: boolean;
  excludedTags: ReadonlySet<string>;
  excludedCuisines: ReadonlySet<string>;
  maxMinutes: number | undefined;
}

function firstViolation(
  recipe: Recipe,
  c: Constraints,
): { reason: ExclusionReason; detail: string } | undefined {
  for (const allergen of recipe.allergens) {
    if (c.allergens.has(allergen)) {
      return { reason: 'ALLERGEN', detail: `bevat ${allergen}` };
    }
  }

  if (c.pregnant && !recipe.pregnancySuitable) {
    return {
      reason: 'PREGNANCY',
      detail: recipe.pregnancyRiskReasons.join(', ') || 'niet geschikt tijdens zwangerschap',
    };
  }

  if (c.needsVegan && !recipe.vegan) {
    return { reason: 'VEGAN_REQUIRED', detail: 'niet veganistisch' };
  }

  if (c.needsVegetarian && !recipe.vegetarian) {
    return { reason: 'VEGETARIAN_REQUIRED', detail: 'niet vegetarisch' };
  }

  if (c.needsPescetarian && !recipe.vegetarian && recipe.primaryProtein !== 'vis') {
    return { reason: 'PESCETARIAN_REQUIRED', detail: 'bevat vlees' };
  }

  for (const line of recipe.ingredients) {
    if (line.optional) continue;
    if (c.excludedIngredients.has(line.ingredientId)) {
      return { reason: 'EXCLUDED_INGREDIENT', detail: `bevat ${line.ingredientId}` };
    }
  }

  for (const tag of recipe.tags) {
    if (c.excludedTags.has(tag)) {
      return { reason: 'DISLIKED_EXCLUDED_TAG', detail: `uitgesloten categorie: ${tag}` };
    }
  }

  if (c.excludedCuisines.has(recipe.cuisine)) {
    return { reason: 'DISLIKED_EXCLUDED_CUISINE', detail: `uitgesloten keuken: ${recipe.cuisine}` };
  }

  if (c.maxMinutes !== undefined && recipe.totalMinutes > c.maxMinutes) {
    return { reason: 'TOO_MUCH_TIME', detail: `${recipe.totalMinutes} minuten` };
  }

  return undefined;
}
