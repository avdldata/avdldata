import { expect, test, type Page } from '@playwright/test';

/**
 * The app on a phone, which is where it is actually used.
 *
 * Planning happens at the kitchen table and the shopping list is read
 * one-handed in a shop, so "works on mobile" is not a nice-to-have here — it is
 * the primary case. Three widths, because the difference between a small iPhone
 * and a large one is exactly where layouts break.
 *
 * The check that matters most is horizontal overflow: nothing is more broken on
 * a phone than a page that slides sideways, and it is invisible on a desktop
 * viewport.
 */
const WIDTHS = [375, 390, 430] as const;

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

/** How far the page can be scrolled sideways. Anything above zero is a bug. */
async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

test.describe('on a phone', () => {
  test.describe.configure({ timeout: 900_000 });

  for (const width of WIDTHS) {
    test(`${width} px — every screen of the core flow fits`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await signIn(page);
      await ensureWeek(page);

      const screens = [
        '/week',
        '/week/0',
        '/week/0/vervangen',
        '/boodschappen',
        '/winkels',
        '/gezin',
        '/gezin/voorkeuren',
        '/week/instellingen',
        '/instellingen',
      ];

      for (const path of screens) {
        await page.goto(path);
        await expect(page.locator('main')).toBeVisible({ timeout: 120_000 });
        expect(await horizontalOverflow(page), `${path} scrolt zijwaarts`).toBeLessThanOrEqual(1);

        // Every button the page offers has to be reachable, not cut off.
        const buttons = page.locator('main button:visible, main a:visible');
        const count = Math.min(await buttons.count(), 12);
        for (let i = 0; i < count; i += 1) {
          const box = await buttons.nth(i).boundingBox();
          if (!box) continue;
          expect(box.x, `${path}: knop begint buiten beeld`).toBeGreaterThanOrEqual(-1);
          expect(
            box.x + box.width,
            `${path}: knop loopt buiten beeld (${Math.round(box.x + box.width)} > ${width})`,
          ).toBeLessThanOrEqual(width + 1);
        }
      }
    });
  }

  test('1440 px — the phone fixes did not cost the desktop anything', async ({ page }) => {
    // Everything that made the layout survive a 375 px screen — wrapping
    // labels, stacked buttons, generous tap targets — can look wrong on a wide
    // one. This is the counter-check: same screens, desktop width.
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page);
    await ensureWeek(page);

    for (const path of ['/week', '/week/0', '/boodschappen', '/winkels', '/gezin']) {
      await page.goto(path);
      await expect(page.locator('main')).toBeVisible();
      expect(await horizontalOverflow(page), `${path} scrolt zijwaarts`).toBeLessThanOrEqual(1);

      // No two buttons sitting on top of each other.
      const boxes = await page.locator('main button:visible').evaluateAll((nodes) =>
        nodes.map((node) => {
          const r = node.getBoundingClientRect();
          return { x: r.x, y: r.y, w: r.width, h: r.height, label: node.textContent?.trim() ?? '' };
        }),
      );
      for (let i = 0; i < boxes.length; i += 1) {
        for (let j = i + 1; j < boxes.length; j += 1) {
          const a = boxes[i]!;
          const b = boxes[j]!;
          const overlaps = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
          expect(overlaps, `${path}: "${a.label}" en "${b.label}" overlappen`).toBe(false);
        }
      }

      // And the content is not a thin ribbon in the middle of a wide screen.
      const main = await page.locator('main').boundingBox();
      expect(main!.width, `${path}: hoofdkolom is maar ${main!.width} px`).toBeGreaterThan(500);
    }
  });

  test('390 px — the whole week, end to end, and the ticks survive a reload', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page);

    // Generate.
    await page.goto('/week');
    const generate = page.getByRole('button', { name: /^Maak mijn week$/ });
    if ((await generate.count()) > 0) await generate.click();
    await expect(page.getByRole('heading', { name: 'Mijn week' })).toBeVisible({
      timeout: 180_000,
    });

    // A recipe.
    await page.locator('li[data-recipe-id] a').first().click();
    await expect(page).toHaveURL(/\/week\/\d$/);
    await expect(page.locator('ol > li').first()).toBeVisible();

    // Replace it.
    await page
      .getByRole('link', { name: /Vervang/i })
      .first()
      .click();
    await expect(page).toHaveURL(/vervangen$/);
    const choose = page.getByRole('button', { name: /Kies dit gerecht|Vervang/i }).first();
    await expect(choose).toBeVisible({ timeout: 180_000 });
    await choose.click();
    await expect(page).toHaveURL(/\/week(\/\d)?$/, { timeout: 180_000 });

    // Shop.
    await page.goto('/boodschappen');
    const box = page.locator('input[type=checkbox]').first();
    await expect(box).toBeVisible();

    // A tap target you can hit while holding a basket.
    const size = await box.boundingBox();
    expect(size!.height).toBeGreaterThanOrEqual(20);
    // The label around it is the real target, and it is comfortably large.
    const row = await page.locator('li[data-item-key] label').first().boundingBox();
    expect(row!.height).toBeGreaterThanOrEqual(44);

    await box.check();
    await expect(page.locator('input[type=checkbox]:checked')).toHaveCount(1);
    await page.reload();
    await expect(page.locator('input[type=checkbox]:checked')).toHaveCount(1);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
  });
});
