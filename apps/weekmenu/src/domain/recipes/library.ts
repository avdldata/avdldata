import type { IngredientIndex } from '../ingredients/types';
import type { Cuisine, PrimaryProtein, Recipe, RecipeTag } from './types';

/**
 * What a recipe library looks like from a distance.
 *
 * Sprint 2 grows the dinner library, and "grew it" is a claim that needs a
 * number behind it. Everything here is derived from the recipes themselves —
 * canonical ingredient ids, grams per serving, the declared cuisine and
 * protein — so the report cannot drift from the data the planner actually uses,
 * and nothing in it is a judgement call made at authoring time.
 *
 * Two rules the module keeps to:
 *  - the primary carbohydrate is whichever carbohydrate family contributes the
 *    most grams per serving, not whichever tag someone remembered to add;
 *  - a dish with no carbohydrate above the floor is `geen`, which is a real
 *    answer (a salad, a soup) and not a gap in the data.
 */

/** Carbohydrate families, keyed by canonical ingredient id. */
export const CARB_FAMILIES = {
  pasta: [
    'spaghetti',
    'penne',
    'macaroni',
    'lasagnebladen',
    'pasta',
    'fusilli',
    'tagliatelle',
    'rigatoni',
    'farfalle',
    'orzo',
  ],
  rijst: [
    'witte-rijst',
    'basmatirijst',
    'zilvervliesrijst',
    'rijst',
    'risottorijst',
    'pandanrijst',
  ],
  aardappel: ['aardappel', 'zoete-aardappel', 'krieltjes', 'aardappelpartjes'],
  noedels: ['mie'],
  wraps: ['wraps', 'maistortilla'],
  brood: ['pitabrood', 'stokbrood'],
  granen: ['couscous', 'bulgur', 'quinoa'],
  peulvruchten: ['kikkererwten', 'kidneybonen', 'bruine-bonen', 'zwarte-bonen', 'linzen'],
} as const satisfies Record<string, readonly string[]>;

export type CarbFamily = keyof typeof CARB_FAMILIES | 'geen';

const CARB_BY_INGREDIENT = new Map<string, CarbFamily>();
for (const [family, ids] of Object.entries(CARB_FAMILIES)) {
  for (const id of ids) CARB_BY_INGREDIENT.set(id, family as CarbFamily);
}

/**
 * Below this many grams per serving a starch is a garnish, not the base of the
 * dish: a tablespoon of couscous scattered over a salad does not make it a
 * couscous dinner.
 */
export const CARB_FLOOR_GRAMS_PER_SERVING = 25;

/** Grams of an ingredient in one serving, pieces converted via piece weight. */
export function gramsPerServing(
  line: { readonly ingredientId: string; readonly perServing: { amount: number; unit: string } },
  ingredients: IngredientIndex,
): number {
  if (line.perServing.unit !== 'piece') return line.perServing.amount;
  const ingredient = ingredients.get(line.ingredientId);
  return line.perServing.amount * (ingredient?.pieceWeightGrams ?? 0);
}

export function primaryCarbOf(recipe: Recipe, ingredients: IngredientIndex): CarbFamily {
  const totals = new Map<CarbFamily, number>();
  for (const line of recipe.ingredients) {
    if (line.optional) continue;
    const family = CARB_BY_INGREDIENT.get(line.ingredientId);
    if (!family) continue;
    totals.set(family, (totals.get(family) ?? 0) + gramsPerServing(line, ingredients));
  }
  let best: CarbFamily = 'geen';
  let bestGrams = CARB_FLOOR_GRAMS_PER_SERVING;
  // Ties resolve by family name so the answer is stable across runs.
  for (const family of [...totals.keys()].sort()) {
    const grams = totals.get(family)!;
    if (grams > bestGrams) {
      best = family;
      bestGrams = grams;
    }
  }
  return best;
}

