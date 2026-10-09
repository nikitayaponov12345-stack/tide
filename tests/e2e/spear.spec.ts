import { expect, test, type Page } from '@playwright/test';

// Слоты «Сеть» и «Копьё»: появляются с крабом, переключаются клавишей (ПК) или касанием (телефон); копьё бьёт краба, выпадает добыча.
test.use({ locale: 'ru-RU' });
test.setTimeout(90_000);

type Rect = { x: number; y: number; w: number; h: number };

async function boxOf(page: Page, testid: string): Promise<Rect> {
  const b = (await page.getByTestId(testid).boundingBox())!;
  return { x: b.x, y: b.y, w: b.width, h: b.height };
}

function apart(a: Rect, b: Rect): void {
  const overlaps = a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  expect(overlaps).toBe(false);
}

test('слоты, копьё по крабу и добыча', async ({ page }, info) => {
  const phone = info.project.name === 'phone';
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.ready === true, null, { timeout: 20_000 });

  // 1. До копья слотов нет; краб — слоты видны, целиком на поле, слева внизу.
  await expect(page.getByTestId('slot-net')).toBeHidden();
  await expect(page.getByTestId('slot-spear')).toBeHidden();
  await page.evaluate(() => window.__game!.debugSpawnEnemy(150, 0));
  await expect(page.getByTestId('slot-net')).toBeVisible();
  await expect(page.getByTestId('slot-spear')).toBeVisible();
  await expect(page.getByTestId('slot-net')).toHaveText('Сеть');
  await expect(page.getByTestId('slot-spear')).toHaveText('Копьё');
  const field = await page.evaluate(() => {
    const g = window.__game!;
    const l = g.layout();
    const half = l === 'landscape' ? { w: 640, h: 360 } : { w: 360, h: 640 };
    const a = g.toScreen(-half.w, -half.h);
    const b = g.toScreen(half.w, half.h);
    return { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y };
  });
  const net = await boxOf(page, 'slot-net');
  const spear = await boxOf(page, 'slot-spear');
  for (const r of [net, spear]) {
    expect(r.x).toBeGreaterThanOrEqual(field.x - 0.5);
    expect(r.y).toBeGreaterThanOrEqual(field.y - 0.5);
    expect(r.x + r.w).toBeLessThanOrEqual(field.x + field.w + 0.5);
    expect(r.y + r.h).toBeLessThanOrEqual(field.y + field.h + 0.5);
    // Слева внизу: в левой трети и нижней пятой поля.
    expect(r.x + r.w).toBeLessThan(field.x + field.w / 3);
    expect(r.y).toBeGreaterThan(field.y + (field.h * 4) / 5);
  }
  expect(spear.x).toBeGreaterThan(net.x + net.w - 0.5);
  apart(net, spear);
  for (const r of [net, spear]) apart(r, await boxOf(page, 'hud'));

  // 2. Слот копья.
  if (phone) await page.getByTestId('slot-spear').tap();
  else await page.keyboard.press('Digit2');
  expect(await page.evaluate(() => window.__game!.state().weapon)).toBe('spear');
  await expect(page.getByTestId('slot-spear')).toHaveClass(/selected/);
  await page.screenshot({ path: `build/shots/m0-08_slots_${info.project.name}.png` });

  // 3. Бросок в краба: точка краба и бросок — в одном evaluate (краб движется).
  const thrown = await page.evaluate(() => {
    const g = window.__game!;
    let crab = g.state().enemies.find((e) => e.phase === 'approach' || e.phase === 'wait');
    if (!crab) {
      g.debugSpawnEnemy(150, 0);
      crab = g.state().enemies.find((e) => e.phase === 'approach' || e.phase === 'wait')!;
    }
    return g.command.throwTo(crab.x, crab.y);
  });
  expect(thrown).toBe(true);
  await page.waitForFunction(() => window.__game!.state().spear.state === 'ready', null, { timeout: 10_000 });
  const s = await page.evaluate(() => window.__game!.state());
  expect(s.stats.spearThrows).toBe(1);
  expect(s.stats.spearHits).toBeGreaterThanOrEqual(1);
  expect(s.stats.lootDropped).toBeGreaterThanOrEqual(1);
  expect(s.spear.state).toBe('ready');
  expect(await page.evaluate(() => window.__game!.world().byRole.loot)).toBeGreaterThanOrEqual(1);
  await page.screenshot({ path: `build/shots/m0-08_spear_${info.project.name}.png` });

  // 4. Слот сети — и настоящий щелчок или касание по воде бросает сеть.
  if (phone) await page.getByTestId('slot-net').tap();
  else await page.keyboard.press('Digit1');
  expect(await page.evaluate(() => window.__game!.state().weapon)).toBe('net');
  await expect(page.getByTestId('slot-net')).toHaveClass(/selected/);
  const p = await page.evaluate(() => window.__game!.toScreen(0, -120));
  if (phone) await page.touchscreen.tap(p.x, p.y);
  else await page.mouse.click(p.x, p.y);
  const after = await page.evaluate(() => window.__game!.state());
  expect(after.stats.throws).toBe(1);
  expect(after.net.state).not.toBe('ready');
  expect(after.stats.spearThrows).toBe(1);
  expect(errors).toEqual([]);
});
