import { expect, test, type Page } from '@playwright/test';

// Буст (M1-11): командой отладки, в полосе опыта — «Буст N с», остаток убывает.
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

test('буст: в полосе опыта «Буст», остаток убывает', async ({ page }, info) => {
  const errors = watchErrors(page);
  await page.goto('/?new=1');
  await page.waitForFunction(() => window.__game?.ready === true, null, { timeout: 20_000 });

  const bar = page.getByTestId('xpbar');
  const before = await page.evaluate(() => window.__game!.state().boost);
  expect(before.active).toBe(false);
  await expect(bar).not.toContainText('Буст');

  await page.evaluate(() => window.__game!.debugBoost());
  const boost = await page.evaluate(() => window.__game!.state().boost);
  expect(boost.active).toBe(true);
  await expect(bar).toContainText('Буст');

  await expect.poll(() => page.evaluate(() => window.__game!.state().boost.leftMs), { timeout: 20_000 }).toBeLessThan(boost.leftMs);
  await page.screenshot({ path: `build/shots/m1-11_boost_${info.project.name}.png` });

  expect(errors).toEqual([]);
});
