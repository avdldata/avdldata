import { buildIngredientIndex, type CanonicalIngredient } from '@/domain/ingredients/types';
import type { Household, HouseholdMember, Preference, Preferences } from '@/domain/household/types';
import type { Cuisine, PrimaryProtein, Recipe, RecipeTag } from '@/domain/recipes/types';
import type { ProductOffer, Promotion, PromotionParams } from '@/domain/stores/types';
import type { StoreCandidate } from '@/domain/optimization/store-selection';
import type { OptimizerInput } from '@/domain/optimization/week-optimizer';
import {
  DEFAULT_OPTIMIZER_CONFIG,
  type ConveniencePreference,
  type OptimizerConfig,
} from '@/domain/optimization/config';
import { cents, euros, type Cents } from '@/domain/units';

/**
 * Small, complete, exactly solvable worlds.
 *
 * Every scenario is built from one integer seed and nothing else — no clock, no
 * `Math.random`, no file on disk. That is the whole point: when the benchmark
 * reports a 7 % gap on seed 182736, that seed reproduces the case exactly, on
 * any machine, forever. A benchmark you cannot re-enter is a rumour.
 *
 * The scenarios are deliberately tiny (7–12 recipes, a handful of ingredients,
 * one to three shops) because the reference solver prices every combination
 * there is. C(12, 7) is 792 fully costed weeks; C(20, 7) would be 77.520.
 */

/** A 32-bit linear congruential generator: small, fast, and exactly repeatable. */
export class SeededRandom {
  private state: number;

  constructor(readonly seed: number) {
    // Any odd starting point works; this one keeps small seeds from correlating.
    this.state = seed >>> 0 === 0 ? 0x2545f491 : seed >>> 0;
  }

  next(): number {
    this.state = (Math.imul(this.state, 1664525) + 1013904223) >>> 0;
    return this.state / 0x100000000;
  }

  int(lowest: number, highest: number): number {
    return lowest + Math.floor(this.next() * (highest - lowest + 1));
  }

  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)]!;
  }

  /** True with probability `chance`. */
  chance(chance: number): boolean {
    return this.next() < chance;
  }
}

export interface Scenario {
  readonly seed: number;
  readonly input: OptimizerInput;
  /** A one-line description, printed when a benchmark case fails. */
  readonly summary: string;
}

const CUISINES: readonly Cuisine[] = [
  'nederlands',
  'italiaans',
  'mexicaans',
  'aziatisch',
  'mediterraan',
  'indiaas',
];
const PROTEINS: readonly PrimaryProtein[] = ['kip', 'rund', 'vis', 'ei', 'peulvrucht', 'geen'];
const TAG_POOL: readonly RecipeTag[] = [
  'pasta',
  'rijst',
  'aardappelen',
  'snel',
  'budget',
  'eenpansgerecht',
  'comfortfood',
];

function ingredient(index: number, random: SeededRandom): CanonicalIngredient {
  return {
    id: `ing-${index}`,
    canonicalName: `Ingredient ${index}`,
    category: random.pick([
      'groente-fruit',
      'vlees-vis-vega',
      'zuivel',
      'brood-granen',
      'conserven',
    ]),
    baseUnit: 'g',
    perishability: random.pick(['perishable', 'semi', 'pantry']),
    allergens: [],
    pregnancyRisks: [],
    vegetarian: true,
    vegan: true,
    nutritionPer100: {
      kcal: random.int(60, 320),
      protein: random.int(1, 25),
      carbohydrates: random.int(1, 40),
      sugars: random.int(0, 12),
      fat: random.int(0, 20),
      saturatedFat: random.int(0, 8),
      fiber: random.int(0, 8),
      salt: Math.round(random.next() * 15) / 10,
    },
  };
}

