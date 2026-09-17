import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { copyFile, mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  EXISTING_HOUSEHOLD,
  EXISTING_SETTINGS,
  EXISTING_USER_ID,
} from '../support/existing-household';
import { cents } from '@/domain/units';

let directory: string;
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'weekmenu-alpha-003-'));
  const prices = join(directory, 'prices.json');
  await copyFile('data/external/checkjebon-snapshot.json', prices);
  const captured = new Date('2026-09-17T09:00:00Z');
  await utimes(prices, captured, captured);
  await mkdir(directory, { recursive: true });
  await writeFile(
    join(directory, 'demo.json'),
    JSON.stringify({
      users: [],
      credentials: {},
      households: { [EXISTING_USER_ID]: EXISTING_HOUSEHOLD },
      settings: { [EXISTING_HOUSEHOLD.id]: EXISTING_SETTINGS },
      plans: {},
    }),
  );
  vi.stubEnv('DATA_MODE', 'REAL');
  vi.stubEnv('WEEKMENU_DATA_DIR', directory);
  vi.stubEnv('WEEKMENU_PRICE_SNAPSHOT', prices);
  vi.resetModules();
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await rm(directory, { recursive: true, force: true });
});

it('generates and persists seven REAL meals for an unchanged existing household after a midweek snapshot refresh', async () => {
  const { loadContext, generatePlan, persistPlan } = await import('@/services/plan-service');
  const { getRepositories } = await import('@/data');
  const now = new Date('2026-09-17T10:00:00Z');
  const context = (await loadContext(EXISTING_USER_ID, now))!;
  expect(context.settings).toEqual(EXISTING_SETTINGS);
  expect(context.startDate).toBe('2026-09-14');
  const result = await generatePlan(context);
  expect(
    result.status,
    result.status === 'FAILED' ? `${result.reason}: ${result.message}` : '',
  ).toBe('OK');
  if (result.status !== 'OK') return;
  expect(result.plan.days).toHaveLength(7);
  expect(result.plan.startDate).toBe('2026-09-14');
  expect(result.plan.days.every((day) => day.recipe.pregnancySuitable)).toBe(true);
  expect(result.plan.recommendedOption.unavailable).toHaveLength(0);
  expect(result.plan.totals.groceryCents).toBeGreaterThan(0);
  expect(result.plan.recommendedOption.assignments.every((a) => a.packaging.totalCents > 0)).toBe(
    true,
  );
  await persistPlan(context, result.plan);
  const stored = await getRepositories().plans.getCurrent(context.household.id);
  expect(stored?.recipeIds).toEqual(result.plan.days.map((day) => day.recipe.id));
  expect(stored?.plan).toBeDefined();
  expect(await getRepositories().settings.get(context.household.id)).toEqual(EXISTING_SETTINGS);
}, 30_000);

it('classifies a later retail failure without blaming household rules', async () => {
  const { loadContext, generatePlan } = await import('@/services/plan-service');
  const context = (await loadContext(EXISTING_USER_ID, new Date('2026-09-16T10:00:00Z')))!;
  const stages: Record<string, Readonly<Record<string, string | number>>> = {};
  const result = await generatePlan(context, {
    logger: (stage, counts) => {
      stages[stage] = counts;
    },
  });
  expect(stages.eligibility?.eligibleLibrary).toBeGreaterThan(0);
  expect(stages.eligibility?.selectable).toBe(0);
  expect(result.status).toBe('FAILED');
  if (result.status !== 'FAILED') return;
  expect(result.reason).toBe('NO_RETAIL_SOLUTION');
  expect(result.message).toContain('prijsgegevens');
  expect(result.message).not.toContain('Geen enkel recept past');
});

it('distinguishes invalid selection, dietary exclusion, budget and impossible locked week', async () => {
  const { loadContext, generatePlan, repriceStoredPlan } = await import('@/services/plan-service');
  const context = (await loadContext(EXISTING_USER_ID, new Date('2026-09-17T10:00:00Z')))!;
  const reason = (result: Awaited<ReturnType<typeof generatePlan>>) =>
    result.status === 'FAILED' ? result.reason : 'OK';
  expect(
    reason(
      await generatePlan({
        ...context,
        settings: { ...context.settings, selectedLocationIds: ['unrecognized-store'] },
      }),
    ),
  ).toBe('INVALID_STORE_SELECTION');
  expect(
    reason(
      await generatePlan({
        ...context,
        settings: { ...context.settings, selectedLocationIds: [] },
      }),
    ),
  ).toBe('NO_STORES');
  expect(
    reason(await generatePlan({ ...context, settings: { ...context.settings, maxMinutes: 15 } })),
  ).toBe('NO_ELIGIBLE_RECIPES');
  expect(
    reason(
      await generatePlan({
        ...context,
        settings: { ...context.settings, budgetHardMaxCents: cents(100) },
      }),
    ),
  ).toBe('BUDGET_TOO_LOW');
  const { getCatalogue } = await import('@/services/catalogue');
  const recipe = getCatalogue().recipes.find((r) => r.pregnancySuitable)!;
  expect(reason(await repriceStoredPlan(context, Array<string>(7).fill(recipe.id)))).toBe(
    'NO_WEEK_SOLUTION',
  );
}, 30_000);

it('uses household week settings rather than a legacy saved week for a new generation', async () => {
  const { getRepositories } = await import('@/data');
  const { loadContext, generatePlan, repriceStoredPlan } = await import('@/services/plan-service');
  const context = (await loadContext(EXISTING_USER_ID, new Date('2026-09-17T10:00:00Z')))!;
  const previous = (await getRepositories().plans.getCurrent(context.household.id))!;
  await getRepositories().plans.save({
    ...previous,
    settings: {
      ...EXISTING_SETTINGS,
      maxMinutes: 0,
      budgetHardMaxCents: cents(1),
      selectedLocationIds: ['old-invalid-selection'],
    },
  });
  const reloaded = (await loadContext(EXISTING_USER_ID, context.today))!;
  expect(reloaded.settings).toEqual(EXISTING_SETTINGS);
  expect((await generatePlan(reloaded)).status).toBe('OK');
  // Repricing old calendar placement also values groceries at today's date.
  expect(
    (await repriceStoredPlan({ ...reloaded, startDate: '2026-09-07' }, previous.recipeIds)).status,
  ).toBe('OK');
}, 30_000);

it('uses the retail-solvable recipe pool without accepting an incomplete single-chain basket', async () => {
  const { loadContext, generatePlan } = await import('@/services/plan-service');
  const context = (await loadContext(EXISTING_USER_ID, new Date('2026-09-17T10:00:00Z')))!;
  const result = await generatePlan({
    ...context,
    settings: { ...context.settings, selectedLocationIds: ['lidl-beijum'], maxStores: 1 },
  });
  expect(result.status).toBe('OK');
  if (result.status !== 'OK') return;
  expect(result.plan.days).toHaveLength(7);
  expect(result.plan.recommendedOption.unavailable).toHaveLength(0);
}, 30_000);
