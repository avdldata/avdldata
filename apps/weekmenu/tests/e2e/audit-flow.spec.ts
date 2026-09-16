import { expect, test, type Page } from '@playwright/test';

/**
 * The whole journey, end to end, checking numbers rather than page loads.
 *
 * A screen that renders is not a screen that is correct: every step below reads
 * a figure off the page and holds the next step to it, so a plan whose parts
 * disagree with each other fails here rather than in front of a user.
 */

/** Read a "€ 12,34" string as integer cents. */
function euroToCents(text: string): number {
  const match = /(\d{1,3}(?:\.\d{3})*),(\d{2})/.exec(text);
  if (!match) throw new Error(`Geen bedrag gevonden in "${text}"`);
  return Number(match[1]!.replace(/\./g, '')) * 100 + Number(match[2]);
}

async function openDemo(page: Page): Promise<void> {
  await page.goto('/inloggen');
  await page.getByRole('button', { name: 'Bekijk de demo' }).click();
  await expect(page).toHaveURL(/\/week$/);
}

async function ensureWeek(page: Page): Promise<void> {
  const generate = page.getByRole('button', { name: /^Maak mijn week$/ });
  if (await generate.isVisible().catch(() => false)) await generate.click();
  await expect(page.getByRole('heading', { name: 'Mijn week' })).toBeVisible({ timeout: 60_000 });
}

async function groceryTotal(page: Page): Promise<number> {
  const label = page.getByText('Boodschappen deze week');
  await expect(label).toBeVisible();
  return euroToCents(await label.locator('..').innerText());
}

async function shoppingListTotal(page: Page): Promise<number> {
  await page.goto('/boodschappen');
  const label = page.getByText('Totaal boodschappen');
  await expect(label).toBeVisible();
  return euroToCents(await label.locator('..').innerText());
}

async function planWithMaxStores(page: Page, label: string): Promise<void> {
  await page.goto('/week/instellingen');
  await page.getByRole('button', { name: label, exact: true }).click();
  await page.getByRole('button', { name: /^Maak mijn week$/ }).click();
  await expect(page.getByRole('heading', { name: 'Mijn week' })).toBeVisible({ timeout: 60_000 });
}

test.describe('the full journey, with the numbers checked', () => {
  test('plans, prices, compares, replaces and re-checks the list', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    // --- the household: two people, one of them pregnant, three shops nearby
    await openDemo(page);
    await ensureWeek(page);

    await page.goto('/gezin');
    await expect(page.getByText('Arjan')).toBeVisible();
    await expect(page.getByText('Chimene')).toBeVisible();
    // Portions are personal, so the two must not be given the same target.
    const targets = await page.getByText(/kcal/).allInnerTexts();
    expect(new Set(targets.map((t) => t.trim())).size).toBeGreaterThan(1);

    // --- one shop only
    await planWithMaxStores(page, '1 winkel');
    const oneStore = await groceryTotal(page);
    expect(oneStore).toBeGreaterThan(1000);
    await expect(page.getByRole('heading', { level: 3 })).toHaveCount(7);
    await expect(page.getByText(/geschikt tijdens de zwangerschap/i)).toBeVisible();

    // The list has to add up to the same number the week claims.
    expect(await shoppingListTotal(page)).toBe(oneStore);

    // --- the same week with two shops allowed
    await planWithMaxStores(page, 'Max. 2');
    const twoStores = await groceryTotal(page);
    expect(await shoppingListTotal(page)).toBe(twoStores);

    // --- the comparison keeps groceries and travel apart
    await page.goto('/winkels');
    const stores = await page.locator('main').innerText();
    expect(stores).toContain('Boodschappen');
    /*
     * Travel is shown when we know the distance, and said to be missing when we
     * do not. With real prices the branch addresses are still the seed's, so
     * the app reports travel as not included rather than pricing an invented
     * detour next to a real grocery bill. Either answer is honest; silence
     * would not be.
     */
    expect(stores).toMatch(/Reiskosten|[Nn]og niet meegenomen/);
    expect(stores).toContain('Praktisch totaal');
    expect(await page.getByText(/Praktisch totaal/).count()).toBeGreaterThanOrEqual(3);
    // The advice on this screen is the week's own recommendation.
    const advice = page.getByText('Ons advies').locator('../..');
    expect(euroToCents(await advice.innerText())).toBe(twoStores);

    // --- replace one dish; the entire week is re-priced
    await page.goto('/week');
    const before = await groceryTotal(page);
    await page.goto('/week/2');
    await page.getByRole('link', { name: 'Vervang dit gerecht' }).click();
    await expect(page.getByRole('heading', { name: /Ander gerecht op/ })).toBeVisible();

    const choose = page.getByRole('button', { name: 'Kies dit gerecht' }).first();
    const promisedDelta = await choose.locator('../..').innerText();
    await choose.click();

    // Choosing an alternative returns to the day it replaced.
    await expect(page).toHaveURL(/\/week\/2$/, { timeout: 60_000 });
    await page.goto('/week');
    await expect(page.getByRole('heading', { name: 'Mijn week' })).toBeVisible({ timeout: 60_000 });
    const after = await groceryTotal(page);

    // Whatever price change the card promised is the change that happened.
    const delta = /([+−-])\s*€\s*(\d{1,3}(?:\.\d{3})*),(\d{2})/.exec(promisedDelta);
    if (delta) {
      const sign = delta[1] === '+' ? 1 : -1;
      const amount = Number(delta[2]!.replace(/\./g, '')) * 100 + Number(delta[3]);
      expect(after - before).toBe(sign * amount);
    }

    // --- and the list follows the new week, not the old one
    expect(await shoppingListTotal(page)).toBe(after);

    expect(pageErrors).toEqual([]);
  });
});

