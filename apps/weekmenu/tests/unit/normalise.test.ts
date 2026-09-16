import { describe, expect, it } from 'vitest';
import {
  buildAliasIndex,
  buildIngredientIndex,
  resolveIngredientName,
} from '@/domain/ingredients/types';
import { normaliseRecipe, RecipeNormalisationError } from '@/domain/recipes/normalise';
import type { AuthoredRecipe } from '@/domain/recipes/types';
import { makeIngredient } from '../support/builders';

const aliases = buildAliasIndex([
  { id: 'a1', ingredientId: 'ui', alias: 'gele ui', source: 'demo-seed' },
  { id: 'a2', ingredientId: 'ui', alias: 'uien', source: 'demo-seed' },
]);

const ingredients = buildIngredientIndex([
  makeIngredient('ui', { pieceWeightGrams: 110 }),
  makeIngredient('melk', { baseUnit: 'ml', density: 1.03, vegan: false, allergens: ['melk'] }),
  makeIngredient('kipfilet', { vegetarian: false, vegan: false }),
  makeIngredient('gerookte-zalm', {
    vegetarian: false,
    vegan: false,
    allergens: ['vis'],
    pregnancyRisks: ['rauwe-vis'],
  }),
]);

function authored(overrides: Partial<AuthoredRecipe> = {}): AuthoredRecipe {
  return {
    id: 'r1',
    name: 'Test',
    description: '',
    imageUrl: '',
    steps: [],
    prepMinutes: 10,
    cookMinutes: 20,
    difficulty: 'makkelijk',
    cuisine: 'nederlands',
    mealType: 'dinner',
    provenance: { kind: 'INTERNAL', licence: 'INTERNAL', addedAt: '2026-01-01T00:00:00.000Z' },
    tags: [],
    baseServings: 4,
    ingredients: [{ ingredientId: 'ui', amount: 2, unit: 'piece' }],
    nutritionPerServing: {
      kcal: 500,
      proteinGrams: 20,
      carbGrams: 60,
      fatGrams: 15,
      fiberGrams: 6,
      saltGrams: 1,
    },
    primaryProtein: 'geen',
    ...overrides,
  };
}

describe('recipe normalisation', () => {
  it('converts every line to base units per single serving', () => {
    const recipe = normaliseRecipe(authored(), ingredients);
    // 2 onions of 110 g over 4 servings = 55 g per serving.
    expect(recipe.ingredients[0]!.perServing).toEqual({ amount: 55, unit: 'g' });
    expect(recipe.totalMinutes).toBe(30);
  });

  it('derives allergens from the ingredients', () => {
    const recipe = normaliseRecipe(
      authored({ ingredients: [{ ingredientId: 'melk', amount: 500, unit: 'ml' }] }),
      ingredients,
    );
    expect(recipe.allergens).toEqual(['melk']);
  });

  it('derives vegetarian and vegan from the ingredients', () => {
    const veganDish = normaliseRecipe(authored(), ingredients);
    expect(veganDish.vegetarian).toBe(true);
    expect(veganDish.vegan).toBe(true);

    const dairy = normaliseRecipe(
      authored({ ingredients: [{ ingredientId: 'melk', amount: 200, unit: 'ml' }] }),
      ingredients,
    );
    expect(dairy.vegetarian).toBe(true);
    expect(dairy.vegan).toBe(false);

    const meat = normaliseRecipe(
      authored({ ingredients: [{ ingredientId: 'kipfilet', amount: 400, unit: 'g' }] }),
      ingredients,
    );
    expect(meat.vegetarian).toBe(false);
  });

  it('marks a dish unsuitable during pregnancy and says why', () => {
    const recipe = normaliseRecipe(
      authored({ ingredients: [{ ingredientId: 'gerookte-zalm', amount: 200, unit: 'g' }] }),
      ingredients,
    );
    expect(recipe.pregnancySuitable).toBe(false);
    expect(recipe.pregnancyRiskReasons.join(' ')).toContain('rauwe vis');
  });

  it('honours an explicit pregnancy override for a preparation risk', () => {
    const recipe = normaliseRecipe(authored({ pregnancySuitableOverride: false }), ingredients);
    expect(recipe.pregnancySuitable).toBe(false);
  });

  it('fails loudly on an unknown ingredient', () => {
    expect(() =>
      normaliseRecipe(
        authored({ ingredients: [{ ingredientId: 'draak', amount: 1, unit: 'piece' }] }),
        ingredients,
      ),
    ).toThrow(RecipeNormalisationError);
  });

  it('rejects a recipe with no servings', () => {
    expect(() => normaliseRecipe(authored({ baseServings: 0 }), ingredients)).toThrow(
      RecipeNormalisationError,
    );
  });
});

describe('ingredient name resolution', () => {
  const list = [...ingredients.values()];

  it('matches the canonical name, ignoring case and accents', () => {
    expect(resolveIngredientName('Ui', list, aliases)?.id).toBe('ui');
    expect(resolveIngredientName('Gerookte zalm', list, aliases)?.id).toBe('gerookte-zalm');
  });

  it('matches an alias from the alias table', () => {
    expect(resolveIngredientName('gele ui', list, aliases)?.id).toBe('ui');
    expect(resolveIngredientName('UIEN', list, aliases)?.id).toBe('ui');
  });

  it('does not match an alias that is not registered', () => {
    expect(resolveIngredientName('gele ui', list)).toBeUndefined();
  });

  it('returns nothing for an unknown name rather than guessing', () => {
    expect(resolveIngredientName('draak', list, aliases)).toBeUndefined();
  });
});
