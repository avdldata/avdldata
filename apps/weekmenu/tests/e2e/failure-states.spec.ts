import { expect, test } from '@playwright/test';

/**
 * The app with its price data taken away.
 *
 * This suite runs against a second server started with `DATA_MODE=REAL` and the
 * snapshot paths pointed at files that do not exist. There is one rule, and it
 * is the reason the mode exists at all: **never quietly fall back to demo
 * prices**. A made-up number that looks real is worse than no number, because
 * the reader cannot tell.
 *
 * So the app is allowed to fail here. What it is not allowed to do is pretend.
 */
test.describe('without price data', () => {
  test.describe.configure({ timeout: 300_000 });

  test('sends a signed-out visitor to the sign-in screen, not to an error page', async ({
    page,
  }) => {
    // This was a real bug: the layout redirects a signed-out visitor, but the
    // page inside it renders concurrently and its `requireUser()` threw first,
    // so every protected route answered with Next's raw error page.
    for (const path of ['/week', '/boodschappen', '/winkels', '/gezin']) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/inloggen$/);
      await expect(page.getByRole('button', { name: 'Bekijk de demo' })).toBeVisible();
    }
  });

  test('says why a week cannot be made, instead of failing silently', async ({ page }) => {
    await page.goto('/inloggen');
    await page.getByRole('button', { name: 'Bekijk de demo' }).click();
    await expect(page).toHaveURL(/\/week$/, { timeout: 60_000 });

    // The empty state, because there is no week — not a total out of nowhere.
    await expect(page.getByText(/Nog geen weekmenu/)).toBeVisible();

    await page.getByRole('button', { name: /^Maak mijn week$/ }).click();
    // Scoped to the page body: Next renders its own live region for route
    // announcements, which also carries role=alert.
    const alert = page.locator('main').getByRole('alert');
    await expect(alert).toBeVisible({ timeout: 120_000 });
    await expect(alert).toContainText(/prijsgegevens|verzonnen prijzen|ging iets mis/i);

    const body = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
    expect(body).not.toContain('Application error');
    expect(body, 'geen stacktrace op het scherm').not.toMatch(/\bat \w+ \(/);
    expect(body, 'geen bedrag zonder prijsdata').not.toMatch(/Boodschappen\s*€/);
  });

  test('never shows demo prices as though they were real', async ({ page }) => {
    await page.goto('/inloggen');
    await page.getByRole('button', { name: 'Bekijk de demo' }).click();
    await expect(page).toHaveURL(/\/week$/, { timeout: 60_000 });

    for (const path of ['/week', '/boodschappen', '/winkels']) {
      await page.goto(path);
      await page.waitForLoadState('domcontentloaded');
      const body = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
      expect(body, `${path} toont een stacktrace`).not.toMatch(/\bat \w+ \(/);
      // The one thing that must never happen: a euro total presented as a real
      // week while the catalogue behind it is missing.
      const hasWeekTotal = /Boodschappen\s*€/.test(body);
      expect(hasWeekTotal, `${path} toont een weektotaal zonder prijsdata`).toBe(false);
    }
  });
});