/**
 * How the dish is cooked.
 *
 * Derived from the recipe's own tags first, and only then from words in its
 * title and steps — our own Dutch text, written here, so the keyword table is
 * matching language we control rather than guessing at someone else's corpus.
 */
export const COOKING_METHODS = [
  'soep',
  'salade',
  'curry',
  'ovenschotel',
  'stoof',
  'wok',
  'pasta-koken',
  'bakken',
  'overig',
] as const;
export type CookingMethod = (typeof COOKING_METHODS)[number];

const METHOD_FROM_TAG: Partial<Record<RecipeTag, CookingMethod>> = {
  soep: 'soep',
  salade: 'salade',
  ovenschotel: 'ovenschotel',
};

/*
 * "Bouillon" used to live in the soup pattern and made hachee — a two-hour beef
 * stew — read as a soup, which then collided with hutspot in the duplicate
 * check. Stock goes into stews, curries and risottos just as readily, so it is
 * no evidence at all; a soup says so in its name or carries the tag.
 */
const METHOD_KEYWORDS: readonly (readonly [RegExp, CookingMethod])[] = [
  [/\bsoep\w*/i, 'soep'],
  [/\b(salade|sla)\b/i, 'salade'],
  [/\b(curry|masala|tikka|korma|rendang)\w*/i, 'curry'],
  [/\b(ovenschotel|uit de oven|geroosterd\w*|gratin|traybake|lasagne)\b/i, 'ovenschotel'],
  [/\b(stoof|stoven|gestoofd\w*|sudder\w*|pruttel\w*|hachee|goulash|tajine)\b/i, 'stoof'],
  [/\b(wok|roerbak\w*|nasi|bami)\b/i, 'wok'],
  [/\b(pasta|spaghetti|penne|macaroni|tagliatelle|fusilli|orzo)\w*/i, 'pasta-koken'],
  [/\b(bak|bakken|gebakken|grill\w*|braad\w*)\b/i, 'bakken'],
];

export function cookingMethodOf(recipe: Recipe): CookingMethod {
  for (const tag of recipe.tags) {
    const method = METHOD_FROM_TAG[tag];
    if (method) return method;
  }
  // The ingredient ids join the haystack because a title can hide the method:
  // "Romige kippasta" contains no standalone word "pasta", and a dish whose
  // method the duplicate check cannot read ends up in a partition of its own.
  const haystack = [
    recipe.name,
    recipe.description,
    recipe.steps.join(' '),
    recipe.ingredients.map((line) => line.ingredientId).join(' '),
  ].join(' ');
  for (const [pattern, method] of METHOD_KEYWORDS) if (pattern.test(haystack)) return method;
  return 'overig';
}

/**
 * The meal styles the brief asks the library to spread across.
 *
 * A recipe can carry several: a chickpea traybake is both `ovenschotel` and
 * `peulvruchten`. Counting them as a set is the point — the question is whether
 * every style is represented, not which single bucket a dish belongs in.
 */
export const MEAL_STYLES = [
  'aardappel',
  'pasta',
  'rijst',
  'noedels',
  'wraps',
  'wok',
  'curry',
  'ovenschotel',
  'stoof',
  'soep',
  'salade',
  'peulvruchten',
  'vegetarisch',
  'vis',
  'kip',
  'vlees',
] as const;
export type MealStyle = (typeof MEAL_STYLES)[number];

