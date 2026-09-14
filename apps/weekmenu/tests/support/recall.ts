import { generateCandidateWeeks, weekKey } from '@/domain/optimization/candidates';
import { prepareOptimization } from '@/domain/optimization/prepare';
import { optimiseWeek } from '@/domain/optimization/week-optimizer';
import { solveWeeklyPlanExhaustive } from '@/domain/optimization/reference-solver';
import { DEFAULT_OPTIMIZER_CONFIG, type OptimizerConfig } from '@/domain/optimization/config';
import { buildScenario, type ScenarioOptions } from './scenario';

/**
 * Where does the perfect week get lost?
 *
 * The gap benchmark says *how much* quality the search leaves on the table. It
 * cannot say *why*, and the two plausible causes want opposite fixes. If the
 * best week is never built, the search is too narrow and the answer is more
 * candidates. If it is built and then ranked below twenty others, widening the
 * beam is wasted work and the answer is a better estimate — or evaluating more
 * of what we already have.
 *
 * So this measures the pipeline stage by stage against the known optimum:
 *
 *   POOL       one of the optimum's dishes never made the ranked recipe pool
 *   BEAM       all its dishes did, but the week itself fell out of the beam
 *   TOPK       the week survived the beam but ranked below the pricing cut-off
 *   SELECTION  it was fully priced and still lost — a scoring bug, not a search one
 *   NONE       the optimizer returned the optimum
 *
 * Everything here is test-and-benchmark only: it calls the exhaustive solver.
 */

export type LostStage = 'NONE' | 'POOL' | 'BEAM' | 'TOPK' | 'SELECTION';

/** Beam widths the recall curve is sampled at. */
export const RECALL_WIDTHS = [10, 20, 25, 40, 50, 100, 200, 400] as const;

/** The diagnostic run: wide enough that "not in here" means genuinely lost. */
export const WIDE_BEAM = 400;

export interface RecallMeasurement {
  readonly seed: number;
  readonly summary: string;
  readonly candidateCount: number;
  /** Every dish of the optimum survived into the ranked pool. */
  readonly inPool: boolean;
  /** 1-based position of the optimum in the default-width beam, if present. */
  readonly rank: number | undefined;
  /** Its position in the wide diagnostic beam — how deep you would have to look. */
  readonly wideRank: number | undefined;
  /** Present in a beam of this width, per width in RECALL_WIDTHS. */
  readonly presentAt: ReadonlyMap<number, boolean>;
  readonly lostAt: LostStage;
  readonly gapPercent: number;
}

export type RecallOutcome =
  | { readonly status: 'MEASURED'; readonly measurement: RecallMeasurement }
  | { readonly status: 'SKIPPED'; readonly seed: number; readonly reason: string };

