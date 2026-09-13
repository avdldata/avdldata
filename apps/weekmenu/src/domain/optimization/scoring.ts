import { cents, type Cents } from '../units';
import type { Recipe } from '../recipes/types';
import type { RecipePortions } from '../nutrition/portions';
import type { MemberNutrition } from '../nutrition/calculate';
import type { NutritionConfig } from '../nutrition/config';
import { preferenceLevelFor, type Preferences } from '../household/types';
import type { WasteSummary } from '../aggregation/leftovers';
import type { DiversityViolation } from './diversity';
import type { ObjectiveWeights } from './config';
import type { StoreOption } from './store-selection';
import type { BudgetSettings, WeekScoreBreakdown } from './types';

/** WHO guideline for daily salt intake, in grams. Used only as a soft ceiling. */
const DAILY_SALT_GUIDELINE_GRAMS = 5;

export interface PreferenceScore {
  readonly penaltyCents: Cents;
  readonly likedTerms: readonly string[];
  readonly dislikedTerms: readonly string[];
}

/**
 * How well a dish matches the household's taste.
 *
 * LIKE lowers the penalty, DISLIKE raises it. EXCLUDE never reaches this
 * function — it is a hard filter and the recipe is gone long before scoring.
 */
export function scoreRecipePreferences(
  recipe: Recipe,
  preferences: Preferences,
  weights: ObjectiveWeights,
): PreferenceScore {
  let penalty = 0;
  const liked: string[] = [];
  const disliked: string[] = [];

  const apply = (level: string, term: string): void => {
    if (level === 'LIKE') {
      penalty -= weights.likeBonus;
      liked.push(term);
    } else if (level === 'DISLIKE') {
      penalty += weights.dislikePenalty;
      disliked.push(term);
    }
  };

  apply(preferenceLevelFor(preferences.cuisines, recipe.cuisine), recipe.cuisine);
  for (const tag of recipe.tags) apply(preferenceLevelFor(preferences.tags, tag), tag);
  for (const line of recipe.ingredients) {
    apply(preferenceLevelFor(preferences.ingredients, line.ingredientId), line.ingredientId);
  }

  return { penaltyCents: cents(penalty), likedTerms: liked, dislikedTerms: disliked };
}

export interface NutritionPenaltyInput {
  readonly days: readonly { readonly recipe: Recipe; readonly portions: RecipePortions }[];
  readonly members: readonly MemberNutrition[];
  readonly nutritionConfig: NutritionConfig;
  readonly weights: ObjectiveWeights;
}

export interface NutritionPenaltyResult {
  readonly penaltyCents: Cents;
  readonly totalKcalDeviation: number;
  readonly proteinShortfallGrams: number;
  readonly fiberShortfallGrams: number;
  readonly saltExcessGrams: number;
}

/**
 * Health penalty for a whole week.
 *
 * Energy deviation per person per day dominates; protein, fibre and salt add
 * smaller corrections. Weights are set so that health outranks price — a week
 * that is €3 cheaper but leaves everyone 400 kcal short will lose.
 */
export function scoreNutrition(input: NutritionPenaltyInput): NutritionPenaltyResult {
  const share = input.nutritionConfig.dinnerEnergyShare;
  let kcalDeviation = 0;
  let proteinShortfall = 0;
  let fiberShortfall = 0;
  let saltExcess = 0;

  for (const day of input.days) {
    for (const portion of day.portions.perMember) {
      kcalDeviation += Math.abs(portion.kcal - portion.targetKcal);
    }

    const servings = day.portions.totalServings;
    const n = day.recipe.nutritionPerServing;

    const proteinTarget = input.members.reduce(
      (sum, m) => sum + m.proteinGuidelineGrams * share,
      0,
    );
    proteinShortfall += Math.max(0, proteinTarget - n.proteinGrams * servings);

    const fiberTarget = input.members.reduce((sum, m) => sum + m.fiberGuidelineGrams * share, 0);
    fiberShortfall += Math.max(0, fiberTarget - n.fiberGrams * servings);

    const saltCeiling = input.members.length * DAILY_SALT_GUIDELINE_GRAMS * share;
    saltExcess += Math.max(0, n.saltGrams * servings - saltCeiling);
  }

  const w = input.weights;
  const penalty =
    (kcalDeviation / 100) * w.nutritionKcalDeviationPer100 +
    proteinShortfall * w.proteinShortfallPerGram +
    fiberShortfall * w.fiberShortfallPerGram +
    saltExcess * w.saltExcessPerGram;

  return {
    penaltyCents: cents(penalty),
    totalKcalDeviation: Math.round(kcalDeviation),
    proteinShortfallGrams: round1(proteinShortfall),
    fiberShortfallGrams: round1(fiberShortfall),
    saltExcessGrams: round1(saltExcess),
  };
}

export interface WeekScoreInput {
  readonly option: StoreOption;
  /** 0–1 variety measure of the seven dishes; see `varietyScore`. */
  readonly variety: number;
  readonly nutrition: NutritionPenaltyResult;
  readonly waste: WasteSummary;
  readonly diversityViolations: readonly DiversityViolation[];
  readonly preferencePenaltyCents: Cents;
  readonly budget: BudgetSettings;
  readonly weights: ObjectiveWeights;
}

/**
 * The objective function.
 *
 * Everything is expressed in eurocent-equivalents and summed into one penalty,
 * so a week's score can be read as "this is what this week really costs us,
 * once health, waste, variety and hassle are priced in". Lower wins.
 */
export function scoreWeek(input: WeekScoreInput): WeekScoreBreakdown {
  const w = input.weights;

  const wastePenalty = cents((input.waste.wasteScore / 1000) * w.wastePerKilo);
  const monotonyPenalty = cents(Math.max(0, 1 - input.variety) * w.monotonyPenalty);
  const repetitionPenalty = cents(
    input.diversityViolations.length * w.repetitionPerViolation + monotonyPenalty,
  );
  const unavailablePenalty = cents(input.option.unavailable.length * w.unavailableItemPenalty);

  let budgetPenalty = 0;
  if (input.budget.targetCents !== undefined) {
    const overrun = input.option.groceryCents - input.budget.targetCents;
    if (overrun > 0) budgetPenalty = (overrun / 100) * w.budgetOverrunPerEuro;
  }

  const total =
    input.option.practicalTotalCents +
    input.nutrition.penaltyCents +
    wastePenalty +
    repetitionPenalty +
    input.preferencePenaltyCents +
    budgetPenalty +
    unavailablePenalty;

  return {
    practicalTotalCents: input.option.practicalTotalCents,
    nutritionPenaltyCents: input.nutrition.penaltyCents,
    wastePenaltyCents: wastePenalty,
    repetitionPenaltyCents: repetitionPenalty,
    preferencePenaltyCents: input.preferencePenaltyCents,
    budgetPenaltyCents: cents(budgetPenalty),
    unavailablePenaltyCents: unavailablePenalty,
    totalPenaltyCents: cents(total),
    displayScore: toDisplayScore(total, input.option.practicalTotalCents),
  };
}

/**
 * Turn the penalty into a 0–100 number for the UI.
 *
 * 100 means "nothing but the groceries themselves counted against this week";
 * every euro of penalty on top of the actual bill pulls it down.
 */
function toDisplayScore(totalPenalty: number, practicalTotal: number): number {
  if (practicalTotal <= 0) return 0;
  const overhead = Math.max(0, totalPenalty - practicalTotal) / practicalTotal;
  return Math.round(Math.max(0, Math.min(100, 100 / (1 + overhead))));
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
