import { describe, expect, it } from 'vitest';
import { buildIngredientIndex } from '@/domain/ingredients/types';
import { normaliseRecipe, RecipeNormalisationError } from '@/domain/recipes/normalise';
import {
  LIMITS,
  validateAuthoredUnits,
  validateLibrary,
  validateRecipe,
} from '@/domain/recipes/validation';
import type { AuthoredRecipe, AuthoredRecipeIngredient } from '@/domain/recipes/types';
import { makeIngredient } from '../../support/builders';

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

const ingredients = buildIngredientIndex([
  makeIngredient('kipfilet', {
    vegetarian: false,
    vegan: false,
    nutritionPer100: per100(110, 23, 0, 2),
  }),
  makeIngredient('spaghetti', { nutritionPer100: per100(350, 12, 71, 1.5) }),
  makeIngredient('aardappel', { nutritionPer100: per100(77, 2, 17, 0.1) }),
  makeIngredient('broccoli', {
    category: 'groente-fruit',
    nutritionPer100: per100(34, 3, 4, 0.4),
  }),
  makeIngredient('wraps', { baseUnit: 'piece', nutritionPer100: per100(300, 8, 50, 6) }),
  makeIngredient('komijn', {
    category: 'kruiden-specerijen',
    nutritionPer100: per100(375, 18, 34, 22),
  }),
  makeIngredient('olijfolie', {
    baseUnit: 'ml',
    density: 0.92,
    nutritionPer100: per100(884, 0, 0, 100),
  }),
  makeIngredient('tomatenpuree', { nutritionPer100: per100(82, 4, 15, 0.5) }),
  makeIngredient('zout', { pantryStaple: true, nutritionPer100: per100(0, 0, 0, 0) }),
]);

const SOUND: readonly AuthoredRecipeIngredient[] = [
  { ingredientId: 'kipfilet', amount: 500, unit: 'g' },
  { ingredientId: 'spaghetti', amount: 350, unit: 'g' },
  { ingredientId: 'broccoli', amount: 600, unit: 'g' },
  { ingredientId: 'tomatenpuree', amount: 70, unit: 'g' },
  { ingredientId: 'olijfolie', amount: 2, unit: 'tbsp' },
  { ingredientId: 'komijn', amount: 5, unit: 'g' },
  { ingredientId: 'zout', amount: 4, unit: 'g' },
];

function authored(overrides: Partial<AuthoredRecipe> = {}): AuthoredRecipe {
  return {
    id: 'kip-pasta-broccoli',
    name: 'Kip met pasta en broccoli',
    description: 'Een test.',
    imageUrl: '',
    steps: ['Kook de pasta.', 'Bak de kip.', 'Meng alles.'],
    prepMinutes: 10,
    cookMinutes: 20,
    difficulty: 'makkelijk',
    cuisine: 'italiaans',
    mealType: 'dinner',
    tags: ['pasta', 'kip'],
    baseServings: 4,
    ingredients: SOUND,
    primaryProtein: 'kip',
    provenance: { kind: 'INTERNAL', licence: 'INTERNAL', addedAt: '2026-01-01T00:00:00.000Z' },
    ...overrides,
  };
}

function check(overrides: Partial<AuthoredRecipe> = {}) {
  const a = authored(overrides);
  return validateRecipe(normaliseRecipe(a, ingredients), ingredients, a);
}

function codes(overrides: Partial<AuthoredRecipe> = {}) {
  return check(overrides).map((p) => p.code);
}

describe('a sound recipe passes cleanly', () => {
  it('reports nothing at all', () => {
    expect(check()).toEqual([]);
  });
});

describe('quantity guards', () => {
  it('refuses half a kilo of chicken per person', () => {
    const lines = SOUND.map((l) =>
      l.ingredientId === 'kipfilet' ? { ...l, amount: 2, unit: 'kg' as const } : l,
    );
    const problems = check({ ingredients: lines });
    expect(
      problems.some((p) => p.code === 'EXTREME_PROTEIN_PER_PERSON' && p.severity === 'ERROR'),
    ).toBe(true);
    expect(LIMITS.proteinMaxGrams).toBe(350);
  });

  it('warns when the protein in the title is a garnish', () => {
    const lines = SOUND.map((l) => (l.ingredientId === 'kipfilet' ? { ...l, amount: 120 } : l));
    expect(codes({ ingredients: lines })).toContain('TOO_LITTLE_PROTEIN_PER_PERSON');
  });

  it('treats a kilo of dry pasta per person as an error, not a warning', () => {
    const lines = SOUND.map((l) => (l.ingredientId === 'spaghetti' ? { ...l, amount: 5000 } : l));
    const problems = check({ ingredients: lines });
    const carb = problems.find((p) => p.code === 'EXTREME_DRY_CARB_PER_PERSON');
    expect(carb?.severity).toBe('ERROR');
  });

  it('catches an absurd amount of a dry spice', () => {
    const lines = SOUND.map((l) => (l.ingredientId === 'komijn' ? { ...l, amount: 500 } : l));
    expect(codes({ ingredients: lines })).toContain('EXTREME_SPICE_PER_PERSON');
  });

  it('catches an absurd amount of oil', () => {
    const lines = SOUND.map((l) =>
      l.ingredientId === 'olijfolie' ? { ...l, amount: 400, unit: 'ml' as const } : l,
    );
    expect(codes({ ingredients: lines })).toContain('EXTREME_OIL_PER_PERSON');
  });

  it('notices a dish with almost no vegetables', () => {
    const lines = SOUND.filter((l) => l.ingredientId !== 'broccoli');
    expect(codes({ ingredients: lines })).toContain('TOO_LITTLE_VEGETABLE_PER_PERSON');
  });

  it('flags a piece count nobody can buy', () => {
    const lines = [...SOUND, { ingredientId: 'wraps', amount: 5.5, unit: 'piece' as const }];
    const problems = check({ ingredients: lines });
    expect(problems.some((p) => p.code === 'FRACTIONAL_PIECES')).toBe(true);
  });

  it('flags an implausible calorie count', () => {
    const lines = SOUND.map((l) => (l.ingredientId === 'olijfolie' ? { ...l, amount: 30 } : l));
    const problems = check({ ingredients: lines });
    // 30 tbsp of oil is 450 ml, which alone is about a thousand calories each.
    expect(problems.some((p) => p.code === 'EXTREME_KCAL')).toBe(true);
  });
});

