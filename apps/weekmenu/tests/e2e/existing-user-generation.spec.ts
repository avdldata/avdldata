import { expect, test } from '@playwright/test';
import { EXISTING_EMAIL, EXISTING_PASSWORD } from '../support/existing-household';

test('ALPHA-003 — unchanged existing account generates seven REAL meals that survive refresh', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/inloggen');
  await page.getByLabel('E-mailadres').fill(EXISTING_EMAIL);
  await page.getByLabel('Wachtwoord', { exact: true }).fill(EXISTING_PASSWORD);
  await page.getByRole('button', { name: 'Inloggen', exact: true }).click();
  await expect(page).toHaveURL(/\/week$/);
  await page.goto('/week/instellingen');
  // Inspect the saved settings without saving/resetting anything.
  await expect(page.getByRole('button', { name: 'Max. 2', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: 'Maak mijn week', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Mijn week', exact: true })).toBeVisible();
  const meals = page.locator('[data-recipe-id]');
  await expect(meals).toHaveCount(7);
  await expect(page.getByText('Echte prijsdata', { exact: false }).first()).toBeVisible();
  const ids = await meals.evaluateAll((nodes) =>
    nodes.map((n) => n.getAttribute('data-recipe-id')),
  );
  await page.reload();
  await expect(meals).toHaveCount(7);
  expect(
    await meals.evaluateAll((nodes) => nodes.map((n) => n.getAttribute('data-recipe-id'))),
  ).toEqual(ids);
  await page.goto('/boodschappen');
  await expect(page.getByText(/per verpakking/).first()).toBeVisible();
  expect(await page.locator('li[data-ingredient-id]').count()).toBeGreaterThan(0);
  expect(await page.locator('body').innerText()).not.toMatch(/demo-data|niet verkrijgbaar/i);
  expect(errors).toEqual([]);
});
