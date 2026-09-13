import type { ActivityLevel, Goal, Sex, Trimester } from '../household/types';

/**
 * Every number the nutrition engine uses lives here. Nothing in the
 * calculations is a bare literal, so tuning the model — or exposing a slider —
 * never means hunting through the code.
 *
 * These are population-level guideline values, not medical advice.
 */
export interface NutritionConfig {
  /** Share of daily energy that dinner represents. */
  readonly dinnerEnergyShare: number;
  readonly activityFactors: Readonly<Record<ActivityLevel, number>>;
  /** Daily energy delta per goal, in kcal. */
  readonly goalDeltaKcal: Readonly<Record<Goal, number>>;
  /** Extra daily energy per pregnancy trimester, in kcal. */
  readonly pregnancyExtraKcal: Readonly<Record<Trimester, number>>;
  /** Extra daily protein during pregnancy, in grams. */
  readonly pregnancyExtraProteinGrams: number;
  readonly proteinGramsPerKg: number;
  readonly fiberGramsPer1000Kcal: number;
  /** Never advise below this, whatever the goal says. */
  readonly minimumDailyKcal: Readonly<Record<Sex, number>>;
  /** Used when height or weight is unknown, so the app degrades instead of failing. */
  readonly fallbackHeightCm: Readonly<Record<Sex, number>>;
  readonly fallbackWeightKg: Readonly<Record<Sex, number>>;
  readonly fallbackAgeYears: number;
  readonly portionScaling: PortionScalingConfig;
}

export interface PortionScalingConfig {
  readonly minFactor: number;
  readonly maxFactor: number;
  /** Portions are rounded to this step so the kitchen instruction stays sane. */
  readonly step: number;
}

export const DEFAULT_NUTRITION_CONFIG: NutritionConfig = {
  dinnerEnergyShare: 0.3,
  activityFactors: {
    zittend: 1.2,
    'licht-actief': 1.375,
    'matig-actief': 1.55,
    'zeer-actief': 1.725,
    'extreem-actief': 1.9,
  },
  goalDeltaKcal: {
    behouden: 0,
    afvallen: -400,
    aankomen: 300,
    'geen-doel': 0,
  },
  pregnancyExtraKcal: { 1: 0, 2: 340, 3: 450 },
  pregnancyExtraProteinGrams: 25,
  proteinGramsPerKg: 1.0,
  fiberGramsPer1000Kcal: 14,
  minimumDailyKcal: { man: 1500, vrouw: 1200, anders: 1300 },
  fallbackHeightCm: { man: 180, vrouw: 168, anders: 174 },
  fallbackWeightKg: { man: 82, vrouw: 70, anders: 76 },
  fallbackAgeYears: 35,
  portionScaling: { minFactor: 0.6, maxFactor: 2.0, step: 0.05 },
};
