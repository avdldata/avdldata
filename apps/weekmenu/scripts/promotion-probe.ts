/**
 * What does the promotion snapshot actually contain?
 *
 * Step 4 of the brief, in one command: read the snapshot, validate it against
 * the contract, count which fields are really present, and report how many
 * records can be tied to a product we sell. Documentation and a live response
 * disagree often enough that counting is the only honest option.
 *
 * Nothing here touches the network. The snapshot is a file, which is what makes
 * this runnable at all while the source is out of reach.
 *
 *   pnpm promo:probe
 *   pnpm promo:probe -- --sample 100
 */
import { linkPromotions, toCandidate } from '../src/services/promotions/link-promotions';
import { identityCoverage, DEFAULT_SNAPSHOT_PATH } from '../src/services/promotions/load-snapshot';
import { extractRetailerProductId } from '../src/services/promotions/retailer-id';
import { loadSnapshotFromDisk, retailerIdIndex } from '../tests/support/promotion-snapshot';
import { loadRealChains } from '../tests/support/real-data-store';

const args = process.argv.slice(2);
/**
 * `pnpm promo:probe -- --sample 50` puts a bare "--" in argv, so the naive
 * `args[indexOf(flag) + 1]` reads argv[0] when the flag is absent and yields
 * NaN. That silently sampled nothing, which is the sort of quiet zero this
 * whole phase is about.
 */
const flag = (name: string): string | undefined => {
  const at = args.indexOf(name);
  return at === -1 ? undefined : args[at + 1];
};
const sampleSize = Number(flag('--sample') ?? 100);
const shoppingDate = flag('--date') ?? new Date().toISOString().slice(0, 10);

const outcome = loadSnapshotFromDisk();

if (outcome.status === 'ABSENT') {
  console.log(`
  ${outcome.message}

  PrijsProfeet is vanuit deze omgeving niet te bereiken: de egress-proxy weigert
  de host met 403 op CONNECT. Het volledige bewijs en wat er nodig is om verder
  te komen staan in PRIJSPROFEET_INTEGRATION.md.

  De veldnamen zijn inmiddels de geverifieerde officiële namen, dus een ruwe
  export uit de API valideert zoals hij is. Wat ontbreekt is de export zelf:

    1. Zet er een neer als ${DEFAULT_SNAPSHOT_PATH} — zie
       PRIJSPROFEET_SNAPSHOT_SCHEMA.md voor de velden.
    2. Draai "pnpm promo:import ${DEFAULT_SNAPSHOT_PATH}" voor de inleesrapportage,
       en daarna dit script voor de koppeling aan onze producten.
`);
  process.exit(1);
}

const promotions = outcome.promotions;
console.log(
  `\nPromotiemomentopname — ${promotions.length} aanbiedingen uit ${outcome.sourceFile}\n` +
    `  bron ${outcome.source}` +
    (outcome.fetchedAt ? `, opgehaald ${outcome.fetchedAt}` : ', geen opgehaald-tijdstempel') +
    `, ingelezen ${outcome.importedAt}\n` +
    `  peildatum voor actief/komend: ${shoppingDate}\n`,
);
const skipped = Object.entries(outcome.skippedRetailers);
if (skipped.length > 0) {
  console.log(
    `  overgeslagen ketens (buiten deze fase): ` +
      skipped.map(([chain, count]) => `${chain} ${count}`).join(', ') +
      '\n',
  );
}

/* Identity and status coverage — the metrics that decide the linking strategy. */
console.log('  Wat de records dragen, per keten\n');
const head =
  '    ' +
  'keten'.padEnd(8) +
  'records'.padStart(9) +
  'stable'.padStart(9) +
  'retailer'.padStart(10) +
  'EAN'.padStart(7) +
  'product_id'.padStart(12) +
  'pakket'.padStart(8) +
  'normprijs'.padStart(11) +
  'tekst'.padStart(7) +
  'typecode'.padStart(10);
console.log(head);
console.log('    ' + '-'.repeat(head.length - 4));
const share = (part: number, whole: number): string =>
  whole === 0 ? '   0%' : `${((part / whole) * 100).toFixed(0).padStart(3)}%`;
for (const row of identityCoverage(promotions, shoppingDate)) {
  console.log(
    '    ' +
      row.retailer.padEnd(8) +
      String(row.records).padStart(9) +
      share(row.withStableId, row.records).padStart(9) +
      share(row.withRetailerId, row.records).padStart(10) +
      share(row.withGtin, row.records).padStart(7) +
      share(row.withProductId, row.records).padStart(12) +
      share(row.withPackage, row.records).padStart(8) +
      share(row.withRegularPrice, row.records).padStart(11) +
      share(row.withPromotionText, row.records).padStart(7) +
      share(row.withTypeCode, row.records).padStart(10),
  );
}

console.log('\n  Geldigheid op de peildatum\n');
for (const row of identityCoverage(promotions, shoppingDate)) {
  console.log(
    `    ${row.retailer.padEnd(8)} actief ${String(row.active).padStart(5)}` +
      `   komend ${String(row.upcoming).padStart(5)}` +
      `   verlopen ${String(row.expired).padStart(5)}`,
  );
}

/* Which promotion types the engine can actually price. */
console.log('\n  Promotietypen\n');
for (const chainId of [...new Set(promotions.map((p) => p.chainId))].sort()) {
  const sample = promotions.filter((p) => p.chainId === chainId).slice(0, sampleSize);
  const candidates = sample.map(toCandidate);
  const byType = new Map<string, number>();
  for (const candidate of candidates) {
    const key = candidate.params?.type ?? `NIET: ${candidate.unsupportedReason}`;
    byType.set(key, (byType.get(key) ?? 0) + 1);
  }
  console.log(
    `    ${chainId.toUpperCase()} — ${candidates.filter((c) => c.params).length}/${sample.length} leesbaar`,
  );
  for (const [type, count] of [...byType.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`      ${type.padEnd(28)} ${count}`);
  }
}

/* How many of them can be tied to something we sell. */
const fixture = loadRealChains(['ah', 'jumbo']);
const retailerIdByProduct = retailerIdIndex(fixture.chains);
void extractRetailerProductId;

console.log('\n  Koppeling aan onze producten\n');
const linkHead =
  '    ' +
  'keten'.padEnd(8) +
  'aangeboden'.padStart(11) +
  'stable'.padStart(8) +
  'retailer'.padStart(10) +
  'GTIN'.padStart(7) +
  'naam+maat'.padStart(11) +
  'review'.padStart(8) +
  'niet'.padStart(7);
console.log(linkHead);
console.log('    ' + '-'.repeat(linkHead.length - 4));
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
      String(t.EXACT_STABLE_ID).padStart(8) +
      String(t.EXACT_RETAILER_ID).padStart(10) +
      String(t.EXACT_GTIN).padStart(7) +
      String(t.NAME_PACKAGE).padStart(11) +
      String(t.NEEDS_REVIEW).padStart(8) +
      String(result.metrics.rejected.NO_CANDIDATE_PRODUCT).padStart(7),
  );
}
console.log('');
