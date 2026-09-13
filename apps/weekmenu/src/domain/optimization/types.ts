import type { Cents } from '../units';
import type { Recipe } from '../recipes/types';
import type { RecipePortions } from '../nutrition/portions';
import type { MemberNutrition } from '../nutrition/calculate';
import type { WeekIngredientRequirement } from '../aggregation/aggregate';
import type { IngredientLeftoverLedger, WasteSummary } from '../aggregation/leftovers';
import type { ExcludedRecipe } from './filter';
import type { StoreOption } from './store-selection';
import type { Reason } from './reasons';

export interface BudgetSettings {
  /** Soft target: going over is penalised, never forbidden. */
  readonly targetCents?: Cents;
  /** Hard ceiling: weeks above it are rejected outright. */
  readonly hardMaxCents?: Cents;
}

export interface BudgetOutcome {
  readonly targetCents?: Cents;
  readonly hardMaxCents?: Cents;
  readonly met: boolean;
  /** Set when we could not stay within budget without breaking a real rule. */
  readonly shortfallCents?: Cents;
}

export interface DayNutrition {
  readonly kcal: number;
  readonly proteinGrams: number;
  readonly carbGrams: number;
  readonly fatGrams: number;
  readonly fiberGrams: number;
  readonly saltGrams: number;
}

export interface PlannedDayResult {
  readonly dayIndex: number;
  /** ISO date for this day, derived from the plan's start date. */
  readonly date: string;
  readonly recipe: Recipe;
  readonly portions: RecipePortions;
  /** Share of the grocery bill attributable to this day (an allocation, not a purchase). */
  readonly allocatedCostCents: Cents;
  readonly nutrition: DayNutrition;
  readonly reasons: readonly Reason[];
}

export interface WeekScoreBreakdown {
  readonly practicalTotalCents: Cents;
  readonly nutritionPenaltyCents: Cents;
  readonly wastePenaltyCents: Cents;
  readonly repetitionPenaltyCents: Cents;
  readonly preferencePenaltyCents: Cents;
  readonly budgetPenaltyCents: Cents;
  readonly unavailablePenaltyCents: Cents;
  /** Sum of everything above; lower is better. */
  readonly totalPenaltyCents: Cents;
  /** 0–100, for display only. */
  readonly displayScore: number;
}

export interface WeekTotals {
  readonly groceryCents: Cents;
  readonly travelCents: Cents;
  readonly extraStorePenaltyCents: Cents;
  readonly practicalTotalCents: Cents;
  readonly promotionSavingsCents: Cents;
  readonly perPersonCents: Cents;
  readonly perMealCents: Cents;
  readonly perPersonPerMealCents: Cents;
}

export interface WeekNutritionSummary {
  readonly perMember: readonly {
    readonly memberId: string;
    readonly name: string;
    readonly targetDinnerKcal: number;
    readonly averageDinnerKcal: number;
    readonly deviationKcal: number;
  }[];
  readonly averageDailyKcal: number;
  readonly averageDailyProteinGrams: number;
  readonly averageDailyFiberGrams: number;
  readonly averageDailySaltGrams: number;
}

export interface OptimizerDiagnostics {
  readonly totalRecipes: number;
  readonly candidateRecipes: number;
  readonly weeksGenerated: number;
  readonly weeksFullyEvaluated: number;
  readonly storeCombinationsEvaluated: number;
  readonly elapsedMs: number;
}

export interface WeeklyPlan {
  readonly startDate: string;
  readonly days: readonly PlannedDayResult[];
  readonly requirements: readonly WeekIngredientRequirement[];
  readonly pantryItems: readonly WeekIngredientRequirement[];
  readonly leftovers: readonly IngredientLeftoverLedger[];
  readonly waste: WasteSummary;
  readonly recommendedOption: StoreOption;
  readonly alternativeOptions: readonly StoreOption[];
  readonly cheapestOption: StoreOption;
  readonly totals: WeekTotals;
  readonly nutrition: WeekNutritionSummary;
  readonly memberNutrition: readonly MemberNutrition[];
  readonly score: WeekScoreBreakdown;
  readonly reasons: readonly Reason[];
  readonly budget: BudgetOutcome;
  readonly excludedRecipes: readonly ExcludedRecipe[];
  readonly diagnostics: OptimizerDiagnostics;
}

export type OptimizerFailureReason =
  | 'NO_MEMBERS'
  | 'NO_STORES'
  | 'NO_CANDIDATE_RECIPES'
  | 'NOT_ENOUGH_CANDIDATE_RECIPES'
  | 'NO_PRICEABLE_WEEK';

export interface OptimizerFailure {
  readonly status: 'FAILED';
  readonly reason: OptimizerFailureReason;
  readonly message: string;
  readonly excludedRecipes: readonly ExcludedRecipe[];
}

export type OptimizerResult =
  { readonly status: 'OK'; readonly plan: WeeklyPlan } | OptimizerFailure;