export function mealStylesOf(recipe: Recipe, ingredients: IngredientIndex): Set<MealStyle> {
  const styles = new Set<MealStyle>();
  const carb = primaryCarbOf(recipe, ingredients);
  if (carb === 'aardappel') styles.add('aardappel');
  if (carb === 'pasta') styles.add('pasta');
  if (carb === 'rijst') styles.add('rijst');
  if (carb === 'noedels') styles.add('noedels');
  if (carb === 'wraps') styles.add('wraps');
  if (carb === 'peulvruchten') styles.add('peulvruchten');

  const method = cookingMethodOf(recipe);
  if (method === 'wok') styles.add('wok');
  if (method === 'curry') styles.add('curry');
  if (method === 'ovenschotel') styles.add('ovenschotel');
  if (method === 'stoof') styles.add('stoof');
  if (method === 'soep') styles.add('soep');
  if (method === 'salade') styles.add('salade');

  // Legumes count as a style wherever they carry the dish, not only when they
  // are the starch: a chili on rice is still a legume dinner.
  if (recipe.primaryProtein === 'peulvrucht') styles.add('peulvruchten');
  if (recipe.vegetarian) styles.add('vegetarisch');
  if (recipe.primaryProtein === 'vis') styles.add('vis');
  if (recipe.primaryProtein === 'kip') styles.add('kip');
  if (recipe.primaryProtein === 'rund' || recipe.primaryProtein === 'varken') styles.add('vlees');
  return styles;
}

/** Title words that carry no distinguishing information when comparing titles. */
const TITLE_STOPWORDS = new Set([
  'met',
  'en',
  'uit',
  'de',
  'het',
  'een',
  'van',
  'in',
  'op',
  'romige',
  'romig',
  'snelle',
  'snel',
  'stevige',
  'makkelijke',
  'oven',
]);

export function titleTokens(title: string): Set<string> {
  return new Set(
    title
      .toLowerCase()
      .replace(/[^a-zà-ÿ0-9\s-]/g, ' ')
      .split(/[\s-]+/)
      .filter((word) => word.length > 2 && !TITLE_STOPWORDS.has(word)),
  );
}

export function jaccard(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const value of a) if (b.has(value)) shared += 1;
  return shared / (a.size + b.size - shared);
}

export interface ProductionRecipeSignature {
  readonly id: string;
  readonly protein: PrimaryProtein;
  readonly carb: CarbFamily;
  readonly method: CookingMethod;
  readonly cuisine: Cuisine;
  /** Non-optional canonical ingredient ids, sorted. */
  readonly core: readonly string[];
  readonly title: ReadonlySet<string>;
  readonly key: string;
}

export function signatureOfRecipe(
  recipe: Recipe,
  ingredients: IngredientIndex,
): ProductionRecipeSignature {
  const protein = recipe.primaryProtein;
  const carb = primaryCarbOf(recipe, ingredients);
  const method = cookingMethodOf(recipe);
  const core = recipe.ingredients
    .filter((line) => !line.optional && !ingredients.get(line.ingredientId)?.pantryStaple)
    .map((line) => line.ingredientId)
    .sort();
  return {
    id: recipe.id,
    protein,
    carb,
    method,
    cuisine: recipe.cuisine,
    core: [...new Set(core)],
    title: titleTokens(recipe.name),
    key: `${protein}|${carb}|${method}|${recipe.cuisine}`,
  };
}

export function ingredientOverlap(a: readonly string[], b: readonly string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const set = new Set(a);
  const shared = b.filter((id) => set.has(id)).length;
  return shared / Math.min(a.length, b.length);
}

export interface DuplicatePair {
  readonly a: string;
  readonly b: string;
  readonly key: string;
  readonly ingredientOverlap: number;
  readonly titleSimilarity: number;
  readonly reason: 'INGREDIENT_OVERLAP' | 'TITLE_SIMILARITY';
}

/** Two recipes the same key and three quarters of their ingredients apart. */
export const DUPLICATE_OVERLAP = 0.75;
/** Or the same key and near-identical titles, which catches a renamed copy. */
export const DUPLICATE_TITLE_SIMILARITY = 0.8;

/**
 * Near-duplicates inside a production library.
 *
 * The same two-part test the candidate pipeline uses: the coarse signature
 * partitions, and the ingredient set decides. Either half alone is wrong —
 * the signature would merge every Italian chicken pasta, and the overlap alone
 * would merge a soup with the stew that shares its vegetables.
 */
