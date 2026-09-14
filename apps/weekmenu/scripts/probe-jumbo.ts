/**
 * Why does Jumbo lag behind Albert Heijn?
 *
 * Both chains go through exactly the same matcher and the same package parser,
 * so any difference is in the data. This says precisely where.
 *
 *   pnpm data:jumbo
 */
import { readFileSync } from 'node:fs';
import { resolvePackage, type PackageParseFailure } from '../src/domain/ingestion/package-parser';
import { buildIngredientPhrases, matchProduct } from '../src/domain/ingestion/match-ingredient';
import { PRODUCT_MATCH_OVERRIDES } from '../src/data/matching/overrides';
import { SEED_INGREDIENTS, SEED_INGREDIENT_ALIASES } from '../src/data/seed/ingredients';
import { SEED_RECIPES } from '../src/data/seed/recipes';

interface RawProduct {
  n?: string;
  l?: string;
  p?: number;
  s?: string;
}
const chains = JSON.parse(readFileSync('data/external/checkjebon-snapshot.json', 'utf8')) as {
  n?: string;
  d?: RawProduct[];
}[];

const phrases = buildIngredientPhrases(SEED_INGREDIENTS, SEED_INGREDIENT_ALIASES);
const names = new Map(SEED_INGREDIENTS.map((i) => [i.id, i.canonicalName]));

const pantry = new Set(SEED_INGREDIENTS.filter((i) => i.pantryStaple).map((i) => i.id));
const usage = new Map<string, number>();
for (const recipe of SEED_RECIPES) {
  for (const line of recipe.ingredients) {
    if (line.optional || pantry.has(line.ingredientId)) continue;
    usage.set(line.ingredientId, (usage.get(line.ingredientId) ?? 0) + 1);
  }
}
const mustBuy = [...usage.keys()];
const totalUses = [...usage.values()].reduce((sum, n) => sum + n, 0);

/** Package classification, in the four buckets the analysis asked for. */
type PackageClass =
  'VALID_PACKAGE' | 'MISSING_PACKAGE' | 'UNPARSEABLE_PACKAGE' | 'AMBIGUOUS_PACKAGE';
function classify(size: string | undefined, name: string | undefined): PackageClass {
  const parsed = resolvePackage(size, name);
  if (parsed.status === 'OK')
    return parsed.info.approximate ? 'AMBIGUOUS_PACKAGE' : 'VALID_PACKAGE';
  const reason: PackageParseFailure = parsed.reason;
  if (reason === 'EMPTY') return 'MISSING_PACKAGE';
  if (reason === 'PRICE_PER_MEASURE' || reason === 'NO_AMOUNT') return 'AMBIGUOUS_PACKAGE';
  return 'UNPARSEABLE_PACKAGE';
}

interface ChainReport {
  chain: string;
  total: number;
  validPrice: number;
  packageClasses: Map<PackageClass, number>;
  matched: number;
  auto: number;
  review: number;
  rejected: number;
  eligible: number;
  /** Ingredients with a match but no usable product *because of* the package. */
  lostToPackage: Set<string>;
  covered: Set<string>;
}

function analyse(chainName: string): ChainReport {
  const chain = chains.find((c) => c.n === chainName)!;
  const report: ChainReport = {
    chain: chainName,
    total: 0,
    validPrice: 0,
    packageClasses: new Map(),
    matched: 0,
    auto: 0,
    review: 0,
    rejected: 0,
    eligible: 0,
    lostToPackage: new Set(),
    covered: new Set(),
  };
  const matchedIngredients = new Set<string>();

  for (const product of chain.d ?? []) {
    report.total += 1;
    const priced = typeof product.p === 'number' && Number.isFinite(product.p) && product.p > 0;
    if (priced) report.validPrice += 1;

    const cls = classify(product.s, product.n);
    report.packageClasses.set(cls, (report.packageClasses.get(cls) ?? 0) + 1);

    const match = matchProduct(
      { productId: `${chainName}:${product.l ?? ''}`, productName: product.n ?? '' },
      phrases,
      PRODUCT_MATCH_OVERRIDES,
    );
    if (!match) continue;
    report.matched += 1;
    if (match.status === 'REJECTED') {
      report.rejected += 1;
      continue;
    }
    if (match.status === 'NEEDS_REVIEW') {
      report.review += 1;
      continue;
    }
    report.auto += 1;
    matchedIngredients.add(match.canonicalIngredientId);

    if (priced && cls === 'VALID_PACKAGE') {
      report.eligible += 1;
      report.covered.add(match.canonicalIngredientId);
    }
  }

  for (const id of matchedIngredients) {
    if (!report.covered.has(id)) report.lostToPackage.add(id);
  }
  return report;
}

