/**
 * Do our two sources agree about what a product normally costs?
 *
 * A promotion feed states a "normal" price alongside its offer price. That is a
 * second opinion about the same shelf, and where it disagrees with Checkjebon
 * one of the two is out of date. Which one is not decidable from here — but the
 * size and shape of the disagreement is a freshness signal about both, and it
 * is the cheapest such signal available.
 *
 * The promotion feed's price is never used to overwrite ours. It is compared
 * and reported, and that is all.
 *
 *   pnpm promo:prices
 */
import { existsSync, readFileSync } from 'node:fs';
import { linkPromotions, toCandidate } from '../src/services/promotions/link-promotions';
import { extractRetailerProductId } from '../src/services/promotions/retailer-id';
import type { ExternalPromotion } from '../src/services/promotions/types';
import { loadRealChains } from '../tests/support/real-data-store';

const SNAPSHOT = 'data/external/promotions-snapshot.json';
if (!existsSync(SNAPSHOT)) {
  console.log(`
  Geen promotiemomentopname op ${SNAPSHOT}, dus niets te vergelijken.

  Er is in deze omgeving nooit een respons opgehaald: de egress-proxy weigert
  PrijsProfeet met 403 op CONNECT. Zie PRIJSPROFEET_INTEGRATION.md voor het
  bewijs en voor wat er nodig is om dit script wél te kunnen draaien.
`);
  process.exit(1);
}

const promotions = JSON.parse(readFileSync(SNAPSHOT, 'utf8')) as ExternalPromotion[];
const fixture = loadRealChains(['ah', 'jumbo']);

const retailerIdByProduct = new Map<string, string>();
for (const chain of fixture.chains) {
  for (const offer of chain.reducedOffers) {
    const id = extractRetailerProductId(
      chain.chainId,
      offer.productId.slice(chain.chainId.length + 1),
    );
    if (id) retailerIdByProduct.set(offer.productId, id.id);
  }
}

/**
 * Only exactly-linked products.
 *
 * A name-and-package link is good enough to apply a promotion to, but not good
 * enough to draw a conclusion about price freshness from: a disagreement might
 * simply mean the link was to a near neighbour.
 */
const BUCKETS: readonly [string, (difference: number, ours: number) => boolean][] = [
  ['identiek', (d) => d === 0],
  ['≤ € 0,05', (d) => Math.abs(d) <= 5],
  ['≤ 5%', (d, ours) => Math.abs(d) <= ours * 0.05],
  ['> 5%', (d, ours) => Math.abs(d) > ours * 0.05 && Math.abs(d) <= ours * 0.25],
  ['> 25% (uitschieter)', (d, ours) => Math.abs(d) > ours * 0.25],
];

console.log(`\nNormale prijs: Checkjebon tegenover de promotiebron\n`);

for (const chain of fixture.chains) {
  const result = linkPromotions({
    chainId: chain.chainId,
    candidates: promotions.map(toCandidate),
    offers: chain.reducedOffers,
    retailerIdByProduct,
  });

  const comparable = result.linked.filter(
    (entry) =>
      (entry.matchedBy === 'EXACT_RETAILER_ID' || entry.matchedBy === 'EXACT_GTIN') &&
      entry.candidate.regularPriceCents !== undefined,
  );

  console.log(
    `  ${chain.chainId.toUpperCase()} — ${result.linked.length} gekoppeld, ` +
      `${comparable.length} exact gekoppeld mét een normale prijs\n`,
  );
  if (comparable.length === 0) {
    console.log('    Niets te vergelijken.\n');
    continue;
  }

  const counts = new Map<string, number>();
  const differences: number[] = [];
  const outliers: string[] = [];
  for (const entry of comparable) {
    const ours = entry.offer.unitPriceCents;
    const theirs = entry.candidate.regularPriceCents!;
    const difference = theirs - ours;
    differences.push(difference);
    for (const [label, test] of BUCKETS) {
      if (test(difference, ours)) {
        counts.set(label, (counts.get(label) ?? 0) + 1);
        break;
      }
    }
    if (Math.abs(difference) > ours * 0.25) {
      outliers.push(
        `${entry.offer.name.slice(0, 44)}: wij € ${(ours / 100).toFixed(2)}, ` +
          `bron € ${(theirs / 100).toFixed(2)}`,
      );
    }
  }

  for (const [label] of BUCKETS) {
    const count = counts.get(label) ?? 0;
    console.log(
      `    ${label.padEnd(22)} ${String(count).padStart(5)}  ` +
        `${((count / comparable.length) * 100).toFixed(1).padStart(5)}%`,
    );
  }

  const sorted = [...differences].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)]!;
  const mean = differences.reduce((sum, d) => sum + d, 0) / differences.length;
  console.log(
    `\n    mediaan verschil ${(median / 100).toFixed(2)}, ` +
      `gemiddeld ${(mean / 100).toFixed(2)} (bron min Checkjebon)`,
  );
  // A consistent sign is the interesting part: it means one source lags the
  // other systematically rather than both being noisy.
  const higher = differences.filter((d) => d > 0).length;
  console.log(
    `    bron hoger in ${higher}, lager in ${differences.length - higher} van ${differences.length}`,
  );

  if (outliers.length > 0) {
    console.log(`\n    Uitschieters (${outliers.length})\n`);
    for (const line of outliers.slice(0, 12)) console.log(`      ${line}`);
  }
  console.log('');
}
