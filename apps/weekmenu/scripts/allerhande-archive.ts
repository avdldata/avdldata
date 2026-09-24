/**
 * Allerhande-recepten uit Common Crawl halen, voor eigen gebruik.
 *
 *   pnpm allerhande:archive                 # de 3 recentste crawls
 *   pnpm allerhande:archive --limit 50      # proefrit: 50 recepten
 *   pnpm allerhande:archive --crawls 6      # verder terug in de tijd zoeken
 *
 * Er gaat geen enkel verzoek naar ah.nl: de pagina's komen uit het openbare
 * archief van Common Crawl. Een gestopte run gaat bij de volgende keer verder
 * waar hij bleef. Zie ALLERHANDE_IMPORT.md.
 */
import { archiveAllerhande } from '@/services/recipes/allerhande/commoncrawl';
import { fileStore } from '@/services/recipes/allerhande/file-store';
import { ALLERHANDE_USER_AGENT, nodeFetchHttp } from '@/services/recipes/allerhande/http';

function option(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

const limit = option('limit') !== undefined ? Number(option('limit')) : undefined;
const crawls = Number(option('crawls') ?? 3);
const delayMs = Number(option('delay-ms') ?? 500);
const directory = option('out') ?? 'data/private/allerhande/raw';
if ((limit !== undefined && !(limit > 0)) || !(crawls >= 1) || !(delayMs >= 100)) {
  console.error(
    'Gebruik: pnpm allerhande:archive [--limit N] [--crawls N] [--delay-ms minimaal 100]',
  );
  process.exit(1);
}

console.log(
  'Allerhande uit Common Crawl — alleen voor eigen gebruik. Deel deze bestanden niet en zet ze niet in git.',
);
console.log(
  `Opslag: ${directory} · ${crawls} crawl(s) · ${delayMs} ms tussen verzoeken${limit ? ` · maximaal ${limit} nieuwe` : ''}\n`,
);

const outcome = await archiveAllerhande({
  indexOrigin: 'https://index.commoncrawl.org',
  dataOrigin: 'https://data.commoncrawl.org',
  crawls,
  urlPattern: 'www.ah.nl/allerhande/recept/*',
  userAgent: ALLERHANDE_USER_AGENT,
  delayMs,
  ...(limit !== undefined ? { limit } : {}),
  http: nodeFetchHttp,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now: () => new Date(),
  store: fileStore(directory),
  log: (line) => console.log(line),
});

console.log('');
console.log(`crawls doorzocht      ${outcome.crawlsSearched.join(', ') || '—'}`);
console.log(`recepten in archief   ${outcome.inArchive}`);
console.log(`nieuw opgeslagen      ${outcome.fetched}`);
console.log(`stonden er al         ${outcome.alreadyStored}`);
console.log(`zonder receptdata     ${outcome.withoutRecipe}`);
console.log(`niet te lezen         ${outcome.failed}`);
console.log(`verzoeken             ${outcome.requests}`);
if (outcome.status === 'STOPPED') {
  console.log(`\nGESTOPT: ${outcome.reason} — ${outcome.detail}`);
  console.log(
    'Het archief is druk of onbereikbaar. Draai het commando later opnieuw; hij gaat verder waar hij was.',
  );
  process.exitCode = 2;
} else {
  console.log('\nKlaar. Volgende stap: pnpm allerhande:convert');
}
