import { existsSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { agedPricesBaseURL } from '../../playwright.config';
import { AGED_BY_DAYS, AGED_PRICES } from './snapshot-paths';

/**
 * "Deze prijzen zijn van weken geleden" — gezegd, en alleen wanneer het waar is.
 *
 * The rule itself is unit-tested (`tests/unit/price-freshness.test.ts`), but a
 * rule that never reaches a screen is not a warning. Both halves are here: a
 * server whose price file is deliberately weeks old must warn, and the ordinary
 * server must not. Without the second half the first proves only that the
 * sentence exists somewhere in the markup.
 *
 * Nothing is faked in production data. `globalSetup` copies the real snapshot
 * and sets the copy's modification time back, because that mtime is the only
 * capture date the app ever claims to know.
 */
const WARNING = /Prijsgegevens zijn mogelijk verouderd/;

async function signIn(page: Page): Promise<void> {
  page.setDefaultTimeout(30_000);
  await page.goto('/inloggen');
  await page.getByRole('button', { name: 'Bekijk de demo' }).click();
  await expect(page).toHaveURL(/\/week$/);
}

async function ensureWeek(page: Page): Promise<void> {
  await page.goto('/week');
  const generate = page.locator('button[data-action="generate-week"]').first();
  if ((await generate.count()) > 0) await generate.click();
  await expect(page.getByRole('heading', { name: 'Mijn week' })).toBeVisible({ timeout: 180_000 });
}

test.describe('prijsdata van vandaag', () => {
  test.describe.configure({ timeout: 600_000 });

  test('zegt wanneer de prijzen zijn opgehaald, en waarschuwt niet', async ({ page }) => {
    await signIn(page);
    await ensureWeek(page);
    await page.goto('/boodschappen');

    const main = (await page.locator('main').innerText()).replace(/\s+/g, ' ');
    expect(main, 'geen datum bij de prijzen').toMatch(/prijzen bijgewerkt \d+ \w+/);
    expect(main, 'waarschuwing bij verse data').not.toMatch(WARNING);
    await expect(page.locator('main').getByText(WARNING)).toHaveCount(0);
  });
});

test.describe('prijsdata van weken geleden', () => {
  test.describe.configure({ timeout: 600_000 });
  test.use({ baseURL: agedPricesBaseURL });
  test.skip(!existsSync(AGED_PRICES), 'geen prijsmomentopname om te verouderen');

  test('waarschuwt op de boodschappenlijst, en blijft gewoon werken', async ({ page }) => {
    await signIn(page);
    await ensureWeek(page);

    // A warning about the prices belongs where the prices are.
    await page.goto('/boodschappen');
    const list = (await page.locator('main').innerText()).replace(/\s+/g, ' ');
    expect(list, 'geen waarschuwing bij data van weken oud').toMatch(WARNING);
    // It says how old, and the number is the real age of the file.
    const age = Number(list.match(/ze zijn (\d+) dagen oud/)?.[1] ?? 0);
    expect(age, `leeftijd ${age} past niet bij ${AGED_BY_DAYS} dagen`).toBeGreaterThanOrEqual(
      AGED_BY_DAYS - 1,
    );
    expect(age).toBeLessThanOrEqual(AGED_BY_DAYS + 1);

    // Informative, not fatal: the prices are still there and still usable.
    expect(list, 'geen echte prijsdata meer').toContain('Echte prijsdata');
    expect(list, 'geen bedragen op de lijst').toMatch(/€\s?\d+[.,]\d{2}/);
    expect(await page.locator('li[data-item-key]').count()).toBeGreaterThan(5);
    expect(list).not.toContain('Application error');
    expect(list, 'demoprijzen onder een waarschuwing').not.toMatch(/Demo-data/);

    // And the week behind it is a whole week.
    await page.goto('/week');
    expect(await page.locator('li[data-recipe-id]').count()).toBe(7);

    // The same warning where the same numbers are compared.
    await page.goto('/winkels');
    expect((await page.locator('main').innerText()).replace(/\s+/g, ' ')).toMatch(WARNING);
  });
});
