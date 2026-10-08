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

  await page.screenshot({ path: `build/shots/m0-01_${info.project.name}.png` });
  expect(errors).toEqual([]);
});
