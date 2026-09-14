import { cents, type Cents } from '../units';
import type { Household } from '../household/types';
import { householdAllergens, householdHasPregnancy } from '../household/types';
import type { Recipe } from '../recipes/types';
import type { WeekIngredientRequirement } from '../aggregation/aggregate';
import type { IngredientLeftoverLedger, WasteSummary } from '../aggregation/leftovers';
import type { PlannedDay } from '../aggregation/aggregate';
import { reason, type Reason } from './reasons';
import type { StoreCandidate, StoreOption } from './store-selection';
import type { DiversityViolation } from './diversity';
import type { NutritionPenaltyResult } from './scoring';
import { scoreRecipePreferences } from './scoring';
import { DEFAULT_OBJECTIVE_WEIGHTS } from './config';
import type { BudgetOutcome } from './types';

/** Below this, an extra supermarket is not worth the trip. Shown, not hidden. */
const MEANINGFUL_SAVING_CENTS = 300;

export interface WeekReasonInput {
  readonly option: StoreOption;
  readonly options: readonly StoreOption[];
  readonly waste: WasteSummary;
  readonly leftovers: readonly IngredientLeftoverLedger[];
  readonly budget: BudgetOutcome;
  readonly nutrition: NutritionPenaltyResult;
  readonly diversityViolations: readonly DiversityViolation[];
  readonly recipes: readonly Recipe[];
  readonly household: Household;
  readonly stores: readonly StoreCandidate[];
}

/**
 * Turn the winning week into structured reason codes.
 *
 * Everything the "Waarom deze week?" panel shows is generated here, from the
 * actual numbers the optimizer produced — never from a template guess and
 * never from a language model.
 */
export function buildWeekReasons(input: WeekReasonInput): Reason[] {
  const reasons: Reason[] = [];
  const chainName = (chainId: string): string =>
    input.stores.find((s) => s.chain.id === chainId)?.chain.name ?? chainId;

  reasons.push(...storeReasons(input, chainName));
  reasons.push(...promotionReasons(input));
  reasons.push(...leftoverReasons(input));
  reasons.push(...budgetReasons(input));
  reasons.push(...nutritionReasons(input));
  reasons.push(...safetyReasons(input));
  reasons.push(...varietyReasons(input));

  return reasons;
}

function storeReasons(input: WeekReasonInput, chainName: (id: string) => string): Reason[] {
  const reasons: Reason[] = [];
  const chosenCount = input.option.locationIds.length;

  const bestSingle = input.options
    .filter((o) => o.locationIds.length === 1)
    .sort((a, b) => a.groceryCents - b.groceryCents)[0];

  const cheapestOverall = [...input.options].sort((a, b) => a.groceryCents - b.groceryCents)[0];

  if (chosenCount === 1) {
    reasons.push(
      reason('STORE_CONSOLIDATION', {
        store: chainName(input.option.chainIds[0] ?? ''),
        distanceKm: input.option.trip.estimatedDistanceKm,
      }),
    );
    if (cheapestOverall && cheapestOverall.groceryCents < input.option.groceryCents) {
      reasons.push(
        reason('EXTRA_STORE_NOT_WORTH_IT', {
          savingCents: input.option.groceryCents - cheapestOverall.groceryCents,
          extraKm: round1(
            cheapestOverall.trip.estimatedDistanceKm - input.option.trip.estimatedDistanceKm,
          ),
          storeCount: cheapestOverall.locationIds.length,
        }),
      );
    }
  } else {
    reasons.push(
      reason('EXTRA_STORE_WORTH_IT', {
        storeCount: chosenCount,
        stores: input.option.chainIds.map(chainName).join(' + '),
        savingCents: bestSingle ? bestSingle.groceryCents - input.option.groceryCents : 0,
        extraKm: bestSingle
          ? round1(input.option.trip.estimatedDistanceKm - bestSingle.trip.estimatedDistanceKm)
          : 0,
      }),
    );

    // Would one more store have helped? Say so either way.
    const oneMore = input.options
      .filter((o) => o.locationIds.length === chosenCount + 1)
      .sort((a, b) => a.groceryCents - b.groceryCents)[0];
    if (oneMore) {
      const extraSaving = input.option.groceryCents - oneMore.groceryCents;
      if (extraSaving > 0 && extraSaving < MEANINGFUL_SAVING_CENTS) {
        reasons.push(
          reason('EXTRA_STORE_NOT_WORTH_IT', {
            savingCents: extraSaving,
            extraKm: round1(
              oneMore.trip.estimatedDistanceKm - input.option.trip.estimatedDistanceKm,
            ),
            storeCount: oneMore.locationIds.length,
          }),
        );
      }
    }
  }

  // One category per chain, so the list says something ("Lidl for vegetables,
  // Jumbo for meat") instead of naming the same shop three times.
  const namedChains = new Set<string>();
  const categoryClaims = [...input.option.categoryWinners.entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  );
  for (const [category, chainId] of categoryClaims) {
    if (namedChains.has(chainId)) continue;
    namedChains.add(chainId);
    reasons.push(reason('CHEAPEST_STORE_FOR_CATEGORY', { category, store: chainName(chainId) }));
    if (namedChains.size >= 3) break;
  }

  if (input.option.trip.estimatedDistanceKm <= 6) {
    reasons.push(
      reason('SHORT_TRAVEL_DISTANCE', { distanceKm: input.option.trip.estimatedDistanceKm }),
    );
  }

  return reasons;
}

