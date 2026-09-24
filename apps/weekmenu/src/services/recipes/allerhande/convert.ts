import type { IngredientIndex } from '@/domain/ingredients/types';
import {
  CUISINES,
  RECIPE_TAGS,
  type AuthoredRecipe,
  type AuthoredRecipeIngredient,
  type Cuisine,
  type NutritionPerServing,
  type PrimaryProtein,
  type Recipe,
  type RecipeTag,
} from '@/domain/recipes/types';
import { normaliseRecipes } from '@/domain/recipes/normalise';
import { validateRecipe } from '@/domain/recipes/validation';
import { matchCanonicalIngredient, type MatchKind } from '../canonical-matching';
import { parseIngredientLine } from '../ingredient-line';
import { normaliseAmount } from '../units';
import type { StoredAllerhandeRecipe } from './crawl';
import type { JsonObject } from './jsonld';

/**
 * An Allerhande recipe → a recipe the planner can use, or an honest "no".
 *
 * The bar is the same one every recipe in the library clears, and it is high
 * on purpose. Allergens, vegetarian, vegan and pregnancy suitability are all
 * *derived* from the canonical ingredients — so a line we cannot map with
 * confidence is not a detail to skip, it is a place an allergen could hide.
 * Such a recipe is refused and the refusal says which line, so the report can
 * tell the owner which ingredients to add to the catalogue next.
 *
 * What is never done:
 *   - guessing an ingredient: an unmatched or ambiguous line refuses the recipe;
 *   - guessing an amount: "1 blik" without a stated size refuses the recipe,
 *     "1 blik tomatenblokjes (400 g)" is 400 g, because that is arithmetic;
 *   - linking to a product or brand: "AH" and friends are stripped, and the
 *     line lands on a canonical ingredient like every other recipe line;
 *   - labelling a kitchen we do not know: that is `internationaal`, which the
 *     filter treats as possibly-any-kitchen.
 *
 * The source's own kcal per serving is kept as a cross-check: when the app's
 * own figure differs by more than `KCAL_TOLERANCE`, an amount was almost
 * certainly misread and the recipe is refused rather than planned.
 */

export const KCAL_TOLERANCE = 0.35;

export type RejectionCode =
  | 'NOT_A_DINNER'
  | 'NO_SERVINGS'
  | 'NO_TIME'
  | 'NO_STEPS'
  | 'UNMATCHED_INGREDIENT'
  | 'AMBIGUOUS_INGREDIENT'
  | 'AMOUNT_UNKNOWN'
  | 'NORMALISATION'
  | 'KCAL_MISMATCH'
  | 'VALIDATION';

export interface Rejection {
  readonly code: RejectionCode;
  readonly detail: string;
  /** For unmatched lines: the concept we would need in the catalogue. */
  readonly concept?: string;
}

export type Conversion =
  | { readonly ok: true; readonly authored: AuthoredRecipe; readonly recipe: Recipe }
  | { readonly ok: false; readonly recipeId: string; readonly rejections: readonly Rejection[] };

// ---- reading the schema.org fields ------------------------------------------

function text(value: unknown): string {
  if (typeof value === 'string') return decode(value).trim();
  if (typeof value === 'number') return String(value);
  return '';
}

function decode(value: string): string {
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ');
}

/** ISO 8601 duration → minutes: PT20M, PT1H30M, P0DT0H45M. */
export function isoMinutes(value: unknown): number | undefined {
  const match = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:\d+S)?)?$/i.exec(text(value));
  if (!match) return undefined;
  const minutes = Number(match[1] ?? 0) * 1440 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0);
  return minutes > 0 ? minutes : undefined;
}

function servingsOf(value: unknown): number | undefined {
  const candidates = Array.isArray(value) ? value : [value];
  for (const candidate of candidates) {
    const match = /(\d+)/.exec(text(candidate));
    if (match && Number(match[1]) > 0) return Number(match[1]);
  }
  return undefined;
}

