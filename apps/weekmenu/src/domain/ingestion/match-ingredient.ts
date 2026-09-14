import type { CanonicalIngredient, IngredientId } from '../ingredients/types';

/**
 * Decide which canonical ingredient a supermarket product can stand in for.
 *
 * The governing rule is that a wrong match is worse than no match. A missing
 * product makes a week slightly more expensive or reports an item as
 * unavailable — both visible, both recoverable. A wrong one silently prices
 * "vanillekwark met suiker" as "magere kwark" and quietly changes what someone
 * eats. So everything here is built to refuse rather than to guess, and
 * anything it is not sure about goes to a human instead of into the optimizer.
 *
 * Three things decide the outcome:
 *
 *   the name must contain the ingredient as whole words — "kipfilet" matches
 *   "AH Scharrel kipfilet" but never "kipfiletreepjes shoarma", because the
 *   latter is a seasoned, prepared product and not a substitute for plain
 *   chicken breast;
 *
 *   a disqualifier removes the match entirely — soup, sauce and spice mixes
 *   are different foods that happen to share a word;
 *
 *   a modifier demotes it to review — flavoured, prepared or otherwise altered
 *   versions may or may not substitute, and that is a judgement call.
 */

export type MatchMethod = 'MANUAL' | 'GTIN' | 'RULE' | 'NORMALIZED_NAME' | 'MODEL_SUGGESTION';

export type MatchStatus = 'AUTO_APPROVED' | 'NEEDS_REVIEW' | 'APPROVED' | 'REJECTED';

export interface ProductIngredientMatch {
  readonly productId: string;
  readonly canonicalIngredientId: IngredientId;
  /** 0–1. Only a guide for review order; never a licence to skip review. */
  readonly confidence: number;
  readonly matchMethod: MatchMethod;
  readonly status: MatchStatus;
  /** Why it landed where it did, so a reviewer is not guessing. */
  readonly rationale: string;
}

/**
 * Words that make a product a different food, not a variant of one.
 *
 * "Tomatensoep" contains "tomaat" and is not a tomato. This list is the
 * difference between a canonical ingredient gathering its real products and it
 * gathering every item in the shop whose name happens to contain the word.
 */
const DISQUALIFIERS = [
  'soep',
  'saus',
  'sauce',
  'ketchup',
  'mayonaise',
  'dressing',
  'kruidenmix',
  'mix voor',
  'smaakmaker',
  'bouillon',
  'blokjes bouillon',
  'chips',
  'snack',
  'borrel',
  'koek',
  'taart',
  'ijs ',
  'milkshake',
  'limonade',
  'siroop',
  'likeur',
  'wijn',
  'bier',
  'voeding voor',
  'kattenvoer',
  'hondenvoer',
  'shampoo',
  'zeep',
  'wasmiddel',
  'reiniger',
];

/**
 * Retail noise that says nothing about what the food *is*.
 *
 * Nearly every product name starts with a chain or house brand and a quality
 * claim: "AH Terra Biologische tofu" is tofu. Judging how much of the name the
 * ingredient covers without discounting these would demote almost the entire
 * catalogue to manual review, because the shop's own branding is usually longer
 * than the ingredient it sells.
 */
const RETAIL_NOISE = new Set([
  'ah',
  'jumbo',
  'plus',
  'spar',
  'dirk',
  'coop',
  'aldi',
  'lidl',
  'vomar',
  'poiesz',
  'hoogvliet',
  'dekamarkt',
  'terra',
  'biologisch',
  'biologische',
  'bio',
  'scharrel',
  'verse',
  'vers',
  'excellent',
  'basic',
  'huismerk',
  'voordeel',
  'voordeelverpakking',
  'grootverpakking',
  'family',
  'pack',
  'stuks',
  'stuk',
  'gram',
  'kg',
  'g',
  'ml',
  'l',
  'naturel',
  'original',
  'nl',
  'per',
]);

/**
 * Words that change the product enough to need a human, not enough to reject.
 *
 * A marinated fillet really is chicken, and really is not interchangeable with
 * plain fillet in a recipe that seasons it itself.
 */
const NEEDS_JUDGEMENT = [
  'gekruid',
  'gemarineerd',
  'gemarineerde',
  'shoarma',
  'kerrie',
  'pikant',
  'gerookt',
  'gerookte',
  'gebakken',
  'gegrild',
  'gegrilde',
  'bereid',
  'gevuld',
  'gevulde',
  'vanille',
  'aardbei',
  'banaan',
  'chocolade',
  'honing',
  'zoet',
  'gezoet',
  'light',
  'mager',
  'vol',
  'halfvol',
  'diepvries',
  'ingevroren',
  'blik',
  'pot',
  'gedroogd',
  'gedroogde',
  'geconcentreerd',
  'poeder',
  'siroop',
];

export interface MatchCandidate {
  readonly productId: string;
  readonly productName: string;
}

