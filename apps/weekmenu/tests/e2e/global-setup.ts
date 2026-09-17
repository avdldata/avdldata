import { copyFile, mkdir, readFile, rm, utimes, writeFile } from 'node:fs/promises';
import { scryptSync } from 'node:crypto';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { AGED_BY_DAYS, AGED_PRICES, DATA_DIRS, REAL_PRICES } from './snapshot-paths';
import {
  EXISTING_EMAIL,
  EXISTING_PASSWORD,
  EXISTING_USER_ID,
  EXISTING_HOUSEHOLD,
  EXISTING_SETTINGS,
} from '../support/existing-household';

/**
 * Start every end-to-end run from an empty store, and build the fixtures that
 * the servers with deliberately broken data need.
 */
export default async function globalSetup(): Promise<void> {
  for (const dir of Object.values(DATA_DIRS)) {
    await rm(resolve(process.cwd(), dir), { recursive: true, force: true });
  }

  // Fixture setup happens before any server or browser journey starts.
  const salt = 'alpha-003-test-salt';
  let existingHousehold = EXISTING_HOUSEHOLD;
  let existingSettings = EXISTING_SETTINGS;
  if (process.env.E2E_EXISTING_DATABASE) {
    // Optional local acceptance with the actual persisted domain inputs.
    // Only identities change in this isolated copy; no live account is edited.
    const source = JSON.parse(await readFile(process.env.E2E_EXISTING_DATABASE, 'utf8'));
    const entry = Object.entries(source.households).find(([owner]) => owner !== 'demo-user');
    if (!entry) throw new Error('Geen bestaand household voor de acceptatierun.');
    const original = entry[1] as typeof EXISTING_HOUSEHOLD;
    existingHousehold = {
      ...original,
      id: EXISTING_HOUSEHOLD.id,
      name: 'Testhuishouden',
      members: original.members.map((member, index) => ({
        ...member,
        id: `test-member-${index}`,
        name: `Testlid ${index + 1}`,
      })),
    };
    existingSettings = source.settings[original.id];
  }
  await mkdir(DATA_DIRS.healthy, { recursive: true });
  await writeFile(
    resolve(DATA_DIRS.healthy, 'demo.json'),
    JSON.stringify({
      users: [{ id: EXISTING_USER_ID, email: EXISTING_EMAIL, createdAt: '2026-09-01T09:00:00Z' }],
      credentials: {
        [EXISTING_USER_ID]: `${salt}:${scryptSync(EXISTING_PASSWORD, salt, 64).toString('hex')}`,
      },
      households: { [EXISTING_USER_ID]: existingHousehold },
      settings: { [EXISTING_HOUSEHOLD.id]: existingSettings },
      plans: {},
    }),
  );

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