describe('unit guards', () => {
  // These run on the authored lines rather than a normalised recipe, because
  // normalisation throws on exactly these mistakes — the guard exists to name
  // the line instead of crashing the whole import.
  const unitCodes = (overrides: Partial<AuthoredRecipe>) =>
    validateAuthoredUnits(authored(overrides), ingredients).map((p) => p.code);

  it('refuses millilitres on a solid with no density', () => {
    const lines = SOUND.map((l) =>
      l.ingredientId === 'kipfilet' ? { ...l, unit: 'ml' as const } : l,
    );
    expect(unitCodes({ ingredients: lines })).toContain('GRAM_MILLILITRE_CONFUSION');
  });

  it('refuses pieces for an ingredient with no piece weight', () => {
    const lines = SOUND.map((l) =>
      l.ingredientId === 'broccoli' ? { ...l, amount: 2, unit: 'piece' as const } : l,
    );
    expect(unitCodes({ ingredients: lines })).toContain('PIECES_WITHOUT_PIECE_WEIGHT');
  });

  it('names an unknown ingredient rather than throwing', () => {
    const lines = [...SOUND, { ingredientId: 'draak', amount: 1, unit: 'g' as const }];
    expect(unitCodes({ ingredients: lines })).toContain('UNKNOWN_INGREDIENT');
  });

  it('says nothing about a recipe whose units all convert', () => {
    expect(validateAuthoredUnits(authored(), ingredients)).toEqual([]);
  });
});

describe('schema, licence and tags', () => {
  it('rejects a licence that may not ship', () => {
    const problems = check({
      provenance: {
        kind: 'EXTERNAL',
        licence: 'UNKNOWN',
        source: 'ergens',
        addedAt: '2026-01-01T00:00:00.000Z',
      },
    });
    expect(problems.map((p) => p.code)).toContain('LICENCE_NOT_PRODUCTION_SAFE');
  });

  it('rejects CC-BY without the attribution it requires', () => {
    const problems = check({
      provenance: {
        kind: 'EXTERNAL',
        licence: 'CC_BY',
        source: 'ergens',
        addedAt: '2026-01-01T00:00:00.000Z',
      },
    });
    expect(problems.map((p) => p.code)).toContain('PROVENANCE_INCOMPLETE');
  });

  it('refuses a vegetarian tag on a dish with chicken in it', () => {
    const problems = check({ tags: ['pasta', 'vegetarisch'] });
    const mismatch = problems.find((p) => p.code === 'DIETARY_TAG_MISMATCH');
    expect(mismatch?.severity).toBe('ERROR');
  });

  it('refuses a protein tag that contradicts primaryProtein', () => {
    expect(codes({ tags: ['pasta', 'vis'] })).toContain('PROTEIN_TAG_MISMATCH');
  });

  it('refuses an id that is not stable kebab-case', () => {
    expect(codes({ id: 'Kip Pasta!' })).toContain('SCHEMA_INCOMPLETE');
  });

  it('spots a duplicate id across the library', () => {
    const a = authored();
    const one = normaliseRecipe(a, ingredients);
    const problems = validateLibrary([one, one], ingredients, [a]);
    expect(problems.some((p) => p.code === 'DUPLICATE_ID')).toBe(true);
  });
});

describe('nutrition', () => {
  it('will not normalise a recipe that has neither coverage nor a fallback', () => {
    const thin = buildIngredientIndex([makeIngredient('kipfilet', { vegetarian: false })]);
    expect(() =>
      normaliseRecipe(
        authored({ ingredients: [{ ingredientId: 'kipfilet', amount: 500, unit: 'g' }] }),
        thin,
      ),
    ).toThrow(RecipeNormalisationError);
  });

  it('keeps the authored value when coverage is incomplete and one was written', () => {
    const thin = buildIngredientIndex([makeIngredient('kipfilet', { vegetarian: false })]);
    const recipe = normaliseRecipe(
      authored({
        ingredients: [{ ingredientId: 'kipfilet', amount: 500, unit: 'g' }],
        nutritionPerServing: {
          kcal: 500,
          proteinGrams: 30,
          carbGrams: 40,
          fatGrams: 15,
          fiberGrams: 5,
          saltGrams: 1,
        },
      }),
      thin,
    );
    expect(recipe.nutritionSource).toBe('authored');
    expect(recipe.nutritionPerServing.kcal).toBe(500);
  });
});
