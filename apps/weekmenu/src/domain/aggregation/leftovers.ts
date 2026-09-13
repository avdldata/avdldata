import type { WeekIngredientRequirement } from './aggregate';
import type { Perishability } from '../ingredients/types';

export interface LeftoverConfig {
  /**
   * How heavily leftover counts as waste, per perishability class.
   * Half a bag of rice is not waste; half a pack of fresh fish is.
   */
  readonly wasteFactor: Readonly<Record<Perishability, number>>;
}

export const DEFAULT_LEFTOVER_CONFIG: LeftoverConfig = {
  wasteFactor: { perishable: 1, semi: 0.4, pantry: 0.05 },
};

export interface DayLeftoverEntry {
  readonly dayIndex: number;
  readonly usedAmount: number;
  /** What is still in the fridge after cooking this day. */
  readonly remainingAmount: number;
  /** Later days that use this same ingredient — drives the reuse copy in the UI. */
  readonly reusedOnDays: readonly number[];
}

export interface IngredientLeftoverLedger {
  readonly ingredientId: string;
  readonly name: string;
  readonly unit: string;
  readonly purchasedAmount: number;
  readonly requiredAmount: number;
  /** What is left when the week is over. */
  readonly finalLeftoverAmount: number;
  /** Weighted leftover, i.e. the part we actually count as waste. */
  readonly wasteScore: number;
  readonly days: readonly DayLeftoverEntry[];
}

/**
 * Track, per ingredient, what is used on which day and what remains.
 *
 * This produces the line the recipe detail screen shows:
 * "Van de 500 g wortelen gebruik je vandaag 300 g. De overige 200 g gebruik je donderdag."
 */
export function buildLeftoverLedger(
  requirements: readonly WeekIngredientRequirement[],
  purchasedByIngredient: ReadonlyMap<string, number>,
  config: LeftoverConfig = DEFAULT_LEFTOVER_CONFIG,
): IngredientLeftoverLedger[] {
  return requirements.map((requirement) => {
    const purchased =
      purchasedByIngredient.get(requirement.ingredientId) ?? requirement.totalAmount;
    let remaining = purchased;
    const days: DayLeftoverEntry[] = [];

    requirement.perDay.forEach((usage, index) => {
      remaining = Math.max(0, remaining - usage.amount);
      days.push({
        dayIndex: usage.dayIndex,
        usedAmount: usage.amount,
        remainingAmount: remaining,
        reusedOnDays: requirement.perDay.slice(index + 1).map((u) => u.dayIndex),
      });
    });

    const finalLeftover = Math.max(0, purchased - requirement.totalAmount);

    return {
      ingredientId: requirement.ingredientId,
      name: requirement.name,
      unit: requirement.unit,
      purchasedAmount: purchased,
      requiredAmount: requirement.totalAmount,
      finalLeftoverAmount: finalLeftover,
      wasteScore: finalLeftover * config.wasteFactor[requirement.perishability],
      days,
    };
  });
}

/**
 * Leftover amounts, kept apart per unit.
 *
 * Adding grams, millilitres and pieces into one number would be meaningless,
 * so the summary keeps the three separate and the UI shows the grams.
 */
export interface LeftoverAmounts {
  readonly g: number;
  readonly ml: number;
  readonly piece: number;
}

export interface WasteSummary {
  readonly totalLeftover: LeftoverAmounts;
  /** Leftover of genuinely perishable goods — the number worth showing a user. */
  readonly perishableLeftover: LeftoverAmounts;
  /** Weighted waste, used by the objective function. */
  readonly wasteScore: number;
  /** Ingredients that are reused on a later day. */
  readonly reusedIngredientIds: readonly string[];
}

function emptyAmounts(): { g: number; ml: number; piece: number } {
  return { g: 0, ml: 0, piece: 0 };
}

function addTo(
  target: { g: number; ml: number; piece: number },
  unit: string,
  amount: number,
): void {
  if (unit === 'g') target.g += amount;
  else if (unit === 'ml') target.ml += amount;
  else target.piece += amount;
}

export function summariseWaste(ledgers: readonly IngredientLeftoverLedger[]): WasteSummary {
  const total = emptyAmounts();
  const perishable = emptyAmounts();
  let wasteScore = 0;
  const reused: string[] = [];

  for (const ledger of ledgers) {
    addTo(total, ledger.unit, ledger.finalLeftoverAmount);
    wasteScore += ledger.wasteScore;
    // A ledger whose waste score is close to its raw leftover is perishable:
    // the weighting factor for pantry goods is far below one.
    if (ledger.wasteScore >= ledger.finalLeftoverAmount * 0.9) {
      addTo(perishable, ledger.unit, ledger.finalLeftoverAmount);
    }
    if (ledger.days.length > 1) reused.push(ledger.ingredientId);
  }

  const round = (a: { g: number; ml: number; piece: number }): LeftoverAmounts => ({
    g: Math.round(a.g),
    ml: Math.round(a.ml),
    piece: Math.round(a.piece * 4) / 4,
  });

  return {
    totalLeftover: round(total),
    perishableLeftover: round(perishable),
    wasteScore,
    reusedIngredientIds: reused,
  };
}
