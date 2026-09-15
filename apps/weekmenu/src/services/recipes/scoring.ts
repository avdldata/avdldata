import type { ExternalRecipeCandidate } from './candidate-types';
import { mayBecomeProduction } from './candidate-types';
import { classifyDinner, type DinnerVerdict } from './dinner-classifier';
import { matchCanonicalIngredient, type MatchKind } from './canonical-matching';
import { normaliseAmount } from './units';

/**
 * How usable is one candidate as a production dinner recipe?
 *
 * Nine positives and seven penalties, all named, all bounded. The point of
 * writing it out rather than eyeballing a corpus is that the ranking has to be
 * defensible later: when a recipe is in the library, someone should be able to
 * ask why, and the answer should be a row of numbers rather than a memory.
 *
 * ## Promotion opportunity is one feature among nine
 *
 * Deliberately, and deliberately small. A recipe library that exists because of
 * this week's folder is worthless next week. What promotions may legitimately
 * do is break a tie between two equally good dishes — which is exactly the
 * weight it carries here.
 */

export interface RecipeScore {
  readonly dinnerSuitability: number;
  readonly ingredientCoverage: number;
  readonly retailAvailability: number;
  readonly promotionOpportunity: number;
  readonly nutritionFeasibility: number;
  readonly unitParseability: number;
  readonly recipeDiversity: number;
  readonly preparationPracticality: number;
  readonly licenseSafety: number;
  readonly penalties: Readonly<Record<string, number>>;
  readonly total: number;
  /** The facts the score was computed from, for the report. */
  readonly facts: {
    readonly verdict: DinnerVerdict;
    readonly lines: number;
    readonly matched: number;
    readonly needsNewCanonical: number;
    readonly rejectedLines: number;
    readonly ambiguousLines: number;
    readonly parseableLines: number;
    readonly canonicalIds: readonly string[];
    readonly newConcepts: readonly string[];
  };
}

export interface ScoringContext {
  /** Canonical ingredient ids that have at least one real retail product. */
  readonly retailAvailable: ReadonlySet<string>;
  /** Canonical ingredient ids touched by at least one real promotion. */
  readonly promoted: ReadonlySet<string>;
  /** How often each cuisine already appears in the shortlist, for diversity. */
  readonly cuisineCounts: ReadonlyMap<string, number>;
  readonly shortlistSize: number;
}

const VERDICT_SCORE: Readonly<Record<DinnerVerdict, number>> = {
  DINNER: 1,
  POSSIBLE_DINNER: 0.55,
  AMBIGUOUS: 0.15,
  NOT_DINNER: 0,
};

