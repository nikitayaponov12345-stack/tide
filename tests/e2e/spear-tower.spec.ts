import { expect, test, type Page } from '@playwright/test';

// Копейная башня (M1-09): башня на центральной клетке бьёт краба своим копьём, моряк копьё не бросает.
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

test('копейная башня бьёт краба', async ({ page }, info) => {
  const errors = watchErrors(page);
  await page.goto('/?new=1');
  await page.waitForFunction(() => window.__game?.ready === true, null, { timeout: 20_000 });

  expect(await page.evaluate(() => window.__game!.debugBuild(0, 0, 'spear_tower'))).toBe(true);
  const towers = await page.evaluate(() => window.__game!.state().spearTowers.list);
  expect(towers).toHaveLength(1);
  expect(towers[0]).toMatchObject({ gx: 0, gy: 0, state: 'ready' });

  await page.evaluate(() => window.__game!.debugSpawnEnemy(150, 0));
  await expect.poll(() => page.evaluate(() => window.__game!.state().stats.towerSpearHits), { timeout: 20_000 }).toBeGreaterThan(0);
  await page.screenshot({ path: `build/shots/m1-09_spear_tower_${info.project.name}.png` });

  const stats = await page.evaluate(() => window.__game!.state().stats);
  expect(stats.towerSpearThrows).toBeGreaterThanOrEqual(stats.towerSpearHits);
  expect(stats.spearThrows).toBe(0);

  expect(errors).toEqual([]);
});
