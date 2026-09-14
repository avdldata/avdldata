import { optimiseWeek } from '@/domain/optimization/week-optimizer';
import { solveWeeklyPlanExhaustive } from '@/domain/optimization/reference-solver';
import { DEFAULT_OPTIMIZER_CONFIG, type OptimizerConfig } from '@/domain/optimization/config';
import { buildScenario, type ScenarioOptions } from './scenario';
import { findCorrectnessProblems } from './benchmark';

/**
 * Run several optimizer configurations over the same worlds and put the numbers
 * side by side.
 *
 * The expensive half of a comparison is the exhaustive optimum, and it does not
 * depend on the configuration being tested — so it is solved once per seed and
 * reused by every variant. That is the difference between an ablation you run
 * whenever you change something and one you run once and quote from memory.
 */

/**
 * A variant changes the *search settings only*.
 *
 * It deliberately cannot replace the whole config, because each scenario brings
 * its own objective weights — what waste costs, what a repeated protein costs —
 * and the exhaustive optimum is computed with those. Handing the optimizer a
 * different set of weights would have it solving a different problem than the
 * one it is being graded against, and every number in the table would be wrong
 * while looking perfectly plausible.
 */
export interface Variant {
  readonly name: string;
  readonly search: Partial<OptimizerConfig['search']>;
}

export interface VariantResult {
  readonly name: string;
  readonly compared: number;
  readonly exactPercent: number;
  readonly meanGapPercent: number;
  readonly p95GapPercent: number;
  readonly p99GapPercent: number;
  readonly worstGapPercent: number;
  readonly worstSeed: number;
  readonly meanMs: number;
  readonly p95Ms: number;
  readonly correctnessFailures: number;
  /** Gap per seed, in the order the seeds were given, for a paired comparison. */
  readonly gapBySeed: ReadonlyMap<number, number>;
}

export function searchVariant(name: string, search: Partial<OptimizerConfig['search']>): Variant {
  return { name, search };
}

export function runAblation(
  seeds: readonly number[],
  variants: readonly Variant[],
  options: ScenarioOptions = {},
): VariantResult[] {
  // One exhaustive solve per seed, shared by every variant.
  const optima = new Map<number, number>();
  for (const seed of seeds) {
    const scenario = buildScenario(seed, options);
    const exhaustive = solveWeeklyPlanExhaustive(scenario.input);
    if (exhaustive.status === 'OK') optima.set(seed, exhaustive.plan.score.totalPenaltyCents);
  }

  return variants.map((variant) => {
    const gaps: number[] = [];
    const durations: number[] = [];
    const gapBySeed = new Map<number, number>();
    let worstGap = 0;
    let worstSeed = 0;
    let failures = 0;
    let exact = 0;

    for (const seed of seeds) {
      const optimal = optima.get(seed);
      if (optimal === undefined) continue;

      const scenario = buildScenario(seed, options);
      const base = scenario.input.config ?? DEFAULT_OPTIMIZER_CONFIG;
      const config: OptimizerConfig = {
        ...base,
        search: { ...base.search, ...variant.search },
      };
      const started = performance.now();
      const result = optimiseWeek({ ...scenario.input, config });
      durations.push(performance.now() - started);
      if (result.status !== 'OK') continue;

      if (findCorrectnessProblems(result.plan, scenario).length > 0) failures += 1;

      const gap = result.plan.score.totalPenaltyCents - optimal;
      const percent = optimal > 0 ? (Math.max(0, gap) / optimal) * 100 : 0;
      if (Math.abs(gap) < 0.5) exact += 1;
      gaps.push(percent);
      gapBySeed.set(seed, percent);
      if (percent > worstGap) {
        worstGap = percent;
        worstSeed = seed;
      }
    }

    const sorted = [...gaps].sort((a, b) => a - b);
    const sortedMs = [...durations].sort((a, b) => a - b);

    return {
      name: variant.name,
      compared: gaps.length,
      exactPercent: gaps.length > 0 ? (exact / gaps.length) * 100 : 0,
      meanGapPercent: mean(gaps),
      p95GapPercent: percentile(sorted, 95),
      p99GapPercent: percentile(sorted, 99),
      worstGapPercent: worstGap,
      worstSeed,
      meanMs: mean(durations),
      p95Ms: percentile(sortedMs, 95),
      correctnessFailures: failures,
      gapBySeed,
    };
  });
}

function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percentile(sorted: readonly number[], percent: number): number {
  if (sorted.length === 0) return 0;
  const rank = Math.ceil((percent / 100) * sorted.length);
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank - 1))]!;
}
