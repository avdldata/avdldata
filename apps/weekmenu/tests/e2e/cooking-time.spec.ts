import { expect, test, type Page } from '@playwright/test';

/**
 * ALPHA-002: een maximum dat geen enkel gerecht haalt.
 *
 * "Maximale bereidingstijd" is een vrij invulveld. Het snelste gerecht in de
 * bibliotheek duurt twintig minuten, dus wie vijftien invult houdt niets over —
 * en kreeg te horen dat zijn *dieetregels* alles uitsloten. Het getal stond op
 * een ander scherm dan de melding, dus er was geen weg terug.
 *
 * De regel blijft een regel: te traag is te traag. Alleen een maximum dat
 * niemand kan halen wordt geweigerd waar het getal nog op het scherm staat, en
 * als er tóch niets overblijft zegt de app welke regel het deed.
 */
async function signIn(page: Page): Promise<void> {
  page.setDefaultTimeout(30_000);
  await page.goto('/inloggen');
  await page.getByRole('button', { name: 'Bekijk de demo' }).click();
  await expect(page).toHaveURL(/\/week$/);
}

async function setCookingTime(page: Page, minutes: string): Promise<void> {
  await page.goto('/week/instellingen');
  await page.getByLabel('Maximale bereidingstijd (minuten)').fill(minutes);
  await page.getByRole('button', { name: /Instellingen opslaan/ }).click();
}

test.describe('een maximale bereidingstijd die niemand haalt', () => {
  test.describe.configure({ timeout: 600_000 });

  test('wordt geweigerd, met het snelste gerecht erbij', async ({ page }) => {
    await signIn(page);
    try {
      await setCookingTime(page, '15');

      const alert = page.locator('main').getByRole('alert');
      await expect(alert).toBeVisible({ timeout: 60_000 });
      const message = (await alert.innerText()).replace(/\s+/g, ' ');
      expect(message, 'zegt niet welk maximum').toContain('15 minuten');
      expect(message, 'noemt het snelste gerecht niet').toMatch(/het snelste duurt \d+ minuten/);
      expect(message, 'praat over dieetregels').not.toMatch(/dieetregels/i);

      // Niet opgeslagen: na herladen staat het veld nog op zijn oude waarde en
      // is de week gewoon te maken.
      await page.goto('/week/instellingen');
      await expect(page.getByLabel('Maximale bereidingstijd (minuten)')).not.toHaveValue('15');
    } finally {
      await setCookingTime(page, '');
    }
  });

  test('nul minuten is geen maximum maar een fout', async ({ page }) => {
    await signIn(page);
    try {
      await setCookingTime(page, '0');
      const alert = page.locator('main').getByRole('alert');
      await expect(alert).toBeVisible({ timeout: 60_000 });
      expect((await alert.innerText()).replace(/\s+/g, ' ')).toMatch(/0 minuten|aantal minuten/i);
    } finally {
      await setCookingTime(page, '');
    }
  });

  test('een haalbaar maximum werkt gewoon, en beperkt de week echt', async ({ page }) => {
    await signIn(page);
    try {
      await setCookingTime(page, '45');
      await expect(page.getByRole('button', { name: /^Maak mijn week$/ })).toBeVisible({
        timeout: 60_000,
      });

      await page.getByRole('button', { name: /^Maak mijn week$/ }).click();
      await expect(page.getByRole('heading', { name: 'Mijn week' })).toBeVisible({
        timeout: 180_000,
      });
      expect(await page.locator('li[data-recipe-id]').count()).toBe(7);

      // Elke dag haalt het maximum — de regel is niet afgezwakt.
      const minuten = (await page.locator('main').innerText()).match(/(\d+) min\b/g) ?? [];
      expect(minuten.length).toBeGreaterThanOrEqual(7);
      for (const label of minuten) {
        expect(Number(label.replace(' min', '')), `${label} is te lang`).toBeLessThanOrEqual(45);
      }
    } finally {
      await setCookingTime(page, '');
    }
  });
});