function promotionReasons(input: WeekReasonInput): Reason[] {
  // Strictly what the promotion knocks off the shelf price. Using the saving
  // against the reference price would let "dat scheelt € 2,00" stand next to an
  // offer that is worth forty cents, because the product also happens to be
  // cheaper this week than it usually is.
  const promoted = input.option.assignments
    .flatMap((a) => a.packaging.lines.map((line) => ({ name: a.name, line })))
    .filter((entry) => entry.line.promotionApplied && entry.line.promotionSavingsCents > 0)
    .sort(
      (a, b) =>
        b.line.promotionSavingsCents - a.line.promotionSavingsCents || a.name.localeCompare(b.name),
    );

  return promoted.slice(0, 3).map((entry) =>
    reason('PROMOTION_USED', {
      ingredient: entry.name,
      product: entry.line.offer.name,
      savingCents: entry.line.promotionSavingsCents,
      label: entry.line.offer.promotion?.label ?? 'aanbieding',
    }),
  );
}

function leftoverReasons(input: WeekReasonInput): Reason[] {
  const reasons: Reason[] = [];

  const reused = input.leftovers
    .filter((l) => l.days.length > 1 && l.finalLeftoverAmount < l.requiredAmount * 0.25)
    .sort((a, b) => b.days.length - a.days.length || a.name.localeCompare(b.name));

  for (const ledger of reused.slice(0, 2)) {
    reasons.push(
      reason('REUSED_LEFTOVER', {
        ingredient: ledger.name,
        days: ledger.days.length,
        purchased: Math.round(ledger.purchasedAmount),
        unit: ledger.unit,
      }),
    );
  }

  if (input.waste.perishableLeftover.g <= 250) {
    reasons.push(reason('LOW_WASTE', { leftoverGrams: input.waste.perishableLeftover.g }));
  }

  const bulk = input.option.assignments
    .filter((a) => a.packaging.lines.length === 1 && a.packaging.lines[0]!.units > 1)
    .sort((a, b) => b.packaging.totalCents - a.packaging.totalCents)[0];
  if (bulk) {
    reasons.push(
      reason('BULK_PACKAGE_CHEAPER', {
        ingredient: bulk.name,
        units: bulk.packaging.lines[0]!.units,
        product: bulk.packaging.lines[0]!.offer.name,
      }),
    );
  }

  return reasons;
}

function budgetReasons(input: WeekReasonInput): Reason[] {
  const ceiling = input.budget.hardMaxCents ?? input.budget.targetCents;
  if (ceiling === undefined) return [];
  if (input.budget.met) {
    return [
      reason('BUDGET_MET', {
        budgetCents: ceiling,
        actualCents: input.option.groceryCents,
      }),
    ];
  }
  return [
    reason('BUDGET_EXCEEDED', {
      budgetCents: ceiling,
      actualCents: input.option.groceryCents,
      shortfallCents: input.budget.shortfallCents ?? 0,
    }),
  ];
}

