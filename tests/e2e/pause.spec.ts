import { readFileSync } from 'node:fs';
import { expect, test, type Locator, type Page } from '@playwright/test';

// Пауза (M1-02): кнопка и окно, Esc, язык с перезагрузкой на той же партии, «Стереть прогресс» удержанием.
test.use({ locale: 'ru-RU' });
test.setTimeout(90_000);

/** erase_hold_ms из data/constants.csv. */
const ERASE_MS = Number(/^erase_hold_ms,([^,]+),/m.exec(readFileSync('data/constants.csv', 'utf8'))![1]);

type Rect = { x: number; y: number; width: number; height: number };

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

/** Нажатие в центр: мышь на ПК, касание на телефоне. */
async function press(page: Page, phone: boolean, loc: Locator): Promise<void> {
  const b = (await loc.boundingBox())!;
  const x = b.x + b.width / 2;
  const y = b.y + b.height / 2;
  if (phone) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
}

async function lastSignal(page: Page): Promise<string | undefined> {
  return page.evaluate(() => window.__game!.platformLog().filter((c) => c.name.startsWith('gameplay')).at(-1)?.name);
}

const timeMs = (page: Page): Promise<number> => page.evaluate(() => window.__game!.world().timeMs);

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

test('кнопка паузы, окно и «Продолжить»', async ({ page }, info) => {
  const errors = watchErrors(page);
  const phone = info.project.name === 'phone';
  await page.goto('/?new=1');
  await ready(page);
  const vw = page.viewportSize()!.width;

  const btn = page.getByTestId('pause-button');
  await expect(btn).toHaveText('Пауза');
  const b = (await btn.boundingBox())!;
  expect(b.x + b.width / 2).toBeLessThan(vw / 2);
  expect(b.width).toBeGreaterThanOrEqual(96);
  expect(b.height).toBeGreaterThanOrEqual(44);
  expect(overlaps(b, (await page.getByTestId('xpbar').boundingBox())!)).toBe(false);

  await press(page, phone, btn);
  await expect(page.getByTestId('pause')).toBeVisible();
  expect(await page.evaluate(() => window.__game!.state().menu)).toBe(true);
  await expect.poll(() => lastSignal(page)).toBe('gameplayStop');
  const t0 = await timeMs(page);
  await page.waitForTimeout(500);
  expect(await timeMs(page)).toBe(t0);
  await page.screenshot({ path: `build/shots/m1-02_pause_${info.project.name}.png` });

  await press(page, phone, page.getByTestId('pause-resume'));
  await expect(page.getByTestId('pause')).toBeHidden();
  await expect.poll(() => lastSignal(page)).toBe('gameplayStart');
  await page.waitForFunction((t) => window.__game!.world().timeMs > t + 100, t0);
  expect(errors).toEqual([]);
});

test('Esc открывает и закрывает; поверх окна выбора — нет', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'Esc — только на ПК');
  const errors = watchErrors(page);
  await page.goto('/?new=1');
  await ready(page);
  const menu = (): Promise<boolean> => page.evaluate(() => window.__game!.state().menu);

  await page.keyboard.press('Escape');
  await expect(page.getByTestId('pause')).toBeVisible();
  expect(await menu()).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('pause')).toBeHidden();
  expect(await menu()).toBe(false);

  await page.evaluate(() => window.__game!.debugLevelUp());
  await expect(page.getByTestId('cards')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);
  expect(await menu()).toBe(false);
  await expect(page.getByTestId('pause')).toBeHidden();
  expect(errors).toEqual([]);
});

test('язык: перезагрузка на той же партии и запоминание', async ({ page }, info) => {
  const errors = watchErrors(page);
  const phone = info.project.name === 'phone';
  await page.goto('/?new=1');
  await ready(page);
  await page.evaluate(() => window.__game!.setLevel(3));
  await press(page, phone, page.getByTestId('pause-button'));
  await expect(page.getByTestId('lang-ru')).toHaveClass(/selected/);
  await expect(page.getByTestId('lang-en')).not.toHaveClass(/selected/);

  await Promise.all([page.waitForEvent('load', { timeout: 30_000 }), press(page, phone, page.getByTestId('lang-en'))]);
  await ready(page);
  expect(await page.evaluate(() => [window.__game!.resumed, window.__game!.state().level])).toEqual([true, 3]);
  await expect(page.getByTestId('xpbar')).toHaveText('Level 3');
  await expect(page.getByTestId('pause-button')).toHaveText('Pause');

  await page.reload();
  await ready(page);
  await expect(page.getByTestId('pause-button')).toHaveText('Pause');
  await press(page, phone, page.getByTestId('pause-button'));
  await expect(page.getByTestId('lang-en')).toHaveClass(/selected/);
  await Promise.all([page.waitForEvent('load', { timeout: 30_000 }), press(page, phone, page.getByTestId('lang-ru'))]);
  await ready(page);
  await expect(page.getByTestId('pause-button')).toHaveText('Пауза');
  expect(errors).toEqual([]);
});

test('«Стереть прогресс»: отпустил раньше — цело, удержал — с 1 уровня', async ({ page }, info) => {
  const errors = watchErrors(page);
  const phone = info.project.name === 'phone';
  await page.goto('/?new=1');
  await ready(page);
  await page.evaluate(() => {
    const g = window.__game!;
    g.debugLevelUp();
    g.command.takeCard(0);
    g.command.placeCell(1, 0);
    g.debugSave();
  });
  await press(page, phone, page.getByTestId('pause-button'));
  await expect(page.getByTestId('pause')).toBeVisible();
  const erase = page.getByTestId('erase');
  const eb = (await erase.boundingBox())!;

  /** Нажать «Стереть»: мышь на ПК, синтетический PointerEvent касания на телефоне (у page.touchscreen есть только tap). */
  const down = async (): Promise<void> => {
    if (!phone) {
      await page.mouse.move(eb.x + eb.width / 2, eb.y + eb.height / 2);
      await page.mouse.down();
      return;
    }
    await erase.evaluate((el) => {
      const r = el.getBoundingClientRect();
      el.dispatchEvent(
        new PointerEvent('pointerdown', {
          bubbles: true, cancelable: true, pointerId: 7, pointerType: 'touch', isPrimary: true,
          clientX: r.left + r.width / 2, clientY: r.top + r.height / 2,
        }),
      );
    });
  };

  // Отпускание через 1 с — таймером в странице: обращения Playwright к браузеру на медленной машине идут долго.
  await erase.evaluate((el) => {
    (window as unknown as { __mark?: number }).__mark = 1;
    el.addEventListener(
      'pointerdown',
      () => setTimeout(() => el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 7, pointerType: 'touch' })), 1000),
      { once: true },
    );
  });
  await down();
  // Ждём полный срок удержания: не сброшенное удержание дотикало бы позже.
  await page.waitForTimeout(ERASE_MS + 500);
  if (!phone) await page.mouse.up();
  const kept = await page.evaluate(() => ({
    mark: (window as unknown as { __mark?: number }).__mark,
    menu: window.__game!.state().menu,
    cells: window.__game!.state().raft.length,
  }));
  expect(kept).toEqual({ mark: 1, menu: true, cells: 2 });

  await Promise.all([page.waitForEvent('load', { timeout: 30_000 }), down()]);
  await ready(page);
  const fresh = await page.evaluate(() => ({ resumed: window.__game!.resumed, level: window.__game!.state().level, cells: window.__game!.state().raft.length }));
  expect(fresh).toEqual({ resumed: false, level: 1, cells: 1 });
  expect(errors).toEqual([]);
});
