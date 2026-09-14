import type { Recipe } from '../recipes/types';
import { weekKey } from './candidates';
import type { OptimizerConfig } from './config';
import { bestOrdering } from './diversity';
import { compareForAffordability, comparePlans } from './evaluate-week';
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
  /**
   * A floor under what a week could possibly score, used to skip pricing one
   * that provably cannot win. Optional: leave it out and every neighbour is
   * priced, which is slower and gives exactly the same answer.
   */
  readonly lowerBound?: (recipes: readonly Recipe[]) => number;
}

export interface LocalSearchResult {
  readonly best: EvaluatedWeek;
  /** Neighbours actually put through the full objective. */
  readonly evaluations: number;
  /** Sweeps that produced an improvement. */
  readonly iterations: number;
  /** Neighbours the bound ruled out before they were priced. */
  readonly pruned: number;
  readonly improved: boolean;
  /** True when a bound stopped the search before it ran out of improvements. */
  readonly exhaustedBudget: boolean;
  readonly storeCombinationsEvaluated: number;
}

export function improveBySwapping(input: LocalSearchInput): LocalSearchResult {
  const { config, budget } = input;
  const settings = config.search.localSearch;
  const better = comparePlans(budget);
  const cheaper = compareForAffordability(budget);
  const fitsCeiling = (week: EvaluatedWeek): boolean =>
    budget.hardMaxCents === undefined || week.plan.totals.groceryCents <= budget.hardMaxCents;

  let best = input.start;
  // What the search walks towards, and what it will actually return, are two
  // different things while a ceiling is unmet: the walk chases the bill, the
  // answer is still chosen by the real objective over everything seen. So a
  // hunt for an affordable week can never hand back something worse than the
  // week it started from.
  let bestOverall = input.start;
  let evaluations = 0;
  let iterations = 0;
  let improved = false;
  let storeCombinationsEvaluated = 0;
  let pruned = 0;

  // Pruning is measured against the week the sweep is trying to beat, and that
  // choice is the whole guarantee. A neighbour whose floor already sits at or
  // above the current best cannot be accepted, cannot become the round's
  // winner, and cannot move the walk — so skipping it leaves the search on
  // exactly the path it would have taken, and returns exactly the same week.
  // Pruning against the best week *ever seen* would prune more and still never
  // discard the answer directly, but it could send the walk somewhere else, and
  // a speed-up that quietly changes the result is not a speed-up.
  //
  // While a ceiling is unmet none of this holds: there a higher-scoring week can
  // still win by being affordable, so pruning on score would throw away the very
  // thing being looked for.
  const canPrune = (): boolean => input.lowerBound !== undefined && fitsCeiling(best);
  const cannotWin = (recipes: readonly Recipe[]): boolean =>
    input.lowerBound!(recipes) >= best.plan.score.totalPenaltyCents;

  const seen = new Set<string>(input.alreadyPriced ?? []);
  seen.add(weekKey(best.plan.days.map((day) => day.recipe)));

  if (!settings.enabled) {
    return {
      best: bestOverall,
      evaluations,
      iterations,
      pruned,
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
    // Phase one while the ceiling is unmet, phase two once it is met.
    const rank = fitsCeiling(best) ? better : cheaper;
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

        if (canPrune() && cannotWin(neighbour)) {
          pruned += 1;
          continue;
        }

        // Same rule as stage B: the search may arrange the week freely, but a
        // week the user has pinned keeps the days where they put them.
        const priced = input.evaluate(
          input.locked ? neighbour : bestOrdering(neighbour, config.diversity),
        );
        evaluations += 1;
        if (!priced) continue;
        storeCombinationsEvaluated += priced.optionCount;

        if (better(priced.plan, bestOverall.plan) < 0) bestOverall = priced;
        if (rank(priced.plan, (roundBest ?? best).plan) < 0) roundBest = priced;
      }
    }

    if (!roundBest) break;
    best = roundBest;
    improved = true;
    iterations += 1;
  }

  // Two dishes at once, only once one at a time has nothing left to give.
  //
  // The neighbourhood is the square of the single-swap one, so it gets its own
  // budget and runs last: any improvement it finds is one that no single change
  // could reach. Whether that is worth the runtime is a measurement, not an
  // opinion — see the ablation in OPTIMIZER_BENCHMARK.md.
  if (settings.twoSwap && settings.maxTwoSwapEvaluations > 0) {
    for (let round = 0; round < settings.maxIterations; round += 1) {
      const current = best.plan.days.map((day) => day.recipe);
      const currentIds = new Set(current.map((recipe) => recipe.id));
      const rank = fitsCeiling(best) ? better : cheaper;
      let roundBest: EvaluatedWeek | undefined;
      let spent = 0;

      pairs: for (let first = 0; first < current.length; first += 1) {
        if (input.locked?.has(first)) continue;
        for (let second = first + 1; second < current.length; second += 1) {
          if (input.locked?.has(second)) continue;

          for (const a of input.pool) {
            if (currentIds.has(a.id)) continue;
            for (const b of input.pool) {
              if (b.id === a.id || currentIds.has(b.id)) continue;

              const neighbour = current.slice();
              neighbour[first] = a;
              neighbour[second] = b;

              const key = weekKey(neighbour);
              if (seen.has(key)) continue;
              seen.add(key);

              if (spent >= settings.maxTwoSwapEvaluations) break pairs;

              if (canPrune() && cannotWin(neighbour)) {
                pruned += 1;
                continue;
              }

              const priced = input.evaluate(
                input.locked ? neighbour : bestOrdering(neighbour, config.diversity),
              );
              evaluations += 1;
              spent += 1;
              if (!priced) continue;
              storeCombinationsEvaluated += priced.optionCount;

              if (better(priced.plan, bestOverall.plan) < 0) bestOverall = priced;
              if (rank(priced.plan, (roundBest ?? best).plan) < 0) roundBest = priced;
            }
          }
        }
      }

      if (!roundBest) break;
      best = roundBest;
      improved = true;
      iterations += 1;
    }
  }

  const exhaustedBudget =
    iterations >= settings.maxIterations || evaluations >= settings.maxEvaluations;

  return {
    best: bestOverall,
    evaluations,
    iterations,
    pruned,
    improved,
    exhaustedBudget,
    storeCombinationsEvaluated,
  };
}
