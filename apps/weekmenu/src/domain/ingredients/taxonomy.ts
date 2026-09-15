import type { IngredientId } from './types';
import type { NutritionPer100 } from '../nutrition/facts';

/**
 * Why a supermarket selling twelve shapes of pasta must not give us twelve
 * ingredients.
 *
 * The measured opportunity list asked for fusilli, tagliatelle and orzo. Adding
 * three top-level ingredients for those would be the start of a catalogue that
 * grows with the shelf rather than with the kitchen, and the planner would then
 * have to learn — somewhere, implicitly — that a recipe asking for pasta is
 * happy with any of them. That knowledge belongs in one place and it belongs in
 * the type system.
 *
 * So there are three distinct things here, and the whole point is that they are
 * not interchangeable:
 *
 *   **variant**     A narrowing of an ingredient that is still the same food.
 *                   Fusilli is pasta. Risotto rice is rice.
 *
 *   **form**        The same food in a different retail state. Frozen spinach
 *                   is spinach; sliced cheese is cheese. A form never changes
 *                   what the ingredient *is*, only how it arrives.
 *
 *   **composite**   A product made of several foods, bought as one thing.
 *                   Pesto is not basil. Hummus is not chickpeas. These get
 *                   their own canonical ingredient and their own nutrition,
 *                   because that is what the jar actually contains.
 *
 * ## Compatibility is directional
 *
 * This is the rule that keeps the model honest, and it is deliberately not
 * symmetric aliasing:
 *
 *   a recipe asking for the **general** thing may be served by a **specific**
 *   one; a recipe asking for a **specific** thing may never be served by the
 *   general one, nor by a sibling.
 *
 * "Pasta" accepts fusilli. "Lasagne sheets" does not accept fusilli — you
 * cannot build a lasagne out of spirals. "Rice" accepts risotto rice; "risotto
 * rice" does not accept long-grain, because the dish depends on the starch the
 * grain releases.
 *
 * And some narrowings are not substitutes at all in either direction. Goat
 * cheese is not what someone means by "cheese" in a gratin, so it is not a
 * variant of cheese: it is its own ingredient. That decision is made per
 * concept, by hand, and written down — never derived from a string.
 */

/** The retail state of an ingredient. Never a different ingredient. */
export const INGREDIENT_FORMS = [
  'fresh',
  'ambient',
  'frozen',
  'canned',
  'jarred',
  'dried',
  'sliced',
  'grated',
  'baby',
] as const;
export type IngredientForm = (typeof INGREDIENT_FORMS)[number];

/**
 * Forms a recipe accepts unless it says otherwise.
 *
 * Fresh and ambient (a bag of dry pasta, a jar on a shelf) are what a recipe
 * means by default. Frozen, canned and dried change cooking time, water content
 * and often the dish, so a recipe has to opt in.
 */
export const DEFAULT_ACCEPTED_FORMS: readonly IngredientForm[] = ['fresh', 'ambient'];

export type VariantId = string;

/**
 * A narrowing of a canonical ingredient.
 *
 * `substitutable` is the whole reason this is hand-written data rather than a
 * naming convention: it says whether a recipe asking for the parent is happy to
 * receive this. Pandan rice for "rice": yes. Lasagne sheets for "pasta": no,
 * because the shape is the dish.
 */
export interface IngredientVariant {
  readonly id: VariantId;
  readonly parentId: IngredientId;
  readonly name: string;
  /** Absent means the ordinary shelf form of the parent. */
  readonly form?: IngredientForm;
  /** May a recipe asking for the parent be served by this? */
  readonly substitutable: boolean;
  /**
   * Own nutrition, when the variant genuinely differs.
   *
   * Absent means it inherits the parent's, which is correct for a shape of
   * pasta and wrong for anything that is not simply the parent in another
   * outline — see `assertNutritionIsSound`.
   */
  readonly nutritionPer100?: NutritionPer100;
  /** Why this variant exists, for the report and for the next reader. */
  readonly note?: string;
}

/**
 * What a recipe line actually demands.
 *
 * A requirement naming only an ingredient is general and accepts substitutable
 * variants. A requirement naming a variant is specific and accepts nothing
 * else.
 */
export interface IngredientRequirement {
  readonly ingredientId: IngredientId;
  readonly variantId?: VariantId;
  /** Overrides `DEFAULT_ACCEPTED_FORMS` when a recipe is happy with frozen. */
  readonly acceptsForms?: readonly IngredientForm[];
}

/** What a retail product turned out to be, after matching. */
export interface IngredientOffering {
  readonly ingredientId: IngredientId;
  readonly variantId?: VariantId;
  readonly form?: IngredientForm;
}

