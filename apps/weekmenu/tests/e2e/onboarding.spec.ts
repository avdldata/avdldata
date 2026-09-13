import { expect, test } from '@playwright/test';

/** A brand new account walks through onboarding and lands on a planned week. */
test('a new household can onboard and generate its first week', async ({ page }) => {
  const email = `speler-${Date.now()}@voorbeeld.nl`;

  await page.goto('/registreren');
  await page.getByLabel('E-mailadres').fill(email);
  await page.getByLabel('Wachtwoord').fill('weekmenu123');
  await page.getByRole('button', { name: 'Account aanmaken' }).click();

  // Step 1 — household and location
  await expect(page.getByRole('heading', { name: 'Waar kook je voor?' })).toBeVisible();
  await page.getByLabel('Naam van je huishouden').fill('Testhuishouden');
  await page.getByLabel('Postcode').fill('9711 LM');
  await page.getByRole('button', { name: 'Verder' }).click();

  // Step 2 — two members, one of them pregnant
  await expect(page.getByRole('heading', { name: 'Wie eten er mee?' })).toBeVisible();
  await page.getByLabel('Naam').fill('Arjan');
  await page.getByLabel('Leeftijd').fill('38');
  await page.getByLabel('Geslacht').selectOption('man');
  await page.getByLabel('Lengte (cm)').fill('175');
  await page.getByLabel('Gewicht (kg)').fill('87');
  await page.getByRole('button', { name: 'Toevoegen' }).click();

  await page.getByRole('button', { name: 'Nog iemand toevoegen' }).click();
  await page.getByLabel('Naam').fill('Chimene');
  await page.getByLabel('Leeftijd').fill('34');
  await page.getByLabel('Geslacht').selectOption('vrouw');
  await page.getByLabel('Lengte (cm)').fill('182');
  await page.getByLabel('Gewicht (kg)').fill('74');
  await page.getByRole('checkbox', { name: /Zwanger/ }).check();
  await page.getByLabel('Trimester').selectOption('2');
  await page.getByRole('button', { name: 'Toevoegen' }).click();

  await expect(page.getByText('Arjan', { exact: true })).toBeVisible();
  await expect(page.getByText('Chimene', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Verder' }).click();

  // Step 3 — preferences may be left neutral
  await expect(page.getByRole('heading', { name: 'Wat eten jullie graag?' })).toBeVisible();
  await page.getByRole('button', { name: 'Verder' }).click();

  // Step 4 — nearby supermarkets, priority chains pre-selected
  await expect(
    page.getByRole('heading', { name: /Supermarkten bij jou in de buurt/ }),
  ).toBeVisible();
  expect(await page.getByRole('checkbox', { checked: true }).count()).toBeGreaterThanOrEqual(2);
  await page.getByRole('button', { name: 'Klaar' }).click();

  // Week settings, then the first week
  await expect(page).toHaveURL(/\/week\/instellingen$/, { timeout: 60_000 });
  await page.getByRole('button', { name: /^Maak mijn week$/ }).click();
  await expect(page.getByRole('heading', { name: 'Mijn week' })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('heading', { level: 3 })).toHaveCount(7);

  // Pregnancy safety holds for this brand new household too.
  await expect(page.getByText(/geschikt tijdens de zwangerschap/i)).toBeVisible();
});
