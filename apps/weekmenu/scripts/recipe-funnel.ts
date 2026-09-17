/**
 * Waarom past er geen enkel recept?
 *
 *   pnpm recipes:funnel [pad-naar-demo.json]
 *
 * Runs the app's household loader, availability gate, rules, retail package
 * evaluation and week optimizer. It reports the exact domain result without
 * saving a week. The benchmark catalogue is intentionally not used here.
 *
 * It prints counts and rules — no names, no ages, no weights, no due dates.
 * A pregnancy filter shows up as "aan", not as whose.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { filterCandidateRecipes } from '@/domain/optimization/filter';
import {
  hardExcludedIngredientIds,
  householdAllergens,
  householdHasPregnancy,
  householdRequiresPescetarianSafe,
  householdRequiresVegan,
  householdRequiresVegetarian,
  type Household,
} from '@/domain/household/types';
import { DEFAULT_WEEK_SETTINGS, type WeekSettings } from '@/data/repositories/types';

const path = process.argv[2] ?? '.data/demo.json';
const db = JSON.parse(readFileSync(path, 'utf8')) as {
  households: Record<string, Household>;
  settings: Record<string, WeekSettings>;
};

// Import after selecting the database. These are the app's services/providers,
// not the benchmark loader. No writes or persistence are performed by this CLI.
process.env.DATA_ADAPTER = 'demo';
process.env.WEEKMENU_DATA_DIR = dirname(resolve(path));
const { generatePlan, loadContext, mondayOf, selectableRecipes } =
  await import('@/services/plan-service');
const { dataModeView } = await import('@/services/store-service');
console.log('Productieflow:', dataModeView().mode);

const households = Object.entries(db.households);
if (households.length === 0) {
  console.error(`Geen huishouden in ${path}.`);
  process.exit(1);
}

let scenario = 0;
for (const [ownerId, household] of households) {
  const settings = db.settings[household.id] ?? DEFAULT_WEEK_SETTINGS;
  const now = new Date();
  const context = path.endsWith('demo.json')
    ? (await loadContext(ownerId, now))!
    : { household, settings, today: now, startDate: mondayOf(now) };
  const { recipes: available } = await selectableRecipes(context);
  const rules = {
    vegetarisch: householdRequiresVegetarian(household),
    veganistisch: householdRequiresVegan(household),
    pescotarisch: householdRequiresPescetarianSafe(household),
    zwangerschap: householdHasPregnancy(household),
    allergenen: [...householdAllergens(household)],
    hardeIngredienten: [...hardExcludedIngredientIds(household)],
    uitgeslotenKeukens: household.preferences.cuisines
      .filter((c) => c.level === 'EXCLUDE')
      .map((c) => c.value),
    uitgeslotenSoorten: household.preferences.tags
      .filter((t) => t.level === 'EXCLUDE')
      .map((t) => t.value),
    nietLekker: [
      ...household.preferences.cuisines.filter((c) => c.level === 'DISLIKE').map((c) => c.value),
      ...household.preferences.tags.filter((t) => t.level === 'DISLIKE').map((t) => t.value),
    ],
    maxMinuten: settings?.maxMinutes,
    winkels: settings?.selectedLocationIds ?? [],
  };

  console.log(`\nSCENARIO ${++scenario}`);
  console.log(`  leden                    ${household.members.length}`);
  console.log(`  vegetarisch vereist      ${rules.vegetarisch}`);
  console.log(`  veganistisch vereist     ${rules.veganistisch}`);
  console.log(`  pescotarisch vereist     ${rules.pescotarisch}`);
  console.log(`  zwangerschapsfilter      ${rules.zwangerschap ? 'aan' : 'uit'}`);
  console.log(`  allergenen               ${rules.allergenen.join(', ') || '—'}`);
  console.log(`  ingrediënten op ⛔        ${rules.hardeIngredienten.join(', ') || '—'}`);
  console.log(`  keukens op ⛔             ${rules.uitgeslotenKeukens.join(', ') || '—'}`);
  console.log(`  soorten gerecht op ⛔     ${rules.uitgeslotenSoorten.join(', ') || '—'}`);
  console.log(`  op 👎 (zacht)            ${rules.nietLekker.join(', ') || '—'}`);
  console.log(`  maximale kooktijd        ${rules.maxMinuten ?? '—'}`);
  console.log(`  winkels geselecteerd     ${rules.winkels.join(', ') || '— (geen!)'}`);

  const maxMinutes = settings?.maxMinutes;
  const step = (label: string, keep: (r: (typeof available)[number]) => boolean): number => {
    const left = available.filter(keep).length;
    console.log(`    ${label.padEnd(30)} ${String(left).padStart(4)} van ${available.length}`);
    return left;
  };

  console.log('\n  elke regel op zichzelf, over de koopbare recepten');
  step('allergenen', (r) => !r.allergens.some((a) => rules.allergenen.includes(a)));
  step('zwangerschap', (r) => !rules.zwangerschap || r.pregnancySuitable);
  step('vegetarisch/veganistisch', (r) =>
    rules.veganistisch ? r.vegan : rules.vegetarisch ? r.vegetarian : true,
  );
  step('pescotarisch', (r) => !rules.pescotarisch || r.vegetarian || r.primaryProtein === 'vis');
  step('ingrediënten op ⛔', (r) =>
    r.ingredients.every((l) => l.optional || !rules.hardeIngredienten.includes(l.ingredientId)),
  );
  step('soorten gerecht op ⛔', (r) => !r.tags.some((t) => rules.uitgeslotenSoorten.includes(t)));
  step('keukens op ⛔', (r) => !rules.uitgeslotenKeukens.includes(r.cuisine));
  step('maximale kooktijd', (r) => maxMinutes === undefined || r.totalMinutes <= maxMinutes);

  const result = filterCandidateRecipes({
    household,
    recipes: available,
    ...(maxMinutes !== undefined ? { maxMinutes } : {}),
  });
  console.log(
    `\n  alles samen                      ${result.candidates.length} van ${available.length}`,
  );

  const byReason = new Map<string, number>();
  for (const excluded of result.excluded) {
    byReason.set(excluded.reason, (byReason.get(excluded.reason) ?? 0) + 1);
  }
  if (byReason.size > 0) {
    console.log('  eerste reden per afgevallen recept');
    for (const [reason, count] of [...byReason].sort((a, b) => b[1] - a[1])) {
      console.log(`    ${reason.padEnd(30)} ${String(count).padStart(4)}`);
    }
  }
  console.log(
    `\n  ${result.candidates.length === 0 ? 'GEEN ENKEL RECEPT OVER' : `${result.candidates.length} recepten bruikbaar`}`,
  );
  console.log('\n  RECIPE ELIGIBILITY → RETAIL → GENERATION (productiecode)');
  const counters = new Map<string, Readonly<Record<string, number | string>>>();
  const generated = await generatePlan(context, {
    logger: (stage, counts) => {
      counters.set(stage, counts);
      console.log(`    ${stage.padEnd(18)} ${JSON.stringify(counts)}`);
    },
  });
  console.log(`  candidate week count     ${counters.get('search')?.weeksGenerated ?? 0}`);
  console.log(`  optimizer result         ${generated.status}`);
  console.log(
    `  domain failure reason    ${generated.status === 'FAILED' ? generated.reason : '—'}`,
  );
  if (generated.status === 'FAILED') console.log(`  gebruikersmelding        ${generated.message}`);
}
console.log('');
