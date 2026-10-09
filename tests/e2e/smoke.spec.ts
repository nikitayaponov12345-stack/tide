import { expect, test } from '@playwright/test';

// Смоук собранной игры: страница открывается без ошибок, холст есть, поле засеяно, поток идёт, раскладка верная.
test('игра запускается и рисует сцену', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  await page.goto('/');
  await page.waitForFunction(() => window.__game?.ready === true, null, { timeout: 20_000 });

  const canvas = page.locator('#game canvas');
  await expect(canvas).toHaveCount(1);
  const box = await canvas.boundingBox();
  expect(box?.width ?? 0).toBeGreaterThan(100);
  expect(box?.height ?? 0).toBeGreaterThan(100);

  const start = await page.evaluate(() => window.__game!.world());
  expect(start.level).toBe(1);
  expect(start.seeded).toBeGreaterThanOrEqual(23);
  expect(start.items).toBeGreaterThan(0);

  const before = start.timeMs;
  await page.waitForTimeout(1500);
  const after = await page.evaluate(() => window.__game!.world());
  expect(after.timeMs).toBeGreaterThan(before + 300);
  expect(after.spawned).toBeGreaterThan(0);

  const layout = await page.evaluate(() => window.__game!.layout());
  expect(layout).toBe(info.project.name === 'phone' ? 'portrait' : 'landscape');

  const calls = await page.evaluate(() => window.__game!.platformLog().map((c) => c.name));
  expect(calls).toContain('loadingFinished');

  // Сборка `npm run check` идёт без метки публикации.
  expect(await page.evaluate(() => window.__game!.build)).toBe('dev');

  await page.screenshot({ path: `build/shots/m0-01_${info.project.name}.png` });
  await page.screenshot({ path: `build/shots/m0-04_${info.project.name}.png` });
  expect(errors).toEqual([]);
});

// Мышью: щелчок по предмету бросает сеть, удержание тянет её к моряку, улов даёт опыт.
test('сеть ловит и даёт опыт', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  await page.goto('/');
  await page.waitForFunction(() => window.__game?.ready === true, null, { timeout: 20_000 });

  let gotXp = false;
  let shot = false;
  for (let attempt = 0; attempt < 4 && !gotXp; attempt++) {
    const target = await page.evaluate(() => {
      const g = window.__game!;
      const range = g.state().net.range;
      const items = g.items().sort((a, b) => Math.hypot(a.x, a.y) - Math.hypot(b.x, b.y));
      const it = items.find((i) => Math.hypot(i.x, i.y) <= range) ?? items[0]!;
      return g.toScreen(it.x, it.y);
    });
    await page.mouse.click(target.x, target.y);
    const afterClick = await page.evaluate(() => window.__game!.state().net.state);
    expect(afterClick).not.toBe('ready');
    if (!shot) {
      await page.screenshot({ path: `build/shots/m0-02_${info.project.name}.png` });
      shot = true;
    }
    await page.mouse.down();
    await page.waitForFunction(() => window.__game!.state().net.state === 'ready', null, { timeout: 8_000 });
    await page.mouse.up();
    await page.waitForTimeout(1500);
    const s = await page.evaluate(() => window.__game!.state());
    gotXp = s.xp > 0 || s.level > 1;
  }
  expect(gotXp).toBe(true);
  expect(errors).toEqual([]);
});

// Классическая схема на телефоне: касание по воде бросает сеть по отпусканию.
test('касание бросает сеть по отпусканию', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'касание — только в раскладке телефона');
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto('/');
  await page.waitForFunction(() => window.__game?.ready === true, null, { timeout: 20_000 });

  const p = await page.evaluate(() => window.__game!.toScreen(100, -100));
  await page.touchscreen.tap(p.x, p.y);
  const s = await page.evaluate(() => window.__game!.state());
  expect(s.stats.throws).toBe(1);
  expect(s.net.state).not.toBe('ready');
  expect(errors).toEqual([]);
});
