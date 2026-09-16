import { describe, expect, it } from 'vitest';
import {
  CARB_FLOOR_GRAMS_PER_SERVING,
  checkDiversity,
  cookingMethodOf,
  findDuplicatePairs,
  ingredientOverlap,
  jaccard,
  primaryCarbOf,
  profileLibrary,
  signatureOfRecipe,
  titleTokens,
} from '@/domain/recipes/library';
import { buildIngredientIndex } from '@/domain/ingredients/types';
import { normaliseRecipe } from '@/domain/recipes/normalise';
import type { AuthoredRecipe, AuthoredRecipeIngredient } from '@/domain/recipes/types';
import { makeIngredient } from '../../support/builders';

const ingredients = buildIngredientIndex([
  makeIngredient('spaghetti', { nutritionPer100: per100(350, 12, 71, 1.5) }),
  makeIngredient('aardappel', { nutritionPer100: per100(77, 2, 17, 0.1) }),
  makeIngredient('witte-rijst', { nutritionPer100: per100(355, 7, 78, 1) }),
  makeIngredient('kipfilet', {
    vegetarian: false,
    vegan: false,
    nutritionPer100: per100(110, 23, 0, 2),
  }),
  makeIngredient('ui', { pieceWeightGrams: 110, nutritionPer100: per100(40, 1, 9, 0.1) }),
  makeIngredient('tomaat', { nutritionPer100: per100(18, 1, 4, 0.2) }),
  makeIngredient('zout', { pantryStaple: true, nutritionPer100: per100(0, 0, 0, 0) }),
]);

function per100(kcal: number, protein: number, carbohydrates: number, fat: number) {
  return {
    kcal,
    protein,
    carbohydrates,
    sugars: 0,
    fat,
    saturatedFat: 0,
    fiber: 2,
    salt: 0.1,
  };
}

function recipe(
  id: string,
  overrides: Partial<AuthoredRecipe> & { ingredients: readonly AuthoredRecipeIngredient[] },
) {
  return normaliseRecipe(
    {
      id,
      name: overrides.name ?? id,
      description: 'test',
      imageUrl: '',
      steps: ['stap een', 'stap twee'],
      prepMinutes: 10,
      cookMinutes: 20,
      difficulty: 'makkelijk',
      cuisine: 'nederlands',
      mealType: 'dinner',
      tags: [],
      baseServings: 4,
      primaryProtein: 'geen',
      provenance: { kind: 'INTERNAL', licence: 'INTERNAL', addedAt: '2026-01-01T00:00:00.000Z' },
      ...overrides,
    },
    ingredients,
  );
}

describe('primary carbohydrate', () => {
  it('picks the family contributing the most grams, not the first one listed', () => {
    const dish = recipe('mixed', {
      ingredients: [
        { ingredientId: 'witte-rijst', amount: 60, unit: 'g' },
        { ingredientId: 'aardappel', amount: 800, unit: 'g' },
      ],
    });
    expect(primaryCarbOf(dish, ingredients)).toBe('aardappel');
  });

  it('calls a garnish of starch no carbohydrate at all', () => {
    const dish = recipe('salad', {
      ingredients: [
        { ingredientId: 'tomaat', amount: 600, unit: 'g' },
        // 40 g of rice over four servings is 10 g each — below the floor.
        { ingredientId: 'witte-rijst', amount: 40, unit: 'g' },
      ],
    });
    expect(CARB_FLOOR_GRAMS_PER_SERVING).toBeGreaterThan(10);
    expect(primaryCarbOf(dish, ingredients)).toBe('geen');
  });

  it('ignores optional lines, because nobody buys them', () => {
    const dish = recipe('optional-carb', {
      ingredients: [
        { ingredientId: 'tomaat', amount: 600, unit: 'g' },
        { ingredientId: 'spaghetti', amount: 400, unit: 'g', optional: true },
      ],
    });
    expect(primaryCarbOf(dish, ingredients)).toBe('geen');
  });
});