export function scoreCandidate(
  candidate: ExternalRecipeCandidate,
  context: ScoringContext,
): RecipeScore {
  const verdict = classifyDinner(candidate).verdict;

  const canonicalIds: string[] = [];
  const newConcepts: string[] = [];
  const kinds: Record<MatchKind, number> = {
    EXACT: 0,
    SAFE_ALIAS: 0,
    NEEDS_NEW_CANONICAL: 0,
    AMBIGUOUS: 0,
    REJECT: 0,
  };
  let parseable = 0;

  for (const line of candidate.ingredients) {
    const match = matchCanonicalIngredient(line.rawName ?? line.rawText);
    kinds[match.kind] += 1;
    if (match.ingredientId) canonicalIds.push(match.ingredientId);
    if (match.kind === 'NEEDS_NEW_CANONICAL' && match.concept) newConcepts.push(match.concept);
    if (normaliseAmount(line.quantity, line.unit).value !== undefined) parseable += 1;
  }

  const lines = candidate.ingredients.length;
  // Rejected lines (water, "to taste") do not count against coverage: nobody
  // needs to buy them, so a recipe is not worse for mentioning them.
  const relevant = Math.max(1, lines - kinds.REJECT);
  const matched = kinds.EXACT + kinds.SAFE_ALIAS;

  const dinnerSuitability = VERDICT_SCORE[verdict];
  const ingredientCoverage = matched / relevant;
  const unique = [...new Set(canonicalIds)];
  const retailAvailability =
    unique.length === 0
      ? 0
      : unique.filter((id) => context.retailAvailable.has(id)).length / unique.length;
  const promotionOpportunity =
    unique.length === 0
      ? 0
      : unique.filter((id) => context.promoted.has(id)).length / unique.length;
  // Nutrition is feasible when we can weigh the food: our per-100 g tables need
  // a mass, and a line we cannot convert contributes nothing to a day's totals.
  const nutritionFeasibility = lines === 0 ? 0 : parseable / lines;
  const unitParseability = nutritionFeasibility;

  const cuisine = (candidate.cuisine ?? 'onbekend').toLowerCase();
  const seen = context.cuisineCounts.get(cuisine) ?? 0;
  // Falls off as a cuisine fills up, so the shortlist cannot become 200 Italian
  // dishes just because Italian is well represented in the corpora.
  const recipeDiversity = 1 / (1 + seen / Math.max(4, context.shortlistSize / 12));

  const totalMinutes = candidate.cookMinutes ?? candidate.prepMinutes ?? 45;
  const preparationPracticality = totalMinutes <= 60 ? 1 : totalMinutes <= 120 ? 0.6 : 0.2;
  const licenseSafety = mayBecomeProduction(candidate.rights) ? 1 : 0;

  const penalties: Record<string, number> = {};
  if (kinds.NEEDS_NEW_CANONICAL > 0) {
    penalties.UNAVAILABLE_INGREDIENTS = Math.min(0.5, (kinds.NEEDS_NEW_CANONICAL / relevant) * 0.8);
  }
  if (kinds.AMBIGUOUS > 0) penalties.AMBIGUOUS_INGREDIENTS = Math.min(0.3, kinds.AMBIGUOUS * 0.1);
  if (parseable < lines)
    penalties.UNKNOWN_UNITS = Math.min(0.4, ((lines - parseable) / lines) * 0.6);
  if (candidate.ingredients.some((i) => i.quantity === undefined)) {
    const missing = candidate.ingredients.filter((i) => i.quantity === undefined).length;
    penalties.MISSING_QUANTITIES = Math.min(0.5, (missing / lines) * 0.9);
  }
  if (totalMinutes > 150) penalties.EXTREME_PREP_TIME = 0.3;
  if (lines > 18) penalties.TOO_MANY_INGREDIENTS = Math.min(0.3, (lines - 18) * 0.03);
  if (lines < 4) penalties.TOO_FEW_INGREDIENTS = 0.4;
  if (candidate.servings === undefined) penalties.NO_SERVINGS = 0.1;

  const positive =
    dinnerSuitability *
    (0.15 +
      0.85 *
        ((ingredientCoverage +
          retailAvailability +
          nutritionFeasibility +
          unitParseability +
          recipeDiversity +
          preparationPracticality) /
          6)) *
    licenseSafety *
    // Promotion opportunity is a small multiplier, never a driver: at most a
    // 10 % lift for a recipe made entirely of promoted ingredients.
    (1 + 0.1 * promotionOpportunity);

  const penalty = Object.values(penalties).reduce((sum, value) => sum + value, 0);
  const total = Math.max(0, positive * (1 - Math.min(0.9, penalty)));

  return {
    dinnerSuitability,
    ingredientCoverage,
    retailAvailability,
    promotionOpportunity,
    nutritionFeasibility,
    unitParseability,
    recipeDiversity,
    preparationPracticality,
    licenseSafety,
    penalties,
    total,
    facts: {
      verdict,
      lines,
      matched,
      needsNewCanonical: kinds.NEEDS_NEW_CANONICAL,
      rejectedLines: kinds.REJECT,
      ambiguousLines: kinds.AMBIGUOUS,
      parseableLines: parseable,
      canonicalIds: unique,
      newConcepts: [...new Set(newConcepts)],
    },
  };
}
