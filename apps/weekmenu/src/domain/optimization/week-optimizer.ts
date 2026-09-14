import type { Household } from '../household/types';
import type { IngredientIndex } from '../ingredients/types';
import type { Recipe } from '../recipes/types';
import type { ProductOffer } from '../stores/types';
import { calculateHouseholdNutrition, type MemberNutrition } from '../nutrition/calculate';
import { planPortions, type RecipePortions } from '../nutrition/portions';
import {
  DEFAULT_OPTIMIZER_CONFIG,
  extraStorePenaltyFor,
  type ConveniencePreference,
  type OptimizerConfig,
} from './config';
import { filterCandidateRecipes, type ExcludedRecipe } from './filter';
import { bestOrdering, violationsIfAdded } from './diversity';
import { representativeStoresPerChain, type StoreCandidate } from './store-selection';
import { scoreRecipePreferences } from './scoring';
import { evaluateWeek, selectBestPlan } from './evaluate-week';
import type { BudgetSettings, OptimizerResult, WeeklyPlan } from './types';

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
  /** Day index -> recipe id, used by the "replace this dish" flow. */
  readonly lockedRecipeIds?: ReadonlyMap<number, string>;
  readonly config?: OptimizerConfig;
  readonly logger?: OptimizerLogger;
  /** Monotonic clock, injected so tests can stay deterministic. */
  readonly now?: () => number;
}

interface BeamState {
  readonly recipes: readonly Recipe[];
  readonly amounts: ReadonlyMap<string, number>;
  readonly preferencePenalty: number;
  /** What the variety rules broken so far would cost in the objective. */
  readonly repetitionPenalty: number;
  readonly estimate: number;
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
  const config = input.config ?? DEFAULT_OPTIMIZER_CONFIG;
  const clock = input.now ?? (() => 0);
  const startedAt = clock();
  const log = input.logger ?? (() => undefined);

  if (input.household.members.length === 0) {
    return failure('NO_MEMBERS', 'Voeg minimaal één gezinslid toe voordat je een week maakt.', []);
  }

  const stores = representativeStoresPerChain(input.stores);
  if (stores.length === 0) {
    return failure('NO_STORES', 'Selecteer minimaal één supermarkt in de buurt.', []);
  }

  // "No maximum" is expressed as every selected chain, not as zero — a zero that
  // quietly became one would cap the plan to a single shop without saying so.
  const maxStores = input.maxStores > 0 ? Math.min(input.maxStores, stores.length) : stores.length;

  const memberNutrition = calculateHouseholdNutrition(
    input.household.members,
    input.today,
    config.nutrition,
  );

  const { candidates, excluded } = filterCandidateRecipes({
    household: input.household,
    recipes: input.recipes,
    ...(input.maxMinutes !== undefined ? { maxMinutes: input.maxMinutes } : {}),
  });

  log('filter', { totalRecipes: input.recipes.length, candidates: candidates.length });

  if (candidates.length === 0) {
    return failure(
      'NO_CANDIDATE_RECIPES',
      'Geen enkel recept past bij de ingestelde dieetregels en uitsluitingen.',
      excluded,
    );
  }
  if (candidates.length < config.days) {
    return failure(
      'NOT_ENOUGH_CANDIDATE_RECIPES',
      `Er passen maar ${candidates.length} recepten bij jullie instellingen; we hebben er ${config.days} nodig.`,
      excluded,
    );
  }

  // ---- 3. portions and per-recipe ingredient amounts -----------------------
  const portionsByRecipe = new Map<string, RecipePortions>();
  const amountsByRecipe = new Map<string, ReadonlyMap<string, number>>();
  for (const recipe of candidates) {
    const portions = planPortions(recipe, memberNutrition, config.nutrition);
    portionsByRecipe.set(recipe.id, portions);
    amountsByRecipe.set(recipe.id, recipeAmounts(recipe, portions, input.ingredients));
  }

