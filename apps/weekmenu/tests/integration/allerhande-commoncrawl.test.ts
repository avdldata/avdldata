import { createServer, type Server } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  archiveAllerhande,
  captureTimestampToIso,
  newestRecipeCaptures,
  parseCdxLines,
  parseWarcResponse,
  type ArchiveOptions,
} from '@/services/recipes/allerhande/commoncrawl';
import { fileStore } from '@/services/recipes/allerhande/file-store';
import { ALLERHANDE_USER_AGENT, nodeFetchHttp } from '@/services/recipes/allerhande/http';

/**
 * Route 1, tegen een nagebouwd Common Crawl op localhost.
 *
 * Het archief bestaat hier uit dezelfde onderdelen als het echte: een
 * collinfo.json met crawls, een index per crawl met pagina's, en een
 * databestand met gzip-WARC-records dat alleen per byte-range gelezen wordt.
 * De pagina's zijn zelfgeschreven; er staat geen Allerhande-tekst in deze repo.
 */

const recipeHtml = (name: string) =>
  `<html><head><script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Recipe',
    name,
  })}</script></head><body></body></html>`;

function chunked(body: Buffer): Buffer {
  const half = Math.floor(body.length / 2);
  const parts = [body.subarray(0, half), body.subarray(half)];
  return Buffer.concat([
    ...parts.flatMap((p) => [Buffer.from(`${p.length.toString(16)}\r\n`), p, Buffer.from('\r\n')]),
    Buffer.from('0\r\n\r\n'),
  ]);
}

function warcRecord(
  html: string,
  options: { status?: number; gzip?: boolean; chunked?: boolean; type?: string } = {},
): Buffer {
  let body: Buffer = Buffer.from(html, 'utf8');
  const headers = ['Content-Type: text/html; charset=UTF-8'];
  if (options.gzip) {
    body = gzipSync(body);
    headers.push('Content-Encoding: gzip');
  } else {
    headers.push('X-Crawler-Content-Encoding: gzip');
  }
  if (options.chunked) {
    body = chunked(body);
    headers.push('Transfer-Encoding: chunked');
  }
  const http = Buffer.concat([
    Buffer.from(
      `HTTP/1.1 ${options.status ?? 200} OK\r\n${headers.join('\r\n')}\r\n\r\n`,
      'latin1',
    ),
    body,
  ]);
  const warc = Buffer.from(
    `WARC/1.0\r\nWARC-Type: ${options.type ?? 'response'}\r\nContent-Length: ${http.length}\r\n\r\n`,
    'latin1',
  );
  return gzipSync(Buffer.concat([warc, http, Buffer.from('\r\n\r\n')]));
}

describe('WARC-records en de index', () => {
  it('haalt de pagina uit een record, ook gecomprimeerd of in chunks', () => {
    for (const options of [{}, { gzip: true }, { chunked: true }, { gzip: true, chunked: true }]) {
      const page = parseWarcResponse(warcRecord(recipeHtml('Stamppot'), options));
      expect(page?.status, JSON.stringify(options)).toBe(200);
      expect(page?.html, JSON.stringify(options)).toContain('"name":"Stamppot"');
    }
  });

  it('negeert een record dat geen response is', () => {
    expect(parseWarcResponse(warcRecord('x', { type: 'request' }))).toBeUndefined();
  });

  it('kiest per recept de nieuwste opname die echt een pagina was', () => {
    const line = (url: string, timestamp: string, status = '200') =>
      JSON.stringify({
        url,
        timestamp,
        status,
        mime: 'text/html',
        filename: 'f',
        offset: '0',
        length: '1',
      });
    const entries = parseCdxLines(
      [
        line('https://www.ah.nl/allerhande/recept/R-R1/a', '20260801000000'),
        line('https://www.ah.nl/allerhande/recept/R-R1/a', '20260901000000'),
        line('https://www.ah.nl/allerhande/recept/R-R1/a', '20260915000000', '301'),
        line('https://www.ah.nl/allerhande/recept/R-R2/b', '20260902000000'),
        line('https://www.ah.nl/allerhande/thema/pasta', '20260902000000'),
        '{ kapot',
      ].join('\n'),
    );
    const newest = newestRecipeCaptures(entries);
    expect([...newest.keys()].sort()).toEqual(['R-R1', 'R-R2']);
    expect(newest.get('R-R1')?.timestamp).toBe('20260901000000');
  });

  it('zet een archieftijdstip om naar ISO', () => {
    expect(captureTimestampToIso('20260914122508')).toBe('2026-09-14T12:25:08.000Z');
  });
});

