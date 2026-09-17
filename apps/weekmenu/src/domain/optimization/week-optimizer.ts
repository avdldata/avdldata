import type { Household } from '../household/types';
import type { IngredientIndex } from '../ingredients/types';
import type { Recipe } from '../recipes/types';
import {
  DEFAULT_OPTIMIZER_CONFIG,
  type ConveniencePreference,
  type OptimizerConfig,
} from './config';
import type { ExcludedRecipe, ExclusionReason } from './filter';
import { prepareOptimization, type PreparationFailure } from './prepare';
import { bestOrdering } from './diversity';
import type { PackagingCache, StoreCandidate } from './store-selection';
import { comparePlans, evaluateWeek, selectBestPlan } from './evaluate-week';
import { generateCandidateWeeks, weekKey } from './candidates';
import { improveBySwapping, type EvaluatedWeek } from './local-search';
import { weekLowerBound } from './lower-bound';
import type { BudgetSettings, OptimizerFailureReason, OptimizerResult, WeeklyPlan } from './types';

export interface OptimizerLogger {
  (stage: string, data: Readonly<Record<string, number | string>>): void;
}

export interface OptimizerInput {
  readonly household: Household;
  readonly recipes: readonly Recipe[];
  readonly ingredients: IngredientIndex;
  /** Stores the user allows, already resolved with their offers and distance. */
  readonly stores: readonly StoreCandidate[];
  readonly maxStores: number;
  readonly conveniencePreference: ConveniencePreference;
  readonly budget: BudgetSettings;
  /** Monday of the planned week, ISO yyyy-mm-dd. */
  readonly startDate: string;
  /** "Now", passed in so the whole engine stays deterministic. */
  readonly today: Date;
  readonly maxMinutes?: number;
  /** Production generation must never save an incomplete basket. */
  readonly requireCompleteBasket?: boolean;
  /** Day index -> recipe id, used by the "replace this dish" flow. */
  readonly lockedRecipeIds?: ReadonlyMap<number, string>;
  readonly config?: OptimizerConfig;
  readonly logger?: OptimizerLogger;
  /** Monotonic clock, injected so tests can stay deterministic. */
  readonly now?: () => number;
}

/**
 * The week optimizer.
 *
 * Pipeline (see OPTIMIZER.md for the full write-up):
 *   1  household profile and nutrition targets
 *   2  hard-constraint filtering of the recipe catalogue
 *   3  per-recipe portion scaling and ingredient amounts
 *   4  beam search over the seven slots, gated by the variety rules
 *   5  full pricing of the most promising complete weeks:
 *      aggregate -> packages -> promotions -> store combinations -> travel
 *   6  objective function over the result, best week wins
 *   7  structured explanations for everything the user sees
 *
 * The whole thing is deterministic: no randomness, no clock, stable tie-breaks
 * everywhere. The same input always produces the same week.
 */
