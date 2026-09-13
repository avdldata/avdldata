import { cents, type Cents } from '@/domain/units';
import type { BaseUnit } from '@/domain/units';
import type { ProductOffer, Promotion, PromotionParams } from '@/domain/stores/types';
import type {
  CanonicalIngredient,
  IngredientCategory,
  Perishability,
} from '@/domain/ingredients/types';
import type { NutritionPer100 } from '@/domain/nutrition/facts';
import type { NutritionPerServing, Recipe } from '@/domain/recipes/types';
import type { HouseholdMember, Household } from '@/domain/household/types';

let counter = 0;
const nextId = (prefix: string): string => `${prefix}-${(counter += 1)}`;

export function makeOffer(options: {
  ingredientId?: string;
  packAmount: number;
  unit?: BaseUnit;
  priceCents: number;
  normalPriceCents?: number;
  promotion?: Promotion;
  chainId?: string;
  locationId?: string;
  productId?: string;
  name?: string;
  brandName?: string;
  isPrivateLabel?: boolean;
  nutritionPer100?: NutritionPer100;
  nutritionOrigin?: ProductOffer['nutritionOrigin'];
}): ProductOffer {
  const productId = options.productId ?? nextId('product');
  const price = cents(options.priceCents);
  return {
    productId,
    chainId: options.chainId ?? 'chain-a',
    locationId: options.locationId ?? 'location-a',
    ingredientId: options.ingredientId ?? 'ingredient-a',
    name: options.name ?? productId,
    brandName: options.brandName ?? 'Test',
    isPrivateLabel: options.isPrivateLabel ?? true,
    packageAmount: { amount: options.packAmount, unit: options.unit ?? 'g' },
    normalUnitPriceCents: cents(options.normalPriceCents ?? options.priceCents),
    unitPriceCents: price,
    ...(options.promotion ? { promotion: options.promotion } : {}),
    pricePerBaseUnitCents: price / options.packAmount,
    ...(options.nutritionPer100 ? { nutritionPer100: options.nutritionPer100 } : {}),
    nutritionOrigin: options.nutritionOrigin ?? (options.nutritionPer100 ? 'product' : 'none'),
  };
}

export function makePromotion(
  params: PromotionParams,
  options: { minUnits?: number; validFrom?: string; validUntil?: string; label?: string } = {},
): Promotion {
  return {
    id: nextId('promo'),
    productId: 'ignored',
    scope: { kind: 'chain', chainId: 'chain-a' },
    params,
    minUnits: options.minUnits ?? 1,
    validFrom: options.validFrom ?? '2020-01-01',
    validUntil: options.validUntil ?? '2099-12-31',
    label: options.label ?? 'Actie',
  };
}

export const fixedPrice = (unitPriceCents: number): PromotionParams => ({
  type: 'FIXED_PRICE',
  unitPriceCents: cents(unitPriceCents),
});
export const percentOff = (percent: number): PromotionParams => ({ type: 'PERCENT_OFF', percent });
export const onePlusOne = (): PromotionParams => ({ type: 'ONE_PLUS_ONE' });
export const nForX = (bundleSize: number, bundlePriceCents: number): PromotionParams => ({
  type: 'N_FOR_X',
  bundleSize,
  bundlePriceCents: cents(bundlePriceCents),
});

export function makeIngredient(
  id: string,
  options: Partial<CanonicalIngredient> & {
    category?: IngredientCategory;
    perishability?: Perishability;
    nutritionPer100?: NutritionPer100;
  } = {},
): CanonicalIngredient {
  return {
    id,
    canonicalName: options.canonicalName ?? id,
    category: options.category ?? 'overig',
    baseUnit: options.baseUnit ?? 'g',
    perishability: options.perishability ?? 'perishable',
    allergens: options.allergens ?? [],
    pregnancyRisks: options.pregnancyRisks ?? [],
    vegetarian: options.vegetarian ?? true,
    vegan: options.vegan ?? true,
    ...(options.nutritionPer100
      ? { nutritionPer100: options.nutritionPer100, nutritionSource: 'demo-seed' as const }
      : {}),
    ...(options.density !== undefined ? { density: options.density } : {}),
    ...(options.pieceWeightGrams !== undefined
      ? { pieceWeightGrams: options.pieceWeightGrams }
      : {}),
    ...(options.pantryStaple ? { pantryStaple: true } : {}),
  };
}

const DEFAULT_NUTRITION: NutritionPerServing = {
  kcal: 600,
  proteinGrams: 30,
  carbGrams: 70,
  fatGrams: 18,
  fiberGrams: 8,
  saltGrams: 1.5,
};

export function makeRecipe(id: string, options: Partial<Recipe> = {}): Recipe {
  return {
    id,
    name: options.name ?? id,
    description: options.description ?? '',
    imageUrl: options.imageUrl ?? '',
    steps: options.steps ?? ['stap'],
    prepMinutes: options.prepMinutes ?? 10,
    cookMinutes: options.cookMinutes ?? 20,
    totalMinutes: (options.prepMinutes ?? 10) + (options.cookMinutes ?? 20),
    difficulty: options.difficulty ?? 'makkelijk',
    cuisine: options.cuisine ?? 'nederlands',
    tags: options.tags ?? [],
    baseServings: options.baseServings ?? 4,
    ingredients: options.ingredients ?? [],
    nutritionPerServing: options.nutritionPerServing ?? DEFAULT_NUTRITION,
    authoredNutritionPerServing:
      options.authoredNutritionPerServing ?? options.nutritionPerServing ?? DEFAULT_NUTRITION,
    nutritionSource: options.nutritionSource ?? 'authored',
    nutritionCoverage: options.nutritionCoverage ?? 1,
    primaryProtein: options.primaryProtein ?? 'geen',
    allergens: options.allergens ?? [],
    vegetarian: options.vegetarian ?? true,
    vegan: options.vegan ?? false,
    pregnancySuitable: options.pregnancySuitable ?? true,
    pregnancyRiskReasons: options.pregnancyRiskReasons ?? [],
  };
}

export function makeMember(options: Partial<HouseholdMember> = {}): HouseholdMember {
  return {
    id: options.id ?? nextId('member'),
    name: options.name ?? 'Test',
    sex: options.sex ?? 'man',
    activityLevel: options.activityLevel ?? 'licht-actief',
    goal: options.goal ?? 'behouden',
    diet: options.diet ?? 'alles',
    allergies: options.allergies ?? [],
    excludedIngredientIds: options.excludedIngredientIds ?? [],
    ...(options.ageYears !== undefined ? { ageYears: options.ageYears } : {}),
    ...(options.birthDate !== undefined ? { birthDate: options.birthDate } : {}),
    ...(options.heightCm !== undefined ? { heightCm: options.heightCm } : {}),
    ...(options.weightKg !== undefined ? { weightKg: options.weightKg } : {}),
    ...(options.pregnancy !== undefined ? { pregnancy: options.pregnancy } : {}),
  };
}

export function makeHousehold(options: Partial<Household> = {}): Household {
  return {
    id: options.id ?? 'household-test',
    name: options.name ?? 'Test',
    location: options.location ?? {
      postalCode: '9711 LM',
      city: 'Groningen',
      country: 'Nederland',
      latitude: 53.2194,
      longitude: 6.5665,
      precision: 'postcode',
    },
    members: options.members ?? [makeMember()],
    preferences: options.preferences ?? { ingredients: [], cuisines: [], tags: [] },
  };
}

export const c = (value: number): Cents => cents(value);
