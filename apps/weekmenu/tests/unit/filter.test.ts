import { describe, expect, it } from 'vitest';
import { filterCandidateRecipes } from '@/domain/optimization/filter';
import { makeHousehold, makeMember, makeRecipe } from '../support/builders';

const kip = makeRecipe('kip', {
  name: 'Kip',
  vegetarian: false,
  vegan: false,
  primaryProtein: 'kip',
  ingredients: [
    { ingredientId: 'kipfilet', perServing: { amount: 100, unit: 'g' }, optional: false },
  ],
});
const pasta = makeRecipe('pasta', {
  name: 'Pasta',
  tags: ['pasta'],
  allergens: ['gluten'],
  cuisine: 'italiaans',
  ingredients: [
    { ingredientId: 'spaghetti', perServing: { amount: 90, unit: 'g' }, optional: false },
  ],
});
const carbonara = makeRecipe('carbonara', {
  name: 'Carbonara',
  vegetarian: false,
  vegan: false,
  pregnancySuitable: false,
  pregnancyRiskReasons: ['bevat rauw ei'],
});
const salade = makeRecipe('salade', { name: 'Salade', vegan: true, tags: ['salade'] });
const traag = makeRecipe('traag', { name: 'Stoofpot', prepMinutes: 20, cookMinutes: 120 });

const catalogue = [kip, pasta, carbonara, salade, traag];

describe('hard constraint filtering', () => {
  it('removes dishes containing an allergen someone reacts to', () => {
    const household = makeHousehold({ members: [makeMember({ allergies: ['gluten'] })] });
    const { candidates, excluded } = filterCandidateRecipes({ household, recipes: catalogue });
    expect(candidates.map((r) => r.id)).not.toContain('pasta');
    expect(excluded.find((e) => e.recipeId === 'pasta')?.reason).toBe('ALLERGEN');
  });

  it('removes dishes that are not suitable during pregnancy', () => {
    const household = makeHousehold({
      members: [makeMember({ pregnancy: { pregnant: true, trimester: 2 } })],
    });
    const { candidates, excluded } = filterCandidateRecipes({ household, recipes: catalogue });
    expect(candidates.map((r) => r.id)).not.toContain('carbonara');
    const reason = excluded.find((e) => e.recipeId === 'carbonara');
    expect(reason?.reason).toBe('PREGNANCY');
    expect(reason?.detail).toContain('rauw ei');
  });

  it('keeps only vegetarian dishes when someone is vegetarian', () => {
    const household = makeHousehold({ members: [makeMember({ diet: 'vegetarisch' })] });
    const { candidates } = filterCandidateRecipes({ household, recipes: catalogue });
    expect(candidates.every((r) => r.vegetarian)).toBe(true);
  });

  it('keeps only vegan dishes when someone is vegan', () => {
    const household = makeHousehold({ members: [makeMember({ diet: 'veganistisch' })] });
    const { candidates } = filterCandidateRecipes({ household, recipes: catalogue });
    expect(candidates.map((r) => r.id)).toEqual(['salade']);
  });

  it('removes dishes with an explicitly excluded ingredient', () => {
    const household = makeHousehold({
      members: [makeMember({ excludedIngredientIds: ['kipfilet'] })],
    });
    const { candidates, excluded } = filterCandidateRecipes({ household, recipes: catalogue });
    expect(candidates.map((r) => r.id)).not.toContain('kip');
    expect(excluded.find((e) => e.recipeId === 'kip')?.reason).toBe('EXCLUDED_INGREDIENT');
  });

  it('honours an EXCLUDE preference on a tag and on a cuisine', () => {
    const byTag = filterCandidateRecipes({
      household: makeHousehold({
        preferences: {
          ingredients: [],
          cuisines: [],
          tags: [{ value: 'pasta', level: 'EXCLUDE' }],
        },
      }),
      recipes: catalogue,
    });
    expect(byTag.candidates.map((r) => r.id)).not.toContain('pasta');

    const byCuisine = filterCandidateRecipes({
      household: makeHousehold({
        preferences: {
          ingredients: [],
          cuisines: [{ value: 'italiaans', level: 'EXCLUDE' }],
          tags: [],
        },
      }),
      recipes: catalogue,
    });
    expect(byCuisine.candidates.map((r) => r.id)).not.toContain('pasta');
  });

  it('never lets a DISLIKE remove a dish — only EXCLUDE does that', () => {
    const { candidates } = filterCandidateRecipes({
      household: makeHousehold({
        preferences: {
          ingredients: [],
          cuisines: [],
          tags: [{ value: 'pasta', level: 'DISLIKE' }],
        },
      }),
      recipes: catalogue,
    });
    expect(candidates.map((r) => r.id)).toContain('pasta');
  });

  it('respects a maximum cooking time', () => {
    const { candidates } = filterCandidateRecipes({
      household: makeHousehold(),
      recipes: catalogue,
      maxMinutes: 60,
    });
    expect(candidates.map((r) => r.id)).not.toContain('traag');
  });

  it('can end up with nothing, and says why for every dish', () => {
    const household = makeHousehold({
      members: [makeMember({ diet: 'veganistisch', allergies: ['gluten'] })],
    });
    const { candidates, excluded } = filterCandidateRecipes({
      household,
      recipes: [kip, pasta, carbonara],
    });
    expect(candidates).toHaveLength(0);
    expect(excluded).toHaveLength(3);
    expect(excluded.every((e) => e.detail.length > 0)).toBe(true);
  });
});

describe('een recept waarvan de keuken onbekend is', () => {
  it('wordt niet geserveerd aan een huishouden dat een keuken uitsluit', async () => {
    const { filterCandidateRecipes } = await import('@/domain/optimization/filter');
    const { recipes, demoHousehold } = await import('../support/fixtures');
    const unknown = { ...recipes[0]!, id: 'onbekende-keuken', cuisine: 'internationaal' as const };

    const excluding = {
      ...demoHousehold,
      preferences: {
        ...demoHousehold.preferences,
        cuisines: [{ value: 'mexicaans' as const, level: 'EXCLUDE' as const }],
      },
    };
    const result = filterCandidateRecipes({ household: excluding, recipes: [unknown] });
    // Het zou de uitgesloten keuken kunnen zijn; een harde voorkeur houden we
    // door te weigeren, niet door te hopen.
    expect(result.candidates).toHaveLength(0);
    expect(result.excluded[0]?.reason).toBe('DISLIKED_EXCLUDED_CUISINE');

    const open = { ...demoHousehold, preferences: { ...demoHousehold.preferences, cuisines: [] } };
    expect(filterCandidateRecipes({ household: open, recipes: [unknown] }).candidates).toHaveLength(
      1,
    );
  });
});
