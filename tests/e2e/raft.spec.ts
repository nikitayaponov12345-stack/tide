import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

// Укус краба и прочность клеток: краб идёт мимо центральной клетки и кусает соседнюю; разбитая клетка серая, на неё не шагнуть.
test.use({ locale: 'ru-RU' });
test.setTimeout(90_000);

/** Строки CSV по заголовку: колонка → значение. */
function rows(file: string): Array<Record<string, string>> {
  const [head, ...lines] = readFileSync(file, 'utf8').split(/\r?\n/).filter((l) => l.trim() !== '');
  const keys = head!.split(',');
  return lines.map((l) => {
    const cells = l.split(',');
    return Object.fromEntries(keys.map((k, i) => [k, cells[i] ?? '']));
  });
}

const CELL_HP = Number(rows('data/constants.csv').find((r) => r.key === 'cell_hp')!.value);
const LAGOON = rows('data/locations.csv').find((r) => r.id === 'lagoon')!;
const CRAB = rows('data/enemies.csv').find((r) => r.id === LAGOON.enemy_id)!;
const BITE = Number(CRAB.damage) * Number(LAGOON.enemy_dmg_mult);

test('укус клетки, разбитая клетка и неуязвимая центральная', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  expect(CELL_HP).toBeGreaterThan(0);
  expect(BITE).toBeGreaterThan(0);
  // Без обучения (M1-20): иначе мир стоит у первого краба, пока моряк не попадёт копьём
  await page.goto('/?new=1&tutorial=0');
  await page.waitForFunction(() => window.__game?.ready === true, null, { timeout: 20_000 });

  // 1. Клетка (1, 0) и краб справа: центр от него дальше всех, но цель — (1, 0).
  const placed = await page.evaluate(() => {
    const g = window.__game!;
    g.debugLevelUp();
    const took = g.command.takeCard(0);
    const put = g.command.placeCell(1, 0);
    g.debugSpawnEnemy(240, 0);
    return took && put;
  });
  expect(placed).toBe(true);

  // 2. Укус по приходу.
  const hpOf = (gx: number, gy: number) =>
    page.evaluate(([x, y]) => window.__game!.state().raft.find((c) => c.gx === x && c.gy === y)!.hp, [gx, gy] as const);
  await expect.poll(() => hpOf(1, 0), { timeout: 30_000 }).toBeLessThan(CELL_HP);
  expect(await hpOf(1, 0)).toBe(CELL_HP - BITE);
  expect(await hpOf(0, 0)).toBe(CELL_HP);
  expect((await page.evaluate(() => window.__game!.state())).stats.bites).toBe(1);
  await page.screenshot({ path: `build/shots/m1-03_bite_${info.project.name}.png` });

  // 3. Разбить (1, 0): на неё не шагнуть; центральная неуязвима.
  const res = await page.evaluate((hp) => {
    const g = window.__game!;
    const dealt = g.debugDamageCell(1, 0, hp);
    const walked = g.command.walk(1, 0);
    const center = g.debugDamageCell(0, 0, 1000);
    return { dealt, walked, center };
  }, CELL_HP);
  expect(res).toEqual({ dealt: CELL_HP - BITE, walked: false, center: 0 });
  expect(await hpOf(1, 0)).toBe(0);
  expect(await hpOf(0, 0)).toBe(CELL_HP);
  await page.screenshot({ path: `build/shots/m1-03_broken_${info.project.name}.png` });
  expect(errors).toEqual([]);
});
