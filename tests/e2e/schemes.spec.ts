import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

// Схемы управления настоящими событиями мыши: каждая за 15 с ловит хотя бы один предмет. Сводка пробы — снимок.
test.use({ locale: 'ru-RU' });

type Pt = { x: number; y: number };

/** Число из data/constants.csv (тест идёт в Node, таблицы игры через ?raw ему недоступны). */
function constant(key: string): number {
  const row = readFileSync('data/constants.csv', 'utf8').split(/\r?\n/).find((l) => l.startsWith(`${key},`));
  const v = Number(row?.split(',')[1]);
  if (!Number.isFinite(v)) throw new Error(`constants.csv: нет числа ${key}`);
  return v;
}
const POWER = constant('scheme_d_power');

async function open(page: Page, scheme: string): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto(`/?scheme=${scheme}`);
  await page.waitForFunction(() => window.__game?.ready === true, null, { timeout: 20_000 });
  expect(await page.evaluate(() => window.__game!.state().scheme)).toBe(scheme);
  return errors;
}

/** Ближайший к плоту предмет в пределах дальности: точка мира и точка экрана. */
async function nearestItem(page: Page): Promise<{ world: Pt; screen: Pt }> {
  return page.evaluate(() => {
    const g = window.__game!;
    const range = g.state().net.range;
    const items = g.items().sort((a, b) => Math.hypot(a.x, a.y) - Math.hypot(b.x, b.y));
    const it = items.find((i) => Math.hypot(i.x, i.y) <= range) ?? items[0]!;
    return { world: { x: it.x, y: it.y }, screen: g.toScreen(it.x, it.y) };
  });
}

const toScreen = (page: Page, p: Pt): Promise<Pt> => page.evaluate(({ x, y }) => window.__game!.toScreen(x, y), p);
const caught = (page: Page): Promise<number> => page.evaluate(() => window.__game!.state().stats.itemsCaught);
const waitNet = (page: Page, states: string[], timeout = 8_000): Promise<unknown> =>
  page.waitForFunction((s) => s.includes(window.__game!.state().net.state), states, { timeout });

/** Попытки одной схемы, пока не пойман предмет или не вышли 15 с. */
async function catchWithin15s(page: Page, attempt: () => Promise<void>): Promise<void> {
  const until = Date.now() + 15_000;
  while (Date.now() < until && (await caught(page)) < 1) {
    await attempt();
    await waitNet(page, ['ready'], Math.max(1_000, until - Date.now())).catch(() => undefined);
  }
  expect(await caught(page)).toBeGreaterThanOrEqual(1);
}

const SCENARIOS: Record<string, (page: Page) => Promise<void>> = {
  // А: щелчок в предмет, удержание до возврата сети.
  a: async (page) => {
    const t = await nearestItem(page);
    await page.mouse.click(t.screen.x, t.screen.y);
    await waitNet(page, ['lying', 'pulling', 'ready']);
    await page.mouse.down();
    await waitNet(page, ['ready']).catch(() => undefined);
    await page.mouse.up();
  },
  // Б: щелчок в предмет, дождаться автотяги, удержание до возврата.
  b: async (page) => {
    const t = await nearestItem(page);
    await page.mouse.click(t.screen.x, t.screen.y);
    await waitNet(page, ['pulling', 'ready']);
    await page.mouse.down();
    await waitNet(page, ['ready']).catch(() => undefined);
    await page.mouse.up();
  },
  // В: нажать на предмет и провести 100 точек дизайна в сторону плота, отпустить.
  c: async (page) => {
    const t = await nearestItem(page);
    await page.mouse.move(t.screen.x, t.screen.y);
    await page.mouse.down();
    const d = Math.hypot(t.world.x, t.world.y) || 1;
    const k = Math.max(0, d - 100) / d;
    const to = await toScreen(page, { x: t.world.x * k, y: t.world.y * k });
    await page.mouse.move(to.x, to.y, { steps: 10 });
    await page.mouse.up();
  },
  // Г: нажать в центр плота; после нажатия прочитать предмет; одним движением увести мышь
  // в противоположную сторону на 1 / scheme_d_power расстояния до него и отпустить.
  d: async (page) => {
    const raft = await toScreen(page, { x: 0, y: 0 });
    await page.mouse.move(raft.x, raft.y);
    await page.mouse.down();
    const t = await nearestItem(page);
    const to = await toScreen(page, { x: -t.world.x / POWER, y: -t.world.y / POWER });
    await page.mouse.move(to.x, to.y);
    await page.mouse.up();
  },
};

for (const [scheme, attempt] of Object.entries(SCENARIOS)) {
  test(`схема ${scheme} ловит мышью`, async ({ page }, info) => {
    test.skip(info.project.name === 'phone', 'мышиный сценарий — только в desktop');
    const errors = await open(page, scheme);
    await catchWithin15s(page, () => attempt(page));
    expect(errors).toEqual([]);
  });
}

test('сводка пробы помещается на экран', async ({ page }, info) => {
  const errors = await open(page, 'b');
  await page.evaluate(() => window.__game!.openSummary());
  const box = page.getByTestId('summary').locator('.summary');
  await expect(box).toBeVisible();
  await expect(page.getByTestId('summary-next')).toHaveText('В — трал');
  await expect(page.getByTestId('summary-again')).toBeEnabled();
  await page.screenshot({ path: `build/shots/m0-03_summary_${info.project.name}.png` });

  const r = (await box.boundingBox())!;
  const vp = page.viewportSize()!;
  expect(r.x).toBeGreaterThanOrEqual(0);
  expect(r.y).toBeGreaterThanOrEqual(0);
  expect(r.x + r.width).toBeLessThanOrEqual(vp.width);
  expect(r.y + r.height).toBeLessThanOrEqual(vp.height);

  // пауза: ядро стоит; «В — трал» начинает новую пробу со следующей схемой
  const t = await page.evaluate(() => window.__game!.world().timeMs);
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.__game!.world().timeMs)).toBe(t);
  await page.getByTestId('summary-next').click();
  await expect(page.getByTestId('summary')).toBeHidden();
  const s = await page.evaluate(() => window.__game!.state());
  expect(s.scheme).toBe('c');
  expect(s.level).toBe(1);
  expect(errors).toEqual([]);
});
