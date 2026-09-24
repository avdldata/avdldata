/**
 * Opgehaalde Allerhande-recepten omzetten naar recepten voor de planner.
 *
 *   pnpm allerhande:convert
 *
 * Leest data/private/allerhande/raw, schrijft data/private/allerhande/recipes.json
 * (wat de app laadt) en report.json (waarom de rest niet mee kon). Alleen
 * aantallen, ingrediëntnamen en redenen op het scherm — geen receptteksten.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { buildIngredientIndex } from '@/domain/ingredients/types';
import { SEED_INGREDIENTS } from '@/data/seed/ingredients';
import { convertAllerhandeRecipe, type RejectionCode } from '@/services/recipes/allerhande/convert';
import { fileStore } from '@/services/recipes/allerhande/file-store';

const rawDirectory = 'data/private/allerhande/raw';
const outDirectory = 'data/private/allerhande';
const ingredients = buildIngredientIndex(SEED_INGREDIENTS);
const records = fileStore(rawDirectory).all();
if (records.length === 0) {
  console.error(`Niets gevonden in ${rawDirectory}. Draai eerst pnpm allerhande:fetch.`);
  process.exit(1);
}

const accepted = [];
const byCode = new Map<RejectionCode, number>();
const missing = new Map<string, number>();
const unknownAmounts = new Map<string, number>();
let dinners = 0;
const rejected: { recipeId: string; codes: string[]; details: string[] }[] = [];

for (const record of records) {
  const result = convertAllerhandeRecipe(record, ingredients);
  if (result.ok) {
    dinners += 1;
    accepted.push(result.authored);
    continue;
  }
  const codes = [...new Set(result.rejections.map((r) => r.code))];
  if (!codes.includes('NOT_A_DINNER')) dinners += 1;
  for (const code of codes) byCode.set(code, (byCode.get(code) ?? 0) + 1);
  for (const rejection of result.rejections) {
    if (rejection.concept)
      missing.set(rejection.concept, (missing.get(rejection.concept) ?? 0) + 1);
    if (rejection.code === 'AMOUNT_UNKNOWN') {
      const unit = /\((\w+)\)$/.exec(rejection.detail)?.[1] ?? '?';
      unknownAmounts.set(unit, (unknownAmounts.get(unit) ?? 0) + 1);
    }
  }
  rejected.push({
    recipeId: result.recipeId,
    codes,
    details: result.rejections.map((r) => `${r.code}: ${r.detail}`),
  });
}

mkdirSync(outDirectory, { recursive: true });
writeFileSync(`${outDirectory}/recipes.json`, JSON.stringify(accepted, null, 2), 'utf8');
const topMissing = [...missing].sort((a, b) => b[1] - a[1]);
writeFileSync(
  `${outDirectory}/report.json`,
  JSON.stringify(
    {
      convertedAt: new Date().toISOString(),
      fetched: records.length,
      dinners,
      accepted: accepted.length,
      rejectedByCode: Object.fromEntries(byCode),
      missingIngredients: Object.fromEntries(topMissing),
      rejected,
    },
    null,
    2,
  ),
  'utf8',
);

const pct = (n: number, of: number) => (of === 0 ? '—' : `${Math.round((n / of) * 100)}%`);
console.log(`opgehaald            ${records.length}`);
console.log(`hoofdgerechten       ${dinners}`);
console.log(
  `bruikbaar            ${accepted.length} (${pct(accepted.length, dinners)} van de hoofdgerechten)`,
);
console.log('\nwaarom de rest niet (een recept kan meerdere redenen hebben)');
for (const [code, count] of [...byCode].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${code.padEnd(22)} ${count}`);
}
console.log('\nontbrekende ingrediënten die de meeste recepten tegenhouden');
for (const [concept, count] of topMissing.slice(0, 25)) {
  console.log(`  ${String(count).padStart(5)}  ${concept}`);
}
if (unknownAmounts.size > 0) {
  console.log('\nhoeveelheden zonder vaste maat');
  for (const [unit, count] of [...unknownAmounts].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
    console.log(`  ${String(count).padStart(5)}  ${unit}`);
  }
}
console.log(`\nGeschreven: ${outDirectory}/recipes.json en report.json`);
console.log('Om ze in de app te gebruiken, zet in .env.local:');
console.log(`  WEEKMENU_PRIVATE_RECIPES=${outDirectory}/recipes.json`);