function stepsOf(value: unknown): string[] {
  if (typeof value === 'string') {
    return decode(value)
      .split(/\n+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): string[] => {
    if (typeof item === 'string') return [decode(item).trim()].filter(Boolean);
    if (!item || typeof item !== 'object') return [];
    const node = item as JsonObject;
    if (node['@type'] === 'HowToSection') return stepsOf(node['itemListElement']);
    const step = text(node['text']);
    return step ? [step] : [];
  });
}

function keywordsOf(value: unknown): string[] {
  const list = Array.isArray(value) ? value.map(text) : text(value).split(',');
  return list.map((k) => k.trim().toLowerCase()).filter(Boolean);
}

function numberIn(value: unknown): number | undefined {
  const match = /(\d+(?:[.,]\d+)?)/.exec(text(value));
  return match ? Number(match[1]!.replace(',', '.')) : undefined;
}

// ---- ingredient lines -------------------------------------------------------

const BRAND =
  /\b(?:AH|Albert\s+Heijn|Allerhande)(?:\s+(?:Basic|Excellent|Biologisch|Terra|Organic|Puur\s*&\s*Eerlijk))?\b/gi;
const OPTIONAL = /\((?:optioneel|eventueel)\)|\b(?:optioneel|eventueel)\b/i;
const PACK_SIZE =
  /\((?:à|a|van|ca\.?|circa)?\s*(\d+(?:[.,]\d+)?)\s*(g|gr|gram|kg|ml|cl|dl|l|liter)\b[^)]*\)/i;
/** Words that describe handling, tried away only when the full name matched nothing. */
const DUTCH_NOISE =
  /\b(?:milde|biologische|biologisch|bio|grote|grof|grove|kleine|middelgrote|rijpe|halve|hele|fijngesneden|fijngehakte|gesneden|gehakte|gepelde|geschilde|uitgelekte|ongezouten|koude|lauwe|zachte|verse|vers|semi|extra|vierge)\b/gi;
const SALT_AND_PEPPER =
  /^(?:(?:versgemalen|zwarte|witte|grove)\s+)?(?:peper|zout)(?:\s+(?:en|of)\s+(?:(?:versgemalen|zwarte|witte|grove)\s+)?(?:peper|zout))?(?:\s+naar\s+smaak)?$/i;

const RESOLVED: readonly MatchKind[] = ['EXACT', 'SAFE_ALIAS'];

function matchName(name: string) {
  const full = matchCanonicalIngredient(name);
  if (RESOLVED.includes(full.kind) || full.kind === 'REJECT') return full;
  const stripped = name.replace(DUTCH_NOISE, ' ').replace(/\s+/g, ' ').trim();
  if (stripped === '' || stripped === name) return full;
  const retry = matchCanonicalIngredient(stripped);
  return RESOLVED.includes(retry.kind) ? retry : full;
}

interface LineOutcome {
  readonly line?: AuthoredRecipeIngredient;
  readonly dropped?: true;
  readonly rejection?: Rejection;
}

function convertLine(raw: string, ingredients: IngredientIndex): LineOutcome {
  const withoutBrand = raw.replace(BRAND, ' ').replace(/\s+/g, ' ').trim();
  const optional = OPTIONAL.test(withoutBrand);
  const cleaned = withoutBrand.replace(OPTIONAL, ' ').replace(/\s+/g, ' ').trim();
  if (SALT_AND_PEPPER.test(cleaned)) return { dropped: true };

  const parsed = parseIngredientLine(cleaned);
  const match = matchName(parsed.rawName ?? cleaned);
  if (match.kind === 'REJECT') return { dropped: true };
  if (match.kind === 'AMBIGUOUS') {
    return { rejection: { code: 'AMBIGUOUS_INGREDIENT', detail: raw } };
  }
  if (!match.ingredientId) {
    return {
      rejection: {
        code: 'UNMATCHED_INGREDIENT',
        detail: raw,
        concept: match.concept ?? match.normalised,
      },
    };
  }

  const ingredient = ingredients.get(match.ingredientId);
  // A staple with nothing to declare may go without an amount: "peper",
  // "zout naar smaak". It is never bought and hides no allergen.
  const harmlessStaple =
    ingredient?.pantryStaple === true &&
    ingredient.allergens.length === 0 &&
    ingredient.pregnancyRisks.length === 0;

  let amount = normaliseAmount(parsed.quantity, parsed.unit);
  if (amount.refusal === 'PACKAGE_DEPENDENT') {
    const size = PACK_SIZE.exec(raw);
    if (size) {
      const perPack = normaliseAmount(Number(size[1]!.replace(',', '.')), size[2]);
      if (perPack.value !== undefined) {
        amount = { ...perPack, value: perPack.value * (parsed.quantity ?? 1) };
      }
    }
  }
  if (amount.value === undefined || amount.baseUnit === undefined) {
    if (harmlessStaple) return { dropped: true };
    return {
      rejection: {
        code: 'AMOUNT_UNKNOWN',
        detail: `${raw} (${amount.refusal ?? 'geen hoeveelheid'})`,
      },
    };
  }

  return {
    line: {
      ingredientId: match.ingredientId,
      amount: Math.round(amount.value * 100) / 100,
      unit: amount.baseUnit,
      ...(optional ? { optional: true } : {}),
      ...(match.variantId ? { variantId: match.variantId } : {}),
    },
  };
}

