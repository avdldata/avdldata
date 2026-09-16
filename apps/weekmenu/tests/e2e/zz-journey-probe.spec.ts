import { expect, test } from '@playwright/test';

/** Diagnostic walk-through. Not an assertion suite — it reports what happens. */
const log: string[] = [];
const note = (step: string, outcome: string) => log.push(`${step.padEnd(34)} ${outcome}`);

test('journey', async ({ page }) => {
  test.setTimeout(900_000);
  // Every action gets a deadline, so a hang is reported as a step failure
  // instead of silently eating the whole test budget.
  page.setDefaultTimeout(20_000);

  // 1. sign in
  await page.goto('/inloggen');
  await page.getByRole('button', { name: 'Bekijk de demo' }).click();
  await expect(page).toHaveURL(/\/week$/);
  note('1 inloggen', 'OK');

  // 2. household
  await page.goto('/gezin');
  const gezin = (await page.locator('main').innerText()).replace(/\s+/g, ' ');
  note('2 huishouden openen', gezin.slice(0, 120));

  // 3. edit a member
  const memberLink = page.locator('a[href^="/gezin/leden/"]').first();
  const memberHref = await memberLink.getAttribute('href');
  await memberLink.click();
  await expect(page).toHaveURL(new RegExp(memberHref!.replace(/\//g, '\\/')));
  const weight = page.getByLabel(/gewicht/i).first();
  const before = await weight.inputValue().catch(() => '(geen veld)');
  note('3a gewicht voor', before);
  if (before !== '(geen veld)') {
    await weight.fill('91');
    await page.getByRole('button', { name: /opslaan/i }).first().click();
    await page.waitForTimeout(1500);
    await page.goto(memberHref!);
    note('3b gewicht na refresh', await weight.inputValue());
  }

  // 4. week settings — the amount field only appears once a budget mode is on
  await page.goto('/week/instellingen');
  await page.getByRole('button', { name: 'Richtbedrag', exact: true }).click();
  const budget = page.getByRole('textbox', { name: /bedrag|budget/i }).first();
  await budget.fill('85');
  note('4a budget ingevuld', '85');
  await page.getByRole('button', { name: /Instellingen opslaan/ }).click();
  await page.waitForTimeout(2000);
  await page.goto('/week/instellingen');
  const modeOn = await page
    .getByRole('button', { name: 'Richtbedrag', exact: true })
    .getAttribute('aria-pressed');
  note('4b budgetmodus na refresh', `aria-pressed=${modeOn}`);
  note(
    '4c bedrag na refresh',
    (await page
      .getByRole('textbox', { name: /bedrag|budget/i })
      .first()
      .inputValue()
      .catch(() => '(veld weg)')) || '(leeg)',
  );

  // 5. generate
  const t0 = Date.now();
  await page.getByRole('button', { name: /^Maak mijn week$/ }).click();
  await expect(page.getByRole('heading', { name: 'Mijn week' })).toBeVisible({ timeout: 180_000 });
  note('5 week genereren', `${Date.now() - t0} ms`);
  const week1 = await page.locator('li[data-recipe-id]').evaluateAll((n) =>
    n.map((e) => e.getAttribute('data-recipe-id')),
  );
  const total1 = (await page.locator('main').innerText()).match(/€\s?[\d.,]+/)?.[0] ?? '?';
  note('5b week + totaal', `${week1.join(',').slice(0, 60)}… ${total1}`);

  // 6. recipe detail
  await page.locator('li[data-recipe-id] a').first().click();
  await expect(page).toHaveURL(/\/week\/\d$/);
  const detail = (await page.locator('main').innerText()).replace(/\s+/g, ' ');
  note('6 receptdetail', detail.slice(0, 150));
  const ugly = detail.match(/\d+\.\d{3,}/g);
  note('6b rauwe decimalen', ugly ? ugly.slice(0, 5).join(' | ') : 'geen');

  // 7. replace wednesday
  await page.goto('/week/2');
  const wednesday = (await page.locator('h1').innerText()).trim();
  await page.getByRole('link', { name: /Vervang/i }).first().click();
  await expect(page).toHaveURL(/vervangen$/);
  const chooseButton = page.getByRole('button', { name: /Kies dit gerecht|Vervang/i }).first();
  await expect(chooseButton).toBeVisible({ timeout: 180_000 });
  await chooseButton.click();
  await page.waitForTimeout(3000);
  await page.goto('/week/2');
  const afterSwap = (await page.locator('h1').innerText()).trim();
  note('7 vervangen', `${wednesday} -> ${afterSwap}`);
  await page.reload();
  note('7b na refresh', (await page.locator('h1').innerText()).trim());

  // 8. regenerate
  await page.goto('/week');
  await page.getByRole('button', { name: /Maak een andere week/ }).click();
  await expect(page.getByRole('button', { name: /Maak een andere week/ })).toBeEnabled({ timeout: 180_000 });
  const week2 = await page.locator('li[data-recipe-id]').evaluateAll((n) =>
    n.map((e) => e.getAttribute('data-recipe-id')),
  );
  await page.reload();
  const week2after = await page.locator('li[data-recipe-id]').evaluateAll((n) =>
    n.map((e) => e.getAttribute('data-recipe-id')),
  );
  note('8 regenerate blijft na refresh', week2.join(',') === week2after.join(',') ? 'OK' : 'VERSCHILT');

  // 9-10. shopping list, check five
  await page.goto('/boodschappen');
  const totalBefore = (await page.locator('main').innerText()).match(/€\s?[\d.,]+/)?.[0] ?? '?';
  const boxes = page.locator('input[type=checkbox]');
  const count = await boxes.count();
  note('9 boodschappenlijst', `${count} vakjes, totaal ${totalBefore}`);
  for (let i = 0; i < Math.min(5, count); i += 1) {
    await boxes.nth(i).click();
    await page.waitForTimeout(400);
  }
  const checkedBefore = await page.locator('input[type=checkbox]:checked').count();
  note('10 vijf afgevinkt', `${checkedBefore} gevinkt`);

  // 11. refresh
  await page.reload();
  await page.waitForTimeout(1000);
  note('11 na refresh', `${await page.locator('input[type=checkbox]:checked').count()} gevinkt`);

  // 12-13. new context = closing and reopening the browser
  const context = page.context();
  const fresh = await context.newPage();
  await fresh.goto('/boodschappen');
  await fresh.waitForTimeout(1000);
  note('12 nieuw tabblad', `${await fresh.locator('input[type=checkbox]:checked').count()} gevinkt`);
  await fresh.goto('/week');
  const week3 = await fresh.locator('li[data-recipe-id]').evaluateAll((n) =>
    n.map((e) => e.getAttribute('data-recipe-id')),
  );
  note('13 opgeslagen week terug', week3.join(',') === week2.join(',') ? 'zelfde week' : 'ANDERE WEEK');
  const total3 = (await fresh.locator('main').innerText()).match(/€\s?[\d.,]+/)?.[0] ?? '?';
  note('13b totaal', total3);

  // eslint-disable-next-line no-console
  console.log('\n===JOURNEY===\n' + log.join('\n') + '\n===EIND===\n');
});