test.describe('nothing breaks on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  const screens = [
    ['/week', 'Mijn week'],
    ['/boodschappen', 'Boodschappen'],
    ['/winkels', 'Waar haal je de boodschappen?'],
    ['/gezin', 'Gezin'],
    ['/week/instellingen', 'Weekinstellingen'],
  ] as const;

  test('every screen fits, scrolls only downwards and keeps its navigation', async ({ page }) => {
    await openDemo(page);
    await ensureWeek(page);

    for (const [path, heading] of screens) {
      await page.goto(path);
      await expect(page.getByRole('heading', { name: heading }).first()).toBeVisible();

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `${path} scrolls sideways`).toBeLessThanOrEqual(1);

      // The bottom navigation is what makes the app usable one-handed.
      await expect(page.getByRole('navigation').last()).toBeVisible();

      // Nothing that has to be tapped may be a sliver. A checkbox is measured
      // by the label wrapped around it, because that is what the thumb hits.
      const tiny = await page.evaluate(() => {
        const nodes = [...document.querySelectorAll('a[href], button, input, [role="radio"]')];
        return nodes
          .map((node) => {
            const target = node.closest('label') ?? node;
            const rect = target.getBoundingClientRect();
            return {
              rect,
              label: (node.textContent || node.getAttribute('aria-label') || node.tagName)
                .trim()
                .slice(0, 40),
            };
          })
          .filter(({ rect }) => rect.width > 0 && rect.height > 0 && rect.height < 24)
          .map(({ label }) => label);
      });
      expect(tiny, `${path} has tap targets under 24 px`).toEqual([]);
    }
  });
});

test.describe('the basics of using it without a mouse', () => {
  test('every form control has a label and the page has one main landmark', async ({ page }) => {
    await openDemo(page);

    for (const path of ['/week/instellingen', '/gezin/leden/nieuw', '/gezin/voorkeuren']) {
      await page.goto(path);
      await expect(page.locator('main')).toHaveCount(1);

      const unlabelled = await page.evaluate(() => {
        const controls = [...document.querySelectorAll('input, select, textarea')];
        return controls
          .filter((control) => {
            if (control.getAttribute('type') === 'hidden') return false;
            const id = control.getAttribute('id');
            const labelled =
              (id && document.querySelector(`label[for="${id}"]`)) ||
              control.closest('label') ||
              control.getAttribute('aria-label') ||
              control.getAttribute('aria-labelledby');
            return !labelled;
          })
          .map((control) => control.outerHTML.slice(0, 80));
      });
      expect(unlabelled, `${path} has unlabelled controls`).toEqual([]);
    }
  });

  test('the week can be reached with the keyboard alone', async ({ page }) => {
    await openDemo(page);
    await ensureWeek(page);
    await page.goto('/week');

    // Tab until a day link has focus, then open it with Enter.
    for (let i = 0; i < 30; i += 1) {
      await page.keyboard.press('Tab');
      const href = await page.evaluate(() => document.activeElement?.getAttribute('href') ?? '');
      if (/^\/week\/\d$/.test(href)) {
        await page.keyboard.press('Enter');
        await expect(page).toHaveURL(/\/week\/\d$/);
        return;
      }
    }
    throw new Error('No day link reachable by keyboard within 30 tab stops');
  });
});

test.describe('failure is shown, never crashed through', () => {
  test('excluding every cuisine explains itself instead of white-screening', async ({ page }) => {
    await openDemo(page);

    // The demo household is shared across this run, so whatever this test wrecks
    // it has to put back — otherwise the next spec inherits a household that can
    // eat nothing and fails for a reason that has nothing to do with it.
    const setEveryPreference = async (level: 'Nooit' | 'Neutraal'): Promise<number> => {
      await page.goto('/gezin/voorkeuren');
      const chips = page.getByRole('radio', { name: new RegExp(`: ${level}$`) });
      const count = await chips.count();
      for (let index = 0; index < count; index += 1) await chips.nth(index).click();
      const save = page.getByRole('button', { name: 'Voorkeuren opslaan' });
      await save.click();
      // Saving refreshes in place rather than navigating, so wait for the
      // button to come back out of its pending state.
      await expect(save).toBeEnabled({ timeout: 30_000 });
      return count;
    };

    try {
      expect(await setEveryPreference('Nooit')).toBeGreaterThan(0);

      await page.goto('/week/instellingen');
      await page.getByRole('button', { name: /^Maak mijn week$/ }).click();

      const body = await page.locator('body').innerText();
      expect(body).not.toContain('Application error');
      expect(body).not.toMatch(/\bat \w+ \(/); // no stack trace
      expect(body.length).toBeGreaterThan(50);
      // It has to say something about why, not just fail quietly.
      expect(body).toMatch(/geen|niet|past/i);
    } finally {
      await setEveryPreference('Neutraal');
    }
  });
});
