import { optimiseWeek } from '@/domain/optimization/week-optimizer';
import {
  solveWeeklyPlanExhaustive,
  type ExhaustiveSolverResult,
} from '@/domain/optimization/reference-solver';
import { priceForUnits, isWithinValidity } from '@/domain/pricing/promotions';
import { filterCandidateRecipes } from '@/domain/optimization/filter';
import { DEFAULT_OPTIMIZER_CONFIG } from '@/domain/optimization/config';
import type { WeeklyPlan } from '@/domain/optimization/types';
import { buildScenario, type Scenario, type ScenarioOptions } from './scenario';

/**
 * Run the production optimizer and the exhaustive solver over the same world
 * and compare what came out.
 *
 * Two questions are kept strictly apart, because they have different answers.
 *
 * *Correctness* is not negotiable: the plan must obey every hard rule, respect
 * the store limit, buy what it says it buys, and charge what the register would
 * charge. A failure here is a bug, full stop.
 *
 * *Quality* is a measurement, not a pass mark. The production search is a
 * heuristic and is allowed to return a slightly worse week than the perfect
 * one — the point of this file is to say precisely how much worse, rather than
 * to hope.
 */

export interface CorrectnessProblem {
  readonly kind:
    | 'HARD_CONSTRAINT'
    | 'MAX_STORES'
    | 'IGNORED_UNAVAILABLE'
    | 'INVALID_PROMOTION'
    | 'PACKAGE_TOTAL'
    | 'GROCERY_TOTAL'
    | 'WORSE_THAN_OPTIMAL_IS_FINE_BUT_THIS_IS_IMPOSSIBLE';
  readonly detail: string;
}

export interface ScenarioComparison {
  readonly seed: number;
  readonly summary: string;
  /** The exhaustive optimum, in eurocent-equivalents of total penalty. */
  readonly optimalScore: number;
  readonly heuristicScore: number;
  /** heuristic − optimal, in eurocent-equivalents. Never negative in practice. */
  readonly absoluteGap: number;
  readonly relativeGapPercent: number;
  readonly exact: boolean;
  readonly combinationsEvaluated: number;
  readonly problems: readonly CorrectnessProblem[];
  readonly heuristicMs: number;
  readonly exhaustiveMs: number;
}

export type ScenarioOutcome =
  | { readonly status: 'COMPARED'; readonly comparison: ScenarioComparison }
  /** Both engines refused, for the same reason — nothing to compare, no problem. */
  | { readonly status: 'SKIPPED'; readonly seed: number; readonly reason: string }
  /** One engine produced a week and the other did not. That is a real defect. */
  | { readonly status: 'DISAGREEMENT'; readonly seed: number; readonly detail: string };

/**
 * Everything a plan must satisfy no matter which search produced it.
 *
 * These are checked against the plan's own data rather than against the
 * optimum, so they hold even when there is nothing to compare with.
 */
