import { expect, test, type Page } from '@playwright/test';

// Окно выбора и стройка плота: окно на экране, выбор в два нажатия, стройка мышью и пальцем, ряд и стопка.
test.use({ locale: 'ru-RU' });
test.setTimeout(90_000);

type Rect = { x: number; y: number; w: number; h: number };

async function cardRects(page: Page): Promise<Rect[]> {
  return page.locator('[data-testid="card"]').evaluateAll((els) =>
    els.map((e) => {
      const r = e.getBoundingClientRect();
      return { x: r.left, y: r.top, w: r.width, h: r.height };
    }),
  );
}

/** Прямоугольник целиком внутри окна браузера. */
function inside(r: Rect, vw: number, vh: number): void {
  expect(r.x).toBeGreaterThanOrEqual(-0.5);
  expect(r.y).toBeGreaterThanOrEqual(-0.5);
  expect(r.x + r.w).toBeLessThanOrEqual(vw + 0.5);
  expect(r.y + r.h).toBeLessThanOrEqual(vh + 0.5);
}

async function boxOf(page: Page, testid: string): Promise<Rect> {
  const b = (await page.getByTestId(testid).boundingBox())!;
  return { x: b.x, y: b.y, w: b.width, h: b.height };
}

/** Нажатие в центр кнопки после защиты от двойного нажатия. */
async function press(page: Page, phone: boolean, loc: ReturnType<Page['locator']>): Promise<void> {
  await expect(loc).toBeEnabled();
  const b = (await loc.boundingBox())!;
  const x = b.x + b.width / 2;
  const y = b.y + b.height / 2;
  if (phone) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
}

/** Выбрать карточку i и взять её; «Плот» — сразу поставить клетку на первое место. */
async function takeAndBuild(page: Page, phone: boolean, i: number): Promise<void> {
  await press(page, phone, page.locator('[data-testid="card"]').nth(i));
  await press(page, phone, page.getByTestId('take'));
  await expect(page.getByTestId('cards')).toBeHidden();
  const build = await page.evaluate(() => window.__game!.state().build);
  if (build) {
    const c = build.candidates[0]!;
    expect(await page.evaluate(([gx, gy]) => window.__game!.command.placeCell(gx!, gy!), [c.gx, c.gy])).toBe(true);
  }
}

test('окно выбора и стройка плота', async ({ page }, info) => {
  const phone = info.project.name === 'phone';
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.ready === true, null, { timeout: 20_000 });
  const vp = page.viewportSize()!;

  // 1. Окно 2 уровня: одна карточка «Плот», заголовок, всё на экране, время мира стоит.
  await page.evaluate(() => window.__game!.debugLevelUp());
  const dim = page.getByTestId('cards');
  await expect(dim).toBeVisible();
  await expect(page.locator('.cards-title')).toHaveText('Новый уровень!');
  await expect(page.locator('.cards-sub')).toHaveText('Выбери улучшение');
  const cards = page.locator('[data-testid="card"]');
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toContainText('Плот');
  await expect(page.getByTestId('take')).toBeHidden();
  for (const r of await cardRects(page)) inside(r, vp.width, vp.height);
  const t0 = await page.evaluate(() => window.__game!.world().timeMs);
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.__game!.world().timeMs)).toBe(t0);
  await page.screenshot({ path: `build/shots/m0-06_window_${info.project.name}.png` });

  // 2. Выбор → «Взять» → стройка: 4 места.
  await press(page, phone, cards.first());
  await expect(page.getByTestId('take')).toBeVisible();
  inside(await boxOf(page, 'take'), vp.width, vp.height);
  await press(page, phone, page.getByTestId('take'));
  await expect(dim).toBeHidden();
  const build = await page.evaluate(() => window.__game!.state().build);
  expect(build?.candidates).toHaveLength(4);
  const cell = await page.evaluate(() => window.__game!.cellToScreen(1, 0));
  if (phone) {
    await page.touchscreen.tap(cell.x, cell.y);
    await expect(page.getByTestId('place')).toBeVisible();
    expect(await page.evaluate(() => window.__game!.state().raft.length)).toBe(1);
    inside(await boxOf(page, 'place'), vp.width, vp.height);
    await page.screenshot({ path: 'build/shots/m0-06_build_phone.png' });
    await press(page, phone, page.getByTestId('place'));
  } else {
    await page.mouse.move(cell.x, cell.y);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    await expect(page.getByTestId('place')).toBeHidden();
    await page.screenshot({ path: 'build/shots/m0-06_build_desktop.png' });
    await page.mouse.click(cell.x, cell.y);
  }
  await expect.poll(() => page.evaluate(() => window.__game!.state().raft.length)).toBe(2);
  const s = await page.evaluate(() => window.__game!.state());
  expect(s.build).toBeNull();
  expect(s.raft).toContainEqual(expect.objectContaining({ gx: 1, gy: 0 }));
  await expect(page.getByTestId('place')).toBeHidden();

  // 3. Окно 3 уровня, затем окно 4 уровня из трёх карточек: ряд или стопка.
  await page.evaluate(() => window.__game!.debugLevelUp());
  await expect(cards).toHaveCount(2);
  await takeAndBuild(page, phone, 0);
  await page.evaluate(() => window.__game!.debugLevelUp());
  await expect(cards).toHaveCount(3);
  expect(await page.evaluate(() => window.__game!.state().window?.level)).toBe(4);
  const before = await cardRects(page);
  for (const r of before) inside(r, vp.width, vp.height);
  if (phone) {
    for (const r of before) expect(Math.abs(r.x - before[0]!.x)).toBeLessThanOrEqual(2);
    for (let i = 1; i < before.length; i++) expect(before[i]!.y).toBeGreaterThan(before[i - 1]!.y + before[i - 1]!.h - 1);
  } else {
    for (const r of before) expect(Math.abs(r.y - before[0]!.y)).toBeLessThanOrEqual(2);
    for (let i = 1; i < before.length; i++) expect(before[i]!.x).toBeGreaterThan(before[i - 1]!.x);
  }
  await press(page, phone, cards.nth(1));
  await expect(page.getByTestId('take')).toBeVisible();
  expect(await cardRects(page)).toEqual(before);
  inside(await boxOf(page, 'take'), vp.width, vp.height);
  await page.screenshot({ path: `build/shots/m0-06_window3_${info.project.name}.png` });

  expect(errors).toEqual([]);
});

