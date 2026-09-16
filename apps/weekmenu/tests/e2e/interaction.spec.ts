import { expect, test, type Page } from '@playwright/test';

/**
 * The things that break when a real person uses the app impatiently.
 *
 * Nobody waits politely for a spinner. They tap twice, hit back, reload
 * mid-flow, and expect all of it to behave. Each case here is one of those.
 */
async function signIn(page: Page): Promise<void> {
  await page.goto('/inloggen');
  await page.getByRole('button', { name: 'Bekijk de demo' }).click();
  await expect(page).toHaveURL(/\/week$/);
}

async function ensureWeek(page: Page): Promise<void> {
  await page.goto('/week');
  const generate = page.getByRole('button', { name: /^Maak mijn week$/ });
  if ((await generate.count()) > 0) await generate.click();
  await expect(page.getByRole('heading', { name: 'Mijn week' })).toBeVisible({ timeout: 180_000 });
}

async function weekIds(page: Page): Promise<string[]> {
  const cards = page.locator('li[data-recipe-id]');
  await expect(cards).toHaveCount(7, { timeout: 180_000 });
  return cards.evaluateAll((nodes) => nodes.map((n) => n.getAttribute('data-recipe-id') ?? ''));
}

test.describe('impatient use', () => {
  test.describe.configure({ timeout: 900_000 });

  test('a double tap on "maak mijn week" does not make two weeks', async ({ page }) => {
    await signIn(page);
    await page.goto('/week/instellingen');
    // Located by attribute rather than by label: the label changes to
    // "Week samenstellen…" while the work runs, which is exactly the moment
    // this test is about.
    const button = page.locator('button[data-action="generate-week"]').first();

    // Two taps as fast as a thumb manages. The button must disable itself on
    // the first, or the second request races the first and the shopping list
    // can end up belonging to a different set of recipes than the menu.
    await button.click();
    await expect(button).toBeDisabled();
    await button.click({ force: true, timeout: 5_000 }).catch(() => {
      /* disabled, which is the point */
    });

    await expect(page.getByRole('heading', { name: 'Mijn week' })).toBeVisible({
      timeout: 180_000,
    });
    const ids = await weekIds(page);

    // One week, and the list matches it.
    await page.goto('/boodschappen');
    const lines = page.locator('li[data-item-key]');
    expect(await lines.count()).toBeGreaterThan(0);
    await page.goto('/week');
    expect(await weekIds(page)).toEqual(ids);
  });

  test('a double tap on "andere week" gives one new week, not two', async ({ page }) => {
    await signIn(page);
    await ensureWeek(page);
    const before = await weekIds(page);

    const button = page.locator('button[data-action="regenerate-week"]');
    await button.click();
    await expect(button).toBeDisabled();
    await button.click({ force: true, timeout: 5_000 }).catch(() => {});
    await expect(button).toBeEnabled({ timeout: 180_000 });

    const after = await weekIds(page);
    expect(after).not.toEqual(before);
    await page.reload();
    expect(await weekIds(page)).toEqual(after);
  });

  test('back and forward keep the week, and never regenerate it', async ({ page }) => {
    await signIn(page);
    await ensureWeek(page);
    const ids = await weekIds(page);

    await page.locator('li[data-recipe-id] a').first().click();
    await expect(page).toHaveURL(/\/week\/\d$/);
    await page.goBack();
    await expect(page).toHaveURL(/\/week$/);
    expect(await weekIds(page)).toEqual(ids);

    await page.goto('/boodschappen');
    await page.goBack();
    await page.goForward();
    await expect(page.getByRole('heading', { name: 'Boodschappen' })).toBeVisible();

    await page.goto('/week');
    expect(await weekIds(page)).toEqual(ids);
  });

  test('a reload anywhere in the flow lands somewhere sensible', async ({ page }) => {
    await signIn(page);
    await ensureWeek(page);

    for (const path of ['/week', '/week/3', '/boodschappen', '/winkels']) {
      await page.goto(path);
      const before = (await page.locator('main').innerText()).replace(/\s+/g, ' ').slice(0, 120);
      const response = await page.reload();
      expect(response?.status(), `${path} gaf ${response?.status()}`).toBeLessThan(400);
      const after = (await page.locator('main').innerText()).replace(/\s+/g, ' ').slice(0, 120);
      expect(after, `${path} ziet er na herladen anders uit`).toBe(before);
    }
  });

  test('every control the user can reach has a name and a visible focus ring', async ({ page }) => {
    await signIn(page);
    await ensureWeek(page);

    for (const path of ['/week', '/boodschappen', '/week/instellingen', '/gezin/voorkeuren']) {
      await page.goto(path);

      // A control nobody can name is a control a screen reader cannot announce.
      const nameless = await page
        .locator('main button:visible, main a:visible, main input:visible')
        .evaluateAll((nodes) =>
          nodes
            .filter((node) => {
              const label =
                node.getAttribute('aria-label') ??
                node.getAttribute('title') ??
                (node as HTMLElement).innerText ??
                '';
              if (label.trim() !== '') return false;
              const id = node.getAttribute('id');
              if (id && document.querySelector(`label[for="${id}"]`)) return false;
              return !node.closest('label');
            })
            .map((node) => `${node.tagName.toLowerCase()}#${node.getAttribute('id') ?? '?'}`),
        );
      expect(nameless, `${path} heeft naamloze bedieningselementen`).toEqual([]);

      // Exactly one main landmark, so "skip to content" means something.
      expect(await page.locator('main').count(), path).toBe(1);

      const focused = await page.evaluate(() => {
        const first = document.querySelector<HTMLElement>('main button, main a, main input');
        if (!first) return null;
        first.focus();
        const style = getComputedStyle(first);
        return { outline: style.outlineStyle, width: style.outlineWidth, shadow: style.boxShadow };
      });
      if (focused) {
        const visible =
          (focused.outline !== 'none' && focused.width !== '0px') ||
          (focused.shadow !== 'none' && focused.shadow !== '');
        expect(visible, `${path}: focus is niet te zien`).toBe(true);
      }
    }
  });
});
