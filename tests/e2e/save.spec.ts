import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

// Сохранение и продолжение (M1-01): перезагрузка продолжает партию, плашка «Лагуна · N уровень», ?new=1, битая запись.
test.use({ locale: 'ru-RU' });
test.setTimeout(90_000);

const KEY = 'tide.save';
/** resume_plaque_ms из data/constants.csv. */
const PLAQUE_MS = Number(/^resume_plaque_ms,([^,]+),/m.exec(readFileSync('data/constants.csv', 'utf8'))![1]);

/** Ошибки страницы и предупреждения консоли. */
function watchConsole(page: Page): { errors: string[]; warnings: string[] } {
  const out = { errors: [] as string[], warnings: [] as string[] };
  page.on('pageerror', (e) => out.errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') out.errors.push(m.text());
    if (m.type() === 'warning') out.warnings.push(m.text());
  });
  return out;
}

async function ready(page: Page): Promise<void> {
  await page.waitForFunction(() => window.__game?.ready === true, null, { timeout: 20_000 });
}

/** Перезагрузка, когда до неё сработает initScript, кладущий text в запись. */
async function reloadWithSave(page: Page, text: string): Promise<void> {
  await page.addInitScript(([k, t]) => localStorage.setItem(k!, t!), [KEY, text]);
  await page.reload();
  await ready(page);
}

test('продолжение с того же места и плашка', async ({ page }, info) => {
  const log = watchConsole(page);
  await page.goto('/?new=1');
  await ready(page);
  expect(new URL(page.url()).search).toBe('');
  expect(await page.evaluate(() => window.__game!.resumed)).toBe(false);
  await expect(page.getByTestId('resume-plaque')).toHaveCount(0);

  const before = await page.evaluate(() => {
    const g = window.__game!;
    g.debugLevelUp();
    g.command.takeCard(0);
    g.command.placeCell(1, 0);
    g.command.walk(1, 0);
    g.debugSave();
    const s = g.state();
    return { level: s.level, raft: s.raft, sailor: { gx: s.sailor.gx, gy: s.sailor.gy }, steps: s.stats.steps };
  });
  expect(before.sailor).toEqual({ gx: 1, gy: 0 });

  // Плашку ловит MutationObserver с самого начала загрузки: Playwright может получить управление позже, чем она скроется.
  await page.addInitScript(() => {
    const w = window as unknown as { __plaque?: { text: string; shownAt?: number; hiddenAt?: number } };
    new MutationObserver(() => {
      const el = document.querySelector<HTMLElement>('[data-testid="resume-plaque"]');
      if (!el) return;
      const p = (w.__plaque ??= { text: '' });
      if (!el.hidden && p.shownAt === undefined) {
        p.shownAt = performance.now();
        p.text = el.textContent ?? '';
      } else if (el.hidden && p.shownAt !== undefined && p.hiddenAt === undefined) {
        p.hiddenAt = performance.now();
      }
    }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden'] });
  });
  await page.reload();
  await ready(page);
  const plaque = page.getByTestId('resume-plaque');
  await expect(plaque).toBeHidden({ timeout: 10_000 });

  const after = await page.evaluate(() => {
    const g = window.__game!;
    const s = g.state();
    return { resumed: g.resumed, level: s.level, raft: s.raft, sailor: { gx: s.sailor.gx, gy: s.sailor.gy }, steps: s.stats.steps };
  });
  expect(after).toEqual({ resumed: true, ...before });
  const seen = await page.evaluate(() => (window as unknown as { __plaque?: { text: string; shownAt?: number; hiddenAt?: number } }).__plaque);
  expect(seen?.text).toBe('Лагуна · 2 уровень');
  expect(seen?.shownAt).toBeDefined();
  expect(seen?.hiddenAt).toBeDefined();
  expect(seen!.hiddenAt! - seen!.shownAt!).toBeGreaterThanOrEqual(PLAQUE_MS - 50);
  await page.screenshot({ path: `build/shots/m1-01_resume_${info.project.name}.png` });
  expect(log.errors).toEqual([]);
});

test('открытое окно выбора переживает перезагрузку', async ({ page }) => {
  const log = watchConsole(page);
  await page.goto('/?new=1');
  await ready(page);
  const cards = await page.evaluate(() => {
    const g = window.__game!;
    g.setLevel(3);
    g.debugLevelUp();
    return g.state().window!.cards;
  });
  expect(cards).toHaveLength(3);
  await page.waitForFunction((k) => {
    const s = JSON.parse(localStorage.getItem(k) || 'null') as { run?: { game?: { window?: unknown } } } | null;
    return s?.run?.game?.window != null;
  }, KEY);
  await page.reload();
  await ready(page);
  await expect(page.getByTestId('cards')).toBeVisible();
  const w = await page.evaluate(() => ({ resumed: window.__game!.resumed, window: window.__game!.state().window }));
  expect(w.resumed).toBe(true);
  // M1-18: у окна в state() ещё refreshed и canRefresh; в начале партии окно не обновлялось и обновить его нельзя.
  expect(w.window).toEqual({ level: 4, cards, refreshed: false, canRefresh: false });
  expect(log.errors).toEqual([]);
});

test('заново, испорченная запись и запись новее', async ({ page }) => {
  const log = watchConsole(page);
  await page.goto('/');
  await ready(page);
  await page.evaluate(() => {
    const g = window.__game!;
    g.debugLevelUp();
    g.command.takeCard(0);
    g.command.placeCell(1, 0);
    g.debugSave();
  });

  // ?new=1 — новая партия; другие параметры остаются в адресе.
  await page.goto('/?new=1&debug=1');
  await ready(page);
  expect(new URL(page.url()).search).toBe('?debug=1');
  const fresh = await page.evaluate(() => ({ resumed: window.__game!.resumed, level: window.__game!.state().level, cells: window.__game!.state().raft.length }));
  expect(fresh).toEqual({ resumed: false, level: 1, cells: 1 });
  await expect(page.getByTestId('resume-plaque')).toHaveCount(0);

  // Версия наша, но снимок пустой: новая партия и предупреждение.
  const broken = { version: 1, rating: 0, campaign: { passed: [], whirlpoolUnlocked: false }, run: { locationId: 'lagoon', seed: 1, game: {} }, replay: null };
  let warned = log.warnings.length;
  await reloadWithSave(page, JSON.stringify(broken));
  expect(await page.evaluate(() => [window.__game!.resumed, window.__game!.state().level])).toEqual([false, 1]);
  expect(log.warnings.length).toBeGreaterThan(warned);

  // Не JSON: новая партия.
  await reloadWithSave(page, '{не json');
  expect(await page.evaluate(() => [window.__game!.resumed, window.__game!.state().level])).toEqual([false, 1]);

  // Запись новее сборки: не читается и не затирается.
  const newer = JSON.stringify({ ...broken, version: 2 });
  warned = log.warnings.length;
  await reloadWithSave(page, newer);
  expect(await page.evaluate(() => window.__game!.resumed)).toBe(false);
  expect(log.warnings.length).toBeGreaterThan(warned);
  const t0 = await page.evaluate(() => window.__game!.world().timeMs);
  await page.waitForFunction((t) => window.__game!.world().timeMs > t + 500, t0);
  expect(await page.evaluate(() => window.__game!.debugSave())).toBe('');
  expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBe(newer);
  expect(log.errors).toEqual([]);
});
