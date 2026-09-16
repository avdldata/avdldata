import { toBaseQuantity, UnitConversionError } from '../units';
import type { IngredientIndex } from '../ingredients/types';
import { gramsPerServing } from './library';
import { computeRecipeNutrition } from './nutrition';
import { isProductionSafeLicence } from './types';
import type { AuthoredRecipe, Recipe } from './types';

/**
 * Sanity guards on recipe quantities.
 *
 * A recipe library grows by being written, and writing 60 recipes by hand is
 * exactly the situation where a decimal point slips: 2 kg of chicken for four
 * people, 500 g of cumin, half a wrap per person. None of those are caught by
 * the type system and all of them would reach the shopping list as real money.
 *
 * Two deliberate rules:
 *  - nothing here repairs anything. A guard reports; the fix is a decision made
 *    by a person who can say why, which is the only way the numbers stay
 *    trustworthy.
 *  - the thresholds are generous. They are there to catch mistakes, not to
 *    enforce a house style, so a genuinely large stew still passes.
 */

export type ProblemSeverity = 'ERROR' | 'WARNING';

export const VALIDATION_CODES = [
  'SCHEMA_INCOMPLETE',
  'DUPLICATE_ID',
  'UNKNOWN_INGREDIENT',
  'UNIT_NOT_CONVERTIBLE',
  'PIECES_WITHOUT_PIECE_WEIGHT',
  'FRACTIONAL_PIECES',
  'GRAM_MILLILITRE_CONFUSION',
  'EXTREME_PROTEIN_PER_PERSON',
  'TOO_LITTLE_PROTEIN_PER_PERSON',
  'EXTREME_DRY_CARB_PER_PERSON',
  'TOO_LITTLE_CARB_PER_PERSON',
  'EXTREME_OIL_PER_PERSON',
  'EXTREME_SPICE_PER_PERSON',
  'TOO_LITTLE_VEGETABLE_PER_PERSON',
  'EXTREME_KCAL',
  'IMPLAUSIBLE_KCAL_LOW',
  'TOO_LITTLE_TOTAL_PROTEIN',
  'NUTRITION_NOT_DERIVED',
  'SCALING_BROKEN',
  'STEPS_TOO_FEW',
  'STEPS_TOO_MANY',
  'TIME_IMPLAUSIBLE',
  'INGREDIENTS_TOO_FEW',
  'LICENCE_NOT_PRODUCTION_SAFE',
  'PROVENANCE_INCOMPLETE',
  'NOT_A_DINNER',
  'DIETARY_TAG_MISMATCH',
  'PROTEIN_TAG_MISMATCH',
  'CARB_TAG_MISMATCH',
] as const;
export type ValidationCode = (typeof VALIDATION_CODES)[number];

export interface RecipeProblem {
  readonly recipeId: string;
  readonly code: ValidationCode;
  readonly severity: ProblemSeverity;
  readonly detail: string;
  readonly ingredientId?: string;
}

/** Tags that state the protein, and the primaryProtein each one implies. */
const PROTEIN_TAGS: readonly (readonly [string, string])[] = [
  ['kip', 'kip'],
  ['vis', 'vis'],
  ['rundvlees', 'rund'],
  ['varkensvlees', 'varken'],
];

/** Per person per meal, in grams unless stated. */
export const LIMITS = {
  /** A 500 g steak each is a mistake, not a dinner. */
  proteinMaxGrams: 350,
  /** Below this the "chicken" in the title is a garnish. */
  proteinMinGrams: 60,
  /** Dry pasta or rice. A kilo per person is the brief's own example. */
  dryCarbMaxGrams: 250,
  dryCarbHardMaxGrams: 1000,
  /** Cooked starch (potato) is heavier, so it gets its own ceiling. */
  potatoMaxGrams: 600,
  dryCarbMinGrams: 50,
  oilMaxMl: 40,
  spiceMaxGrams: 20,
  vegetableMinGrams: 100,
  /** Grams of protein a dinner should deliver, whatever it is made of. */
  totalProteinMinGrams: 15,
  kcalMax: 1200,
  kcalMin: 350,
  kcalHardMax: 2000,
  prepPlusCookMaxMinutes: 240,
  stepsMin: 2,
  stepsMax: 14,
  ingredientsMin: 5,
} as const;

