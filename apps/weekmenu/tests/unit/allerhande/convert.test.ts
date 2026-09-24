import { describe, expect, it } from 'vitest';
import { buildIngredientIndex } from '@/domain/ingredients/types';
import { SEED_INGREDIENTS } from '@/data/seed/ingredients';
import {
  convertAllerhandeRecipe,
  cuisineOf,
  isoMinutes,
} from '@/services/recipes/allerhande/convert';
import type { StoredAllerhandeRecipe } from '@/services/recipes/allerhande/crawl';

/**
 * Allerhande → planner, tested with a recipe written for this test in the exact
 * shape Allerhande publishes (schema.org Recipe, JSON-LD). No Allerhande text
 * is committed to this repository; only the structure is borrowed.
 */
const ingredients = buildIngredientIndex(SEED_INGREDIENTS);

function stored(overrides: Record<string, unknown> = {}): StoredAllerhandeRecipe {
  return {
    recipeId: 'R-R9990001',
    url: 'https://www.ah.nl/allerhande/recept/R-R9990001/testrecept',
    fetchedAt: '2026-09-24T10:00:00.000Z',
    recipe: {
      '@context': 'https://schema.org',
      '@type': 'Recipe',
      name: 'Kip met broccoli en kikkererwten',
      description: 'Een testrecept in Allerhande-vorm.',
      totalTime: 'PT30M',
      recipeYield: '4',
      recipeCategory: 'hoofdgerecht',
      recipeCuisine: '',
      keywords: 'kip, hoofdgerecht, koken',
      recipeIngredient: [
        '500 g AH kipdijfilet',
        '1 ui',
        '2 tenen knoflook',
        '600 g broccoli',
        '1 blik kikkererwten (400 g)',
        '2 el olijfolie',
        '300 g rijst',
        'peper en zout',
      ],
      recipeInstructions: [
        { '@type': 'HowToStep', text: 'Kook de rijst.' },
        { '@type': 'HowToStep', text: 'Bak de kip met ui en knoflook.' },
        { '@type': 'HowToStep', text: 'Voeg broccoli en kikkererwten toe.' },
      ],
      ...overrides,
    },
  };
}

function ok(record: StoredAllerhandeRecipe) {
  const result = convertAllerhandeRecipe(record, ingredients);
  if (!result.ok) throw new Error(JSON.stringify(result.rejections));
  return result;
}

