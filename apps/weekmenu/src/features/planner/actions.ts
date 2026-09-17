'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { Cents } from '@/domain/units';
import { cents } from '@/domain/units';
import { getRepositories } from '@/data';
import { DEFAULT_WEEK_SETTINGS, type WeekSettings } from '@/data/repositories/types';
import { requireUser } from '@/services/auth';
import { locationIdsForChains } from '@/services/store-service';
import {
  exclusionsLeaveEnough,
  findAlternatives,
  selectableRecipes,
  generatePlan,
  loadContext,
  persistPlan,
  repriceStoredPlan,
} from '@/services/plan-service';
import { weekSettingsSchema, type WeekSettingsInput } from './settings-schema';

export interface PlannerResult {
  readonly ok: boolean;
  readonly error?: string;
}

/**
 * Turn a thrown data failure into something the screen can say.
 *
 * Without this a missing price snapshot rejects the server action, React
 * surfaces the rejection as a generic error, and the user is told nothing about
 * the one thing that is actually wrong. The refusal to invent prices is
 * deliberate; being unable to explain it is not.
 *
 * `redirect()` also works by throwing, so its control-flow error is passed
 * straight through — catching it would strand a signed-out visitor on the page
 * they are being sent away from.
 */
function isRedirect(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'digest' in error &&
    typeof (error as { digest?: unknown }).digest === 'string' &&
    (error as { digest: string }).digest.startsWith('NEXT_REDIRECT')
  );
}

async function guarded<T extends PlannerResult>(run: () => Promise<T>): Promise<T | PlannerResult> {
  try {
    return await run();
  } catch (error) {
    if (isRedirect(error)) throw error;
    const message = error instanceof Error ? error.message : '';
    if (/RealDataUnavailable|momentopname|snapshot/i.test(message)) {
      return {
        ok: false,
        error:
          'De prijsgegevens konden niet worden geladen. We rekenen geen week door met verzonnen prijzen — probeer het later opnieuw.',
      };
    }
    console.error('[weekmenu:planner]', message);
    return { ok: false, error: 'Er ging iets mis. Probeer het opnieuw.' };
  }
}

function toCents(value: string): Cents | undefined {
  if (value === '') return undefined;
  return cents(Number(value.replace(',', '.')) * 100);
}

export async function saveWeekSettingsAction(input: WeekSettingsInput): Promise<PlannerResult> {
  const user = await requireUser();
  const parsed = weekSettingsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Controleer je instellingen.' };
  }

  const context = await loadContext(user.id);
  if (!context) return { ok: false, error: 'Geen huishouden gevonden.' };

  /*
   * A maximum below the fastest dish is a setting that guarantees failure.
   *
   * Saving it and finding out at "maak mijn week" cost a user their whole
   * evening: every recipe fell away, and the only thing the app said was that
   * their dietary rules excluded everything. The rule itself is not weakened —
   * a cap still excludes what is too slow — but a cap nothing can meet is
   * refused here, where the number is still on screen and can be changed.
   */
  if (parsed.data.maxMinutes !== '') {
    const minutes = Number(parsed.data.maxMinutes);
    const { recipes } = await selectableRecipes(context);
    const fastest = recipes.reduce(
      (least, recipe) => Math.min(least, recipe.totalMinutes),
      Number.POSITIVE_INFINITY,
    );
    if (Number.isFinite(fastest) && minutes < fastest) {
      return {
        ok: false,
        error: `Geen enkel gerecht is binnen ${minutes} minuten klaar; het snelste duurt ${fastest} minuten. Kies een hogere maximale bereidingstijd of laat het veld leeg.`,
      };
    }
  }

  const budget = toCents(parsed.data.budgetAmount);

  const settings: WeekSettings = {
    // The screen speaks chains; the settings keep branches, because that is
    // what the optimizer and a future real locator use. A chain the household
    // already had keeps the branch it already had.
    selectedLocationIds: locationIdsForChains(
      parsed.data.selectedChainIds,
      context.settings.selectedLocationIds,
    ),
    maxStores: parsed.data.maxStores,
    conveniencePreference: parsed.data.conveniencePreference,
    ...(parsed.data.budgetMode === 'richtbedrag' && budget !== undefined
      ? { budgetTargetCents: budget }
      : {}),
    ...(parsed.data.budgetMode === 'maximum' && budget !== undefined
      ? { budgetHardMaxCents: budget }
      : {}),
    // Kept as stored: the radius no longer has a control, but the field is
    // still part of the settings a future store locator would use.
    searchRadiusKm: context.settings.searchRadiusKm,
    transportMode: parsed.data.transportMode,
    costPerKmCents: toCents(parsed.data.costPerKm) ?? DEFAULT_WEEK_SETTINGS.costPerKmCents,
    ...(parsed.data.maxMinutes !== '' ? { maxMinutes: Number(parsed.data.maxMinutes) } : {}),
  };

  await getRepositories().settings.save(context.household.id, settings);
  revalidatePath('/week');
  revalidatePath('/boodschappen');
  revalidatePath('/winkels');
  return { ok: true };
}

