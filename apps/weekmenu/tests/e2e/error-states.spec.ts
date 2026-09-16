import { expect, test, type Page } from '@playwright/test';

/**
 * The four ways a week can fail to come out, and what the user is told.
 *
 * Each of these is reachable from the ordinary settings screen, which is the
 * point: they are not exotic states, they are what happens when someone sets a
 * budget that is too tight or ticks one small shop. What they have in common is
 * that the app has to say something true and useful — never a blank page, never
 * a stack trace, never a technical code, and never a plausible-looking number
 * it cannot stand behind.
 */
async function signIn(page: Page): Promise<void> {
  await page.goto('/inloggen');
  await page.getByRole('button', { name: 'Bekijk de demo' }).click();
  await expect(page).toHaveURL(/\/week$/);
}

/** Tick exactly the chains named, leave the rest alone. */
async function useChains(page: Page, wanted: RegExp): Promise<void> {
  await page.goto('/week/instellingen');
  const rows = page.locator('label').filter({ hasText: /Albert Heijn|Jumbo|Lidl/ });
  for (let i = 0; i < (await rows.count()); i += 1) {
    const row = rows.nth(i);
    const box = row.locator('input[type=checkbox], [role=checkbox]').first();
    if ((await box.count()) === 0) continue;
    const shouldBeOn = wanted.test(await row.innerText());
    const isOn = await box
      .isChecked()
      .catch(async () => (await box.getAttribute('aria-checked')) === 'true');
    if (shouldBeOn !== isOn) await box.click();
  }
  await page.getByRole('button', { name: /Instellingen opslaan/ }).click();
  await expect(page.getByRole('button', { name: /^Maak mijn week$/ })).toBeVisible();
}

async function setBudget(page: Page, mode: 'Hard maximum' | 'Geen budget', amount?: string) {
  await page.goto('/week/instellingen');
  await page.getByRole('button', { name: mode, exact: true }).click();
  if (amount !== undefined) {
    await page
      .getByRole('textbox', { name: /bedrag|budget/i })
      .first()
      .fill(amount);
  }
  await page.getByRole('button', { name: /Instellingen opslaan/ }).click();
  await expect(page.getByRole('button', { name: /^Maak mijn week$/ })).toBeVisible();
}

test.describe('when a week cannot be made the way you asked', () => {
  test.describe.configure({ timeout: 600_000 });

  test('a budget nobody could meet is explained, with the real number', async ({ page }) => {
    await signIn(page);
    await setBudget(page, 'Hard maximum', '10');
    await page.getByRole('button', { name: /^Maak mijn week$/ }).click();

    // Either a week comes out over budget and says so, or none does and it says
    // that. Both are acceptable; a blank screen or a crash is not.
    await page.waitForLoadState('networkidle');
    const body = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
    expect(body).not.toContain('Application error');
    expect(body).not.toMatch(/\bat \w+ \(/);
    expect(body).toMatch(/boven je budget|geen volledige week|budget/i);
    // And it names what a week actually costs, so the user can act on it.
    expect(body).toMatch(/€\s?\d+[.,]\d{2}/);

    await setBudget(page, 'Geen budget');
  });

  test('a household that can eat nothing gets a reason, not a white screen', async ({ page }) => {
    await signIn(page);

    // Every cuisine excluded: the filter has nothing left to offer.
    await page.goto('/gezin/voorkeuren');
    const never = page.getByRole('radio', { name: /: Nooit$/ });
    const count = await never.count();
    expect(count).toBeGreaterThan(0);
    const chosen: string[] = [];
    for (let i = 0; i < (await page.getByRole('radio').count()); i += 1) {
      const radio = page.getByRole('radio').nth(i);
      if (await radio.isChecked()) {
        const label = await radio.getAttribute('aria-label');
        if (label) chosen.push(label);
      }
    }
    for (let i = 0; i < count; i += 1) await never.nth(i).click();
    const save = page.getByRole('button', { name: 'Voorkeuren opslaan' });
    await save.click();
    await expect(save).toBeEnabled({ timeout: 60_000 });

    try {
      await page.goto('/week/instellingen');
      await page.getByRole('button', { name: /^Maak mijn week$/ }).click();
      await page.waitForLoadState('networkidle');
      const body = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
      expect(body).not.toContain('Application error');
      expect(body).not.toMatch(/\bat \w+ \(/);
      expect(body).toMatch(/geen|niet|past/i);
      // The way out has to be on the page.
      await expect(
        page.getByRole('link', { name: /Instellingen|voorkeuren/i }).first(),
      ).toBeVisible();
    } finally {
      await page.goto('/gezin/voorkeuren');
      for (const label of chosen) {
        await page.getByRole('radio', { name: label, exact: true }).click();
      }
      await page.getByRole('button', { name: 'Voorkeuren opslaan' }).click();
      await expect(page.getByRole('button', { name: 'Voorkeuren opslaan' })).toBeEnabled({
        timeout: 60_000,
      });
    }
  });

  test('a shop that cannot supply the week says which products it lacks', async ({ page }) => {
    await signIn(page);
    await useChains(page, /Lidl/);
    await page.getByRole('button', { name: /^Maak mijn week$/ }).click();
    await expect(page.getByRole('heading', { name: 'Mijn week' })).toBeVisible({
      timeout: 180_000,
    });

    const body = (await page.locator('main').innerText()).replace(/\s+/g, ' ');
    expect(body).not.toMatch(/INCOMPLETE_BASKET|UNAVAILABLE|NO_PRODUCTS/);

    // Either this shop can supply the week, or the page names what it cannot.
    if (/Niet verkrijgbaar/i.test(body)) {
      expect(body).toMatch(/Niet verkrijgbaar bij de gekozen winkels: \w/);
    }

    await page.goto('/winkels');
    const stores = (await page.locator('main').innerText()).replace(/\s+/g, ' ');
    expect(stores).not.toMatch(/INCOMPLETE_BASKET|undefined|NaN/);

    await useChains(page, /Albert Heijn|Jumbo|Lidl/);
  });

  test('travel is absent, and says so rather than showing € 0,00', async ({ page }) => {
    await signIn(page);
    await page.goto('/week');
    const generate = page.getByRole('button', { name: /^Maak mijn week$/ });
    if ((await generate.count()) > 0) await generate.click();
    await expect(page.getByRole('heading', { name: 'Mijn week' })).toBeVisible({
      timeout: 180_000,
    });

    const body = (await page.locator('main').innerText()).replace(/\s+/g, ' ');
    expect(body).toMatch(/Reiskosten|nog niet meegenomen/i);
    expect(body, 'reiskosten van € 0,00 suggereert een berekening die niet bestaat').not.toMatch(
      /Reiskosten €\s?0,00/,
    );
  });
});
