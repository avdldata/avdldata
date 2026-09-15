/**
 * What does the promotion feed actually contain?
 *
 * Step 4 of the brief, in one command: take a sample, count which fields are
 * really present, and report it — because documentation and a live response
 * disagree often enough that assuming is how a pipeline ends up silently empty.
 *
 * It reads `data/external/promotions-snapshot.json`. Nothing here goes to the
 * network: a saved response is what makes this runnable at all in an
 * environment where the source is unreachable.
 *
 *   pnpm promo:probe
 *   pnpm promo:probe -- --sample 100
 */
import { existsSync, readFileSync } from 'node:fs';
import { toCandidate } from '../src/services/promotions/link-promotions';
import { linkPromotions } from '../src/services/promotions/link-promotions';
import { extractRetailerProductId } from '../src/services/promotions/retailer-id';
import { isConfigured } from '../src/services/promotions/prijsprofeet-adapter';
import type { ExternalPromotion } from '../src/services/promotions/types';
import { loadRealChains } from '../tests/support/real-data-store';

const args = process.argv.slice(2);
const sampleSize = Number(args[args.indexOf('--sample') + 1] ?? 100);
const SNAPSHOT = 'data/external/promotions-snapshot.json';

if (!existsSync(SNAPSHOT)) {
  console.log(`
  Geen promotiemomentopname gevonden op ${SNAPSHOT}.

  PrijsProfeet is vanuit deze omgeving niet te bereiken: de egress-proxy
  weigert de host met 403 op CONNECT. Het volledige bewijs en wat er nodig is
  om verder te komen staan in PRIJSPROFEET_INTEGRATION.md.

  Twee manieren om dit script wél te laten draaien:

    1. Zet één opgehaalde respons neer als ${SNAPSHOT}, als een array van
       ExternalPromotion (zie src/services/promotions/types.ts).
    2. Vul FIELD_MAPPING en mapResponse in
       src/services/promotions/prijsprofeet-adapter.ts, en haal op met een
       transport dat de bron wél kan bereiken.

  Veldmapping op dit moment: ${isConfigured() ? 'ingevuld' : 'NIET ingevuld'}.
`);
  process.exit(1);
}

const promotions = JSON.parse(readFileSync(SNAPSHOT, 'utf8')) as ExternalPromotion[];
const chainIds = [...new Set(promotions.map((p) => p.chainId))].sort();

console.log(
  `\nPromotiemomentopname — ${promotions.length} aanbiedingen, ketens ${chainIds.join(', ')}\n`,
);

/**
 * The ten fields the brief asks about, counted rather than assumed.
 *
 * Presence, not plausibility: a field that is there but always empty counts as
 * absent, because that is what it is worth downstream.
 */
const FIELDS: readonly [string, (p: ExternalPromotion) => boolean][] = [
  ['product id', (p) => Boolean(p.externalProductId)],
  ['EAN / GTIN', (p) => Boolean(p.gtin)],
  ['productnaam', (p) => Boolean(p.productName?.trim())],
  ['verpakking', (p) => Boolean(p.packageText?.trim())],
  ['normale prijs', (p) => typeof p.regularPriceCents === 'number'],
  ['actieprijs', (p) => typeof p.promotionalPriceCents === 'number'],
  ['promotietekst', (p) => Boolean(p.promotionText?.trim())],
  ['validFrom', (p) => Boolean(p.validFrom)],
  ['validUntil', (p) => Boolean(p.validUntil)],
];

for (const chainId of chainIds) {
  const forChain = promotions.filter((p) => p.chainId === chainId);
  const sample = forChain.slice(0, sampleSize);
  console.log(
    `  ${chainId.toUpperCase()} — ${forChain.length} aanbiedingen, ${sample.length} bekeken\n`,
  );
  for (const [label, present] of FIELDS) {
    const count = sample.filter(present).length;
    const share = sample.length === 0 ? 0 : (count / sample.length) * 100;
    console.log(
      `    ${label.padEnd(16)} ${String(count).padStart(4)}  ${share.toFixed(1).padStart(5)}%`,
    );
  }

  // Does the source's product id look like the retailer's own? That single
  // question decides whether tier-1 linking is available at all.
  const parseable = sample.filter((p) => extractRetailerProductId(chainId, p.externalProductId));
  console.log(
    `\n    winkel-product-ID herkenbaar   ${parseable.length}/${sample.length}` +
      `  (bepaalt of tier 1 bruikbaar is)`,
  );

  const candidates = sample.map(toCandidate);
  const supported = candidates.filter((c) => c.params).length;
  console.log(`    promotietype leesbaar          ${supported}/${sample.length}`);
  const byType = new Map<string, number>();
  for (const candidate of candidates) {
    const key = candidate.params?.type ?? `NIET: ${candidate.unsupportedReason}`;
    byType.set(key, (byType.get(key) ?? 0) + 1);
  }
  for (const [type, count] of [...byType.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`      ${type.padEnd(24)} ${count}`);
  }
  console.log('');
}

/* How many of them can actually be tied to something we sell. */
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

console.log('  Koppeling aan onze producten\n');
const header =
  '    ' +
  'keten'.padEnd(8) +
  'aangeboden'.padStart(11) +
  'retailer-ID'.padStart(13) +
  'GTIN'.padStart(7) +
  'naam+maat'.padStart(11) +
  'review'.padStart(8) +
  'niet'.padStart(7);
console.log(header);
console.log('    ' + '-'.repeat(header.length - 4));
for (const chain of fixture.chains) {
  const result = linkPromotions({
    chainId: chain.chainId,
    candidates: promotions.map(toCandidate),
    offers: chain.reducedOffers,
    retailerIdByProduct,
  });
  const t = result.metrics.byTier;
  console.log(
    '    ' +
      chain.chainId.padEnd(8) +
      String(result.metrics.fetched).padStart(11) +
      String(t.EXACT_RETAILER_ID).padStart(13) +
      String(t.EXACT_GTIN).padStart(7) +
      String(t.NAME_PACKAGE).padStart(11) +
      String(t.NEEDS_REVIEW).padStart(8) +
      String(result.metrics.rejected.NO_CANDIDATE_PRODUCT).padStart(7),
  );
}
console.log('');