export function findDuplicatePairs(
  recipes: readonly Recipe[],
  ingredients: IngredientIndex,
): DuplicatePair[] {
  const signatures = recipes.map((recipe) => signatureOfRecipe(recipe, ingredients));
  const byKey = new Map<string, ProductionRecipeSignature[]>();
  for (const signature of signatures) {
    const list = byKey.get(signature.key);
    if (list) list.push(signature);
    else byKey.set(signature.key, [signature]);
  }

  const pairs: DuplicatePair[] = [];
  for (const group of byKey.values()) {
    for (let i = 0; i < group.length; i += 1) {
      for (let j = i + 1; j < group.length; j += 1) {
        const a = group[i]!;
        const b = group[j]!;
        const overlap = ingredientOverlap(a.core, b.core);
        const similarity = jaccard(a.title, b.title);
        if (overlap >= DUPLICATE_OVERLAP) {
          pairs.push({
            a: a.id,
            b: b.id,
            key: a.key,
            ingredientOverlap: overlap,
            titleSimilarity: similarity,
            reason: 'INGREDIENT_OVERLAP',
          });
        } else if (similarity >= DUPLICATE_TITLE_SIMILARITY) {
          pairs.push({
            a: a.id,
            b: b.id,
            key: a.key,
            ingredientOverlap: overlap,
            titleSimilarity: similarity,
            reason: 'TITLE_SIMILARITY',
          });
        }
      }
    }
  }
  return pairs.sort((x, y) => (x.a === y.a ? x.b.localeCompare(y.b) : x.a.localeCompare(y.a)));
}

export interface LibraryProfile {
  readonly total: number;
  readonly uniqueAfterDedupe: number;
  readonly duplicatePairs: readonly DuplicatePair[];
  readonly cuisines: ReadonlyMap<Cuisine, number>;
  readonly mealStyles: ReadonlyMap<MealStyle, number>;
  readonly methods: ReadonlyMap<CookingMethod, number>;
  readonly primaryCarbs: ReadonlyMap<CarbFamily, number>;
  readonly proteins: ReadonlyMap<PrimaryProtein, number>;
  readonly vegetarian: number;
  readonly vegan: number;
  readonly fish: number;
  readonly chicken: number;
  readonly beefPork: number;
  readonly avgIngredientCount: number;
  readonly avgPrepMinutes: number;
  readonly avgCookMinutes: number;
  readonly avgTotalMinutes: number;
  readonly avgKcal: number;
  readonly canonicalIngredientsUsed: readonly string[];
  readonly canonicalIngredientsUnused: readonly string[];
  readonly licences: ReadonlyMap<string, number>;
}

function tally<T>(values: Iterable<T>): Map<T, number> {
  const counts = new Map<T, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return counts;
}