export function findCorrectnessProblems(
  plan: WeeklyPlan,
  scenario: Scenario,
): CorrectnessProblem[] {
  const problems: CorrectnessProblem[] = [];
  const { input } = scenario;
  const config = input.config ?? DEFAULT_OPTIMIZER_CONFIG;

  // --- hard constraints: the plan may only contain dishes the filter allows --
  const { candidates } = filterCandidateRecipes({
    household: input.household,
    recipes: input.recipes,
    ...(input.maxMinutes !== undefined ? { maxMinutes: input.maxMinutes } : {}),
  });
  const allowed = new Set(candidates.map((recipe) => recipe.id));
  for (const day of plan.days) {
    if (!allowed.has(day.recipe.id)) {
      problems.push({
        kind: 'HARD_CONSTRAINT',
        detail: `${day.recipe.id} survived a filter that excludes it`,
      });
    }
  }
  const uniqueDishes = new Set(plan.days.map((day) => day.recipe.id));
  if (uniqueDishes.size !== plan.days.length) {
    problems.push({ kind: 'HARD_CONSTRAINT', detail: 'the same dish appears twice in one week' });
  }
  if (plan.days.length !== config.days) {
    problems.push({
      kind: 'HARD_CONSTRAINT',
      detail: `${plan.days.length} days planned, ${config.days} expected`,
    });
  }

  // --- the store limit is a promise to the user, not a preference ------------
  const allowedStores =
    input.maxStores > 0 ? input.maxStores : new Set(input.stores.map((s) => s.chain.id)).size;
  for (const option of [plan.recommendedOption, ...plan.alternativeOptions]) {
    if (option.locationIds.length > allowedStores) {
      problems.push({
        kind: 'MAX_STORES',
        detail: `${option.locationIds.length} shops offered where at most ${allowedStores} are allowed`,
      });
    }
  }

  // --- a missing product may never be silently dropped -----------------------
  const shoppedFor = new Set(plan.recommendedOption.assignments.map((a) => a.ingredientId));
  const reportedMissing = new Set(plan.recommendedOption.unavailable.map((u) => u.ingredientId));
  for (const requirement of plan.requirements) {
    if (
      !shoppedFor.has(requirement.ingredientId) &&
      !reportedMissing.has(requirement.ingredientId)
    ) {
      problems.push({
        kind: 'IGNORED_UNAVAILABLE',
        detail: `${requirement.ingredientId} is needed but neither bought nor reported missing`,
      });
    }
  }

  // --- the bill has to be the bill -------------------------------------------
  let assignmentTotal = 0;
  for (const assignment of plan.recommendedOption.assignments) {
    let lineTotal = 0;
    for (const line of assignment.packaging.lines) {
      const expected = priceForUnits(line.offer, line.units);
      if (line.lineTotalCents !== expected) {
        problems.push({
          kind: 'PACKAGE_TOTAL',
          detail: `${line.offer.productId} ×${line.units} charged ${line.lineTotalCents}, register says ${expected}`,
        });
      }
      lineTotal += line.lineTotalCents;

      if (line.promotionApplied) {
        const promotion = line.offer.promotion;
        if (!promotion) {
          problems.push({
            kind: 'INVALID_PROMOTION',
            detail: `${line.offer.productId} claims a promotion it does not have`,
          });
        } else if (!isWithinValidity(promotion, input.startDate)) {
          problems.push({
            kind: 'INVALID_PROMOTION',
            detail: `${line.offer.productId} applied a promotion outside its validity window`,
          });
        } else if (line.units < promotion.minUnits) {
          problems.push({
            kind: 'INVALID_PROMOTION',
            detail: `${line.offer.productId} applied a promotion below its minimum quantity`,
          });
        }
      }
    }
    if (lineTotal !== assignment.packaging.totalCents) {
      problems.push({
        kind: 'PACKAGE_TOTAL',
        detail: `${assignment.ingredientId}: lines sum to ${lineTotal}, total says ${assignment.packaging.totalCents}`,
      });
    }
    if (assignment.packaging.purchasedAmount + 1e-9 < assignment.packaging.requiredAmount) {
      problems.push({
        kind: 'PACKAGE_TOTAL',
        detail: `${assignment.ingredientId}: bought ${assignment.packaging.purchasedAmount}, needs ${assignment.packaging.requiredAmount}`,
      });
    }
    assignmentTotal += assignment.packaging.totalCents;
  }
  if (assignmentTotal !== plan.totals.groceryCents) {
    problems.push({
      kind: 'GROCERY_TOTAL',
      detail: `assignments sum to ${assignmentTotal}, week total says ${plan.totals.groceryCents}`,
    });
  }

  return problems;
}

