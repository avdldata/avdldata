import { describe, expect, it } from 'vitest';
import {
  aggregateWeekIngredients,
  MissingIngredientError,
  purchasableRequirements,
  type PlannedDay,
} from '@/domain/aggregation/aggregate';
import { buildLeftoverLedger, summariseWaste } from '@/domain/aggregation/leftovers';
import { buildIngredientIndex } from '@/domain/ingredients/types';
import { makeIngredient, makeRecipe } from '../support/builders';

const ingredients = buildIngredientIndex([
  makeIngredient('kip', { perishability: 'perishable', category: 'vlees-vis-vega' }),
  makeIngredient('rijst', { perishability: 'pantry', category: 'brood-granen' }),
  makeIngredient('zout', { pantryStaple: true, perishability: 'pantry' }),
]);

function day(dayIndex: number, lines: { id: string; perServing: number; optional?: boolean }[], servings: number): PlannedDay {
  return {
    dayIndex,
    recipe: makeRecipe(`recipe-${dayIndex}`, {
      ingredients: lines.map((l) => ({
        ingredientId: l.id,
        perServing: { amount: l.perServing, unit: 'g' as const },
        optional: l.optional ?? false,
      })),
    }),
    portions: {
      recipeId: `recipe-${dayIndex}`,
      perMember: [],
      totalServings: servings,
    },
  };
}

describe('week aggregation', () => {
  it('adds the same ingredient across days into one requirement', () => {
    // The brief's example: 300 g on Monday and 200 g on Wednesday is 500 g.
    const days = [
      day(0, [{ id: 'kip', perServing: 150 }], 2),
      day(2, [{ id: 'kip', perServing: 100 }], 2),
    ];
    const [kip] = aggregateWeekIngredients(days, ingredients);
    expect(kip!.totalAmount).toBe(500);
    expect(kip!.perDay).toEqual([
      { dayIndex: 0, amount: 300 },
      { dayIndex: 2, amount: 200 },
    ]);
  });

  it('skips optional ingredients so they never inflate the list', () => {
    const days = [day(0, [{ id: 'kip', perServing: 100 }, { id: 'rijst', perServing: 80, optional: true }], 2)];
    const result = aggregateWeekIngredients(days, ingredients);
    expect(result.map((r) => r.ingredientId)).toEqual(['kip']);
  });

  it('separates pantry staples from things you actually buy', () => {
    const days = [day(0, [{ id: 'kip', perServing: 100 }, { id: 'zout', perServing: 2 }], 2)];
    const all = aggregateWeekIngredients(days, ingredients);
    expect(all).toHaveLength(2);
    expect(purchasableRequirements(all).map((r) => r.ingredientId)).toEqual(['kip']);
  });

  it('fails loudly on an ingredient that is not in the catalogue', () => {
    const days = [day(0, [{ id: 'onbekend', perServing: 100 }], 2)];
    expect(() => aggregateWeekIngredients(days, ingredients)).toThrow(MissingIngredientError);
  });

  it('returns a stable order', () => {
    const days = [day(0, [{ id: 'rijst', perServing: 80 }, { id: 'kip', perServing: 100 }], 2)];
    expect(aggregateWeekIngredients(days, ingredients).map((r) => r.ingredientId)).toEqual([
      'kip',
      'rijst',
    ]);
  });
});

describe('leftover ledger', () => {
  const days = [
    day(0, [{ id: 'kip', perServing: 150 }], 2), // 300 g
    day(3, [{ id: 'kip', perServing: 100 }], 2), // 200 g
  ];
  const requirements = aggregateWeekIngredients(days, ingredients);

  it('tracks what is used each day and what remains', () => {
    const ledgers = buildLeftoverLedger(requirements, new Map([['kip', 600]]));
    const kip = ledgers[0]!;
    expect(kip.purchasedAmount).toBe(600);
    expect(kip.days[0]).toEqual({ dayIndex: 0, usedAmount: 300, remainingAmount: 300, reusedOnDays: [3] });
    expect(kip.days[1]).toEqual({ dayIndex: 3, usedAmount: 200, remainingAmount: 100, reusedOnDays: [] });
    expect(kip.finalLeftoverAmount).toBe(100);
  });

  it('weighs perishable leftovers far more heavily than pantry leftovers', () => {
    const perishable = buildLeftoverLedger(requirements, new Map([['kip', 1000]]));
    expect(perishable[0]!.wasteScore).toBe(500); // factor 1 for perishable

    const pantryDays = [day(0, [{ id: 'rijst', perServing: 100 }], 2)];
    const pantryRequirements = aggregateWeekIngredients(pantryDays, ingredients);
    const pantry = buildLeftoverLedger(pantryRequirements, new Map([['rijst', 1000]]));
    expect(pantry[0]!.finalLeftoverAmount).toBe(800);
    expect(pantry[0]!.wasteScore).toBe(40); // factor 0.05 for pantry goods
  });

  it('handles buying far more than the week needs', () => {
    const ledgers = buildLeftoverLedger(requirements, new Map([['kip', 5000]]));
    expect(ledgers[0]!.finalLeftoverAmount).toBe(4500);
    expect(ledgers[0]!.days.every((d) => d.remainingAmount >= 0)).toBe(true);
  });

  it('summarises waste per unit instead of adding grams to pieces', () => {
    const ledgers = buildLeftoverLedger(requirements, new Map([['kip', 800]]));
    const summary = summariseWaste(ledgers);
    expect(summary.totalLeftover).toEqual({ g: 300, ml: 0, piece: 0 });
    expect(summary.perishableLeftover.g).toBe(300);
    expect(summary.reusedIngredientIds).toEqual(['kip']);
  });
});
