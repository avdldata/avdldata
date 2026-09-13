/**
 * Structured explanations.
 *
 * The optimizer never writes user-facing prose. It records *why* it did what it
 * did as a code plus parameters; `src/lib/explain.ts` turns those into Dutch
 * sentences. That keeps the engine testable and the copy translatable.
 */
export const REASON_CODES = [
  'LOW_PRICE',
  'PROMOTION_USED',
  'REUSED_LEFTOVER',
  'LOW_WASTE',
  'BULK_PACKAGE_CHEAPER',
  'PREFERRED_RECIPE',
  'PREFERRED_CUISINE',
  'GOOD_VARIETY',
  'NUTRITION_ON_TARGET',
  'NUTRITION_OFF_TARGET',
  'PREGNANCY_SAFE',
  'ALLERGY_SAFE',
  'STORE_CONSOLIDATION',
  'EXTRA_STORE_WORTH_IT',
  'EXTRA_STORE_NOT_WORTH_IT',
  'CHEAPEST_STORE_FOR_CATEGORY',
  'BUDGET_MET',
  'BUDGET_EXCEEDED',
  'ITEM_UNAVAILABLE',
  'SHORT_TRAVEL_DISTANCE',
] as const;

export type ReasonCode = (typeof REASON_CODES)[number];

export type ReasonParams = Readonly<Record<string, string | number>>;

export interface Reason {
  readonly code: ReasonCode;
  readonly params: ReasonParams;
}

export function reason(code: ReasonCode, params: ReasonParams = {}): Reason {
  return { code, params };
}