export function optimiseWeek(input: OptimizerInput): OptimizerResult {
  const clock = input.now ?? (() => 0);
  const startedAt = clock();
  const log = input.logger ?? (() => undefined);

  // ---- 1-3. household, hard filter, portions -------------------------------
  const prepared = prepareOptimization(input);
  if (prepared.status === 'FAILED') {
    log('filter', { totalRecipes: input.recipes.length, candidates: prepared.candidateCount });
    return preparationFailure(prepared, input);
  }

  const { config, stores, maxStores, memberNutrition, candidates, excluded, portionsByRecipe } =
    prepared;

  log('filter', { totalRecipes: input.recipes.length, candidates: candidates.length });

  // ---- 4. stage A: candidate weeks ----------------------------------------
  const { weeks, pool } = generateCandidateWeeks({
    candidates,
    portionsByRecipe,
    memberNutrition,
    ingredients: input.ingredients,
    stores,
    preferences: input.household.preferences,
    config,
    ...(input.lockedRecipeIds ? { locked: input.lockedRecipeIds } : {}),
  });

  log('search', { weeksGenerated: weeks.length, pool: pool.length });

  if (weeks.length === 0) {
    return failure(
      'NO_WEEK_SOLUTION',
      'De passende recepten konden niet worden gecombineerd tot een volledige week. Controleer de weekinstellingen of probeer een nieuwe week.',
      excluded,
    );
  }

  // ---- 5. stage B: full pricing of the most promising weeks ----------------
  const { home, extraStorePenalty } = prepared;

  const seenSets = new Set<string>();
  const evaluated: { plan: WeeklyPlan; penalty: number }[] = [];
  let storeCombinationsEvaluated = 0;

  // One pricing closure, shared by stage B and stage C. Two call sites that
  // each assemble their own evaluation input is two chances for the refinement
  // step to be judging a subtly different week than the search step.
  const packagingCache: PackagingCache = new Map();
  const price = (recipes: readonly Recipe[], explain = false): EvaluatedWeek | undefined =>
    evaluateWeek({
      recipes,
      packagingCache,
      explain,
      portionsByRecipe,
      household: input.household,
      memberNutrition,
      ingredients: input.ingredients,
      stores,
      matrixHome: home,
      maxStores,
      extraStorePenalty,
      budget: input.budget,
      startDate: input.startDate,
      config,
      excluded,
      ...(input.requireCompleteBasket ? { requireCompleteBasket: true } : {}),
    });

  // A hard maximum is the one setting where stopping early is not a trade-off
  // but a wrong answer: telling someone "no week fits under €50" when one does
  // is worse than being slow. So once the usual budget of fully priced weeks is
  // spent and nothing has come in under the ceiling, keep going through the
  // weeks the search already built. That is bounded by the beam width, so the
  // extra work is at most one more pass, and it only happens when a ceiling is
  // set and has not yet been met.
  const hardMaxCents = input.budget.hardMaxCents;
  const fitsBudget = (plan: WeeklyPlan): boolean =>
    hardMaxCents === undefined || plan.totals.groceryCents <= hardMaxCents;

  for (const week of weeks) {
    const spentTheBudget = evaluated.length >= config.search.fullyEvaluatedWeeks;
    const stillLookingForAffordable =
      hardMaxCents !== undefined && !evaluated.some((entry) => fitsBudget(entry.plan));
    if (spentTheBudget && !stillLookingForAffordable) break;

    const key = weekKey(week.recipes);
    if (seenSets.has(key)) continue;
    seenSets.add(key);

    // The same seven dishes in a different order can carry a different
    // repetition penalty, because "no three of one cuisine in a row" is the one
    // variety rule that depends on the order. The beam builds a sequence; this
    // makes sure the user is not charged for an arrangement nobody chose.
    //
    // Except when they did choose it: the replace-a-dish flow locks all seven
    // days, and shuffling Monday's dinner to Friday because it scores better is
    // not what "swap Wednesday" means.
    const priced = price(
      input.lockedRecipeIds ? week.recipes : bestOrdering(week.recipes, config.diversity),
    );
    if (!priced) continue;
    storeCombinationsEvaluated += priced.optionCount;
    evaluated.push({ plan: priced.plan, penalty: priced.plan.score.totalPenaltyCents });
  }

  log('pricing', { weeksPriced: evaluated.length, storeCombinations: storeCombinationsEvaluated });
  if (evaluated.length === 0) {
    return failure(
      'NO_RETAIL_SOLUTION',
      'Er zijn passende recepten, maar geen volledige boodschappenlijst met geprijsde producten bij de geselecteerde supermarkten. Kies meer supermarkten of verhoog het maximum aantal winkels.',
      excluded,
    );
  }

  const stageBWinner = selectBestPlan(
    evaluated.map((e) => e.plan),
    input.budget,
  )!;

  // ---- 6. stage C: swap dishes on the best few priced weeks ----------------
  //
  // Several starting points rather than one, because a greedy walk inherits the
  // luck of where it begins: the large-world benchmark found a scenario where
  // the *old* optimizer won outright, purely because its narrower beam handed
  // the refinement a better week to start from. Refining the best few removes
  // that coin toss for a near-linear amount of extra work.
  const starts = evaluated
    .map((entry) => entry.plan)
    .sort(comparePlans(input.budget))
    .slice(0, Math.max(1, config.search.localSearch.restarts));

  const lowerBound = (recipes: readonly Recipe[]): number =>
    weekLowerBound({
      recipes,
      portionsByRecipe,
      household: input.household,
      memberNutrition,
      ingredients: input.ingredients,
      stores,
      config,
      packagingCache,
    });

  const refinements = starts.map((start) =>
    improveBySwapping({
      start: { plan: start, optionCount: 0 },
      pool,
      config,
      budget: input.budget,
      ...(input.lockedRecipeIds ? { locked: input.lockedRecipeIds } : {}),
      alreadyPriced: seenSets,
      evaluate: price,
      ...(config.search.localSearch.useLowerBound ? { lowerBound } : {}),
    }),
  );

  const refined = {
    evaluations: refinements.reduce((sum, r) => sum + r.evaluations, 0),
    pruned: refinements.reduce((sum, r) => sum + r.pruned, 0),
    iterations: refinements.reduce((sum, r) => sum + r.iterations, 0),
    improved: refinements.some((r) => r.improved),
    storeCombinationsEvaluated: refinements.reduce(
      (sum, r) => sum + r.storeCombinationsEvaluated,
      0,
    ),
  };

  // Only now, once the week is decided, is it worth explaining. Every other
  // candidate was priced without its reasons.
  const decided = selectBestPlan(
    refinements.map((r) => r.best.plan),
    input.budget,
  )!;
  const winner =
    price(
      decided.days.map((day) => day.recipe),
      true,
    )?.plan ?? decided;
  storeCombinationsEvaluated += refined.storeCombinationsEvaluated;
  const weeksFullyEvaluated = evaluated.length + refined.evaluations;

  log('localSearch', {
    evaluations: refined.evaluations,
    pruned: refined.pruned,
    iterations: refined.iterations,
    improved: refined.improved ? 1 : 0,
    gainCents: stageBWinner.score.totalPenaltyCents - winner.score.totalPenaltyCents,
  });

  if (input.budget.hardMaxCents !== undefined) {
    const fitting = evaluated.filter(
      (e) => e.plan.totals.groceryCents <= input.budget.hardMaxCents!,
    ).length;
    log('budget', { evaluated: evaluated.length, withinHardMax: fitting });
  }
  const elapsedMs = Math.max(0, clock() - startedAt);

  log('result', {
    weeksFullyEvaluated,
    storeCombinations: storeCombinationsEvaluated,
    winningGroceryCents: winner.totals.groceryCents,
    wasteScore: Math.round(winner.waste.wasteScore),
    elapsedMs,
  });

  return {
    status: 'OK',
    plan: {
      ...winner,
      diagnostics: {
        totalRecipes: input.recipes.length,
        candidateRecipes: candidates.length,
        weeksGenerated: weeks.length,
        weeksFullyEvaluated,
        localSearchEvaluations: refined.evaluations,
        localSearchPruned: refined.pruned,
        storeCombinationsEvaluated,
        elapsedMs,
      },
    },
  };
}

