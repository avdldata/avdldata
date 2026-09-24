import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { copyFile, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  EXISTING_HOUSEHOLD,
  EXISTING_SETTINGS,
  EXISTING_USER_ID,
} from '../support/existing-household';

/**
 * ALPHA-004: een opgeslagen week blijft aanpasbaar.
 *
 * ALPHA-003 maakte terecht een regel van "een nieuwe week heeft een complete
 * boodschappenlijst". Die regel werd ook toegepast op weken die de gebruiker al
 * gekozen had. Vervangen, alternatieven en "bereken opnieuw" zetten de zeven
 * dagen vast en prijzen ze opnieuw — en zodra één van die gerechten niet
 * volledig te koop was bij de huidige winkels, weigerde de app de hele week.
 * Dat gebeurt al als je een supermarkt uitzet, of als een verversing van de
 * prijsdata een product laat verdwijnen.
 *
 * De regel is nu: volledig voor wat de app kiest, niet voor wat de gebruiker al
 * koos. Een ontbrekend product van een eigen gerecht staat als niet leverbaar
 * op de lijst, zoals vóór ALPHA-003.
 */

const NOW = new Date('2026-09-17T10:00:00Z');
const LIDL_ONLY = { ...EXISTING_SETTINGS, selectedLocationIds: ['lidl-beijum'], maxStores: 1 };

let directory: string;
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'weekmenu-alpha-004-'));
  const prices = join(directory, 'prices.json');
  await copyFile('data/external/checkjebon-snapshot.json', prices);
  const captured = new Date('2026-09-17T09:00:00Z');
  await utimes(prices, captured, captured);
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

/**
 * A saved week of seven real dishes, the last of which Lidl cannot fully
 * supply. Built from a week the app itself generated with all three chains, so
 * the other six are ordinary, eligible, purchasable dishes.
 */
async function weekWithOneDishLidlCannotSupply() {
  const { loadContext, generatePlan } = await import('@/services/plan-service');
  const { buildStoreCandidates } = await import('@/services/store-service');
  const { filterCandidateRecipes } = await import('@/domain/optimization/filter');
  const { selectableRecipes } = await import('@/services/plan-service');

  const context = (await loadContext(EXISTING_USER_ID, NOW))!;
  const generated = await generatePlan(context);
  if (generated.status !== 'OK') throw new Error(`${generated.reason}: ${generated.message}`);
  const six = generated.plan.days.slice(0, 6).map((day) => day.recipe.id);

  const { candidates } = await buildStoreCandidates({
    locationIds: LIDL_ONLY.selectedLocationIds,
    onDate: NOW.toISOString().slice(0, 10),
  });
  const atLidl = new Set(candidates.flatMap((c) => c.offers.map((o) => o.ingredientId)));
  const { recipes } = await selectableRecipes(context);
  const eligible = filterCandidateRecipes({ household: context.household, recipes }).candidates;
  const incomplete = eligible.find(
    (recipe) =>
      !six.includes(recipe.id) &&
      recipe.ingredients.some((line) => !line.optional && !atLidl.has(line.ingredientId)),
  );
  if (!incomplete) throw new Error('geen gerecht gevonden dat Lidl niet compleet heeft');

  return {
    context: { ...context, settings: LIDL_ONLY },
    recipeIds: [...six, incomplete.id],
    incompleteDay: 6,
  };
}

it('herprijst een opgeslagen week met een gerecht dat de winkel niet compleet heeft', async () => {
  const { repriceStoredPlan } = await import('@/services/plan-service');
  const { context, recipeIds } = await weekWithOneDishLidlCannotSupply();

  const result = await repriceStoredPlan(context, recipeIds);

  expect(
    result.status,
    result.status === 'FAILED' ? `${result.reason}: ${result.message}` : '',
  ).toBe('OK');
  if (result.status !== 'OK') return;
  // Exact dezelfde zeven gerechten op exact dezelfde dagen: herprijzen kiest niets.
  expect(result.plan.days.map((day) => day.recipe.id)).toEqual(recipeIds);
  // En wat ontbreekt wordt gemeld in plaats van verzwegen of geweigerd.
  expect(result.plan.recommendedOption.unavailable.length).toBeGreaterThan(0);
}, 60_000);

it('biedt alternatieven voor een andere dag, zonder er zelf iets onvolledigs bij te zetten', async () => {
  const { repriceStoredPlan, findAlternatives } = await import('@/services/plan-service');
  const { context, recipeIds, incompleteDay } = await weekWithOneDishLidlCannotSupply();

  const current = await repriceStoredPlan(context, recipeIds);
  if (current.status !== 'OK') throw new Error(`${current.reason}: ${current.message}`);
  const alreadyMissing = new Set(
    current.plan.recommendedOption.unavailable.map((item) => item.ingredientId),
  );

  const otherDay = incompleteDay === 0 ? 1 : 0;
  const alternatives = await findAlternatives(context, current.plan, otherDay);

  expect(alternatives.length).toBeGreaterThan(0);
  for (const alternative of alternatives) {
    // Het voorgestelde gerecht is een keuze van de app, dus dat moet de winkel
    // compleet hebben: alles wat ontbreekt, ontbrak al door de eigen gerechten.
    const missing = alternative.plan.recommendedOption.unavailable.map((i) => i.ingredientId);
    expect(
      missing.filter((id) => !alreadyMissing.has(id)),
      alternative.recipe.id,
    ).toEqual([]);
    // De andere zes dagen blijven staan.
    expect(alternative.plan.days[incompleteDay]?.recipe.id).toBe(recipeIds[incompleteDay]);
  }
}, 120_000);

it('een nieuwe week blijft wél volledig koopbaar', async () => {
  // De ALPHA-003-garantie mag niet meeverdwijnen: wat de app zelf kiest, heeft
  // een complete boodschappenlijst bij de gekozen winkel.
  const { loadContext, generatePlan } = await import('@/services/plan-service');
  const context = (await loadContext(EXISTING_USER_ID, NOW))!;

  const result = await generatePlan({ ...context, settings: LIDL_ONLY });

  expect(
    result.status,
    result.status === 'FAILED' ? `${result.reason}: ${result.message}` : '',
  ).toBe('OK');
  if (result.status !== 'OK') return;
  expect(result.plan.recommendedOption.unavailable).toHaveLength(0);
}, 60_000);
