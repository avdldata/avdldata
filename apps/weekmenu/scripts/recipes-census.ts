/**
 * What is actually in each recipe corpus?
 *
 *   pnpm recipes:census
 *
 * Counting before importing, because the interesting differences between these
 * corpora are not in their READMEs. One has 54.843 recipes and almost no
 * quantities; another has 597 and a gram figure on every line. That gap decides
 * the whole phase, and it is only visible by counting.
 *
 * Nothing here writes to the seed, and nothing here is a decision.
 */
import { Epicurious13kProvider } from '../src/services/recipes/providers/epicurious-13k';
import { ForkRecipeProvider } from '../src/services/recipes/providers/forkrecipe';
import { OpenRecipeArchiveProvider } from '../src/services/recipes/providers/open-recipe-archive';
import { classifyDinner } from '../src/services/recipes/dinner-classifier';
import { normaliseAmount } from '../src/services/recipes/units';
import {
  mayBePublishedCommercially,
  mayBecomeProduction,
  type RecipeCandidateProvider,
} from '../src/services/recipes/candidate-types';

const providers: RecipeCandidateProvider[] = [
  new ForkRecipeProvider(),
  new OpenRecipeArchiveProvider(),
  new Epicurious13kProvider(),
];

interface Census {
  readonly source: string;
  readonly rights: string;
  readonly total: number;
  readonly withIngredients: number;
  readonly withQuantities: number;
  readonly withUnits: number;
  readonly withServings: number;
  readonly withPrepTime: number;
  readonly withInstructions: number;
  readonly withCuisine: number;
  readonly withDietary: number;
  readonly duplicateTitles: number;
  readonly malformed: number;
  readonly dinner: number;
  readonly possibleDinner: number;
  readonly notDinner: number;
  readonly ambiguous: number;
  readonly usableLines: number;
  readonly totalLines: number;
  readonly refusals: Readonly<Record<string, number>>;
}

const rows: Census[] = [];

for (const provider of providers) {
  const started = Date.now();
  const candidates = provider.loadCandidates();
  const titles = new Set<string>();
  let duplicateTitles = 0;
  let withIngredients = 0;
  let withQuantities = 0;
  let withUnits = 0;
  let withServings = 0;
  let withPrepTime = 0;
  let withInstructions = 0;
  let withCuisine = 0;
  let withDietary = 0;
  let malformed = 0;
  const verdicts = { DINNER: 0, POSSIBLE_DINNER: 0, NOT_DINNER: 0, AMBIGUOUS: 0 };
  let usableLines = 0;
  let totalLines = 0;
  const refusals: Record<string, number> = {};

  for (const candidate of candidates) {
    const key = candidate.title.toLowerCase().trim();
    if (titles.has(key)) duplicateTitles += 1;
    titles.add(key);

    if (candidate.ingredients.length === 0) {
      malformed += 1;
      continue;
    }
    withIngredients += 1;
    if (candidate.ingredients.some((i) => i.quantity !== undefined)) withQuantities += 1;
    if (candidate.ingredients.some((i) => i.unit !== undefined)) withUnits += 1;
    if (candidate.servings !== undefined) withServings += 1;
    if (candidate.prepMinutes !== undefined) withPrepTime += 1;
    if (candidate.directions && candidate.directions.length > 0) withInstructions += 1;
    if (candidate.cuisine) withCuisine += 1;
    if (candidate.dietaryTags.length > 0) withDietary += 1;

    verdicts[classifyDinner(candidate).verdict] += 1;

    for (const line of candidate.ingredients) {
      totalLines += 1;
      const amount = normaliseAmount(line.quantity, line.unit);
      if (amount.value !== undefined) usableLines += 1;
      else refusals[amount.refusal ?? 'UNKNOWN'] = (refusals[amount.refusal ?? 'UNKNOWN'] ?? 0) + 1;
    }
  }

  rows.push({
    source: provider.source.name,
    rights: provider.source.rights,
    total: candidates.length,
    withIngredients,
    withQuantities,
    withUnits,
    withServings,
    withPrepTime,
    withInstructions,
    withCuisine,
    withDietary,
    duplicateTitles,
    malformed,
    dinner: verdicts.DINNER,
    possibleDinner: verdicts.POSSIBLE_DINNER,
    notDinner: verdicts.NOT_DINNER,
    ambiguous: verdicts.AMBIGUOUS,
    usableLines,
    totalLines,
    refusals,
  });
  console.error(`  ${provider.source.id}: ${candidates.length} in ${Date.now() - started} ms`);
}

