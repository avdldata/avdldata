/**
 * Download the raw recipe corpora we are allowed to read.
 *
 *   pnpm recipes:fetch                 # every reachable source
 *   pnpm recipes:fetch -- --only fork  # one source
 *
 * Everything lands in `data/recipes/candidates/<source>/`, untouched. Parsing,
 * classifying and scoring happen later and separately: a download that also
 * transforms is a download you cannot re-examine when the transform turns out
 * to be wrong.
 *
 * ## What is reachable, and what is not
 *
 * This environment's egress policy allows github.com, api.github.com and
 * raw.githubusercontent.com and refuses everything else. Measured, not assumed:
 *
 *   raw.githubusercontent.com   200  — every file of every public repo
 *   api.github.com              403  — the session is scoped to one repository,
 *                                      so no tree listings
 *   codeload / archive tarballs 403  — no bulk download either
 *   themealdb.com               refused at CONNECT
 *   cosylab.iiitd.edu.in        refused at CONNECT — this is RecipeDB
 *
 * So RecipeDB and TheMealDB cannot be read from here at all, and the four
 * GitHub corpora have to be fetched file by file. Without the tree API each
 * source needs its own way of discovering what files exist, which is why the
 * adapters below differ more than they otherwise would.
 *
 * ## Rate limiting
 *
 * A small delay between requests and a bounded concurrency. These are public
 * repositories served for free; hammering them would be both rude and a good
 * way to get blocked halfway through.
 */
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const ROOT = 'data/recipes/candidates';
const argv = process.argv.slice(2).filter((a) => a !== '--');
const only = argv.includes('--only') ? argv[argv.indexOf('--only') + 1] : undefined;
const CONCURRENCY = 8;
const DELAY_MS = 40;

const raw = (repo: string, ref: string, path: string): string =>
  `https://raw.githubusercontent.com/${repo}/${ref}/${path}`;

async function get(url: string): Promise<string | undefined> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
      if (response.status === 404) return undefined;
      if (response.status === 429 || response.status >= 500) {
        await sleep(2000 * (attempt + 1));
        continue;
      }
      if (!response.ok) return undefined;
      return await response.text();
    } catch {
      await sleep(1000 * (attempt + 1));
    }
  }
  return undefined;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function save(path: string, body: string): void {
  const full = join(ROOT, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, body);
}

/** Fetch many files with a bounded number in flight. */
async function fetchAll(
  jobs: readonly { url: string; path: string }[],
  label: string,
): Promise<number> {
  let done = 0;
  let saved = 0;
  const queue = [...jobs];
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    for (;;) {
      const job = queue.shift();
      if (!job) return;
      if (existsSync(join(ROOT, job.path))) {
        saved += 1;
        done += 1;
        continue;
      }
      const body = await get(job.url);
      done += 1;
      if (body !== undefined) {
        save(job.path, body);
        saved += 1;
      }
      if (done % 100 === 0) process.stdout.write(`    ${label}: ${done}/${jobs.length}\n`);
      await sleep(DELAY_MS);
    }
  });
  await Promise.all(workers);
  return saved;
}

/* ── 1. ForkRecipe — 916 modern recipes, CC BY-SA 4.0 ────────────────────── */

async function forkRecipe(): Promise<void> {
  console.log('\nForkRecipe (futurechef/forkrecipe-recipes, CC BY-SA 4.0)');
  const repo = 'futurechef/forkrecipe-recipes';
  /*
   * `recipes/index.js` uses Vite's `import.meta.glob`, so it lists nothing.
   * The slugs have to come from the two registries that key by slug: the
   * commit log and the fork graph. Their union is the recipe set.
   */
  const slugs = new Set<string>();
  for (const path of ['data/commits.js', 'forks.js', 'data/forks.js']) {
    const body = await get(raw(repo, 'main', path));
    if (!body) continue;
    save(`forkrecipe/_${path.replace(/\//g, '_')}`, body);
    for (const match of body.matchAll(/^\s{2}"([a-z0-9][a-z0-9-]{2,})":/gm)) slugs.add(match[1]!);
    for (const match of body.matchAll(/\b(?:parent|child|slug)\s*:\s*"([a-z0-9][a-z0-9-]{2,})"/g)) {
      slugs.add(match[1]!);
    }
  }
  console.log(`  ${slugs.size} slugs uit de registers`);
  const saved = await fetchAll(
    [...slugs].sort().map((slug) => ({
      url: raw(repo, 'main', `recipes/${slug}.js`),
      path: `forkrecipe/recipes/${slug}.js`,
    })),
    'forkrecipe',
  );
  console.log(`  ${saved} receptbestanden opgehaald`);
}

/* ── 2. Open Recipe Archive — 54.843 historical, public domain ───────────── */

