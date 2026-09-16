import { describe, expect, it } from 'vitest';
import { SEED_INGREDIENTS } from '@/data/seed/ingredients';
import { SEED_RECIPES } from '@/data/seed/recipes';
import { SPRINT2_RECIPES } from '@/data/seed/recipes-sprint2';
import { buildIngredientIndex } from '@/domain/ingredients/types';
import { normaliseRecipes } from '@/domain/recipes/normalise';
import { optimisePackaging } from '@/domain/packaging/optimise';
import {
  assessAvailability,
  partitionByAvailability,
  requiredIngredientIds,
} from '@/domain/recipes/feasibility';
import { findDuplicatePairs } from '@/domain/recipes/library';
import { validateLibrary } from '@/domain/recipes/validation';
import { loadRealChains } from '../support/real-data-store';

/**
 * What the planner is allowed to put in front of a person.
 *
 * The library has 138 records; that is not the number that matters. A recipe
 * whose ingredients no shop sells is a plan the user cannot shop, so it is a
 * record and not an option — and the count that decides whether this library is
 * big enough is the one left after both that filter and deduplication.
 */
const ingredients = buildIngredientIndex(SEED_INGREDIENTS);
const recipes = normaliseRecipes(SEED_RECIPES, ingredients);

/** The real AH + Jumbo + Lidl universe, the same union the service builds. */
const fixture = loadRealChains(['ah', 'jumbo', 'lidl']);
const purchasable = new Set<string>();
for (const chain of fixture.chains) {
  for (const offer of chain.allOffers) purchasable.add(offer.ingredientId);
}

const { available, unavailable } = partitionByAvailability(recipes, ingredients, purchasable);

const duplicatePairs = findDuplicatePairs(available, ingredients);
const collapsed = new Set<string>();
for (const pair of duplicatePairs) if (!collapsed.has(pair.a)) collapsed.add(pair.b);
const uniqueSelectable = available.length - collapsed.size;

/** The gate: unique, selectable, real recipes. */
const MINIMUM = 120;

describe('the three counts', () => {
  it('A — total production records', () => {
    expect(recipes.length).toBe(141);
  });

  it('B — at least 120 recipes are selectable against the real catalogue', () => {
    expect(available.length).toBeGreaterThanOrEqual(MINIMUM);
  });

  it('C — at least 120 of those are genuinely different dishes', () => {
    expect(uniqueSelectable).toBeGreaterThanOrEqual(MINIMUM);
  });
});

describe('an unavailable recipe never reaches the planner', () => {
  it('keeps every recipe with an unbuyable ingredient out of the pool', () => {
    const poolIds = new Set(available.map((r) => r.id));
    for (const verdict of unavailable) {
      expect(verdict.missingIngredientIds.length).toBeGreaterThan(0);
      expect(poolIds.has(verdict.recipeId)).toBe(false);
    }
  });

  it('only ever holds a recipe back for an ingredient that really has no offer', () => {
    for (const verdict of unavailable) {
      for (const id of verdict.missingIngredientIds) expect(purchasable.has(id)).toBe(false);
    }
  });

  it('lets every selectable recipe be bought line by line', () => {
    for (const recipe of available) {
      for (const id of requiredIngredientIds(recipe, ingredients)) {
        expect(purchasable.has(id), `${recipe.id} needs ${id}`).toBe(true);
      }
    }
  });

  it('names the data gap rather than pretending the dish is fine', () => {
    const blocked = recipes.find((r) => r.id === 'linzensoep')!;
    const verdict = assessAvailability(blocked, ingredients, purchasable);
    expect(verdict.status).toBe('PRODUCTION_UNAVAILABLE_DATA_GAP');
    expect(verdict.missingIngredientIds).toContain('stokbrood');
  });
});

describe('a missing product never becomes a free one', () => {
  it('refuses to price an ingredient the shop does not sell', () => {
    const result = optimisePackaging('stokbrood', 500, [], undefined, 'g');
    expect(result.status).toBe('UNAVAILABLE');
    if (result.status !== 'UNAVAILABLE') throw new Error('unreachable');
    expect(result.reason).toBe('NO_PRODUCTS');
  });

  it('refuses a requirement that is not a finite number', () => {
    const offers = fixture.chains[0]!.allOffers.filter((o) => o.ingredientId === 'aardappel');
    expect(offers.length).toBeGreaterThan(0);
    const result = optimisePackaging('aardappel', Number.NaN, offers, undefined, 'g');
    expect(result.status).toBe('UNAVAILABLE');
    if (result.status !== 'UNAVAILABLE') throw new Error('unreachable');
    expect(result.reason).toBe('REQUIREMENT_NOT_FINITE');
  });
});

describe('the selectable set is clean', () => {
  it('carries no validation errors', () => {
    const problems = validateLibrary(available, ingredients, SEED_RECIPES).filter(
      (p) => p.severity === 'ERROR',
    );
    expect(problems.map((p) => `${p.recipeId}: ${p.code}`)).toEqual([]);
  });

  it('has no unresolved audit finding among the recipes written this sprint', async () => {
    // The audit file is the record; this asserts it still describes the code.
    const { readFileSync } = await import('node:fs');
    const audit = JSON.parse(
      readFileSync('data/recipes/new-recipe-audit-sprint2.json', 'utf8'),
    ) as { results: { id: string; verdict: string }[] };

    const selectable = new Set(available.map((r) => r.id));
    const written = new Set(SPRINT2_RECIPES.map((r) => r.id));
    expect(audit.results).toHaveLength(written.size);

    const open = audit.results.filter((r) => selectable.has(r.id) && r.verdict !== 'GOOD');
    expect(open.map((r) => `${r.id}: ${r.verdict}`)).toEqual([]);
  });

  it('holds at most the one duplicate pair that is a known false positive', () => {
    // hachee and hutspot; see RECIPE_LIBRARY.md for why both stay.
    expect(duplicatePairs.map((p) => `${p.a}~${p.b}`)).toEqual(['hachee~hutspot-rundvlees']);
  });
});
