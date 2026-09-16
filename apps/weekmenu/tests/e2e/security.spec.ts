import { expect, test, type Page } from '@playwright/test';

/**
 * The promises that are not about food.
 *
 * Weekmenu holds weight, pregnancy and an address. Three things follow, and
 * each is checked here rather than asserted in a document: a signed-out visitor
 * reaches none of it, a signed-in visitor reaches only their own, and none of
 * it leaves the browser for anywhere but this app.
 */
const PROTECTED = [
  '/week',
  '/week/0',
  '/week/instellingen',
  '/boodschappen',
  '/winkels',
  '/gezin',
  '/gezin/voorkeuren',
  '/gezin/leden/demo-member-arjan',
  '/instellingen',
];

async function signIn(page: Page): Promise<void> {
  await page.goto('/inloggen');
  await page.getByRole('button', { name: 'Bekijk de demo' }).click();
  await expect(page).toHaveURL(/\/week$/);
}

test.describe('what the app protects', () => {
  test.describe.configure({ timeout: 300_000 });

  test('every screen with household data needs a session', async ({ page }) => {
    for (const path of PROTECTED) {
      const response = await page.goto(path);
      expect(response?.status(), `${path} gaf geen nette pagina`).toBeLessThan(400);
      await expect(page, `${path} was bereikbaar zonder inloggen`).toHaveURL(/\/inloggen$/);

      // Not a stack trace and not a glimpse of the data on the way out.
      const body = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
      expect(body).not.toContain('Application error');
      expect(body).not.toMatch(/Arjan|Chimene|Van der Laan/);
    }
  });

  test('the session cookie cannot be written by hand', async ({ page, context }) => {
    await signIn(page);

    const cookie = (await context.cookies()).find((c) => c.name === 'weekmenu_session');
    expect(cookie, 'geen sessiecookie').toBeDefined();
    expect(cookie!.httpOnly, 'sessiecookie leesbaar voor scripts').toBe(true);
    expect(cookie!.sameSite, 'sessiecookie zonder sameSite').not.toBe('None');

    // The demo user id is no secret — it is in the seed, and it used to be the
    // whole cookie. Typing it in must now prove nothing.
    await context.clearCookies();
    await context.addCookies([{ ...cookie!, value: 'demo-user' }]);
    await page.goto('/week');
    await expect(page, 'een verzonnen cookie gaf toegang').toHaveURL(/\/inloggen$/);

    // And a tampered signature is no better than none.
    await context.clearCookies();
    await context.addCookies([{ ...cookie!, value: `demo-user.${'a'.repeat(43)}` }]);
    await page.goto('/week');
    await expect(page, 'een vervalste handtekening gaf toegang').toHaveURL(/\/inloggen$/);
  });

  test('uitloggen sluit de deur echt', async ({ page, context }) => {
    await signIn(page);
    await page.goto('/week');
    await expect(page.getByRole('heading', { name: /Mijn week|Hoi /i })).toBeVisible();

    await page.goto('/instellingen');
    await page.getByRole('button', { name: 'Uitloggen' }).click();
    await expect(page).toHaveURL(/\/inloggen$/, { timeout: 60_000 });

    // The cookie is gone, and the pages behind it are gone with it.
    const cookie = (await context.cookies()).find((c) => c.name === 'weekmenu_session');
    expect(cookie?.value ?? '', 'de sessiecookie staat er nog').toBe('');
    for (const path of ['/week', '/boodschappen', '/gezin']) {
      await page.goto(path);
      await expect(page, `${path} was nog bereikbaar na uitloggen`).toHaveURL(/\/inloggen$/);
    }
  });

  test('a second account sees nothing of the first', async ({ page }) => {
    const email = `tweede-${Date.now()}@voorbeeld.nl`;
    await page.goto('/registreren');
    await page.getByLabel('E-mailadres').fill(email);
    await page.getByLabel('Wachtwoord').fill('eenlangwachtwoord');
    await page.getByRole('button', { name: /Account aanmaken|Registreren/ }).click();
    await expect(page).toHaveURL(/\/onboarding$/, { timeout: 60_000 });

    // A brand new account, reaching for the demo household by its id.
    for (const path of ['/gezin/leden/demo-member-arjan', '/week', '/boodschappen', '/gezin']) {
      await page.goto(path);
      const body = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
      expect(body, `${path} lekte gegevens van een ander huishouden`).not.toMatch(
        /Arjan|Chimene|Van der Laan|9711/,
      );
      // And what it gets instead is the way in, not a stack trace.
      expect(body, `${path} gaf een foutpagina aan een nieuw account`).not.toContain(
        'Application error',
      );
      await expect(page, `${path} liep vast voor een nieuw account`).toHaveURL(/\/onboarding$/);
    }
  });

  test('nothing about the household leaves this app', async ({ page }) => {
    const origin = new URL(page.url() === 'about:blank' ? 'http://127.0.0.1:3100' : page.url());
    const foreign: string[] = [];
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.host !== origin.host && url.protocol !== 'data:') foreign.push(request.url());
    });

    await signIn(page);
    await page.goto('/gezin');
    await page.goto('/week');
    const generate = page.locator('button[data-action="generate-week"]').first();
    if ((await generate.count()) > 0) {
      await generate.click();
      await expect(page.getByRole('heading', { name: 'Mijn week' })).toBeVisible({
        timeout: 180_000,
      });
    }
    await page.goto('/boodschappen');
    await page.goto('/winkels');

    // Every price lookup is server-side on purpose: a supermarket has no
    // business knowing who is pregnant, and an analytics script would be told
    // by accident. There is no third party here to tell.
    expect(foreign, `verkeer naar buiten: ${foreign.join(', ')}`).toEqual([]);
  });

  test('no keys, no credentials and no catalogue in the code the browser downloads', async ({
    page,
    request,
  }) => {
    await signIn(page);
    const sources = await page
      .locator('script[src]')
      .evaluateAll((nodes) => nodes.map((n) => (n as HTMLScriptElement).src));
    expect(sources.length, 'geen scripts gevonden').toBeGreaterThan(0);

    for (const src of sources) {
      const body = await (await request.get(src)).text();
      // A Supabase key is a JWT; a service key would be one too.
      expect(body, `${src} bevat een JWT`).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}\./);
      expect(body, `${src} bevat service_role`).not.toContain('service_role');
      // The demo account's credentials live in the seed, which is server-side.
      expect(body, `${src} bevat het demo-account`).not.toContain('demo@weekmenu.nl');
      // The snapshot paths name where the price data sits on the server.
      expect(body, `${src} bevat een serverpad`).not.toContain('WEEKMENU_PRICE_SNAPSHOT');
      expect(body, `${src} bevat de sessiesleutel`).not.toContain('sessionSecret');
    }
  });
});