/** Dense protein sources: the line that makes the dish a chicken dish. */
const PROTEIN_IDS = new Set([
  'kipfilet',
  'kipdijfilet',
  'gehakt-rund',
  'gehakt-half',
  'runderstoof',
  'varkenshaas',
  'spekblokjes',
  'runderlever',
  'rookworst',
  'shoarmavlees',
  'zalmfilet',
  'gerookte-zalm',
  'tonijnsteak',
  'kabeljauw',
  'garnalen',
  'tonijn-blik',
  'vega-gehakt',
  'tofu',
  'tempeh',
  'falafel',
  'ei',
]);

/** Starches measured dry, where the cooked weight is two to three times more. */
const DRY_CARB_IDS = new Set([
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
  'witte-rijst',
  'basmatirijst',
  'zilvervliesrijst',
  'rijst',
  'risottorijst',
  'pandanrijst',
  'couscous',
  'bulgur',
  'quinoa',
  'mie',
]);

const POTATO_IDS = new Set(['aardappel', 'zoete-aardappel', 'krieltjes', 'aardappelpartjes']);
const LEGUME_IDS = new Set([
  'kikkererwten',
  'kidneybonen',
  'bruine-bonen',
  'zwarte-bonen',
  'linzen',
]);
const OIL_IDS = new Set(['olijfolie', 'zonnebloemolie']);

/** Starches that arrive ready to eat, so a "dry weight" floor says nothing. */
const READY_CARB_IDS = new Set(['wraps', 'maistortilla', 'pitabrood', 'stokbrood']);

/**
 * Vegetables the catalogue files under `conserven` or `overig`.
 *
 * Tinned tomato is shelved with the tins and eaten as a vegetable. Counting the
 * category alone made penne arrabbiata look like a 9 g-of-vegetable dinner,
 * which says more about the shelf layout than about the plate.
 */
const TINNED_VEGETABLE_IDS = new Set([
  'tomatenblokjes',
  'passata',
  'tomatenpuree',
  'mais',
  'olijven',
  'zongedroogde-tomaten',
  'spinazie-diepvries',
]);

/**
 * Dry herbs and spices, where more than a spoonful per person is a slip.
 *
 * The ceiling is on the dry stuff only. Peanut butter, pesto, curry paste and
 * soy sauce share the `kruiden-specerijen` shelf but are eaten by the
 * tablespoon — 38 g of peanut butter per person is a satay sauce, not an error.
 */
const DRY_SPICE_IDS = new Set([
  'zout',
  'peper',
  'paprikapoeder',
  'komijn',
  'kerriepoeder',
  'kurkuma',
  'italiaanse-kruiden',
  'oregano',
  'chilipoeder',
  'kaneel',
  'groentebouillon',
  'taco-kruidenmix',
  'sesamzaad',
]);

/**
 * Proteins that only ever appear as a supporting player.
 *
 * An egg in a fried rice or two rashers of bacon in a stamppot are seasoning,
 * not the protein of the dish, so the "too little" floor would fire on every
 * correct recipe. They still count towards the ceiling.
 */
const ACCENT_PROTEIN_IDS = new Set(['ei', 'spekblokjes', 'gerookte-zalm', 'tonijn-blik']);

function sumGrams(
  recipe: Recipe,
  ingredients: IngredientIndex,
  predicate: (id: string) => boolean,
): number {
  let total = 0;
  for (const line of recipe.ingredients) {
    if (line.optional || !predicate(line.ingredientId)) continue;
    total += gramsPerServing(line, ingredients);
  }
  return total;
}

