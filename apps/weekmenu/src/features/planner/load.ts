import 'server-only';
import { cache } from 'react';
import type { Household } from '@/domain/household/types';
import type { OptimizerResult, WeeklyPlan } from '@/domain/optimization/types';
import type { HistoricalPriceStats } from '@/domain/pricing/price-history';
import { getRepositories } from '@/data';
import { DEFAULT_WEEK_SETTINGS, type StoredPlan, type WeekSettings } from '@/data/repositories/types';
import { requireUser } from '@/services/auth';
import { loadContext, repriceStoredPlan, type PlanContext } from '@/services/plan-service';
import { buildStoreCandidates } from '@/services/store-service';

export interface WeekView {
  readonly context: PlanContext;
  readonly household: Household;
  readonly settings: WeekSettings;
  readonly stored: StoredPlan | null;
  readonly plan: WeeklyPlan | null;
  /** Price history per product, for the deal badges on the shopping list. */
  readonly priceStats: ReadonlyMap<string, HistoricalPriceStats>;
  /** Set when a stored week could no longer be priced with the current settings. */
  readonly error: string | null;
}

/**
 * Load the current week for the signed-in household.
 *
 * Cached per request, because several parts of a page (header totals, day list,
 * shopping list) all need the same priced week and re-running the optimizer
 * four times per render would be silly.
 */
export const getWeekView = cache(async (): Promise<WeekView> => {
  const user = await requireUser();
  const context = await loadContext(user.id);
  if (!context) throw new Error('Geen huishouden gevonden.');

  const stored = await getRepositories().plans.getCurrent(context.household.id);
  if (!stored) {
    return {
      context,
      household: context.household,
      settings: context.settings ?? DEFAULT_WEEK_SETTINGS,
      stored: null,
      plan: null,
      priceStats: new Map(),
      error: null,
    };
  }

  const result: OptimizerResult = await repriceStoredPlan(
    { ...context, startDate: stored.startDate },
    stored.recipeIds,
  );

  const { candidates: _candidates, priceStats } = await buildStoreCandidates({
    locationIds: context.settings.selectedLocationIds,
    home: {
      latitude: context.household.location.latitude ?? 0,
      longitude: context.household.location.longitude ?? 0,
    },
    onDate: stored.startDate,
  });

  return {
    context,
    household: context.household,
    settings: context.settings,
    stored,
    plan: result.status === 'OK' ? result.plan : null,
    priceStats,
    error: result.status === 'OK' ? null : result.message,
  };
});
