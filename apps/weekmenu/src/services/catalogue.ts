import 'server-only';
import { existsSync, readFileSync } from 'node:fs';
import { buildIngredientIndex, type CanonicalIngredient } from '@/domain/ingredients/types';
import { normaliseRecipes } from '@/domain/recipes/normalise';
import type { AuthoredRecipe, Recipe } from '@/domain/recipes/types';
import { SEED_INGREDIENTS } from '@/data/seed/ingredients';
import { SEED_RECIPES } from '@/data/seed/recipes';

export interface Catalogue {
  readonly ingredients: readonly CanonicalIngredient[];
  readonly ingredientIndex: ReturnType<typeof buildIngredientIndex>;
  readonly recipes: readonly Recipe[];
}

let cached: Catalogue | undefined;

/**
 * The recipe and ingredient catalogue, normalised once per process.
 *
 * Normalisation (friendly units to base units, derived allergens, derived
 * vegetarian/vegan/pregnancy flags) is pure and deterministic, so caching it is
 * safe and keeps plan generation off the critical path.
 */
export function getCatalogue(): Catalogue {
  if (cached) return cached;
  const ingredientIndex = buildIngredientIndex(SEED_INGREDIENTS);
  const library = normaliseRecipes(SEED_RECIPES, ingredientIndex);
  cached = {
    ingredients: SEED_INGREDIENTS,
    ingredientIndex,
    recipes: [...library, ...privateRecipes(ingredientIndex, library)],
  };
  return cached;
}

/**
 * Recipes the owner copied for their own use — only when they say so.
 *
 * They live in a local file that git ignores, and the app reads it only when
 * `WEEKMENU_PRIVATE_RECIPES` points at it. Nothing about the shared library
 * changes, and an installation that does not set the variable — a test run, a
 * deployment — never sees them.
 *
 * A set variable with a missing file is an error, not an empty list: the owner
 * asked for these recipes, and quietly planning without them is the kind of
 * silent fallback this app refuses everywhere else.
 *
 * Each recipe is normalised on its own, because the catalogue can change after
 * the import ran: a recipe that no longer resolves is left out and counted,
 * never allowed to take the whole library down with it.
 */
function privateRecipes(
  ingredientIndex: ReturnType<typeof buildIngredientIndex>,
  library: readonly Recipe[],
): Recipe[] {
  const path = process.env.WEEKMENU_PRIVATE_RECIPES?.trim();
  if (!path) return [];
  if (!existsSync(path)) {
    throw new Error(
      `WEEKMENU_PRIVATE_RECIPES wijst naar ${path}, maar dat bestand bestaat niet. ` +
        'Draai eerst `pnpm allerhande:convert`, of haal de variabele weg.',
    );
  }
  const authored = JSON.parse(readFileSync(path, 'utf8')) as AuthoredRecipe[];
  const taken = new Set(library.map((recipe) => recipe.id));
  const loaded: Recipe[] = [];
  let skipped = 0;
  for (const recipe of authored) {
    // Only what the importer marked private, and never over a library recipe.
    if (recipe.provenance?.licence !== 'PRIVATE_USE' || taken.has(recipe.id)) {
      skipped += 1;
      continue;
    }
    try {
      loaded.push(normaliseRecipes([recipe], ingredientIndex)[0]!);
      taken.add(recipe.id);
    } catch {
      skipped += 1;
    }
  }
  console.warn(
    `[catalogus] ${loaded.length} privé-recepten geladen${skipped > 0 ? `, ${skipped} overgeslagen` : ''}`,
  );
  return loaded;
}
