import { describe, expect, it } from 'vitest';
import { buildIngredientPhrases, matchProduct } from '@/domain/ingestion/match-ingredient';
import { SEED_INGREDIENTS, SEED_INGREDIENT_ALIASES } from '@/data/seed/ingredients';

const phrases = buildIngredientPhrases(SEED_INGREDIENTS, SEED_INGREDIENT_ALIASES);
const match = (name: string) => matchProduct({ productId: name, productName: name }, phrases);

/**
 * The rule these tests exist to protect: a wrong match is worse than no match.
 *
 * Every "must not auto-approve" case below is a real product name from the
 * dataset that an earlier, looser version of this matcher accepted — and the
 * first real shopping list showed the result: croutons sold as garlic, cake
 * sold as butter, salami sold as cheese.
 */
describe('matching a supermarket product to a recipe ingredient', () => {
  it('accepts the product that is simply the ingredient', () => {
    const result = match('AH Rundergehakt');
    expect(result?.status).toBe('AUTO_APPROVED');
    expect(result?.canonicalIngredientId).toBe('gehakt-rund');
  });

  it('sees through the shop\'s own branding', () => {
    // "AH Terra Biologische tofu" is tofu; the rest is the shop talking.
    const result = match('AH Biologisch Knoflook');
    expect(result?.status).toBe('AUTO_APPROVED');
    expect(result?.canonicalIngredientId).toBe('knoflook');
  });

  const notSubstitutes = [
    'AH Knoflook croutons',
    'AH Roomboter custardcakes',
    'AH Truffelsalami met Parmezaanse kaas',
    'AH Kipfiletreepjes shoarma',
    'AH Vanille kwark',
  ];
  for (const name of notSubstitutes) {
    it(`never auto-approves "${name}"`, () => {
      const result = match(name);
      expect(result?.status, `${name} must not be auto-approved`).not.toBe('AUTO_APPROVED');
    });
  }

  it('rejects a different food that happens to share a word', () => {
    const result = match('AH Tomatensoep');
    expect(result === undefined || result.status === 'REJECTED').toBe(true);
  });

  it('does not let a disqualifier inside the ingredient name reject it', () => {
    // "sojasaus" contains "saus" and is the ingredient, not a sauce poured over
    // one. The check has to look at what the name says beyond the match.
    const result = match('AH Sojasaus');
    expect(result?.status).toBe('AUTO_APPROVED');
    expect(result?.canonicalIngredientId).toBe('sojasaus');
  });

  it('tolerates the regular Dutch plural', () => {
    expect(match('AH Wortelen')?.canonicalIngredientId).toBe('wortel');
  });

  it('prefers the longer, more specific ingredient', () => {
    // "rode ui" must win over "ui", or every red onion becomes a plain one.
    expect(match('AH Rode ui')?.canonicalIngredientId).toBe('rode-ui');
  });

  it('matches on whole words only', () => {
    // "ui" inside "bruine" is not an onion.
    const result = match('AH Bruine bonen');
    expect(result?.canonicalIngredientId).not.toBe('ui');
  });

  it('returns nothing rather than guessing for an unrelated product', () => {
    expect(match('AH Wasmiddel kleur')?.status).not.toBe('AUTO_APPROVED');
  });
});
