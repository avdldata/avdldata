import type { IngredientId } from '../ingredients/types';

/**
 * Extra names a canonical ingredient goes by on a shelf.
 *
 * The recipe catalogue calls something "Verse spinazie"; the shop sells
 * "Babyspinazie" and "Bladspinazie". Neither side is wrong, and the gap between
 * them is pure vocabulary — so it is closed with vocabulary, in a list anyone
 * can extend, rather than with cleverness in the matcher.
 *
 * `type` records where an alias came from, because that determines how much it
 * should be trusted and whether it may be changed automatically:
 *
 *   CANONICAL  the ingredient's own name (generated, not authored here)
 *   SYNONYM    another everyday word for the same thing
 *   SHOP_NAME  what a specific retailer calls it
 *   FORM       a form of the ingredient that is still substitutable
 */
export type AliasType = 'CANONICAL' | 'SYNONYM' | 'SHOP_NAME' | 'FORM';

export interface IngredientAliasEntry {
  readonly canonicalIngredientId: IngredientId;
  readonly phrase: string;
  readonly type: AliasType;
}

/**
 * Authored aliases, all of them derived from products actually present in the
 * Albert Heijn data — never invented. Each one closed a measured gap; see
 * AH_MATCHING_GAPS.md for which.
 */
export const INGREDIENT_ALIASES: readonly IngredientAliasEntry[] = [
  // Vegetables the shop names differently from the kitchen
  { canonicalIngredientId: 'spinazie', phrase: 'babyspinazie', type: 'SHOP_NAME' },
  { canonicalIngredientId: 'spinazie', phrase: 'bladspinazie', type: 'SHOP_NAME' },
  { canonicalIngredientId: 'wortel', phrase: 'winterpeen', type: 'SYNONYM' },
  { canonicalIngredientId: 'wortel', phrase: 'bospeen', type: 'SYNONYM' },
  { canonicalIngredientId: 'ui', phrase: 'gele ui', type: 'SHOP_NAME' },
  { canonicalIngredientId: 'ui', phrase: 'uien', type: 'SYNONYM' },
  { canonicalIngredientId: 'aardappel', phrase: 'aardappelen', type: 'SYNONYM' },
  { canonicalIngredientId: 'bloemkool', phrase: 'bloemkoolroosjes', type: 'FORM' },

  // Meat and fish
  { canonicalIngredientId: 'runderstoof', phrase: 'runderstoofvlees', type: 'SYNONYM' },
  { canonicalIngredientId: 'runderstoof', phrase: 'riblappen', type: 'SHOP_NAME' },
  { canonicalIngredientId: 'runderstoof', phrase: 'runderriblappen', type: 'SHOP_NAME' },
  { canonicalIngredientId: 'gehakt-rund', phrase: 'rundgehakt', type: 'SYNONYM' },
  { canonicalIngredientId: 'kabeljauw', phrase: 'kabeljauwfilet', type: 'FORM' },
  { canonicalIngredientId: 'tonijnsteak', phrase: 'tonijnsteaks', type: 'SYNONYM' },
  { canonicalIngredientId: 'spekblokjes', phrase: 'spekreepjes', type: 'FORM' },

  // Dairy and cheese
  { canonicalIngredientId: 'geraspte-kaas', phrase: 'geraspte kaas', type: 'SYNONYM' },
  { canonicalIngredientId: 'parmezaan', phrase: 'parmigiano reggiano', type: 'SYNONYM' },
  { canonicalIngredientId: 'parmezaan', phrase: 'parmezaanse kaas', type: 'SYNONYM' },
  { canonicalIngredientId: 'blauwe-kaas', phrase: 'danish blue', type: 'SHOP_NAME' },
  { canonicalIngredientId: 'blauwe-kaas', phrase: 'gorgonzola', type: 'SYNONYM' },

  // Store cupboard
  { canonicalIngredientId: 'komijn', phrase: 'komijnpoeder', type: 'SYNONYM' },
  { canonicalIngredientId: 'komijn', phrase: 'komijnzaad', type: 'FORM' },
  // Deliberately NOT a bare "wijnazijn" alias: that let red wine vinegar
  // satisfy a recipe asking for white, which the twenty-week audit caught.
  { canonicalIngredientId: 'azijn', phrase: 'witte wijnazijn', type: 'SYNONYM' },
  { canonicalIngredientId: 'groentebouillon', phrase: 'groentebouillonblokjes', type: 'FORM' },
  { canonicalIngredientId: 'groentebouillon', phrase: 'groentebouillontablet', type: 'FORM' },
  { canonicalIngredientId: 'zilvervliesrijst', phrase: 'zilvervlies rijst', type: 'SYNONYM' },
  { canonicalIngredientId: 'zilvervliesrijst', phrase: 'volkoren rijst', type: 'SYNONYM' },
  { canonicalIngredientId: 'wraps', phrase: 'tortilla wraps', type: 'SHOP_NAME' },
  { canonicalIngredientId: 'wraps', phrase: 'tortillas', type: 'SYNONYM' },
  { canonicalIngredientId: 'pitabrood', phrase: 'pitabroodjes', type: 'SYNONYM' },
  { canonicalIngredientId: 'mie', phrase: 'mienoedels', type: 'SYNONYM' },
  { canonicalIngredientId: 'mie', phrase: 'noedels', type: 'SYNONYM' },
  { canonicalIngredientId: 'gember', phrase: 'gemberwortel', type: 'FORM' },
  { canonicalIngredientId: 'verse-peterselie', phrase: 'peterselie', type: 'SYNONYM' },
  { canonicalIngredientId: 'kerriepoeder', phrase: 'kerrie', type: 'SYNONYM' },
  { canonicalIngredientId: 'paneermeel', phrase: 'paneermeel beschuit', type: 'SHOP_NAME' },
  { canonicalIngredientId: 'tofu', phrase: 'tofoe', type: 'SYNONYM' },

  /*
   * Short forms.
   *
   * The catalogue names an ingredient as precisely as a recipe needs it —
   * "Tofu naturel", "Groentebouillonblokjes", "Verse tonijnsteak". A shop just
   * writes "tofu". Without the short form the matcher looks for a phrase that
   * is never on a shelf and finds nothing at all, which is the single largest
   * source of missed matches measured.
   */
  { canonicalIngredientId: 'tofu', phrase: 'tofu', type: 'SYNONYM' },
  { canonicalIngredientId: 'ei', phrase: 'ei', type: 'SYNONYM' },
  { canonicalIngredientId: 'ei', phrase: 'scharrelei', type: 'SHOP_NAME' },
  // Dutch plurals that are not formed by adding -s or -en.
  { canonicalIngredientId: 'ei', phrase: 'scharreleieren', type: 'SHOP_NAME' },
  { canonicalIngredientId: 'ei', phrase: 'eieren', type: 'SYNONYM' },
  { canonicalIngredientId: 'tomaat', phrase: 'tomaten', type: 'SYNONYM' },
  { canonicalIngredientId: 'melk', phrase: 'melk', type: 'SYNONYM' },
  { canonicalIngredientId: 'parmezaan', phrase: 'parmezaan', type: 'SYNONYM' },
  { canonicalIngredientId: 'groentebouillon', phrase: 'groentebouillon', type: 'SYNONYM' },
  { canonicalIngredientId: 'bloem', phrase: 'bloem', type: 'SYNONYM' },
  { canonicalIngredientId: 'bloem', phrase: 'tarwebloem', type: 'SYNONYM' },
  { canonicalIngredientId: 'wraps', phrase: 'wraps', type: 'SYNONYM' },
  { canonicalIngredientId: 'mie', phrase: 'mie', type: 'SYNONYM' },
  { canonicalIngredientId: 'tonijnsteak', phrase: 'tonijnsteak', type: 'SYNONYM' },
  { canonicalIngredientId: 'komijn', phrase: 'komijn', type: 'SYNONYM' },
  { canonicalIngredientId: 'geraspte-kaas', phrase: 'geraspte kaas', type: 'SYNONYM' },
  { canonicalIngredientId: 'cherrytomaat', phrase: 'cherrytomaat', type: 'SYNONYM' },
  // The canonical names carry a form word the shops leave off: the catalogue
  // says "Verse gember" and "Magere kwark", both chains sell "Gember" and
  // "Kwark Mager". Found by measuring Jumbo; it was a gap in Albert Heijn too.
  { canonicalIngredientId: 'gember', phrase: 'gember', type: 'CANONICAL' },
  { canonicalIngredientId: 'kwark', phrase: 'kwark', type: 'CANONICAL' },
  // Written as two words by both chains. Longest-phrase-wins then sends it to
  // the tinned ingredient instead of to fresh tomato, which is what it is.
  { canonicalIngredientId: 'tomatenblokjes', phrase: 'tomaten blokjes', type: 'SHOP_NAME' },
  // Jumbo drops the inflection: "Geraspt Kaas Oud".
  { canonicalIngredientId: 'geraspte-kaas', phrase: 'geraspt kaas', type: 'SHOP_NAME' },
];

