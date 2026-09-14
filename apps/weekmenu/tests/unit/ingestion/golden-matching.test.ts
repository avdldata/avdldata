import { describe, expect, it } from 'vitest';
import { SEED_INGREDIENTS } from '@/data/seed/ingredients';
import { GOLDEN_EXAMPLES } from '../../support/golden-matches';
import { evaluateMatcher } from '../../support/match-evaluation';

/**
 * The matcher, graded against hand-labelled ground truth.
 *
 * Precision is the assertion that matters and it is absolute: a single
 * auto-approved product that a human labelled INVALID means someone's shopping
 * list contains something they did not ask for. Recall is a target, not a rule —
 * a missed match costs a little money and announces itself.
 *
 * One caveat this suite cannot check and the report states plainly: the
 * vocabulary was extended *using* these examples, so a perfect score here is
 * partly a measure of fit. The independent evidence is the twenty-week audit
 * (`pnpm match:weeks`), which buys products this corpus never saw.
 */
describe('matching, measured against the golden corpus', () => {
  const result = evaluateMatcher();

  it('never auto-approves a product a human called wrong', () => {
    const offenders = result.falsePositiveExamples.map(
      ({ example }) => `${example.productName} -> ${example.ingredientId} (${example.label})`,
    );
    expect(offenders).toEqual([]);
  });

  it('holds auto-approved precision at or above 99%', () => {
    expect(result.precision).toBeGreaterThanOrEqual(0.99);
  });

  it('recalls the large majority of valid matches', () => {
    // Below this the matcher is safe but useless, and coverage collapses.
    expect(result.recall).toBeGreaterThanOrEqual(0.9);
  });

  it('is measured against a corpus that is actually hard', () => {
    // A corpus of only easy positives would score perfectly and prove nothing.
    const invalid = GOLDEN_EXAMPLES.filter((e) => e.label === 'INVALID').length;
    const ambiguous = GOLDEN_EXAMPLES.filter((e) => e.label === 'AMBIGUOUS').length;
    expect(GOLDEN_EXAMPLES.length).toBeGreaterThanOrEqual(200);
    expect(invalid).toBeGreaterThanOrEqual(60);
    expect(ambiguous).toBeGreaterThanOrEqual(10);
  });

  it('points every label at an ingredient that exists', () => {
    const known = new Set(SEED_INGREDIENTS.map((i) => i.id));
    const unknown = [...new Set(GOLDEN_EXAMPLES.map((e) => e.ingredientId))].filter(
      (id) => !known.has(id),
    );
    expect(unknown).toEqual([]);
  });

  it('sends ambiguous products to a human rather than deciding them', () => {
    const decided = GOLDEN_EXAMPLES.filter((e) => e.label === 'AMBIGUOUS').filter((example) => {
      const single = evaluateMatcher([example]);
      return single.autoApproved > 0;
    });
    expect(decided.map((e) => e.productName)).toEqual([]);
  });
});