  const referenceOffers = buildReferenceOffers(stores);
  const preferencePenalties = new Map<string, number>();
  for (const recipe of candidates) {
    preferencePenalties.set(
      recipe.id,
      scoreRecipePreferences(recipe, input.household.preferences, config.weights).penaltyCents,
    );
  }

  // ---- 4. beam search ------------------------------------------------------
  const pool = rankCandidates(candidates, {
    amountsByRecipe,
    referenceOffers,
    preferencePenalties,
    portionsByRecipe,
    memberNutrition,
  }).slice(0, Math.max(config.search.candidatesPerSlot, config.days * 4));

  const searchInput = {
    pool,
    config,
    ...(input.lockedRecipeIds ? { locked: input.lockedRecipeIds } : {}),
    amountsByRecipe,
    referenceOffers,
    preferencePenalties,
  };

  const weeks = beamSearch(searchInput);

  log('search', { weeksGenerated: weeks.length, pool: pool.length });

  if (weeks.length === 0) {
    return failure(
      'NOT_ENOUGH_CANDIDATE_RECIPES',
      `Er passen maar ${candidates.length} recepten bij jullie instellingen; daar krijgen we geen week van ${config.days} verschillende gerechten uit.`,
      excluded,
    );
  }

  // ---- 5. full pricing of the most promising weeks -------------------------
  const extraStorePenalty = extraStorePenaltyFor(input.conveniencePreference);
  const home = {
    latitude: input.household.location.latitude ?? stores[0]!.location.latitude,
    longitude: input.household.location.longitude ?? stores[0]!.location.longitude,
  };

  const seenSets = new Set<string>();
  const evaluated: { plan: WeeklyPlan; penalty: number }[] = [];
  let storeCombinationsEvaluated = 0;

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

