import { expect, test, type Page } from '@playwright/test';

// «Новые карточки» за рекламу (M1-18): после refresh_after_cards взятых карточек в окне выбора — кнопка; досмотрел —
// в том же окне новые карточки, второй раз нельзя; обновлённое окно переживает перезагрузку. Без рекламы за награду кнопки нет.
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

async function ready(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await page.waitForFunction(() => window.__game?.ready === true, null, { timeout: 20_000 });
}

/** n окон подряд: первая доступная карточка, стройка — на первое место; затем ещё одно окно. */
async function takeCards(page: Page, n: number): Promise<void> {
  await page.evaluate((n) => {
    const g = window.__game!;
    for (let i = 0; i < n; i++) {
      g.debugLevelUp();
      const w = g.state().window;
      if (!w) throw new Error(`окно ${i + 1} не открылось`);
      if (!g.command.takeCard(w.cards.findIndex((c) => c.available))) throw new Error(`карточка окна ${i + 1} не взята`);
      const build = g.state().build;
      if (build) {
        const c = build.candidates[0];
        if (!c || !g.command.placeCell(c.gx, c.gy)) throw new Error(`стройка окна ${i + 1} не закончена`);
      }
    }
    g.debugLevelUp();
    if (!g.state().window) throw new Error('последнее окно не открылось');
  }, n);
}

const windowOf = (page: Page) => page.evaluate(() => window.__game!.state().window!);

test('после 8 карточек — кнопка, реклама, новые карточки, перезагрузка помнит', async ({ page }, info) => {
  const errors = watchErrors(page);
  await ready(page, '/?new=1');

  await takeCards(page, 7);
  await expect(page.getByTestId('cards')).toBeVisible();
  expect((await windowOf(page)).canRefresh).toBe(false);
  await expect(page.getByTestId('cards-refresh')).toHaveCount(0);

  // 8-я карточка — из этого окна, затем новое окно.
  await page.evaluate(() => {
    const g = window.__game!;
    if (!g.command.takeCard(g.state().window!.cards.findIndex((c) => c.available))) throw new Error('8-я карточка не взята');
    const build = g.state().build;
    if (build) {
      const c = build.candidates[0];
      if (!c || !g.command.placeCell(c.gx, c.gy)) throw new Error('стройка 8-й карточки не закончена');
    }
  });
  await takeCards(page, 0);
  const refresh = page.getByTestId('cards-refresh');
  await expect(refresh).toBeVisible();
  await expect(refresh).toHaveText('Новые карточки за рекламу');
  const before = await windowOf(page);
  expect(before.canRefresh).toBe(true);
  expect(before.refreshed).toBe(false);
  await page.screenshot({ path: `build/shots/m1-18_refresh_${info.project.name}.png` });

  await page.waitForTimeout(400); // защита окна от двойного нажатия
  await refresh.click();
  await expect.poll(async () => (await windowOf(page)).refreshed, { timeout: 10_000 }).toBe(true);
  const after = await windowOf(page);
  const old = before.cards.map((c) => c.id);
  for (const c of after.cards) if (c.id !== 'raft') expect(old).not.toContain(c.id);
  expect(after.canRefresh).toBe(false);
  await expect(page.getByTestId('cards-refresh')).toHaveCount(0);
  await expect(page.getByTestId('card')).toHaveCount(after.cards.length);
  const log = (await page.evaluate(() => window.__game!.platformLog())).map((c) => c.name);
  expect(log[log.length - 1]).toBe('rewarded');

  await page.reload();
  await page.waitForFunction(() => window.__game?.ready === true, null, { timeout: 20_000 });
  await expect(page.getByTestId('cards')).toBeVisible();
  const restored = await windowOf(page);
  expect(restored.cards).toEqual(after.cards);
  expect(restored.refreshed).toBe(true);
  await expect(page.getByTestId('cards-refresh')).toHaveCount(0);

  expect(errors).toEqual([]);
});

test('без рекламы за награду кнопки нет', async ({ page }) => {
  const errors = watchErrors(page);
  await ready(page, '/?new=1&rewarded=0');

  await takeCards(page, 8);
  await expect(page.getByTestId('cards')).toBeVisible();
  expect((await windowOf(page)).canRefresh).toBe(false);
  await expect(page.getByTestId('cards-refresh')).toHaveCount(0);

  expect(errors).toEqual([]);
});
