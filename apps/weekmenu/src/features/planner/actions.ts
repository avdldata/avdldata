'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { Cents } from '@/domain/units';
import { cents } from '@/domain/units';
import { getRepositories } from '@/data';
import {
  DEFAULT_WEEK_SETTINGS,
  SEARCH_RADII_KM,
  type WeekSettings,
} from '@/data/repositories/types';
import { requireUser } from '@/services/auth';
import {
  findAlternatives,
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

  const budget = toCents(parsed.data.budgetAmount);
  const radius = SEARCH_RADII_KM.includes(parsed.data.searchRadiusKm as never)
    ? (parsed.data.searchRadiusKm as WeekSettings['searchRadiusKm'])
    : DEFAULT_WEEK_SETTINGS.searchRadiusKm;

  const settings: WeekSettings = {
    selectedLocationIds: parsed.data.selectedLocationIds,
    maxStores: parsed.data.maxStores,
    conveniencePreference: parsed.data.conveniencePreference,
    ...(parsed.data.budgetMode === 'richtbedrag' && budget !== undefined
      ? { budgetTargetCents: budget }
      : {}),
    ...(parsed.data.budgetMode === 'maximum' && budget !== undefined
      ? { budgetHardMaxCents: budget }
      : {}),
    searchRadiusKm: radius,
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

  await repositories.plans.save({
    householdId: context.household.id,
    startDate: stored.startDate,
    recipeIds,
    settings: context.settings,
    checkedItemKeys: stored.checkedItemKeys,
  });

  revalidatePath('/week');
  revalidatePath('/boodschappen');
  revalidatePath('/winkels');
  return { ok: true };
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
