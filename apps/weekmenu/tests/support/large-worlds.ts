import { optimiseWeek } from '@/domain/optimization/week-optimizer';
import { DEFAULT_OPTIMIZER_CONFIG, type OptimizerConfig } from '@/domain/optimization/config';
import { buildScenario } from './scenario';

/**
 * Worlds too big to solve exactly, measured against the best anyone has found.
 *
 * Above a couple of dozen recipes there is no optimum to compare with — C(25, 7)
 * is 480.700 fully costed weeks and it only gets worse. Dropping the measurement
 * there would be convenient and wrong: the sizes nobody can verify are exactly
 * the sizes a real recipe collection will have.
 *
 * So the yardstick changes rather than disappearing. A committed corpus records
 * the best score anyone has ever reached per scenario; a run that beats it
 * updates the corpus, a run that falls short of it is a regression with a seed
 * attached. It is a weaker claim than "optimal" and it is honest about being
 * one.
 */

export interface LargeWorldResult {
  readonly seed: number;
  readonly recipeCount: number;
  readonly candidateRecipes: number;
  readonly score: number;
  readonly groceryCents: number;
  readonly ms: number;
  /** The seven dish ids, so a regression can be inspected rather than guessed at. */
  readonly week: readonly string[];
  /** Two identical runs produced an identical plan. */
  readonly deterministic: boolean;
  readonly weeksFullyEvaluated: number;
  readonly localSearchPruned: number;
}

export type LargeWorldOutcome =
  | { readonly status: 'OK'; readonly result: LargeWorldResult }
  | { readonly status: 'SKIPPED'; readonly seed: number; readonly reason: string };

export const LARGE_WORLD_SIZES = [25, 50, 100, 250] as const;

export function runLargeWorld(
  seed: number,
  recipeCount: number,
  search: Partial<OptimizerConfig['search']> = {},
): LargeWorldOutcome {
  const scenario = buildScenario(seed, { recipeCount });
  const base = scenario.input.config ?? DEFAULT_OPTIMIZER_CONFIG;
  const input = {
    ...scenario.input,
    config: { ...base, search: { ...base.search, ...search } },
  };

  const started = performance.now();
  const first = optimiseWeek(input);
  const ms = performance.now() - started;
  if (first.status !== 'OK') return { status: 'SKIPPED', seed, reason: first.reason };

  const second = optimiseWeek(input);
  const week = first.plan.days.map((day) => day.recipe.id);
  const deterministic =
    second.status === 'OK' &&
    second.plan.score.totalPenaltyCents === first.plan.score.totalPenaltyCents &&
    second.plan.days.map((day) => day.recipe.id).join('|') === week.join('|');

  return {
    status: 'OK',
    result: {
      seed,
      recipeCount,
      candidateRecipes: first.plan.diagnostics.candidateRecipes,
      score: first.plan.score.totalPenaltyCents,
      groceryCents: first.plan.totals.groceryCents,
      ms,
      week,
      deterministic,
      weeksFullyEvaluated: first.plan.diagnostics.weeksFullyEvaluated,
      localSearchPruned: first.plan.diagnostics.localSearchPruned,
    },
  };
}

/** `seed:recipeCount`, the key the best-known corpus is stored under. */
export function corpusKey(seed: number, recipeCount: number): string {
  return `${seed}:${recipeCount}`;
}