// ---- classification ---------------------------------------------------------

const CUISINE_WORDS: Readonly<Record<Exclude<Cuisine, 'internationaal'>, readonly string[]>> = {
  nederlands: [
    'hollands',
    'hollandse',
    'nederlands',
    'nederlandse',
    'stamppot',
    'hutspot',
    'zuurkool',
    'erwtensoep',
    'snert',
    'hachee',
    'draadjesvlees',
    'kapucijners',
    'boerenkool',
  ],
  italiaans: [
    'italiaans',
    'italiaanse',
    'risotto',
    'lasagne',
    'lasagna',
    'pizza',
    'gnocchi',
    'carbonara',
    'bolognese',
    'parmigiana',
    'ossobuco',
    'saltimbocca',
    'arrabbiata',
    'puttanesca',
    'ravioli',
    'tortellini',
    'focaccia',
    'caprese',
    'cacciatore',
  ],
  mexicaans: [
    'mexicaans',
    'mexicaanse',
    'taco',
    'tacos',
    'burrito',
    'burritos',
    'enchilada',
    'enchiladas',
    'quesadilla',
    'quesadillas',
    'fajita',
    'fajitas',
    'nachos',
    'tex-mex',
    'chili con carne',
  ],
  aziatisch: [
    'aziatisch',
    'aziatische',
    'chinees',
    'chinese',
    'thais',
    'thaise',
    'japans',
    'japanse',
    'indonesisch',
    'indonesische',
    'koreaans',
    'koreaanse',
    'vietnamees',
    'vietnamese',
    'teriyaki',
    'sushi',
    'ramen',
    'pad thai',
    'nasi',
    'bami',
    'saté',
    'sate',
    'satay',
    'rendang',
    'gado-gado',
    'pho',
    'bibimbap',
    'gyoza',
    'katsu',
    'wok',
  ],
  indiaas: [
    'indiaas',
    'indiase',
    'tikka',
    'masala',
    'korma',
    'dal',
    'dahl',
    'biryani',
    'tandoori',
    'paneer',
    'vindaloo',
    'madras',
    'saag',
  ],
  grieks: [
    'grieks',
    'griekse',
    'moussaka',
    'souvlaki',
    'gyros',
    'tzatziki',
    'pastitsio',
    'stifado',
    'spanakopita',
  ],
  frans: [
    'frans',
    'franse',
    'quiche',
    'ratatouille',
    'bourguignon',
    'cassoulet',
    'coq au vin',
    'croque',
    'tartiflette',
    'bouillabaisse',
  ],
  mediterraan: [
    'mediterraan',
    'mediterrane',
    'spaans',
    'spaanse',
    'paella',
    'tapas',
    'marokkaans',
    'marokkaanse',
    'tajine',
    'couscous',
    'shakshuka',
    'midden-oosters',
    'midden-oosterse',
    'libanees',
    'libanese',
    'turks',
    'turkse',
    'falafel',
  ],
};