function millilitresPerServing(
  line: { readonly ingredientId: string; readonly perServing: { amount: number; unit: string } },
  ingredients: IngredientIndex,
): number {
  if (line.perServing.unit === 'ml') return line.perServing.amount;
  const density = ingredients.get(line.ingredientId)?.density;
  if (line.perServing.unit === 'g' && density) return line.perServing.amount / density;
  return line.perServing.amount;
}

/**
 * Unit checks that run on the *authored* lines, before normalisation.
 *
 * These have to be reachable without a normalised recipe, because
 * `normaliseRecipe` throws on exactly the mistakes they describe: a volume on a
 * solid with no density never becomes a `Recipe` at all. Running them
 * separately turns a crash on import into a list of lines and reasons, which is
 * what someone writing a batch of recipes actually needs.
 */
export function validateAuthoredUnits(
  authored: AuthoredRecipe,
  ingredients: IngredientIndex,
): RecipeProblem[] {
  const problems: RecipeProblem[] = [];
  const add = (code: ValidationCode, detail: string, ingredientId: string): void => {
    problems.push({ recipeId: authored.id, code, severity: 'ERROR', detail, ingredientId });
  };

  for (const line of authored.ingredients) {
    const ingredient = ingredients.get(line.ingredientId);
    if (!ingredient) {
      add('UNKNOWN_INGREDIENT', 'onbekend ingredient', line.ingredientId);
      continue;
    }
    // A volume unit on a solid, or a mass unit on a liquid, only works because
    // a density happens to exist. When the authored unit and the ingredient's
    // own base unit disagree and no density bridges them, the line is a guess.
    const authoredIsVolume = line.unit === 'ml' || line.unit === 'l';
    const authoredIsMass = line.unit === 'g' || line.unit === 'kg';
    if (authoredIsVolume && ingredient.baseUnit === 'g' && !ingredient.density) {
      add(
        'GRAM_MILLILITRE_CONFUSION',
        `${line.amount} ${line.unit} op een gram-basis`,
        line.ingredientId,
      );
      continue;
    }
    if (authoredIsMass && ingredient.baseUnit === 'ml' && !ingredient.density) {
      add(
        'GRAM_MILLILITRE_CONFUSION',
        `${line.amount} ${line.unit} op een ml-basis`,
        line.ingredientId,
      );
      continue;
    }
    if (line.unit === 'piece' && ingredient.baseUnit === 'g' && !ingredient.pieceWeightGrams) {
      add('PIECES_WITHOUT_PIECE_WEIGHT', 'stuks zonder stukgewicht', line.ingredientId);
      continue;
    }
    try {
      toBaseQuantity(line.amount, line.unit, {
        baseUnit: ingredient.baseUnit,
        density: ingredient.density,
        pieceWeightGrams: ingredient.pieceWeightGrams,
      });
    } catch (error) {
      if (error instanceof UnitConversionError) {
        add('UNIT_NOT_CONVERTIBLE', error.message, line.ingredientId);
        continue;
      }
      throw error;
    }
  }
  return problems;
}

/**
 * Check one normalised recipe.
 *
 * `authored` is optional but wanted: the authored lines are where a unit
 * mistake is visible (`200 ml` of minced beef), because normalisation has
 * already converted or thrown by the time the recipe reaches this function.
 */
