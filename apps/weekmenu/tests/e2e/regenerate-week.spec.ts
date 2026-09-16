import { expect, test, type Page } from '@playwright/test';

/**
 * "Maak een andere week" has to actually give another week.
 *
 * This is the behaviour that matters most to someone who does not like the menu
 * they were handed, and it is the behaviour that was broken: the button called
 * the same generator with the same inputs and the optimizer, correctly, gave
 * the same answer back. A button that visibly does nothing is worse than no
 * button.
 *
 * So the test drives the real one — ten presses, through the browser, reading
 * the dishes off the page — and asserts that no press returns the week that was
 * already on screen. Ten is chosen because the library holds roughly seventeen
 * weeks of dinners, so it exercises the mechanism well short of running out.
 */
const PRESSES = 10;

async function openDemoWeek(page: Page): Promise<void> {
  await page.goto('/inloggen');
  await page.getByRole('button', { name: 'Bekijk de demo' }).click();
  await expect(page).toHaveURL(/\/week$/);
  const generate = page.getByRole('button', { name: /^Maak mijn week$/ });
  if ((await generate.count()) > 0) await generate.click();
  await expect(page.getByRole('heading', { name: 'Mijn week' })).toBeVisible({ timeout: 90_000 });
}

/** The seven dishes currently on the page, by recipe id. */
async function currentWeek(page: Page): Promise<string[]> {
  const cards = page.locator('li[data-recipe-id]');
  await expect(cards).toHaveCount(7, { timeout: 90_000 });
  const ids = await cards.evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute('data-recipe-id') ?? ''),
  );
  expect(ids.every((id) => id !== '')).toBe(true);
  return ids;
}

test.describe('asking for a different week', () => {
  test('gives a different menu on every press', async ({ page }) => {
    await openDemoWeek(page);

    let previous = await currentWeek(page);
    const first = [...previous];
    let identical = 0;
    let changed = 0;

    for (let press = 1; press <= PRESSES; press += 1) {
      await page.getByRole('button', { name: /Maak een andere week/ }).click();
      await expect(page.getByRole('button', { name: /Maak een andere week/ })).toBeEnabled({
        timeout: 90_000,
      });
      const next = await currentWeek(page);

      const sameSet = [...next].sort().join('|') === [...previous].sort().join('|');
      if (sameSet) identical += 1;
      changed += next.filter((id) => !previous.includes(id)).length;

      expect(sameSet, `druk ${press} gaf exact dezelfde week terug`).toBe(false);
      previous = next;
    }

    // Not a single press may hand back the week that was already on screen, and
    // over ten presses the menu has to move substantially rather than swapping
    // one dish for one other.
    expect(identical).toBe(0);
    expect(changed / PRESSES).toBeGreaterThanOrEqual(3);

    // And after ten presses the user is nowhere near where they started.
    expect([...previous].sort().join('|')).not.toBe([...first].sort().join('|'));
  });

  test('plain "maak mijn week" stays deterministic', async ({ page }) => {
    /*
     * The counterpart to the test above: regeneration varies because the
     * question changes, not because the engine became unpredictable. A fresh
     * week for an unchanged household must still be reproducible.
     *
     * Both weeks are generated inside this test rather than read from whatever
     * the previous one left behind — after ten presses of "andere week" the
     * stored plan is deliberately nowhere near the optimum, so comparing
     * against it would prove the opposite of what this test is for.
     */
    await openDemoWeek(page);

    const freshWeek = async (): Promise<string[]> => {
      await page.goto('/week/instellingen');
      await page.getByRole('button', { name: /^Maak mijn week$/ }).click();
      await expect(page).toHaveURL(/\/week$/, { timeout: 90_000 });
      return currentWeek(page);
    };

    expect(await freshWeek()).toEqual(await freshWeek());
  });
});