function cuisinesIn(textValue: string): Cuisine[] {
  const haystack = ` ${textValue.toLowerCase()} `;
  return (Object.keys(CUISINE_WORDS) as Exclude<Cuisine, 'internationaal'>[]).filter((cuisine) =>
    CUISINE_WORDS[cuisine].some((word) =>
      new RegExp(
        `(?<![\\p{L}-])${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}-])`,
        'u',
      ).test(haystack),
    ),
  );
}

/**
 * The kitchen, from the most explicit source that names exactly one.
 * Two kitchens named at once, or none at all, is `internationaal`.
 */
export function cuisineOf(declared: string, keywords: readonly string[], name: string): Cuisine {
  for (const source of [declared, keywords.join(' , '), name]) {
    const found = cuisinesIn(source);
    if (found.length === 1) return found[0]!;
    if (found.length > 1) return 'internationaal';
  }
  const direct = declared.toLowerCase() as Cuisine;
  return (CUISINES as readonly string[]).includes(direct) ? direct : 'internationaal';
}

const PROTEIN_OF: Readonly<Record<string, PrimaryProtein>> = {
  kipfilet: 'kip',
  kipdijfilet: 'kip',
  'gehakt-rund': 'rund',
  'gehakt-half': 'rund',
  runderstoof: 'rund',
  runderlever: 'rund',
  varkenshaas: 'varken',
  spekblokjes: 'varken',
  rookworst: 'varken',
  shoarmavlees: 'varken',
  zalmfilet: 'vis',
  'gerookte-zalm': 'vis',
  tonijnsteak: 'vis',
  kabeljauw: 'vis',
  garnalen: 'vis',
  'tonijn-blik': 'vis',
  ei: 'ei',
  'vega-gehakt': 'plantaardig-vlees',
  tofu: 'plantaardig-vlees',
  tempeh: 'plantaardig-vlees',
  falafel: 'peulvrucht',
  kikkererwten: 'peulvrucht',
  kidneybonen: 'peulvrucht',
  'bruine-bonen': 'peulvrucht',
  'zwarte-bonen': 'peulvrucht',
  linzen: 'peulvrucht',
  feta: 'zuivel',
  geitenkaas: 'zuivel',
  mozzarella: 'zuivel',
};

/** The protein line that weighs most, in grams per serving. */
function primaryProteinOf(recipe: Recipe, ingredients: IngredientIndex): PrimaryProtein {
  let best: { protein: PrimaryProtein; grams: number } | undefined;
  for (const line of recipe.ingredients) {
    const protein = PROTEIN_OF[line.ingredientId];
    if (!protein) continue;
    const pieceWeight = ingredients.get(line.ingredientId)?.pieceWeightGrams ?? 0;
    const grams =
      line.perServing.unit === 'piece'
        ? line.perServing.amount * pieceWeight
        : line.perServing.amount;
    if (!best || grams > best.grams) best = { protein, grams };
  }
  return best?.protein ?? 'geen';
}

const TAG_WORDS: Readonly<Partial<Record<RecipeTag, readonly string[]>>> = {
  ovenschotel: ['ovenschotel', 'ovenschotels', 'ovengerecht', 'uit de oven'],
  soep: ['soep', 'soepen'],
  salade: ['salade', 'salades'],
  eenpansgerecht: ['eenpansgerecht', 'eenpans', 'one pot', 'one-pot'],
  wraps: ['wrap', 'wraps', 'tortilla', "tortilla's", 'burrito', 'burritos'],
  comfortfood: ['stamppot', 'comfortfood'],
  budget: ['budget', 'goedkoop'],
};

const TAG_INGREDIENTS: Readonly<Partial<Record<RecipeTag, readonly string[]>>> = {
  pasta: ['pasta'],
  rijst: ['rijst', 'witte-rijst', 'basmatirijst', 'zilvervliesrijst'],
  aardappelen: ['aardappel', 'zoete-aardappel'],
  noedels: ['mie', 'noedels'],
  wraps: ['wraps', 'maistortilla'],
  brood: ['stokbrood', 'pitabrood', 'brood'],
  peulvruchten: ['kikkererwten', 'kidneybonen', 'bruine-bonen', 'zwarte-bonen', 'linzen'],
};

