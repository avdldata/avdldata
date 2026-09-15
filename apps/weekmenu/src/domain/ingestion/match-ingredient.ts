import type { CanonicalIngredient, IngredientId } from '../ingredients/types';
import type { IngredientVariant, VariantId } from '../ingredients/taxonomy';
import { INGREDIENT_ALIASES, INGREDIENT_SAFE_WORDS, type AliasType } from './ingredient-aliases';
import { DISQUALIFYING_WORDS, isIgnorableWord, PRESERVING_WORDS } from './matching-vocabulary';

/**
 * Decide which canonical ingredient a supermarket product can stand in for.
 *
 * The governing rule is that a wrong match is worse than no match. A missing
 * product makes a week slightly more expensive or reports an item as
 * unavailable — visible, and recoverable. A wrong one silently prices garlic
 * croutons as garlic and quietly changes what someone eats.
 *
 * So this does not score similarity. It gathers *evidence*, and the evidence
 * decides the tier:
 *
 *   the product name must contain the ingredient, or one of its aliases, as
 *   whole words;
 *
 *   every remaining word is then classified. Brand, packaging and
 *   form-preserving words are set aside — sliced onion is onion. A word naming
 *   a different food rejects the match outright. Anything the vocabulary does
 *   not recognise is, by default, a reason to ask a human.
 *
 * That last clause is what keeps precision high: the matcher never assumes a
 * word it has not been taught is harmless. Adding vocabulary is how recall
 * improves, and every addition is reviewable in `matching-vocabulary.ts`.
 *
 * Price is deliberately absent. A cheaper product is not a likelier match, and
 * letting cost influence identity would quietly optimise the wrong thing.
 */

export type MatchMethod = 'MANUAL' | 'GTIN' | 'RULE' | 'NORMALIZED_NAME' | 'MODEL_SUGGESTION';

export type MatchStatus = 'AUTO_APPROVED' | 'NEEDS_REVIEW' | 'APPROVED' | 'REJECTED';

/**
 * Why the matcher decided what it did. Codes rather than prose so that a
 * reviewer can filter on them and a test can assert on them.
 */
export type MatchReason =
  | 'MANUAL_OVERRIDE'
  | 'EXACT_ALIAS'
  | 'NORMALIZED_EXACT_MATCH'
  | 'BRAND_PREFIX_REMOVED'
  | 'RETAIL_QUALIFIER_REMOVED'
  | 'PRESERVING_MODIFIER'
  | 'NEGATIVE_MODIFIER_FOUND'
  | 'AMBIGUOUS_COMPOUND_PRODUCT'
  | 'UNKNOWN_MODIFIER';

export interface ProductIngredientMatch {
  readonly productId: string;
  readonly canonicalIngredientId: IngredientId;
  /** Which variant of that ingredient, when the name identified one. */
  readonly variantId?: VariantId;
  /** Derived from the evidence tier, not a free-floating similarity score. */
  readonly confidence: number;
  readonly matchMethod: MatchMethod;
  readonly status: MatchStatus;
  /** Every code that applied, in the order it was established. */
  readonly reasons: readonly MatchReason[];
  /** One line a human can read without knowing the codes. */
  readonly rationale: string;
  /** The alias that matched, so a reviewer can see what was recognised. */
  readonly matchedPhrase: string;
  /** Words the matcher could not classify — the reason for any doubt. */
  readonly unexplainedWords: readonly string[];
}

export interface MatchCandidate {
  readonly productId: string;
  readonly productName: string;
}

export interface IngredientPhrases {
  readonly id: IngredientId;
  readonly phrases: readonly {
    readonly phrase: string;
    readonly type: AliasType;
    /**
     * Set when this phrase names a *variant* rather than the ingredient itself.
     *
     * "Fusilli" is how a shelf spells pasta, and without this the product never
     * reaches the ingredient at all: the catalogue names the shape and our
     * catalogue names the food. Carrying the variant id through the match is
     * what lets the compatibility layer decide afterwards whether a recipe
     * asking for generic pasta is allowed to have this one.
     */
    readonly variantId?: VariantId;
  }[];
}

/**
 * A decision a human made, which the matcher must never overrule.
 *
 * Keyed by product id so it survives re-imports: an approval given once stays
 * given, and a rejection stays rejected, however the automatic rules change.
 */
