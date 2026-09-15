import type { ExternalRecipeCandidate } from './candidate-types';
import { matchCanonicalIngredient } from './canonical-matching';

/**
 * "Chicken Pasta", "Creamy Chicken Pasta", "Easy Creamy Chicken Pasta".
 *
 * Three corpora scraped from the open web contain a great many recipes that are
 * the same dinner wearing a different adjective. A library full of those looks
 * large and behaves small: the optimizer sees seven options and can only ever
 * cook one dish.
 *
 * The signature below is what makes two recipes "the same" here: the same
 * protein, the same carbohydrate, the same method and the same core ingredient
 * set. Title similarity is the tie-breaker rather than the test, because titles
 * are marketing and ingredients are the dish.
 */

/*
 * Plurals are matched explicitly: a corpus writes "potatoes" and "tomatoes",
 * and `\bpotato\b` does not match either. The same omission in the dinner
 * classifier was under-counting carbohydrates across the whole census.
 */
const PROTEINS: readonly [RegExp, string][] = [
  [/\b(chicken|kip)(?:e?s)?\b/i, 'chicken'],
  [/\b(beef|rund|steak)(?:e?s)?\b/i, 'beef'],
  [/\b(pork|varken|bacon|spek|ham)(?:e?s)?\b/i, 'pork'],
  [/\b(lamb|lam)(?:e?s)?\b/i, 'lamb'],
  // Veal belongs here and was missing. Without it a veal dish fell through to
  // whatever incidental legume or egg it happened to contain, so two copies of
  // the same recipe were keyed `legume|pasta` and `egg|pasta` — different
  // partitions, never compared, both kept. Order matters for the same reason:
  // the meats are listed before legume and egg so a garnish cannot outrank the
  // thing the dish is made of.
  [/\b(veal|kalf|kalv)(?:e?s)?\b/i, 'veal'],
  [/\b(turkey|kalkoen|duck|eend)(?:e?s)?\b/i, 'poultry-other'],
  [/\b(salmon|zalm|cod|kabeljauw|tuna|tonijn|fish|vis|shrimp|prawn|garna)(?:e?s)?\b/i, 'fish'],
  [/\b(tofu|tempeh|seitan|paneer|halloumi)(?:e?s)?\b/i, 'vega-protein'],
  [/\b(lentil|linze|chickpea|kikkererwt|bean|boon|bonen)(?:e?s)?\b/i, 'legume'],
  [/\b(egg|eieren)(?:e?s)?\b/i, 'egg'],
];

const CARBS: readonly [RegExp, string][] = [
  [
    /\b(pasta|spaghetti|penne|macaroni|lasagne|lasagna|tagliatelle|fusilli|noodle|mie)(?:e?s)?\b/i,
    'pasta',
  ],
  [/\b(rice|rijst|risotto|paella|biryani)(?:e?s)?\b/i, 'rice'],
  [/\b(potato|aardappel|krieltje|fries|friet)(?:e?s)?\b/i, 'potato'],
  [/\b(tortilla|wrap|taco|burrito|fajita)(?:e?s)?\b/i, 'wrap'],
  [/\b(bread|brood|pita|naan|baguette)(?:e?s)?\b/i, 'bread'],
  [/\b(couscous|bulgur|quinoa|polenta|barley|gerst)(?:e?s)?\b/i, 'grain-other'],
];

const METHODS: readonly [RegExp, string][] = [
  [/\b(curry|tikka|masala|korma|rendang)\b/i, 'curry'],
  [/\b(soup|soep|chowder|bisque|broth)\b/i, 'soup'],
  [/\b(stew|stoof|braise|casserole|goulash|tagine|hotpot|hachee)\b/i, 'stew'],
  [/\b(roast|traybake|oven|bake|baked|gratin|ovenschotel)\b/i, 'oven'],
  [/\b(stir[- ]?fry|wok|roerbak|nasi|bami)\b/i, 'wok'],
  [/\b(grill|barbecue|bbq|skewer|kebab)\b/i, 'grill'],
  [/\b(salad|salade|bowl)\b/i, 'salad'],
  [/\b(fried|fry|pan[- ]?fried|schnitzel|katsu)\b/i, 'fry'],
];

function firstMatch(text: string, table: readonly [RegExp, string][]): string {
  for (const [pattern, label] of table) if (pattern.test(text)) return label;
  return 'none';
}

export interface RecipeSignature {
  readonly protein: string;
  readonly carb: string;
  readonly method: string;
  readonly cuisine: string;
  /** Canonical ingredient ids, sorted. The dish itself. */
  readonly core: readonly string[];
  readonly key: string;
}

export function signatureOf(candidate: ExternalRecipeCandidate): RecipeSignature {
  const names = candidate.ingredients.map((i) => i.rawName ?? i.rawText).join(' ');
  const haystack = `${candidate.title} ${names} ${candidate.tags.join(' ')}`;
  const core = [
    ...new Set(
      candidate.ingredients
        .map((i) => matchCanonicalIngredient(i.rawName ?? i.rawText))
        .filter((m) => m.ingredientId !== undefined)
        .map((m) => m.ingredientId!),
    ),
  ].sort();

  const protein = firstMatch(haystack, PROTEINS);
  const carb = firstMatch(haystack, CARBS);
  const method = firstMatch(`${candidate.title} ${candidate.tags.join(' ')}`, METHODS);
  const cuisine = (candidate.cuisine ?? 'onbekend').toLowerCase();
  return {
    protein,
    carb,
    method,
    cuisine,
    core,
    key: `${protein}|${carb}|${method}|${cuisine}`,
  };
}

/** Share of the smaller ingredient set that the two have in common. */
export function overlap(a: readonly string[], b: readonly string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const set = new Set(a);
  const shared = b.filter((id) => set.has(id)).length;
  return shared / Math.min(a.length, b.length);
}

export interface Cluster<T> {
  readonly best: T;
  readonly duplicates: readonly T[];
}

/**
 * Group near-identical recipes and keep the best of each.
 *
 * Two recipes collide when they share protein, carbohydrate, method and cuisine
 * **and** three quarters of their canonical ingredients. Both halves are
 * needed: the signature alone would merge every Italian chicken pasta, and the
 * overlap alone would merge a soup with a stew that happen to share vegetables.
 *
 * `rank` decides which survives, so the caller's scoring is what picks the
 * representative — deduplication does not get an opinion about quality.
 */
export function clusterDuplicates<T>(
  items: readonly T[],
  signature: (item: T) => RecipeSignature,
  rank: (item: T) => number,
  minimumOverlap = 0.75,
): Cluster<T>[] {
  const byKey = new Map<string, T[]>();
  for (const item of items) {
    const key = signature(item).key;
    const list = byKey.get(key);
    if (list) list.push(item);
    else byKey.set(key, [item]);
  }

  const clusters: Cluster<T>[] = [];
  for (const group of byKey.values()) {
    const sorted = [...group].sort((a, b) => rank(b) - rank(a));
    const taken = new Set<number>();
    for (let i = 0; i < sorted.length; i += 1) {
      if (taken.has(i)) continue;
      const best = sorted[i]!;
      const duplicates: T[] = [];
      for (let j = i + 1; j < sorted.length; j += 1) {
        if (taken.has(j)) continue;
        if (overlap(signature(best).core, signature(sorted[j]!).core) >= minimumOverlap) {
          duplicates.push(sorted[j]!);
          taken.add(j);
        }
      }
      clusters.push({ best, duplicates });
    }
  }
  return clusters;
}