const PROTEIN_TAG: Readonly<Partial<Record<PrimaryProtein, RecipeTag>>> = {
  kip: 'kip',
  vis: 'vis',
  rund: 'rundvlees',
  varken: 'varkensvlees',
};

function tagsOf(
  name: string,
  keywords: readonly string[],
  recipe: Recipe,
  protein: PrimaryProtein,
): RecipeTag[] {
  const words = `${name} , ${keywords.join(' , ')}`.toLowerCase();
  const ids = new Set(recipe.ingredients.map((line) => line.ingredientId));
  const tags = new Set<RecipeTag>();
  for (const [tag, list] of Object.entries(TAG_WORDS) as [RecipeTag, readonly string[]][]) {
    if (list.some((word) => new RegExp(`(?<!\\p{L})${word}(?!\\p{L})`, 'u').test(words))) {
      tags.add(tag);
    }
  }
  for (const [tag, list] of Object.entries(TAG_INGREDIENTS) as [RecipeTag, readonly string[]][]) {
    if (list.some((id) => ids.has(id))) tags.add(tag);
  }
  const proteinTag = PROTEIN_TAG[protein];
  if (proteinTag) tags.add(proteinTag);
  if (recipe.vegan) tags.add('veganistisch');
  if (recipe.vegetarian) tags.add('vegetarisch');
  if (recipe.totalMinutes <= 30) tags.add('snel');
  return RECIPE_TAGS.filter((tag) => tags.has(tag));
}

function statedNutrition(node: unknown): NutritionPerServing | undefined {
  if (!node || typeof node !== 'object') return undefined;
  const n = node as JsonObject;
  const kcal = numberIn(n['calories']);
  const proteinGrams = numberIn(n['proteinContent']);
  const carbGrams = numberIn(n['carbohydrateContent']);
  const fatGrams = numberIn(n['fatContent']);
  const fiberGrams = numberIn(n['fiberContent']);
  const saltGrams = numberIn(n['saltContent'] ?? n['sodiumContent']);
  if (
    [kcal, proteinGrams, carbGrams, fatGrams, fiberGrams, saltGrams].some((v) => v === undefined)
  ) {
    return undefined;
  }
  return {
    kcal: kcal!,
    proteinGrams: proteinGrams!,
    carbGrams: carbGrams!,
    fatGrams: fatGrams!,
    fiberGrams: fiberGrams!,
    saltGrams: saltGrams!,
  };
}

// ---- the conversion -----------------------------------------------------------

export function allerhandeRecipeKey(recipeId: string): string {
  const digits = /(\d+)/.exec(recipeId)?.[1] ?? recipeId.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return `ah-${digits}`;
}

export const PRIVATE_RECIPE_IMAGE = '/recipes/_prive-recept.svg';

