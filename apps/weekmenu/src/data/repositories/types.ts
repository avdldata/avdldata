import type { SerialisedWeeklyPlan } from '@/services/stored-week';
import type { Cents } from '@/domain/units';
import type { Household } from '@/domain/household/types';
import type { ConveniencePreference } from '@/domain/optimization/config';
import type { TransportMode } from '@/domain/trip/trip-cost';

export interface AppUser {
  readonly id: string;
  readonly email: string;
  readonly createdAt: string;
  /** True for the pre-seeded demo account. */
  readonly isDemo?: boolean;
}

export const SEARCH_RADII_KM = [5, 10, 15, 25] as const;
export type SearchRadiusKm = (typeof SEARCH_RADII_KM)[number];

/** Everything the user can tune before pressing "Maak mijn week". */
export interface WeekSettings {
  readonly selectedLocationIds: readonly string[];
  /** 1, 2, 3 — or 0 for "maakt niet uit". */
  readonly maxStores: number;
  readonly conveniencePreference: ConveniencePreference;
  readonly budgetTargetCents?: Cents;
  readonly budgetHardMaxCents?: Cents;
  readonly searchRadiusKm: SearchRadiusKm;
  readonly transportMode: TransportMode;
  readonly costPerKmCents: Cents;
  /** Optional cap on total cooking time per meal. */
  readonly maxMinutes?: number;
}

/**
 * What we persist for a generated week.
 *
 * Only the choices are stored — the seven recipes, the settings and which
 * shopping-list items are ticked off. Prices, packs and store assignments are
 * always recomputed from the live catalogue, so an opened plan never shows a
 * stale price. It also keeps the demo store and the Postgres schema identical
 * in shape.
 */
export interface StoredPlan {
  readonly id: string;
  readonly householdId: string;
  readonly startDate: string;
  readonly createdAt: string;
  readonly recipeIds: readonly string[];
  readonly settings: WeekSettings;
  readonly checkedItemKeys: readonly string[];
  /**
   * When this week was priced.
   *
   * Shown to the user, because "€ 71,40" means nothing without it once the
   * price snapshot has moved on.
   */
  readonly generatedAt: string;
  /**
   * The priced week itself — see `services/stored-week.ts`.
   *
   * Absent only for a row written before weeks were stored priced. Such a week
   * is re-priced once, on demand, and the caller says so rather than showing a
   * new total as though it were the old one.
   */
  readonly plan?: SerialisedWeeklyPlan;
}

export interface HouseholdRepository {
  getByOwner(userId: string): Promise<Household | null>;
  save(userId: string, household: Household): Promise<Household>;
  deleteByOwner(userId: string): Promise<void>;
}

export interface SettingsRepository {
  get(householdId: string): Promise<WeekSettings | null>;
  save(householdId: string, settings: WeekSettings): Promise<WeekSettings>;
}

export interface PlanRepository {
  getCurrent(householdId: string): Promise<StoredPlan | null>;
  save(plan: Omit<StoredPlan, 'id' | 'createdAt'>): Promise<StoredPlan>;
  setChecked(householdId: string, itemKey: string, checked: boolean): Promise<void>;
  clearChecked(householdId: string): Promise<void>;
}

export interface UserRepository {
  findByEmail(email: string): Promise<AppUser | null>;
  findById(id: string): Promise<AppUser | null>;
  create(email: string, password: string): Promise<AppUser>;
  verify(email: string, password: string): Promise<AppUser | null>;
  delete(id: string): Promise<void>;
}

export interface Repositories {
  readonly kind: 'demo' | 'supabase';
  readonly users: UserRepository;
  readonly households: HouseholdRepository;
  readonly settings: SettingsRepository;
  readonly plans: PlanRepository;
}

export const DEFAULT_WEEK_SETTINGS: WeekSettings = {
  selectedLocationIds: [],
  maxStores: 2,
  conveniencePreference: 'gebalanceerd',
  searchRadiusKm: 10,
  transportMode: 'auto',
  costPerKmCents: 23 as Cents,
};