const reports = ['ah', 'jumbo'].map(analyse);

console.log('\nJumbo tegenover Albert Heijn, zelfde matcher en zelfde parser\n');
const pct = (part: number, whole: number) => `${((part / whole) * 100).toFixed(1)}%`;
const row = (label: string, pick: (r: ChainReport) => string) =>
  console.log('  ' + label.padEnd(34) + reports.map((r) => pick(r).padStart(14)).join(''));

console.log('  ' + ''.padEnd(34) + reports.map((r) => r.chain.padStart(14)).join(''));
console.log('  ' + '-'.repeat(34 + 14 * reports.length));
row('producten', (r) => String(r.total));
row('geldige prijs', (r) => pct(r.validPrice, r.total));
for (const cls of [
  'VALID_PACKAGE',
  'MISSING_PACKAGE',
  'UNPARSEABLE_PACKAGE',
  'AMBIGUOUS_PACKAGE',
] as const) {
  row(cls.toLowerCase().replace('_', ' '), (r) => pct(r.packageClasses.get(cls) ?? 0, r.total));
}
row('gematcht', (r) => String(r.matched));
row('auto-goedgekeurd', (r) => String(r.auto));
row('naar review', (r) => String(r.review));
row('afgewezen', (r) => String(r.rejected));
row('optimizer-eligible', (r) => String(r.eligible));

const weighted = (covered: Set<string>) =>
  [...usage.entries()].filter(([id]) => covered.has(id)).reduce((sum, [, n]) => sum + n, 0) /
  totalUses;

console.log('');
row('receptdekking', (r) => pct(mustBuy.filter((id) => r.covered.has(id)).length, mustBuy.length));
row('gewogen dekking', (r) => `${(weighted(r.covered) * 100).toFixed(1)}%`);

// The combined view: an ingredient one chain lacks is not a gap if the other has it.
const combined = new Set([...reports[0]!.covered, ...reports[1]!.covered]);
console.log('');
console.log(
  '  AH of Jumbo samen                 ' +
    `${pct(mustBuy.filter((id) => combined.has(id)).length, mustBuy.length).padStart(14)}` +
    `${((weighted(combined) * 100).toFixed(1) + '%').padStart(14)}`,
);
console.log('  ' + ' '.repeat(34) + 'receptdekking'.padStart(14) + 'gewogen'.padStart(14));

// What the package gap costs Jumbo specifically.
const jumbo = reports.find((r) => r.chain === 'jumbo')!;
const lost = [...jumbo.lostToPackage]
  .filter((id) => usage.has(id))
  .sort((a, b) => (usage.get(b) ?? 0) - (usage.get(a) ?? 0));
console.log(
  `\n  Ingrediënten waarvoor Jumbo wél een goedgekeurd product heeft maar geen bruikbare verpakking: ${lost.length}\n`,
);
for (const id of lost.slice(0, 12)) {
  console.log(
    `    ${String(usage.get(id) ?? 0).padStart(3)}x  ${id.padEnd(22)} ${names.get(id) ?? ''}`,
  );
}

const onlyAh = mustBuy.filter((id) => reports[0]!.covered.has(id) && !jumbo.covered.has(id));
const onlyJumbo = mustBuy.filter((id) => !reports[0]!.covered.has(id) && jumbo.covered.has(id));
console.log(`\n  Alleen bij AH te koop:    ${onlyAh.length}`);
console.log(`  Alleen bij Jumbo te koop: ${onlyJumbo.length}  ${onlyJumbo.slice(0, 8).join(', ')}`);
console.log('');
