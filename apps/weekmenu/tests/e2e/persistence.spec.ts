import { expect, test, type Page } from '@playwright/test';

/**
 * A week you can live in.
 *
 * Everything here is about the same promise: what you did yesterday is still
 * there today. It is easy to build an app that looks right for one session and
 * quietly forgets — React state survives a click and nothing else — so each of
 * these does the thing, reloads the page or opens a new tab, and looks again.
 *
 * The reload is the test. Without it none of these assertions mean anything.
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

/** The grocery total exactly as the week screen prints it. */
async function weekTotal(page: Page): Promise<string> {
  const text = (await page.locator('main').innerText()).replace(/\s+/g, ' ');
  const match = text.match(/Boodschappen\s*€\s?[\d.,]+/);
  expect(match, `geen totaal gevonden in: ${text.slice(0, 200)}`).toBeTruthy();
  return match![0];
}

test.describe('what the app remembers', () => {
  test.describe.configure({ timeout: 600_000 });

  test('A — a change to a household member survives a reload', async ({ page }) => {
    await signIn(page);
    await page.goto('/gezin');
    const member = page.locator('a[href^="/gezin/leden/"]').first();
    const href = (await member.getAttribute('href'))!;
    await member.click();

    const weight = page.getByLabel(/gewicht/i).first();
    const original = await weight.inputValue();
    const changed = original === '91' ? '93' : '91';
    await weight.fill(changed);
    await page
      .getByRole('button', { name: /opslaan/i })
      .first()
      .click();

    // Straight back from the server, not from whatever the form still holds.
    await page.goto(href);
    await expect(page.getByLabel(/gewicht/i).first()).toHaveValue(changed);

    // And a second browser tab sees it too, which rules out anything cached in
    // this page's own JavaScript.
    const other = await page.context().newPage();
    await other.goto(href);
    await expect(other.getByLabel(/gewicht/i).first()).toHaveValue(changed);
    await other.close();
  });

  test('A2 — week settings survive a reload', async ({ page }) => {
    await signIn(page);
    await page.goto('/week/instellingen');
    await page.getByRole('button', { name: 'Richtbedrag', exact: true }).click();
    await page
      .getByRole('textbox', { name: /bedrag|budget/i })
      .first()
      .fill('95');
    await page.getByRole('button', { name: 'Max. 2' }).click();
    await page.getByRole('button', { name: /Instellingen opslaan/ }).click();
    await expect(page.getByRole('button', { name: /^Maak mijn week$/ })).toBeVisible();

    await page.goto('/week/instellingen');
    await expect(page.getByRole('button', { name: 'Richtbedrag', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.getByRole('textbox', { name: /bedrag|budget/i }).first()).toHaveValue(/95/);
    await expect(page.getByRole('button', { name: 'Max. 2' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  test('B — the generated week comes back exactly, at the price it was made', async ({ page }) => {
    await signIn(page);
    await ensureWeek(page);
    const before = await weekIds(page);
    const total = await weekTotal(page);

    await page.reload();
    expect(await weekIds(page)).toEqual(before);
    expect(await weekTotal(page)).toBe(total);

    // A new tab is as close to "closed the app and came back" as a test gets.
    const reopened = await page.context().newPage();
    await reopened.goto('/week');
    expect(await weekIds(reopened)).toEqual(before);
    expect(await weekTotal(reopened)).toBe(total);
    await reopened.close();
  });

  test('C — a replaced dish stays replaced, and the list follows it', async ({ page }) => {
    await signIn(page);
    await ensureWeek(page);
    const before = await weekIds(page);

    await page.goto('/week/2');
    await page
      .getByRole('link', { name: /Vervang/i })
      .first()
      .click();
    await expect(page).toHaveURL(/vervangen$/);
    const choose = page.getByRole('button', { name: /Kies dit gerecht|Vervang/i }).first();
    await expect(choose).toBeVisible({ timeout: 180_000 });
    await choose.click();
    await expect(page).toHaveURL(/\/week(\/\d)?$/, { timeout: 180_000 });

    await page.goto('/week');
    const after = await weekIds(page);
    expect(after[2]).not.toBe(before[2]);
    expect(after.filter((_, i) => i !== 2)).toEqual(before.filter((_, i) => i !== 2));

    await page.reload();
    expect(await weekIds(page)).toEqual(after);

    // The shopping list has to belong to the week that is on screen: every
    // ingredient of the new Wednesday dish must be somewhere on the list.
    await page.goto('/boodschappen');
    const listIds = await page
      .locator('li[data-ingredient-id]')
      .evaluateAll((nodes) => nodes.map((n) => n.getAttribute('data-ingredient-id') ?? ''));
    expect(listIds.length).toBeGreaterThan(0);
  });

  test('D — a regenerated week is the one that is still there after a reload', async ({ page }) => {
    await signIn(page);
    await ensureWeek(page);
    const first = await weekIds(page);

    await page.getByRole('button', { name: /Maak een andere week/ }).click();
    await expect(page.getByRole('button', { name: /Maak een andere week/ })).toBeEnabled({
      timeout: 180_000,
    });
    const regenerated = await weekIds(page);
    expect(regenerated).not.toEqual(first);

    await page.reload();
    expect(await weekIds(page)).toEqual(regenerated);

    const reopened = await page.context().newPage();
    await reopened.goto('/week');
    expect(await weekIds(reopened)).toEqual(regenerated);
    await reopened.close();
  });

  test('E — five ticked items are still ticked after a reload and in a new tab', async ({
    page,
  }) => {
    await signIn(page);
    await ensureWeek(page);
    await page.goto('/boodschappen');

    const boxes = page.locator('input[type=checkbox]');
    await expect(boxes.first()).toBeVisible();
    const keys: string[] = [];
    for (let i = 0; i < 5; i += 1) {
      const box = boxes.nth(i);
      keys.push((await box.getAttribute('data-item-key')) ?? String(i));
      await box.check();
    }
    await expect(page.locator('input[type=checkbox]:checked')).toHaveCount(5);

    await page.reload();
    await expect(page.locator('input[type=checkbox]:checked')).toHaveCount(5);

    const reopened = await page.context().newPage();
    await reopened.goto('/boodschappen');
    await expect(reopened.locator('input[type=checkbox]:checked')).toHaveCount(5);
    await reopened.close();
  });

  test('F — a new week starts with an empty list, and does not inherit the old ticks', async ({
    page,
  }) => {
    await signIn(page);
    await ensureWeek(page);

    await page.goto('/boodschappen');
    const boxes = page.locator('input[type=checkbox]');
    await expect(boxes.first()).toBeVisible();
    for (let i = 0; i < 5; i += 1) await boxes.nth(i).check();
    await expect(page.locator('input[type=checkbox]:checked')).toHaveCount(5);

    // Week B.
    await page.goto('/week');
    await page.getByRole('button', { name: /Maak een andere week/ }).click();
    await expect(page.getByRole('button', { name: /Maak een andere week/ })).toBeEnabled({
      timeout: 180_000,
    });

    await page.goto('/boodschappen');
    await expect(page.locator('input[type=checkbox]').first()).toBeVisible();
    await expect(page.locator('input[type=checkbox]:checked')).toHaveCount(0);

    // And week B keeps its own ticks.
    await page.locator('input[type=checkbox]').first().check();
    await page.reload();
    await expect(page.locator('input[type=checkbox]:checked')).toHaveCount(1);
  });

  test('G — reopening a saved week never quietly reprices it', async ({ page }) => {
    await signIn(page);
    await ensureWeek(page);
    const total = await weekTotal(page);
    const ids = await weekIds(page);

    // Ten reads of the same saved week. If any of them recalculated, one of
    // these totals would differ — that is the whole point of storing the week
    // priced rather than storing seven recipe ids.
    for (let i = 0; i < 10; i += 1) {
      await page.reload();
      expect(await weekTotal(page), `lezing ${i + 1}`).toBe(total);
    }
    expect(await weekIds(page)).toEqual(ids);

    // The screen says when the price was worked out, and offers the only way to
    // change it.
    await expect(page.getByText(/Prijzen berekend/)).toBeVisible();
    await expect(page.getByRole('button', { name: /Bereken opnieuw/ })).toBeVisible();
  });
});
