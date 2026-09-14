import { type Cents, euros } from '../units';
import { DEFAULT_LEFTOVER_CONFIG, type LeftoverConfig } from '../aggregation/leftovers';
import { DEFAULT_PACKAGING_CONFIG, type PackagingConfig } from '../packaging/types';
import { DEFAULT_NUTRITION_CONFIG, type NutritionConfig } from '../nutrition/config';
import { DEFAULT_TRIP_COST_CONFIG, type TripCostConfig } from '../trip/trip-cost';

export const CONVENIENCE_PREFERENCES = ['laagste-prijs', 'gebalanceerd', 'gemak'] as const;
export type ConveniencePreference = (typeof CONVENIENCE_PREFERENCES)[number];

/**
 * How much an extra supermarket has to save before it is worth the detour,
 * on top of the actual travel cost. Expressed in euro-equivalents so the
 * trade-off is legible: "wij tellen een tweede winkel als €2,50 extra moeite".
 */
export const EXTRA_STORE_PENALTY_BY_PREFERENCE: Readonly<Record<ConveniencePreference, Cents>> = {
  'laagste-prijs': euros(0),
  gebalanceerd: euros(2.5),
  gemak: euros(8),
};

export const DEFAULT_CONVENIENCE_PREFERENCE: ConveniencePreference = 'gebalanceerd';

/**
 * The extra-store allowance for a preference, tolerating a value the type
 * system cannot vouch for.
 *
 * Settings are persisted as JSON and outlive the code that wrote them: a
 * preference renamed in a later version would otherwise reach the objective
 * function as `undefined`, turn the whole score into NaN and take week
 * generation down. Falling back to the middle setting is the honest answer.
 */
export function extraStorePenaltyFor(preference: string): Cents {
  return (
    EXTRA_STORE_PENALTY_BY_PREFERENCE[preference as ConveniencePreference] ??
    EXTRA_STORE_PENALTY_BY_PREFERENCE[DEFAULT_CONVENIENCE_PREFERENCE]
  );
}

export interface DiversityConfig {
  readonly maxPastaDishes: number;
  readonly maxSoupDishes: number;
  readonly maxSamePrimaryProtein: number;
  readonly maxConsecutiveSameCuisine: number;
  readonly maxSameCuisine: number;
  /** Two dishes sharing this fraction of tags count as near-duplicates. */
  readonly nearDuplicateTagOverlap: number;
}

export const DEFAULT_DIVERSITY_CONFIG: DiversityConfig = {
  maxPastaDishes: 2,
  maxSoupDishes: 1,
  maxSamePrimaryProtein: 3,
  maxConsecutiveSameCuisine: 2,
  maxSameCuisine: 3,
  nearDuplicateTagOverlap: 0.8,
};

/**
 * The objective function's weights.
 *
 * Everything is expressed in eurocent-equivalents and summed into a single
 * penalty (lower is better). That makes the trade-offs auditable — you can read
 * "this week scored 340 cents of nutrition penalty" — and it keeps the ordering
 * required by the product: hard constraints are filters, then health, then
 * budget, then price, then waste, then preference, then variety, then convenience.
 */
export interface ObjectiveWeights {
  /** Penalty per 100 kcal that a member's plate deviates from their dinner target. */
  readonly nutritionKcalDeviationPer100: Cents;
  /** Penalty per gram of protein below the household guideline for dinner. */
  readonly proteinShortfallPerGram: Cents;
  /** Penalty per gram of salt above the dinner guideline over the week. */
  readonly saltExcessPerGram: Cents;
  /** Penalty per gram of fibre below the dinner guideline over the week. */
  readonly fiberShortfallPerGram: Cents;
  /**
   * Penalty per weighted KILO of waste. Expressed per kilo rather than per
   * gram on purpose: a per-gram weight would round to zero cents and silently
   * disable the term.
   */
  readonly wastePerKilo: Cents;
  /** Penalty per euro over a *target* budget (a hard maximum is a filter instead). */
  readonly budgetOverrunPerEuro: Cents;
  /** Penalty for each dish beyond the diversity comfort zone. */
  readonly repetitionPerViolation: Cents;
  /** Penalty for each DISLIKE hit, bonus (negative) for each LIKE hit. */
  readonly dislikePenalty: Cents;
  readonly likeBonus: Cents;
  /** Penalty for an ingredient we could not source anywhere. */
  readonly unavailableItemPenalty: Cents;
  /** Full penalty for a completely monotonous week; scaled by the variety score. */
  readonly monotonyPenalty: Cents;
}

