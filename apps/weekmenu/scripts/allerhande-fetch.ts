/**
 * Allerhande-recepten ophalen voor eigen gebruik.
 *
 *   pnpm allerhande:fetch                  # alles, 5 s tussen verzoeken
 *   pnpm allerhande:fetch --limit 20       # proefrit: 20 nieuwe recepten
 *   pnpm allerhande:fetch --delay 10       # nog rustiger
 *
 * Draai dit op je eigen computer; de ontwikkelomgeving kan ah.nl niet bereiken.
 * Het leest robots.txt, vraagt één pagina tegelijk, stelt zich eerlijk voor en
 * stopt meteen als AH "nee" zegt. Een gestopte run gaat bij de volgende keer
 * verder waar hij bleef. Zie ALLERHANDE_IMPORT.md.
 */
import { crawlAllerhande } from '@/services/recipes/allerhande/crawl';
import { fileStore } from '@/services/recipes/allerhande/file-store';
import {
  ALLERHANDE_PRODUCT_TOKEN,
  ALLERHANDE_USER_AGENT,
  nodeFetchHttp,
} from '@/services/recipes/allerhande/http';

function option(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

const limit = option('limit') !== undefined ? Number(option('limit')) : undefined;
const delaySeconds = Number(option('delay') ?? 5);
const directory = option('out') ?? 'data/private/allerhande/raw';
if ((limit !== undefined && !(limit > 0)) || !(delaySeconds >= 1)) {
  console.error('Gebruik: pnpm allerhande:fetch [--limit N] [--delay seconden (minimaal 1)]');
  process.exit(1);
}

console.log(
  'Allerhande-import — alleen voor eigen gebruik. Deel deze bestanden niet en zet ze niet in git.',
);
console.log(
  `Opslag: ${directory} · ${delaySeconds} s tussen verzoeken${limit ? ` · maximaal ${limit} nieuwe` : ''}\n`,
);

const store = fileStore(directory);
const outcome = await crawlAllerhande({
  origin: 'https://www.ah.nl',
  sitemapPath: '/sitemaps/entities/allerhande/recipes.xml',
  userAgent: ALLERHANDE_USER_AGENT,
  productToken: ALLERHANDE_PRODUCT_TOKEN,
  delayMs: delaySeconds * 1000,
  ...(limit !== undefined ? { limit } : {}),
  http: nodeFetchHttp,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now: () => new Date(),
  store,
  log: (line) => console.log(line),
});

console.log('');
console.log(`in de sitemap        ${outcome.listed}`);
console.log(`nieuw opgehaald      ${outcome.fetched}`);
console.log(`stonden er al        ${outcome.alreadyStored}`);
console.log(`verboden (robots)    ${outcome.disallowed}`);
console.log(`zonder receptdata    ${outcome.withoutRecipe}`);
console.log(`verdwenen (404)      ${outcome.gone}`);
console.log(`verzoeken            ${outcome.requests}`);
if (outcome.status === 'STOPPED') {
  console.log(`\nGESTOPT: ${outcome.reason} — ${outcome.detail}`);
  if (outcome.reason === 'BLOCKED') {
    console.log(
      'AH weigert deze verzoeken. De tool omzeilt dat bewust niet. Wat er al is opgehaald blijft staan.\n' +
        'Gebruik pnpm allerhande:archive: dat haalt dezelfde recepten uit Common Crawl, zonder ah.nl te benaderen.',
    );
  }
  process.exitCode = 2;
} else {
  console.log(`\nKlaar. Volgende stap: pnpm allerhande:convert`);
}