function recipe(
  index: number,
  ingredients: readonly CanonicalIngredient[],
  random: SeededRandom,
): Recipe {
  const lineCount = random.int(2, Math.min(5, ingredients.length));
  const chosen = new Set<number>();
  while (chosen.size < lineCount) chosen.add(random.int(0, ingredients.length - 1));

  const lines = [...chosen]
    .sort((a, b) => a - b)
    .map((position) => ({
      ingredientId: ingredients[position]!.id,
      perServing: { amount: random.int(40, 220), unit: 'g' as const },
      optional: false,
    }));

  const kcal = random.int(420, 820);
  const nutrition = {
    kcal,
    proteinGrams: random.int(12, 45),
    carbGrams: random.int(30, 95),
    fatGrams: random.int(8, 38),
    fiberGrams: random.int(2, 14),
    saltGrams: Math.round(random.next() * 30) / 10,
  };

  const tags: RecipeTag[] = [random.pick(TAG_POOL)];
  if (random.chance(0.4)) {
    const second = random.pick(TAG_POOL);
    if (!tags.includes(second)) tags.push(second);
  }

  return {
    id: `rec-${String(index).padStart(2, '0')}`,
    name: `Gerecht ${index}`,
    description: '',
    imageUrl: '',
    steps: [],
    prepMinutes: 10,
    cookMinutes: 20,
    totalMinutes: 30,
    difficulty: 'makkelijk',
    cuisine: random.pick(CUISINES),
    tags,
    baseServings: 4,
    ingredients: lines,
    nutritionPerServing: nutrition,
    authoredNutritionPerServing: nutrition,
    nutritionSource: 'authored',
    nutritionCoverage: 1,
    primaryProtein: random.pick(PROTEINS),
    allergens: [],
    vegetarian: true,
    vegan: true,
    pregnancySuitable: true,
    pregnancyRiskReasons: [],
  };
}

function promotion(
  productId: string,
  chainId: string,
  random: SeededRandom,
): Promotion | undefined {
  if (!random.chance(0.3)) return undefined;

  const kind = random.int(0, 4);
  const params: PromotionParams =
    kind === 0
      ? { type: 'FIXED_PRICE', unitPriceCents: cents(random.int(60, 260)) }
      : kind === 1
        ? { type: 'PERCENT_OFF', percent: random.int(15, 50) }
        : kind === 2
          ? { type: 'ONE_PLUS_ONE' }
          : kind === 3
            ? {
                type: 'N_FOR_X',
                bundleSize: random.int(2, 3),
                bundlePriceCents: cents(random.int(200, 500)),
              }
            : {
                type: 'BUY_NTH_DISCOUNT',
                nth: random.int(2, 3),
                percent: random.pick([50, 100]),
              };

  return {
    id: `promo-${productId}`,
    productId,
    scope: { kind: 'chain', chainId },
    params,
    minUnits: kind === 4 ? random.int(2, 3) : random.int(1, 3),
    validFrom: '2020-01-01',
    validUntil: '2099-12-31',
    label: 'Actie',
  };
}

function store(
  index: number,
  ingredients: readonly CanonicalIngredient[],
  random: SeededRandom,
): StoreCandidate {
  const chainId = `chain-${index}`;
  const offers: ProductOffer[] = [];

  for (const item of ingredients) {
    // Not every shop stocks everything — that is what makes the store choice a
    // choice, and what the availability rules exist for.
    if (index > 0 && random.chance(0.12)) continue;

    const variants = random.int(1, 3);
    for (let variant = 0; variant < variants; variant += 1) {
      const packAmount = random.pick([100, 150, 200, 250, 400, 500, 750, 1000]);
      const perGram = 0.4 + random.next() * 1.6;
      const price = Math.max(45, Math.round(packAmount * perGram));
      const productId = `${chainId}-${item.id}-v${variant}`;
      const promo = promotion(productId, chainId, random);
      offers.push({
        productId,
        chainId,
        locationId: chainId,
        ingredientId: item.id,
        name: `${chainId} ${item.canonicalName} ${packAmount}g`,
        brandName: 'Huismerk',
        isPrivateLabel: true,
        packageAmount: { amount: packAmount, unit: 'g' },
        normalUnitPriceCents: cents(price),
        unitPriceCents: cents(price),
        ...(promo ? { promotion: promo } : {}),
        pricePerBaseUnitCents: price / packAmount,
        nutritionOrigin: 'ingredient',
        ...(item.nutritionPer100 ? { nutritionPer100: item.nutritionPer100 } : {}),
      });
    }
  }

  offers.sort(
    (a, b) =>
      a.pricePerBaseUnitCents - b.pricePerBaseUnitCents || a.productId.localeCompare(b.productId),
  );

  return {
    location: {
      id: chainId,
      chainId,
      name: `Winkel ${index}`,
      address: `Teststraat ${index}`,
      postalCode: '9711AA',
      city: 'Groningen',
      latitude: 53.2 + index * 0.01,
      longitude: 6.56 + index * 0.01,
      regionId: 'groningen',
    },
    chain: { id: chainId, name: `Winkel ${index}`, logoUrl: '', colorHex: '#123456' },
    distanceKm: 1 + index * 1.5,
    offers,
  };
}

function member(index: number, random: SeededRandom): HouseholdMember {
  return {
    id: `member-${index}`,
    name: `Lid ${index}`,
    sex: random.pick(['man', 'vrouw']),
    ageYears: random.int(20, 60),
    heightCm: random.int(160, 195),
    weightKg: random.int(55, 100),
    activityLevel: random.pick(['zittend', 'licht-actief', 'matig-actief']),
    goal: random.pick(['behouden', 'afvallen', 'aankomen']),
    diet: 'alles',
    allergies: [],
    excludedIngredientIds: [],
  };
}