export const DEFAULT_OBJECTIVE_WEIGHTS: ObjectiveWeights = {
  nutritionKcalDeviationPer100: euros(0.6),
  proteinShortfallPerGram: euros(0.08),
  saltExcessPerGram: euros(0.3),
  fiberShortfallPerGram: euros(0.05),
  wastePerKilo: euros(1.5),
  budgetOverrunPerEuro: euros(1.5),
  repetitionPerViolation: euros(1.2),
  dislikePenalty: euros(1.5),
  likeBonus: euros(0.6),
  unavailableItemPenalty: euros(6),
  monotonyPenalty: euros(6),
};

export interface LocalSearchConfig {
  readonly enabled: boolean;
  /** Rounds of "swap one dish and see"; each round is a full sweep. */
  readonly maxIterations: number;
  /**
   * Stop starting new sweeps once this many neighbours have been priced. The
   * sweep in progress always finishes, so the true ceiling is this plus one
   * sweep (days × pool) — bounded, and without favouring the earlier days.
   */
  readonly maxEvaluations: number;
}

export interface SearchConfig {
  /** Candidate recipes considered per day slot. */
  readonly candidatesPerSlot: number;
  /** Beam width for the partial-week search. */
  readonly beamWidth: number;
  /** Complete weeks that get the full pricing treatment. */
  readonly fullyEvaluatedWeeks: number;
  /** Swap-one-dish refinement of the best fully priced week. */
  readonly localSearch: LocalSearchConfig;
}

/**
 * Search settings, every one of them measured rather than guessed.
 *
 * The ablation (see OPTIMIZER_BENCHMARK.md) settled three questions:
 *
 * `beamWidth` 100 rather than 40. Widening the beam alone barely helps — 89 %
 * to 90 % exact — because the true optimum sits at a median rank of 41 among
 * the weeks the beam produces, so you would have to price hundreds of them to
 * collect it. Widening it *underneath* the swap refinement is a different
 * story: it changes which twenty weeks get priced, and so where the refinement
 * starts from. That took the worst case from 4,4 % to 1,8 % for about five
 * milliseconds.
 *
 * `fullyEvaluatedWeeks` stays at 20. Raising it to 50 or 100 costs two to three
 * times the runtime and, with the refinement in play, measured slightly *worse*
 * — a better starting week can still walk into a worse local optimum. More work
 * for less quality is an easy call.
 *
 * `maxEvaluations` 200. The refinement converges long before that in the small
 * worlds; the cap exists for large catalogues, where a sweep is wider.
 */
export const DEFAULT_SEARCH_CONFIG: SearchConfig = {
  candidatesPerSlot: 25,
  beamWidth: 100,
  fullyEvaluatedWeeks: 20,
  localSearch: { enabled: true, maxIterations: 8, maxEvaluations: 200 },
};

export interface OptimizerConfig {
  readonly nutrition: NutritionConfig;
  readonly packaging: PackagingConfig;
  readonly leftovers: LeftoverConfig;
  readonly trip: TripCostConfig;
  readonly diversity: DiversityConfig;
  readonly weights: ObjectiveWeights;
  readonly search: SearchConfig;
  /** Number of days in a plan. Seven for V1; the engine does not assume it. */
  readonly days: number;
}

export const DEFAULT_OPTIMIZER_CONFIG: OptimizerConfig = {
  nutrition: DEFAULT_NUTRITION_CONFIG,
  packaging: DEFAULT_PACKAGING_CONFIG,
  leftovers: DEFAULT_LEFTOVER_CONFIG,
  trip: DEFAULT_TRIP_COST_CONFIG,
  diversity: DEFAULT_DIVERSITY_CONFIG,
  weights: DEFAULT_OBJECTIVE_WEIGHTS,
  search: DEFAULT_SEARCH_CONFIG,
  days: 7,
};