export interface ManualOverride {
  readonly productId: string;
  readonly canonicalIngredientId: IngredientId;
  readonly status: 'APPROVED' | 'REJECTED';
}

export function buildIngredientPhrases(
  ingredients: readonly CanonicalIngredient[],
  aliases: readonly { readonly ingredientId: IngredientId; readonly alias: string }[] = [],
  variants: readonly IngredientVariant[] = [],
): IngredientPhrases[] {
  const byId = new Map<
    IngredientId,
    { phrase: string; type: AliasType; variantId?: VariantId }[]
  >();

  for (const ingredient of ingredients) {
    byId.set(ingredient.id, [{ phrase: normalise(ingredient.canonicalName), type: 'CANONICAL' }]);
  }
  for (const alias of aliases) {
    byId.get(alias.ingredientId)?.push({ phrase: normalise(alias.alias), type: 'SYNONYM' });
  }
  for (const alias of INGREDIENT_ALIASES) {
    byId.get(alias.canonicalIngredientId)?.push({
      phrase: normalise(alias.phrase),
      type: alias.type,
    });
  }
  // Variant names are the shelf's vocabulary for an ingredient we already have.
  // They are added under the parent, tagged, so a match resolves to the food
  // and still remembers which form it was.
  for (const variant of variants) {
    byId.get(variant.parentId)?.push({
      phrase: normalise(variant.name),
      type: 'SYNONYM',
      variantId: variant.id,
    });
  }

  // Longest phrase first, so "rode ui" wins over "ui" and "zilvervliesrijst"
  // over "rijst". Specificity beats brevity, always.
  return [...byId.entries()].map(([id, phrases]) => {
    const seen = new Set<string>();
    const unique = phrases.filter(
      (p) => p.phrase !== '' && !seen.has(p.phrase) && seen.add(p.phrase),
    );
    return { id, phrases: unique.sort((a, b) => b.phrase.length - a.phrase.length) };
  });
}

export function matchProduct(
  candidate: MatchCandidate,
  ingredients: readonly IngredientPhrases[],
  overrides: readonly ManualOverride[] = [],
): ProductIngredientMatch | undefined {
  const name = normalise(candidate.productName);
  if (name === '') return undefined;

  // A human decision always wins, and is never re-litigated by a rule change.
  const override = overrides.find((o) => o.productId === candidate.productId);
  if (override) {
    return {
      productId: candidate.productId,
      canonicalIngredientId: override.canonicalIngredientId,
      confidence: 1,
      matchMethod: 'MANUAL',
      status: override.status === 'APPROVED' ? 'APPROVED' : 'REJECTED',
      reasons: ['MANUAL_OVERRIDE'],
      rationale: 'handmatig vastgesteld; automatische regels gelden hier niet',
      matchedPhrase: '',
      unexplainedWords: [],
    };
  }

  let best:
    { id: IngredientId; phrase: string; type: AliasType; variantId?: VariantId } | undefined;
  for (const ingredient of ingredients) {
    for (const entry of ingredient.phrases) {
      if (!containsWholePhrase(name, entry.phrase)) continue;
      if (!best || entry.phrase.length > best.phrase.length) {
        best = {
          id: ingredient.id,
          phrase: entry.phrase,
          type: entry.type,
          ...(entry.variantId ? { variantId: entry.variantId } : {}),
        };
      }
      break;
    }
  }
  if (!best) return undefined;

  const reasons: MatchReason[] = [
    best.type === 'CANONICAL' ? 'NORMALIZED_EXACT_MATCH' : 'EXACT_ALIAS',
  ];

  // Everything the product name says *beyond* the ingredient. A word only
  // counts against a match when it is extra: "sojasaus" contains "saus" and is
  // the ingredient, not a sauce poured over one.
  const leftover = removePhrase(name, best.phrase)
    .split(' ')
    .filter((word) => word !== '' && !isPackSizeToken(word));

  const disqualifier = leftover.find((word) => DISQUALIFYING_WORDS.has(word));
  if (disqualifier !== undefined) {
    return {
      productId: candidate.productId,
      canonicalIngredientId: best.id,
      confidence: 0.05,
      matchMethod: 'RULE',
      status: 'REJECTED',
      reasons: [...reasons, 'NEGATIVE_MODIFIER_FOUND'],
      rationale: `"${disqualifier}" maakt dit een ander product dan ${best.phrase}`,
      matchedPhrase: best.phrase,
      unexplainedWords: [disqualifier],
    };
  }

  // Words this particular ingredient tolerates, which others would not.
  const ingredientSafe = new Set(INGREDIENT_SAFE_WORDS[best.id] ?? []);
  const unexplained = leftover.filter(
    (word) => !isIgnorableWord(word) && !ingredientSafe.has(word),
  );
  if (leftover.some((word) => PRESERVING_WORDS.has(word))) reasons.push('PRESERVING_MODIFIER');
  if (leftover.some((word) => isIgnorableWord(word) && !PRESERVING_WORDS.has(word))) {
    reasons.push('BRAND_PREFIX_REMOVED');
  }

  if (unexplained.length === 0) {
    return {
      productId: candidate.productId,
      canonicalIngredientId: best.id,
      ...(best.variantId ? { variantId: best.variantId } : {}),
      confidence: 0.97,
      matchMethod: 'NORMALIZED_NAME',
      status: 'AUTO_APPROVED',
      rationale: `dit is ${best.phrase}; de rest van de naam is merk, verpakking of vorm`,
      reasons,
      matchedPhrase: best.phrase,
      unexplainedWords: [],
    };
  }

  return {
    productId: candidate.productId,
    canonicalIngredientId: best.id,
    ...(best.variantId ? { variantId: best.variantId } : {}),
    confidence: unexplained.length === 1 ? 0.6 : 0.35,
    matchMethod: 'NORMALIZED_NAME',
    status: 'NEEDS_REVIEW',
    reasons: [
      ...reasons,
      unexplained.length === 1 ? 'UNKNOWN_MODIFIER' : 'AMBIGUOUS_COMPOUND_PRODUCT',
    ],
    rationale: `naam bevat daarnaast "${unexplained.join(' ')}" — onbekend, dus niet automatisch goedgekeurd`,
    matchedPhrase: best.phrase,
    unexplainedWords: unexplained,
  };
}

