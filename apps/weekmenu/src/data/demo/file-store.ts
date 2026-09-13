import 'server-only';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import type { Household } from '@/domain/household/types';
import type { AppUser, StoredPlan, WeekSettings } from '../repositories/types';

export interface DemoDatabase {
  users: AppUser[];
  /** Password hashes, keyed by user id. Never logged, never returned. */
  credentials: Record<string, string>;
  households: Record<string, Household>;
  settings: Record<string, WeekSettings>;
  plans: Record<string, StoredPlan>;
}

const EMPTY_DB: DemoDatabase = {
  users: [],
  credentials: {},
  households: {},
  settings: {},
  plans: {},
};

function dataFile(): string {
  const dir = process.env.WEEKMENU_DATA_DIR ?? '.data';
  return resolve(join(dir, 'demo.json'));
}

/**
 * A tiny JSON-file database for demo mode.
 *
 * It exists so the whole application — onboarding, plan generation, ticking off
 * the shopping list — runs end to end with no external service and no
 * credentials. Writes are serialised through an in-process queue and land via a
 * temp file + rename, so a crash mid-write cannot corrupt the store.
 */
let queue: Promise<unknown> = Promise.resolve();
let memory: DemoDatabase | undefined;

async function load(): Promise<DemoDatabase> {
  if (memory) return memory;
  try {
    const raw = await readFile(dataFile(), 'utf8');
    memory = { ...EMPTY_DB, ...(JSON.parse(raw) as Partial<DemoDatabase>) };
  } catch {
    memory = structuredClone(EMPTY_DB);
  }
  return memory;
}

async function persist(db: DemoDatabase): Promise<void> {
  const target = dataFile();
  await mkdir(dirname(target), { recursive: true });
  const temp = `${target}.${process.pid}.tmp`;
  await writeFile(temp, JSON.stringify(db, null, 2), 'utf8');
  await rename(temp, target);
}

/** Run a read against the store. */
export async function read<T>(fn: (db: DemoDatabase) => T): Promise<T> {
  const result = queue.then(async () => fn(await load()));
  queue = result.catch(() => undefined);
  return result;
}

/** Run a mutation against the store and flush it to disk. */
export async function write<T>(fn: (db: DemoDatabase) => T | Promise<T>): Promise<T> {
  const result = queue.then(async () => {
    const db = await load();
    const value = await fn(db);
    await persist(db);
    return value;
  });
  queue = result.catch(() => undefined);
  return result;
}

/** Test helper: forget the in-memory copy so the next read hits disk. */
export function resetCache(): void {
  memory = undefined;
}
