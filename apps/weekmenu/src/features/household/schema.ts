import { z } from 'zod';
import { ACTIVITY_LEVELS, DIETS, GOALS, SEXES } from '@/domain/household/types';
import { ALLERGENS } from '@/domain/ingredients/types';
import { CUISINES, RECIPE_TAGS } from '@/domain/recipes/types';
import { PREFERENCE_LEVELS } from '@/domain/household/types';

export const householdSchema = z.object({
  name: z.string().trim().min(2, 'Geef je huishouden een naam.').max(60),
  postalCode: z
    .string()
    .trim()
    .regex(/^\d{4}\s?[A-Za-z]{2}$/, 'Gebruik een Nederlandse postcode, bijvoorbeeld 9711 LM.'),
  houseNumber: z.string().trim().max(10).optional().or(z.literal('')),
  city: z.string().trim().max(60).optional().or(z.literal('')),
  country: z.string().trim().min(2, 'Vul een land in.'),
});
export type HouseholdInput = z.infer<typeof householdSchema>;

/**
 * Numeric fields arrive from the browser as strings and may legitimately be
 * empty. One string-facing schema is the single source of truth for the rules;
 * `memberSchema` below is the same schema with the conversion applied, so the
 * client form and the server action can never disagree about what is valid.
 */
function numericString(min: number, max: number, message: string) {
  return z
    .string()
    .trim()
    .refine((value) => {
      if (value === '') return true;
      const parsed = Number(value);
      return Number.isFinite(parsed) && parsed >= min && parsed <= max;
    }, message);
}

export const memberFormSchema = z
  .object({
    id: z.string().optional(),
    name: z.string().trim().min(1, 'Vul een naam in.').max(40),
    ageYears: numericString(1, 120, 'Vul een leeftijd tussen 1 en 120 in.'),
    birthDate: z.string().trim(),
    sex: z.enum(SEXES),
    heightCm: numericString(80, 250, 'Vul een lengte tussen 80 en 250 cm in.'),
    weightKg: numericString(20, 350, 'Vul een gewicht tussen 20 en 350 kg in.'),
    activityLevel: z.enum(ACTIVITY_LEVELS),
    goal: z.enum(GOALS),
    diet: z.enum(DIETS),
    pregnant: z.boolean(),
    trimester: z.string().trim(),
    dueDate: z.string().trim(),
    allergies: z.array(z.enum(ALLERGENS)),
    excludedIngredientIds: z.array(z.string()),
  })
  .refine((member) => member.ageYears !== '' || member.birthDate !== '', {
    message: 'Vul een leeftijd of een geboortedatum in.',
    path: ['ageYears'],
  });

export type MemberFormValues = z.infer<typeof memberFormSchema>;

const toNumber = (value: string): number | undefined => (value === '' ? undefined : Number(value));

export const memberSchema = memberFormSchema.transform((values) => ({
  ...(values.id !== undefined ? { id: values.id } : {}),
  name: values.name,
  ageYears: toNumber(values.ageYears),
  birthDate: values.birthDate === '' ? undefined : values.birthDate,
  sex: values.sex,
  heightCm: toNumber(values.heightCm),
  weightKg: toNumber(values.weightKg),
  activityLevel: values.activityLevel,
  goal: values.goal,
  diet: values.diet,
  pregnant: values.pregnant,
  trimester: toNumber(values.trimester),
  dueDate: values.dueDate === '' ? undefined : values.dueDate,
  allergies: values.allergies,
  excludedIngredientIds: values.excludedIngredientIds,
}));

export type MemberInput = MemberFormValues;
export type MemberValues = z.output<typeof memberSchema>;

export const EMPTY_MEMBER: MemberFormValues = {
  name: '',
  ageYears: '',
  birthDate: '',
  sex: 'vrouw',
  heightCm: '',
  weightKg: '',
  activityLevel: 'licht-actief',
  goal: 'behouden',
  diet: 'alles',
  pregnant: false,
  trimester: '',
  dueDate: '',
  allergies: [],
  excludedIngredientIds: [],
};

