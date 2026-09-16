import 'server-only';
import type { WeeklyPlan } from '@/domain/optimization/types';
import type { StoreOption } from '@/domain/optimization/store-selection';

/**
 * A priced week, written down.
 *
 * The app used to store seven recipe ids and re-run the optimizer every time a
 * page was opened. That is convenient and quietly dishonest: open Monday's week
 * on Thursday and the total silently becomes a different number, presented as
 * though it had always been that. What you saved is a plan at a price, and the
 * price is part of what you saved.
 *
 * So the whole priced week is stored. Opening it is a read, not a calculation.
 * A new number only appears when the user asks for one — by replacing a dish,
 * regenerating, or pressing "bereken opnieuw" — and then it is their number.
 *
 * `WeeklyPlan` is otherwise plain data, but two of its fields are `Map`s, which
 * JSON turns into `{}` without complaining. They are converted explicitly here
 * rather than left to a generic replacer, so adding a third map breaks the
 * build instead of losing data in production.
 */
export interface SerialisedStoreOption extends Omit<StoreOption, 'purchasedByIngredient' | 'categoryWinners'> {
  readonly purchasedByIngredient: readonly (readonly [string, number])[];
  readonly categoryWinners: readonly (readonly [string, string])[];
}

export interface SerialisedWeeklyPlan
  extends Omit<WeeklyPlan, 'recommendedOption' | 'alternativeOptions' | 'cheapestOption'> {
  readonly recommendedOption: SerialisedStoreOption;
  readonly alternativeOptions: readonly SerialisedStoreOption[];
  readonly cheapestOption: SerialisedStoreOption;
}

function serialiseOption(option: StoreOption): SerialisedStoreOption {
  return {
    ...option,
    purchasedByIngredient: [...option.purchasedByIngredient],
    categoryWinners: [...option.categoryWinners],
  };
}

function deserialiseOption(option: SerialisedStoreOption): StoreOption {
  return {
    ...option,
    purchasedByIngredient: new Map(option.purchasedByIngredient),
    categoryWinners: new Map(option.categoryWinners),
  };
}

export function serialiseWeeklyPlan(plan: WeeklyPlan): SerialisedWeeklyPlan {
  return {
    ...plan,
    recommendedOption: serialiseOption(plan.recommendedOption),
    alternativeOptions: plan.alternativeOptions.map(serialiseOption),
    cheapestOption: serialiseOption(plan.cheapestOption),
  };
}

export function deserialiseWeeklyPlan(raw: SerialisedWeeklyPlan): WeeklyPlan {
  const recommended = deserialiseOption(raw.recommendedOption);
  const cheapest = deserialiseOption(raw.cheapestOption);
  const alternatives = raw.alternativeOptions.map(deserialiseOption);
  return {
    ...raw,
    recommendedOption: recommended,
    // The store comparison screen asks "is the recommendation the cheapest
    // option?" by identity. Restoring the same object for both keeps that true.
    cheapestOption:
      cheapest.locationIds.join('|') === recommended.locationIds.join('|') ? recommended : cheapest,
    alternativeOptions: alternatives,
  };
}