export function measureRecall(seed: number, options: ScenarioOptions = {}): RecallOutcome {
  const scenario = buildScenario(seed, options);
  const { input } = scenario;

  const exhaustive = solveWeeklyPlanExhaustive(input);
  if (exhaustive.status !== 'OK') return { status: 'SKIPPED', seed, reason: exhaustive.reason };

  const heuristic = optimiseWeek(input);
  if (heuristic.status !== 'OK') return { status: 'SKIPPED', seed, reason: heuristic.reason };

  const prepared = prepareOptimization(input);
  if (prepared.status !== 'OK') return { status: 'SKIPPED', seed, reason: prepared.reason };

  const baseConfig = input.config ?? DEFAULT_OPTIMIZER_CONFIG;
  const optimumKey = weekKey(exhaustive.plan.days.map((day) => day.recipe));

  const generateAt = (beamWidth: number): { rank: number | undefined; poolIds: Set<string> } => {
    const config: OptimizerConfig = {
      ...baseConfig,
      search: { ...baseConfig.search, beamWidth },
    };
    const generated = generateCandidateWeeks({
      candidates: prepared.candidates,
      portionsByRecipe: prepared.portionsByRecipe,
      memberNutrition: prepared.memberNutrition,
      ingredients: input.ingredients,
      stores: prepared.stores,
      preferences: input.household.preferences,
      config,
      ...(input.lockedRecipeIds ? { locked: input.lockedRecipeIds } : {}),
    });
    const index = generated.weeks.findIndex((week) => weekKey(week.recipes) === optimumKey);
    return {
      rank: index === -1 ? undefined : index + 1,
      poolIds: new Set(generated.pool.map((recipe) => recipe.id)),
    };
  };

  const presentAt = new Map<number, boolean>();
  for (const width of RECALL_WIDTHS) presentAt.set(width, generateAt(width).rank !== undefined);

  const atDefault = generateAt(baseConfig.search.beamWidth);
  const wide = generateAt(WIDE_BEAM);

  const inPool = exhaustive.plan.days.every((day) => atDefault.poolIds.has(day.recipe.id));

  const optimalScore = exhaustive.plan.score.totalPenaltyCents;
  const gap = heuristic.plan.score.totalPenaltyCents - optimalScore;
  const gapPercent = optimalScore > 0 ? (Math.max(0, gap) / optimalScore) * 100 : 0;

  return {
    status: 'MEASURED',
    measurement: {
      seed,
      summary: scenario.summary,
      candidateCount: prepared.candidates.length,
      inPool,
      rank: atDefault.rank,
      wideRank: wide.rank,
      presentAt,
      lostAt: classify({
        exact: Math.abs(gap) < 0.5,
        inPool,
        rank: atDefault.rank,
        fullyEvaluated: baseConfig.search.fullyEvaluatedWeeks,
      }),
      gapPercent,
    },
  };
}

function classify(facts: {
  exact: boolean;
  inPool: boolean;
  rank: number | undefined;
  fullyEvaluated: number;
}): LostStage {
  if (facts.exact) return 'NONE';
  if (!facts.inPool) return 'POOL';
  if (facts.rank === undefined) return 'BEAM';
  if (facts.rank > facts.fullyEvaluated) return 'TOPK';
  // Priced and still beaten: the two engines disagree about the same week, which
  // is a defect in the objective or in the ordering, not in the search.
  return 'SELECTION';
}

export interface RecallSummary {
  readonly measured: number;
  readonly skipped: number;
  readonly byStage: ReadonlyMap<LostStage, number>;
  /** Fraction of scenarios where the optimum is generated at all, per width. */
  readonly recallByWidth: ReadonlyMap<number, number>;
  /**
   * How deep in the wide beam the optimum sits, over every measured scenario.
   *
   * Measured over all of them rather than only the ones the optimizer misses:
   * once the refinement makes it exact everywhere there are no misses left, and
   * the question this answers — how far down the beam's own ranking the best
   * week actually sits — is the reason the refinement exists.
   */
  readonly wideRanks: readonly number[];
  readonly lostEvenWide: number;
  readonly measurements: readonly RecallMeasurement[];
}

export function runRecall(
  seeds: readonly number[],
  options: ScenarioOptions = {},
): RecallSummary {
  const measurements: RecallMeasurement[] = [];
  let skipped = 0;

  for (const seed of seeds) {
    const outcome = measureRecall(seed, options);
    if (outcome.status === 'SKIPPED') skipped += 1;
    else measurements.push(outcome.measurement);
  }

  const byStage = new Map<LostStage, number>();
  for (const stage of ['NONE', 'POOL', 'BEAM', 'TOPK', 'SELECTION'] as const) {
    byStage.set(stage, measurements.filter((m) => m.lostAt === stage).length);
  }

  const recallByWidth = new Map<number, number>();
  for (const width of RECALL_WIDTHS) {
    const hits = measurements.filter((m) => m.presentAt.get(width)).length;
    recallByWidth.set(width, measurements.length > 0 ? (hits / measurements.length) * 100 : 0);
  }

  return {
    measured: measurements.length,
    skipped,
    byStage,
    recallByWidth,
    wideRanks: measurements
      .map((m) => m.wideRank)
      .filter((rank): rank is number => rank !== undefined)
      .sort((a, b) => a - b),
    lostEvenWide: measurements.filter((m) => m.wideRank === undefined).length,
    measurements,
  };
}
