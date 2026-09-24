import { createServer, type Server } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { crawlAllerhande, type CrawlOptions } from '@/services/recipes/allerhande/crawl';
import { fileStore } from '@/services/recipes/allerhande/file-store';
import {
  ALLERHANDE_PRODUCT_TOKEN,
  ALLERHANDE_USER_AGENT,
  nodeFetchHttp,
} from '@/services/recipes/allerhande/http';

/**
 * The importer's manners, proved against a real HTTP server on localhost.
 *
 * Everything that matters about this tool is what it does when the site says
 * something other than "200": it must stop on a refusal, wait when asked, obey
 * robots.txt and never fetch the same recipe twice. Each of those is a
 * scenario here, served by a real server and fetched with the same HTTP code
 * the script uses. Only the clock is fake, so the waits are measured instead
 * of sat through.
 */

interface Route {
  status: number;
  body?: string;
  headers?: Record<string, string>;
}

let server: Server;
let origin: string;
let routes: Map<string, Route | (() => Route)>;
let requests: { path: string; userAgent: string }[];
let directory: string;

const recipePage = (name: string) =>
  `<html><head><script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Recipe',
    name,
  })}</script></head><body><h1>${name}</h1></body></html>`;

const urlset = (paths: string[]) =>
  `<?xml version="1.0"?><urlset>${paths.map((p) => `<url><loc>${p.startsWith('http') ? p : origin + p}</loc></url>`).join('')}</urlset>`;

