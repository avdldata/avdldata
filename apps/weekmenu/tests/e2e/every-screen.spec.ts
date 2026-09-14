import { expect, test, type Page } from '@playwright/test';

/**
 * Open every screen and insist on a 200 with no runtime error.
 *
 * This exists because the family screen returned a 500 for a while and nothing
 * noticed: the unit tests never render a page, and the flow tests only walked
 * the routes the flow happens to need. A server component that throws is
 * invisible until somebody opens it, so something has to open all of them.
 */

const SCREENS = [
  ['/week', 'Mijn week'],
  ['/week/0', ''],
  ['/week/0/vervangen', 'Ander gerecht op'],
  ['/week/instellingen', 'Weekinstellingen'],
  ['/boodschappen', 'Boodschappen'],
  ['/winkels', 'Waar haal je de boodschappen?'],
  ['/gezin', 'Gezin'],
  ['/gezin/voorkeuren', 'Smaakvoorkeuren'],
  ['/gezin/leden/nieuw', 'Gezinslid toevoegen'],
  ['/instellingen', 'Instellingen'],
] as const;

async function openDemo(page: Page): Promise<void> {
  await page.goto('/inloggen');
  await page.getByRole('button', { name: 'Bekijk de demo' }).click();
  await expect(page).toHaveURL(/\/week$/);
  const generate = page.getByRole('button', { name: /^Maak mijn week$/ });
  if (await generate.isVisible().catch(() => false)) await generate.click();
  await expect(page.getByRole('heading', { name: 'Mijn week' })).toBeVisible({ timeout: 60_000 });
}

test('every screen renders without a server or client error', async ({ page }) => {
  const failures: string[] = [];
  page.on('pageerror', (error) => failures.push(`runtime error: ${error.message.split('\n')[0]}`));

  await openDemo(page);

  for (const [path, heading] of SCREENS) {
    const response = await page.goto(path, { waitUntil: 'networkidle' });
    const status = response?.status() ?? 0;
    if (status !== 200) failures.push(`${path} returned ${status}`);

    const body = await page.locator('body').innerText();
    if (body.trim().length < 40) failures.push(`${path} rendered almost nothing`);
    if (heading && !body.includes(heading)) failures.push(`${path} is missing "${heading}"`);
    if (/Application error|Internal Server Error/i.test(body)) {
      failures.push(`${path} shows an error page`);
    }
  }

  expect(failures).toEqual([]);
});
