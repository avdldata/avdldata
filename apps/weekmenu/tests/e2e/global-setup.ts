import { copyFile, mkdir, rm, utimes } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { AGED_BY_DAYS, AGED_PRICES, DATA_DIRS, REAL_PRICES } from './snapshot-paths';

/**
 * Start every end-to-end run from an empty store, and build the fixtures that
 * the servers with deliberately broken data need.
 */
export default async function globalSetup(): Promise<void> {
  for (const dir of Object.values(DATA_DIRS)) {
    await rm(resolve(process.cwd(), dir), { recursive: true, force: true });
  }

  // The aged copy is rebuilt every run, so it is always exactly AGED_BY_DAYS
  // old and never a stale artefact of an earlier one. Without the real
  // snapshot there is nothing to age; the tests that need it skip themselves.
  if (!existsSync(REAL_PRICES)) return;
  const target = resolve(process.cwd(), AGED_PRICES);
  await mkdir(dirname(target), { recursive: true });
  await copyFile(resolve(process.cwd(), REAL_PRICES), target);
  const when = new Date(Date.now() - AGED_BY_DAYS * 86_400_000);
  await utimes(target, when, when);
}
