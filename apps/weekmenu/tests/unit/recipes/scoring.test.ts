import { describe, expect, it } from 'vitest';
import { scoreCandidate, type ScoringContext } from '@/services/recipes/scoring';
import { candidate } from '../../support/recipe-candidate';

/**
 * The ranking has to be defensible: when a recipe is in the library, someone
 * should be able to ask why, and the answer should be a row of numbers.
 *
 * The test that matters most here is the promotion one. A recipe library that
 * exists because of this week's folder is worthless next week, so promotion
 * opportunity is capped at a tie-breaker and this file pins the cap.
 */
const DINNER = [
  '500 g chicken thighs',
  '300 g basmati rice',
  '2 onions',
  '3 carrots',
  '2 garlic cloves',
];

function context(overrides: Partial<ScoringContext> = {}): ScoringContext {
  return {
    retailAvailable: new Set<string>(),
    promoted: new Set<string>(),
    cuisineCounts: new Map<string, number>(),
    shortlistSize: 500,
    ...overrides,
  };
}

describe('scoreCandidate', () => {
  it('scores a licence-barred recipe at zero, whatever else is true about it', () => {
    const good = candidate('Chicken Curry', DINNER);
    const barred = candidate('Chicken Curry', DINNER, { rights: 'UNKNOWN' });
    expect(scoreCandidate(good, context()).total).toBeGreaterThan(0);
    expect(scoreCandidate(barred, context()).licenseSafety).toBe(0);
    expect(scoreCandidate(barred, context()).total).toBe(0);
  });

  it('caps promotion opportunity at a tie-breaker, never a driver', () => {
    const recipe = candidate('Chicken Curry', DINNER);
    const none = scoreCandidate(recipe, context());
    const all = scoreCandidate(recipe, context({ promoted: new Set(none.facts.canonicalIds) }));
    expect(all.promotionOpportunity).toBe(1);
    // Everything promoted lifts the score by at most a tenth. A recipe cannot
    // enter the library on promotions alone.
    expect(all.total).toBeLessThanOrEqual(none.total * 1.1 + 1e-9);
    expect(all.total).toBeGreaterThan(none.total);
  });

  it('scores a dish that is not dinner at zero', () => {
    const cake = candidate('Chocolate Cake', [
      '200 g flour',
      '3 eggs',
      '150 g sugar',
      '100 g butter',
    ]);
    const score = scoreCandidate(cake, context());
    expect(score.dinnerSuitability).toBe(0);
    expect(score.total).toBe(0);
  });

  it('penalises a recipe whose quantities we cannot weigh', () => {
    const measured = candidate('Chicken Curry', DINNER);
    const vague = candidate('Chicken Curry', [
      '1 can chicken thighs',
      '1 package basmati rice',
      '1 bunch onions',
      '3 carrots',
      '2 garlic cloves',
    ]);
    const a = scoreCandidate(measured, context());
    const b = scoreCandidate(vague, context());
    expect(b.unitParseability).toBeLessThan(a.unitParseability);
    expect(b.penalties.UNKNOWN_UNITS).toBeGreaterThan(0);
    expect(b.total).toBeLessThan(a.total);
  });

  it('rewards ingredients we can actually buy', () => {
    const recipe = candidate('Chicken Curry', DINNER);
    const blind = scoreCandidate(recipe, context());
    const stocked = scoreCandidate(
      recipe,
      context({ retailAvailable: new Set(blind.facts.canonicalIds) }),
    );
    expect(blind.retailAvailability).toBe(0);
    expect(stocked.retailAvailability).toBe(1);
    expect(stocked.total).toBeGreaterThan(blind.total);
  });

  it('pushes a cuisine down as the shortlist fills up with it', () => {
    const recipe = candidate('Chicken Curry', DINNER, { cuisine: 'italian' });
    const fresh = scoreCandidate(recipe, context());
    const crowded = scoreCandidate(recipe, context({ cuisineCounts: new Map([['italian', 60]]) }));
    expect(crowded.recipeDiversity).toBeLessThan(fresh.recipeDiversity);
    expect(crowded.total).toBeLessThan(fresh.total);
  });

  it('reports the facts it scored from, so a ranking can be audited', () => {
    const score = scoreCandidate(candidate('Chicken Curry', DINNER), context());
    expect(score.facts.lines).toBe(DINNER.length);
    expect(score.facts.matched).toBeGreaterThan(0);
    expect(score.facts.canonicalIds).toContain('ui');
    expect(new Set(score.facts.canonicalIds).size).toBe(score.facts.canonicalIds.length);
  });

  it('is bounded and never negative', () => {
    const awful = candidate('Mystery', ['1 bunch gochujang and yuzu', '1 pinch of dust'], {
      rights: 'CC_BY_SA',
    });
    const score = scoreCandidate(awful, context());
    expect(score.total).toBeGreaterThanOrEqual(0);
    expect(score.total).toBeLessThanOrEqual(1.1);
  });
});
