import type { Recipe } from '../recipes/types';
import { weekKey } from './candidates';
import type { OptimizerConfig } from './config';
import { bestOrdering } from './diversity';
import { comparePlans } from './evaluate-week';
import type { BudgetSettings, WeeklyPlan } from './types';

/**
 * Stage C: swap one dish at a time and see whether the week gets better.
 *
 * The benchmark is what put this here. In the scenarios where the optimizer
 * missed the optimum, the optimum differed from the answer by *exactly one
 * dish*, and the difference lived in `practicalTotalCents` — which shop, which
 * pack, which promotion — none of which the beam's estimate can see. Two
 * consequences follow, and they shape everything below.
 *
 * First: a neighbour must be judged by the real objective. Ranking swaps with a
 * cheaper heuristic would reproduce the very blindness this exists to fix, so
 * every neighbour goes through the full `evaluateWeek`. That is the expensive
 * choice and it is the only honest one.
 *
 * Second: this reaches weeks the beam cannot build. The recall analysis found
 * cases where the optimum is absent from a beam of width 400 — a partial menu
 * that looks unpromising after three dishes but ends up best. Widening the beam
 * never finds those; a swap from a good neighbour does.
 *
 * Determinism: days are visited in order, replacements in the pool's ranked
 * order, and the winner is chosen with `comparePlans`, whose final tie-break is
 * the dish ids. Same input, same week, every time.
 */

export interface EvaluatedWeek {
  readonly plan: WeeklyPlan;
  readonly optionCount: number;
}

export interface LocalSearchInput {
  /** The best week stage B produced. */
  readonly start: EvaluatedWeek;
  /** Recipes available as replacements — the ranked pool from stage A. */
  readonly pool: readonly Recipe[];
  readonly config: OptimizerConfig;
  readonly budget: BudgetSettings;
  /**
   * Day index -> recipe id. A locked day is the user's own choice and is never
   * swapped; when the replace-a-dish flow locks all seven, this does nothing at
   * all, which is exactly right.
   */
  readonly locked?: ReadonlyMap<number, string>;
  /** Week sets already priced in stage B; re-pricing them would be wasted work. */
  readonly alreadyPriced?: ReadonlySet<string>;
  readonly evaluate: (recipes: readonly Recipe[]) => EvaluatedWeek | undefined;
}

export interface LocalSearchResult {
  readonly best: EvaluatedWeek;
  /** Neighbours actually put through the full objective. */
  readonly evaluations: number;
  /** Sweeps that produced an improvement. */
  readonly iterations: number;
  readonly improved: boolean;
  /** True when a bound stopped the search before it ran out of improvements. */
  readonly exhaustedBudget: boolean;
  readonly storeCombinationsEvaluated: number;
}

export function improveBySwapping(input: LocalSearchInput): LocalSearchResult {
  const { config, budget } = input;
  const settings = config.search.localSearch;
  const better = comparePlans(budget);

  let best = input.start;
  let evaluations = 0;
  let iterations = 0;
  let improved = false;
  let exhaustedBudget: boolean;
  let storeCombinationsEvaluated = 0;

  const seen = new Set<string>(input.alreadyPriced ?? []);
  seen.add(weekKey(best.plan.days.map((day) => day.recipe)));

  if (!settings.enabled) {
    return {
      best,
      evaluations,
      iterations,
      improved,
      exhaustedBudget: false,
      storeCombinationsEvaluated,
    };
  }

  // The evaluation budget is spent between sweeps, never inside one.
  //
  // Stopping halfway through a sweep would quietly turn best-improvement into
  // "best improvement among Monday, Tuesday and half of Wednesday" — the answer
  // would depend on which day happened to come first. A sweep is bounded on its
  // own (days × pool), so completing the one in progress keeps the total
  // predictable while leaving every day an equal say.
  while (iterations < settings.maxIterations && evaluations < settings.maxEvaluations) {
    const current = best.plan.days.map((day) => day.recipe);
    const currentIds = new Set(current.map((recipe) => recipe.id));
    let roundBest: EvaluatedWeek | undefined;

    for (let dayIndex = 0; dayIndex < current.length; dayIndex += 1) {
      if (input.locked?.has(dayIndex)) continue;

      for (const replacement of input.pool) {
        if (currentIds.has(replacement.id)) continue;

        const neighbour = current.slice();
        neighbour[dayIndex] = replacement;

        const key = weekKey(neighbour);
        if (seen.has(key)) continue;
        seen.add(key);

        // Same rule as stage B: the search may arrange the week freely, but a
        // week the user has pinned keeps the days where they put them.
        const priced = input.evaluate(
          input.locked ? neighbour : bestOrdering(neighbour, config.diversity),
        );
        evaluations += 1;
        if (!priced) continue;
        storeCombinationsEvaluated += priced.optionCount;

        if (better(priced.plan, (roundBest ?? best).plan) < 0) roundBest = priced;
      }
    }

    if (!roundBest) break;
    best = roundBest;
    improved = true;
    iterations += 1;
  }

  exhaustedBudget = iterations >= settings.maxIterations || evaluations >= settings.maxEvaluations;

  return { best, evaluations, iterations, improved, exhaustedBudget, storeCombinationsEvaluated };
}
