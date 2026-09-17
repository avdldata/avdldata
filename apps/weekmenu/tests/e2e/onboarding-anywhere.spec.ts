import { expect, test, type Page } from '@playwright/test';

/**
 * ALPHA-001: onboarding buiten Groningen.
 *
 * The store step used to ask which *branch* you shop at, and the branches come
 * from the seed — twelve of them, all in and around Groningen. Enter a postcode
 * anywhere else and the list was empty, "Klaar" stayed disabled, and the app
 * could not be finished at all. The release acceptance missed it because it
 * onboarded with 9711 LM, which is in Groningen.
 *
 * So this test onboards from Amsterdam, and would fail on the old build for the
 * same reason a person in Amsterdam could not use the app. It never mentions a
 * branch, a radius or a kilometre.
 */
const FAR_FROM_THE_SEED = { postalCode: '1012 AB', houseNumber: '5' };

async function register(page: Page): Promise<void> {
  page.setDefaultTimeout(30_000);
  await page.goto('/registreren');
  await page.getByLabel('E-mailadres').fill(`alpha001-${Date.now()}@voorbeeld.nl`);
  await page.getByLabel('Wachtwoord').fill('eenlangwachtwoord');
  await page.getByRole('button', { name: 'Account aanmaken' }).click();
  await expect(page).toHaveURL(/\/onboarding$/, { timeout: 60_000 });
}

/** Household and one member, to reach the supermarket step. */
async function upToTheStoreStep(page: Page): Promise<void> {
  await page.getByLabel('Naam van je huishouden').fill('Ver van de seed');
  await page.getByLabel('Postcode').fill(FAR_FROM_THE_SEED.postalCode);
  await page.getByLabel('Huisnr.').fill(FAR_FROM_THE_SEED.houseNumber);
  await page.getByRole('button', { name: 'Verder' }).click();

  await expect(page.getByRole('heading', { name: 'Wie eten er mee?' })).toBeVisible();
  await page.getByLabel('Naam').fill('Pim');
  await page.getByLabel('Leeftijd').fill('39');
  await page.getByLabel('Lengte (cm)').fill('180');
  await page.getByLabel('Gewicht (kg)').fill('80');
  await page.getByRole('button', { name: 'Toevoegen', exact: true }).click();
  await page.getByRole('button', { name: 'Verder' }).click();

  await expect(page.getByRole('heading', { name: 'Wat eten jullie graag?' })).toBeVisible();
  await page.getByRole('button', { name: 'Verder' }).click();
  await expect(
    page.getByRole('heading', { name: 'Welke supermarkten wil je meenemen?' }),
  ).toBeVisible();
}

test.describe('ALPHA-001 — onboarden kan overal', () => {
  test.describe.configure({ timeout: 900_000 });

  test('de drie ketens staan er, ongeacht waar je woont', async ({ page }) => {
    await register(page);
    await upToTheStoreStep(page);

    const boxes = page.locator('input[type=checkbox][data-chain-id]');
    await expect(boxes).toHaveCount(3);
    const chains = await boxes.evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute('data-chain-id') ?? ''),
    );
    expect([...chains].sort()).toEqual(['ah', 'jumbo', 'lidl']);

    const main = (await page.locator('main, body').first().innerText()).replace(/\s+/g, ' ');
    expect(main, 'de radiuskeuze staat er nog').not.toMatch(/\d+ km/);
    expect(main, 'de oude lege staat staat er nog').not.toMatch(/Geen supermarkten binnen/);
    expect(main, 'afstand op een scherm dat hem niet kent').not.toMatch(/\d+[.,]\d+ km|Zoekgebied/);
    // Exactly this sentence, not "something with the word travel in it": a
    // loose alternation would pass on copy that says nothing.
    expect(main, 'geen eerlijke tekst over reisafstand').toContain(
      'Reisafstand wordt momenteel nog niet meegenomen',
    );
  });

  test('zonder supermarkt kan het niet verder, met één wel', async ({ page }) => {
    await register(page);
    await upToTheStoreStep(page);

    const done = page.getByRole('button', { name: 'Klaar' });
    const boxes = page.locator('input[type=checkbox][data-chain-id]');
    for (let i = 0; i < 3; i += 1) await boxes.nth(i).uncheck();
    await expect(done, '"Klaar" was klikbaar zonder supermarkt').toBeDisabled();
    await expect(page.getByText('Kies minimaal één supermarkt.')).toBeVisible();

    await boxes.first().check();
    await expect(done).toBeEnabled();
  });

  test('Jumbo + Lidl: onboarden, week maken, en alleen die twee ketens', async ({ page }) => {
    await register(page);
    await upToTheStoreStep(page);

    // Exactly the two, and a maximum of two shops — the same setting the
    // planner uses, set here rather than on a second screen.
    await page.locator('input[type=checkbox][data-chain-id="ah"]').uncheck();
    await expect(page.locator('input[type=checkbox][data-chain-id="jumbo"]')).toBeChecked();
    await expect(page.locator('input[type=checkbox][data-chain-id="lidl"]')).toBeChecked();
    await page.getByRole('button', { name: 'Max. 2', exact: true }).click();

    await page.getByRole('button', { name: 'Klaar' }).click();
    await expect(page).toHaveURL(/\/week\/instellingen$/, { timeout: 120_000 });

    // The settings screen shows the same choice back, from the same setting.
    await expect(page.locator('input[type=checkbox][data-chain-id="jumbo"]')).toBeChecked();
    await expect(page.locator('input[type=checkbox][data-chain-id="lidl"]')).toBeChecked();
    await expect(page.locator('input[type=checkbox][data-chain-id="ah"]')).not.toBeChecked();
    await expect(page.getByRole('button', { name: 'Max. 2', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await page.getByRole('button', { name: /^Maak mijn week$/ }).click();
    await expect(page.getByRole('heading', { name: 'Mijn week' })).toBeVisible({
      timeout: 180_000,
    });
    expect(await page.locator('li[data-recipe-id]').count()).toBe(7);

    // And the week really is bought at those two chains: every line on the
    // list carries a product id from Jumbo or Lidl, never from Albert Heijn.
    await page.goto('/boodschappen');
    const keys = await page
      .locator('li[data-item-key]')
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-item-key') ?? ''));
    expect(keys.length).toBeGreaterThan(5);
    for (const key of keys) {
      expect(key, `${key} komt niet uit Jumbo of Lidl`).toMatch(/^[a-z0-9-]+:(jumbo|lidl):/);
    }
    const list = (await page.locator('main').innerText()).replace(/\s+/g, ' ');
    expect(list, 'echte prijsdata ontbreekt').toContain('Echte prijsdata');
    expect(list, 'Albert Heijn stond niet aangevinkt').not.toContain('Albert Heijn');
  });
});
