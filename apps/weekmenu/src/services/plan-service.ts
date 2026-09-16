import 'server-only';
import type { Household } from '@/domain/household/types';
import { cents } from '@/domain/units';
import { DEFAULT_OPTIMIZER_CONFIG, type OptimizerConfig } from '@/domain/optimization/config';
import { optimiseWeek, type OptimizerInput } from '@/domain/optimization/week-optimizer';
import { findReplacements, type ReplacementCandidate } from '@/domain/optimization/replace';
import type { OptimizerResult, WeeklyPlan } from '@/domain/optimization/types';
import { getRepositories } from '@/data';
import type { StoredPlan, WeekSettings } from '@/data/repositories/types';
import { DEFAULT_WEEK_SETTINGS } from '@/data/repositories/types';
import { partitionByAvailability, type AvailabilityVerdict } from '@/domain/recipes/feasibility';
import type { Recipe } from '@/domain/recipes/types';
import { getCatalogue } from './catalogue';
import { serialiseWeeklyPlan } from './stored-week';
import { buildStoreCandidates, purchasableIngredientIds, travelCostStatus } from './store-service';

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
  /*
   * Driving costs nothing when we do not know how far it is.
   *
   * Removing the household's coordinates from the store candidates was not
   * enough: the optimizer derives its own origin from the household and prices
   * the trip itself, so a week planned with "travel not included" still carried
   * € 2,67 of it — and a per-kilometre charge quietly discourages a second
   * shop. Zeroing the rate is what actually makes invented geography inert.
   * Found by a test that asserted the guarantee rather than trusting it.
   */
  const costPerKmCents = travelCostStatus() === 'AVAILABLE' ? settings.costPerKmCents : cents(0);
  return {
    ...DEFAULT_OPTIMIZER_CONFIG,
    trip: {
      ...DEFAULT_OPTIMIZER_CONFIG.trip,
      mode: settings.transportMode,
      profiles: {
        ...DEFAULT_OPTIMIZER_CONFIG.trip.profiles,
        [settings.transportMode]: {
          ...DEFAULT_OPTIMIZER_CONFIG.trip.profiles[settings.transportMode],
          costPerKmCents,
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

/**
 * The recipes the week generator is allowed to choose from.
 *
 * A recipe whose ingredients the catalogue cannot sell is not an option: the
 * user would get a plan they cannot shop. It stays in the library as a record —
 * see `partitionByAvailability` — and never reaches the optimizer.
 *
 * Re-pricing an already-chosen week is the exception. Those seven dishes were
 * chosen when they were available, and a stored plan has to stay openable even
 * if a later price snapshot drops a product; the full library is used there, so
 * the week still prices and the missing item shows up as unavailable rather
 * than as a crash.
 */
export async function selectableRecipes(
  context: PlanContext,
): Promise<{ recipes: readonly Recipe[]; unavailable: readonly AvailabilityVerdict[] }> {
  const catalogue = getCatalogue();
  const purchasable = await purchasableIngredientIds(context.startDate);
  const { available, unavailable } = partitionByAvailability(
    catalogue.recipes,
    catalogue.ingredientIndex,
    purchasable,
  );
  return { recipes: available, unavailable };
}

export interface GenerationOptions {
  /**
   * Dishes the user has already been offered and did not take.
   *
   * This is what makes "maak een andere week" mean something. The optimizer is
   * deterministic by design — same household, same prices, same answer — so
   * pressing regenerate can only return something else if the question itself
   * changes. Excluding what was already on the table is the smallest honest
   * change to the question, and it is exactly what a person means by "no, show
   * me something else".
   */
  readonly excludeRecipeIds?: readonly string[];
}

/** How many dishes a week needs; below this an exclusion list has gone too far. */
const DAYS_IN_WEEK = 7;

async function buildOptimizerInput(
  context: PlanContext,
  lockedRecipeIds?: ReadonlyMap<number, string>,
  options: GenerationOptions = {},
): Promise<OptimizerInput> {
  const catalogue = getCatalogue();
  const selectable = lockedRecipeIds
    ? catalogue.recipes
    : (await selectableRecipes(context)).recipes;
  const excluded = new Set(options.excludeRecipeIds ?? []);
  const narrowed = selectable.filter((recipe) => !excluded.has(recipe.id));
  // Running out is a real possibility — 123 selectable dishes is about
  // seventeen weeks — and the caller is told, rather than silently served a
  // repeat it asked not to get.
  const recipes = narrowed.length >= DAYS_IN_WEEK ? narrowed : selectable;
  const { latitude, longitude } = context.household.location;
  /*
   * Distance is only computed when the branches are real.
   *
   * In REAL mode they are not — the price snapshot is a catalogue, not a map —
   * and a real bill combined with an invented detour makes a recommendation
   * that is half fiction with no visible seam. See `travelCostStatus`.
   */
  const travelKnown = travelCostStatus() === 'AVAILABLE';
  const { candidates } = await buildStoreCandidates({
    locationIds: context.settings.selectedLocationIds,
    // Without coordinates there is no distance to compute. Passing (0, 0) would
    // put the household in the Atlantic and make every shop 5.900 km away.
    ...(travelKnown && latitude !== undefined && longitude !== undefined
      ? { home: { latitude, longitude } }
      : {}),
    onDate: context.startDate,
  });

  const maxStores =
    context.settings.maxStores > 0 ? context.settings.maxStores : Math.max(1, candidates.length);

  return {
    household: context.household,
    recipes,
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
export async function generatePlan(
  context: PlanContext,
  options: GenerationOptions = {},
): Promise<OptimizerResult> {
  return optimiseWeek(await buildOptimizerInput(context, undefined, options));
}

/**
 * Did the exclusion list leave enough dishes to plan a week?
 *
 * The caller needs to know, because "we have shown you everything, so here is
 * the best one again" is a different answer from "here is another week", and
 * the button says so instead of pretending.
 */
export async function exclusionsLeaveEnough(
  context: PlanContext,
  excludeRecipeIds: readonly string[],
): Promise<boolean> {
  const { recipes } = await selectableRecipes(context);
  const excluded = new Set(excludeRecipeIds);
  return recipes.filter((r) => !excluded.has(r.id)).length >= DAYS_IN_WEEK;
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

/**
 * Store a week, priced.
 *
 * The seven recipes are not the week; the week is those recipes at those
 * prices, from those shops, with those promotions. All of it is written down,
 * so opening the plan tomorrow shows what you saved rather than a fresh
 * calculation wearing the same date. See `services/stored-week.ts`.
 */
export async function persistPlan(
  context: PlanContext,
  plan: WeeklyPlan,
  options: { keepChecked?: readonly string[] } = {},
): Promise<StoredPlan> {
  const repositories = getRepositories();
  return repositories.plans.save({
    householdId: context.household.id,
    startDate: plan.startDate,
    recipeIds: plan.days.map((d) => d.recipe.id),
    settings: context.settings,
    checkedItemKeys: options.keepChecked ?? [],
    generatedAt: new Date().toISOString(),
    plan: serialiseWeeklyPlan(plan),
  });
}
