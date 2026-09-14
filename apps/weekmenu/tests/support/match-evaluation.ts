import { SEED_INGREDIENTS, SEED_INGREDIENT_ALIASES } from '@/data/seed/ingredients';
import {
  buildIngredientPhrases,
  matchProduct,
  type MatchStatus,
} from '@/domain/ingestion/match-ingredient';
import { GOLDEN_EXAMPLES, type GoldenExample } from './golden-matches';

/**
 * Grade the matcher against the golden corpus.
 *
 * Coverage on its own is a vanity number: it goes up whenever the matcher gets
 * bolder, including when it gets bolder and wrong. What matters here is
 * precision of the automatic tier — of everything approved without a human
 * looking, how much was actually right — because those are the products that
 * end up in someone's shopping basket unexamined.
 *
 * An AMBIGUOUS example counts as a false positive when auto-approved: the whole
 * point of the label is that the matcher is not entitled to decide it alone.
 * It is never counted as a miss, because sending it to review is exactly right.
 */

export interface MatchEvaluation {
  readonly total: number;
  readonly autoApproved: number;
  readonly needsReview: number;
  readonly rejectedOrUnmatched: number;
  /** Auto-approved and VALID. */
  readonly truePositives: number;
  /** Auto-approved but INVALID or AMBIGUOUS — the number that must be zero. */
  readonly falsePositives: number;
  /** VALID but not auto-approved: correct, just more work for a human. */
  readonly falseNegatives: number;
  readonly precision: number;
  readonly recall: number;
  readonly f1: number;
  readonly falsePositiveExamples: readonly { example: GoldenExample; reason: string }[];
  readonly falseNegativeExamples: readonly {
    example: GoldenExample;
    status: string;
    reason: string;
  }[];
}

export function evaluateMatcher(
  examples: readonly GoldenExample[] = GOLDEN_EXAMPLES,
): MatchEvaluation {
  const phrases = buildIngredientPhrases(SEED_INGREDIENTS, SEED_INGREDIENT_ALIASES);

  let autoApproved = 0;
  let needsReview = 0;
  let rejectedOrUnmatched = 0;
  let truePositives = 0;
  let falsePositives = 0;
  let falseNegatives = 0;
  const falsePositiveExamples: { example: GoldenExample; reason: string }[] = [];
  const falseNegativeExamples: { example: GoldenExample; status: string; reason: string }[] = [];

  for (const example of examples) {
    const match = matchProduct(
      { productId: example.productName, productName: example.productName },
      phrases,
    );

    // A match to a *different* ingredient than the one under test is not an
    // approval of this pairing, so it counts as "not auto-approved" here.
    const decided: MatchStatus | 'UNMATCHED' =
      match && match.canonicalIngredientId === example.ingredientId ? match.status : 'UNMATCHED';

    if (decided === 'AUTO_APPROVED') autoApproved += 1;
    else if (decided === 'NEEDS_REVIEW') needsReview += 1;
    else rejectedOrUnmatched += 1;

    if (decided === 'AUTO_APPROVED') {
      if (example.label === 'VALID') truePositives += 1;
      else {
        falsePositives += 1;
        falsePositiveExamples.push({ example, reason: match?.rationale ?? '' });
      }
    } else if (example.label === 'VALID') {
      falseNegatives += 1;
      falseNegativeExamples.push({
        example,
        status: decided,
        reason: match?.rationale ?? 'geen kandidaat gevonden',
      });
    }
  }

  const precision = autoApproved === 0 ? 1 : truePositives / autoApproved;
  const validTotal = truePositives + falseNegatives;
  const recall = validTotal === 0 ? 1 : truePositives / validTotal;

  return {
    total: examples.length,
    autoApproved,
    needsReview,
    rejectedOrUnmatched,
    truePositives,
    falsePositives,
    falseNegatives,
    precision,
    recall,
    f1: precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall),
    falsePositiveExamples,
    falseNegativeExamples,
  };
}
