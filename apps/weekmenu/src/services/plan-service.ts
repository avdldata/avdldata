import 'server-only';
import type { Household } from '@/domain/household/types';
import { DEFAULT_OPTIMIZER_CONFIG, type OptimizerConfig } from '@/domain/optimization/config';
import { optimiseWeek, type OptimizerInput } from '@/domain/optimization/week-optimizer';
import { findReplacements, type ReplacementCandidate } from '@/domain/optimization/replace';
import type { OptimizerResult, WeeklyPlan } from '@/domain/optimization/types';
import { getRepositories } from '@/data';
import type { StoredPlan, WeekSettings } from '@/data/repositories/types';
import { DEFAULT_WEEK_SETTINGS } from '@/data/repositories/types';
import { getCatalogue } from './catalogue';
import { buildStoreCandidates } from './store-service';

export interface PlanContext {
  readonly household: Household;
  readonly settings: WeekSettings;
  readonly startDate: string;
  readonly today: Date;
}

/** Monday of the week containing `date`, as an ISO day string. */
export function mondayOf(date: Date): string {
  const copy = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayOfWeek = (copy.getUTCDay() + 6) % 7;
  copy.setUTCDate(copy.getUTCDate() - dayOfWeek);
  return copy.toISOString().slice(0, 10);
}

/** Fold the user's week settings into the optimizer configuration. */
export function configFor(settings: WeekSettings): OptimizerConfig {
  return {
    ...DEFAULT_OPTIMIZER_CONFIG,
    trip: {
      ...DEFAULT_OPTIMIZER_CONFIG.trip,
      mode: settings.transportMode,
      profiles: {
        ...DEFAULT_OPTIMIZER_CONFIG.trip.profiles,
        [settings.transportMode]: {
          ...DEFAULT_OPTIMIZER_CONFIG.trip.profiles[settings.transportMode],
          costPerKmCents: settings.costPerKmCents,
        },
      },
    },
  };
}

function developmentLogger(): OptimizerInput['logger'] {
  if (process.env.NODE_ENV === 'production') return undefined;
  // Stage counters only — never household data, never anything personal.
  return (stage, data) => {
    console.warn(`[optimizer:${stage}]`, JSON.stringify(data));
  };
}

async function buildOptimizerInput(
  context: PlanContext,
  lockedRecipeIds?: ReadonlyMap<number, string>,
): Promise<OptimizerInput> {
  const catalogue = getCatalogue();
  const home = {
    latitude: context.household.location.latitude ?? 0,
    longitude: context.household.location.longitude ?? 0,
  };
  const { candidates } = await buildStoreCandidates({
    locationIds: context.settings.selectedLocationIds,
    home,
    onDate: context.startDate,
  });

  const maxStores =
    context.settings.maxStores > 0 ? context.settings.maxStores : Math.max(1, candidates.length);

  return {
    household: context.household,
    recipes: catalogue.recipes,
    ingredients: catalogue.ingredientIndex,
    stores: candidates,
    maxStores,
    conveniencePreference: context.settings.conveniencePreference,
    budget: {
      ...(context.settings.budgetTargetCents !== undefined
        ? { targetCents: context.settings.budgetTargetCents }
        : {}),
      ...(context.settings.budgetHardMaxCents !== undefined
        ? { hardMaxCents: context.settings.budgetHardMaxCents }
        : {}),
    },
    startDate: context.startDate,
    today: context.today,
    ...(context.settings.maxMinutes !== undefined
      ? { maxMinutes: context.settings.maxMinutes }
      : {}),
    ...(lockedRecipeIds ? { lockedRecipeIds } : {}),
    config: configFor(context.settings),
    ...(developmentLogger() ? { logger: developmentLogger()! } : {}),
    now: () => performance.now(),
  };
}

/** Run the optimizer for a household and return the winning week. */
export async function generatePlan(context: PlanContext): Promise<OptimizerResult> {
  return optimiseWeek(await buildOptimizerInput(context));
}

/**
 * Re-price a stored week.
 *
 * The seven chosen recipes are locked and everything else — packs, promotions,
 * store split, travel — is recomputed against today's catalogue. That is why a
 * plan you open tomorrow shows tomorrow's prices instead of a frozen snapshot.
 */
export async function repriceStoredPlan(
  context: PlanContext,
  recipeIds: readonly string[],
): Promise<OptimizerResult> {
  const locked = new Map<number, string>();
  recipeIds.forEach((id, index) => locked.set(index, id));
  return optimiseWeek(await buildOptimizerInput(context, locked));
}

export async function findAlternatives(
  context: PlanContext,
  plan: WeeklyPlan,
  dayIndex: number,
): Promise<ReplacementCandidate[]> {
  const base = await buildOptimizerInput(context);
  return findReplacements({ ...base, currentPlan: plan, dayIndex });
}

// ---------------------------------------------------------------------------
// Repository-backed helpers used by the route handlers and server actions
// ---------------------------------------------------------------------------

export interface LoadedPlan {
  readonly stored: StoredPlan;
  readonly plan: WeeklyPlan;
}

export async function loadContext(userId: string, now = new Date()): Promise<PlanContext | null> {
  const repositories = getRepositories();
  const household = await repositories.households.getByOwner(userId);
  if (!household) return null;
  const settings = (await repositories.settings.get(household.id)) ?? DEFAULT_WEEK_SETTINGS;
  return { household, settings, startDate: mondayOf(now), today: now };
}

export async function loadCurrentPlan(
  context: PlanContext,
  now = new Date(),
): Promise<{ stored: StoredPlan; result: OptimizerResult } | null> {
  const repositories = getRepositories();
  const stored = await repositories.plans.getCurrent(context.household.id);
  if (!stored) return null;
  const result = await repriceStoredPlan(
    { ...context, startDate: stored.startDate, today: now },
    stored.recipeIds,
  );
  return { stored, result };
}

export async function persistPlan(context: PlanContext, plan: WeeklyPlan): Promise<StoredPlan> {
  const repositories = getRepositories();
  return repositories.plans.save({
    householdId: context.household.id,
    startDate: plan.startDate,
    recipeIds: plan.days.map((d) => d.recipe.id),
    settings: context.settings,
    checkedItemKeys: [],
  });
}
