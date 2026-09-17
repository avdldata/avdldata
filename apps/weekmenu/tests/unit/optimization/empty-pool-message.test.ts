import { describe, expect, it } from 'vitest';
import { optimiseWeek } from '@/domain/optimization/week-optimizer';
import {
  demoHousehold,
  ingredientIndex,
  recipes,
  storeCandidates,
  TEST_DATE,
  TEST_TODAY,
} from '../../support/fixtures';

/**
 * ALPHA-002: als er niets overblijft, zeg dan wát het was.
 *
 * A household with a maximum cooking time of fifteen minutes gets no week at
 * all — the fastest dish in the library takes twenty. That is the filter doing
 * its job. What it used to say was "Geen enkel recept past bij de ingestelde
 * dieetregels en uitsluitingen", which sent a person looking through their
 * allergies for a setting that was in fact a number in a different screen.
 *
 * The rules themselves are unchanged here; only what the app says about them.
 */
function planWith(overrides: Partial<Parameters<typeof optimiseWeek>[0]>) {
  return optimiseWeek({
    household: demoHousehold,
    recipes,
    ingredients: ingredientIndex,
    stores: storeCandidates(),
    maxStores: 3,
    conveniencePreference: 'laagste-prijs',
    budget: {},
    startDate: TEST_DATE,
    today: TEST_TODAY,
    ...overrides,
  });
}

describe('wat de app zegt als er geen enkel gerecht overblijft', () => {
  it('noemt de bereidingstijd, en het snelste gerecht dat er wél is', () => {
    const result = planWith({ maxMinutes: 15 });

    expect(result.status).toBe('FAILED');
    if (result.status !== 'FAILED') return;
    expect(result.reason).toBe('NO_ELIGIBLE_RECIPES');
    expect(result.message).toContain('15 minuten');
    // The fastest dish in the library, so the reader knows what would work.
    const fastest = Math.min(...recipes.map((r) => r.totalMinutes));
    expect(result.message).toContain(`${fastest} minuten`);
    expect(result.message).toMatch(/bereidingstijd/i);
    // And it no longer blames a diet nobody set.
    expect(result.message).not.toMatch(/dieetregels/i);
  });

  it('noemt de keukens als die alles hebben weggefilterd', () => {
    const household = {
      ...demoHousehold,
      preferences: {
        ...demoHousehold.preferences,
        cuisines: [...new Set(recipes.map((r) => r.cuisine))].map((value) => ({
          value,
          level: 'EXCLUDE' as const,
        })),
      },
    };

    const result = planWith({ household });
    expect(result.status).toBe('FAILED');
    if (result.status !== 'FAILED') return;
    expect(result.message).toMatch(/keukens/i);
  });

  it('een echte allergie blijft hard', () => {
    // The point of the new message is that nothing about the filtering changed.
    // Three allergens at once still leaves dishes without them — and not one of
    // those three may appear in the week.
    const allergies = ['melk', 'gluten', 'ei'] as const;
    const household = {
      ...demoHousehold,
      members: demoHousehold.members.map((member) => ({
        ...member,
        allergies: [...member.allergies, ...allergies],
      })),
    };

    const result = planWith({ household });
    expect(result.status).toBe('OK');
    if (result.status !== 'OK') return;
    for (const day of result.plan.days) {
      for (const allergen of allergies) {
        expect(day.recipe.allergens, `${day.recipe.id} bevat ${allergen}`).not.toContain(allergen);
      }
    }
  });

  it('noemt de allergieën als die alles hebben weggefilterd', () => {
    // Every allergen the library knows, so nothing can survive.
    const allergies = [...new Set(recipes.flatMap((r) => r.allergens))];
    const household = {
      ...demoHousehold,
      members: demoHousehold.members.map((member) => ({ ...member, allergies })),
    };
    const onlyDishesWithAllergens = recipes.filter((r) => r.allergens.length > 0);

    const result = planWith({ household, recipes: onlyDishesWithAllergens });
    expect(result.status).toBe('FAILED');
    if (result.status !== 'FAILED') return;
    expect(result.message).toMatch(/allergeen|allergie/i);
  });

  it('laat een haalbare bereidingstijd gewoon werken', () => {
    // The guard is about impossible caps, not about caps.
    const result = planWith({ maxMinutes: 45 });
    expect(result.status).toBe('OK');
    if (result.status !== 'OK') return;
    for (const day of result.plan.days) {
      expect(day.recipe.totalMinutes).toBeLessThanOrEqual(45);
    }
  });
});