beforeAll(async () => {
  server = createServer((req, res) => {
    requests.push({ path: req.url ?? '', userAgent: String(req.headers['user-agent'] ?? '') });
    const entry = routes.get(req.url ?? '');
    const route = typeof entry === 'function' ? entry() : (entry ?? { status: 404 });
    res.writeHead(route.status, { 'content-type': 'text/html', ...(route.headers ?? {}) });
    res.end(route.body ?? '');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  requests = [];
  routes = new Map();
  directory = mkdtempSync(join(tmpdir(), 'allerhande-crawl-'));
  return () => rmSync(directory, { recursive: true, force: true });
});

function run(overrides: Partial<CrawlOptions> = {}) {
  let clock = Date.parse('2026-09-24T10:00:00Z');
  const waits: number[] = [];
  const log: string[] = [];
  const store = fileStore(directory);
  const outcome = crawlAllerhande({
    origin,
    sitemapPath: '/sitemaps/recipes.xml',
    userAgent: ALLERHANDE_USER_AGENT,
    productToken: ALLERHANDE_PRODUCT_TOKEN,
    delayMs: 1000,
    http: nodeFetchHttp,
    sleep: async (ms) => {
      waits.push(ms);
      clock += ms;
    },
    now: () => new Date(clock),
    store,
    log: (line) => log.push(line),
    ...overrides,
  });
  return { outcome, waits, log, store };
}

function standardSite() {
  routes.set('/robots.txt', { status: 200, body: 'User-agent: *\nAllow: /\nCrawl-delay: 3\n' });
  routes.set('/sitemaps/recipes.xml', {
    status: 200,
    body: `<sitemapindex><sitemap><loc>${origin}/sitemaps/a.xml</loc></sitemap><sitemap><loc>https://elders.example/sitemap.xml</loc></sitemap></sitemapindex>`,
  });
  routes.set('/sitemaps/a.xml', {
    status: 200,
    body: urlset([
      '/allerhande/recept/R-R1/een',
      '/allerhande/recept/R-R2/twee',
      '/allerhande/recept/R-R3/drie',
      '/allerhande/recept/R-R4/weg',
      '/allerhande/recept/R-R5/geen-data',
      'https://elders.example/allerhande/recept/R-R6/vreemd',
      '/allerhande/thema/geen-recept',
    ]),
  });
  routes.set('/allerhande/recept/R-R1/een', { status: 200, body: recipePage('Een') });
  routes.set('/allerhande/recept/R-R2/twee', { status: 200, body: recipePage('Twee') });
  routes.set('/allerhande/recept/R-R3/drie', { status: 200, body: recipePage('Drie') });
  routes.set('/allerhande/recept/R-R4/weg', { status: 404 });
  routes.set('/allerhande/recept/R-R5/geen-data', { status: 200, body: '<h1>Alleen opmaak</h1>' });
}

describe('de Allerhande-import', () => {
  it('haalt op wat de sitemap noemt, op dezelfde site, en slaat het op', async () => {
    standardSite();
    const { outcome, store } = run();
    const result = await outcome;

    expect(result).toMatchObject({
      status: 'DONE',
      listed: 5,
      fetched: 3,
      gone: 1,
      withoutRecipe: 1,
    });
    expect(store.all().map((r) => r.recipeId)).toEqual(['R-R1', 'R-R2', 'R-R3']);
    // Nooit een andere site: niet de vreemde sitemap, niet het vreemde recept.
    expect(requests.some((r) => r.path.includes('vreemd'))).toBe(false);
  });

  it('stelt zich eerlijk voor, bij elk verzoek', async () => {
    standardSite();
    await run().outcome;
    expect(requests.length).toBeGreaterThan(0);
    for (const request of requests) expect(request.userAgent).toBe(ALLERHANDE_USER_AGENT);
    expect(ALLERHANDE_USER_AGENT).not.toMatch(/Mozilla|Chrome|Safari|Firefox/);
  });

  it('houdt de Crawl-delay van de site aan als die langer is dan de eigen', async () => {
    standardSite();
    const { outcome, waits } = run({ delayMs: 1000 });
    await outcome;
    // Tussen elk verzoek na robots.txt: 3 s, zoals robots.txt vraagt.
    expect(waits.length).toBe(requests.length - 1);
    for (const wait of waits) expect(wait).toBe(3000);
  });

  it('haalt niets twee keer op: een tweede run gaat verder waar de eerste bleef', async () => {
    standardSite();
    await run().outcome;
    requests = [];
    const second = await run().outcome;

    expect(second).toMatchObject({ status: 'DONE', fetched: 0, alreadyStored: 3 });
    expect(requests.filter((r) => r.path.startsWith('/allerhande/recept/R-R1'))).toHaveLength(0);
  });

  it('stopt na het afgesproken aantal nieuwe recepten', async () => {
    standardSite();
    expect(await run({ limit: 2 }).outcome).toMatchObject({ status: 'DONE', fetched: 2 });
  });

  it('stopt meteen bij een 403, en vraagt daarna niets meer', async () => {
    standardSite();
    routes.set('/allerhande/recept/R-R2/twee', { status: 403 });
    const result = await run().outcome;

    expect(result).toMatchObject({ status: 'STOPPED', reason: 'BLOCKED', fetched: 1 });
    const last = requests.at(-1)!;
    expect(last.path).toBe('/allerhande/recept/R-R2/twee');
    // Geen herhaling, geen vermomming.
    expect(requests.filter((r) => r.path === last.path)).toHaveLength(1);
  });

  it('wacht één keer zo lang als een 429 vraagt, en stopt bij de tweede', async () => {
    standardSite();
    let calls = 0;
    routes.set('/allerhande/recept/R-R1/een', () =>
      ++calls === 1
        ? { status: 429, headers: { 'retry-after': '20' } }
        : { status: 200, body: recipePage('Een') },
    );
    const { outcome, waits } = run();
    expect(await outcome).toMatchObject({ status: 'DONE', fetched: 3 });
    expect(waits).toContain(20_000);

    routes.set('/allerhande/recept/R-R2/twee', { status: 429, headers: { 'retry-after': '5' } });
    rmSync(directory, { recursive: true, force: true });
    expect(await run().outcome).toMatchObject({ status: 'STOPPED', reason: 'RATE_LIMITED' });
  });

  it('vraagt geen enkel recept dat robots.txt verbiedt', async () => {
    standardSite();
    routes.set('/robots.txt', {
      status: 200,
      body: `User-agent: *\nAllow: /\n\nUser-agent: ${ALLERHANDE_PRODUCT_TOKEN}\nDisallow: /allerhande/recept/\n`,
    });
    const result = await run().outcome;

    expect(result).toMatchObject({ status: 'DONE', fetched: 0, disallowed: 5 });
    expect(requests.some((r) => r.path.startsWith('/allerhande/recept/'))).toBe(false);
  });

  it('begint niet eens als robots.txt de sitemap verbiedt', async () => {
    standardSite();
    routes.set('/robots.txt', { status: 200, body: 'User-agent: *\nDisallow: /\n' });
    const result = await run().outcome;

    expect(result).toMatchObject({ status: 'STOPPED', reason: 'ROBOTS_DISALLOW' });
    expect(requests.map((r) => r.path)).toEqual(['/robots.txt']);
  });

  it('beschouwt een onbereikbare robots.txt (5xx) als "alles verboden"', async () => {
    standardSite();
    routes.set('/robots.txt', { status: 503 });
    expect(await run().outcome).toMatchObject({ status: 'STOPPED', reason: 'ROBOTS_UNAVAILABLE' });
    expect(requests).toHaveLength(1);
  });

  it('stopt na vijf pagina’s zonder receptdata: zo ziet een blokkadepagina eruit', async () => {
    routes.set('/robots.txt', { status: 404 });
    const paths = [1, 2, 3, 4, 5, 6, 7].map((n) => `/allerhande/recept/R-R${n}/x`);
    routes.set('/sitemaps/recipes.xml', { status: 200, body: urlset(paths) });
    for (const path of paths) routes.set(path, { status: 200, body: '<p>Even geduld…</p>' });

    const result = await run().outcome;
    expect(result).toMatchObject({ status: 'STOPPED', reason: 'NO_RECIPE_DATA', withoutRecipe: 5 });
    expect(requests.some((r) => r.path === '/allerhande/recept/R-R6/x')).toBe(false);
  });
});
