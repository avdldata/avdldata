import 'server-only';
import type { SerialisedWeeklyPlan } from '@/services/stored-week';
import type { Cents } from '@/domain/units';
import type {
  ActivityLevel,
  Diet,
  Goal,
  Household,
  HouseholdMember,
  LocationPrecision,
  PreferenceLevel,
  Sex,
  Trimester,
} from '@/domain/household/types';
import type { Allergen } from '@/domain/ingredients/types';
import type { Cuisine, RecipeTag } from '@/domain/recipes/types';
import type { ConveniencePreference } from '@/domain/optimization/config';
import type { TransportMode } from '@/domain/trip/trip-cost';
import type {
  AppUser,
  HouseholdRepository,
  PlanRepository,
  Repositories,
  SearchRadiusKm,
  SettingsRepository,
  StoredPlan,
  UserRepository,
  WeekSettings,
} from '../repositories/types';
import { getSupabase, isSupabaseConfigured } from './client';

export { isSupabaseConfigured };

/* eslint-disable @typescript-eslint/no-explicit-any -- rows come back untyped
   until `supabase gen types` is run against a live project; every row is mapped
   through an explicit function below rather than being trusted as-is. */
type Row = Record<string, any>;

function fail(operation: string, error: { message: string } | null): void {
  if (error) throw new Error(`Supabase ${operation} failed: ${error.message}`);
}

function toMember(row: Row, rules: readonly Row[]): HouseholdMember {
  const mine = rules.filter((r) => r.member_id === row.id);
  return {
    id: row.id as string,
    name: row.name as string,
    ...(row.birth_date ? { birthDate: row.birth_date as string } : {}),
    ...(row.age_years !== null && row.age_years !== undefined
      ? { ageYears: row.age_years as number }
      : {}),
    sex: row.sex as Sex,
    ...(row.height_cm !== null ? { heightCm: row.height_cm as number } : {}),
    ...(row.weight_kg !== null ? { weightKg: Number(row.weight_kg) } : {}),
    activityLevel: row.activity_level as ActivityLevel,
    goal: row.goal as Goal,
    diet: row.diet as Diet,
    ...(row.pregnant
      ? {
          pregnancy: {
            pregnant: true as const,
            ...(row.trimester ? { trimester: row.trimester as Trimester } : {}),
            ...(row.due_date ? { dueDate: row.due_date as string } : {}),
          },
        }
      : {}),
    allergies: mine.filter((r) => r.rule_type === 'allergen').map((r) => r.value as Allergen),
    excludedIngredientIds: mine
      .filter((r) => r.rule_type === 'exclude_ingredient')
      .map((r) => r.value as string),
  };
}

function toHousehold(
  household: Row,
  members: readonly Row[],
  rules: readonly Row[],
  prefs: readonly Row[],
): Household {
  return {
    id: household.id as string,
    name: household.name as string,
    location: {
      postalCode: household.postal_code as string,
      ...(household.house_number ? { houseNumber: household.house_number as string } : {}),
      city: household.city as string,
      country: household.country as string,
      ...(household.latitude !== null ? { latitude: Number(household.latitude) } : {}),
      ...(household.longitude !== null ? { longitude: Number(household.longitude) } : {}),
      precision: household.location_precision as LocationPrecision,
    },
    members: members.map((m) => toMember(m, rules)),
    preferences: {
      ingredients: prefs
        .filter((p) => p.scope === 'ingredient')
        .map((p) => ({ value: p.value as string, level: p.level as PreferenceLevel })),
      cuisines: prefs
        .filter((p) => p.scope === 'cuisine')
        .map((p) => ({ value: p.value as Cuisine, level: p.level as PreferenceLevel })),
      tags: prefs
        .filter((p) => p.scope === 'tag')
        .map((p) => ({ value: p.value as RecipeTag, level: p.level as PreferenceLevel })),
    },
  };
}

class SupabaseUserRepository implements UserRepository {
  async findByEmail(): Promise<AppUser | null> {
    // Supabase Auth owns the user table; lookup by e-mail needs a service role,
    // which this application deliberately never holds.
    return null;
  }

  async findById(id: string): Promise<AppUser | null> {
    const supabase = await getSupabase();
    const { data } = await supabase.auth.getUser();
    if (!data.user || data.user.id !== id) return null;
    return {
      id: data.user.id,
      email: data.user.email ?? '',
      createdAt: data.user.created_at,
    };
  }

  async create(email: string, password: string): Promise<AppUser> {
    const supabase = await getSupabase();
    const { data, error } = await supabase.auth.signUp({ email, password });
    fail('signUp', error);
    if (!data.user) throw new Error('Supabase signUp returned no user');
    return { id: data.user.id, email: data.user.email ?? email, createdAt: data.user.created_at };
  }