test('защита окна 300 мс от двойного нажатия (приёмка 09.10)', async ({ page }, info) => {
  const phone = info.project.name === 'phone';
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.ready === true, null, { timeout: 20_000 });

  // Моменты ловит MutationObserver: его вызов приходит сразу после кадра, в котором окно перестроилось.
  const r = await page.evaluate(() => new Promise<{ shownAt: number; readyAt: number; disabled: boolean; selected: boolean }>((resolve, reject) => {
    const dim = document.querySelector<HTMLElement>('[data-testid="cards"]')!;
    let shown: { at: number; disabled: boolean; selected: boolean } | null = null;
    const obs = new MutationObserver(() => {
      const card = dim.querySelector<HTMLButtonElement>('[data-testid="card"]');
      if (dim.hidden || !card) return;
      const now = performance.now();
      if (shown === null) {
        const disabled = card.disabled;
        card.click();
        shown = { at: now, disabled, selected: card.classList.contains('selected') };
      }
      if (!card.disabled) {
        obs.disconnect();
        clearTimeout(timer);
        resolve({ shownAt: shown.at, readyAt: now, disabled: shown.disabled, selected: shown.selected });
      }
    });
    const timer = setTimeout(() => {
      obs.disconnect();
      reject(new Error('окно не стало активным за 5 с'));
    }, 5000);
    obs.observe(dim, { attributes: true, childList: true, subtree: true });
    window.__game!.debugLevelUp();
  }));
  expect(r.disabled).toBe(true);
  expect(r.selected).toBe(false);
  expect(r.readyAt - r.shownAt).toBeGreaterThanOrEqual(250);

  const card = page.locator('[data-testid="card"]').first();
  await press(page, phone, card);
  await expect(card).toHaveClass(/\bselected\b/);
});

test('«Поставить» уходит наверх, если закрыла бы призрак (приёмка 09.10)', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'горизонталь 1280×720');
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.ready === true, null, { timeout: 20_000 });

  // Клетки (0, 1)…(0, 3) — тремя «Плотами», четвёртый остаётся в стройке.
  const placed = await page.evaluate(() => {
    const g = window.__game!;
    let cells = 0;
    for (let ups = 0; ups < 60; ups++) {
      if (g.state().window === null) g.debugLevelUp();
      const w = g.state().window;
      if (w === null) continue;
      const raft = w.cards.findIndex((c) => c.id === 'raft' && c.available);
      if (raft >= 0) {
        if (!g.command.takeCard(raft)) throw new Error('«Плот» не взят');
        if (cells === 3) return cells;
        if (!g.command.placeCell(0, cells + 1)) throw new Error(`клетка (0, ${cells + 1}) не поставлена`);
        cells++;
      } else {
        const i = w.cards.findIndex((c) => c.available);
        if (!g.command.takeCard(i)) throw new Error('карточка не взята');
      }
    }
    return cells;
  });
  expect(placed).toBe(3);
  const s = await page.evaluate(() => window.__game!.state());
  expect(s.build?.card).toBe('raft');
  expect(s.build?.candidates).toContainEqual({ gx: 0, gy: 4 });

  // Касание переносит призрак на (0, 4): у проекта desktop касаний нет — события синтетические.
  await page.evaluate(() => {
    const p = window.__game!.cellToScreen(0, 4);
    const canvas = document.querySelector('#game canvas')!;
    for (const type of ['pointerdown', 'pointerup']) {
      canvas.dispatchEvent(new PointerEvent(type, {
        pointerType: 'touch', pointerId: 12, isPrimary: true, clientX: p.x, clientY: p.y, bubbles: true,
      }));
    }
  });
  const place = page.getByTestId('place');
  await expect(place).toBeVisible();
  const btn = await boxOf(page, 'place');
  const cell = await page.evaluate(() => {
    const g = window.__game!;
    const c = g.cellToScreen(0, 4);
    const half = (g.cellToScreen(0, 5).y - c.y) / 2;
    return { x: c.x - half, y: c.y - half, w: 2 * half, h: 2 * half };
  });
  const overlaps = btn.x < cell.x + cell.w && btn.x + btn.w > cell.x && btn.y < cell.y + cell.h && btn.y + btn.h > cell.y;
  expect(overlaps).toBe(false);
  const bar = await boxOf(page, 'xpbar');
  expect(btn.y).toBeGreaterThanOrEqual(bar.y + bar.h);
  await page.screenshot({ path: 'build/shots/m0-10_place_top_desktop.png' });

  await page.mouse.click(btn.x + btn.w / 2, btn.y + btn.h / 2);
  await expect.poll(() => page.evaluate(() => window.__game!.state().raft)).toContainEqual(expect.objectContaining({ gx: 0, gy: 4 }));
});
