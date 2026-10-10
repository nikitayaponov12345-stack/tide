import { expect, test, type Page } from '@playwright/test';

// Шторм Лагуны (M1-07): событие командой отладки, вода темнеет, краб виден целиком, таймер идёт.
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

test('шторм: событие идёт, таймер убывает', async ({ page }, info) => {
  const errors = watchErrors(page);
  await page.goto('/?new=1');
  await page.waitForFunction(() => window.__game?.ready === true, null, { timeout: 20_000 });

  const before = await page.evaluate(() => window.__game!.state().event);
  expect(before).toMatchObject({ active: false, count: 0 });

  await page.evaluate(() => {
    const g = window.__game!;
    g.debugEvent();
    g.debugSpawnEnemy(200, 200);
  });
  const ev = await page.evaluate(() => window.__game!.state().event);
  expect(ev).toMatchObject({ id: 'storm', active: true, count: 1 });

  await expect.poll(() => page.evaluate(() => window.__game!.state().event.leftMs), { timeout: 20_000 }).toBeLessThan(ev.leftMs);
  await page.screenshot({ path: `build/shots/m1-07_storm_${info.project.name}.png` });

  expect(errors).toEqual([]);
});