/**
 * The shared preparation reports *what* went wrong; the wording is this layer's
 * business, because these strings end up in front of a user.
 */
function preparationFailure(failed: PreparationFailure, input: OptimizerInput): OptimizerResult {
  const days = (input.config ?? DEFAULT_OPTIMIZER_CONFIG).days;
  const messages: Record<PreparationFailure['reason'], string> = {
    NO_MEMBERS: 'Voeg minimaal één gezinslid toe voordat je een week maakt.',
    NO_STORES: 'Selecteer minimaal één supermarkt in de buurt.',
    NO_ELIGIBLE_RECIPES: blameTheRuleThatDidIt(failed, input),
    NOT_ENOUGH_CANDIDATE_RECIPES:
      `Er passen maar ${failed.candidateCount} recepten bij jullie instellingen; ` +
      `we hebben er ${days} nodig.` +
      ruleThatCostsMost(failed),
  };
  return failure(failed.reason, messages[failed.reason], failed.excluded);
}

/**
 * Which rule emptied the list?
 *
 * "Geen enkel recept past bij de ingestelde dieetregels en uitsluitingen" names
 * seven rules at once and therefore none of them. A user who had set a maximum
 * cooking time of fifteen minutes read that as a problem with their diet, and
 * had no way to find the setting that actually did it. The filter already
 * records a reason per dropped recipe; this turns the most common one into a
 * sentence that points at the setting.
 */