  async verify(email: string, password: string): Promise<AppUser | null> {
    const supabase = await getSupabase();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.user) return null;
    return { id: data.user.id, email: data.user.email ?? email, createdAt: data.user.created_at };
  }

  async delete(): Promise<void> {
    throw new Error(
      'Account verwijderen via Supabase vereist een server-side service role; zie DATABASE.md.',
    );
  }
}

class SupabaseHouseholdRepository implements HouseholdRepository {
  async getByOwner(userId: string): Promise<Household | null> {
    const supabase = await getSupabase();
    const { data: households, error } = await supabase
      .from('households')
      .select('*')
      .eq('owner_id', userId)
      .limit(1);
    fail('households.select', error);
    const household = households?.[0];
    if (!household) return null;

    const [{ data: members }, { data: prefs }] = await Promise.all([
      supabase.from('household_members').select('*').eq('household_id', household.id),
      supabase.from('preferences').select('*').eq('household_id', household.id),
    ]);

    const memberIds = (members ?? []).map((m: Row) => m.id);
    const { data: rules } = memberIds.length
      ? await supabase.from('member_dietary_rules').select('*').in('member_id', memberIds)
      : { data: [] as Row[] };

    return toHousehold(household, members ?? [], rules ?? [], prefs ?? []);
  }

  async save(userId: string, household: Household): Promise<Household> {
    const supabase = await getSupabase();

    const { error: householdError } = await supabase.from('households').upsert({
      id: household.id,
      owner_id: userId,
      name: household.name,
      postal_code: household.location.postalCode,
      house_number: household.location.houseNumber ?? null,
      city: household.location.city,
      country: household.location.country,
      latitude: household.location.latitude ?? null,
      longitude: household.location.longitude ?? null,
      location_precision: household.location.precision,
    });
    fail('households.upsert', householdError);

    // Members and preferences are replaced wholesale: the edit screens always
    // submit the complete set, and a diff would only add failure modes.
    await supabase.from('household_members').delete().eq('household_id', household.id);
    await supabase.from('preferences').delete().eq('household_id', household.id);

    if (household.members.length > 0) {
      const { error } = await supabase.from('household_members').insert(
        household.members.map((m) => ({
          id: m.id,
          household_id: household.id,
          name: m.name,
          birth_date: m.birthDate ?? null,
          age_years: m.ageYears ?? null,
          sex: m.sex,
          height_cm: m.heightCm ?? null,
          weight_kg: m.weightKg ?? null,
          activity_level: m.activityLevel,
          goal: m.goal,
          diet: m.diet,
          pregnant: m.pregnancy?.pregnant ?? false,
          trimester: m.pregnancy?.trimester ?? null,
          due_date: m.pregnancy?.dueDate ?? null,
        })),
      );
      fail('household_members.insert', error);

      const rules = household.members.flatMap((m) => [
        ...m.allergies.map((value) => ({ member_id: m.id, rule_type: 'allergen', value })),
        ...m.excludedIngredientIds.map((value) => ({
          member_id: m.id,
          rule_type: 'exclude_ingredient',
          value,
        })),
      ]);
      if (rules.length > 0) {
        const { error: ruleError } = await supabase.from('member_dietary_rules').insert(rules);
        fail('member_dietary_rules.insert', ruleError);
      }
    }

    const prefs = [
      ...household.preferences.ingredients.map((p) => ({ scope: 'ingredient', ...p })),
      ...household.preferences.cuisines.map((p) => ({ scope: 'cuisine', ...p })),
      ...household.preferences.tags.map((p) => ({ scope: 'tag', ...p })),
    ].map((p) => ({
      household_id: household.id,
      scope: p.scope,
      value: p.value,
      level: p.level,
    }));
    if (prefs.length > 0) {
      const { error } = await supabase.from('preferences').insert(prefs);
      fail('preferences.insert', error);
    }

    return household;
  }

  async deleteByOwner(userId: string): Promise<void> {
    const supabase = await getSupabase();
    const { error } = await supabase.from('households').delete().eq('owner_id', userId);
    fail('households.delete', error);
  }
}

class SupabaseSettingsRepository implements SettingsRepository {
  async get(householdId: string): Promise<WeekSettings | null> {
    const supabase = await getSupabase();
    const { data } = await supabase
      .from('household_settings')
      .select('*')
      .eq('household_id', householdId)
      .limit(1);
    const row = data?.[0];
    if (!row) return null;

    const { data: selection } = await supabase
      .from('household_store_selection')
      .select('location_id')
      .eq('household_id', householdId);

    return {
      selectedLocationIds: (selection ?? []).map((s: Row) => s.location_id as string),
      maxStores: row.max_stores as number,
      conveniencePreference: row.convenience_preference as ConveniencePreference,
      ...(row.budget_target_cents !== null
        ? { budgetTargetCents: row.budget_target_cents as Cents }
        : {}),
      ...(row.budget_hard_max_cents !== null
        ? { budgetHardMaxCents: row.budget_hard_max_cents as Cents }
        : {}),
      searchRadiusKm: row.search_radius_km as SearchRadiusKm,
      transportMode: row.transport_mode as TransportMode,
      costPerKmCents: row.cost_per_km_cents as Cents,
      ...(row.max_minutes !== null ? { maxMinutes: row.max_minutes as number } : {}),
    };
  }

