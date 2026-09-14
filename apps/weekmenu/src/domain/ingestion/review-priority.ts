import type { IngredientId } from '../ingredients/types';

/**
 * Which review decisions are actually worth a human's attention.
 *
 * A queue of 1.172 products is not a queue, it is a wall. Most of those
 * decisions change nothing: a fourteenth cashew nut product for an ingredient
 * that already has ten approved alternatives moves no week and saves no money.
 * A single decision about an ingredient that eleven recipes need and that has
 * no approved product at all unlocks eleven recipes.
 *
 * So the queue is scored by what a decision would *buy*, and the score is
 * arithmetic rather than a model — every term is inspectable and every row can
 * say why it is where it is.
 */

export interface ReviewPriorityWeights {
  /** Per recipe that needs the ingredient. */
  readonly recipeFrequency: number;
  /** For an ingredient with no usable product at all. */
  readonly noCoverage: number;
  /** For an ingredient with only one or two alternatives. */
  readonly scarceCoverage: number;
  /** The product cannot be used even if approved, so approving it is pointless. */
  readonly unusableProduct: number;
  /** Ingredient no active recipe uses. */
  readonly notInRecipes: number;
  /**
   * Ingredient that already has plenty of usable products.
   *
   * Large enough to outweigh even a very popular ingredient: garlic appears in
   * 31 recipes, but with four usable products in several pack sizes a fifth
   * changes nothing. Frequency says how much an ingredient *matters*; it does
   * not say a decision about it is still worth making.
   */
  readonly alreadySufficient: number;
}

export const DEFAULT_REVIEW_WEIGHTS: ReviewPriorityWeights = {
  recipeFrequency: 10,
  noCoverage: 60,
  scarceCoverage: 20,
  unusableProduct: -100,
  notInRecipes: -1000,
  alreadySufficient: -250,
};

/**
 * When an ingredient has enough good options, further review of it is optional.
 *
 * The goal was never to classify a supermarket's entire catalogue. It is to
 * give the optimizer enough correct candidates to choose well — and past a
 * handful of alternatives in a range of pack sizes, one more barely moves the
 * answer.
 */
export interface CoverageSufficiency {
  /** Distinct usable products. */
  readonly minimumAlternatives: number;
  /** Distinct package sizes, so the packing has something to choose between. */
  readonly minimumPackageSizes: number;
}

export const DEFAULT_SUFFICIENCY: CoverageSufficiency = {
  minimumAlternatives: 3,
  minimumPackageSizes: 2,
};

export interface IngredientReviewContext {
  readonly ingredientId: IngredientId;
  /** Active recipes that need this ingredient. */
  readonly recipeCount: number;
  /** Products already usable by the optimizer. */
  readonly approvedCount: number;
  /** Distinct package sizes among those. */
  readonly packageSizeCount: number;
}

/**
 * Two very different reasons not to bother, kept apart on purpose.
 *
 *   OPTIONAL   the ingredient matters, but it already has enough good products
 *   IRRELEVANT no active recipe uses it at all
 *
 * Collapsing them would hide the difference between "done" and "not our
 * problem", and only one of those changes if the recipe catalogue grows.
 */
export type ReviewBand = 'HIGH' | 'MEDIUM' | 'LOW' | 'OPTIONAL' | 'IRRELEVANT';

export interface ReviewPriority {
  readonly score: number;
  readonly band: ReviewBand;
  /** Why it sits where it does, in one readable line. */
  readonly reason: string;
  /** True when the ingredient already has plenty of good options. */
  readonly sufficientlyCovered: boolean;
}

export function scoreReviewItem(
  context: IngredientReviewContext,
  options: {
    /** Would this product be usable at all if approved? */
    readonly usable: boolean;
    readonly weights?: ReviewPriorityWeights;
    readonly sufficiency?: CoverageSufficiency;
  },
): ReviewPriority {
  const weights = options.weights ?? DEFAULT_REVIEW_WEIGHTS;
  const sufficiency = options.sufficiency ?? DEFAULT_SUFFICIENCY;

  const sufficientlyCovered =
    context.approvedCount >= sufficiency.minimumAlternatives &&
    context.packageSizeCount >= sufficiency.minimumPackageSizes;

  let score = 0;
  const reasons: string[] = [];

  if (context.recipeCount === 0) {
    return {
      score: weights.notInRecipes,
      band: 'IRRELEVANT',
      reason: 'geen enkel actief recept gebruikt dit ingredient',
      sufficientlyCovered,
    };
  }

  score += context.recipeCount * weights.recipeFrequency;
  reasons.push(`${context.recipeCount} recept${context.recipeCount === 1 ? '' : 'en'}`);

  if (context.approvedCount === 0) {
    score += weights.noCoverage;
    reasons.push('nog geen enkel bruikbaar product');
  } else if (context.approvedCount < sufficiency.minimumAlternatives) {
    score += weights.scarceCoverage;
    reasons.push(
      `pas ${context.approvedCount} bruikbaar${context.approvedCount === 1 ? '' : 'e producten'}`,
    );
  } else {
    reasons.push(`al ${context.approvedCount} bruikbaar`);
  }

  if (sufficientlyCovered) {
    score += weights.alreadySufficient;
    reasons.push('genoeg alternatieven in genoeg maten — verder beoordelen is optioneel');
  }

  if (!options.usable) {
    // Approving a product with no readable package or no price changes nothing:
    // it still cannot reach the optimizer.
    score += weights.unusableProduct;
    reasons.push('maar dit product mist prijs of verpakking');
  }

  const band: ReviewBand = sufficientlyCovered
    ? 'OPTIONAL'
    : score >= 80
      ? 'HIGH'
      : score >= 40
        ? 'MEDIUM'
        : 'LOW';

  return { score, band, reason: reasons.join(', '), sufficientlyCovered };
}
