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

describe('Nederlandse meervouden en synoniemen', () => {
  it('vindt het enkelvoud als dat precies een basisingrediënt is', () => {
    expect(matchCanonicalIngredient('aubergines')).toMatchObject({ ingredientId: 'aubergine' });
    expect(matchCanonicalIngredient('tomaten')).toMatchObject({ ingredientId: 'tomaat' });
    expect(matchCanonicalIngredient('wortelen')).toMatchObject({ ingredientId: 'wortel' });
  });

  it('gebruikt de eigen synoniemen van de catalogus', () => {
    expect(matchCanonicalIngredient('uien')).toMatchObject({ ingredientId: 'ui' });
  });

  it('valt voor een specifieker product niet terug op het gewone ingrediënt', () => {
    // Zongedroogde tomaten uit een pot zijn geen verse tomaten. Liever geen
    // koppeling dan de verkeerde op de boodschappenlijst.
    const match = matchCanonicalIngredient('semi-zongedroogde tomaten');
    expect(match.kind).toBe('NEEDS_NEW_CANONICAL');
    expect(match.ingredientId).toBeUndefined();
  });

  it('kent de Allerhande-woorden voor ingrediënten die er al zijn', () => {
    expect(matchCanonicalIngredient('scharreleieren')).toMatchObject({ ingredientId: 'ei' });
    expect(matchCanonicalIngredient('zeezout')).toMatchObject({ ingredientId: 'zout' });
    expect(matchCanonicalIngredient('olie')).toMatchObject({ ingredientId: 'zonnebloemolie' });
    expect(matchCanonicalIngredient('witte snelkookrijst')).toMatchObject({
      ingredientId: 'witte-rijst',
    });
  });

  it('"olie" geldt alleen als hele naam: arachide- en sesamolie worden geen zonnebloemolie', () => {
    // Pinda en sesam zijn allergenen. Die mogen nooit wegvallen doordat een
    // los woord "olie" in een langere naam op zonnebloemolie werd gezet.
    for (const name of ['arachide olie', 'sesam olie', 'geroosterde sesam olie']) {
      expect(matchCanonicalIngredient(name).ingredientId, name).not.toBe('zonnebloemolie');
    }
  });
});
