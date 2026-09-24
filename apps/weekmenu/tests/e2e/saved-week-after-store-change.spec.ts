import { expect, test, type Page } from '@playwright/test';

/**
 * ALPHA-004: een opgeslagen week na het uitzetten van een supermarkt.
 *
 * Maak een week met drie ketens, zet er daarna twee uit. Een deel van de zeven
 * gerechten heeft Lidl dan niet compleet, en de boodschappenlijst zegt dat ook:
 * "Voeg een winkel toe of vervang het bijbehorende gerecht". Precies dat
 * vervangen weigerde de app sinds ALPHA-003, net als alternatieven tonen en de
 * week opnieuw doorrekenen — allemaal met "konden niet worden gecombineerd tot
 * een volledige week", terwijl er niets te combineren viel: de week lag vast.
 *
 * Deze test doet wat een gebruiker doet, in de volgorde waarin die het doet.
 */
async function registerAndOnboard(page: Page): Promise<void> {
  page.setDefaultTimeout(30_000);
  await page.goto('/registreren');
  await page.getByLabel('E-mailadres').fill(`alpha004-${Date.now()}@voorbeeld.nl`);
  await page.getByLabel('Wachtwoord').fill('eenlangwachtwoord');
  await page.getByRole('button', { name: 'Account aanmaken' }).click();
  await expect(page).toHaveURL(/\/onboarding$/, { timeout: 60_000 });

  await page.getByLabel('Naam van je huishouden').fill('Winkel uitgezet');
  await page.getByLabel('Postcode').fill('3511 LX');
  await page.getByLabel('Huisnr.').fill('7');
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

  // Alle drie de ketens staan standaard aan.
  await expect(
    page.getByRole('heading', { name: 'Welke supermarkten wil je meenemen?' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Klaar' }).click();
  await expect(page).toHaveURL(/\/week\/instellingen$/, { timeout: 120_000 });
}

/**
 * Wait until the recalculation has either landed or been refused, and say which.
 *
 * Success is visible as the "settings changed since" remark disappearing: the
 * stored week now carries the current settings. A refusal is an alert, and its
 * text is returned so a failure reads as the app's own message.
 */
async function outcome(page: Page, changed: ReturnType<Page['getByText']>): Promise<string> {
  const alert = page.locator('main').getByRole('alert');
  await expect(async () => {
    expect((await alert.count()) > 0 || (await changed.count()) === 0).toBe(true);
  }).toPass({ timeout: 180_000 });
  return (await alert.count()) > 0 ? (await alert.first().innerText()).trim() : 'ok';
}

function weekIds(page: Page): Promise<string[]> {
  return page
    .locator('li[data-recipe-id]')
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-recipe-id') ?? ''));
}

test.describe('ALPHA-004 — een opgeslagen week na het uitzetten van een supermarkt', () => {
  test.describe.configure({ timeout: 900_000 });

  test('doorrekenen, alternatieven en vervangen blijven werken', async ({ page }) => {
    await registerAndOnboard(page);

    // 1. Een week met drie ketens.
    await page.getByRole('button', { name: /^Maak mijn week$/ }).click();
    await expect(page.getByRole('heading', { name: 'Mijn week' })).toBeVisible({
      timeout: 180_000,
    });
    const chosen = await weekIds(page);
    expect(chosen).toHaveLength(7);

    // 2. Daarna alleen nog Lidl, één winkel.
    await page.goto('/week/instellingen');
    await page.locator('input[type=checkbox][data-chain-id="ah"]').uncheck();
    await page.locator('input[type=checkbox][data-chain-id="jumbo"]').uncheck();
    await page.getByRole('button', { name: '1 winkel', exact: true }).click();
    await page.getByRole('button', { name: 'Instellingen opslaan' }).click();
    await expect(page.getByText('Instellingen opgeslagen.')).toBeVisible({ timeout: 60_000 });

    // 3. De week opnieuw doorrekenen met de nieuwe winkelkeuze.
    await page.goto('/week');
    const changed = page.getByText('Je instellingen zijn daarna gewijzigd', { exact: false });
    await expect(changed).toBeVisible();
    await page.getByRole('button', { name: 'Bereken opnieuw met de prijzen van nu' }).click();
    expect(await outcome(page, changed), 'doorrekenen werd geweigerd').toBe('ok');
    await page.reload();
    // Doorrekenen kiest niets: dezelfde zeven gerechten op dezelfde dagen.
    expect(await weekIds(page)).toEqual(chosen);

    // De voorwaarde van deze test, zichtbaar gemaakt: Lidl heeft niet alles.
    // Zonder dat is er niets om te bewijzen, en moet de test dat zeggen.
    await page.goto('/boodschappen');
    await expect(
      page.getByText('Niet verkrijgbaar bij de gekozen supermarkten', { exact: false }),
      'deze week had Lidl wél compleet — het scenario is niet bereikt',
    ).toBeVisible();

    // 4. Alternatieven voor een dag, en er één kiezen.
    const day = 1;
    await page.goto(`/week/${day}/vervangen`);
    const choose = page.getByRole('button', { name: /Kies dit gerecht|Vervang/i }).first();
    await expect(choose, 'geen alternatieven getoond').toBeVisible({ timeout: 180_000 });
    await expect(page.locator('main').getByRole('alert')).toHaveCount(0);
    await choose.click();
    await expect(page).toHaveURL(new RegExp(`/week/${day}$`), { timeout: 180_000 });

    await page.goto('/week');
    await page.reload();
    const after = await weekIds(page);
    expect(after[day], 'dag kreeg hetzelfde gerecht terug').not.toBe(chosen[day]);
    expect(
      after.filter((_, i) => i !== day),
      'een andere dag veranderde mee',
    ).toEqual(chosen.filter((_, i) => i !== day));
  });
});
