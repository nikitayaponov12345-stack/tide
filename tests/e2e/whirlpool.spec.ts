import { expect, test, type Page } from '@playwright/test';

// Воронка (M1-13): воронка на центральной клетке сама втягивает предметы и даёт опыт, моряк сеть не бросает.
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

test('воронка втягивает предметы', async ({ page }, info) => {
  const errors = watchErrors(page);
  await page.goto('/?new=1');
  await page.waitForFunction(() => window.__game?.ready === true, null, { timeout: 20_000 });

  expect(await page.evaluate(() => window.__game!.debugBuild(0, 0, 'whirlpool'))).toBe(true);
  const pools = await page.evaluate(() => window.__game!.state().whirlpools);
  expect(pools.list).toEqual([{ gx: 0, gy: 0 }]);
  expect(pools.radius).toBeGreaterThan(0);
  await page.screenshot({ path: `build/shots/m1-13_whirlpool_${info.project.name}.png` });

  await expect.poll(() => page.evaluate(() => window.__game!.state().stats.whirlpoolCaught), { timeout: 20_000 }).toBeGreaterThan(0);
  const stats = await page.evaluate(() => window.__game!.state().stats);
  expect(stats.throws).toBe(0);
  expect(Object.values(stats.xpByRole).reduce((a, b) => a + b, 0)).toBeGreaterThan(0);

  expect(errors).toEqual([]);
});
