import { describe, expect, it } from 'vitest';
import { SEED_INGREDIENTS, SEED_INGREDIENT_ALIASES } from '@/data/seed/ingredients';
import { buildIngredientPhrases, matchProduct } from '@/domain/ingestion/match-ingredient';
import { JUMBO_GOLDEN_EXAMPLES } from '../../support/golden-matches-jumbo';
import { evaluateMatcher } from '../../support/match-evaluation';

/**
 * The matcher, graded against a chain it was not built on.
 *
 * This suite exists to answer one question the Albert Heijn corpus cannot: was
 * the matcher fitted to one shop's naming habits? Jumbo capitalises differently,
 * puts the pack size in the name, and sells far more A-brands, so anything that
 * only worked because AH writes "AH Biologisch <thing>" shows up here.
 *
 * Precision is the absolute assertion, exactly as for Albert Heijn. Recall is a
 * target — and deliberately not chased to 100% by adding aliases for the two
 * remaining misses, because a corpus you fit to stops being a measurement.
 */
describe('matching, measured against the Jumbo corpus', () => {
  const result = evaluateMatcher(JUMBO_GOLDEN_EXAMPLES);

  it('never auto-approves a product a human called wrong', () => {
    const offenders = result.falsePositiveExamples.map(
      ({ example }) => `${example.productName} -> ${example.ingredientId} (${example.label})`,
    );
    expect(offenders).toEqual([]);
  });

  it('holds auto-approved precision at or above 99%', () => {
    expect(result.precision).toBeGreaterThanOrEqual(0.99);
  });

  it('recalls the large majority of valid matches on an unseen chain', () => {
    expect(result.recall).toBeGreaterThanOrEqual(0.95);
  });

  it('is measured against a corpus that is actually hard', () => {
    const invalid = JUMBO_GOLDEN_EXAMPLES.filter((e) => e.label === 'INVALID').length;
    expect(JUMBO_GOLDEN_EXAMPLES.length).toBeGreaterThanOrEqual(150);
    expect(invalid).toBeGreaterThanOrEqual(50);
  });

  it('points every label at an ingredient that exists', () => {
    const known = new Set(SEED_INGREDIENTS.map((i) => i.id));
    const unknown = [...new Set(JUMBO_GOLDEN_EXAMPLES.map((e) => e.ingredientId))].filter(
      (id) => !known.has(id),
    );
    expect(unknown).toEqual([]);
  });

  it('sends ambiguous products to a human rather than deciding them', () => {
    const decided = JUMBO_GOLDEN_EXAMPLES.filter((e) => e.label === 'AMBIGUOUS').filter(
      (example) => evaluateMatcher([example]).autoApproved > 0,
    );
    expect(decided.map((e) => e.productName)).toEqual([]);
  });
});

/**
 * The judgements the Jumbo data forced, pinned individually.
 *
 * Each of these is a decision that could plausibly be reversed by someone
 * tidying the vocabulary later, and each would be a wrong purchase if it were.
 */
