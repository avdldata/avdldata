import type { IngredientIndex } from '../ingredients/types';
import type { Recipe } from '../recipes/types';
import type { ProductOffer } from '../stores/types';
import type { Preferences } from '../household/types';
import type { MemberNutrition } from '../nutrition/calculate';
import type { RecipePortions } from '../nutrition/portions';
import type { OptimizerConfig } from './config';
import { violationsIfAdded } from './diversity';
import { scoreRecipePreferences } from './scoring';
import type { StoreCandidate } from './store-selection';

/**
 * Stage A of the optimizer: produce a bounded set of promising complete weeks.
 *
 * Kept in its own module for one reason above all others — it has to be
 * measurable. The benchmark asks a question the optimizer itself never asks:
 * *is the genuinely best week even among the candidates, and if so, where in the
 * list?* Answering that means calling this stage directly, without the pricing
 * and explanation machinery behind it. Splitting search from evaluation is what
 * separates a search failure from a ranking failure, and those two have
 * completely different fixes.
 *
 * Nothing here knows the real price of a week. The estimate below is
 * deliberately crude and deliberately pessimistic; the honest number comes from
 * `evaluateWeek` in stage B.
 */

export interface CandidateGenerationInput {
  /** Recipes that survived the hard filter. */
  readonly candidates: readonly Recipe[];
  readonly portionsByRecipe: ReadonlyMap<string, RecipePortions>;
  readonly memberNutrition: readonly MemberNutrition[];
  readonly ingredients: IngredientIndex;
  /** Already reduced to one representative store per chain. */
  readonly stores: readonly StoreCandidate[];
  readonly preferences: Preferences;
  readonly config: OptimizerConfig;
  /** Day index -> recipe id, from the "replace this dish" flow. */
  readonly locked?: ReadonlyMap<number, string>;
}

export interface CandidateWeek {
  readonly recipes: readonly Recipe[];
  /** The stage-A estimate that ranked this week. Not a price. */
  readonly estimate: number;
}

export interface CandidateGeneration {
  /** Complete weeks, best estimate first. */
  readonly weeks: readonly CandidateWeek[];
  /** The truncated, ranked recipe pool the search drew from. */
  readonly pool: readonly Recipe[];
  readonly amountsByRecipe: ReadonlyMap<string, ReadonlyMap<string, number>>;
  readonly preferencePenalties: ReadonlyMap<string, number>;
}

export function generateCandidateWeeks(input: CandidateGenerationInput): CandidateGeneration {
  const { config } = input;

  const amountsByRecipe = new Map<string, ReadonlyMap<string, number>>();
  for (const recipe of input.candidates) {
    const portions = input.portionsByRecipe.get(recipe.id);
    if (!portions) continue;
    amountsByRecipe.set(recipe.id, recipeAmounts(recipe, portions, input.ingredients));
  }

  const referenceOffers = buildReferenceOffers(input.stores);
  const preferencePenalties = new Map<string, number>();
  for (const recipe of input.candidates) {
    preferencePenalties.set(
      recipe.id,
      scoreRecipePreferences(recipe, input.preferences, config.weights).penaltyCents,
    );
  }

  const ranked = rankCandidates(input.candidates, {
    amountsByRecipe,
    referenceOffers,
    preferencePenalties,
    portionsByRecipe: input.portionsByRecipe,
    memberNutrition: input.memberNutrition,
  });

  /*
   * A locked day is not a suggestion, so its dish must be in the pool.
   *
   * The beam only ever places a recipe it finds in `pool`, and the pool is the
   * ranked shortlist — 28 dishes by default. A locked dish outside that
   * shortlist leaves the slot with nothing to place, the beam returns no weeks
   * at all, and the caller reports "not enough recipes fit your settings"
   * while a hundred of them do.
   *
   * It was invisible at 56 recipes, where the shortlist was half the library
   * and usually contained whatever the user picked. At 138 it broke "replace
   * this dish" on most days: three of seven for the demo household, offering
   * no alternative at all where there were dozens.
   */
  const shortlist = ranked.slice(0, Math.max(config.search.candidatesPerSlot, config.days * 4));
  const pool = input.locked
    ? [
        ...shortlist,
        ...ranked.filter(
          (recipe) =>
            !shortlist.some((s) => s.id === recipe.id) &&
            [...input.locked!.values()].includes(recipe.id),
        ),
      ]
    : shortlist;

  // One beam per configured width, interleaved rather than concatenated.
  //
  // Concatenating and re-sorting by estimate would quietly hand the whole
  // shortlist back to whichever width happens to produce the lowest estimates,
  // which is the single point of view this exists to avoid. Round-robin means
  // every width gets its best weeks priced.
  const reservoirs = config.search.beamWidths.map((beamWidth) =>
    beamSearch({
      pool,
      config,
      beamWidth,
      ...(input.locked ? { locked: input.locked } : {}),
      amountsByRecipe,
      referenceOffers,
      preferencePenalties,
    }),
  );

  const weeks: CandidateWeek[] = [];
  const seen = new Set<string>();
  const depth = Math.max(0, ...reservoirs.map((reservoir) => reservoir.length));
  for (let rank = 0; rank < depth; rank += 1) {
    for (const reservoir of reservoirs) {
      const week = reservoir[rank];
      if (!week) continue;
      const key = weekKey(week.recipes);
      if (seen.has(key)) continue;
      seen.add(key);
      weeks.push(week);
    }
  }

  return { weeks, pool, amountsByRecipe, preferencePenalties };
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

export function rankCandidates(candidates: readonly Recipe[], ctx: RankingContext): Recipe[] {
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

interface BeamState {
  readonly recipes: readonly Recipe[];
  readonly amounts: ReadonlyMap<string, number>;
  readonly preferencePenalty: number;
  /** What the variety rules broken so far would cost in the objective. */
  readonly repetitionPenalty: number;
  readonly estimate: number;
}

interface BeamSearchInput {
  pool: readonly Recipe[];
  config: OptimizerConfig;
  beamWidth: number;
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
function beamSearch(input: BeamSearchInput): CandidateWeek[] {
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
      const key = weekKey(state.recipes);
      if (!bySet.has(key)) bySet.set(key, state);
      if (bySet.size >= input.beamWidth) break;
    }
    states = [...bySet.values()];
  }

  return states.map((state) => ({ recipes: state.recipes, estimate: state.estimate }));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Identity of a week as a *set* of dishes: order-independent and stable. */
export function weekKey(recipes: readonly { id: string }[]): string {
  return recipes
    .map((r) => r.id)
    .slice()
    .sort()
    .join('|');
}

export function recipeAmounts(
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
export function buildReferenceOffers(stores: readonly StoreCandidate[]): Map<string, ProductOffer> {
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
export function estimateAmountsCost(
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