export const preferenceEntrySchema = z.object({
  value: z.string(),
  level: z.enum(PREFERENCE_LEVELS),
});

export const preferencesSchema = z.object({
  cuisines: z
    .array(z.object({ value: z.enum(CUISINES), level: z.enum(PREFERENCE_LEVELS) }))
    .default([]),
  tags: z
    .array(z.object({ value: z.enum(RECIPE_TAGS), level: z.enum(PREFERENCE_LEVELS) }))
    .default([]),
  ingredients: z.array(preferenceEntrySchema).default([]),
});
export type PreferencesInput = z.infer<typeof preferencesSchema>;

export const SEX_LABELS: Record<(typeof SEXES)[number], string> = {
  man: 'Man',
  vrouw: 'Vrouw',
  anders: 'Anders / zeg ik liever niet',
};

export const ACTIVITY_LABELS: Record<(typeof ACTIVITY_LEVELS)[number], string> = {
  zittend: 'Zittend werk, weinig beweging',
  'licht-actief': 'Licht actief (1–2× sporten per week)',
  'matig-actief': 'Matig actief (3–4× sporten per week)',
  'zeer-actief': 'Zeer actief (5–6× sporten per week)',
  'extreem-actief': 'Extreem actief (zwaar werk of dagelijks sporten)',
};

export const GOAL_LABELS: Record<(typeof GOALS)[number], string> = {
  behouden: 'Gewicht behouden',
  afvallen: 'Afvallen',
  aankomen: 'Aankomen',
  'geen-doel': 'Geen specifiek doel',
};

export const DIET_LABELS: Record<(typeof DIETS)[number], string> = {
  alles: 'Eet alles',
  vegetarisch: 'Vegetarisch',
  veganistisch: 'Veganistisch',
  pescotarisch: 'Pescotarisch (wel vis, geen vlees)',
};

export const ALLERGEN_LABELS: Record<string, string> = {
  gluten: 'Gluten',
  schaaldieren: 'Schaaldieren',
  ei: 'Ei',
  vis: 'Vis',
  pinda: 'Pinda',
  soja: 'Soja',
  melk: 'Melk / lactose',
  noten: 'Noten',
  selderij: 'Selderij',
  mosterd: 'Mosterd',
  sesam: 'Sesam',
  sulfiet: 'Sulfiet',
  lupine: 'Lupine',
  weekdieren: 'Weekdieren',
};

export const CUISINE_LABELS: Record<string, string> = {
  nederlands: 'Nederlands',
  italiaans: 'Italiaans',
  mexicaans: 'Mexicaans',
  aziatisch: 'Aziatisch',
  mediterraan: 'Mediterraan',
  indiaas: 'Indiaas',
  grieks: 'Grieks',
  frans: 'Frans',
};

export const TAG_LABELS: Record<string, string> = {
  pasta: 'Pasta',
  rijst: 'Rijst',
  aardappelen: 'Aardappelen',
  wraps: 'Wraps',
  brood: 'Brood',
  peulvruchten: 'Peulvruchten',
  noedels: 'Noedels',
  vegetarisch: 'Vegetarisch',
  veganistisch: 'Veganistisch',
  vis: 'Vis',
  kip: 'Kip',
  rundvlees: 'Rundvlees',
  varkensvlees: 'Varkensvlees',
  ovenschotel: 'Ovenschotel',
  eenpansgerecht: 'Eenpansgerecht',
  soep: 'Soep',
  salade: 'Salade',
  snel: 'Snel klaar',
  budget: 'Budgetvriendelijk',
  comfortfood: 'Comfortfood',
};

/** The subset of tags worth showing on the preferences screen. */
export const PREFERENCE_TAGS = [
  'pasta',
  'rijst',
  'aardappelen',
  'wraps',
  'noedels',
  'peulvruchten',
  'vis',
  'kip',
  'rundvlees',
  'varkensvlees',
  'vegetarisch',
  'ovenschotel',
  'eenpansgerecht',
  'soep',
  'salade',
  'snel',
] as const;