/** Run the optimizer and store the resulting week. */
export async function generateWeekAction(): Promise<PlannerResult> {
  return guarded(async () => {
    const user = await requireUser();
    const context = await loadContext(user.id);
    if (!context) return { ok: false, error: 'Geen huishouden gevonden.' };

    const result = await generatePlan(context);
    if (result.status !== 'OK') return { ok: false, error: result.message };

    await persistPlan(context, result.plan);
    revalidatePath('/week');
    revalidatePath('/boodschappen');
    revalidatePath('/winkels');
    return { ok: true };
  });
}

export interface RegenerateResult extends PlannerResult {
  /** The dishes that ended up on the new week, so the caller can keep asking. */
  readonly recipeIds?: readonly string[];
  /** True when the library ran out and the exclusions had to be dropped. */
  readonly wrapped?: boolean;
}

/**
 * "Show me a different week."
 *
 * The optimizer gives the same answer to the same question, which is the right
 * behaviour and also the reason this action exists: to get a different week you
 * have to ask a different question. The caller passes everything it has already
 * been shown, and those dishes are taken out of the running.
 *
 * The list lives in the button rather than in the database. That keeps a
 * browsing session's "not that one either" out of the household's stored data,
 * and it means a reload starts fresh — which is the honest behaviour, because
 * nothing here is a lasting preference. Whether the user liked a dish is a
 * different question, for a different sprint.
 */
export async function regenerateWeekAction(
  seenRecipeIds: readonly string[] = [],
): Promise<RegenerateResult> {
  return guarded(async () => {
    const user = await requireUser();
    const context = await loadContext(user.id);
    if (!context) return { ok: false, error: 'Geen huishouden gevonden.' };

    const enough = await exclusionsLeaveEnough(context, seenRecipeIds);
    const result = await generatePlan(context, {
      ...(enough ? { excludeRecipeIds: seenRecipeIds } : {}),
    });
    if (result.status !== 'OK') return { ok: false, error: result.message };

    await persistPlan(context, result.plan);
    revalidatePath('/week');
    revalidatePath('/boodschappen');
    revalidatePath('/winkels');
    return {
      ok: true,
      recipeIds: result.plan.days.map((d) => d.recipe.id),
      ...(enough ? {} : { wrapped: true }),
    };
  });
}

/**
 * "Bereken deze week opnieuw met de prijzen van nu."
 *
 * The only way a saved week's total changes. The seven dishes stay exactly as
 * they are; everything about the money — packs, shops, promotions — is worked
 * out again against today's catalogue and written down as the new saved week.
 * The ticks survive, because the trolley is largely the same trolley.
 */
export async function recalculateWeekAction(): Promise<PlannerResult> {
  return guarded(async () => {
    const user = await requireUser();
    const context = await loadContext(user.id);
    if (!context) return { ok: false, error: 'Geen huishouden gevonden.' };

    const stored = await getRepositories().plans.getCurrent(context.household.id);
    if (!stored) return { ok: false, error: 'Er is nog geen week om te berekenen.' };

    const repriced = await repriceStoredPlan(
      { ...context, startDate: stored.startDate },
      stored.recipeIds,
    );
    if (repriced.status !== 'OK') return { ok: false, error: repriced.message };

    await persistPlan({ ...context, startDate: stored.startDate }, repriced.plan, {
      keepChecked: stored.checkedItemKeys,
    });
    revalidatePath('/week');
    revalidatePath('/boodschappen');
    revalidatePath('/winkels');
    return { ok: true };
  });
}