  async save(householdId: string, settings: WeekSettings): Promise<WeekSettings> {
    const supabase = await getSupabase();
    const { error } = await supabase.from('household_settings').upsert({
      household_id: householdId,
      max_stores: settings.maxStores,
      convenience_preference: settings.conveniencePreference,
      budget_target_cents: settings.budgetTargetCents ?? null,
      budget_hard_max_cents: settings.budgetHardMaxCents ?? null,
      search_radius_km: settings.searchRadiusKm,
      transport_mode: settings.transportMode,
      cost_per_km_cents: settings.costPerKmCents,
      max_minutes: settings.maxMinutes ?? null,
    });
    fail('household_settings.upsert', error);

    await supabase.from('household_store_selection').delete().eq('household_id', householdId);
    if (settings.selectedLocationIds.length > 0) {
      const { error: selectionError } = await supabase.from('household_store_selection').insert(
        settings.selectedLocationIds.map((location_id) => ({
          household_id: householdId,
          location_id,
        })),
      );
      fail('household_store_selection.insert', selectionError);
    }

    return settings;
  }
}

class SupabasePlanRepository implements PlanRepository {
  async getCurrent(householdId: string): Promise<StoredPlan | null> {
    const supabase = await getSupabase();
    const { data } = await supabase
      .from('weekly_plans')
      .select('*')
      .eq('household_id', householdId)
      .order('created_at', { ascending: false })
      .limit(1);
    const plan = data?.[0];
    if (!plan) return null;

    const [{ data: days }, { data: items }] = await Promise.all([
      supabase
        .from('weekly_plan_days')
        .select('*')
        .eq('plan_id', plan.id)
        .order('day_index', { ascending: true }),
      supabase.from('shopping_list_items').select('*').eq('plan_id', plan.id).eq('checked', true),
    ]);

    return {
      id: plan.id as string,
      householdId,
      startDate: plan.start_date as string,
      createdAt: plan.created_at as string,
      recipeIds: (days ?? []).map((d: Row) => d.recipe_id as string),
      settings: plan.settings as WeekSettings,
      checkedItemKeys: (items ?? []).map((i: Row) => i.item_key as string),
      generatedAt: (plan.generated_at as string | null) ?? (plan.created_at as string),
      ...(plan.priced_plan ? { plan: plan.priced_plan as SerialisedWeeklyPlan } : {}),
    };
  }

  async save(plan: Omit<StoredPlan, 'id' | 'createdAt'>): Promise<StoredPlan> {
    const supabase = await getSupabase();
    const { data, error } = await supabase
      .from('weekly_plans')
      .insert({
        household_id: plan.householdId,
        start_date: plan.startDate,
        settings: plan.settings,
        generated_at: plan.generatedAt,
        // The priced week, so reopening it is a read rather than a new sum.
        priced_plan: plan.plan ?? null,
      })
      .select()
      .single();
    fail('weekly_plans.insert', error);

    const planId = (data as Row).id as string;
    const { error: dayError } = await supabase
      .from('weekly_plan_days')
      .insert(
        plan.recipeIds.map((recipe_id, day_index) => ({ plan_id: planId, day_index, recipe_id })),
      );
    fail('weekly_plan_days.insert', dayError);

    return {
      id: planId,
      householdId: plan.householdId,
      startDate: plan.startDate,
      createdAt: (data as Row).created_at as string,
      recipeIds: plan.recipeIds,
      settings: plan.settings,
      checkedItemKeys: plan.checkedItemKeys,
      generatedAt: plan.generatedAt,
      ...(plan.plan ? { plan: plan.plan } : {}),
    };
  }

  async setChecked(householdId: string, itemKey: string, checked: boolean): Promise<void> {
    const current = await this.getCurrent(householdId);
    if (!current) return;
    const supabase = await getSupabase();
    const { error } = await supabase
      .from('shopping_list_items')
      .upsert(
        { plan_id: current.id, item_key: itemKey, checked },
        { onConflict: 'plan_id,item_key' },
      );
    fail('shopping_list_items.upsert', error);
  }

  async clearChecked(householdId: string): Promise<void> {
    const current = await this.getCurrent(householdId);
    if (!current) return;
    const supabase = await getSupabase();
    const { error } = await supabase
      .from('shopping_list_items')
      .update({ checked: false })
      .eq('plan_id', current.id);
    fail('shopping_list_items.update', error);
  }
}

export function createSupabaseRepositories(): Repositories {
  return {
    kind: 'supabase',
    users: new SupabaseUserRepository(),
    households: new SupabaseHouseholdRepository(),
    settings: new SupabaseSettingsRepository(),
    plans: new SupabasePlanRepository(),
  };
}