/**
 * Words that are harmless for one ingredient and meaningful for another.
 *
 * A universal list cannot express this. "Gerookt" preserves bacon and
 * transforms chicken; "goudse" and "cheddar" are just which cheese got grated,
 * but they would be a red flag almost anywhere else. So these allowances are
 * scoped to the ingredient they are safe for, and nowhere else.
 */
/**
 * Ingredients whose ordinary retail form is the dried, ground one.
 *
 * Herbs and spices are weighed dried in every recipe, so "gedroogde oregano"
 * and "komijn gemalen" are simply oregano and cumin. Almost nothing else works
 * that way, and treating "gedroogd" or "gemalen" as harmless everywhere quietly
 * priced three things wrong:
 *
 *   - 500 g of dried chickpeas is not the 500 g of drained tinned chickpeas a
 *     recipe asks for — it is roughly two and a half times as much food, for a
 *     fraction of the price, which is exactly the kind of mistake an optimizer
 *     is drawn to;
 *   - a 40 g jar of garlic powder is not a bulb of garlic;
 *   - "paprika gemalen" is a spice, and was being bought as a bell pepper.
 *
 * So both words are allowed here and nowhere else. The first was found while
 * measuring Jumbo; the last two were already wrong in Albert Heijn.
 */
const GROUND_BY_DEFAULT: readonly string[] = [
  'oregano',
  'italiaanse-kruiden',
  'paprikapoeder',
  'komijn',
  'kerriepoeder',
  'kurkuma',
  'chilipoeder',
  'kaneel',
  'peper',
];