/** A canonical ingredient plus every name it is known by. */
export interface IngredientPhrases {
  readonly id: IngredientId;
  readonly phrases: readonly string[];
}

export function buildIngredientPhrases(
  ingredients: readonly CanonicalIngredient[],
  aliases: readonly { readonly ingredientId: IngredientId; readonly alias: string }[] = [],
): IngredientPhrases[] {
  const byId = new Map<IngredientId, string[]>();
  for (const ingredient of ingredients) {
    byId.set(ingredient.id, [normalise(ingredient.canonicalName)]);
  }
  for (const alias of aliases) {
    const list = byId.get(alias.ingredientId);
    if (list) list.push(normalise(alias.alias));
  }
  // Longest first: "rode ui" must win over "ui" on "AH Rode ui".
  return [...byId.entries()].map(([id, phrases]) => ({
    id,
    phrases: [...new Set(phrases)].sort((a, b) => b.length - a.length),
  }));
}

export function matchProduct(
  candidate: MatchCandidate,
  ingredients: readonly IngredientPhrases[],
): ProductIngredientMatch | undefined {
  const name = normalise(candidate.productName);
  if (name === '') return undefined;

  let best: { id: IngredientId; phrase: string } | undefined;
  for (const ingredient of ingredients) {
    for (const phrase of ingredient.phrases) {
      if (!containsWholePhrase(name, phrase)) continue;
      if (!best || phrase.length > best.phrase.length) best = { id: ingredient.id, phrase };
      break;
    }
  }
  if (!best) return undefined;

  // A word only disqualifies when it is *extra*. "Sojasaus" contains "saus" and
  // is not a sauce someone poured over the ingredient — it is the ingredient.
  // Likewise "gerookte zalm" is demoted by "gerookt" only if you forget that
  // the canonical ingredient is itself smoked salmon. So every check below
  // looks at what the product name says *beyond* the matched phrase.
  const remainder = name.split(best.phrase).join(' ').replace(/\s+/g, ' ').trim();

  const disqualifier = DISQUALIFIERS.find((word) => remainder.includes(word));
  if (disqualifier !== undefined) {
    return {
      productId: candidate.productId,
      canonicalIngredientId: best.id,
      confidence: 0.1,
      matchMethod: 'RULE',
      status: 'REJECTED',
      rationale: `naam bevat "${disqualifier}": een ander product, geen variant`,
    };
  }

  const modifier = NEEDS_JUDGEMENT.find((word) => containsWholePhrase(remainder, word));

  // How much of the product the ingredient accounts for, counting only words
  // that describe the food. "AH Terra Biologische tofu" is entirely tofu once
  // the shop's branding is set aside; "AH Kipfilet kerriesalade met rozijnen"
  // is not mostly chicken breast however you count, and that is the signal.
  const meaningful = remainder
    .split(' ')
    .filter((word) => word !== '' && !RETAIL_NOISE.has(word) && !/^\d+$/.test(word));
  const phraseWords = best.phrase.split(' ').length;
  const coverage = phraseWords / (phraseWords + meaningful.length);

  if (modifier !== undefined) {
    return {
      productId: candidate.productId,
      canonicalIngredientId: best.id,
      confidence: Math.min(0.6, 0.3 + coverage / 2),
      matchMethod: 'NORMALIZED_NAME',
      status: 'NEEDS_REVIEW',
      rationale: `"${modifier}" maakt dit mogelijk een ander product dan het basisingredient`,
    };
  }

  // Auto-approve only when nothing meaningful is left over.
  //
  // Anything weaker lets a different food through on a shared word, and the
  // first real week proved it: "knoflook croutons" became garlic, "roomboter
  // custardcakes" became butter, and "truffelsalami met parmezaanse kaas"
  // became cheese. Each of those is one extra word away from the ingredient and
  // none of them is a substitute for it. A missing product costs a little money
  // and says so; a wrong one quietly changes what someone eats.
  if (meaningful.length === 0) {
    return {
      productId: candidate.productId,
      canonicalIngredientId: best.id,
      confidence: 0.95,
      matchMethod: 'NORMALIZED_NAME',
      status: 'AUTO_APPROVED',
      rationale: `productnaam is precies dit ingredient, afgezien van merk- en maataanduiding`,
    };
  }

  return {
    productId: candidate.productId,
    canonicalIngredientId: best.id,
    confidence: Math.max(0.2, Math.min(0.6, coverage)),
    matchMethod: 'NORMALIZED_NAME',
    status: 'NEEDS_REVIEW',
    rationale: `naam bevat daarnaast "${meaningful.join(' ')}" — mogelijk een ander product`,
  };
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
 * Whole-word containment, tolerating the regular Dutch plural.
 *
 * Shops write "Elstar appels" and "Scharrel eieren"; the catalogue calls them
 * "appel" and "ei". Accepting a trailing "s" or "en" closes that gap without
 * opening the door to loose matching — "ui" still must not match "bruin",
 * because the word boundary is still required on both sides.
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