    const key = week.recipes
      .map((r) => r.id)
      .slice()
      .sort()
      .join('|');
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
    const priced = evaluateWeek({
      recipes: input.lockedRecipeIds ? week.recipes : bestOrdering(week.recipes, config.diversity),
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
    });
    if (!priced) continue;
    storeCombinationsEvaluated += priced.optionCount;
    evaluated.push({ plan: priced.plan, penalty: priced.plan.score.totalPenaltyCents });
  }

  if (evaluated.length === 0) {
    return failure(
      'NO_PRICEABLE_WEEK',
      'We konden geen prijs berekenen voor deze week — controleer de geselecteerde supermarkten.',
      excluded,
    );
  }

  const winner = selectBestPlan(
    evaluated.map((e) => e.plan),
    input.budget,
  )!;
  if (input.budget.hardMaxCents !== undefined) {
    const fitting = evaluated.filter(
      (e) => e.plan.totals.groceryCents <= input.budget.hardMaxCents!,
    ).length;
    log('budget', { evaluated: evaluated.length, withinHardMax: fitting });
  }
  const elapsedMs = Math.max(0, clock() - startedAt);

  log('result', {
    weeksFullyEvaluated: evaluated.length,
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
        weeksFullyEvaluated: evaluated.length,
        storeCombinationsEvaluated,
        elapsedMs,
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Candidate ranking and beam search
// ---------------------------------------------------------------------------

interface RankingContext {
  amountsByRecipe: ReadonlyMap<string, ReadonlyMap<string, number>>;
  referenceOffers: ReadonlyMap<string, ProductOffer>;
  preferencePenalties: ReadonlyMap<string, number>;
  portionsByRecipe: ReadonlyMap<string, RecipePortions>;
  memberNutrition: readonly MemberNutrition[];
}

function rankCandidates(candidates: readonly Recipe[], ctx: RankingContext): Recipe[] {
  const scored = candidates.map((recipe) => {
    const amounts = ctx.amountsByRecipe.get(recipe.id) ?? new Map();
    const cost = estimateAmountsCost(amounts, ctx.referenceOffers);
    const preference = ctx.preferencePenalties.get(recipe.id) ?? 0;
    const portions = ctx.portionsByRecipe.get(recipe.id);
    const deviation = portions
      ? portions.perMember.reduce((sum, p) => sum + Math.abs(p.kcal - p.targetKcal), 0)
      : 0;
    return { recipe, score: cost + preference + deviation * 0.6 };
  });

  scored.sort((a, b) => a.score - b.score || a.recipe.id.localeCompare(b.recipe.id));
  return scored.map((s) => s.recipe);
}

interface BeamSearchInput {
  pool: readonly Recipe[];
  config: OptimizerConfig;
  locked?: ReadonlyMap<number, string>;
  amountsByRecipe: ReadonlyMap<string, ReadonlyMap<string, number>>;
  referenceOffers: ReadonlyMap<string, ProductOffer>;
  preferencePenalties: ReadonlyMap<string, number>;
}

/**
 * Build promising weeks slot by slot, keeping the best `beamWidth` partial
 * weeks at each step.
 *
 * The partial estimate deliberately rounds ingredient amounts up to whole
 * packs: that is what makes the search prefer weeks where Monday's and
 * Wednesday's chicken come out of the same pack. It is an estimate — the exact
 * price comes later — but it points the search in the right direction.
 *
 * Complexity: O(days × beamWidth × pool × ingredients). With the defaults
 * (7 × 40 × 28 × ~30) that is well under a million cheap operations.
 */
function beamSearch(input: BeamSearchInput): BeamState[] {
  const { config } = input;
  let states: BeamState[] = [
    { recipes: [], amounts: new Map(), preferencePenalty: 0, repetitionPenalty: 0, estimate: 0 },
  ];

  for (let slot = 0; slot < config.days; slot += 1) {
    const lockedId = input.locked?.get(slot);
    const next: BeamState[] = [];

    for (const state of states) {
      for (const candidate of input.pool) {
        if (lockedId !== undefined && candidate.id !== lockedId) continue;
        if (state.recipes.some((r) => r.id === candidate.id)) continue;

        // Variety is priced, not forbidden.
        //
        // This used to be a veto, and the benchmark showed what that cost: in
        // the worst measured scenario the optimum was a week with two protein
        // repetitions that came out €13 cheaper, and the search could not even
        // construct it. Pricing the repetition here — with the same weight the
        // objective function uses — lets the search make the trade-off it was
        // always meant to make, and removes the special case for households
        // whose eligible dishes cannot satisfy the rules at all.
        //
        // A locked day comes from the user's existing plan; it is not a choice
        // the search is making, so it carries no repetition cost.
        const repetitionCost =
          lockedId === undefined
            ? violationsIfAdded(state.recipes, candidate, config.diversity).length *
              config.weights.repetitionPerViolation
            : 0;

        const amounts = mergeAmounts(
          state.amounts,
          input.amountsByRecipe.get(candidate.id) ?? new Map(),
        );
        const preferencePenalty =
          state.preferencePenalty + (input.preferencePenalties.get(candidate.id) ?? 0);
        const repetitionPenalty = state.repetitionPenalty + repetitionCost;

        next.push({
          recipes: [...state.recipes, candidate],
          amounts,
          preferencePenalty,
          repetitionPenalty,
          estimate:
            estimateAmountsCost(amounts, input.referenceOffers) +
            preferencePenalty +
            repetitionPenalty,
        });
      }
    }

    if (next.length === 0) return [];

    const setKey = (state: BeamState): string =>
      state.recipes
        .map((r) => r.id)
        .slice()
        .sort()
        .join('|');

    const byEstimate = [...next].sort(
      (a, b) =>
        a.estimate - b.estimate ||
        a.recipes
          .map((r) => r.id)
          .join('|')
          .localeCompare(b.recipes.map((r) => r.id).join('|')),
    );

    // Two partial weeks holding the same dishes in a different order cost the
    // same. Without this the beam fills up with permutations of one menu and we
    // end up fully pricing three weeks instead of forty.
    const bySet = new Map<string, BeamState>();

    for (const state of byEstimate) {
      const key = setKey(state);
      if (!bySet.has(key)) bySet.set(key, state);
      if (bySet.size >= config.search.beamWidth) break;
    }
    states = [...bySet.values()];
  }

  return states;
}

// ---------------------------------------------------------------------------
// Full pricing of one complete week
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function recipeAmounts(
  recipe: Recipe,
  portions: RecipePortions,
  ingredients: IngredientIndex,
): Map<string, number> {
  const amounts = new Map<string, number>();
  for (const line of recipe.ingredients) {
    if (line.optional) continue;
    const ingredient = ingredients.get(line.ingredientId);
    if (!ingredient || ingredient.pantryStaple) continue;
    const amount = line.perServing.amount * portions.totalServings;
    if (amount <= 0) continue;
    amounts.set(line.ingredientId, (amounts.get(line.ingredientId) ?? 0) + amount);
  }
  return amounts;
}

function mergeAmounts(
  a: ReadonlyMap<string, number>,
  b: ReadonlyMap<string, number>,
): Map<string, number> {
  const merged = new Map(a);
  for (const [key, value] of b) merged.set(key, (merged.get(key) ?? 0) + value);
  return merged;
}

/** Cheapest offer per ingredient across all allowed stores, for fast estimates. */
function buildReferenceOffers(stores: readonly StoreCandidate[]): Map<string, ProductOffer> {
  const best = new Map<string, ProductOffer>();
  for (const store of stores) {
    for (const offer of store.offers) {
      const current = best.get(offer.ingredientId);
      if (
        !current ||
        offer.pricePerBaseUnitCents < current.pricePerBaseUnitCents ||
        (offer.pricePerBaseUnitCents === current.pricePerBaseUnitCents &&
          offer.productId.localeCompare(current.productId) < 0)
      ) {
        best.set(offer.ingredientId, offer);
      }
    }
  }
  return best;
}

/**
 * Rough price for a bag of ingredient amounts: whole packs of the cheapest
 * product per ingredient, at the shelf price.
 *
 * Promotions and multi-store splits are deliberately left out. Folding
 * promotions in was tried — it seemed obviously right, since the register
 * charges them — and on 120 scenarios it did lift the average. It also took the
 * hardest case in the regression corpus from a 12 % gap to 28 %, because the
 * promotion belongs to whichever shop happens to be cheapest per gram, and the
 * week may not be shopped there. An estimate that is optimistic about a saving
 * the plan cannot collect is worse than one that is uniformly cautious.
 *
 * See OPTIMIZER_BENCHMARK.md; the seed that rejected the change is pinned in
 * the corpus so it cannot be re-introduced by accident.
 */
function estimateAmountsCost(
  amounts: ReadonlyMap<string, number>,
  referenceOffers: ReadonlyMap<string, ProductOffer>,
): number {
  let total = 0;
  for (const [ingredientId, amount] of amounts) {
    const offer = referenceOffers.get(ingredientId);
    if (!offer || offer.packageAmount.amount <= 0) continue;
    total += Math.ceil(amount / offer.packageAmount.amount) * offer.unitPriceCents;
  }
  return total;
}

/**
 * Spread each ingredient's purchase cost over the days that use it, in
 * proportion to how much each day uses. This is an allocation for display —
 * the pack is bought once — and the day costs always sum to the grocery total.
 */

function failure(
  reason:
    | 'NO_MEMBERS'
    | 'NO_STORES'
    | 'NO_CANDIDATE_RECIPES'
    | 'NOT_ENOUGH_CANDIDATE_RECIPES'
    | 'NO_PRICEABLE_WEEK',
  message: string,
  excludedRecipes: readonly ExcludedRecipe[],
): OptimizerResult {
  return { status: 'FAILED', reason, message, excludedRecipes };
}
