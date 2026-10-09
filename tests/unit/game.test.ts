import { mkdirSync, writeFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { STEP_MS } from '../../src/core/clock';
import type { Tables } from '../../src/core/data/tables';
import { Game } from '../../src/core/game';
import { DATA } from '../../src/data';

const CFG = { halfW: 640, halfH: 360, speedMult: 1, locationId: 'lagoon', seed: 1 };
/** «Рука» теста: удержание через столько после падения сети. */
const HAND_PULL_DELAY_MS = 800;
/** Предел шагов любого цикла: синхронный бесконечный цикл Vitest не прерывает. */
const MAX_STEPS = 20_000;

/** Шагать, пока cond; больше MAX_STEPS шагов — ошибка (например, игра встала на паузу). */
function run(g: Game, cond: () => boolean): void {
  for (let i = 0; cond(); i++) {
    if (i >= MAX_STEPS) throw new Error('run: предел шагов');
    g.step(STEP_MS);
  }
}

/** Весь опыт, полученный полосой: стоимость пройденных уровней плюс опыт текущего. */
function barXp(g: Game): number {
  const mult = DATA.location(CFG.locationId).xpMult;
  let sum = g.progression.xp;
  for (let l = 2; l <= g.progression.level; l++) sum += DATA.levelStep(l, mult);
  return sum;
}

function nearest(g: Game): { x: number; y: number } | undefined {
  return [...g.world.items].sort((a, b) => Math.hypot(a.x, a.y) - Math.hypot(b.x, b.y))[0];
}

/** Опыт, чтобы с текущего уровня подняться на n уровней сразу. */
function xpForLevels(g: Game, n: number): number {
  const mult = DATA.location(CFG.locationId).xpMult;
  let sum = -g.progression.xp;
  for (let l = g.progression.level + 1; l <= g.progression.level + n; l++) sum += DATA.levelStep(l, mult);
  return sum;
}

const card = (id: string) => DATA.cards.find((c) => c.id === id)!;

describe('Game', () => {
  it('stats.xpGained растёт по прилёту значков и равен опыту полосы', () => {
    const g = new Game(DATA, CFG);
    const target = nearest(g)!;
    g.throwTo(target.x, target.y);
    run(g, () => g.net.state === 'flying');
    g.setPull(true);
    run(g, () => g.net.state !== 'ready');
    const n = g.stats.itemsCaught;
    expect(n).toBeGreaterThan(0);
    expect(g.stats.xpGained).toBe(0);
    const total = g.progression.icons.reduce((s, i) => s + i.xp, 0);
    const back = g.world.timeMs;
    const all = DATA.num('icon_flight_ms') + (n - 1) * DATA.num('icon_interval_ms');
    run(g, () => g.world.timeMs + STEP_MS < back + all - 1e-6);
    expect(g.stats.xpGained).toBeLessThan(total);
    g.step(STEP_MS);
    expect(g.stats.xpGained).toBe(total);
    expect(barXp(g)).toBe(g.stats.xpGained);
  });

  it('темп: «рука» за 60 с доходит хотя бы до 2 уровня', () => {
    const g = new Game(DATA, CFG);
    let landedMs: number | null = null;
    let level2Ms: number | null = null;
    let levelAt60s = 1;
    for (let i = 0; g.stats.gameMs < 60_000 - 1e-6; i++) {
      if (i >= MAX_STEPS) throw new Error('темп: предел шагов');
      // На паузе «рука» выбирает сразу: первая карточка, первое место стройки.
      if (g.window) {
        g.takeCard(0);
        continue;
      }
      if (g.build) {
        const c = g.raft.candidates()[0]!;
        g.placeCell(c.gx, c.gy);
        continue;
      }
      if (g.net.state === 'ready') {
        const t = nearest(g);
        if (t) g.throwTo(t.x, t.y);
        landedMs = null;
      } else if (g.net.state !== 'flying') {
        landedMs ??= g.stats.gameMs;
        if (g.stats.gameMs - landedMs >= HAND_PULL_DELAY_MS - 1e-6) g.setPull(true);
      }
      g.step(STEP_MS);
      if (level2Ms === null && g.progression.level >= 2) level2Ms = Math.round(g.stats.gameMs);
      levelAt60s = g.progression.level;
    }
    const probe = {
      seed: CFG.seed, levelAt60s, level2Ms, throws: g.stats.throws, itemsCaught: g.stats.itemsCaught, xpGained: g.stats.xpGained,
    };
    mkdirSync('build/probe', { recursive: true });
    writeFileSync('build/probe/m0-02-game.json', `${JSON.stringify(probe, null, 2)}\n`);
    expect(levelAt60s).toBeGreaterThanOrEqual(2);
  });
});

describe('Game: счётчики', () => {
  it('бросок, повторный бросок в полёте, пустой возврат и нажатие', () => {
    const g = new Game(DATA, CFG);
    g.world.items.length = 0;
    g.noteTap();
    expect(g.throwTo(150, 0)).toBe(true);
    g.step(STEP_MS);
    expect(g.throwTo(-150, 0)).toBe(false);
    run(g, () => g.net.state === 'flying');
    g.setPull(true);
    run(g, () => g.net.state !== 'ready');
    const { throws, emptyThrows, itemsCaught, taps, gameMs } = g.stats;
    expect({ throws, emptyThrows, itemsCaught, taps }).toEqual({ throws: 1, emptyThrows: 1, itemsCaught: 0, taps: 1 });
    expect(gameMs).toBe(g.world.timeMs);
  });
});

describe('Game: окно выбора и стройка', () => {
  it('debugLevelUp на 1 уровне: окно 2 уровня [raft] сразу, пауза', () => {
    const g = new Game(DATA, CFG);
    g.debugLevelUp();
    expect(g.progression.level).toBe(2);
    expect(g.world.level).toBe(2);
    expect(g.window).toEqual({ level: 2, cards: [{ id: 'raft', available: true, reason: null }] });
    expect(g.paused).toBe(true);
    expect(g.stats.xpGained).toBe(0);
    const t = g.world.timeMs;
    for (let i = 0; i < 10; i++) g.step(STEP_MS);
    expect(g.world.timeMs).toBe(t);
    expect(g.stats.gameMs).toBe(t);
    expect(g.throwTo(100, 0)).toBe(false);
    expect(g.stats.throws).toBe(0);
  });

  it('на паузе стоят предметы, сеть в полёте и значки опыта', () => {
    const g = new Game(DATA, CFG);
    g.throwTo(200, 0);
    g.step(STEP_MS);
    expect(g.net.state).toBe('flying');
    g.progression.addCatch([{ kind: 'x', role: 'light1', xp: 1, weight: 0, x: 50, y: 50 }], g.world.timeMs);
    g.debugLevelUp();
    const items = g.world.items.map((it) => ({ ...it }));
    const net = { x: g.net.x, y: g.net.y, state: g.net.state };
    const icons = g.progression.icons.map((i) => ({ ...i }));
    const xp = g.progression.xp;
    for (let i = 0; i < 300; i++) g.step(STEP_MS);
    expect(g.world.items.map((it) => ({ ...it }))).toEqual(items);
    expect({ x: g.net.x, y: g.net.y, state: g.net.state }).toEqual(net);
    expect(g.progression.icons).toEqual(icons);
    expect(g.progression.xp).toBe(xp);
  });

  it('setPull(false) на паузе выключает удержание', () => {
    const g = new Game(DATA, CFG);
    g.world.items.length = 0;
    g.throwTo(200, 0);
    run(g, () => g.net.state === 'flying');
    g.setPull(true);
    expect(g.net.state).toBe('pulling');
    g.debugLevelUp();
    g.setPull(false);
    expect(g.net.state).toBe('lying');
  });

  it('пустой ответ колоды — уровень без окна, следующий уровень берётся в том же вызове', () => {
    const g = new Game(DATA, CFG);
    const real = g.deck.offer.bind(g.deck);
    vi.spyOn(g.deck, 'offer').mockImplementation((level, ctx) => (level === 2 ? [] : real(level, ctx)));
    g.progression.addXp(xpForLevels(g, 2));
    g.step(STEP_MS);
    expect(g.progression.level).toBe(3);
    expect(g.window?.level).toBe(3);
  });

  it('«Плот» → стройка: диагональ нельзя, сбоку можно, пауза снята', () => {
    const g = new Game(DATA, CFG);
    g.debugLevelUp();
    expect(g.takeCard(0)).toBe(true);
    expect(g.window).toBeNull();
    expect(g.build).toEqual({ card: 'raft' });
    expect(g.paused).toBe(true);
    expect(g.deck.taken('raft')).toBe(1);
    expect(g.placeCell(1, 1)).toBe(false);
    expect(g.placeCell(1, 0)).toBe(true);
    expect(g.raft.cells).toHaveLength(2);
    expect(g.build).toBeNull();
    expect(g.paused).toBe(false);
    expect(g.placeCell(-1, 0)).toBe(false);
    const t = g.world.timeMs;
    g.step(STEP_MS);
    expect(g.world.timeMs).toBeGreaterThan(t);
  });

  it('два уровня за раз — два окна по очереди: второе после стройки первого', () => {
    const g = new Game(DATA, CFG);
    g.progression.addXp(xpForLevels(g, 2));
    g.step(STEP_MS);
    expect(g.window?.level).toBe(2);
    expect(g.world.level).toBe(3);
    g.takeCard(0);
    expect(g.window).toBeNull();
    g.placeCell(0, 1);
    expect(g.window?.level).toBe(3);
    expect(g.window?.cards).toHaveLength(DATA.num('window_cards_level3'));
  });

  it('карточка моряка: «Бросок дальше» прибавляет дальность и возвращает игру', () => {
    const g = new Game(DATA, CFG);
    const range = g.net.netParams.range;
    let took = false;
    for (let i = 0; i < 60 && !took; i++) {
      if (!g.paused) g.debugLevelUp();
      if (g.build) {
        const c = g.raft.candidates()[0]!;
        g.placeCell(c.gx, c.gy);
        continue;
      }
      const w = g.window!;
      const at = w.cards.findIndex((c) => c.id === 'throw_farther');
      if (at < 0) {
        g.takeCard(0);
        continue;
      }
      expect(g.takeCard(at)).toBe(true);
      expect(g.window).toBeNull();
      expect(g.build).toBeNull();
      expect(g.paused).toBe(false);
      took = true;
    }
    expect(took).toBe(true);
    expect(g.net.netParams.range).toBe(range + card('throw_farther').value!);
  });

  it('add, mul и set по таблице', () => {
    const data: Tables = { ...DATA, cards: DATA.cards.map((c) => (c.id === 'net_bigger' ? { ...c, mode: 'set' as const, value: 7 } : c)) };
    const g = new Game(data, CFG);
    const before = { ...g.net.netParams };
    const take = (id: string): void => {
      g.window = { level: 5, cards: [{ id, available: true, reason: null }] };
      expect(g.takeCard(0)).toBe(true);
    };
    take('net_wider');
    expect(g.net.netParams.radius).toBe(before.radius + card('net_wider').value!);
    take('pull_stronger');
    expect(g.net.netParams.pull).toBeCloseTo(before.pull * (1 + card('pull_stronger').value!), 9);
    take('net_bigger');
    expect(g.net.netParams.capacity).toBe(7);
    expect(g.net.netParams.range).toBe(before.range);
  });

  it('карточка, которая не меняет ни сеть, ни копьё, — ошибка, окно остаётся открытым', () => {
    // У «Копьё сильнее» с M0-08 есть механика: берём копию таблицы с выдуманным показателем.
    const data: Tables = { ...DATA, cards: DATA.cards.map((c) => (c.id === 'net_wider' ? { ...c, stat: 'made_up' } : c)) };
    const g = new Game(data, CFG);
    for (const id of ['net_wider', 'net_tower']) {
      const w = { level: 5, cards: [{ id, available: true, reason: null }] };
      g.window = w;
      expect(() => g.takeCard(0)).toThrow();
      expect(g.window).toBe(w);
      expect(g.deck.taken(id)).toBe(0);
    }
  });

  it('takeCard без окна, по неверному индексу и для недоступной карточки — false', () => {
    const g = new Game(DATA, CFG);
    expect(g.takeCard(0)).toBe(false);
    g.debugLevelUp();
    expect(g.takeCard(1)).toBe(false);
    expect(g.takeCard(-1)).toBe(false);
    const w = { level: 5, cards: [{ id: 'net_tower', available: false, reason: 'ui.need_free_cell' }] };
    g.window = w;
    expect(g.takeCard(0)).toBe(false);
    expect(g.window).toBe(w);
    expect(g.placeCell(1, 0)).toBe(false);
  });
});