export interface ScenarioOptions {
  /**
   * A hard ceiling on the grocery bill.
   *
   * Deliberately an amount rather than a "fraction of the usual price": a
   * fraction cannot say whether the resulting problem is solvable at all, and a
   * ceiling nobody can meet measures nothing. `tests/support/budget.ts` derives
   * one from the exhaustive solver's cheapest week, so the ceiling is known to
   * be reachable before the optimizer is asked to reach it.
   */
  readonly hardMaxCents?: Cents;
  readonly recipeCount?: number;
}

/**
 * Build one scenario from a seed.
 *
 * The knobs the audit asked for are all varied: how many recipes and
 * ingredients, how many shops, pack sizes, promotions, preferences, and the
 * diversity, waste and store-penalty weights. Varying the *weights* matters as
 * much as varying the data — a search that only performs well at the default
 * settings has been tuned to them rather than being sound.
 */
export function buildScenario(seed: number, options: ScenarioOptions = {}): Scenario {
  const random = new SeededRandom(seed);

  const ingredientCount = random.int(5, 12);
  const ingredients = Array.from({ length: ingredientCount }, (_, i) => ingredient(i, random));
  const recipeCount = options.recipeCount ?? random.int(7, 12);
  const recipes = Array.from({ length: recipeCount }, (_, i) => recipe(i, ingredients, random));
  const storeCount = random.int(1, 3);
  const stores = Array.from({ length: storeCount }, (_, i) => store(i, ingredients, random));
  const members = Array.from({ length: random.int(1, 3) }, (_, i) => member(i, random));

  const preferences: Preferences = {
    cuisines: pickPreferences(CUISINES, random, 0.25),
    tags: pickPreferences(TAG_POOL, random, 0.2),
    ingredients: [],
  };

  const household: Household = {
    id: `household-${seed}`,
    name: 'Testhuishouden',
    location: {
      postalCode: '9711AA',
      city: 'Groningen',
      country: 'Nederland',
      latitude: 53.2,
      longitude: 6.56,
      precision: 'postcode',
    },
    members,
    preferences,
  };

  const config: OptimizerConfig = {
    ...DEFAULT_OPTIMIZER_CONFIG,
    diversity: {
      ...DEFAULT_OPTIMIZER_CONFIG.diversity,
      maxPastaDishes: random.int(2, 4),
      maxSoupDishes: random.int(1, 3),
      maxSamePrimaryProtein: random.int(2, 4),
      maxConsecutiveSameCuisine: random.int(1, 3),
      maxSameCuisine: random.int(3, 5),
    },
    weights: {
      ...DEFAULT_OPTIMIZER_CONFIG.weights,
      wastePerKilo: euros(random.int(0, 40) / 10),
      repetitionPerViolation: euros(random.int(5, 40) / 10),
      monotonyPenalty: euros(random.int(0, 100) / 10),
    },
  };

  const conveniencePreference: ConveniencePreference = random.pick([
    'laagste-prijs',
    'gebalanceerd',
    'gemak',
  ]);

  const input: OptimizerInput = {
    household,
    recipes,
    ingredients: buildIngredientIndex(ingredients),
    stores,
    maxStores: random.int(1, storeCount),
    conveniencePreference,
    budget: options.hardMaxCents !== undefined ? { hardMaxCents: options.hardMaxCents } : {},
    startDate: '2026-03-02',
    today: new Date('2026-03-02T09:00:00Z'),
    config,
  };

  return {
    seed,
    input,
    summary:
      `${recipeCount} recepten, ${ingredientCount} ingrediënten, ${storeCount} winkel(s), ` +
      `maxStores ${input.maxStores}, ${members.length} lid/leden, gemak "${conveniencePreference}", ` +
      `waste €${(config.weights.wastePerKilo / 100).toFixed(2)}/kg, ` +
      `herhaling €${(config.weights.repetitionPerViolation / 100).toFixed(2)}`,
  };
}

function pickPreferences<T extends string>(
  values: readonly T[],
  random: SeededRandom,
  chance: number,
): Preference<T>[] {
  const picked: Preference<T>[] = [];
  for (const value of values) {
    if (!random.chance(chance)) continue;
    // Never EXCLUDE here: a hard exclusion can empty the candidate pool, and a
    // scenario with no legal week measures nothing.
    picked.push({ value, level: random.chance(0.5) ? 'LIKE' : 'DISLIKE' });
  }
  return picked;
}