describe('cooking method', () => {
  it('reads the tag before the text', () => {
    const dish = recipe('tagged', {
      tags: ['soep'],
      steps: ['Bak de ui', 'Rooster in de oven'],
      ingredients: [{ ingredientId: 'tomaat', amount: 600, unit: 'g' }],
    });
    expect(cookingMethodOf(dish)).toBe('soep');
  });

  it('does not treat stock as evidence of soup', () => {
    // Regression: "bouillon" in a step turned a two-hour beef stew into a soup,
    // which then collided with a mash in the duplicate check.
    const dish = recipe('stoof', {
      name: 'Hachee',
      steps: ['Voeg bouillon en laurier toe.', 'Stoof twee uur op laag vuur.'],
      ingredients: [{ ingredientId: 'aardappel', amount: 800, unit: 'g' }],
    });
    expect(cookingMethodOf(dish)).toBe('stoof');
  });
});

describe('duplicate detection', () => {
  const base: readonly AuthoredRecipeIngredient[] = [
    { ingredientId: 'spaghetti', amount: 350, unit: 'g' },
    { ingredientId: 'kipfilet', amount: 400, unit: 'g' },
    { ingredientId: 'tomaat', amount: 400, unit: 'g' },
    { ingredientId: 'ui', amount: 1, unit: 'piece' },
  ];

  it('flags the same dish under a different name', () => {
    const pairs = findDuplicatePairs(
      [
        recipe('a', { name: 'Pasta met kip', cuisine: 'italiaans', ingredients: base }),
        recipe('b', { name: 'Romige pasta met kipfilet', cuisine: 'italiaans', ingredients: base }),
      ],
      ingredients,
    );
    expect(pairs).toHaveLength(1);
    expect(pairs[0]!.reason).toBe('INGREDIENT_OVERLAP');
  });

  it('leaves two dishes alone when the signature differs', () => {
    const pairs = findDuplicatePairs(
      [
        recipe('a', { name: 'Pasta met kip', cuisine: 'italiaans', ingredients: base }),
        recipe('b', { name: 'Pasta met kip', cuisine: 'aziatisch', ingredients: base }),
      ],
      ingredients,
    );
    expect(pairs).toHaveLength(0);
  });

  it('counts a cluster of three as one dish, not zero', () => {
    const profile = profileLibrary(
      [
        recipe('a', { cuisine: 'italiaans', ingredients: base }),
        recipe('b', { cuisine: 'italiaans', ingredients: base }),
        recipe('c', { cuisine: 'italiaans', ingredients: base }),
      ],
      ingredients,
    );
    expect(profile.total).toBe(3);
    expect(profile.uniqueAfterDedupe).toBe(1);
  });

  it('excludes pantry staples from the ingredient set', () => {
    const signature = signatureOfRecipe(
      recipe('s', {
        ingredients: [
          { ingredientId: 'tomaat', amount: 400, unit: 'g' },
          { ingredientId: 'zout', amount: 4, unit: 'g' },
        ],
      }),
      ingredients,
    );
    expect(signature.core).toEqual(['tomaat']);
  });
});

describe('set comparison helpers', () => {
  it('measures overlap against the smaller set', () => {
    expect(ingredientOverlap(['a', 'b'], ['a', 'b', 'c', 'd'])).toBe(1);
    expect(ingredientOverlap([], ['a'])).toBe(0);
  });

  it('drops filler words from a title before comparing', () => {
    expect([...titleTokens('Romige pasta met kip')].sort()).toEqual(['kip', 'pasta']);
    expect(
      jaccard(titleTokens('Pasta met kip'), titleTokens('Romige pasta met kipfilet')),
    ).toBeLessThan(0.8);
  });
});

describe('diversity gate', () => {
  it('warns when one carbohydrate dominates', () => {
    const library = Array.from({ length: 10 }, (_, i) =>
      recipe(`r${i}`, {
        cuisine: i < 5 ? 'italiaans' : 'nederlands',
        ingredients: [{ ingredientId: 'spaghetti', amount: 350, unit: 'g' }],
      }),
    );
    const warnings = checkDiversity(profileLibrary(library, ingredients));
    expect(warnings.some((w) => w.kind === 'CARB_SHARE' && w.label === 'pasta')).toBe(true);
  });

  it('reports a meal style nobody covers', () => {
    const warnings = checkDiversity(
      profileLibrary(
        [recipe('one', { ingredients: [{ ingredientId: 'tomaat', amount: 600, unit: 'g' }] })],
        ingredients,
      ),
    );
    expect(warnings.some((w) => w.kind === 'STYLE_MISSING' && w.label === 'curry')).toBe(true);
  });
});
