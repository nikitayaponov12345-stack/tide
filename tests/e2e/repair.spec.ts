import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

// Ремонт (M1-04): молоток при повреждённой клетке, мир стоит, нажатие по клетке +repair_per_tap, выход сам или молотком.
test.use({ locale: 'ru-RU' });
test.setTimeout(90_000);

const CONSTANTS = readFileSync('data/constants.csv', 'utf8');
const constant = (key: string): number => Number(new RegExp(`^${key},([^,]+),`, 'm').exec(CONSTANTS)![1]);
const CELL_HP = constant('cell_hp');
const PER_TAP = constant('repair_per_tap');

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return errors;
}

/** Нажатие в точку окна: мышь на ПК, касание на телефоне. */
async function pressAt(page: Page, phone: boolean, x: number, y: number): Promise<void> {
  if (phone) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
}

async function pressHammer(page: Page, phone: boolean): Promise<void> {
  const b = (await page.getByTestId('repair-button').boundingBox())!;
  await pressAt(page, phone, b.x + b.width / 2, b.y + b.height / 2);
}

const timeMs = (page: Page): Promise<number> => page.evaluate(() => window.__game!.world().timeMs);
const repairing = (page: Page): Promise<boolean> => page.evaluate(() => window.__game!.state().repair);
const cellHp = (page: Page): Promise<number> => page.evaluate(() => window.__game!.state().raft.find((c) => c.gx === 1 && c.gy === 0)!.hp);
const stops = (page: Page): Promise<number> => page.evaluate(() => window.__game!.platformLog().filter((c) => c.name === 'gameplayStop').length);

test('молоток: ремонт на паузе, выход сам и молотком', async ({ page }, info) => {
  // Сценарий рассчитан на два нажатия от половины прочности до полной.
  expect(CELL_HP / 2 + PER_TAP, 'cell_hp / 2 + repair_per_tap должно быть меньше cell_hp').toBeLessThan(CELL_HP);
  expect(CELL_HP / 2 + 2 * PER_TAP, 'два нажатия от половины прочности должны дойти до полной').toBeGreaterThanOrEqual(CELL_HP);
  const errors = watchErrors(page);
  const phone = info.project.name === 'phone';
  await page.goto('/?new=1');
  await page.waitForFunction(() => window.__game?.ready === true, null, { timeout: 20_000 });
  const vp = page.viewportSize()!;
  const hammer = page.getByTestId('repair-button');

  const t0 = await page.evaluate(() => {
    const g = window.__game!;
    g.debugLevelUp();
    g.command.takeCard(0);
    g.command.placeCell(1, 0);
    return g.world().timeMs;
  });
  // Кнопка создаётся скрытой: ждём кадров игры, иначе проверка прошла бы при любой видимости.
  await page.waitForFunction((t) => window.__game!.world().timeMs > t + 100, t0);
  await expect(hammer).toBeHidden();

  await page.evaluate((hp) => window.__game!.debugDamageCell(1, 0, hp / 2), CELL_HP);
  await expect(hammer).toBeVisible();
  await expect(hammer).toHaveText('Ремонт');
  const b = (await hammer.boundingBox())!;
  expect(b.x + b.width / 2).toBeGreaterThan(vp.width / 2);
  expect(b.y + b.height / 2).toBeGreaterThan(vp.height / 2);
  expect(b.x).toBeGreaterThanOrEqual(0);
  expect(b.y).toBeGreaterThanOrEqual(0);
  expect(b.x + b.width).toBeLessThanOrEqual(vp.width);
  expect(b.y + b.height).toBeLessThanOrEqual(vp.height);
  expect(b.width).toBeGreaterThanOrEqual(44);
  expect(b.height).toBeGreaterThanOrEqual(44);

  await pressHammer(page, phone);
  await expect.poll(() => repairing(page)).toBe(true);
  const t1 = await timeMs(page);
  await page.waitForTimeout(500);
  expect(await timeMs(page)).toBe(t1);
  expect(await stops(page)).toBe(0);

  const cell = await page.evaluate(() => window.__game!.cellToScreen(1, 0));
  await pressAt(page, phone, cell.x, cell.y);
  await expect.poll(() => cellHp(page)).toBe(CELL_HP / 2 + PER_TAP);
  await expect(hammer).toHaveClass(/active/);
  await page.screenshot({ path: `build/shots/m1-04_repair_${info.project.name}.png` });

  await pressAt(page, phone, cell.x, cell.y);
  await expect.poll(() => cellHp(page)).toBe(CELL_HP);
  expect(await repairing(page)).toBe(false);
  await expect(hammer).toBeHidden();
  const t2 = await timeMs(page);
  await page.waitForFunction((t) => window.__game!.world().timeMs > t + 100, t2);

  // Выход молотком: прочность так и остаётся.
  await page.evaluate((n) => window.__game!.debugDamageCell(1, 0, n), PER_TAP);
  await expect(hammer).toBeVisible();
  await pressHammer(page, phone);
  await expect.poll(() => repairing(page)).toBe(true);
  await pressHammer(page, phone);
  await expect.poll(() => repairing(page)).toBe(false);
  expect(await cellHp(page)).toBe(CELL_HP - PER_TAP);
  expect(await stops(page)).toBe(0);
  expect(errors).toEqual([]);
});
