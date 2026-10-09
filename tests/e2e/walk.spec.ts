import { expect, test, type Page } from '@playwright/test';

// Ходьба моряка: подсказка после второй клетки, шаг клавишей на ПК и жестом пальца на телефоне.
test.use({ locale: 'ru-RU' });
test.setTimeout(90_000);

type Rect = { x: number; y: number; w: number; h: number };

async function boxOf(page: Page, testid: string): Promise<Rect> {
  const b = (await page.getByTestId(testid).boundingBox())!;
  return { x: b.x, y: b.y, w: b.width, h: b.height };
}

function inside(r: Rect, vw: number, vh: number): void {
  expect(r.x).toBeGreaterThanOrEqual(-0.5);
  expect(r.y).toBeGreaterThanOrEqual(-0.5);
  expect(r.x + r.w).toBeLessThanOrEqual(vw + 0.5);
  expect(r.y + r.h).toBeLessThanOrEqual(vh + 0.5);
}

function apart(a: Rect, b: Rect): void {
  const overlaps = a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  expect(overlaps).toBe(false);
}

/** Игра с клеткой (1, 0); подсказки ещё нет — ждём её по времени мира. */
async function secondCell(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.ready === true, null, { timeout: 20_000 });
  await page.evaluate(() => window.__game!.debugLevelUp());
  const hintNow = await page.evaluate(() => {
    const g = window.__game!;
    if (!g.command.takeCard(0) || !g.command.placeCell(1, 0)) throw new Error('стройка не удалась');
    return g.state().walkHint;
  });
  expect(hintNow).toBe(false);
  const hint = page.getByTestId('walk-hint');
  await expect(hint).toBeVisible({ timeout: 15_000 });
  return errors;
}

test('ПК: подсказка про клавиши, шаг клавишей D', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'сценарий ПК');
  const errors = await secondCell(page);
  const vp = page.viewportSize()!;
  const hint = page.getByTestId('walk-hint');
  await expect(hint).toHaveText('WASD или стрелки — шаг моряка');
  const r = await boxOf(page, 'walk-hint');
  inside(r, vp.width, vp.height);
  apart(r, await boxOf(page, 'xpbar'));
  await page.screenshot({ path: 'build/shots/m0-07_hint_desktop.png' });

  // Текст — по последнему указателю.
  await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'touch', pointerId: 7 })));
  await expect(hint).toHaveText('Проведи пальцем — моряк перейдёт на соседнюю клетку');

  // Щелчок мышью по подсказке доходит до холста (бросок) и возвращает текст про клавиши.
  const b = await boxOf(page, 'walk-hint');
  await page.mouse.click(b.x + b.w / 2, b.y + b.h / 2);
  await expect(hint).toHaveText('WASD или стрелки — шаг моряка');
  expect(await page.evaluate(() => window.__game!.state().stats.throws)).toBe(1);

  await page.keyboard.press('KeyD');
  const s = await page.evaluate(() => window.__game!.state());
  expect([s.sailor.gx, s.sailor.gy]).toEqual([1, 0]);
  expect(s.stats.steps).toBe(1);
  expect(s.walkHint).toBe(false);
  await expect(hint).toBeHidden();
  await page.screenshot({ path: 'build/shots/m0-07_walk_desktop.png' });
  expect(errors).toEqual([]);
});

test('телефон: подсказка про палец, шаг жестом без броска', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'сценарий телефона');
  const errors = await secondCell(page);
  const vp = page.viewportSize()!;
  const hint = page.getByTestId('walk-hint');
  await expect(hint).toHaveText('Проведи пальцем — моряк перейдёт на соседнюю клетку');
  const r = await boxOf(page, 'walk-hint');
  inside(r, vp.width, vp.height);
  apart(r, await boxOf(page, 'xpbar'));
  await page.screenshot({ path: 'build/shots/m0-07_hint_phone.png' });

  // page.touchscreen умеет только tap — жест собираем синтетическими PointerEvent на холсте.
  await page.evaluate(() => {
    const g = window.__game!;
    const canvas = document.querySelector('#game canvas')!;
    const fire = (type: string, x: number, y: number): void => {
      const p = g.toScreen(x, y);
      canvas.dispatchEvent(new PointerEvent(type, {
        pointerType: 'touch', pointerId: 11, isPrimary: true, clientX: p.x, clientY: p.y, bubbles: true,
      }));
    };
    fire('pointerdown', 0, 0);
    fire('pointermove', 40, 0);
    fire('pointermove', 80, 0);
    fire('pointerup', 80, 0);
  });
  const s = await page.evaluate(() => window.__game!.state());
  expect([s.sailor.gx, s.sailor.gy]).toEqual([1, 0]);
  expect(s.stats.throws).toBe(0);
  expect(s.walkHint).toBe(false);
  await expect(hint).toBeHidden();
  await page.screenshot({ path: 'build/shots/m0-07_walk_phone.png' });
  expect(errors).toEqual([]);
});

test('узкое окно ПК: подсказка уходит под полосу опыта (приёмка 09.10)', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'сценарий ПК');
  const errors = await secondCell(page);
  await page.setViewportSize({ width: 520, height: 360 });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const vp = page.viewportSize()!;
  const r = await boxOf(page, 'walk-hint');
  const bar = await boxOf(page, 'xpbar');
  expect(bar.w).toBeGreaterThanOrEqual(280);
  expect(r.y).toBeGreaterThanOrEqual(bar.y + bar.h);
  apart(r, bar);
  inside(r, vp.width, vp.height);
  await page.screenshot({ path: 'build/shots/m0-10_hint_narrow_desktop.png' });
  expect(errors).toEqual([]);
});