export async function generateWeekAndGoAction(): Promise<void> {
  const result = await generateWeekAction();
  if (!result.ok) {
    redirect(`/week/genereren?fout=${encodeURIComponent(result.error ?? 'Onbekende fout')}`);
  }
  redirect('/week');
}

export interface AlternativeView {
  readonly recipeId: string;
  readonly name: string;
  readonly description: string;
  readonly imageUrl: string;
  readonly totalMinutes: number;
  readonly deltaCents: number;
  readonly sharedIngredients: number;
  readonly deltaKcalPerPerson: number;
  readonly kcalPerServing: number;
}

/** Three alternatives for one day, each priced as a complete week. */
export async function findAlternativesAction(dayIndex: number): Promise<{
  ok: boolean;
  error?: string;
  alternatives?: AlternativeView[];
}> {
  const user = await requireUser();
  const context = await loadContext(user.id);
  if (!context) return { ok: false, error: 'Geen huishouden gevonden.' };

  const stored = await getRepositories().plans.getCurrent(context.household.id);
  if (!stored) return { ok: false, error: 'Er is nog geen week om aan te passen.' };

  const current = await repriceStoredPlan(
    { ...context, startDate: stored.startDate },
    stored.recipeIds,
  );
  if (current.status !== 'OK') return { ok: false, error: current.message };

  const alternatives = await findAlternatives(
    { ...context, startDate: stored.startDate },
    current.plan,
    dayIndex,
  );

  return {
    ok: true,
    alternatives: alternatives.map((alternative) => ({
      recipeId: alternative.recipe.id,
      name: alternative.recipe.name,
      description: alternative.recipe.description,
      imageUrl: alternative.recipe.imageUrl,
      totalMinutes: alternative.recipe.totalMinutes,
      deltaCents: alternative.deltaCents,
      sharedIngredients: alternative.sharedIngredients,
      deltaKcalPerPerson: alternative.deltaKcalPerPerson,
      kcalPerServing: alternative.recipe.nutritionPerServing.kcal,
    })),
  };
}

export async function replaceDishAction(
  dayIndex: number,
  recipeId: string,
): Promise<PlannerResult> {
  return guarded(async () => {
    const user = await requireUser();
    const context = await loadContext(user.id);
    if (!context) return { ok: false, error: 'Geen huishouden gevonden.' };

    const repositories = getRepositories();
    const stored = await repositories.plans.getCurrent(context.household.id);
    if (!stored) return { ok: false, error: 'Er is nog geen week om aan te passen.' };

    const recipeIds = stored.recipeIds.map((id, index) => (index === dayIndex ? recipeId : id));
    if (new Set(recipeIds).size !== recipeIds.length) {
      return { ok: false, error: 'Dit gerecht staat al ergens anders in de week.' };
    }

    // Re-price the whole week before saving: a swap changes what you buy, which
    // changes packs, which can change which supermarket is cheapest.
    const repriced = await repriceStoredPlan(
      { ...context, startDate: stored.startDate },
      recipeIds,
    );
    if (repriced.status !== 'OK') return { ok: false, error: repriced.message };

    // The swap is a deliberate act, so a new price is expected. The ticks stay:
    // the other six days did not change, and neither did most of the trolley.
    await persistPlan({ ...context, startDate: stored.startDate }, repriced.plan, {
      keepChecked: stored.checkedItemKeys,
    });

    revalidatePath('/week');
    revalidatePath('/boodschappen');
    revalidatePath('/winkels');
    return { ok: true };
  });
}

export async function toggleShoppingItemAction(
  itemKey: string,
  checked: boolean,
): Promise<PlannerResult> {
  const user = await requireUser();
  const context = await loadContext(user.id);
  if (!context) return { ok: false, error: 'Geen huishouden gevonden.' };
  await getRepositories().plans.setChecked(context.household.id, itemKey, checked);
  return { ok: true };
}

export async function clearShoppingListAction(): Promise<PlannerResult> {
  const user = await requireUser();
  const context = await loadContext(user.id);
  if (!context) return { ok: false, error: 'Geen huishouden gevonden.' };
  await getRepositories().plans.clearChecked(context.household.id);
  revalidatePath('/boodschappen');
  return { ok: true };
}