describe('een Allerhande-recept omzetten', () => {
  it('wordt een geldig privé-recept met afgeleide eigenschappen', () => {
    const { authored, recipe } = ok(stored());

    expect(recipe.id).toBe('ah-9990001');
    expect(recipe.baseServings).toBe(4);
    expect(recipe.totalMinutes).toBe(30);
    expect(recipe.steps).toHaveLength(3);
    expect(recipe.primaryProtein).toBe('kip');
    expect(recipe.tags).toContain('kip');
    expect(recipe.tags).toContain('rijst');
    expect(recipe.vegetarian).toBe(false);
    expect(authored.provenance).toMatchObject({
      kind: 'EXTERNAL',
      licence: 'PRIVATE_USE',
      sourceUrl: 'https://www.ah.nl/allerhande/recept/R-R9990001/testrecept',
    });
  });

  it('koppelt aan een basisingrediënt, nooit aan het merk', () => {
    const { authored } = ok(stored());
    const kip = authored.ingredients.find((line) => line.ingredientId === 'kipdijfilet');
    expect(kip).toMatchObject({ amount: 500, unit: 'g' });
    expect(JSON.stringify(authored.ingredients)).not.toMatch(/\bAH\b/);
  });

  it('rekent een verpakking alleen om als de maat erbij staat', () => {
    const { authored } = ok(stored());
    expect(authored.ingredients.find((l) => l.ingredientId === 'kikkererwten')).toMatchObject({
      amount: 400,
      unit: 'g',
    });

    const withoutSize = convertAllerhandeRecipe(
      stored({
        recipeIngredient: [...(stored().recipe['recipeIngredient'] as string[]), '1 blik mais'],
      }),
      ingredients,
    );
    expect(withoutSize.ok).toBe(false);
    if (withoutSize.ok) return;
    expect(withoutSize.rejections.map((r) => r.code)).toContain('AMOUNT_UNKNOWN');
  });

  it('laat peper en zout weg: niets te kopen, niets te verbergen', () => {
    const { authored } = ok(stored());
    expect(authored.ingredients.some((l) => l.ingredientId === 'peper')).toBe(false);
  });

  it('weigert een recept met een ingrediënt dat de catalogus niet kent, en noemt het', () => {
    const result = convertAllerhandeRecipe(
      stored({
        recipeIngredient: [
          ...(stored().recipe['recipeIngredient'] as string[]),
          '50 g gerookte amandelen',
        ],
      }),
      ingredients,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    // Amandelen zijn noten: overslaan zou een allergeen verstoppen.
    expect(result.rejections).toContainEqual(
      expect.objectContaining({ code: 'UNMATCHED_INGREDIENT', concept: 'gerookte amandelen' }),
    );
  });

  it('neemt alleen hoofdgerechten', () => {
    const result = convertAllerhandeRecipe(
      stored({ recipeCategory: 'nagerecht', keywords: 'nagerecht' }),
      ingredients,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.rejections[0]?.code).toBe('NOT_A_DINNER');
  });

  it('weigert als de eigen calorieën ver afwijken van wat Allerhande opgeeft', () => {
    // Een verkeerd gelezen hoeveelheid laat zich zo zien: 50 kcal voor een
    // bord kip met rijst kan niet kloppen.
    const result = convertAllerhandeRecipe(
      stored({ nutrition: { '@type': 'NutritionInformation', calories: '50 kcal energie' } }),
      ingredients,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.rejections[0]?.code).toBe('KCAL_MISMATCH');
  });

  it('accepteert een opgegeven waarde die wél in de buurt ligt', () => {
    const ours = Math.round(ok(stored()).recipe.nutritionPerServing.kcal);
    const result = convertAllerhandeRecipe(
      stored({ nutrition: { calories: `${Math.round(ours * 1.1)} kcal energie` } }),
      ingredients,
    );
    expect(result.ok).toBe(true);
  });

  it('noemt een onbekende keuken ook zo, en raadt niet', () => {
    expect(ok(stored()).recipe.cuisine).toBe('internationaal');
    expect(cuisineOf('', ['italiaans', 'hoofdgerecht'], 'Pasta')).toBe('italiaans');
    expect(cuisineOf('', [], 'Nasi goreng met ei')).toBe('aziatisch');
    // Twee keukens tegelijk is geen keuken.
    expect(cuisineOf('', [], 'Mexicaanse lasagne')).toBe('internationaal');
  });

  it('leest ISO-duur zoals schema.org die schrijft', () => {
    expect(isoMinutes('PT20M')).toBe(20);
    expect(isoMinutes('PT1H30M')).toBe(90);
    expect(isoMinutes('P0DT0H45M')).toBe(45);
    expect(isoMinutes('')).toBeUndefined();
  });

  it('leest stappen in elke vorm die schema.org toestaat', () => {
    const shapes = [
      'Kook de rijst.\nBak de kip.',
      ['Kook de rijst.', 'Bak de kip.'],
      {
        '@type': 'ItemList',
        itemListElement: [{ text: 'Kook de rijst.' }, { text: 'Bak de kip.' }],
      },
      [
        {
          '@type': 'HowToSection',
          itemListElement: [{ text: 'Kook de rijst.' }, { text: 'Bak de kip.' }],
        },
      ],
      {
        '@type': 'HowToSection',
        itemListElement: {
          '@type': 'ItemList',
          itemListElement: ['Kook de rijst.', 'Bak de kip.'],
        },
      },
    ];
    for (const recipeInstructions of shapes) {
      const result = ok(stored({ recipeInstructions }));
      expect(result.recipe.steps, JSON.stringify(recipeInstructions)).toEqual([
        'Kook de rijst.',
        'Bak de kip.',
      ]);
    }
  });

  it('zegt bij "geen stappen" hoe de stappen er wel uitzagen', () => {
    const result = convertAllerhandeRecipe(
      stored({ recipeInstructions: { '@type': 'Iets', video: 'x' } }),
      ingredients,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const noSteps = result.rejections.find((r) => r.code === 'NO_STEPS');
    expect(noSteps?.detail).toContain('object Iets {@type,video}');
  });

  it('herkent scharreleieren en laat versgemalen zeezout weg', () => {
    const lines = stored().recipe['recipeIngredient'] as string[];
    const { authored } = ok(
      stored({
        recipeIngredient: [...lines, '2 middelgrote scharreleieren', 'versgemalen zeezout'],
      }),
    );
    expect(authored.ingredients.find((l) => l.ingredientId === 'ei')).toMatchObject({
      amount: 2,
      unit: 'piece',
    });
    expect(authored.ingredients.some((l) => l.ingredientId === 'zout')).toBe(false);
  });
});