const pct = (part: number, whole: number) =>
  whole === 0 ? '—' : `${((part / whole) * 100).toFixed(1)}%`;
const fmt = (n: number) => n.toLocaleString('nl-NL');

console.log(`\nRECIPE SOURCE CENSUS\n`);
for (const row of rows) {
  console.log(`## ${row.source}  [${row.rights}]`);
  console.log(`   recepten                 ${fmt(row.total).padStart(8)}`);
  console.log(
    `   met ingrediënten         ${fmt(row.withIngredients).padStart(8)}  ${pct(row.withIngredients, row.total)}`,
  );
  console.log(
    `   met hoeveelheden         ${fmt(row.withQuantities).padStart(8)}  ${pct(row.withQuantities, row.total)}`,
  );
  console.log(
    `   met eenheden             ${fmt(row.withUnits).padStart(8)}  ${pct(row.withUnits, row.total)}`,
  );
  console.log(
    `   met porties              ${fmt(row.withServings).padStart(8)}  ${pct(row.withServings, row.total)}`,
  );
  console.log(
    `   met bereidingstijd       ${fmt(row.withPrepTime).padStart(8)}  ${pct(row.withPrepTime, row.total)}`,
  );
  console.log(
    `   met instructies          ${fmt(row.withInstructions).padStart(8)}  ${pct(row.withInstructions, row.total)}`,
  );
  console.log(
    `   met keuken               ${fmt(row.withCuisine).padStart(8)}  ${pct(row.withCuisine, row.total)}`,
  );
  console.log(
    `   met dieetclassificatie   ${fmt(row.withDietary).padStart(8)}  ${pct(row.withDietary, row.total)}`,
  );
  console.log(`   dubbele titels           ${fmt(row.duplicateTitles).padStart(8)}`);
  console.log(`   onbruikbaar/malformed    ${fmt(row.malformed).padStart(8)}`);
  console.log(
    `   DINNER                   ${fmt(row.dinner).padStart(8)}  ${pct(row.dinner, row.total)}`,
  );
  console.log(
    `   POSSIBLE_DINNER          ${fmt(row.possibleDinner).padStart(8)}  ${pct(row.possibleDinner, row.total)}`,
  );
  console.log(
    `   NOT_DINNER               ${fmt(row.notDinner).padStart(8)}  ${pct(row.notDinner, row.total)}`,
  );
  console.log(
    `   AMBIGUOUS                ${fmt(row.ambiguous).padStart(8)}  ${pct(row.ambiguous, row.total)}`,
  );
  console.log(`   ingrediëntregels         ${fmt(row.totalLines).padStart(8)}`);
  console.log(
    `   omrekenbaar naar g/ml/st ${fmt(row.usableLines).padStart(8)}  ${pct(row.usableLines, row.totalLines)}`,
  );
  for (const [reason, count] of Object.entries(row.refusals).sort((a, b) => b[1] - a[1])) {
    console.log(
      `     ${reason.padEnd(22)} ${fmt(count).padStart(8)}  ${pct(count, row.totalLines)}`,
    );
  }
  console.log('');
}

console.log('## Licentie\n');
for (const provider of providers) {
  const r = provider.source.rights;
  console.log(
    `   ${provider.source.id.padEnd(22)} ${r.padEnd(24)} ` +
      `productie: ${mayBecomeProduction(r) ? 'ja ' : 'NEE'}   ` +
      `commercieel publiceren: ${mayBePublishedCommercially(r) ? 'ja' : 'NEE'}`,
  );
}
console.log('');
