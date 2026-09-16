import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

/**
 * Acht manieren om dezelfde week te kopen.
 *
 * One chain at a time, every pair, and the two "use whichever is cheapest"
 * settings. What is being checked is not which total is lowest — that is the
 * optimizer's business — but that the app does what the settings say: never
 * more shops than allowed, never a shop that was not ticked, never a trip cost
 * it cannot know, and never quietly dropping a product it could not find.
 */
const ARTIFACT = 'data/release/store-comparison.json';

interface Row {
  scenario: string;
  chains: string[];
  groceryCents: number;
  shops: number;
  unavailable: string;
}

const rows: Row[] = [];

async function signIn(page: Page): Promise<void> {
  page.setDefaultTimeout(30_000);
  await page.goto('/inloggen');
  await page.getByRole('button', { name: 'Bekijk de demo' }).click();
  await expect(page).toHaveURL(/\/week$/);
}

/** Tick exactly these chains, set the shop limit, and save. */
async function configure(page: Page, wanted: RegExp, maxStores: string): Promise<void> {
  await page.goto('/week/instellingen');
  const shops = page.locator('label').filter({ hasText: /Albert Heijn|Jumbo|Lidl/ });
  for (let i = 0; i < (await shops.count()); i += 1) {
    const row = shops.nth(i);
    const box = row.locator('input[type=checkbox]').first();
    if ((await box.count()) === 0) continue;
    const shouldBeOn = wanted.test(await row.innerText());
    if (shouldBeOn !== (await box.isChecked())) await box.click();
  }
  await page.getByRole('button', { name: maxStores, exact: true }).click();
  await page.getByRole('button', { name: /Instellingen opslaan/ }).click();
  await expect(page.getByRole('button', { name: /^Maak mijn week$/ })).toBeVisible({
    timeout: 60_000,
  });
}

/** Make a week under the settings as they now stand. */
async function makeWeek(page: Page): Promise<void> {
  await page.getByRole('button', { name: /^Maak mijn week$/ }).click();
  await expect(page.getByRole('heading', { name: 'Mijn week' })).toBeVisible({ timeout: 180_000 });
}

const SCENARIOS: { name: string; chains: RegExp; maxStores: string; expectMax: number }[] = [
  {
    name: 'alleen Albert Heijn',
    chains: /Albert Heijn/,
    maxStores: 'Maakt niet uit',
    expectMax: 1,
  },
  { name: 'alleen Jumbo', chains: /Jumbo/, maxStores: 'Maakt niet uit', expectMax: 1 },
  { name: 'alleen Lidl', chains: /Lidl/, maxStores: 'Maakt niet uit', expectMax: 1 },
  { name: 'AH + Jumbo', chains: /Albert Heijn|Jumbo/, maxStores: 'Maakt niet uit', expectMax: 2 },
  { name: 'AH + Lidl', chains: /Albert Heijn|Lidl/, maxStores: 'Maakt niet uit', expectMax: 2 },
  { name: 'Jumbo + Lidl', chains: /Jumbo|Lidl/, maxStores: 'Maakt niet uit', expectMax: 2 },
  {
    name: 'alle drie, hoogstens één winkel',
    chains: /Albert Heijn|Jumbo|Lidl/,
    maxStores: '1 winkel',
    expectMax: 1,
  },
  {
    name: 'alle drie, hoogstens twee winkels',
    chains: /Albert Heijn|Jumbo|Lidl/,
    maxStores: 'Max. 2',
    expectMax: 2,
  },
];

test.describe('waar de boodschappen vandaan komen', () => {
  test.describe.configure({ mode: 'serial', timeout: 900_000 });

  test.afterAll(async () => {
    await mkdir(dirname(ARTIFACT), { recursive: true });
    await writeFile(ARTIFACT, `${JSON.stringify(rows, null, 2)}\n`, 'utf8');
  });

  for (const scenario of SCENARIOS) {
    test(scenario.name, async ({ page }) => {
      await signIn(page);
      await configure(page, scenario.chains, scenario.maxStores);
      await makeWeek(page);

      const week = (await page.locator('main').innerText()).replace(/\s+/g, ' ');
      expect(week, 'geen zeven maaltijden').toMatch(/7 avondmaaltijden/);
      const total = week.match(/€\s?(\d+),(\d{2})/);
      expect(total, 'geen boodschappentotaal').not.toBeNull();
      const groceryCents = Number(total![1]) * 100 + Number(total![2]);

      // How many shops the plan uses, taken from the app's own count rather
      // than from whatever chain names happen to appear in the prose — reading
      // headings found nothing at all and made this assertion vacuous.
      const shopCount = Number(week.match(/Winkels (\d+)/)?.[1] ?? '0');
      expect(shopCount, `geen winkelaantal op de weekpagina`).toBeGreaterThan(0);
      expect(
        shopCount,
        `${shopCount} winkels bij een limiet van ${scenario.expectMax}`,
      ).toBeLessThanOrEqual(scenario.expectMax);

      await page.goto('/winkels');
      const stores = (await page.locator('main').innerText()).replace(/\s+/g, ' ');
      // Exactly the shops the advice names, and nothing else on the page: the
      // block also says what a single shop would have cost, which mentions a
      // chain that is not part of the plan.
      const advice = stores.match(/Ons advies (.+?) Boodschappen/)?.[1] ?? '';
      const shops = new Set(advice.match(/Albert Heijn|Jumbo|Lidl/g) ?? []);
      expect(shops.size, `het advies noemt geen winkel: "${advice}"`).toBeGreaterThan(0);
      expect(
        shops.size,
        `${[...shops].join(' + ')} bij een limiet van ${scenario.expectMax}`,
      ).toBeLessThanOrEqual(scenario.expectMax);
      // And never a shop that was not ticked.
      for (const chain of shops) {
        expect(scenario.chains.test(chain), `${chain} stond niet aangevinkt`).toBe(true);
      }

      // Groceries and travel stay apart, and travel is never invented. With
      // the branch addresses unknown, no distance and no trip cost may appear
      // anywhere on the page — not in the advice, not in the comparison list.
      expect(stores, 'reiskosten uit het niets').not.toMatch(/€\s?0,00 reiskosten/i);
      expect(stores, 'geen uitleg over reiskosten').toMatch(/reisafstand|reiskosten/i);
      if (/Nog niet meegenomen/i.test(stores)) {
        expect(stores, 'een afstand naast "we weten het niet"').not.toMatch(/\d+[.,]\d+ km/);
      }

      // A basket the shops cannot fill is named, never silently shortened.
      await page.goto('/boodschappen');
      const list = (await page.locator('main').innerText()).replace(/\s+/g, ' ');
      const missing = list.match(/Niet verkrijgbaar[^.]*\./)?.[0] ?? '';
      if (missing) expect(missing, 'lege onbeschikbaarheidsmelding').toMatch(/: \w/);
      expect(list).not.toMatch(/INCOMPLETE_BASKET|UNAVAILABLE|undefined|NaN/);

      rows.push({
        scenario: scenario.name,
        chains: [...shops],
        groceryCents,
        shops: shopCount,
        unavailable: missing || 'geen',
      });
    });
  }

  test('de instellingen staan terug op alle drie', async ({ page }) => {
    await signIn(page);
    await configure(page, /Albert Heijn|Jumbo|Lidl/, 'Maakt niet uit');
    await makeWeek(page);
  });
});
