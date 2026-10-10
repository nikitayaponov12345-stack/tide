import { expect, test, type Page } from '@playwright/test';

// Буст за рекламу (M1-12): кнопка у края поля, нажатие — реклама заглушки, буст, крабы гибнут; без рекламы за награду кнопки нет.
test.use({ locale: 'ru-RU' });
test.setTimeout(90_000);

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return errors;
}

test('буст за рекламу: кнопка, реклама, буст, крабы гибнут', async ({ page }, info) => {
  const errors = watchErrors(page);
  await page.goto('/?new=1');
  await page.waitForFunction(() => window.__game?.ready === true, null, { timeout: 20_000 });

  const btn = page.getByTestId('boost-offer');
  await expect(btn).toBeHidden();
  await page.evaluate(() => {
    window.__game!.debugSpawnEnemy(200, 0);
    window.__game!.debugSpawnEnemy(-200, 0);
  });
  expect(await page.evaluate(() => window.__game!.debugBoostOffer())).toBe(true);
  await expect(btn).toBeVisible();
  await expect(btn).toContainText('за рекламу');
  await page.screenshot({ path: `build/shots/m1-12_boost_offer_${info.project.name}.png` });

  await btn.click();
  await expect.poll(() => page.evaluate(() => window.__game!.state().boost.active), { timeout: 10_000 }).toBe(true);
  const s = await page.evaluate(() => window.__game!.state());
  expect(s.enemies).toHaveLength(0);
  expect(s.boostOffer.visible).toBe(false);
  expect(s.boostOffer.taken).toBe(1);
  expect(s.stats.boostKills).toBe(2);
  expect(s.ad).toBe(false);
  await expect(btn).toBeHidden();

  const log = (await page.evaluate(() => window.__game!.platformLog())).map((c) => c.name);
  const i = log.lastIndexOf('rewarded');
  expect(i).toBeGreaterThan(0);
  expect(log[i - 1]).toBe('gameplayStop');
  expect(log[i + 1]).toBe('gameplayStart');

  expect(errors).toEqual([]);
});

test('реклама за награду недоступна: кнопки нет', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/?new=1&rewarded=0');
  await page.waitForFunction(() => window.__game?.ready === true, null, { timeout: 20_000 });

  expect(await page.evaluate(() => window.__game!.debugBoostOffer())).toBe(false);
  expect(await page.evaluate(() => window.__game!.state().boostOffer.enabled)).toBe(false);
  await expect(page.getByTestId('boost-offer')).toBeHidden();

  expect(errors).toEqual([]);
});
