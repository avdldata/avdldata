import { describe, expect, it } from 'vitest';
import { matchCanonicalIngredient } from '@/services/recipes/canonical-matching';
import { SEED_INGREDIENTS } from '@/data/seed/ingredients';

/**
 * Precision over recall, tested from the failure side.
 *
 * An unmatched line costs a recipe some score. A wrongly matched line puts the
 * wrong food on someone's plate, and does it silently — which is why most of
 * this file is about what the matcher refuses rather than what it resolves.
 */
describe('matchCanonicalIngredient', () => {
  it('hits a canonical ingredient by its own Dutch name', () => {
    expect(matchCanonicalIngredient('knoflook')).toMatchObject({
      kind: 'EXACT',
      ingredientId: 'knoflook',
    });
  });

  it('translates English through the hand-written table, not a string metric', () => {
    expect(matchCanonicalIngredient('garlic cloves')).toMatchObject({
      kind: 'SAFE_ALIAS',
      ingredientId: 'knoflook',
    });
    expect(matchCanonicalIngredient('leek')).toMatchObject({
      kind: 'SAFE_ALIAS',
      ingredientId: 'prei',
    });
  });

  it('lets the longer concept win over the one contained in it', () => {
    expect(matchCanonicalIngredient('sweet potato').ingredientId).toBe('zoete-aardappel');
    expect(matchCanonicalIngredient('potato').ingredientId).toBe('aardappel');
    expect(matchCanonicalIngredient('spring onion').ingredientId).toBe('bosui');
    expect(matchCanonicalIngredient('red onion').ingredientId).toBe('rode-ui');
  });

  it('refuses a line that names two foods instead of picking one', () => {
    const match = matchCanonicalIngredient('salt and pepper');
    expect(match.kind).toBe('REJECT');
  });

  it('rejects what a planner should not buy', () => {
    for (const line of ['water', 'cold water', '2 liters water', 'to taste', 'for garnish']) {
      expect(matchCanonicalIngredient(line).kind, line).toBe('REJECT');
    }
  });

  /**
   * Regression. The first census run reported "l water" and "g sugar" as
   * missing canonical ingredients: a unit word had survived the line parser and
   * become part of the concept name. Stripping it here as well means a new
   * corpus adapter cannot reintroduce the same ghost.
   */
  it('strips a unit word that survived the corpus parser', () => {
    expect(matchCanonicalIngredient('l water').kind).toBe('REJECT');
    expect(matchCanonicalIngredient('g sugar').concept).toBe('sugar');
    expect(matchCanonicalIngredient('cups of milk').ingredientId).toBe('melk');
  });

  it('names a genuinely new concept instead of forcing it onto a neighbour', () => {
    const match = matchCanonicalIngredient('gochujang');
    expect(match.kind).toBe('NEEDS_NEW_CANONICAL');
    expect(match.concept).toBe('gochujang');
    expect(match.ingredientId).toBeUndefined();
  });

  it('never returns an id that is not in the catalogue', () => {
    const ids = new Set(SEED_INGREDIENTS.map((i) => i.id));
    const lines = [
      'garlic',
      'chicken thighs',
      'olive oil',
      'basmati rice',
      'canned tomatoes',
      'red bell pepper',
      'greek yoghurt',
      'sweet potatoes',
      'ground cumin',
      'flat-leaf parsley',
    ];
    for (const line of lines) {
      const match = matchCanonicalIngredient(line);
      if (match.ingredientId !== undefined) expect(ids, line).toContain(match.ingredientId);
    }
  });

  it('is a pure function of the line, so the census is reproducible', () => {
    const first = matchCanonicalIngredient('Finely Chopped Red Onion, divided');
    const second = matchCanonicalIngredient('Finely Chopped Red Onion, divided');
    expect(first).toEqual(second);
  });
});
