import { expect, test, type Page } from '@playwright/test';

// Обучение без текста, часть 2 (M1-20): у первого краба мир стоит, рука на слоте копья, потом на крабе — до первого
// попадания; первый ремонт — рука на молотке, потом на клетке.
test.use({ locale: 'ru-RU' });
test.setTimeout(90_000);

type Point = { x: number; y: number };

/** Середина руки в координатах окна; рука скрыта — null. */
async function handCenter(page: Page): Promise<Point | null> {
  return page.getByTestId('tutorial-hand').evaluate((e) => {
    if ((e as HTMLElement).hidden) return null;
    const r = e.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
}

/** Рука видна, показывает шаг step, её середина — в 3 px от точки at (точку считает функция: цель может двигаться). */
async function handAt(page: Page, step: string, at: () => Promise<Point>): Promise<void> {
  const hand = page.getByTestId('tutorial-hand');
  await expect(hand).toBeVisible();
  await expect(hand).toHaveAttribute('data-step', step);
  await expect
    .poll(async () => {
      const [c, p] = [await handCenter(page), await at()];
      return c ? Math.hypot(c.x - p.x, c.y - p.y) : Infinity;
    })
    .toBeLessThanOrEqual(3);
}

/** Середина элемента по селектору. */
async function centerOf(page: Page, selector: string): Promise<Point> {
  const b = (await page.locator(selector).first().boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

async function tap(page: Page, phone: boolean, p: Point): Promise<void> {
  if (phone) await page.touchscreen.tap(p.x, p.y);
  else await page.mouse.click(p.x, p.y);
}

async function start(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto('/?new=1');
  await page.waitForFunction(() => window.__game?.ready === true, null, { timeout: 20_000 });
  return errors;
}

/** Шаги M1-19 командами: бросок и тяга сети, окно 2-го уровня, «Плот» и вторая клетка. Руки после них нет. */
async function pastFirstSteps(page: Page): Promise<void> {
  expect(await page.evaluate(() => window.__game!.command.throwTo(0, 200))).toBe(true);
  await expect.poll(() => page.evaluate(() => window.__game!.state().net.state)).toBe('lying');
  await page.evaluate(() => window.__game!.command.setPull(true));
  await page.evaluate(() => window.__game!.command.setPull(false));
  await page.evaluate(() => window.__game!.debugLevelUp());
  await expect(page.getByTestId('cards')).toBeVisible();
  const i = await page.evaluate(() => window.__game!.state().window!.cards.findIndex((c) => c.id === 'raft'));
  expect(i).toBeGreaterThanOrEqual(0);
  expect(await page.evaluate((n) => window.__game!.command.takeCard(n), i)).toBe(true);
  expect(
    await page.evaluate(() => {
      const g = window.__game!;
      const c = g.state().build!.candidates[0]!;
      return g.command.placeCell(c.gx, c.gy);
    }),
  ).toBe(true);
  await expect(page.getByTestId('cards')).toBeHidden();
  await expect.poll(() => page.evaluate(() => window.__game!.state().tutorial)).toBeNull();
}

test('первый краб: слот копья, краб, мир стоит до попадания', async ({ page }, info) => {
  const phone = info.project.name === 'phone';
  const errors = await start(page);
  await pastFirstSteps(page);
  const hand = page.getByTestId('tutorial-hand');
  const timeMs = () => page.evaluate(() => window.__game!.world().timeMs);

  // 1. Краб в круге дальности: рука на слоте «Копьё», мир стоит.
  await page.evaluate(() => window.__game!.debugSpawnEnemy(150, 0));
  await handAt(page, 'spear_slot', () => centerOf(page, '[data-testid="slot-spear"]'));
  const t0 = await timeMs();
  await page.waitForTimeout(300);
  expect(await timeMs()).toBe(t0);
  await page.screenshot({ path: `build/shots/m1-20_spear_slot_${info.project.name}.png` });

  // 2. Копьё выбрано — рука на крабе, мир по-прежнему стоит.
  if (phone) await page.getByTestId('slot-spear').tap();
  else await page.keyboard.press('Digit2');
  const crab = () => page.evaluate(() => {
    const e = window.__game!.state().enemies[0]!;
    return window.__game!.toScreen(e.x, e.y);
  });
  await handAt(page, 'spear_aim', crab);
  await page.waitForTimeout(300);
  expect(await timeMs()).toBe(t0);
  await page.screenshot({ path: `build/shots/m1-20_spear_aim_${info.project.name}.png` });

  // 3. Нажатие по крабу — попадание, время пошло, руки копья больше нет.
  await tap(page, phone, await crab());
  await expect.poll(() => page.evaluate(() => window.__game!.state().stats.spearHits)).toBeGreaterThan(0);
  await expect.poll(timeMs).toBeGreaterThan(t0);
  await expect.poll(async () => (await hand.getAttribute('data-step')) ?? '').not.toMatch(/^spear/);
  expect(errors).toEqual([]);
});

test('первый ремонт: молоток, потом клетка', async ({ page }, info) => {
  const phone = info.project.name === 'phone';
  const errors = await start(page);
  await pastFirstSteps(page);
  const hand = page.getByTestId('tutorial-hand');

  // 1. Вторая клетка повреждена — рука на молотке.
  const cell = await page.evaluate(() => window.__game!.state().raft[1]!);
  expect(await page.evaluate((c) => window.__game!.debugDamageCell(c.gx, c.gy, 30), cell)).toBe(30);
  await handAt(page, 'repair', () => centerOf(page, '[data-testid="repair-button"]'));

  // 2. Молоток — рука на разбитой клетке.
  await tap(page, phone, await centerOf(page, '[data-testid="repair-button"]'));
  await expect.poll(() => page.evaluate(() => window.__game!.state().repair)).toBe(true);
  const spot = await page.evaluate((c) => window.__game!.cellToScreen(c.gx, c.gy), cell);
  await handAt(page, 'repair_cell', async () => spot);

  // 3. Нажатие по клетке — ремонт засчитан, руки нет.
  await tap(page, phone, spot);
  await expect.poll(() => page.evaluate(() => window.__game!.state().stats.repairTaps)).toBe(1);
  await expect(hand).toBeHidden();
  expect(errors).toEqual([]);
});
