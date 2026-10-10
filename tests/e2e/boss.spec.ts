import { expect, test, type Page } from '@playwright/test';

// Шхуна Лагуны (M1-08): визит командой отладки вдоль левой стороны, борт в круге дальности моряка, шхуна целиком в поле.
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

test('шхуна: визит вдоль левой стороны, копьё достаёт', async ({ page }, info) => {
  const errors = watchErrors(page);
  await page.goto('/?new=1');
  await page.waitForFunction(() => window.__game?.ready === true, null, { timeout: 20_000 });

  const before = await page.evaluate(() => window.__game!.state().boss);
  expect(before).toMatchObject({ id: 'schooner', visiting: false, visits: 0 });

  await page.evaluate(() => window.__game!.debugBossVisit('left'));
  const boss = await page.evaluate(() => window.__game!.state().boss);
  expect(boss).toMatchObject({ visiting: true, side: 'left' });
  const range = await page.evaluate(() => window.__game!.state().net.range);
  expect(Math.abs(boss.x) - boss.hx).toBeLessThanOrEqual(range);

  // Шхуна прошла середину поля на полкорпуса — целиком в поле.
  await expect
    .poll(async () => page.evaluate(() => {
      const b = window.__game!.state().boss;
      return b.y >= b.hy;
    }), { timeout: 30_000 })
    .toBe(true);
  await page.screenshot({ path: `build/shots/m1-08_schooner_${info.project.name}.png` });

  expect(errors).toEqual([]);
});
