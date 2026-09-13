import 'server-only';
import { randomUUID, scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Household } from '@/domain/household/types';
import {
  DEMO_EMAIL,
  DEMO_HOUSEHOLD,
  DEMO_PASSWORD,
  DEMO_SELECTED_LOCATION_IDS,
  DEMO_USER_ID,
} from '@/data/seed/demo-household';
import type {
  AppUser,
  HouseholdRepository,
  PlanRepository,
  Repositories,
  SettingsRepository,
  StoredPlan,
  UserRepository,
  WeekSettings,
} from '../repositories/types';
import { DEFAULT_WEEK_SETTINGS } from '../repositories/types';
import { read, write, type DemoDatabase } from './file-store';

function hashPassword(password: string, salt = randomBytes(16).toString('hex')): string {
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, digest] = stored.split(':');
  if (!salt || !digest) return false;
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(digest, 'hex');
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

/**
 * Make sure the demo account exists.
 *
 * The seeded household (Arjan and Chimene) is created lazily on first access so
 * the app is immediately demonstrable, while any account a visitor registers
 * starts from an empty onboarding flow.
 */
function ensureDemoAccount(db: DemoDatabase): void {
  if (!db.users.some((u) => u.id === DEMO_USER_ID)) {
    db.users.push({
      id: DEMO_USER_ID,
      email: DEMO_EMAIL,
      createdAt: new Date(0).toISOString(),
      isDemo: true,
    });
    db.credentials[DEMO_USER_ID] = hashPassword(DEMO_PASSWORD);
  }
  if (!db.households[DEMO_USER_ID]) {
    db.households[DEMO_USER_ID] = structuredClone(DEMO_HOUSEHOLD);
  }
  if (!db.settings[DEMO_HOUSEHOLD.id]) {
    db.settings[DEMO_HOUSEHOLD.id] = {
      ...DEFAULT_WEEK_SETTINGS,
      selectedLocationIds: DEMO_SELECTED_LOCATION_IDS,
    };
  }
}

class DemoUserRepository implements UserRepository {
  async findByEmail(email: string): Promise<AppUser | null> {
    const needle = email.trim().toLowerCase();
    return read((db) => {
      ensureDemoAccount(db);
      return db.users.find((u) => u.email === needle) ?? null;
    });
  }

  async findById(id: string): Promise<AppUser | null> {
    return read((db) => {
      ensureDemoAccount(db);
      return db.users.find((u) => u.id === id) ?? null;
    });
  }

  async create(email: string, password: string): Promise<AppUser> {
    const needle = email.trim().toLowerCase();
    return write((db) => {
      ensureDemoAccount(db);
      if (db.users.some((u) => u.email === needle)) {
        throw new Error('EMAIL_TAKEN');
      }
      const user: AppUser = {
        id: randomUUID(),
        email: needle,
        createdAt: new Date().toISOString(),
      };
      db.users.push(user);
      db.credentials[user.id] = hashPassword(password);
      return user;
    });
  }

  async verify(email: string, password: string): Promise<AppUser | null> {
    const needle = email.trim().toLowerCase();
    return write((db) => {
      ensureDemoAccount(db);
      const user = db.users.find((u) => u.email === needle);
      if (!user) return null;
      const stored = db.credentials[user.id];
      if (!stored || !verifyPassword(password, stored)) return null;
      return user;
    });
  }

  async delete(id: string): Promise<void> {
    await write((db) => {
      const household = db.households[id];
      db.users = db.users.filter((u) => u.id !== id);
      delete db.credentials[id];
      delete db.households[id];
      if (household) {
        delete db.settings[household.id];
        delete db.plans[household.id];
      }
    });
  }
}

class DemoHouseholdRepository implements HouseholdRepository {
  async getByOwner(userId: string): Promise<Household | null> {
    return read((db) => {
      ensureDemoAccount(db);
      return db.households[userId] ?? null;
    });
  }

  async save(userId: string, household: Household): Promise<Household> {
    return write((db) => {
      ensureDemoAccount(db);
      db.households[userId] = household;
      return household;
    });
  }

  async deleteByOwner(userId: string): Promise<void> {
    await write((db) => {
      const household = db.households[userId];
      delete db.households[userId];
      if (household) {
        delete db.settings[household.id];
        delete db.plans[household.id];
      }
    });
  }
}

class DemoSettingsRepository implements SettingsRepository {
  async get(householdId: string): Promise<WeekSettings | null> {
    return read((db) => {
      ensureDemoAccount(db);
      return db.settings[householdId] ?? null;
    });
  }

  async save(householdId: string, settings: WeekSettings): Promise<WeekSettings> {
    return write((db) => {
      db.settings[householdId] = settings;
      return settings;
    });
  }
}

class DemoPlanRepository implements PlanRepository {
  async getCurrent(householdId: string): Promise<StoredPlan | null> {
    return read((db) => db.plans[householdId] ?? null);
  }

  async save(plan: Omit<StoredPlan, 'id' | 'createdAt'>): Promise<StoredPlan> {
    return write((db) => {
      const stored: StoredPlan = {
        ...plan,
        id: randomUUID(),
        createdAt: new Date().toISOString(),
      };
      db.plans[plan.householdId] = stored;
      return stored;
    });
  }

  async setChecked(householdId: string, itemKey: string, checked: boolean): Promise<void> {
    await write((db) => {
      const plan = db.plans[householdId];
      if (!plan) return;
      const keys = new Set(plan.checkedItemKeys);
      if (checked) keys.add(itemKey);
      else keys.delete(itemKey);
      db.plans[householdId] = { ...plan, checkedItemKeys: [...keys].sort() };
    });
  }

  async clearChecked(householdId: string): Promise<void> {
    await write((db) => {
      const plan = db.plans[householdId];
      if (!plan) return;
      db.plans[householdId] = { ...plan, checkedItemKeys: [] };
    });
  }
}

export function createDemoRepositories(): Repositories {
  return {
    kind: 'demo',
    users: new DemoUserRepository(),
    households: new DemoHouseholdRepository(),
    settings: new DemoSettingsRepository(),
    plans: new DemoPlanRepository(),
  };
}
