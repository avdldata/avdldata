import { expect, test, type Page } from '@playwright/test';
import { withoutPromotionsBaseURL } from '../../playwright.config';

/**
 * Geen folder, wel een week.
 *
 * A promotion is an extra: it makes a week cheaper, it never makes one
 * possible. So when the offers cannot be read, the app owes the user an
 * ordinary week at ordinary shelf prices — not an error, and above all not a
 * demo price wearing a real one's clothes.
 *
 * This server runs with the real catalogue and the real price snapshot, and
 * with the promotion file pointed at a path that does not exist. That is the
 * only difference from the app every other suite drives.
 */
test.use({ baseURL: withoutPromotionsBaseURL });

/** A real product id is `chain:identity`; the demo seed uses hyphens only. */
const REAL_PRODUCT = /^[a-z0-9-]+:(ah|jumbo|lidl):/;

async function signIn(page: Page): Promise<void> {
  page.setDefaultTimeout(30_000);
  await page.goto('/inloggen');
  await page.getByRole('button', { name: 'Bekijk de demo' }).click();
  await expect(page).toHaveURL(/\/week$/);
}

test.describe('zonder aanbiedingen', () => {
  test.describe.configure({ timeout: 600_000 });

  test('maakt gewoon een week, tegen echte reguliere prijzen', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));

    await signIn(page);

    // The household is there, and reading it does not depend on offers.
    await page.goto('/gezin');
    await expect(page.getByText('Arjan')).toBeVisible();

    await page.goto('/week');
    const generate = page.locator('button[data-action="generate-week"]').first();
    if ((await generate.count()) > 0) await generate.click();
    await expect(page.getByRole('heading', { name: 'Mijn week' })).toBeVisible({
      timeout: 180_000,
    });

    // Seven dinners, priced.
    expect(await page.locator('li[data-recipe-id]').count(), 'geen volledige week').toBe(7);
    const week = (await page.locator('main').innerText()).replace(/\s+/g, ' ');
    expect(week, 'geen bedrag bij de week').toMatch(/€\s?\d+[.,]\d{2}/);

    await page.goto('/boodschappen');
    const list = (await page.locator('main').innerText()).replace(/\s+/g, ' ');

    // Still real data. A missing folder is not a reason to fall back to demo.
    expect(list, 'stil teruggevallen op demo-data').not.toMatch(/Demo-data/);
    expect(list, 'geen echte prijsdata meer').toContain('Echte prijsdata');
    expect(list, 'geen totaal').toMatch(/€\s?\d+[.,]\d{2}/);

    // Every line is a product out of the real snapshot, by its id.
    const keys = await page
      .locator('li[data-item-key]')
      .evaluateAll((nodes) => nodes.map((n) => n.getAttribute('data-item-key') ?? ''));
    expect(keys.length, 'lege boodschappenlijst').toBeGreaterThan(5);
    for (const key of keys) {
      expect(key, `${key} komt niet uit de echte catalogus`).toMatch(REAL_PRODUCT);
    }

    // Not one badge for an offer we could not read.
    expect(await page.locator('[data-promotion]').count(), 'aanbieding zonder folder').toBe(0);
    expect(list, 'korting zonder bron').not.toMatch(/\d+\s?\+\s?\d+ gratis|2e halve prijs/);

    // Said plainly, in the line that already carries the data's provenance.
    expect(list, 'zwijgt over de ontbrekende folder').toContain('aanbiedingen niet beschikbaar');

    // And nothing broke on the way.
    expect(list).not.toContain('Application error');
    expect(list).not.toMatch(/\bat \w+ \(/);
    await page.goto('/winkels');
    const stores = (await page.locator('main').innerText()).replace(/\s+/g, ' ');
    expect(stores).toMatch(/Albert Heijn|Jumbo|Lidl/);
    expect(stores).not.toContain('Application error');
    expect(errors, `javascriptfouten: ${errors.join(' | ')}`).toEqual([]);
  });
});
