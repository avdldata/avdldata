'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { Household } from '@/domain/household/types';
import { getRepositories } from '@/data';
import { DEFAULT_WEEK_SETTINGS, type WeekSettings } from '@/data/repositories/types';
import { requireUser } from '@/services/auth';
import {
  locateHousehold,
  newHouseholdId,
  toDomainMember,
  toDomainPreferences,
} from '@/services/household-service';
import { locationIdsForChains } from '@/services/store-service';
import {
  householdSchema,
  memberSchema,
  preferencesSchema,
  type HouseholdInput,
  type MemberInput,
  type PreferencesInput,
} from './schema';

export interface ActionResult {
  readonly ok: boolean;
  readonly error?: string;
}

async function loadHousehold(userId: string): Promise<Household | null> {
  return getRepositories().households.getByOwner(userId);
}

export interface OnboardingPayload {
  readonly household: HouseholdInput;
  readonly members: MemberInput[];
  readonly preferences: PreferencesInput;
  /**
   * Chains, not branches. See `supportedChains`: the prices are per chain, and
   * asking for a branch made onboarding impossible outside the seeded city.
   */
  readonly selectedChainIds: string[];
  readonly maxStores: number;
}

/** Create the household, its members, preferences and store selection in one go. */
export async function completeOnboardingAction(payload: OnboardingPayload): Promise<ActionResult> {
  const user = await requireUser();

  const household = householdSchema.safeParse(payload.household);
  if (!household.success) {
    return { ok: false, error: household.error.issues[0]?.message ?? 'Controleer je huishouden.' };
  }
  if (payload.members.length === 0) {
    return { ok: false, error: 'Voeg minimaal één gezinslid toe.' };
  }

  const members = [];
  for (const raw of payload.members) {
    const parsed = memberSchema.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? 'Controleer de gezinsleden.' };
    }
    members.push(toDomainMember(parsed.data));
  }

  const preferences = preferencesSchema.safeParse(payload.preferences);
  if (!preferences.success) return { ok: false, error: 'Controleer je voorkeuren.' };

  const repositories = getRepositories();
  const existing = await loadHousehold(user.id);
  const id = existing?.id ?? newHouseholdId();

  const saved = await repositories.households.save(user.id, {
    id,
    name: household.data.name,
    location: await locateHousehold(household.data),
    members,
    preferences: toDomainPreferences(preferences.data),
  });

  const currentSettings = (await repositories.settings.get(saved.id)) ?? DEFAULT_WEEK_SETTINGS;
  const settings: WeekSettings = {
    ...currentSettings,
    selectedLocationIds: locationIdsForChains(
      payload.selectedChainIds,
      currentSettings.selectedLocationIds,
    ),
    maxStores: payload.maxStores,
  };
  await repositories.settings.save(saved.id, settings);

  revalidatePath('/', 'layout');
  return { ok: true };
}

export async function saveHouseholdAction(input: HouseholdInput): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = householdSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Controleer je gegevens.' };
  }

  const existing = await loadHousehold(user.id);
  if (!existing) return { ok: false, error: 'Er is nog geen huishouden om aan te passen.' };

  await getRepositories().households.save(user.id, {
    ...existing,
    name: parsed.data.name,
    location: await locateHousehold(parsed.data),
  });
  revalidatePath('/gezin');
  revalidatePath('/instellingen');
  return { ok: true };
}

export async function saveMemberAction(input: MemberInput): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = memberSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Controleer de gegevens.' };
  }

  const existing = await loadHousehold(user.id);
  if (!existing) return { ok: false, error: 'Er is nog geen huishouden.' };

  const member = toDomainMember(parsed.data);
  const members = existing.members.some((m) => m.id === member.id)
    ? existing.members.map((m) => (m.id === member.id ? member : m))
    : [...existing.members, member];

  await getRepositories().households.save(user.id, { ...existing, members });
  revalidatePath('/gezin');
  revalidatePath('/week');
  return { ok: true };
}

export async function deleteMemberAction(memberId: string): Promise<ActionResult> {
  const user = await requireUser();
  const existing = await loadHousehold(user.id);
  if (!existing) return { ok: false, error: 'Er is nog geen huishouden.' };
  if (existing.members.length <= 1) {
    return { ok: false, error: 'Een huishouden heeft minimaal één gezinslid nodig.' };
  }

  await getRepositories().households.save(user.id, {
    ...existing,
    members: existing.members.filter((m) => m.id !== memberId),
  });
  revalidatePath('/gezin');
  revalidatePath('/week');
  return { ok: true };
}

export async function savePreferencesAction(input: PreferencesInput): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = preferencesSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Controleer je voorkeuren.' };

  const existing = await loadHousehold(user.id);
  if (!existing) return { ok: false, error: 'Er is nog geen huishouden.' };

  await getRepositories().households.save(user.id, {
    ...existing,
    preferences: toDomainPreferences(parsed.data),
  });
  revalidatePath('/gezin');
  revalidatePath('/week');
  return { ok: true };
}

export async function goToWeekAction(): Promise<void> {
  redirect('/week');
}
