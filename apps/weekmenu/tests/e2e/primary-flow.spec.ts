import { expect, test, type Page } from '@playwright/test';

/**
 * The primary flow, end to end, exactly as the acceptance criteria describe it:
 * sign in, plan a week, get seven dishes with per-person portions, get a costed
 * shopping list built from real packages, compare supermarkets, swap one dish
 * and see the whole week recalculated.
 */

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

/** Read a "€ 12,34" string as integer cents. */
function euroToCents(text: string): number {
  const match = text.match(/(\d{1,3}(?:\.\d{3})*),(\d{2})/);
  if (!match) throw new Error(`Geen bedrag gevonden in "${text}"`);
  return Number(match[1]!.replace(/\./g, '')) * 100 + Number(match[2]);
}

test.describe('demo household', () => {
  test('plans a week, prices it and lets you swap a dish', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));

    await openDemo(page);
    await ensureWeek(page);

    // Seven different dinners, one per weekday.
    await expect(page.getByRole('heading', { level: 3 })).toHaveCount(7);
    for (const weekday of [
      'Maandag',
      'Dinsdag',
      'Woensdag',
      'Donderdag',
      'Vrijdag',
      'Zaterdag',
      'Zondag',
    ]) {
      await expect(page.getByText(weekday, { exact: true })).toBeVisible();
    }

    // Each member gets their own portion.
    await expect(page.getByText(/Arjan · \d,\d\d portie/).first()).toBeVisible();
    await expect(page.getByText(/Chimene · \d,\d\d portie/).first()).toBeVisible();

    const totalBefore = euroToCents(
      await page
        .getByText(/€\s?\d+,\d\d/)
        .first()
        .innerText(),
    );
    expect(totalBefore).toBeGreaterThan(1000);

    // The plan explains itself, and honours the pregnancy in the household.
    await expect(page.getByRole('heading', { name: 'Waarom deze week?' })).toBeVisible();
    await expect(page.getByText(/geschikt tijdens de zwangerschap/i)).toBeVisible();

    expect(errors).toEqual([]);
  });

  test('produces a shopping list of real packages that can be ticked off', async ({ page }) => {
    await openDemo(page);
    await ensureWeek(page);

    await page.getByRole('link', { name: 'Boodschappen' }).click();
    await expect(page.getByRole('heading', { name: 'Boodschappen' })).toBeVisible();

    // Real pack sizes and brands, not just an ingredient name.
    await expect(page.getByText(/per verpakking/).first()).toBeVisible();
    await expect(page.getByText(/huismerk/).first()).toBeVisible();

    const checkboxes = page.getByRole('checkbox');
    expect(await checkboxes.count()).toBeGreaterThan(10);

    // A tick survives a reload, because the week is re-priced but the choice is stored.
    await checkboxes.first().check();
    await expect(checkboxes.first()).toBeChecked();
    await page.waitForTimeout(600);
    await page.reload();
    await expect(page.getByRole('checkbox').first()).toBeChecked();
  });

  test('compares supermarkets with groceries and travel kept apart', async ({ page }) => {
    await openDemo(page);
    await ensureWeek(page);

    await page.goto('/winkels');
    await expect(page.getByRole('heading', { name: /Waar haal je de boodschappen/ })).toBeVisible();
    await expect(page.getByText('Ons advies')).toBeVisible();
    await expect(page.getByText('Reiskosten').first()).toBeVisible();
    await expect(page.getByText(/Praktisch totaal/).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Waarom deze verdeling?' })).toBeVisible();
  });

  test('shows a dish in detail, including reuse and where the nutrition came from', async ({
    page,
  }) => {
    await openDemo(page);
    await ensureWeek(page);

    await page.goto('/week/2');
    await expect(page.getByText('Porties per persoon')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Ingrediënten' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Zo maak je het' })).toBeVisible();
    await expect(
      page.getByText(/Berekend uit de voedingswaarden van de losse ingrediënten/),
    ).toBeVisible();
  });

  test('replaces one dish and recalculates the entire week', async ({ page }) => {
    await openDemo(page);
    await ensureWeek(page);

    await page.goto('/week/2');
    const originalDish = await page.locator('h1').innerText();

    await page.getByRole('link', { name: 'Vervang dit gerecht' }).click();
    await expect(page.getByRole('heading', { name: /Ander gerecht op woensdag/i })).toBeVisible();

    const firstAlternative = page.getByRole('button', { name: 'Kies dit gerecht' }).first();
    await expect(firstAlternative).toBeVisible({ timeout: 60_000 });
    // Alternatives are priced as complete weeks, so each carries a real delta.
    await expect(page.getByText(/[+−] €|zelfde prijs/).first()).toBeVisible();
    await firstAlternative.click();

    await expect(page).toHaveURL(/\/week\/2$/, { timeout: 60_000 });
    await expect(page.locator('h1')).not.toHaveText(originalDish);

    await page.goto('/week');
    await expect(page.getByRole('heading', { level: 3 })).toHaveCount(7);
    const totalAfter = euroToCents(
      await page
        .getByText(/€\s?\d+,\d\d/)
        .first()
        .innerText(),
    );
    expect(totalAfter).toBeGreaterThan(1000);
  });

  test('respects a maximum of one supermarket', async ({ page }) => {
    await openDemo(page);

    await page.goto('/week/instellingen');
    await page.getByRole('button', { name: '1 winkel' }).click();
    await page.getByRole('button', { name: 'Instellingen opslaan' }).click();
    await expect(page.getByText('Instellingen opgeslagen.')).toBeVisible();

    await page.getByRole('button', { name: /^Maak mijn week$/ }).click();
    await expect(page).toHaveURL(/\/week$/, { timeout: 60_000 });
    await expect(page.getByRole('heading', { name: 'Mijn week' })).toBeVisible();

    await page.goto('/winkels');
    // With one store allowed, no option may combine two chains.
    await expect(page.getByText(/ \+ /)).toHaveCount(0);
  });
});