/** Run both engines on one seed and compare. */
export function compareScenario(seed: number, options: ScenarioOptions = {}): ScenarioOutcome {
  const scenario = buildScenario(seed, options);

  const heuristicStart = performance.now();
  const heuristic = optimiseWeek(scenario.input);
  const heuristicMs = performance.now() - heuristicStart;

  const exhaustiveStart = performance.now();
  const exhaustive = solveWeeklyPlanExhaustive(scenario.input);
  const exhaustiveMs = performance.now() - exhaustiveStart;

  if (heuristic.status !== 'OK' && exhaustive.status !== 'OK') {
    return { status: 'SKIPPED', seed, reason: `${heuristic.reason} / ${exhaustive.reason}` };
  }
  if (heuristic.status !== 'OK') {
    return {
      status: 'DISAGREEMENT',
      seed,
      detail: `the optimizer gave up (${heuristic.reason}) while a week exists`,
    };
  }
  if (exhaustive.status !== 'OK') {
    // The solver bailing out on size is not a defect; anything else is.
    if (exhaustive.reason === 'TOO_MANY_COMBINATIONS') {
      return { status: 'SKIPPED', seed, reason: exhaustive.reason };
    }
    return {
      status: 'DISAGREEMENT',
      seed,
      detail: `the exhaustive solver failed (${exhaustive.reason}) while the optimizer produced a week`,
    };
  }

  const optimal = (exhaustive as ExhaustiveSolverResult).plan;
  const optimalScore = optimal.score.totalPenaltyCents;
  const heuristicScore = heuristic.plan.score.totalPenaltyCents;
  const absoluteGap = heuristicScore - optimalScore;

  const problems = findCorrectnessProblems(heuristic.plan, scenario);
  if (absoluteGap < -0.5) {
    // The heuristic cannot beat an exhaustive search over the same objective.
    // If it does, the two are not judging the same thing and every number in
    // this benchmark is meaningless.
    problems.push({
      kind: 'WORSE_THAN_OPTIMAL_IS_FINE_BUT_THIS_IS_IMPOSSIBLE',
      detail: `heuristic scored ${heuristicScore}, exhaustive optimum ${optimalScore}`,
    });
  }

  return {
    status: 'COMPARED',
    comparison: {
      seed,
      summary: scenario.summary,
      optimalScore,
      heuristicScore,
      absoluteGap: Math.max(0, absoluteGap),
      relativeGapPercent: optimalScore > 0 ? (Math.max(0, absoluteGap) / optimalScore) * 100 : 0,
      exact: Math.abs(absoluteGap) < 0.5,
      combinationsEvaluated: exhaustive.combinationsEvaluated,
      problems,
      heuristicMs,
      exhaustiveMs,
    },
  };
}

export interface BenchmarkSummary {
  readonly scenarios: number;
  readonly compared: number;
  readonly skipped: number;
  readonly disagreements: readonly string[];
  readonly correctnessFailures: readonly ScenarioComparison[];
  readonly exactCount: number;
  readonly exactPercent: number;
  readonly meanGapPercent: number;
  readonly medianGapPercent: number;
  readonly p90GapPercent: number;
  readonly p95GapPercent: number;
  readonly p99GapPercent: number;
  readonly worstGapPercent: number;
  readonly worstSeed: number;
  readonly worst: ScenarioComparison | undefined;
  readonly meanHeuristicMs: number;
  readonly meanExhaustiveMs: number;
  readonly comparisons: readonly ScenarioComparison[];
}

export function runBenchmark(
  seeds: readonly number[],
  options: ScenarioOptions = {},
): BenchmarkSummary {
  const comparisons: ScenarioComparison[] = [];
  const disagreements: string[] = [];
  let skipped = 0;

  for (const seed of seeds) {
    const outcome = compareScenario(seed, options);
    if (outcome.status === 'SKIPPED') {
      skipped += 1;
      continue;
    }
    if (outcome.status === 'DISAGREEMENT') {
      disagreements.push(`seed ${outcome.seed}: ${outcome.detail}`);
      continue;
    }
    comparisons.push(outcome.comparison);
  }

  const gaps = comparisons.map((c) => c.relativeGapPercent).sort((a, b) => a - b);
  const exactCount = comparisons.filter((c) => c.exact).length;
  const worst = [...comparisons].sort((a, b) => b.relativeGapPercent - a.relativeGapPercent)[0];

  return {
    scenarios: seeds.length,
    compared: comparisons.length,
    skipped,
    disagreements,
    correctnessFailures: comparisons.filter((c) => c.problems.length > 0),
    exactCount,
    exactPercent: comparisons.length > 0 ? (exactCount / comparisons.length) * 100 : 0,
    meanGapPercent: mean(gaps),
    medianGapPercent: percentile(gaps, 50),
    p90GapPercent: percentile(gaps, 90),
    p95GapPercent: percentile(gaps, 95),
    p99GapPercent: percentile(gaps, 99),
    worstGapPercent: worst?.relativeGapPercent ?? 0,
    worstSeed: worst?.seed ?? 0,
    worst,
    meanHeuristicMs: mean(comparisons.map((c) => c.heuristicMs)),
    meanExhaustiveMs: mean(comparisons.map((c) => c.exhaustiveMs)),
    comparisons,
  };
}

function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** Nearest-rank percentile over an already sorted array. */
function percentile(sorted: readonly number[], percent: number): number {
  if (sorted.length === 0) return 0;
  const rank = Math.ceil((percent / 100) * sorted.length);
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank - 1))]!;
}

/** A reproducible spread of seeds. Same list on every machine, every run. */
export function benchmarkSeeds(count: number, offset = 0): number[] {
  return Array.from({ length: count }, (_, index) => 100_003 + (index + offset) * 7_919);
}
