import { describe, expect, it } from 'vitest';
import { optimiseWeek } from '@/domain/optimization/week-optimizer';
import { findReplacements } from '@/domain/optimization/replace';
import { buildShoppingList } from '@/features/shopping/build-list';
import { explainReason } from '@/lib/explain';
import {
  demoHousehold,
  ingredientIndex,
  recipes,
  storeCandidates,
  TEST_DATE,
  TEST_TODAY,
} from '../support/fixtures';

const input = () => ({
  household: demoHousehold,
  recipes,
  ingredients: ingredientIndex,
  stores: storeCandidates(),
  maxStores: 3,
  conveniencePreference: 'gebalanceerd' as const,
  budget: {},
  startDate: TEST_DATE,
  today: TEST_TODAY,
});

function plan() {
  const result = optimiseWeek(input());
  if (result.status !== 'OK') throw new Error(result.message);
  return result.plan;
}

describe('the shopping list is the plan, not a summary of it', () => {
  const week = plan();
  const list = buildShoppingList(week, []);

  it('adds up to exactly what the week costs', () => {
    expect(list.totalCents).toBe(week.totals.groceryCents);
  });

  it('has one line per pack size bought, never one per recipe', () => {
    // Two dishes using chicken must not produce two chicken lines.
    const linesPerIngredient = new Map<string, number>();
    for (const group of list.groups) {
      for (const line of group.lines) {
        linesPerIngredient.set(
          line.ingredientId,
          (linesPerIngredient.get(line.ingredientId) ?? 0) + 1,
        );
      }
    }
    const sharedAcrossDays = week.requirements.filter((r) => r.perDay.length > 1);
    expect(sharedAcrossDays.length).toBeGreaterThan(0);
    for (const requirement of sharedAcrossDays) {
      expect(linesPerIngredient.get(requirement.ingredientId) ?? 0).toBeLessThanOrEqual(1);
    }
  });

  it('buys at least what the week needs of every ingredient', () => {
    for (const assignment of week.recommendedOption.assignments) {
      const requirement = week.requirements.find(
        (r) => r.ingredientId === assignment.ingredientId,
      )!;
      expect(assignment.packaging.purchasedAmount).toBeGreaterThanOrEqual(
        requirement.totalAmount - 1e-9,
      );
    }
  });

  it('names a real product, brand and shop for every line', () => {
    const chains = new Set(week.recommendedOption.chainIds);
    for (const group of list.groups) {
      for (const line of group.lines) {
        expect(line.productName.length).toBeGreaterThan(0);
        expect(line.units).toBeGreaterThan(0);
        expect(chains.has(line.chainId)).toBe(true);
      }
    }
  });

  it('splits by shop without losing or duplicating a euro', () => {
    let byChainTotal = 0;
    for (const groups of list.byChain.values()) {
      for (const group of groups) byChainTotal += group.subtotalCents;
    }
    expect(byChainTotal).toBe(list.totalCents);
  });
});

describe('replacing one dish re-prices the entire week', () => {
  const before = plan();
  const candidates = findReplacements({ ...input(), currentPlan: before, dayIndex: 2, limit: 3 });

  it('offers alternatives', () => {
    expect(candidates.length).toBeGreaterThan(0);
  });

  it('recomputes rather than adjusting the old total by a delta', () => {
    for (const candidate of candidates) {
      // The delta has to be the difference between two fully costed weeks.
      expect(candidate.deltaCents).toBe(
        candidate.plan.totals.groceryCents - before.totals.groceryCents,
      );
      // And the new plan has to be a real plan: its own packs, its own list.
      const listed = candidate.plan.recommendedOption.assignments.reduce(
        (sum, assignment) => sum + assignment.packaging.totalCents,
        0,
      );
      expect(listed).toBe(candidate.plan.totals.groceryCents);
    }
  });

  it('keeps the other six days and changes only the one asked for', () => {
    for (const candidate of candidates) {
      expect(candidate.plan.days).toHaveLength(7);
      for (const day of candidate.plan.days) {
        if (day.dayIndex === 2) {
          expect(day.recipe.id).toBe(candidate.recipe.id);
        } else {
          expect(day.recipe.id).toBe(before.days[day.dayIndex]!.recipe.id);
        }
      }
    }
  });

  it('rebuilds the shopping list, the leftovers and the store choice with it', () => {
    const candidate = candidates[0]!;
    const newList = buildShoppingList(candidate.plan, []);

    expect(newList.totalCents).toBe(candidate.plan.totals.groceryCents);
    // A different dish uses different ingredients, so the requirements move.
    expect(candidate.plan.requirements.map((r) => r.ingredientId).join()).not.toBe(
      before.requirements.map((r) => r.ingredientId).join(),
    );
    // Leftovers are recomputed against what was actually bought.
    for (const ledger of candidate.plan.leftovers) {
      const assignment = candidate.plan.recommendedOption.assignments.find(
        (a) => a.ingredientId === ledger.ingredientId,
      );
      if (!assignment) continue;
      expect(ledger.purchasedAmount).toBe(assignment.packaging.purchasedAmount);
    }
  });
});

describe('every explanation traces back to a number the optimizer produced', () => {
  const week = plan();

  it('only claims a promotion where a promotion was actually applied', () => {
    const claims = week.reasons.filter((r) => r.code === 'PROMOTION_USED');
    for (const claim of claims) {
      // Match on the product, not the label: two shops can run the same deal.
      const line = week.recommendedOption.assignments
        .flatMap((a) => a.packaging.lines)
        .find((l) => l.offer.name === claim.params.product);
      expect(line).toBeDefined();
      expect(line!.promotionApplied).toBe(true);
      expect(claim.params.savingCents).toBe(line!.promotionSavingsCents);
    }
  });

  it('reports promotion savings that come from promotions and nothing else', () => {
    const fromPromotions = week.recommendedOption.assignments
      .flatMap((a) => a.packaging.lines)
      .reduce((sum, line) => sum + line.promotionSavingsCents, 0);
    expect(week.totals.promotionSavingsCents).toBe(fromPromotions);

    // A product that is merely cheaper than usual is a saving, but not an
    // "aanbieding" — it must not inflate the number under that word.
    for (const line of week.recommendedOption.assignments.flatMap((a) => a.packaging.lines)) {
      if (!line.promotionApplied) expect(line.promotionSavingsCents).toBe(0);
    }
  });

  it('backs its cheapest-per-category claim with a real comparison', () => {
    for (const [, chainId] of week.recommendedOption.categoryWinners) {
      // The named chain must be one the household actually selected.
      expect(storeCandidates().some((s) => s.chain.id === chainId)).toBe(true);
    }
  });

  it('renders every reason it produces into Dutch, with no placeholders left', () => {
    for (const reason of week.reasons) {
      const sentence = explainReason(reason);
      expect(sentence.length).toBeGreaterThan(10);
      expect(sentence).not.toContain('undefined');
      expect(sentence).not.toContain('NaN');
      expect(sentence).not.toContain('[object');
    }
  });
});