export type CompatibilityVerdict =
  /** Exactly what was asked for. */
  | 'EXACT'
  /** A specific variant serving a general requirement. */
  | 'VARIANT_OF_GENERIC'
  /** The same food in a form the recipe accepts. */
  | 'ACCEPTED_FORM'
  /** A different ingredient entirely. */
  | 'DIFFERENT_INGREDIENT'
  /** The right food, but the recipe needs a different variant. */
  | 'TOO_GENERIC'
  /** Right food, wrong variant (fusilli where lasagne sheets were asked). */
  | 'WRONG_VARIANT'
  /** Right food, but the recipe did not ask for this form. */
  | 'FORM_NOT_ACCEPTED';

export interface CompatibilityResult {
  readonly verdict: CompatibilityVerdict;
  readonly compatible: boolean;
  /** Which ingredient the requirement is counted against, for aggregation. */
  readonly resolvesTo: IngredientId;
}

export type VariantIndex = ReadonlyMap<VariantId, IngredientVariant>;

export function buildVariantIndex(variants: readonly IngredientVariant[]): VariantIndex {
  return new Map(variants.map((v) => [v.id, v]));
}

/**
 * May this offering serve this requirement?
 *
 * Every branch returns a named verdict rather than a boolean, so a refusal can
 * be explained in the review queue and counted in the coverage report. A
 * silent `false` here would be the kind of thing nobody notices until a
 * shopping list contains risotto rice for a curry.
 */
export function checkCompatibility(
  requirement: IngredientRequirement,
  offering: IngredientOffering,
  variants: VariantIndex,
): CompatibilityResult {
  const resolvesTo = requirement.ingredientId;

  if (offering.ingredientId !== requirement.ingredientId) {
    return { verdict: 'DIFFERENT_INGREDIENT', compatible: false, resolvesTo };
  }

  const accepted = requirement.acceptsForms ?? DEFAULT_ACCEPTED_FORMS;
  const offeredVariant = offering.variantId ? variants.get(offering.variantId) : undefined;
  const offeredForm = offering.form ?? offeredVariant?.form;

  // A form the recipe did not ask for is refused before anything else: frozen
  // spinach in a salad is the wrong answer however well the names line up.
  if (offeredForm !== undefined && !accepted.includes(offeredForm)) {
    return { verdict: 'FORM_NOT_ACCEPTED', compatible: false, resolvesTo };
  }

  if (requirement.variantId !== undefined) {
    if (offering.variantId === requirement.variantId) {
      return { verdict: 'EXACT', compatible: true, resolvesTo };
    }
    // The requirement is specific. Neither the bare ingredient nor a sibling
    // will do, and this is the asymmetry the whole module exists for.
    return {
      verdict: offering.variantId === undefined ? 'TOO_GENERIC' : 'WRONG_VARIANT',
      compatible: false,
      resolvesTo,
    };
  }

  if (offering.variantId === undefined) {
    return { verdict: 'EXACT', compatible: true, resolvesTo };
  }

  if (offeredVariant === undefined) {
    // An unknown variant id is a data error, not a licence to guess.
    return { verdict: 'WRONG_VARIANT', compatible: false, resolvesTo };
  }
  if (!offeredVariant.substitutable) {
    return { verdict: 'WRONG_VARIANT', compatible: false, resolvesTo };
  }
  return {
    verdict: offeredForm === undefined ? 'VARIANT_OF_GENERIC' : 'ACCEPTED_FORM',
    compatible: true,
    resolvesTo,
  };
}

/**
 * The ingredient a product counts towards, whatever variant it is.
 *
 * Coverage is counted per canonical ingredient precisely so that a promotion on
 * fusilli cannot be counted once for fusilli and once for pasta.
 */
export function countsTowards(offering: IngredientOffering): IngredientId {
  return offering.ingredientId;
}

/**
 * A composite is made of other foods and does not inherit their nutrition.
 *
 * Pesto is basil, oil, cheese, pine nuts and salt; its energy density is
 * nothing like basil's. Inheriting here would not be an approximation, it would
 * be a wrong number presented as a measured one, so the rule is enforced rather
 * than documented.
 */
export function assertNutritionIsSound(
  composites: readonly { readonly id: IngredientId; readonly nutritionPer100?: NutritionPer100 }[],
): void {
  const missing = composites.filter((c) => c.nutritionPer100 === undefined).map((c) => c.id);
  if (missing.length > 0) {
    throw new Error(
      `Samengestelde ingredienten zonder eigen voedingswaarden: ${missing.join(', ')}. ` +
        'Een composite mag de waarden van zijn hoofdbestanddeel niet erven.',
    );
  }
}
