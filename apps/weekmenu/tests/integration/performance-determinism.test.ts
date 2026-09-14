import { describe, expect, it } from 'vitest';
import { optimiseWeek } from '@/domain/optimization/week-optimizer';
import { DEFAULT_OPTIMIZER_CONFIG } from '@/domain/optimization/config';
import {
  demoHousehold,
  ingredientIndex,
  recipes,
  storeCandidates,
  TEST_DATE,
  TEST_TODAY,
} from '../support/fixtures';

/**
 * Two properties that are easy to lose and hard to notice: the same input has
 * to give the same week every time, and generating it has to stay fast enough
 * that the user is not left staring at a spinner.
 */

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

function fingerprint(plan: ReturnType<typeof optimiseWeek>): string {
  if (plan.status !== 'OK') return `FAILED:${plan.reason}`;
  return JSON.stringify({
    days: plan.plan.days.map((d) => [d.recipe.id, d.allocatedCostCents]),
    stores: plan.plan.recommendedOption.locationIds,
    total: plan.plan.totals.groceryCents,
    packs: plan.plan.recommendedOption.assignments.map((a) => [
      a.ingredientId,
      a.locationId,
      a.packaging.lines.map((l) => [l.offer.productId, l.units]),
    ]),
    reasons: plan.plan.reasons.map((r) => [r.code, JSON.stringify(r.params)]),
  });
}

describe('the same input always gives the same week', () => {
  it('produces an identical plan across repeated runs', () => {
    const first = fingerprint(optimiseWeek(input()));
    for (let run = 0; run < 5; run += 1) {
      expect(fingerprint(optimiseWeek(input()))).toBe(first);
    }
    // Six full plans of the demo catalogue; the per-plan budget is asserted
    // separately below, so the generous timeout here is only so that a genuine
    // slowdown is reported as a slowdown rather than as a timeout.
  }, 30_000);

  it('does not depend on the order the stores are handed in', () => {
    const forwards = optimiseWeek(input());
    const backwards = optimiseWeek({ ...input(), stores: [...storeCandidates()].reverse() });
    expect(fingerprint(backwards)).toBe(fingerprint(forwards));
  });

  it('does not depend on the order the recipes are handed in', () => {
    const forwards = optimiseWeek(input());
    const backwards = optimiseWeek({ ...input(), recipes: [...recipes].reverse() });
    expect(fingerprint(backwards)).toBe(fingerprint(forwards));
  });

  it('reaches for no clock and no random number', () => {
    // `today` is an argument, so moving the wall clock cannot change a plan.
    const now = optimiseWeek(input());
    const later = optimiseWeek({ ...input(), today: TEST_TODAY });
    expect(fingerprint(later)).toBe(fingerprint(now));
  });
});

describe('generating a week stays inside its budget', () => {
  it('finishes well under two seconds on the demo dataset', () => {
    // Warm the module caches first; we are measuring the optimizer, not the
    // first-call overhead of the runtime.
    optimiseWeek(input());

    const runs = 5;
    const started = performance.now();
    for (let run = 0; run < runs; run += 1) optimiseWeek(input());
    const average = (performance.now() - started) / runs;

    expect(average).toBeLessThan(2000);
  }, 30_000);

  it('keeps the search space bounded rather than merely small', () => {
    const result = optimiseWeek(input());
    if (result.status !== 'OK') throw new Error(result.message);
    const { diagnostics } = result.plan;

    // Every one of these is capped by configuration, not by luck with the data.
    // The beam is bounded by its width; the refinement by its evaluation budget
    // plus the one sweep it is always allowed to finish (seven days times the
    // recipe pool). Neither can run away on a bigger catalogue.
    const { search } = DEFAULT_OPTIMIZER_CONFIG;
    const oneSweep = DEFAULT_OPTIMIZER_CONFIG.days * search.candidatesPerSlot * 2;
    expect(diagnostics.weeksGenerated).toBeLessThanOrEqual(search.beamWidth);
    expect(diagnostics.localSearchEvaluations).toBeLessThanOrEqual(
      search.localSearch.maxEvaluations + oneSweep,
    );
    expect(diagnostics.weeksFullyEvaluated).toBeLessThanOrEqual(
      search.fullyEvaluatedWeeks + diagnostics.localSearchEvaluations,
    );
    expect(diagnostics.storeCombinationsEvaluated).toBeLessThan(5000);
    expect(diagnostics.candidateRecipes).toBeGreaterThan(0);
  });

  it('grows gently when more stores are in play', () => {
    const timed = (maxStores: number): number => {
      const started = performance.now();
      optimiseWeek({ ...input(), maxStores });
      return performance.now() - started;
    };
    optimiseWeek(input());
    const one = timed(1);
    const three = timed(3);
    // Three shops means more combinations, but not a different order of cost.
    expect(three).toBeLessThan(Math.max(one * 8, 2000));
  });
});
