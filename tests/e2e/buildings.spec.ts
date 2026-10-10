import { expect, test, type Page } from '@playwright/test';

// Постройки (M1-05): карточка сетевой башни в окне 4-го уровня, стройка на центральной клетке под моряком.
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

/** Нажатие в центр кнопки после защиты от двойного нажатия: мышь на ПК, касание на телефоне. */
async function press(page: Page, phone: boolean, loc: ReturnType<Page['locator']>): Promise<void> {
  await expect(loc).toBeEnabled();
  const b = (await loc.boundingBox())!;
  const x = b.x + b.width / 2;
  const y = b.y + b.height / 2;
  if (phone) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
}

test('сетевая башня: карточка 4-го уровня и стройка на центральной клетке', async ({ page }, info) => {
  const phone = info.project.name === 'phone';
  const errors = watchErrors(page);
  await page.goto('/?new=1');
  await page.waitForFunction(() => window.__game?.ready === true, null, { timeout: 20_000 });

  // До окна 4-го уровня: 2-й — «Плот» на (1, 0), 3-й — «Плот», если он есть, на первое место, иначе первая карточка.
  await page.evaluate(() => {
    const g = window.__game!;
    g.debugLevelUp();
    if (!g.command.takeCard(g.state().window!.cards.findIndex((c) => c.id === 'raft'))) throw new Error('«Плот» не взят');
    if (!g.command.placeCell(1, 0)) throw new Error('клетка (1, 0) не поставлена');
    g.debugLevelUp();
    const raft = g.state().window!.cards.findIndex((c) => c.id === 'raft');
    if (!g.command.takeCard(raft >= 0 ? raft : 0)) throw new Error('карточка 3-го уровня не взята');
    const build = g.state().build;
    if (build) {
      const c = build.candidates[0]!;
      if (!g.command.placeCell(c.gx, c.gy)) throw new Error('стройка 3-го уровня не закончена');
    }
    g.debugLevelUp();
  });
  const w = await page.evaluate(() => window.__game!.state().window);
  expect(w?.level).toBe(4);
  const at = w!.cards.findIndex((c) => c.id === 'net_tower');
  expect(at).toBeGreaterThanOrEqual(0);

  // Карточка башни и «Взять» — настоящими нажатиями.
  await press(page, phone, page.locator('[data-testid="card"]').nth(at));
  await press(page, phone, page.getByTestId('take'));
  await expect(page.getByTestId('cards')).toBeHidden();
  const build = await page.evaluate(() => window.__game!.state().build);
  expect(build?.card).toBe('net_tower');
  expect(build?.candidates).toContainEqual({ gx: 0, gy: 0 });

  // Центральная клетка: мышь ставит по отпусканию, палец переносит призрак, ставит «Поставить».
  const cell = await page.evaluate(() => window.__game!.cellToScreen(0, 0));
  if (phone) {
    await page.touchscreen.tap(cell.x, cell.y);
    await expect(page.getByTestId('place')).toBeVisible();
    await press(page, phone, page.getByTestId('place'));
  } else {
    await page.mouse.click(cell.x, cell.y);
  }
  await expect.poll(() => page.evaluate(() => window.__game!.state().raft.find((c) => c.gx === 0 && c.gy === 0)!.building)).toBe('net_tower');
  const s = await page.evaluate(() => window.__game!.state());
  expect(s.build).toBeNull();
  expect({ gx: s.sailor.gx, gy: s.sailor.gy }).toEqual({ gx: 0, gy: 0 });
  await expect(page.getByTestId('place')).toBeHidden();
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.screenshot({ path: `build/shots/m1-05_tower_${info.project.name}.png` });

  expect(errors).toEqual([]);
});
