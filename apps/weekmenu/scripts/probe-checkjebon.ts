/**
 * What is actually in the Checkjebon dataset, and how much of it can we use?
 *
 * Reads a local snapshot rather than the live feed, so the numbers are
 * reproducible and the network is not a dependency of the measurement. Point it
 * at a fresh download to re-measure:
 *
 *   pnpm data:probe -- --file /path/to/supermarkets.json
 */
import { readFileSync } from 'node:fs';
import { parsePackage, type PackageParseFailure } from '../src/domain/ingestion/package-parser';

const fileArg = process.argv.indexOf('--file');
const path = fileArg !== -1 ? process.argv[fileArg + 1]! : 'data/external/checkjebon-snapshot.json';

interface RawProduct {
  n?: string;
  l?: string;
  p?: number;
  s?: string;
}
interface RawChain {
  n?: string;
  c?: string;
  u?: string;
  d?: RawProduct[];
}

const chains = JSON.parse(readFileSync(path, 'utf8')) as RawChain[];

console.log(`\nCheckjebon-snapshot — ${path}\n`);
const head =
  '  ' +
  'keten'.padEnd(12) +
  'producten'.padStart(11) +
  'prijs ok'.padStart(10) +
  'pakket ok'.padStart(11) +
  'leeg'.padStart(8) +
  'per-maat'.padStart(10) +
  'niet-food'.padStart(11) +
  'onbekend'.padStart(10) +
  'dubbel'.padStart(8);
console.log(head);
console.log('  ' + '-'.repeat(head.length - 2));

let grandTotal = 0;
let grandUsable = 0;

for (const chain of chains) {
  const products = chain.d ?? [];
  if (products.length === 0) {
    console.log('  ' + (chain.n ?? '?').padEnd(12) + '0'.padStart(11) + '   (leeg in de dataset)');
    continue;
  }

  const reasons = new Map<PackageParseFailure, number>();
  let packageOk = 0;
  let priceOk = 0;
  const seen = new Set<string>();
  let duplicates = 0;

  for (const product of products) {
    const price = product.p;
    if (typeof price === 'number' && Number.isFinite(price) && price > 0) priceOk += 1;

    const parsed = parsePackage(product.s);
    if (parsed.status === 'OK') packageOk += 1;
    else reasons.set(parsed.reason, (reasons.get(parsed.reason) ?? 0) + 1);

    const key = `${product.l ?? ''}|${product.n ?? ''}`;
    if (seen.has(key)) duplicates += 1;
    seen.add(key);
  }

  const pct = (value: number): string => `${((value / products.length) * 100).toFixed(1)}%`;
  console.log(
    '  ' +
      (chain.n ?? '?').padEnd(12) +
      String(products.length).padStart(11) +
      pct(priceOk).padStart(10) +
      pct(packageOk).padStart(11) +
      pct(reasons.get('EMPTY') ?? 0).padStart(8) +
      pct(reasons.get('PRICE_PER_MEASURE') ?? 0).padStart(10) +
      pct(reasons.get('NON_FOOD_UNIT') ?? 0).padStart(11) +
      pct(reasons.get('UNRECOGNISED') ?? 0).padStart(10) +
      String(duplicates).padStart(8),
  );

  grandTotal += products.length;
  grandUsable += Math.min(priceOk, packageOk);
}

console.log(
  `\n  Totaal ${grandTotal} producten, waarvan ruwweg ${grandUsable} ` +
    `(${((grandUsable / grandTotal) * 100).toFixed(1)}%) zowel een prijs als een bruikbaar pakket hebben.\n`,
);

// The labels the parser could not read, so the next improvement is chosen from
// evidence rather than from imagination.
const unreadable = new Map<string, number>();
for (const chain of chains) {
  for (const product of chain.d ?? []) {
    const parsed = parsePackage(product.s);
    if (parsed.status === 'FAILED' && parsed.reason === 'UNRECOGNISED') {
      unreadable.set(parsed.raw, (unreadable.get(parsed.raw) ?? 0) + 1);
    }
  }
}
const worst = [...unreadable.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
if (worst.length > 0) {
  console.log('  Meest voorkomende onleesbare labels\n');
  for (const [label, count] of worst) console.log(`    ${String(count).padStart(5)}  ${label}`);
  console.log('');
}