function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function profileLibrary(
  recipes: readonly Recipe[],
  ingredients: IngredientIndex,
): LibraryProfile {
  const duplicatePairs = findDuplicatePairs(recipes, ingredients);
  // A recipe that duplicates something already counted is not a new dinner.
  // Only the second of each pair is removed, so a cluster of three collapses to
  // one rather than to zero.
  const removed = new Set<string>();
  for (const pair of duplicatePairs) {
    if (!removed.has(pair.a)) removed.add(pair.b);
  }

  const styleCounts = new Map<MealStyle, number>();
  for (const recipe of recipes) {
    for (const style of mealStylesOf(recipe, ingredients)) {
      styleCounts.set(style, (styleCounts.get(style) ?? 0) + 1);
    }
  }

  const used = new Set<string>();
  for (const recipe of recipes) for (const line of recipe.ingredients) used.add(line.ingredientId);
  const unused = [...ingredients.keys()].filter((id) => !used.has(id)).sort();

  return {
    total: recipes.length,
    uniqueAfterDedupe: recipes.length - removed.size,
    duplicatePairs,
    cuisines: tally(recipes.map((r) => r.cuisine)),
    mealStyles: styleCounts,
    methods: tally(recipes.map((r) => cookingMethodOf(r))),
    primaryCarbs: tally(recipes.map((r) => primaryCarbOf(r, ingredients))),
    proteins: tally(recipes.map((r) => r.primaryProtein)),
    vegetarian: recipes.filter((r) => r.vegetarian).length,
    vegan: recipes.filter((r) => r.vegan).length,
    fish: recipes.filter((r) => r.primaryProtein === 'vis').length,
    chicken: recipes.filter((r) => r.primaryProtein === 'kip').length,
    beefPork: recipes.filter((r) => r.primaryProtein === 'rund' || r.primaryProtein === 'varken')
      .length,
    avgIngredientCount: mean(recipes.map((r) => r.ingredients.length)),
    avgPrepMinutes: mean(recipes.map((r) => r.prepMinutes)),
    avgCookMinutes: mean(recipes.map((r) => r.cookMinutes)),
    avgTotalMinutes: mean(recipes.map((r) => r.totalMinutes)),
    avgKcal: mean(recipes.map((r) => r.nutritionPerServing.kcal)),
    canonicalIngredientsUsed: [...used].sort(),
    canonicalIngredientsUnused: unused,
    licences: tally(recipes.map((r) => r.provenance.licence as string)),
  };
}

/**
 * The diversity gate.
 *
 * A library that is 40 % pasta is not a library of 120 dinners, it is a pasta
 * library with extras. These thresholds come straight from the brief and are
 * checked as warnings on the profile rather than as assertions at authoring
 * time, so the report says exactly how far off it is.
 */
export const MAX_SHARE_ONE_CARB = 0.25;
export const MAX_SHARE_ONE_CUISINE = 0.3;
export const MAX_SHARE_ONE_PROTEIN = 0.3;
/** Every meal style must appear at least this often to count as represented. */
export const MIN_PER_MEAL_STYLE = 4;

export interface DiversityWarning {
  readonly kind: 'CARB_SHARE' | 'CUISINE_SHARE' | 'PROTEIN_SHARE' | 'STYLE_MISSING';
  readonly label: string;
  readonly count: number;
  readonly share: number;
  readonly limit: number;
}

export function checkDiversity(profile: LibraryProfile): DiversityWarning[] {
  const warnings: DiversityWarning[] = [];
  const total = profile.total;
  if (total === 0) return warnings;

  for (const [carb, count] of [...profile.primaryCarbs].sort()) {
    if (carb === 'geen') continue;
    if (count / total > MAX_SHARE_ONE_CARB) {
      warnings.push({
        kind: 'CARB_SHARE',
        label: carb,
        count,
        share: count / total,
        limit: MAX_SHARE_ONE_CARB,
      });
    }
  }
  for (const [cuisine, count] of [...profile.cuisines].sort()) {
    if (count / total > MAX_SHARE_ONE_CUISINE) {
      warnings.push({
        kind: 'CUISINE_SHARE',
        label: cuisine,
        count,
        share: count / total,
        limit: MAX_SHARE_ONE_CUISINE,
      });
    }
  }
  for (const [protein, count] of [...profile.proteins].sort()) {
    if (protein === 'geen') continue;
    if (count / total > MAX_SHARE_ONE_PROTEIN) {
      warnings.push({
        kind: 'PROTEIN_SHARE',
        label: protein,
        count,
        share: count / total,
        limit: MAX_SHARE_ONE_PROTEIN,
      });
    }
  }
  for (const style of MEAL_STYLES) {
    const count = profile.mealStyles.get(style) ?? 0;
    if (count < MIN_PER_MEAL_STYLE) {
      warnings.push({
        kind: 'STYLE_MISSING',
        label: style,
        count,
        share: count / total,
        limit: MIN_PER_MEAL_STYLE,
      });
    }
  }
  return warnings;
}
