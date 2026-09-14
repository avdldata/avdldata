import { ageFromBirthDate, type HouseholdMember, type Trimester } from '../household/types';
import { DEFAULT_NUTRITION_CONFIG, type NutritionConfig } from './config';

/** How much we trust the estimate, given what the member actually filled in. */
export type EstimateQuality = 'high' | 'medium' | 'low';

export interface MemberNutrition {
  readonly memberId: string;
  readonly name: string;
  /** Basal metabolic rate (Mifflin-St Jeor), kcal/day. */
  readonly bmrKcal: number;
  /** Total daily energy expenditure = BMR × activity factor, kcal/day. */
  readonly tdeeKcal: number;
  /** TDEE adjusted for goal and pregnancy, floored at a safe minimum. */
  readonly targetEnergyKcal: number;
  /** The slice of target energy that dinner should cover. */
  readonly dinnerEnergyKcal: number;
  readonly proteinGuidelineGrams: number;
  readonly fiberGuidelineGrams: number;
  readonly estimateQuality: EstimateQuality;
  /** Human-readable notes about assumptions made (missing weight, etc.). */
  readonly assumptions: readonly string[];
}

/**
 * Estimate one member's energy and macro guidelines.
 *
 * Mifflin-St Jeor for BMR, an activity factor for TDEE, then a goal delta and
 * a pregnancy allowance. Missing data never throws: we substitute a documented
 * population average and lower `estimateQuality` so the UI can be honest about it.
 *
 * `today` is passed in rather than read from a clock — the whole domain is
 * deterministic and testable.
 */
export function calculateMemberNutrition(
  member: HouseholdMember,
  today: Date,
  config: NutritionConfig = DEFAULT_NUTRITION_CONFIG,
): MemberNutrition {
  const assumptions: string[] = [];
  let quality: EstimateQuality = 'high';

  const age = resolveAge(member, today, config);
  if (age.assumed) {
    assumptions.push(`Leeftijd onbekend, we rekenen met ${age.value} jaar.`);
    quality = 'medium';
  }

  let heightCm = member.heightCm;
  if (!heightCm || heightCm <= 0) {
    heightCm = config.fallbackHeightCm[member.sex];
    assumptions.push(`Lengte onbekend, we rekenen met ${heightCm} cm.`);
    quality = 'low';
  }

  let weightKg = member.weightKg;
  if (!weightKg || weightKg <= 0) {
    weightKg = config.fallbackWeightKg[member.sex];
    assumptions.push(`Gewicht onbekend, we rekenen met ${weightKg} kg.`);
    quality = 'low';
  }

  const bmrKcal = mifflinStJeor({ sex: member.sex, weightKg, heightCm, ageYears: age.value });
  const activityFactor = config.activityFactors[member.activityLevel];
  const tdeeKcal = bmrKcal * activityFactor;

  const goalDelta = config.goalDeltaKcal[member.goal];
  const trimester = resolvePregnancyTrimester(member, today);
  const pregnancyExtra = trimester ? config.pregnancyExtraKcal[trimester] : 0;
  if (member.pregnancy?.pregnant && !trimester) {
    assumptions.push('Trimester onbekend, we rekenen zonder extra energie voor zwangerschap.');
  }

  const rawTarget = tdeeKcal + goalDelta + pregnancyExtra;
  const floor = config.minimumDailyKcal[member.sex];
  const targetEnergyKcal = Math.max(floor, rawTarget);
  if (rawTarget < floor) {
    assumptions.push(
      `Doel zou onder ${floor} kcal per dag uitkomen; we houden ${floor} kcal aan als ondergrens.`,
    );
  }

  const proteinGuidelineGrams =
    weightKg * config.proteinGramsPerKg + (trimester ? config.pregnancyExtraProteinGrams : 0);

  return {
    memberId: member.id,
    name: member.name,
    bmrKcal: round(bmrKcal),
    tdeeKcal: round(tdeeKcal),
    targetEnergyKcal: round(targetEnergyKcal),
    dinnerEnergyKcal: round(targetEnergyKcal * config.dinnerEnergyShare),
    proteinGuidelineGrams: round(proteinGuidelineGrams),
    fiberGuidelineGrams: round((targetEnergyKcal / 1000) * config.fiberGramsPer1000Kcal),
    estimateQuality: quality,
    assumptions,
  };
}

export function calculateHouseholdNutrition(
  members: readonly HouseholdMember[],
  today: Date,
  config: NutritionConfig = DEFAULT_NUTRITION_CONFIG,
): MemberNutrition[] {
  return members.map((m) => calculateMemberNutrition(m, today, config));
}

export function totalDinnerEnergy(nutrition: readonly MemberNutrition[]): number {
  return nutrition.reduce((sum, n) => sum + n.dinnerEnergyKcal, 0);
}

export function mifflinStJeor(input: {
  sex: HouseholdMember['sex'];
  weightKg: number;
  heightCm: number;
  ageYears: number;
}): number {
  const base = 10 * input.weightKg + 6.25 * input.heightCm - 5 * input.ageYears;
  switch (input.sex) {
    case 'man':
      return base + 5;
    case 'vrouw':
      return base - 161;
    case 'anders':
      // No sex-specific constant applies; use the midpoint of the two.
      return base + (5 - 161) / 2;
  }
}

function resolveAge(
  member: HouseholdMember,
  today: Date,
  config: NutritionConfig = DEFAULT_NUTRITION_CONFIG,
): { value: number; assumed: boolean } {
  if (member.birthDate) {
    try {
      const age = ageFromBirthDate(member.birthDate, today);
      if (age >= 0 && age < 130) return { value: age, assumed: false };
    } catch {
      // fall through to the other sources
    }
  }
  if (member.ageYears && member.ageYears > 0) return { value: member.ageYears, assumed: false };
  return { value: config.fallbackAgeYears, assumed: true };
}

/**
 * Trimester from the explicit field, or derived from a due date.
 * A 40-week pregnancy: weeks 1-13 first, 14-27 second, 28+ third.
 */
export function resolvePregnancyTrimester(
  member: HouseholdMember,
  today: Date,
): Trimester | undefined {
  const pregnancy = member.pregnancy;
  if (!pregnancy?.pregnant) return undefined;
  if (pregnancy.trimester) return pregnancy.trimester;
  if (!pregnancy.dueDate) return undefined;

  const due = new Date(`${pregnancy.dueDate}T00:00:00Z`);
  if (Number.isNaN(due.getTime())) return undefined;

  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  const weeksRemaining = (due.getTime() - today.getTime()) / msPerWeek;
  const gestationalWeek = 40 - weeksRemaining;
  if (gestationalWeek < 0 || gestationalWeek > 45) return undefined;
  if (gestationalWeek < 14) return 1;
  if (gestationalWeek < 28) return 2;
  return 3;
}

function round(value: number): number {
  return Math.round(value);
}