function nutritionReasons(input: WeekReasonInput): Reason[] {
  const memberDays = Math.max(1, input.household.members.length * input.recipes.length);
  const averageDeviation = input.nutrition.totalKcalDeviation / memberDays;
  if (averageDeviation <= 120) {
    return [reason('NUTRITION_ON_TARGET', { deviationKcal: Math.round(averageDeviation) })];
  }
  return [reason('NUTRITION_OFF_TARGET', { deviationKcal: Math.round(averageDeviation) })];
}

function safetyReasons(input: WeekReasonInput): Reason[] {
  const reasons: Reason[] = [];
  if (householdHasPregnancy(input.household)) {
    reasons.push(reason('PREGNANCY_SAFE', { count: input.recipes.length }));
  }
  const allergens = householdAllergens(input.household);
  if (allergens.size > 0) {
    reasons.push(reason('ALLERGY_SAFE', { allergens: [...allergens].sort().join(', ') }));
  }
  return reasons;
}

function varietyReasons(input: WeekReasonInput): Reason[] {
  const cuisines = new Set(input.recipes.map((r) => r.cuisine)).size;
  const proteins = new Set(input.recipes.map((r) => r.primaryProtein)).size;

  // Say it out loud when the week repeats itself. A household with few eligible
  // dishes gets a plan rather than a refusal, but not without being told why it
  // looks the way it does.
  if (input.diversityViolations.length > 0) {
    return [
      reason('VARIETY_COMPROMISED', {
        violations: input.diversityViolations.length,
        cuisines,
        proteins,
      }),
    ];
  }
  return [reason('GOOD_VARIETY', { cuisines, proteins })];
}

export interface DayReasonInput {
  readonly day: PlannedDay;
  readonly option: StoreOption;
  readonly requirements: readonly WeekIngredientRequirement[];
  readonly leftovers: readonly IngredientLeftoverLedger[];
  readonly household: Household;
  readonly allocatedCostCents: Cents;
  readonly memberCount: number;
}

/** Per-day explanations, shown on the day card and in the recipe detail. */
export function buildDayReasons(input: DayReasonInput): Reason[] {
  const reasons: Reason[] = [];
  const ingredientIds = new Set(
    input.day.recipe.ingredients.filter((l) => !l.optional).map((l) => l.ingredientId),
  );

  const perPerson = cents(input.allocatedCostCents / Math.max(1, input.memberCount));
  if (perPerson > 0 && perPerson <= 300) {
    reasons.push(reason('LOW_PRICE', { perPersonCents: perPerson }));
  }

  for (const ledger of input.leftovers) {
    if (!ingredientIds.has(ledger.ingredientId)) continue;
    const entry = ledger.days.find((d) => d.dayIndex === input.day.dayIndex);
    if (entry && entry.reusedOnDays.length > 0) {
      reasons.push(
        reason('REUSED_LEFTOVER', {
          ingredient: ledger.name,
          days: entry.reusedOnDays.length,
          purchased: Math.round(ledger.purchasedAmount),
          unit: ledger.unit,
        }),
      );
      break;
    }
  }

  const promoted = input.option.assignments
    .filter((a) => ingredientIds.has(a.ingredientId))
    .flatMap((a) => a.packaging.lines.map((line) => ({ name: a.name, line })))
    .filter((entry) => entry.line.promotionApplied)
    .sort((a, b) => b.line.savingsCents - a.line.savingsCents)[0];
  if (promoted) {
    reasons.push(
      reason('PROMOTION_USED', {
        ingredient: promoted.name,
        product: promoted.line.offer.name,
        savingCents: promoted.line.savingsCents,
        label: promoted.line.offer.promotion?.label ?? 'aanbieding',
      }),
    );
  }

  const preference = scoreRecipePreferences(
    input.day.recipe,
    input.household.preferences,
    DEFAULT_OBJECTIVE_WEIGHTS,
  );
  if (preference.likedTerms.length > 0) {
    reasons.push(reason('PREFERRED_RECIPE', { terms: preference.likedTerms.join(', ') }));
  }

  return reasons;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
