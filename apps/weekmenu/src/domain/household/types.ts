import type { Allergen, IngredientId } from '../ingredients/types';
import type { Cuisine, RecipeTag } from '../recipes/types';

export const SEXES = ['man', 'vrouw', 'anders'] as const;
export type Sex = (typeof SEXES)[number];

export const ACTIVITY_LEVELS = [
  'zittend',
  'licht-actief',
  'matig-actief',
  'zeer-actief',
  'extreem-actief',
] as const;
export type ActivityLevel = (typeof ACTIVITY_LEVELS)[number];

export const GOALS = ['behouden', 'afvallen', 'aankomen', 'geen-doel'] as const;
export type Goal = (typeof GOALS)[number];

export const DIETS = ['alles', 'vegetarisch', 'veganistisch', 'pescotarisch'] as const;
export type Diet = (typeof DIETS)[number];

export const TRIMESTERS = [1, 2, 3] as const;
export type Trimester = (typeof TRIMESTERS)[number];

export type MemberId = string;
export type HouseholdId = string;

export interface PregnancyInfo {
  readonly pregnant: true;
  readonly trimester?: Trimester;
  /** ISO date (yyyy-mm-dd). Optional and only used to derive the trimester. */
  readonly dueDate?: string;
}

export interface HouseholdMember {
  readonly id: MemberId;
  readonly name: string;
  /** ISO date; `ageYears` is used when the birth date is unknown. */
  readonly birthDate?: string;
  readonly ageYears?: number;
  readonly sex: Sex;
  readonly heightCm?: number;
  readonly weightKg?: number;
  readonly activityLevel: ActivityLevel;
  readonly goal: Goal;
  readonly diet: Diet;
  readonly pregnancy?: PregnancyInfo;
  readonly allergies: readonly Allergen[];
  /** Free intolerances expressed as canonical ingredient exclusions. */
  readonly excludedIngredientIds: readonly IngredientId[];
}

export const LOCATION_PRECISION = ['exact', 'postcode', 'onbekend'] as const;
export type LocationPrecision = (typeof LOCATION_PRECISION)[number];

/**
 * Household location. Coordinates are only stored when they are needed to find
 * nearby stores, and are treated as personal data throughout (see PRIVACY in
 * ARCHITECTURE.md).
 */
export interface HouseholdLocation {
  readonly postalCode: string;
  readonly houseNumber?: string;
  readonly city: string;
  readonly country: string;
  readonly latitude?: number;
  readonly longitude?: number;
  readonly precision: LocationPrecision;
}

export const PREFERENCE_LEVELS = ['LIKE', 'NEUTRAL', 'DISLIKE', 'EXCLUDE'] as const;
export type PreferenceLevel = (typeof PREFERENCE_LEVELS)[number];

export interface Preference<T extends string> {
  readonly value: T;
  readonly level: PreferenceLevel;
}

/**
 * Taste preferences. `EXCLUDE` is a hard constraint and can never be scored
 * away; `LIKE` / `DISLIKE` only nudge the objective function.
 */
export interface Preferences {
  readonly ingredients: readonly Preference<IngredientId>[];
  readonly cuisines: readonly Preference<Cuisine>[];
  readonly tags: readonly Preference<RecipeTag>[];
}

export const EMPTY_PREFERENCES: Preferences = {
  ingredients: [],
  cuisines: [],
  tags: [],
};

export interface Household {
  readonly id: HouseholdId;
  readonly name: string;
  readonly location: HouseholdLocation;
  readonly members: readonly HouseholdMember[];
  readonly preferences: Preferences;
}

export function preferenceLevelFor<T extends string>(
  preferences: readonly Preference<T>[],
  value: T,
): PreferenceLevel {
  return preferences.find((p) => p.value === value)?.level ?? 'NEUTRAL';
}

/** Every ingredient the household may not eat, from any member, for any reason. */
export function hardExcludedIngredientIds(household: Household): ReadonlySet<IngredientId> {
  const excluded = new Set<IngredientId>();
  for (const member of household.members) {
    for (const id of member.excludedIngredientIds) excluded.add(id);
  }
  for (const preference of household.preferences.ingredients) {
    if (preference.level === 'EXCLUDE') excluded.add(preference.value);
  }
  return excluded;
}

/** Every allergen anyone in the household reacts to. */
export function householdAllergens(household: Household): ReadonlySet<Allergen> {
  const allergens = new Set<Allergen>();
  for (const member of household.members) {
    for (const allergen of member.allergies) allergens.add(allergen);
  }
  return allergens;
}

export function householdRequiresVegetarian(household: Household): boolean {
  return household.members.some((m) => m.diet === 'vegetarisch' || m.diet === 'veganistisch');
}

export function householdRequiresVegan(household: Household): boolean {
  return household.members.some((m) => m.diet === 'veganistisch');
}

export function householdRequiresPescetarianSafe(household: Household): boolean {
  return household.members.some((m) => m.diet === 'pescotarisch');
}

export function householdHasPregnancy(household: Household): boolean {
  return household.members.some((m) => m.pregnancy?.pregnant === true);
}

/** Derive age in whole years from a birth date, relative to an explicit "today". */
export function ageFromBirthDate(birthDate: string, today: Date): number {
  const born = new Date(`${birthDate}T00:00:00Z`);
  if (Number.isNaN(born.getTime())) {
    throw new RangeError(`Invalid birth date: ${birthDate}`);
  }
  let age = today.getUTCFullYear() - born.getUTCFullYear();
  const monthDiff = today.getUTCMonth() - born.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getUTCDate() < born.getUTCDate())) age -= 1;
  return age;
}