// ---- the archive as a server ------------------------------------------------

let server: Server;
let origin: string;
let dataFile: Buffer;
let indexByCrawl: Map<string, string[][]>; // crawl → pages → lines
let busyResponses: number;
let requests: { path: string; userAgent: string; range?: string }[];
let directory: string;

function buildArchive() {
  const records: { id: string; url: string; timestamp: string; crawl: string; buffer: Buffer }[] = [
    {
      id: 'R-R1',
      url: '/allerhande/recept/R-R1/een',
      timestamp: '20260914120000',
      crawl: 'CC-TEST-2',
      buffer: warcRecord(recipeHtml('Een'), { gzip: true }),
    },
    {
      id: 'R-R2',
      url: '/allerhande/recept/R-R2/twee',
      timestamp: '20260913120000',
      crawl: 'CC-TEST-2',
      buffer: warcRecord(recipeHtml('Twee'), { chunked: true }),
    },
    {
      id: 'R-R3',
      url: '/allerhande/recept/R-R3/drie',
      timestamp: '20260801120000',
      crawl: 'CC-TEST-1',
      buffer: warcRecord(recipeHtml('Drie')),
    },
    {
      id: 'R-R4',
      url: '/allerhande/recept/R-R4/geen-data',
      timestamp: '20260912120000',
      crawl: 'CC-TEST-2',
      buffer: warcRecord('<h1>Geen receptdata</h1>'),
    },
    // An older capture of R-R1 in the older crawl: the newer one must win.
    {
      id: 'R-R1',
      url: '/allerhande/recept/R-R1/een',
      timestamp: '20260701120000',
      crawl: 'CC-TEST-1',
      buffer: warcRecord(recipeHtml('Een, oud')),
    },
  ];
  const filler = Buffer.from('x'.repeat(137));
  const parts: Buffer[] = [];
  indexByCrawl = new Map([
    ['CC-TEST-2', [[], []]],
    ['CC-TEST-1', [[]]],
  ]);
  let offset = 0;
  records.forEach((record, index) => {
    parts.push(filler);
    offset += filler.length;
    parts.push(record.buffer);
    const line = JSON.stringify({
      urlkey: record.url,
      timestamp: record.timestamp,
      url: `https://www.ah.nl${record.url}`,
      mime: 'text/html',
      status: '200',
      filename: 'crawl-data/test.warc.gz',
      offset: String(offset),
      length: String(record.buffer.length),
    });
    const pages = indexByCrawl.get(record.crawl)!;
    pages[index % pages.length]!.push(line);
    offset += record.buffer.length;
  });
  dataFile = Buffer.concat(parts);
}

beforeAll(async () => {
  server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    requests.push({
      path: url.pathname + url.search,
      userAgent: String(req.headers['user-agent'] ?? ''),
      ...(req.headers.range ? { range: String(req.headers.range) } : {}),
    });
    if (busyResponses > 0 && url.pathname.endsWith('-index')) {
      busyResponses -= 1;
      res.writeHead(503, { 'retry-after': '7' });
      res.end('Please reduce your request rate.');
      return;
    }
    if (url.pathname === '/collinfo.json') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify(
          ['CC-TEST-2', 'CC-TEST-1', 'CC-TEST-0'].map((id) => ({
            id,
            'cdx-api': `${origin}/${id}-index`,
          })),
        ),
      );
      return;
    }
    const crawl = /^\/(CC-TEST-\d)-index$/.exec(url.pathname)?.[1];
    if (crawl) {
      const pages = indexByCrawl.get(crawl);
      if (!pages) {
        res.writeHead(404);
        res.end('No Captures found');
        return;
      }
      if (url.searchParams.get('showNumPages') === 'true') {
        res.writeHead(200);
        res.end(JSON.stringify({ pageSize: 5, blocks: 2, pages: pages.length }));
        return;
      }
      res.writeHead(200);
      res.end(pages[Number(url.searchParams.get('page') ?? 0)]!.join('\n'));
      return;
    }
    if (url.pathname === '/data/crawl-data/test.warc.gz') {
      const m = /^bytes=(\d+)-(\d+)$/.exec(String(req.headers.range ?? ''));
      if (!m) {
        res.writeHead(400);
        res.end();
        return;
      }
      res.writeHead(206);
      res.end(dataFile.subarray(Number(m[1]), Number(m[2]) + 1));
      return;
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  requests = [];
  busyResponses = 0;
  buildArchive();
  directory = mkdtempSync(join(tmpdir(), 'allerhande-cc-'));
  return () => rmSync(directory, { recursive: true, force: true });
});

