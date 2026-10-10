import { expect, test, type Locator, type Page } from '@playwright/test';

// Финальный бой Лагуны (M1-15): краб-великан на 40-м уровне, полоса его прочности, победа копьём —
// окно «Локация пройдена» с большим сундуком; оно переживает перезагрузку, «Играть дальше» — уровни дальше.
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

test('краб-великан: бой, победа, «Локация пройдена», перезагрузка и «Играть дальше»', async ({ page }, info) => {
  const phone = info.project.name === 'phone';
  const errors = watchErrors(page);
  await page.goto('/?new=1');
  await ready(page);

  // Нажатие по воде под плотом — игра идёт.
  const water = await page.evaluate(() => window.__game!.toScreen(0, 120));
  await tapAt(page, phone, water.x, water.y);
  await expect.poll(() => lastSignal(page)).toBe('gameplayStart');

  // 40-й уровень: краб всплывает с той стороны, где воды больше.
  await page.evaluate(() => window.__game!.setLevel(40));
  await expect.poll(() => page.evaluate(() => window.__game!.state().finalBoss.phase)).toBe('crawl');
  const fb = await page.evaluate(() => window.__game!.state().finalBoss);
  expect(fb.id).toBe('giant_crab');
  expect(phone ? ['top', 'bottom'] : ['left', 'right']).toContain(fb.side);
  expect(fb.hp).toBe(fb.maxHp);
  expect(await page.evaluate(() => window.__game!.state().levelCap)).toBe(40);
  const bar = page.getByTestId('xpbar');
  await expect(bar).toHaveClass(/boss/);
  await expect(bar).toHaveText('Краб-великан');
  await page.screenshot({ path: `build/shots/m1-15_final_boss_${info.project.name}.png` });

  // Копьё (далёкий краб даёт слот), последняя единица прочности и бросок в середину краба.
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

  const cleared = page.getByTestId('cleared');
  await expect(cleared).toBeVisible({ timeout: 10_000 });
  await expect(cleared).toContainText('Локация пройдена');
  await expect(cleared).toContainText('Лагуна');
  await expect(page.getByTestId('big-chest')).toHaveText(/^Большой сундук: \+\d+ опыта$/);
  await expect.poll(() => lastSignal(page)).toBe('gameplayStop');
  const t0 = await page.evaluate(() => window.__game!.world().timeMs);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.__game!.world().timeMs)).toBe(t0);
  await page.screenshot({ path: `build/shots/m1-15_cleared_${info.project.name}.png` });

  // Перезагрузка: окно на месте, бой выигран, локация в записи кампании.
  await page.reload();
  await ready(page);
  await expect(cleared).toBeVisible();
  const after = await page.evaluate(() => window.__game!.state());
  expect(after.finalBoss.phase).toBe('defeated');
  expect(after.level).toBe(40);
  expect(after.cleared).toBe(true);
  expect(await page.evaluate(() => window.__game!.debugSave())).toContain('"passed":["lagoon"]');

  // «Играть дальше»: окно закрыто, игра идёт, предела уровня нет.
  await press(page, phone, page.getByTestId('play-on'));
  await expect(cleared).toBeHidden();
  await expect.poll(() => lastSignal(page)).toBe('gameplayStart');
  expect(await page.evaluate(() => window.__game!.state().levelCap)).toBeNull();
  await page.evaluate(() => window.__game!.debugLevelUp());
  expect(await page.evaluate(() => window.__game!.state().level)).toBe(41);
  await expect(bar).not.toHaveClass(/boss/);

  expect(errors).toEqual([]);
});
