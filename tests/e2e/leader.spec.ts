import { expect, test, type Page } from '@playwright/test';

// Краб-вожак в шторм (M1-16): крупнее и прочнее мелкого краба, копьё его бьёт.
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

test('вожак: крупнее краба, копьё снимает прочность', async ({ page }, info) => {
  const phone = info.project.name === 'phone';
  const errors = watchErrors(page);
  await page.goto('/?new=1');
  await page.waitForFunction(() => window.__game?.ready === true, null, { timeout: 20_000 });

  await page.evaluate(() => {
    const g = window.__game!;
    g.setLevel(10);
    g.debugEvent();
    g.debugSpawnEnemy(150, 0);
    g.debugSpawnEnemy(-150, 0, true);
  });
  const list = await page.evaluate(() => window.__game!.state().enemies);
  const crab = list.find((e) => !e.leader)!;
  const leader = list.find((e) => e.leader)!;
  expect(leader.hp).toBe(20);
  expect(leader.radius).toBeGreaterThan(crab.radius);
  await page.screenshot({ path: `build/shots/m1-16_leader_${info.project.name}.png` });

  if (phone) await page.getByTestId('slot-spear').tap();
  else await page.keyboard.press('Digit2');
  expect(await page.evaluate(() => window.__game!.state().weapon)).toBe('spear');
  // Точка вожака и бросок — в одном evaluate: вожак движется.
  const thrown = await page.evaluate(() => {
    const g = window.__game!;
    const l = g.state().enemies.find((e) => e.leader)!;
    return g.command.throwTo(l.x, l.y);
  });
  expect(thrown).toBe(true);
  await expect
    .poll(() => page.evaluate(() => window.__game!.state().enemies.find((e) => e.leader)?.hp ?? 0), { timeout: 10_000 })
    .toBeLessThan(20);

  expect(errors).toEqual([]);
});
