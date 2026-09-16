import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { DEMO_HOUSEHOLD } from '@/data/seed/demo-household';
import { DEFAULT_WEEK_SETTINGS } from '@/data/repositories/types';

/**
 * The service-level half of the availability gate.
 *
 * `partitionByAvailability` is pure and tested on its own; this checks the
 * thing that actually decides what a user is offered — that the plan service
 * asks the live catalogue what it can sell, and hands the optimizer only those
 * recipes. A pure function that nobody wires up protects nobody.
 */
const available = existsSync('data/external/checkjebon-snapshot.json');
const describeSnapshot = available ? describe : describe.skip;

describeSnapshot('the pool the week generator draws from', () => {
  it('drops every recipe the real catalogue cannot sell', async () => {
    process.env.DATA_MODE = 'REAL';
    const { selectableRecipes } = await import('@/services/plan-service');
    const { purchasableIngredientIds } = await import('@/services/store-service');
    const { getCatalogue } = await import('@/services/catalogue');
    const { requiredIngredientIds } = await import('@/domain/recipes/feasibility');

    const context = {
      household: DEMO_HOUSEHOLD,
      settings: DEFAULT_WEEK_SETTINGS,
      startDate: '2026-09-14',
      today: new Date('2026-09-16T09:00:00Z'),
    };

    const { recipes, unavailable } = await selectableRecipes(context);
    const purchasable = await purchasableIngredientIds(context.startDate);
    const catalogue = getCatalogue();

    // Nothing is lost and nothing is invented: the two halves are the library.
    expect(recipes.length + unavailable.length).toBe(catalogue.recipes.length);
    expect(recipes.length).toBeGreaterThanOrEqual(120);

    for (const recipe of recipes) {
      for (const id of requiredIngredientIds(recipe, catalogue.ingredientIndex)) {
        expect(purchasable.has(id), `${recipe.id} needs ${id}`).toBe(true);
      }
    }

    const pool = new Set(recipes.map((r) => r.id));
    for (const verdict of unavailable) {
      expect(pool.has(verdict.recipeId)).toBe(false);
      expect(verdict.status).toBe('PRODUCTION_UNAVAILABLE_DATA_GAP');
      expect(verdict.missingIngredientIds.length).toBeGreaterThan(0);
      for (const id of verdict.missingIngredientIds) expect(purchasable.has(id)).toBe(false);
    }
  }, 180_000);

  it('plans a week only from dishes the user could actually shop for', async () => {
    process.env.DATA_MODE = 'REAL';
    const { generatePlan, selectableRecipes } = await import('@/services/plan-service');
    const { SEED_LOCATIONS } = await import('@/data/seed/stores');

    const context = {
      household: DEMO_HOUSEHOLD,
      settings: {
        ...DEFAULT_WEEK_SETTINGS,
        selectedLocationIds: ['ah', 'jumbo', 'lidl'].map(
          (chainId) => SEED_LOCATIONS.find((l) => l.chainId === chainId)!.id,
        ),
        maxStores: 3,
      },
      startDate: '2026-09-14',
      today: new Date('2026-09-16T09:00:00Z'),
    };

    const result = await generatePlan(context);
    expect(result.status).toBe('OK');
    if (result.status !== 'OK') return;

    const selectable = new Set((await selectableRecipes(context)).recipes.map((r) => r.id));
    for (const day of result.plan.days) expect(selectable.has(day.recipe.id)).toBe(true);
  }, 180_000);

  it('gives a different week when the dishes already seen are excluded', async () => {
    process.env.DATA_MODE = 'REAL';
    const { generatePlan } = await import('@/services/plan-service');
    const { SEED_LOCATIONS } = await import('@/data/seed/stores');

    const context = {
      household: DEMO_HOUSEHOLD,
      settings: {
        ...DEFAULT_WEEK_SETTINGS,
        selectedLocationIds: ['ah', 'jumbo', 'lidl'].map(
          (chainId) => SEED_LOCATIONS.find((l) => l.chainId === chainId)!.id,
        ),
        maxStores: 3,
      },
      startDate: '2026-09-14',
      today: new Date('2026-09-16T09:00:00Z'),
    };

    const first = await generatePlan(context);
    expect(first.status).toBe('OK');
    if (first.status !== 'OK') return;
    const firstIds = first.plan.days.map((d) => d.recipe.id);

    // Same question twice is the same answer — that is the design.
    const repeat = await generatePlan(context);
    expect(repeat.status).toBe('OK');
    if (repeat.status !== 'OK') return;
    expect(repeat.plan.days.map((d) => d.recipe.id)).toEqual(firstIds);

    // A different question is a different answer.
    const second = await generatePlan(context, { excludeRecipeIds: firstIds });
    expect(second.status).toBe('OK');
    if (second.status !== 'OK') return;
    const secondIds = second.plan.days.map((d) => d.recipe.id);
    expect(secondIds.some((id) => firstIds.includes(id))).toBe(false);
  }, 300_000);
});
