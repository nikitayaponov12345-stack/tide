import { expect, test, type Page } from '@playwright/test';

// Обучение без текста (M1-19): рука на первом броске, тяге упавшей сети, первой карточке и «Взять», первой клетке.
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

/** Середина элемента по data-testid. */
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

test('бросок, тяга упавшей сети', async ({ page }, info) => {
  const phone = info.project.name === 'phone';
  const errors = await start(page);
  const vp = page.viewportSize()!;
  const hand = page.getByTestId('tutorial-hand');

  // 1. Новая партия: рука на воде в окне, шаг «бросок».
  await expect(hand).toBeVisible();
  await expect(hand).toHaveAttribute('data-step', 'throw');
  await expect(hand).toHaveClass(/\btap\b/);
  expect(await page.evaluate(() => window.__game!.state().tutorial)).toBe('throw');
  const c = (await handCenter(page))!;
  expect(c.x).toBeGreaterThanOrEqual(0);
  expect(c.y).toBeGreaterThanOrEqual(0);
  expect(c.x).toBeLessThanOrEqual(vp.width);
  expect(c.y).toBeLessThanOrEqual(vp.height);
  await page.screenshot({ path: `build/shots/m1-19_throw_${info.project.name}.png` });

  // 2. Бросок по воде — сеть упала, рука на сети, жест «держи».
  const water = await page.evaluate(() => window.__game!.toScreen(0, 160));
  await tap(page, phone, water);
  await expect.poll(() => page.evaluate(() => window.__game!.state().net.state)).toBe('lying');
  await handAt(page, 'pull', () => page.evaluate(() => {
    const n = window.__game!.state().net;
    return window.__game!.toScreen(n.x, n.y);
  }));
  await expect(hand).toHaveClass(/\bhold\b/);

  // 3. Тяга — руки нет; отпустил — тоже нет.
  if (phone) await page.evaluate(() => window.__game!.command.setPull(true));
  else {
    await page.mouse.move(water.x, water.y);
    await page.mouse.down();
  }
  await expect.poll(() => page.evaluate(() => window.__game!.state().net.state)).not.toBe('lying');
  await expect(hand).toBeHidden();
  if (phone) await page.evaluate(() => window.__game!.command.setPull(false));
  else await page.mouse.up();
  await page.waitForTimeout(300);
  await expect(hand).toBeHidden();
  expect(await page.evaluate(() => window.__game!.state().tutorial)).toBeNull();
  expect(errors).toEqual([]);
});

test('первая карточка, «Взять» и первая клетка', async ({ page }, info) => {
  const phone = info.project.name === 'phone';
  const errors = await start(page);
  const hand = page.getByTestId('tutorial-hand');

  // 1. Окно 2-го уровня: рука на первой карточке поверх затемнения.
  await page.evaluate(() => window.__game!.debugLevelUp());
  await expect(page.getByTestId('cards')).toBeVisible();
  await handAt(page, 'card', () => centerOf(page, '[data-testid="card"]'));
  await page.screenshot({ path: `build/shots/m1-19_card_${info.project.name}.png` });

  // 2. Выбор карточки (после защиты окна) — рука на «Взять».
  await page.waitForTimeout(400);
  await tap(page, phone, await centerOf(page, '[data-testid="card"]'));
  await expect(page.getByTestId('take')).toBeVisible();
  await handAt(page, 'card', () => centerOf(page, '[data-testid="take"]'));

  // 3. «Взять» — рука на первом месте стройки.
  await tap(page, phone, await centerOf(page, '[data-testid="take"]'));
  await expect(page.getByTestId('cards')).toBeHidden();
  const spot = await page.evaluate(() => {
    const g = window.__game!;
    const c = g.state().build!.candidates[0]!;
    return g.cellToScreen(c.gx, c.gy);
  });
  await handAt(page, 'cell', async () => spot);

  // 4. Нажатие туда: ПК — клетка поставлена; телефон — рука на «Поставить», нажатие — поставлена.
  await tap(page, phone, spot);
  if (phone) {
    await expect(page.getByTestId('place')).toBeVisible();
    await handAt(page, 'cell', () => centerOf(page, '[data-testid="place"]'));
    await tap(page, phone, await centerOf(page, '[data-testid="place"]'));
  }
  await expect.poll(() => page.evaluate(() => window.__game!.state().raft.length)).toBe(2);
  await expect(hand).toHaveAttribute('data-step', 'throw');
  await expect(hand).toBeVisible();

  // 5. Следующее окно — руки нет.
  await page.evaluate(() => window.__game!.debugLevelUp());
  await expect(page.getByTestId('cards')).toBeVisible();
  await expect(hand).toBeHidden();
  expect(await page.evaluate(() => window.__game!.state().tutorial)).toBeNull();
  expect(errors).toEqual([]);
});
