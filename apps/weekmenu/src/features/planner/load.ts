import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import type { Household } from '@/domain/household/types';
import type { WeeklyPlan } from '@/domain/optimization/types';
import type { HistoricalPriceStats } from '@/domain/pricing/price-history';
import { getRepositories } from '@/data';
import {
  DEFAULT_WEEK_SETTINGS,
  type StoredPlan,
  type WeekSettings,
} from '@/data/repositories/types';
import { requireUser } from '@/services/auth';
import { loadContext, repriceStoredPlan, type PlanContext } from '@/services/plan-service';
import { deserialiseWeeklyPlan } from '@/services/stored-week';
import { buildStoreCandidates } from '@/services/store-service';

/** Why the week on screen is not the week that was saved. */
export type WeekFreshness =
  /** Saved priced, shown exactly as saved. */
  | 'AS_SAVED'
  /** Saved before weeks kept their prices, so it had to be priced once now. */
  | 'REPRICED_LEGACY';

export interface WeekView {
  readonly context: PlanContext;
  readonly household: Household;
  readonly settings: WeekSettings;
  readonly stored: StoredPlan | null;
  readonly plan: WeeklyPlan | null;
  readonly freshness: WeekFreshness | null;
  /** True when the settings have changed since this week was priced. */
  readonly settingsChangedSince: boolean;
  /** Price history per product, for the deal badges on the shopping list. */
  readonly priceStats: ReadonlyMap<string, HistoricalPriceStats>;
  /** Set when a stored week could no longer be priced with the current settings. */
  readonly error: string | null;
}

/** Do two settings objects describe the same shopping situation? */
function sameSettings(a: WeekSettings, b: WeekSettings): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Load the current week for the signed-in household.
 *
 * Opening a saved week is a **read**. The priced week was written down when it
 * was made, so the totals, the shops, the packs and the promotions are the ones
 * the user saw — not a fresh calculation against whatever the catalogue says
 * today. A new number appears only when the user asks for one.
 *
 * Cached per request, because several parts of a page (header totals, day list,
 * shopping list) all want the same week.
 */
export const getWeekView = cache(async (): Promise<WeekView> => {
  const user = await requireUser();
  const context = await loadContext(user.id);
  // A fresh account has no household yet. The app layout sends it to
  // onboarding, but a layout and the page inside it render concurrently, so
  // throwing here wins that race often enough to show an error page to someone
  // whose only mistake was signing up. Same reason `requireUser` redirects.
  if (!context) redirect('/onboarding');

  const stored = await getRepositories().plans.getCurrent(context.household.id);
  const empty = {
    context,
    household: context.household,
    settings: context.settings ?? DEFAULT_WEEK_SETTINGS,
    stored: null,
    plan: null,
    freshness: null,
    settingsChangedSince: false,
    priceStats: new Map<string, HistoricalPriceStats>(),
    error: null,
  } satisfies WeekView;
  if (!stored) return empty;

  const settingsChangedSince = !sameSettings(stored.settings, context.settings);

  // Price history drives the deal badges. It is history, not this week's price,
  // so reading today's is correct and changes nothing about the saved total.
  const { priceStats } = await buildStoreCandidates({
    locationIds: stored.settings.selectedLocationIds,
    home: {
      latitude: context.household.location.latitude ?? 0,
      longitude: context.household.location.longitude ?? 0,
    },
    onDate: stored.startDate,
  });

  if (stored.plan) {
    return {
      ...empty,
      stored,
      plan: deserialiseWeeklyPlan(stored.plan),
      freshness: 'AS_SAVED',
      settingsChangedSince,
      priceStats,
    };
  }

  /*
   * A week saved before prices were stored with it.
   *
   * There is nothing to show but a fresh calculation, so that is what happens —
   * once, and labelled. `freshness` is what the screen uses to say the total is
   * today's rather than the one that was saved.
   */
  const result = await repriceStoredPlan(
    { ...context, startDate: stored.startDate },
    stored.recipeIds,
  );
  return {
    ...empty,
    stored,
    plan: result.status === 'OK' ? result.plan : null,
    freshness: 'REPRICED_LEGACY',
    settingsChangedSince,
    priceStats,
    error: result.status === 'OK' ? null : result.message,
  };
});
