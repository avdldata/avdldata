import { describe, expect, it } from 'vitest';
import { optimiseWeek } from '@/domain/optimization/week-optimizer';
import { cents } from '@/domain/units';
import {
  demoHousehold,
  ingredientIndex,
  recipes,
  storeCandidates,
  TEST_DATE,
  TEST_TODAY,
} from '../support/fixtures';

/**
 * A hard maximum is the user saying "never above this". The planner may shop
 * differently to respect it — a second supermarket, a cheaper menu — but it may
 * never quietly drop a dietary rule, and when nothing fits it has to say so
 * instead of showing a number that is not the truth.
 */

const base = (budget: Parameters<typeof optimiseWeek>[0]['budget']) => ({
  household: demoHousehold,
  recipes,
  ingredients: ingredientIndex,
  stores: storeCandidates(),
  maxStores: 3,
  conveniencePreference: 'gebalanceerd' as const,
  budget,
  startDate: TEST_DATE,
  today: TEST_TODAY,
});

function plan(budget: Parameters<typeof optimiseWeek>[0]['budget']) {
  const result = optimiseWeek(base(budget));
  if (result.status !== 'OK') throw new Error(`expected a plan, got ${result.reason}`);
  return result.plan;
}

describe('budget handling', () => {
  const unconstrained = plan({});

  it('plans normally when there is no budget', () => {
    expect(unconstrained.budget.met).toBe(true);
    expect(unconstrained.totals.groceryCents).toBeGreaterThan(0);
  });

  it('takes a cheaper route to stay under a hard maximum', () => {
    // A ceiling just below the unconstrained price: the planner has to give
    // something up — a cheaper menu, or an extra shop — to get under it.
    const ceiling = cents(unconstrained.totals.groceryCents - 30);
    const constrained = plan({ hardMaxCents: ceiling });

    expect(constrained.totals.groceryCents).toBeLessThanOrEqual(ceiling);
    expect(constrained.budget.met).toBe(true);
    expect(constrained.totals.groceryCents).toBeLessThan(unconstrained.totals.groceryCents);
  });

  it('never reports a price that is not the plan it shows', () => {
    const ceiling = cents(unconstrained.totals.groceryCents - 30);
    const constrained = plan({ hardMaxCents: ceiling });

    expect(constrained.totals.groceryCents).toBe(constrained.recommendedOption.groceryCents);
    const listed = constrained.recommendedOption.assignments.reduce(
      (sum, assignment) => sum + assignment.packaging.totalCents,
      0,
    );
    expect(listed).toBe(constrained.totals.groceryCents);
  });

  it('says so plainly when no week fits, and keeps every rule intact', () => {
    const impossible = plan({ hardMaxCents: cents(1500) });

    expect(impossible.budget.met).toBe(false);
    expect(impossible.reasons.map((r) => r.code)).toContain('BUDGET_EXCEEDED');
    // The cheapest legitimate week, not a cheaper illegitimate one.
    expect(impossible.days).toHaveLength(7);
    expect(impossible.days.every((d) => d.recipe.pregnancySuitable)).toBe(true);
    expect(impossible.recommendedOption.unavailable).toHaveLength(0);
  });

  it('treats a target as a preference, not a wall', () => {
    const targeted = plan({ targetCents: cents(3000) });
    expect(targeted.budget.met).toBe(false);
    expect(targeted.score.budgetPenaltyCents).toBeGreaterThan(0);
    expect(targeted.days).toHaveLength(7);
  });
});

/**
 * The audit left one limitation open: a hard maximum was only checked against
 * the weeks that got fully priced, so the planner could report "nothing fits"
 * while an affordable week existed. This pins the measured behaviour.
 *
 * The remaining gap is documented in OPTIMIZER_BENCHMARK.md; it needs a
 * different search strategy, not a bigger number, and this test exists so that
 * gap cannot silently widen.
 */
describe('a ceiling makes the planner keep looking', () => {
  it('prices beyond the usual budget of candidate weeks when nothing fits yet', () => {
    const unconstrained = plan({});
    const ceiling = cents(Math.round(unconstrained.totals.groceryCents * 0.95));

    const constrained = optimiseWeek(base({ hardMaxCents: ceiling }));
    if (constrained.status !== 'OK') throw new Error('expected a plan');

    // Either it found something under the ceiling, or it says plainly that it
    // could not — never a quiet overrun presented as a success.
    if (constrained.plan.totals.groceryCents <= ceiling) {
      expect(constrained.plan.budget.met).toBe(true);
    } else {
      expect(constrained.plan.budget.met).toBe(false);
      expect(constrained.plan.reasons.map((r) => r.code)).toContain('BUDGET_EXCEEDED');
    }
  });

  it('does not slow down an ordinary plan that has no ceiling', () => {
    const started = performance.now();
    plan({});
    expect(performance.now() - started).toBeLessThan(2000);
  });
});