export function convertAllerhandeRecipe(
  stored: StoredAllerhandeRecipe,
  ingredients: IngredientIndex,
): Conversion {
  const id = allerhandeRecipeKey(stored.recipeId);
  const node = stored.recipe;
  const reject = (rejections: Rejection[]): Conversion => ({ ok: false, recipeId: id, rejections });

  const name = text(node['name']);
  const category = text(node['recipeCategory']).toLowerCase();
  const keywords = keywordsOf(node['keywords']);
  if (!/hoofdgerecht/.test(category) && !keywords.includes('hoofdgerecht')) {
    return reject([{ code: 'NOT_A_DINNER', detail: category || 'geen categorie' }]);
  }

  const rejections: Rejection[] = [];
  const servings = servingsOf(node['recipeYield']);
  if (!servings) rejections.push({ code: 'NO_SERVINGS', detail: text(node['recipeYield']) || '—' });

  const prep = isoMinutes(node['prepTime']);
  const cook = isoMinutes(node['cookTime']);
  const total = isoMinutes(node['totalTime']);
  const prepMinutes = prep ?? total;
  const cookMinutes = prep !== undefined ? (cook ?? 0) : 0;
  if (prepMinutes === undefined)
    rejections.push({ code: 'NO_TIME', detail: 'geen bereidingstijd' });

  const steps = stepsOf(node['recipeInstructions']);
  if (steps.length === 0) rejections.push({ code: 'NO_STEPS', detail: 'geen stappen' });

  const lines = Array.isArray(node['recipeIngredient']) ? node['recipeIngredient'].map(text) : [];
  const merged = new Map<string, AuthoredRecipeIngredient>();
  for (const raw of lines.filter(Boolean)) {
    const outcome = convertLine(raw, ingredients);
    if (outcome.rejection) rejections.push(outcome.rejection);
    if (!outcome.line) continue;
    const key = `${outcome.line.ingredientId}|${outcome.line.unit}`;
    const existing = merged.get(key);
    merged.set(
      key,
      existing ? { ...existing, amount: existing.amount + outcome.line.amount } : outcome.line,
    );
  }
  if (rejections.length > 0) return reject(rejections);

  const cuisine = cuisineOf(text(node['recipeCuisine']), keywords, name);
  const draft: AuthoredRecipe = {
    id,
    name,
    // A factual stand-in, not an invented blurb: the library requires a
    // description, and "where it came from" is the one thing we know for sure.
    description: text(node['description']) || 'Recept van Allerhande.',
    imageUrl: PRIVATE_RECIPE_IMAGE,
    steps,
    prepMinutes: prepMinutes!,
    cookMinutes,
    // Allerhande does not state a difficulty; this one is displayed, never used to plan.
    difficulty: 'gemiddeld',
    cuisine,
    mealType: 'dinner',
    tags: [],
    baseServings: servings!,
    ingredients: [...merged.values()],
    primaryProtein: 'geen',
    provenance: {
      kind: 'EXTERNAL',
      licence: 'PRIVATE_USE',
      source: 'Allerhande (Albert Heijn)',
      sourceUrl: stored.url,
      attribution: 'Recept van Allerhande (Albert Heijn), alleen voor eigen gebruik',
      addedAt: stored.fetchedAt,
    },
  };

  // Normalised *without* the source's nutrition, so the figure below is always
  // the app's own. With a stated value present, `normaliseRecipe` falls back to
  // it when ingredient coverage is thin — and the cross-check would then be
  // comparing the source with itself.
  let normalised: Recipe;
  try {
    normalised = normaliseRecipes([draft], ingredients)[0]!;
  } catch (error) {
    return reject([
      { code: 'NORMALISATION', detail: error instanceof Error ? error.message : String(error) },
    ]);
  }

  const protein = primaryProteinOf(normalised, ingredients);
  const stated = statedNutrition(node['nutrition']);
  const authored: AuthoredRecipe = {
    ...draft,
    primaryProtein: protein,
    tags: tagsOf(name, keywords, normalised, protein),
    ...(stated ? { nutritionPerServing: stated } : {}),
  };
  const recipe = normaliseRecipes([authored], ingredients)[0]!;

  // The source's kcal is a second opinion on every amount at once.
  const statedKcal = numberIn((node['nutrition'] as JsonObject | undefined)?.['calories']);
  if (statedKcal !== undefined && statedKcal > 0) {
    const ours = normalised.nutritionPerServing.kcal;
    const deviation = Math.abs(ours - statedKcal) / statedKcal;
    if (deviation > KCAL_TOLERANCE) {
      return reject([
        {
          code: 'KCAL_MISMATCH',
          detail: `${Math.round(ours)} kcal berekend, ${Math.round(statedKcal)} opgegeven`,
        },
      ]);
    }
  }

  // Every guard the library passes, except the one that keeps private recipes
  // out of the shipped library — which is exactly what these are.
  const errors = validateRecipe(recipe, ingredients, authored).filter(
    (problem) => problem.severity === 'ERROR' && problem.code !== 'LICENCE_NOT_PRODUCTION_SAFE',
  );
  if (errors.length > 0) {
    return reject(
      errors.map((problem) => ({
        code: 'VALIDATION',
        detail: `${problem.code}: ${problem.detail}`,
      })),
    );
  }
  return { ok: true, authored, recipe };
}
