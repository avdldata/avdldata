import 'server-only';
import { randomUUID } from 'node:crypto';
import type { Household, HouseholdMember, Preferences } from '@/domain/household/types';
import { SeedPostcodeGeocoder } from '@/providers/geocoder/seed-geocoder';
import type { GeocoderProvider } from '@/providers/geocoder/types';
import type { HouseholdInput, MemberValues, PreferencesInput } from '@/features/household/schema';

const geocoder: GeocoderProvider = new SeedPostcodeGeocoder();

/**
 * Resolve a postal code to coordinates.
 *
 * We only store a location at all because the app has to know which shops are
 * actually reachable. The seeded geocoder is postcode-level on purpose, and the
 * precision we managed is recorded on the household so the UI can be honest
 * about it.
 */
export async function locateHousehold(input: HouseholdInput) {
  const result = await geocoder.geocode({
    postalCode: input.postalCode,
    ...(input.houseNumber ? { houseNumber: input.houseNumber } : {}),
    country: input.country,
  });

  return {
    postalCode: input.postalCode.toUpperCase().replace(/\s+/g, ' ').trim(),
    ...(input.houseNumber ? { houseNumber: input.houseNumber } : {}),
    city: input.city || result?.city || '',
    country: input.country || 'Nederland',
    ...(result ? { latitude: result.latitude, longitude: result.longitude } : {}),
    precision: result ? result.precision : ('onbekend' as const),
  };
}

/** Turn validated form values into a domain member. */
export function toDomainMember(values: MemberValues): HouseholdMember {
  return {
    id: values.id ?? randomUUID(),
    name: values.name,
    ...(values.birthDate ? { birthDate: values.birthDate } : {}),
    ...(values.ageYears !== undefined ? { ageYears: values.ageYears } : {}),
    sex: values.sex,
    ...(values.heightCm !== undefined ? { heightCm: values.heightCm } : {}),
    ...(values.weightKg !== undefined ? { weightKg: values.weightKg } : {}),
    activityLevel: values.activityLevel,
    goal: values.goal,
    diet: values.diet,
    ...(values.pregnant
      ? {
          pregnancy: {
            pregnant: true as const,
            ...(values.trimester ? { trimester: values.trimester as 1 | 2 | 3 } : {}),
            ...(values.dueDate ? { dueDate: values.dueDate } : {}),
          },
        }
      : {}),
    allergies: values.allergies,
    excludedIngredientIds: values.excludedIngredientIds,
  };
}

export function toDomainPreferences(input: PreferencesInput): Preferences {
  return {
    ingredients: input.ingredients,
    cuisines: input.cuisines,
    tags: input.tags,
  };
}

export function newHouseholdId(): string {
  return randomUUID();
}

/** Merge form values into an existing household, keeping what was not edited. */
export function withLocation(
  household: Household,
  location: Awaited<ReturnType<typeof locateHousehold>>,
  name: string,
): Household {
  return { ...household, name, location };
}
