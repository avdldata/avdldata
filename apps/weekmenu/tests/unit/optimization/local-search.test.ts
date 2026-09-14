import { describe, expect, it } from 'vitest';
import { optimiseWeek } from '@/domain/optimization/week-optimizer';
import { DEFAULT_OPTIMIZER_CONFIG, type OptimizerConfig } from '@/domain/optimization/config';
import { benchmarkSeeds } from '../../support/benchmark';
import { buildScenario } from '../../support/scenario';

/**
 * The properties the benchmark cannot see.
 *
 * A gap measurement says the refinement produces good weeks. It says nothing
 * about whether it respects the days a user pinned, whether it stays inside its
 * budget, or whether it ever makes a week worse — and those are the three ways
 * this could damage the product while still scoring well.
 */

function withSearch(base: OptimizerConfig, search: Partial<OptimizerConfig['search']>) {
  return { ...base, search: { ...base.search, ...search } };
}

const NO_REFINEMENT = {
  enabled: false,
  maxIterations: 0,
  maxEvaluations: 0,
  twoSwap: false,
  maxTwoSwapEvaluations: 0,
  restarts: 1,
  useLowerBound: true,
} as const;

describe('swapping dishes never makes a week worse', () => {
  it('scores at least as well as the search without it, on every scenario', () => {
    const worse: string[] = [];

    for (const seed of benchmarkSeeds(40)) {
      const scenario = buildScenario(seed);
      const base = scenario.input.config ?? DEFAULT_OPTIMIZER_CONFIG;

      const without = optimiseWeek({
        ...scenario.input,
        config: withSearch(base, { localSearch: NO_REFINEMENT }),
      });
      const refined = optimiseWeek(scenario.input);
      if (without.status !== 'OK' || refined.status !== 'OK') continue;

      // Half a cent of slack, because the objective is summed in floating point
      // before it is rounded; anything larger is a real regression.
      if (refined.plan.score.totalPenaltyCents > without.plan.score.totalPenaltyCents + 0.5) {
        worse.push(
          `seed ${seed}: ${refined.plan.score.totalPenaltyCents} after refinement, ` +
            `${without.plan.score.totalPenaltyCents} before`,
        );
      }
    }

    expect(worse).toEqual([]);
  }, 300_000);
});

describe('a pinned day stays where the user put it', () => {
  it('changes only the day asked for, however much better another swap would be', () => {
    for (const seed of benchmarkSeeds(12)) {
      const scenario = buildScenario(seed);
      const first = optimiseWeek(scenario.input);
      if (first.status !== 'OK') continue;

      const original = first.plan.days.map((day) => day.recipe.id);

      // Pin every day except Wednesday — exactly what the replace-a-dish flow
      // does. The refinement may reconsider Wednesday and nothing else.
      const locked = new Map<number, string>();
      original.forEach((id, dayIndex) => {
        if (dayIndex !== 2) locked.set(dayIndex, id);
      });

      const replaced = optimiseWeek({ ...scenario.input, lockedRecipeIds: locked });
      if (replaced.status !== 'OK') continue;

      const after = replaced.plan.days.map((day) => day.recipe.id);
      for (const [dayIndex, id] of locked) {
        expect(after[dayIndex], `seed ${seed}: day ${dayIndex} moved`).toBe(id);
      }
    }
  }, 300_000);
});

describe('the refinement stays inside its budget', () => {
  it('prices no more neighbours than the configuration allows', () => {
    for (const seed of benchmarkSeeds(12)) {
      const scenario = buildScenario(seed);
      const base = scenario.input.config ?? DEFAULT_OPTIMIZER_CONFIG;
      const result = optimiseWeek(scenario.input);
      if (result.status !== 'OK') continue;

      const { localSearch, candidatesPerSlot } = base.search;
      const oneSweep = base.days * candidatesPerSlot * 2;
      const ceiling =
        (localSearch.maxEvaluations +
          oneSweep +
          (localSearch.twoSwap ? localSearch.maxTwoSwapEvaluations : 0)) *
        Math.max(1, localSearch.restarts);

      expect(
        result.plan.diagnostics.localSearchEvaluations,
        `seed ${seed} priced more neighbours than allowed`,
      ).toBeLessThanOrEqual(ceiling);
    }
  }, 300_000);

  it('does nothing at all when it is switched off', () => {
    const scenario = buildScenario(benchmarkSeeds(1)[0]!);
    const base = scenario.input.config ?? DEFAULT_OPTIMIZER_CONFIG;
    const result = optimiseWeek({
      ...scenario.input,
      config: withSearch(base, { localSearch: NO_REFINEMENT }),
    });
    if (result.status !== 'OK') throw new Error(result.message);

    expect(result.plan.diagnostics.localSearchEvaluations).toBe(0);
    expect(result.plan.diagnostics.localSearchPruned).toBe(0);
  });
});

describe('the bound changes the speed, not the answer', () => {
  it('reaches the same week whether or not neighbours are pruned', () => {
    // Pruning is only allowed to skip weeks that provably cannot be accepted,
    // so with the evaluation budget out of the way — high enough that neither
    // run can hit it — both must land on exactly the same plan.
    const generous = {
      enabled: true,
      maxIterations: 8,
      maxEvaluations: 100_000,
      twoSwap: false,
      maxTwoSwapEvaluations: 0,
      restarts: 1,
      useLowerBound: true,
    } as const;

    for (const seed of benchmarkSeeds(12)) {
      const scenario = buildScenario(seed);
      const base = scenario.input.config ?? DEFAULT_OPTIMIZER_CONFIG;
      const result = optimiseWeek({
        ...scenario.input,
        config: withSearch(base, { localSearch: generous }),
      });
      if (result.status !== 'OK') continue;

      const again = optimiseWeek({
        ...scenario.input,
        config: withSearch(base, { localSearch: generous }),
      });
      if (again.status !== 'OK') continue;

      expect(again.plan.days.map((d) => d.recipe.id)).toEqual(
        result.plan.days.map((d) => d.recipe.id),
      );
    }
  }, 300_000);
});