describe('the rules the second chain proved were needed', () => {
  const phrases = buildIngredientPhrases(SEED_INGREDIENTS, SEED_INGREDIENT_ALIASES);
  const verdict = (name: string): string => {
    const match = matchProduct({ productId: name, productName: name }, phrases);
    return match ? `${match.status}:${match.canonicalIngredientId}` : 'NONE';
  };

  it('treats an A-brand as noise, the way it treats a shop brand', () => {
    expect(verdict('Hak Bruine Bonen 370 g')).toBe('AUTO_APPROVED:bruine-bonen');
    expect(verdict('Campina Halfvolle Melk 1 L')).toBe('AUTO_APPROVED:melk');
    expect(verdict('Lurpak ongezouten roomboter 200 g')).toBe('AUTO_APPROVED:roomboter');
  });

  it('does not let a brand name turn a drink into the fruit it is made of', () => {
    // "Van de Boom" sells apple juice. Adding "boom" to the brand list would
    // leave "Appel 1 L" looking exactly like a bag of apples.
    expect(verdict('Van de Boom Appel 1 L')).not.toBe('AUTO_APPROVED:appel');
  });

  it('does not buy dried pulses to satisfy a recipe that means tinned ones', () => {
    // 500 g dried is about 1,2 kg cooked, at a third of the price — precisely
    // the trade an optimizer would take if the matcher let it.
    expect(verdict('Jumbo Gedroogde Kikkererwten 500 g')).not.toBe('AUTO_APPROVED:kikkererwten');
    expect(verdict('Jumbo Gedroogde Bruine Bonen 500 g')).not.toBe('AUTO_APPROVED:bruine-bonen');
  });

  it('still accepts dried and ground where that is what a recipe means', () => {
    expect(verdict('Verstegen Komijnzaad Gemalen 37 g')).toBe('AUTO_APPROVED:komijn');
    expect(verdict('Verstegen Kaneel Gemalen 37 g')).toBe('AUTO_APPROVED:kaneel');
  });

  it('does not buy a spice jar to satisfy a fresh ingredient', () => {
    // Both of these were auto-approved before Jumbo was measured.
    expect(verdict('AH Knoflook gemalen')).not.toBe('AUTO_APPROVED:knoflook');
    expect(verdict('AH Paprika mild gemalen')).not.toBe('AUTO_APPROVED:paprika-rood');
    expect(verdict('Verstegen Gember Gemalen 26 g')).not.toBe('AUTO_APPROVED:gember');
  });

  it('reads the plain ingredient name, not only the catalogue spelling', () => {
    // The catalogue says "Verse gember" and "Magere kwark"; both chains sell
    // "Gember" and "Kwark Mager".
    expect(verdict('Jumbo Gember 150 g')).toBe('AUTO_APPROVED:gember');
    expect(verdict('Jumbo Kwark Mager 500 g')).toBe('AUTO_APPROVED:kwark');
  });

  it('keeps a flavoured version out of the automatic tier', () => {
    // The plain-name aliases must not open a door for these.
    expect(verdict('AH Kwark aardbei')).not.toBe('AUTO_APPROVED:kwark');
    expect(verdict('Jumbo Shot Gember, Appel & Aardbei 125ML')).not.toBe('AUTO_APPROVED:gember');
  });

  it('sends tinned chopped tomatoes to the tinned ingredient', () => {
    expect(verdict('Heinz Tomaten Gepeld')).toBe('AUTO_APPROVED:tomaat');
    expect(verdict('Heinz Tomatenblokjes 390g')).toBe('AUTO_APPROVED:tomatenblokjes');
    expect(verdict('Heinz Tomaten blokjes naturel')).toBe('AUTO_APPROVED:tomatenblokjes');
  });
});

/**
 * What fifty real weeks bought, and what one of them should never have.
 *
 * The automatic checks passed on all 1.386 lines. Reading the 128 products they
 * actually bought did not: a jar of infant purée had been quietly standing in
 * for a vegetable, nineteen times. This is what the manual pass is for, and
 * these tests are what stops it coming back.
 */
describe('infant food is not the vegetable on its label', () => {
  const phrases = buildIngredientPhrases(SEED_INGREDIENTS, SEED_INGREDIENT_ALIASES);
  const verdict = (name: string): string => {
    const match = matchProduct({ productId: name, productName: name }, phrases);
    return match ? `${match.status}:${match.canonicalIngredientId}` : 'NONE';
  };

  it('rejects a purée jar however the age marker is written', () => {
    expect(verdict('AH Biologisch Pompoen 4m+')).toBe('REJECTED:pompoen');
    expect(verdict('Olvarit Wortel 4m+')).toBe('REJECTED:wortel');
    expect(verdict('AH Biologisch Fruithapje appel perzik 8m+')).toBe('REJECTED:appel');
    expect(verdict('AH Biologisch Couscous met wortel tomaat kip 12m+')).toBe('REJECTED:couscous');
  });

  it('does not treat an age marker as a pack size', () => {
    // "4m" used to be swallowed by the same rule that drops "400g", which left
    // "Olvarit Appel 4m+" with nothing unexplained about it at all.
    expect(verdict('Olvarit Appel 4m+')).not.toBe('AUTO_APPROVED:appel');
  });

  it('still drops real pack sizes', () => {
    expect(verdict('AH Tomatenpuree 4-pack')).toBe('AUTO_APPROVED:tomatenpuree');
    expect(verdict('Jumbo Tomatenblokjes 400g')).toBe('AUTO_APPROVED:tomatenblokjes');
    expect(verdict('Jumbo Kikkererwten 400 g')).toBe('AUTO_APPROVED:kikkererwten');
  });
});
