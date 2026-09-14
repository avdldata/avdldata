import { optimiseWeek } from '@/domain/optimization/week-optimizer';
import { solveWeeklyPlanExhaustive } from '@/domain/optimization/reference-solver';
import { cents } from '@/domain/units';
import { buildScenario } from './scenario';

/**
 * Does a hard maximum actually hold when one exists?
 *
 * A ceiling is the one setting where "good enough" is the wrong answer. Saying
 * "no week fits under €50" when one does is not a slightly worse plan, it is a
 * false statement — so this is measured separately from the quality benchmark
 * and judged pass/fail rather than by a gap.
 *
 * The ceiling is derived from the exhaustive solver's *cheapest* week rather
 * than picked as a fraction of some typical price. That matters: at a factor of
 * 1.0 exactly one week can meet it, and every factor above that is provably
 * satisfiable. A miss is then unambiguously the optimizer's, never the
 * scenario's.
 */

export interface BudgetOutcome {
  readonly seed: number;
  readonly summary: string;
  /** The ceiling handed to the optimizer. */
  readonly ceilingCents: number;
  /** The cheapest bill any legal week can reach. */
  readonly floorCents: number;
  readonly found: boolean;
  /** What the optimizer's week actually cost. */
  readonly groceryCents: number;
  /** How far over the ceiling it landed, when it missed. */
  readonly overshootPercent: number;
}

export type BudgetResult =
  | { readonly status: 'MEASURED'; readonly outcome: BudgetOutcome }
  | { readonly status: 'SKIPPED'; readonly seed: number; readonly reason: string };

export function measureBudget(seed: number, factor: number): BudgetResult {
  const plain = buildScenario(seed);
  const exhaustive = solveWeeklyPlanExhaustive(plain.input);
  if (exhaustive.status !== 'OK') return { status: 'SKIPPED', seed, reason: exhaustive.reason };
  if (!Number.isFinite(exhaustive.cheapestGroceryCents)) {
    return { status: 'SKIPPED', seed, reason: 'NO_PRICEABLE_WEEK' };
  }

  const floor = exhaustive.cheapestGroceryCents;
  const ceiling = Math.floor(floor * factor);
  const scenario = buildScenario(seed, { hardMaxCents: cents(ceiling) });

  const result = optimiseWeek(scenario.input);
  if (result.status !== 'OK') return { status: 'SKIPPED', seed, reason: result.reason };

  const grocery = result.plan.totals.groceryCents;
  return {
    status: 'MEASURED',
    outcome: {
      seed,
      summary: scenario.summary,
      ceilingCents: ceiling,
      floorCents: floor,
      found: grocery <= ceiling,
      groceryCents: grocery,
      overshootPercent: ceiling > 0 ? (Math.max(0, grocery - ceiling) / ceiling) * 100 : 0,
    },
  };
}

export interface BudgetSummary {
  readonly factor: number;
  readonly measured: number;
  readonly skipped: number;
  readonly found: number;
  readonly missedPercent: number;
  readonly worstOvershootPercent: number;
  readonly misses: readonly BudgetOutcome[];
}

export function runBudget(seeds: readonly number[], factor: number): BudgetSummary {
  const outcomes: BudgetOutcome[] = [];
  let skipped = 0;

  for (const seed of seeds) {
    const result = measureBudget(seed, factor);
    if (result.status === 'SKIPPED') skipped += 1;
    else outcomes.push(result.outcome);
  }

  const misses = outcomes.filter((outcome) => !outcome.found);
  return {
    factor,
    measured: outcomes.length,
    skipped,
    found: outcomes.length - misses.length,
    missedPercent: outcomes.length > 0 ? (misses.length / outcomes.length) * 100 : 0,
    worstOvershootPercent: misses.reduce((worst, m) => Math.max(worst, m.overshootPercent), 0),
    misses,
  };
}