export function validateRecipe(
  recipe: Recipe,
  ingredients: IngredientIndex,
  authored?: AuthoredRecipe,
): RecipeProblem[] {
  const problems: RecipeProblem[] = [];
  const add = (
    code: ValidationCode,
    severity: ProblemSeverity,
    detail: string,
    ingredientId?: string,
  ): void => {
    problems.push({
      recipeId: recipe.id,
      code,
      severity,
      detail,
      ...(ingredientId ? { ingredientId } : {}),
    });
  };

  // ---- schema -------------------------------------------------------------
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(recipe.id)) {
    add('SCHEMA_INCOMPLETE', 'ERROR', `id "${recipe.id}" is geen stabiele kebab-case id`);
  }
  if (recipe.name.trim() === '') add('SCHEMA_INCOMPLETE', 'ERROR', 'titel ontbreekt');
  if (recipe.description.trim() === '') add('SCHEMA_INCOMPLETE', 'ERROR', 'beschrijving ontbreekt');
  if (recipe.baseServings < 1) {
    add('SCHEMA_INCOMPLETE', 'ERROR', `baseServings ${recipe.baseServings} is onbruikbaar`);
  }
  if (recipe.mealType !== 'dinner') add('NOT_A_DINNER', 'ERROR', `mealType ${recipe.mealType}`);
  if (recipe.tags.length === 0) add('SCHEMA_INCOMPLETE', 'WARNING', 'geen tags');

  // ---- tags must agree with what the engine derives -----------------------
  //
  // A tag is a promise to the person filtering on it. `vegetarisch` on a dish
  // containing bacon is not a labelling slip, it is the app lying about food to
  // someone who may have asked for exactly the opposite. The derived flags come
  // from the ingredients and always win; the tag is what gets corrected.
  const tags = new Set<string>(recipe.tags);
  if (tags.has('vegetarisch') && !recipe.vegetarian) {
    add('DIETARY_TAG_MISMATCH', 'ERROR', 'getagd als vegetarisch maar bevat vlees of vis');
  }
  if (tags.has('veganistisch') && !recipe.vegan) {
    add('DIETARY_TAG_MISMATCH', 'ERROR', 'getagd als veganistisch maar bevat dierlijke producten');
  }
  if (tags.has('veganistisch') && !tags.has('vegetarisch')) {
    add('DIETARY_TAG_MISMATCH', 'WARNING', 'veganistisch zonder de tag vegetarisch');
  }
  if (recipe.vegan && !tags.has('veganistisch')) {
    add('DIETARY_TAG_MISMATCH', 'WARNING', 'veganistisch volgens de ingredienten maar niet getagd');
  }
  if (recipe.vegetarian && !tags.has('vegetarisch')) {
    add('DIETARY_TAG_MISMATCH', 'WARNING', 'vegetarisch volgens de ingredienten maar niet getagd');
  }
  for (const [tag, protein] of PROTEIN_TAGS) {
    if (tags.has(tag) && recipe.primaryProtein !== protein) {
      add(
        'PROTEIN_TAG_MISMATCH',
        'ERROR',
        `tag ${tag} bij primaryProtein=${recipe.primaryProtein}`,
      );
    }
  }

  // ---- provenance and licence --------------------------------------------
  if (!recipe.provenance.addedAt) {
    add('PROVENANCE_INCOMPLETE', 'ERROR', 'provenance.addedAt ontbreekt');
  }
  if (recipe.provenance.kind === 'EXTERNAL' && !recipe.provenance.source) {
    add('PROVENANCE_INCOMPLETE', 'ERROR', 'externe herkomst zonder bronvermelding');
  }
  if (recipe.provenance.licence === 'CC_BY' && !recipe.provenance.attribution) {
    add('PROVENANCE_INCOMPLETE', 'ERROR', 'CC-BY zonder attributie');
  }
  if (!isProductionSafeLicence(recipe.provenance.licence)) {
    add(
      'LICENCE_NOT_PRODUCTION_SAFE',
      'ERROR',
      `licentie ${recipe.provenance.licence} mag niet in productie`,
    );
  }

  // ---- steps and timing ---------------------------------------------------
  if (recipe.steps.length < LIMITS.stepsMin) {
    add('STEPS_TOO_FEW', 'ERROR', `${recipe.steps.length} stappen`);
  }
  if (recipe.steps.length > LIMITS.stepsMax) {
    add('STEPS_TOO_MANY', 'WARNING', `${recipe.steps.length} stappen`);
  }
  if (recipe.prepMinutes <= 0) add('TIME_IMPLAUSIBLE', 'ERROR', 'prepMinutes is 0');
  if (recipe.totalMinutes > LIMITS.prepPlusCookMaxMinutes) {
    add('TIME_IMPLAUSIBLE', 'WARNING', `${recipe.totalMinutes} minuten totaal`);
  }
  if (recipe.ingredients.length < LIMITS.ingredientsMin) {
    add('INGREDIENTS_TOO_FEW', 'WARNING', `${recipe.ingredients.length} ingredienten`);
  }

  // ---- unit handling ------------------------------------------------------
  if (authored) problems.push(...validateAuthoredUnits(authored, ingredients));

  // Pieces that cannot be bought: 1.5 wraps per person is fine, 1.5 wraps for
  // the whole recipe is a rounding artefact that reaches the shopping list.
  for (const line of recipe.ingredients) {
    if (line.perServing.unit !== 'piece') continue;
    const total = line.perServing.amount * recipe.baseServings;
    if (Math.abs(total - Math.round(total)) > 1e-6) {
      add(
        'FRACTIONAL_PIECES',
        'WARNING',
        `${total.toFixed(2)} stuks voor ${recipe.baseServings} porties`,
        line.ingredientId,
      );
    }
  }

  // ---- quantities per person ---------------------------------------------
  const proteinGrams = sumGrams(recipe, ingredients, (id) => PROTEIN_IDS.has(id));
  const mainProteinGrams = sumGrams(
    recipe,
    ingredients,
    (id) => PROTEIN_IDS.has(id) && !ACCENT_PROTEIN_IDS.has(id),
  );
  const dryCarbGrams = sumGrams(recipe, ingredients, (id) => DRY_CARB_IDS.has(id));
  const potatoGrams = sumGrams(recipe, ingredients, (id) => POTATO_IDS.has(id));
  const vegetableGrams = sumGrams(
    recipe,
    ingredients,
    (id) =>
      !POTATO_IDS.has(id) &&
      (ingredients.get(id)?.category === 'groente-fruit' || TINNED_VEGETABLE_IDS.has(id)),
  );

  if (proteinGrams > LIMITS.proteinMaxGrams) {
    add('EXTREME_PROTEIN_PER_PERSON', 'ERROR', `${proteinGrams.toFixed(0)} g eiwitbron pp`);
  }
  if (
    recipe.primaryProtein !== 'geen' &&
    mainProteinGrams > 0 &&
    mainProteinGrams < LIMITS.proteinMinGrams
  ) {
    add(
      'TOO_LITTLE_PROTEIN_PER_PERSON',
      'WARNING',
      `${mainProteinGrams.toFixed(0)} g eiwitbron pp bij primaryProtein=${recipe.primaryProtein}`,
    );
  }
  if (dryCarbGrams > LIMITS.dryCarbHardMaxGrams) {
    add(
      'EXTREME_DRY_CARB_PER_PERSON',
      'ERROR',
      `${dryCarbGrams.toFixed(0)} g droge koolhydraat pp`,
    );
  } else if (dryCarbGrams > LIMITS.dryCarbMaxGrams) {
    add(
      'EXTREME_DRY_CARB_PER_PERSON',
      'WARNING',
      `${dryCarbGrams.toFixed(0)} g droge koolhydraat pp`,
    );
  }
  if (potatoGrams > LIMITS.potatoMaxGrams) {
    add('EXTREME_DRY_CARB_PER_PERSON', 'WARNING', `${potatoGrams.toFixed(0)} g aardappel pp`);
  }
  // A handful of pasta in a bean soup is a garnish on a dish whose carbohydrate
  // comes from somewhere else. The floor is about the base of the meal, so it
  // only fires when nothing else is carrying it.
  const otherCarbGrams =
    potatoGrams +
    sumGrams(recipe, ingredients, (id) => LEGUME_IDS.has(id) || READY_CARB_IDS.has(id));
  if (dryCarbGrams > 0 && dryCarbGrams < LIMITS.dryCarbMinGrams && otherCarbGrams < 100) {
    add(
      'TOO_LITTLE_CARB_PER_PERSON',
      'WARNING',
      `${dryCarbGrams.toFixed(0)} g droge koolhydraat pp`,
    );
  }
  if (vegetableGrams < LIMITS.vegetableMinGrams) {
    add('TOO_LITTLE_VEGETABLE_PER_PERSON', 'WARNING', `${vegetableGrams.toFixed(0)} g groente pp`);
  }

  for (const line of recipe.ingredients) {
    if (line.optional) continue;
    if (OIL_IDS.has(line.ingredientId)) {
      const ml = millilitresPerServing(line, ingredients);
      if (ml > LIMITS.oilMaxMl) {
        add('EXTREME_OIL_PER_PERSON', 'WARNING', `${ml.toFixed(0)} ml olie pp`, line.ingredientId);
      }
    }
    if (DRY_SPICE_IDS.has(line.ingredientId)) {
      const grams = gramsPerServing(line, ingredients);
      if (grams > LIMITS.spiceMaxGrams) {
        add(
          'EXTREME_SPICE_PER_PERSON',
          'WARNING',
          `${grams.toFixed(0)} g ${line.ingredientId} pp`,
          line.ingredientId,
        );
      }
    }
  }

  // ---- nutrition ----------------------------------------------------------
  const kcal = recipe.nutritionPerServing.kcal;
  if (kcal > LIMITS.kcalHardMax) {
    add('EXTREME_KCAL', 'ERROR', `${kcal} kcal per portie`);
  } else if (kcal > LIMITS.kcalMax) {
    add('EXTREME_KCAL', 'WARNING', `${kcal} kcal per portie`);
  }
  if (kcal < LIMITS.kcalMin) add('IMPLAUSIBLE_KCAL_LOW', 'WARNING', `${kcal} kcal per portie`);
  // Protein is checked on the nutrition, not on a list of protein ingredients:
  // a bean stew and a chicken traybake get there by completely different
  // routes, and only the computed figure knows whether the dish arrives.
  if (recipe.nutritionPerServing.proteinGrams < LIMITS.totalProteinMinGrams) {
    add(
      'TOO_LITTLE_TOTAL_PROTEIN',
      'WARNING',
      `${recipe.nutritionPerServing.proteinGrams.toFixed(0)} g eiwit per portie`,
    );
  }
  if (recipe.nutritionSource !== 'derived') {
    add(
      'NUTRITION_NOT_DERIVED',
      'ERROR',
      `dekking ${(recipe.nutritionCoverage * 100).toFixed(0)}%, waarde valt terug op de handgeschreven cijfers`,
    );
  }

  // ---- scaling ------------------------------------------------------------
  // The planner cooks for one to eight people. Every line has to stay positive
  // and finite at both ends, and the per-serving nutrition must not move.
  for (const servings of [1, 2, 3, 5, 8]) {
    for (const line of recipe.ingredients) {
      const scaled = line.perServing.amount * servings;
      if (!Number.isFinite(scaled) || scaled <= 0) {
        add(
          'SCALING_BROKEN',
          'ERROR',
          `${line.ingredientId} wordt ${scaled} bij ${servings} porties`,
          line.ingredientId,
        );
      }
    }
  }
  const recomputed = computeRecipeNutrition(recipe.ingredients, ingredients);
  if (recipe.nutritionSource === 'derived' && recomputed.perServing.kcal !== kcal) {
    add(
      'SCALING_BROKEN',
      'ERROR',
      `nutrition niet reproduceerbaar: ${recomputed.perServing.kcal} vs ${kcal}`,
    );
  }

  return problems;
}

export function validateLibrary(
  recipes: readonly Recipe[],
  ingredients: IngredientIndex,
  authored?: readonly AuthoredRecipe[],
): RecipeProblem[] {
  const byId = new Map(authored?.map((a) => [a.id, a]) ?? []);
  const problems: RecipeProblem[] = [];
  const seen = new Set<string>();
  for (const recipe of recipes) {
    if (seen.has(recipe.id)) {
      problems.push({
        recipeId: recipe.id,
        code: 'DUPLICATE_ID',
        severity: 'ERROR',
        detail: 'id komt meer dan een keer voor',
      });
    }
    seen.add(recipe.id);
    problems.push(...validateRecipe(recipe, ingredients, byId.get(recipe.id)));
  }
  return problems;
}