/**
 * Words that make a product a *different* food, for one ingredient only.
 *
 * The general vocabulary treats fat-content words as harmless, and for milk it
 * is right: "halfvolle melk" is milk. For butter it is not. Halfvolle roomboter
 * is roughly 40 % fat against 80 %, so a recipe priced and counted on it would
 * be wrong about the energy by a factor of two, and it browns and binds
 * differently in a pan. An audit of a real shopping list found it bought as
 * plain butter.
 *
 * Deliberately per ingredient. A global rule would take "halfvolle melk" with
 * it, and that one is genuinely fine.
 */
export const INGREDIENT_DENY_WORDS: Readonly<Record<string, readonly string[]>> = {
  roomboter: ['halfvol', 'halfvolle', 'light', 'halvarine', 'margarine'],
};

export const INGREDIENT_SAFE_WORDS: Readonly<Record<string, readonly string[]>> = {
  // Cured pork is sold smoked as a matter of course.
  spekblokjes: ['gerookt', 'gerookte'],
  /*
   * Pre-cut peppers, decided explicitly rather than left ambiguous.
   *
   * "Jumbo Paprika Reepjes 450 g" is pepper and nothing else: no sauce, no
   * seasoning, and a stated weight that means what it says. It costs more per
   * kilo than a whole pepper, which is the shopper's trade-off and not a
   * correctness problem, so it is allowed on purpose.
   */
  'paprika-rood': ['reepjes', 'reepje', 'gesneden'],
  'paprika-geel': ['reepjes', 'reepje', 'gesneden'],
  // Which cheese was grated does not change that it is grated cheese.
  'geraspte-kaas': ['goudse', 'cheddar', 'emmentaler', 'belegen', 'jong', 'kaas', '48'],
  // Flour grades.
  bloem: ['patent', 'tarwe'],
  // Stock comes as cubes, tablets or powder; all of them dissolve the same.
  groentebouillon: ['tabletten', 'tablet', 'blokjes', 'poeder', 'zonnatura', 'knorr'],
  wraps: ['tarwe', 'volkoren'],
  // Noodles are sold as nests; it is a shape, not a different food.
  mie: ['nestjes', 'nest', 'noedels'],
  // Variety names on tomatoes and apples.
  cherrytomaat: ['sweet', 'cherry'],
  appel: ['elstar', 'jonagold', 'granny', 'smith', 'pink', 'lady'],
  // Rusk-based breadcrumbs are breadcrumbs.
  paneermeel: ['beschuit'],
  // Shrimp are sold raw and peeled without ceasing to be shrimp.
  garnalen: ['gepeld', 'ongepeld'],
  // Bulgur is cracked wheat, so "tarwe" describes it rather than adding to it.
  bulgur: ['tarwe'],
  // Dried is the form a recipe means for a spice, and only for a spice. For
  // 500 g of dried beans it is not: those are not the 500 g the recipe wants,
  // which is why "gedroogd" is no longer universally form-preserving.
  ...Object.fromEntries(
    GROUND_BY_DEFAULT.map((id) => [id, ['gedroogd', 'gedroogde', 'gemalen'] as readonly string[]]),
  ),
};
