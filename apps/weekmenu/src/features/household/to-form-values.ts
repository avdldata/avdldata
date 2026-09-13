import type { HouseholdMember } from '@/domain/household/types';
import type { MemberFormValues } from './schema';

/** Domain member -> the string-shaped values the form works with. */
export function toMemberFormValues(member: HouseholdMember): MemberFormValues {
  return {
    id: member.id,
    name: member.name,
    ageYears: member.ageYears === undefined ? '' : String(member.ageYears),
    birthDate: member.birthDate ?? '',
    sex: member.sex,
    heightCm: member.heightCm === undefined ? '' : String(member.heightCm),
    weightKg: member.weightKg === undefined ? '' : String(member.weightKg),
    activityLevel: member.activityLevel,
    goal: member.goal,
    diet: member.diet,
    pregnant: member.pregnancy?.pregnant === true,
    trimester: member.pregnancy?.trimester === undefined ? '' : String(member.pregnancy.trimester),
    dueDate: member.pregnancy?.dueDate ?? '',
    allergies: [...member.allergies],
    excludedIngredientIds: [...member.excludedIngredientIds],
  };
}