/**
 * A bare number, or a number with a unit stuck to it: "500", "400g", "6x".
 *
 * Deliberately not "any number followed by any letters", which is what this
 * used to be. That swallowed "4m" — the age marker on infant food — so
 * "Olvarit Appel 4m+" read as a bag of apples with nothing unexplained about
 * it. A token whose suffix is not a unit is a word, and words get classified.
 */
function isPackSizeToken(word: string): boolean {
  return /^\d+(?:[.,]\d+)?(?:g|gr|kg|ml|cl|dl|l|st|stuk|stuks|x|pack|mm|cm|pers)?$/.test(word);
}

/** Lowercase, accent-free, punctuation-free, single-spaced. */
export function normalise(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Remove the matched phrase, including the plural form that actually matched,
 * so its own words never show up as leftovers.
 */
function removePhrase(haystack: string, phrase: string): string {
  for (const variant of [`${phrase}en`, `${phrase}s`, phrase]) {
    if (containsExactPhrase(haystack, variant)) {
      return haystack.split(variant).join(' ').replace(/\s+/g, ' ').trim();
    }
  }
  return haystack;
}

/**
 * Whole-word containment, tolerating the regular Dutch plural.
 *
 * Shops write "Elstar appels" and "Scharrel eieren"; the catalogue says "appel"
 * and "ei". Accepting a trailing "s" or "en" closes that gap without loosening
 * anything else — the word boundary is still required on both sides, so "ui"
 * still does not match "bruine".
 */
function containsWholePhrase(haystack: string, phrase: string): boolean {
  return (
    containsExactPhrase(haystack, phrase) ||
    containsExactPhrase(haystack, `${phrase}s`) ||
    containsExactPhrase(haystack, `${phrase}en`)
  );
}

function containsExactPhrase(haystack: string, phrase: string): boolean {
  if (phrase === '') return false;
  let from = 0;
  for (;;) {
    const at = haystack.indexOf(phrase, from);
    if (at === -1) return false;
    const before = at === 0 ? ' ' : haystack[at - 1]!;
    const afterIndex = at + phrase.length;
    const after = afterIndex >= haystack.length ? ' ' : haystack[afterIndex]!;
    if (before === ' ' && after === ' ') return true;
    from = at + 1;
  }
}
