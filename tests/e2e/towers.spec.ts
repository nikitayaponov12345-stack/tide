import { expect, test, type Page } from '@playwright/test';

// Сетевая башня ловит (M1-06): башня на центральной клетке бросает свою сеть, улов идёт в счёт, моряк не бросает.
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

test('сетевая башня бросает сеть и приносит улов', async ({ page }, info) => {
  const errors = watchErrors(page);
  await page.goto('/?new=1');
  await page.waitForFunction(() => window.__game?.ready === true, null, { timeout: 20_000 });

  // До окна 4-го уровня, как в buildings.spec.ts; башня — на центральную клетку, командами.
  await page.evaluate(() => {
    const g = window.__game!;
    g.debugLevelUp();
    if (!g.command.takeCard(g.state().window!.cards.findIndex((c) => c.id === 'raft'))) throw new Error('«Плот» не взят');
    if (!g.command.placeCell(1, 0)) throw new Error('клетка (1, 0) не поставлена');
    g.debugLevelUp();
    const raft = g.state().window!.cards.findIndex((c) => c.id === 'raft');
    if (!g.command.takeCard(raft >= 0 ? raft : 0)) throw new Error('карточка 3-го уровня не взята');
    const build = g.state().build;
    if (build) {
      const c = build.candidates[0]!;
      if (!g.command.placeCell(c.gx, c.gy)) throw new Error('стройка 3-го уровня не закончена');
    }
    g.debugLevelUp();
    const at = g.state().window!.cards.findIndex((c) => c.id === 'net_tower');
    if (!g.command.takeCard(at)) throw new Error('карточка башни не взята');
    if (!g.command.placeCell(0, 0)) throw new Error('башня на (0, 0) не поставлена');
  });
  const towers = await page.evaluate(() => window.__game!.state().towers);
  expect(towers.map((t) => ({ gx: t.gx, gy: t.gy }))).toEqual([{ gx: 0, gy: 0 }]);

  await page.waitForFunction(() => window.__game!.state().towers[0]!.nets.some((n) => n.state === 'pulling'), null, { timeout: 30_000 });
  await page.screenshot({ path: `build/shots/m1-06_tower_net_${info.project.name}.png` });

  await page.waitForFunction(() => window.__game!.state().stats.towerCaught > 0, null, { timeout: 30_000 });
  const stats = await page.evaluate(() => window.__game!.state().stats);
  expect(stats.towerThrows).toBeGreaterThan(0);
  expect(stats.throws).toBe(0);

  expect(errors).toEqual([]);
});
