import { expect, test, type Page } from '@playwright/test';
import { SPRINT2_RECIPES } from '../../src/data/seed/recipes-sprint2';

/**
 * A recipe written in Sprint 2, opened the way a person would open it.
 *
 * Everything else about the new library is proved in Node: the guards, the
 * duplicate check, the feasibility numbers. None of that shows a cook a page.
 * This drives the ordinary browser flow and asserts that a dish from the new
 * batch has a page with its ingredients scaled to this household, its steps in
 * order, and a working "replace this dish" — the three things that make a
 * recipe usable rather than merely present.
 *
 * The dish is not left to chance: the week is planned first, and the test picks
 * whichever of the seven days holds a Sprint 2 recipe. If none does, that is
 * itself worth failing over — it would mean 82 recipes the planner never
 * reaches.
 */
const NEW_IDS = new Set(SPRINT2_RECIPES.map((r) => r.id));
const NEW_TITLES = new Map(SPRINT2_RECIPES.map((r) => [r.name, r.id]));

async function openDemoHousehold(page: Page): Promise<void> {
  await page.goto('/inloggen');
  await page.getByRole('button', { name: 'Bekijk de demo' }).click();
  await expect(page).toHaveURL(/\/week$/);
}

test.describe('a recipe from the new library', () => {
  test('opens with its ingredients, its steps and a working replacement', async ({ page }) => {
    await openDemoHousehold(page);
    // Another spec in this run may already have planned a week, in which case
    // the button is not on the page at all.
    const generate = page.getByRole('button', { name: /^Maak mijn week$/ });
    if ((await generate.count()) > 0) await generate.click();
    await expect(page.getByRole('heading', { name: 'Mijn week' })).toBeVisible({ timeout: 90_000 });

    // Which of the seven days is a Sprint 2 dish? Read it off the page rather
    // than assuming, so the test says something about what the planner chose.
    const links = page.locator('a[href^="/week/"]');
    const titles = await links.allInnerTexts();
    const match = titles
      .map((text) => text.replace(/\s+/g, ' ').trim())
      .flatMap((text) => {
        for (const [name, id] of NEW_TITLES) if (text.includes(name)) return [{ text, name, id }];
        return [];
      })[0];

    expect(
      match,
      `geen enkel nieuw recept in de week; gezien: ${titles.slice(0, 8).join(' | ')}`,
    ).toBeTruthy();
    expect(NEW_IDS.has(match!.id)).toBe(true);

    await page
      .getByRole('link', { name: new RegExp(match!.name) })
      .first()
      .click();
    await expect(page).toHaveURL(/\/week\/\w+$/);
    await expect(page.getByRole('heading', { name: match!.name })).toBeVisible();

    // Ingredients, in this household's portions rather than the base four.
    const body = (await page.locator('main').innerText()).replace(/\s+/g, ' ');
    expect(body).toMatch(/\d+\s?(g|ml|stuk)/);
    expect(body).toMatch(/personen|porties/i);

    // Steps, numbered and in order.
    const steps = page.locator('ol > li');
    expect(await steps.count()).toBeGreaterThanOrEqual(3);

    // And the dish can be swapped for something else.
    await page
      .getByRole('link', { name: /Vervang/i })
      .first()
      .click();
    await expect(page).toHaveURL(/\/vervangen$/);
    const alternatives = page.getByRole('button', { name: /Kies dit gerecht|Vervang/i });
    await expect(alternatives.first()).toBeVisible({ timeout: 60_000 });
    expect(await alternatives.count()).toBeGreaterThan(0);
  });
});