function run(overrides: Partial<ArchiveOptions> = {}) {
  let clock = Date.parse('2026-09-24T10:00:00Z');
  const waits: number[] = [];
  const store = fileStore(directory);
  const outcome = archiveAllerhande({
    indexOrigin: origin,
    dataOrigin: `${origin}/data`,
    crawls: 2,
    urlPattern: 'www.ah.nl/allerhande/recept/*',
    userAgent: ALLERHANDE_USER_AGENT,
    delayMs: 500,
    http: nodeFetchHttp,
    sleep: async (ms) => {
      waits.push(ms);
      clock += ms;
    },
    now: () => new Date(clock),
    store,
    log: () => undefined,
    ...overrides,
  });
  return { outcome, waits, store };
}

describe('route 1: Common Crawl', () => {
  it('haalt elk recept één keer op, uit de nieuwste opname', async () => {
    const { outcome, store } = run();
    const result = await outcome;

    expect(result).toMatchObject({
      status: 'DONE',
      crawlsSearched: ['CC-TEST-2', 'CC-TEST-1'],
      inArchive: 4,
      fetched: 3,
      withoutRecipe: 1,
    });
    const saved = store.all();
    expect(saved.map((r) => [r.recipeId, r.recipe['name']])).toEqual([
      ['R-R1', 'Een'],
      ['R-R2', 'Twee'],
      ['R-R3', 'Drie'],
    ]);
    expect(saved[0]).toMatchObject({
      source: 'commoncrawl',
      fetchedAt: '2026-09-14T12:00:00.000Z',
    });
  });

  it('leest de records alleen per byte-range, en vraagt AH nooit iets', async () => {
    const hosts = new Set<string>();
    await run({
      http: (url, headers) => {
        hosts.add(new URL(url).host);
        return nodeFetchHttp(url, headers);
      },
    }).outcome;
    // Alleen het archief. Het zoekpatroon noemt ah.nl; de verzoeken gaan er niet heen.
    expect([...hosts]).toEqual([new URL(origin).host]);
    const dataRequests = requests.filter((r) => r.path.startsWith('/data/'));
    expect(dataRequests.length).toBeGreaterThan(0);
    for (const request of dataRequests) expect(request.range).toMatch(/^bytes=\d+-\d+$/);
    for (const request of requests) expect(request.userAgent).toBe(ALLERHANDE_USER_AGENT);
  });

  it('gaat verder waar de vorige run bleef', async () => {
    await run().outcome;
    requests = [];
    const second = await run().outcome;
    expect(second).toMatchObject({ status: 'DONE', fetched: 0, alreadyStored: 3 });
    expect(requests.filter((r) => r.path.startsWith('/data/'))).toHaveLength(1); // alleen R-R4 opnieuw
  });

  it('wacht als het archief druk is, zo lang als het vraagt', async () => {
    busyResponses = 2;
    const { outcome, waits } = run();
    expect(await outcome).toMatchObject({ status: 'DONE', fetched: 3 });
    expect(waits.filter((w) => w === 7000)).toHaveLength(2);
  });

  it('stopt als het archief druk blijft, zonder door te drammen', async () => {
    busyResponses = 99;
    const result = await run({ maxAttempts: 3 }).outcome;
    expect(result).toMatchObject({ status: 'STOPPED', reason: 'INDEX_UNAVAILABLE' });
    expect(requests.filter((r) => r.path.includes('-index'))).toHaveLength(3);
  });

  it('houdt een pauze aan tussen alle verzoeken', async () => {
    const { outcome, waits } = run({ delayMs: 500 });
    await outcome;
    expect(waits.length).toBe(requests.length - 1);
    for (const wait of waits) expect(wait).toBeGreaterThanOrEqual(500);
  });

  it('stopt na het afgesproken aantal', async () => {
    expect(await run({ limit: 1 }).outcome).toMatchObject({ status: 'DONE', fetched: 1 });
  });
});
