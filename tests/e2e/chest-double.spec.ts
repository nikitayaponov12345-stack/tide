import { expect, test, type Locator, type Page } from '@playwright/test';

// «Сундук ×2» за рекламу (M1-17): в окне «Локация пройдена» кнопка над «Играть дальше»; досмотрел — сундук вдвое,
// кнопка уходит, перезагрузка это помнит; без рекламы за награду кнопки нет.
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

async function ready(page: Page): Promise<void> {
  await page.waitForFunction(() => window.__game?.ready === true, null, { timeout: 20_000 });
}

/** Нажатие в точку окна: мышь на ПК, касание на телефоне. */
async function tapAt(page: Page, phone: boolean, x: number, y: number): Promise<void> {
  if (phone) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
}

async function press(page: Page, phone: boolean, loc: Locator): Promise<void> {
  const b = (await loc.boundingBox())!;
  await tapAt(page, phone, b.x + b.width / 2, b.y + b.height / 2);
}

async function lastSignal(page: Page): Promise<string | undefined> {
  return page.evaluate(() => window.__game!.platformLog().filter((c) => c.name.startsWith('gameplay')).at(-1)?.name);
}

/** Победа в финальном бою, как в final-boss.spec.ts: 40-й уровень, копьё, последняя единица прочности, бросок в краба. */
async function win(page: Page, phone: boolean, url: string): Promise<void> {
  await page.goto(url);
  await ready(page);
  const water = await page.evaluate(() => window.__game!.toScreen(0, 120));
  await tapAt(page, phone, water.x, water.y);
  await expect.poll(() => lastSignal(page)).toBe('gameplayStart');
  await page.evaluate(() => window.__game!.setLevel(40));
  await expect.poll(() => page.evaluate(() => window.__game!.state().finalBoss.phase)).toBe('crawl');
  await page.evaluate(() => {
    window.__game!.debugSpawnEnemy(-3000, -3000);
    window.__game!.debugFinalBossHp(1);
  });
  if (phone) await page.getByTestId('slot-spear').tap();
  else await page.keyboard.press('Digit2');
  expect(await page.evaluate(() => window.__game!.state().weapon)).toBe('spear');
  const at = await page.evaluate(() => {
    const b = window.__game!.state().finalBoss;
    return window.__game!.toScreen(b.x, b.y);
  });
  await tapAt(page, phone, at.x, at.y);
  await expect(page.getByTestId('cleared')).toBeVisible({ timeout: 10_000 });
}

test('«Сундук ×2»: реклама — сундук вдвое, кнопка уходит, перезагрузка помнит', async ({ page }, info) => {
  const phone = info.project.name === 'phone';
  const errors = watchErrors(page);
  await win(page, phone, '/?new=1');

  const xp = await page.evaluate(() => Math.round(window.__game!.state().finalBoss.chestXp));
  const chest = page.getByTestId('big-chest');
  const double = page.getByTestId('chest-double');
  await expect(chest).toHaveText(`Большой сундук: +${xp} опыта`);
  await expect(double).toBeVisible();
  await expect(double).toHaveText('Сундук ×2 за рекламу');
  await page.screenshot({ path: `build/shots/m1-17_cleared_${info.project.name}.png` });

  await press(page, phone, double);
  await expect(chest).toHaveText(`Большой сундук: +${2 * xp} опыта`, { timeout: 10_000 });
  await expect(double).toBeHidden();
  const s = await page.evaluate(() => window.__game!.state());
  expect(s.chestDoubled).toBe(true);
  expect(s.cleared).toBe(true);
  const log = (await page.evaluate(() => window.__game!.platformLog())).map((c) => c.name);
  expect(log).toContain('rewarded');
  expect(await lastSignal(page)).toBe('gameplayStop');

  await page.reload();
  await ready(page);
  await expect(page.getByTestId('cleared')).toBeVisible();
  await expect(chest).toHaveText(`Большой сундук: +${2 * xp} опыта`);
  await expect(double).toBeHidden();

  expect(errors).toEqual([]);
});

test('«Сундук ×2»: без рекламы за награду кнопки нет', async ({ page }, info) => {
  const phone = info.project.name === 'phone';
  await win(page, phone, '/?new=1&rewarded=0');
  await expect(page.getByTestId('play-on')).toBeVisible();
  await expect(page.getByTestId('chest-double')).toBeHidden();
});