async function openRecipeArchive(): Promise<void> {
  console.log('\nOpen Recipe Archive (AdamBouhmad/open-recipe-archive, public domain)');
  const repo = 'AdamBouhmad/open-recipe-archive';
  const index = await get(raw(repo, 'main', 'index/collections.json'));
  if (!index) {
    console.log('  index niet bereikbaar');
    return;
  }
  save('open-recipe-archive/collections.json', index);
  const collections = JSON.parse(index) as { slug: string; recipe_count: number }[];
  console.log(
    `  ${collections.length} collecties, ${collections.reduce((n, c) => n + c.recipe_count, 0)} recepten`,
  );
  const saved = await fetchAll(
    collections.map((c) => ({
      url: raw(repo, 'main', `collections/${c.slug}/recipes.jsonl`),
      path: `open-recipe-archive/${c.slug}.jsonl`,
    })),
    'ORA',
  );
  console.log(`  ${saved} collectiebestanden opgehaald`);
}

/* ── 3. Epicurious 13k — scraped, licence unclear ────────────────────────── */

async function epicurious13k(): Promise<void> {
  console.log('\nrecipe-dataset (josephrmartinez/recipe-dataset, 13k, herkomst Epicurious)');
  const body = await get(raw('josephrmartinez/recipe-dataset', 'main', '13k-recipes.csv'));
  if (!body) {
    console.log('  niet bereikbaar');
    return;
  }
  save('recipe-dataset/13k-recipes.csv', body);
  console.log(`  ${(body.length / 1e6).toFixed(1)} MB opgehaald`);
}

/* ── 4. Public Domain Recipes — Unlicense, modern, small ─────────────────── */

async function publicDomainRecipes(): Promise<void> {
  console.log('\nPublic Domain Recipes (ronaldl29/public-domain-recipes, Unlicense)');
  const repo = 'ronaldl29/public-domain-recipes';
  /*
   * No tree API and no manifest in the repo, so the file names have to come
   * from somewhere. The published site is a Hugo build of `content/`, and its
   * sitemap lists every page — but the site is not on the allowlist either.
   *
   * What is left is the repo's own README index, if it has one, and otherwise
   * nothing. Rather than guess thousands of slugs, this source is recorded as
   * "reachable but not enumerable from here" and left out of the census.
   */
  const readme = await get(raw(repo, 'main', 'README.md'));
  if (readme) save('public-domain-recipes/README.md', readme);
  const index = await get(raw(repo, 'main', 'content/_index.md'));
  if (index) save('public-domain-recipes/_index.md', index);
  const slugs = new Set<string>();
  for (const body of [readme, index]) {
    if (!body) continue;
    for (const match of body.matchAll(/\(\/?(?:content\/)?([a-z0-9][a-z0-9-]{3,})\.md\)/g)) {
      slugs.add(match[1]!);
    }
  }
  if (slugs.size === 0) {
    console.log('  geen bestandenlijst te vinden zonder tree-API — overgeslagen, zie census');
    return;
  }
  const saved = await fetchAll(
    [...slugs].sort().map((slug) => ({
      url: raw(repo, 'main', `content/${slug}.md`),
      path: `public-domain-recipes/content/${slug}.md`,
    })),
    'PDR',
  );
  console.log(`  ${saved} recepten opgehaald`);
}

/* ── 5. Sources that cannot be reached from here ─────────────────────────── */

async function probeUnreachable(): Promise<void> {
  console.log('\nBronnen buiten de egress-policy (gemeten, niet aangenomen)');
  for (const [name, url] of [
    ['RecipeDB', 'https://cosylab.iiitd.edu.in/recipedb/'],
    ['TheMealDB', 'https://www.themealdb.com/api/json/v1/1/categories.php'],
  ] as const) {
    let outcome = 'onbereikbaar';
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
      outcome = `HTTP ${response.status}`;
    } catch (error) {
      outcome = `geweigerd (${error instanceof Error ? error.name : 'fout'})`;
    }
    console.log(`  ${name.padEnd(12)} ${outcome}`);
  }
  console.log(
    '\n  Deze twee zijn niet ingelezen en komen daarom in geen enkele telling voor.\n' +
      '  Wat er over hen in de opdracht staat is documentatie, geen meting.\n',
  );
}

const SOURCES: Record<string, () => Promise<void>> = {
  fork: forkRecipe,
  ora: openRecipeArchive,
  epicurious: epicurious13k,
  pdr: publicDomainRecipes,
  probe: probeUnreachable,
};

async function main(): Promise<void> {
  mkdirSync(ROOT, { recursive: true });
  const names = only ? [only] : Object.keys(SOURCES);
  for (const name of names) {
    const fn = SOURCES[name];
    if (!fn) {
      console.error(`onbekende bron: ${name}`);
      process.exit(1);
    }
    await fn();
  }
  const manifest = {
    fetchedAt: new Date().toISOString(),
    sources: names,
    note: 'Ruwe brondata. Niet gecommit; zie data/recipes/README.md.',
  };
  save('_manifest.json', `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`\nKlaar. Ruwe data in ${ROOT}/\n`);
}

void main();
void readFileSync;
