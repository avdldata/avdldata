import { describe, expect, it } from 'vitest';
import { SEED_INGREDIENTS } from '@/data/seed/ingredients';
import { SEED_RECIPES } from '@/data/seed/recipes';
import { buildIngredientIndex } from '@/domain/ingredients/types';
import { normaliseRecipes } from '@/domain/recipes/normalise';
import { assessFeasibility } from '@/domain/recipes/feasibility';
import {
  checkDiversity,
  MEAL_STYLES,
  MIN_PER_MEAL_STYLE,
  profileLibrary,
} from '@/domain/recipes/library';
import { isProductionSafeLicence } from '@/domain/recipes/types';
import { validateAuthoredUnits, validateLibrary } from '@/domain/recipes/validation';
import { loadRealChains } from '../support/real-data-store';

/**
 * The production recipe library, held to the bar the library was grown to meet.
 *
 * These are gates, not diagnostics: each one failed at some point while the
 * library was being written, and each one caught something real — a duplicate
 * dish, a vegan dinner nobody filtering on vegan would ever be shown, a recipe
 * naming an ingredient no chain stocks. Keeping them as tests is what stops the
 * next batch of recipes from quietly undoing the work.
 */
const ingredients = buildIngredientIndex(SEED_INGREDIENTS);
const recipes = normaliseRecipes(SEED_RECIPES, ingredients);
const profile = profileLibrary(recipes, ingredients);

/** The floor Sprint 2 was measured against. Growth is fine; shrinking is not. */
const MINIMUM_LIBRARY_SIZE = 120;

describe('library size', () => {
  it('holds at least 120 genuinely different dinners', () => {
    expect(profile.total).toBeGreaterThanOrEqual(MINIMUM_LIBRARY_SIZE);
    expect(profile.uniqueAfterDedupe).toBeGreaterThanOrEqual(MINIMUM_LIBRARY_SIZE);
  });

  it('has near enough no duplicates left', () => {
    // One pair survives on purpose: hachee and hutspot are both Dutch stewed
    // beef on mashed potato and share six of seven ingredients. They are
    // different dishes to a cook, and the measure is honest that they are close.
    expect(profile.duplicatePairs.length).toBeLessThanOrEqual(1);
  });
});

describe('diversity', () => {
  it('passes the gate with no warnings', () => {
    expect(checkDiversity(profile)).toEqual([]);
  });

  it('covers every meal style the planner can be asked for', () => {
    for (const style of MEAL_STYLES) {
      expect(profile.mealStyles.get(style) ?? 0).toBeGreaterThanOrEqual(MIN_PER_MEAL_STYLE);
    }
  });
});

describe('validation', () => {
  const problems = validateLibrary(recipes, ingredients, SEED_RECIPES);

  it('has no errors anywhere in the library', () => {
    const errors = problems.filter((p) => p.severity === 'ERROR');
    expect(errors.map((p) => `${p.recipeId}: ${p.code} ${p.detail}`)).toEqual([]);
  });

  it('converts every authored unit without guessing', () => {
    for (const authored of SEED_RECIPES) {
      expect(validateAuthoredUnits(authored, ingredients)).toEqual([]);
    }
  });

  it('derives nutrition for every recipe rather than trusting a written value', () => {
    expect(recipes.every((r) => r.nutritionSource === 'derived')).toBe(true);
  });
});

describe('licensing', () => {
  it('ships nothing whose rights are unclear', () => {
    const unsafe = recipes.filter((r) => !isProductionSafeLicence(r.provenance.licence));
    expect(unsafe.map((r) => `${r.id} (${r.provenance.licence})`)).toEqual([]);
  });

  it('records where every recipe came from', () => {
    for (const recipe of recipes) {
      expect(recipe.provenance.addedAt).toBeTruthy();
      if (recipe.provenance.kind === 'EXTERNAL') expect(recipe.provenance.source).toBeTruthy();
    }
  });
});

describe('dietary labels are derived, never asserted', () => {
  it('never tags a dish vegetarian that contains meat or fish', () => {
    const lying = recipes.filter((r) => r.tags.includes('vegetarisch') && !r.vegetarian);
    expect(lying.map((r) => r.id)).toEqual([]);
  });

  it('tags every vegan dish as vegan, so the filter can find it', () => {
    const hidden = recipes.filter((r) => r.vegan && !r.tags.includes('veganistisch'));
    expect(hidden.map((r) => r.id)).toEqual([]);
  });

  it('marks a dish with raw-risk ingredients as unsuitable during pregnancy', () => {
    for (const recipe of recipes) {
      if (recipe.pregnancyRiskReasons.length > 0) {
        expect(recipe.pregnancySuitable).toBe(false);
      }
    }
  });
});

describe('retail feasibility against the real AH, Jumbo and Lidl snapshot', () => {
  const fixture = loadRealChains(['ah', 'jumbo', 'lidl']);
  const offersByChain = new Map<string, Set<string>>();
  for (const chain of fixture.chains) {
    const set = new Set<string>();
    for (const offer of chain.allOffers) set.add(offer.ingredientId);
    offersByChain.set(chain.chainId, set);
  }
  const feasibility = recipes.map((r) => assessFeasibility(r, ingredients, offersByChain));

  it('can buy at least 85 per cent of the library across the three chains', () => {
    const buyable = feasibility.filter((f) => f.feasibleCombined).length;
    expect(buyable / recipes.length).toBeGreaterThanOrEqual(0.85);
  });

  it('leaves enough cookable at a single chain to fill a week', () => {
    for (const chainId of offersByChain.keys()) {
      const count = feasibility.filter((f) => f.chains.includes(chainId)).length;
      expect(count).toBeGreaterThanOrEqual(7);
    }
  });

  it('adds no new unbuyable ingredient beyond the seven already known', () => {
    // These seven are absent from the price snapshot, not from the shops. The
    // test pins the list so a new recipe cannot quietly add an eighth.
    const blocked = new Set<string>();
    for (const f of feasibility) for (const id of f.missingEverywhere) blocked.add(id);
    expect([...blocked].sort()).toEqual([
      'bosui',
      'paprika-geel',
      'passata',
      'rode-currypasta',
      'rode-peper',
      'stokbrood',
      'verse-basilicum',
    ]);
  });
});
