import { expect, test, type Page } from '@playwright/test';

// Воронка за рекламу (M1-14): в окне 6-го уровня карточка закрыта, «Открыть за рекламу» открывает её на всю кампанию;
// без рекламы за награду открыта сразу.
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

async function openWindow(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await page.waitForFunction(() => window.__game?.ready === true, null, { timeout: 20_000 });
  await page.evaluate(() => {
    window.__game!.setLevel(5);
    window.__game!.debugLevelUp();
  });
}

const whirlpoolOffer = (page: Page) =>
  page.evaluate(() => window.__game!.state().window?.cards.find((c) => c.id === 'whirlpool'));

test('воронка за рекламу: закрыта, «Открыть за рекламу», открыта и после перезагрузки', async ({ page }, info) => {
  const errors = watchErrors(page);
  await openWindow(page, '/?new=1');

  expect(await whirlpoolOffer(page)).toEqual({ id: 'whirlpool', available: false, reason: 'ui.ad_locked' });
  const card = page.locator('[data-testid="card"][data-id="whirlpool"]');
  await expect(card).toHaveClass(/unavailable/);
  await expect(card).toContainText('Открывается за рекламу');
  const unlock = page.getByTestId('card-unlock');
  await expect(unlock).toBeVisible();
  await expect(unlock).toBeEnabled();
  await page.screenshot({ path: `build/shots/m1-14_whirlpool_locked_${info.project.name}.png` });

  await unlock.click();
  await expect.poll(() => whirlpoolOffer(page), { timeout: 10_000 }).toEqual({ id: 'whirlpool', available: true, reason: null });
  await expect(card).not.toHaveClass(/unavailable/);
  await expect(page.getByTestId('card-unlock')).toHaveCount(0);
  const log = (await page.evaluate(() => window.__game!.platformLog())).map((c) => c.name);
  expect(log).toContain('rewarded');
  expect(await page.evaluate(() => window.__game!.debugSave())).toContain('"whirlpoolUnlocked":true');

  await page.reload();
  await page.waitForFunction(() => window.__game?.ready === true, null, { timeout: 20_000 });
  const s = await page.evaluate(() => window.__game!.state());
  expect(s.whirlpoolUnlocked).toBe(true);
  expect(s.window).not.toBeNull();
  expect(await whirlpoolOffer(page)).toEqual({ id: 'whirlpool', available: true, reason: null });

  expect(errors).toEqual([]);
});

test('реклама за награду недоступна: воронка открыта сразу, кнопки нет', async ({ page }) => {
  const errors = watchErrors(page);
  await openWindow(page, '/?new=1&rewarded=0');

  expect(await whirlpoolOffer(page)).toEqual({ id: 'whirlpool', available: true, reason: null });
  await expect(page.locator('[data-testid="card"][data-id="whirlpool"]')).toBeVisible();
  await expect(page.getByTestId('card-unlock')).toHaveCount(0);

  expect(errors).toEqual([]);
});