function blameTheRuleThatDidIt(failed: PreparationFailure, input: OptimizerInput): string {
  const counts = new Map<ExclusionReason, number>();
  for (const excluded of failed.excluded) {
    counts.set(excluded.reason, (counts.get(excluded.reason) ?? 0) + 1);
  }
  const [reason] = [...counts].sort((a, b) => b[1] - a[1])[0] ?? [];
  const generic = 'Geen enkel recept past bij de ingestelde regels en uitsluitingen.';
  if (!reason) return generic;

  switch (reason) {
    case 'TOO_MUCH_TIME': {
      const fastest = input.recipes.reduce(
        (least, recipe) => Math.min(least, recipe.totalMinutes),
        Number.POSITIVE_INFINITY,
      );
      return (
        `Geen enkel gerecht is binnen ${input.maxMinutes} minuten klaar — het snelste duurt ` +
        `${fastest} minuten. Verhoog de maximale bereidingstijd bij Weekinstellingen.`
      );
    }
    case 'ALLERGEN':
      return 'Elk gerecht bevat een allergeen dat iemand in het huishouden moet vermijden. Controleer de allergieën bij Gezin.';
    case 'PREGNANCY':
      return 'Geen enkel gerecht is geschikt tijdens de zwangerschap. Controleer de gegevens bij Gezin.';
    case 'VEGAN_REQUIRED':
      return 'Geen enkel gerecht is veganistisch. Pas de voedingswijze aan bij Gezin.';
    case 'VEGETARIAN_REQUIRED':
      return 'Geen enkel gerecht is vegetarisch. Pas de voedingswijze aan bij Gezin.';
    case 'PESCETARIAN_REQUIRED':
      return 'Geen enkel gerecht past bij pescotarisch eten. Pas de voedingswijze aan bij Gezin.';
    case 'EXCLUDED_INGREDIENT':
      return 'Elk gerecht bevat een ingrediënt dat op ⛔ staat. Kijk je smaakvoorkeuren na bij Gezin.';
    case 'DISLIKED_EXCLUDED_TAG':
      return 'Je hebt zoveel soorten gerechten op ⛔ gezet dat er niets overblijft. Kijk je smaakvoorkeuren na bij Gezin.';
    case 'DISLIKED_EXCLUDED_CUISINE':
      return 'Je hebt zoveel keukens op ⛔ gezet dat er niets overblijft. Kijk je smaakvoorkeuren na bij Gezin.';
    default:
      return generic;
  }
}

/** The same hint, appended when there are some recipes left but too few. */
function ruleThatCostsMost(failed: PreparationFailure): string {
  const counts = new Map<ExclusionReason, number>();
  for (const excluded of failed.excluded) {
    counts.set(excluded.reason, (counts.get(excluded.reason) ?? 0) + 1);
  }
  const top = [...counts].sort((a, b) => b[1] - a[1])[0];
  if (!top) return '';
  const labels: Partial<Record<ExclusionReason, string>> = {
    TOO_MUCH_TIME: 'de maximale bereidingstijd',
    ALLERGEN: 'de allergieën',
    PREGNANCY: 'de zwangerschapsregels',
    VEGAN_REQUIRED: 'veganistisch eten',
    VEGETARIAN_REQUIRED: 'vegetarisch eten',
    PESCETARIAN_REQUIRED: 'pescotarisch eten',
    EXCLUDED_INGREDIENT: 'ingrediënten op ⛔',
    DISLIKED_EXCLUDED_TAG: 'soorten gerechten op ⛔',
    DISLIKED_EXCLUDED_CUISINE: 'keukens op ⛔',
  };
  const label = labels[top[0]];
  return label ? ` De meeste vielen af door ${label} (${top[1]} gerechten).` : '';
}

function failure(
  reason: OptimizerFailureReason,
  message: string,
  excludedRecipes: readonly ExcludedRecipe[],
): OptimizerResult {
  return { status: 'FAILED', reason, message, excludedRecipes };
}
