import { MARK_LEVELS, type SimResult } from './run';

/** Ворота M0: 2-й уровень — не дольше этого по медиане (ROADMAP, TESTPLAN §5). */
export const GATE_L2_MS = 10_000;

export interface GateResult { games: number; medianMs: number; p90Ms: number; maxMs: number; over: number; passed: boolean }

function sorted(xs: readonly number[]): number[] {
  return [...xs].sort((a, b) => a - b);
}

/** Медиана; при чётном числе — среднее двух средних. Пустая выборка — NaN. */
export function median(xs: readonly number[]): number {
  const s = sorted(xs);
  const n = s.length;
  if (n === 0) return NaN;
  const m = Math.floor(n / 2);
  return n % 2 === 1 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/** Элемент с индексом floor(p · n) отсортированной выборки (не дальше последнего). */
export function quantile(xs: readonly number[], p: number): number {
  const s = sorted(xs);
  if (s.length === 0) return NaN;
  return s[Math.min(s.length - 1, Math.floor(p * s.length))]!;
}

/** Ворота по времени 2-го уровня; игра, не дошедшая до него (null), — Infinity. */
export function gate(l2Ms: readonly (number | null)[]): GateResult {
  const xs = l2Ms.map((x) => x ?? Infinity);
  const medianMs = median(xs);
  return {
    games: xs.length,
    medianMs,
    p90Ms: quantile(xs, 0.9),
    maxMs: xs.reduce((a, b) => Math.max(a, b), -Infinity),
    over: xs.filter((x) => x > GATE_L2_MS).length,
    passed: medianMs <= GATE_L2_MS,
  };
}

/** Число с запятой. */
function num(x: number, digits: number): string {
  return Number.isFinite(x) ? x.toFixed(digits).replace('.', ',') : '—';
}

const sec = (ms: number): string => `${num(ms / 1000, 2)} с`;
const min = (ms: number): string => `${num(ms / 60_000, 1)} мин`;
const pct = (part: number, all: number): string => (all > 0 ? `${num((100 * part) / all, 0)} %` : '—');

/** Время уровня: 2-й — в секундах, дальше — в минутах; не дошла — «—». */
function levelTime(level: number, ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return '—';
  return level === 2 ? sec(ms) : min(ms);
}

/** Отчёт темпа: ворота, кривая уровней по медианам и строка на прогон. */
export function toMarkdown(g: GateResult, curve: readonly SimResult[]): string {
  const out: string[] = ['# Темп: бот «человек»', ''];
  out.push(
    `**Ворота M0** (2-й уровень, медиана не больше ${sec(GATE_L2_MS)}): ${g.passed ? 'пройдены' : 'НЕ пройдены'}. ` +
      `${g.games} игр: медиана ${sec(g.medianMs)}, 90 % быстрее ${sec(g.p90Ms)}, худшая ${sec(g.maxMs)}, дольше ${sec(GATE_L2_MS)} — ${g.over}.`,
    '',
    `## Кривая: ${curve.length} игр`,
    '',
    '| Уровень | Дошли | Медиана, игровое время | Медиана по часам |',
    '| --- | --- | --- | --- |',
  );
  for (const l of MARK_LEVELS) {
    const game = curve.map((r) => r.levelGameMs[l]).filter((x): x is number => x !== null);
    const wall = curve.map((r) => r.levelWallMs[l]).filter((x): x is number => x !== null);
    const m = (xs: number[]): string => (xs.length > 0 ? levelTime(l, median(xs)) : '—');
    out.push(`| ${l} | ${game.length} из ${curve.length} | ${m(game)} | ${m(wall)} |`);
  }
  out.push(
    '',
    '## Прогоны',
    '',
    '| Сид | 2 | 10 | 20 | 40 | Уровень в конце | Предметов на бросок | Опыт: поток / добыча / сундуки / буст | Реклама за 10 мин | Доля игрового времени | Клеток | Крабы: убито / ушло |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  );
  for (const r of curve) {
    const times = MARK_LEVELS.map((l) => levelTime(l, r.levelGameMs[l] ?? null));
    const xpAll = r.xp.flow + r.xp.loot + r.xp.chest + r.xp.boost;
    const shares = [r.xp.flow, r.xp.loot, r.xp.chest, r.xp.boost].map((x) => pct(x, xpAll)).join(' / ');
    const perThrow = r.throws > 0 ? num(r.itemsCaught / r.throws, 2) : '—';
    const ads = r.wallMs > 0 ? num((r.adPoints * 600_000) / r.wallMs, 1) : '—';
    out.push(
      `| ${r.seed} | ${times.join(' | ')} | ${r.level} | ${perThrow} | ${shares} | ${ads} | ${pct(r.gameMs, r.wallMs)} | ${r.cells} | ${r.enemiesKilled} / ${r.enemiesEscaped} |`,
    );
  }
  out.push('', 'Время уровней в строках прогонов — игровое; по часам — в таблице кривой.', '');
  return out.join('\n');
}
