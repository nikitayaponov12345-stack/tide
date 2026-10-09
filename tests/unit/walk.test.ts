import { describe, expect, it } from 'vitest';
import { STEP_MS, TIME_EPS } from '../../src/core/clock';
import { Game } from '../../src/core/game';
import { DATA } from '../../src/data';

const CFG = { halfW: 640, halfH: 360, speedMult: 1, locationId: 'lagoon', seed: 1 };
/** Предел шагов любого цикла: синхронный бесконечный цикл Vitest не прерывает. */
const MAX_STEPS = 20_000;
const CELL = DATA.num('cell_px');
const DELAY = DATA.num('walk_hint_delay_ms');

function run(g: Game, cond: () => boolean): void {
  for (let i = 0; cond(); i++) {
    if (i >= MAX_STEPS) throw new Error('run: предел шагов');
    g.step(STEP_MS);
  }
}

/** Игра с клеткой (1, 0) рядом с центральной: окно 2 уровня → «Плот» → стройка. */
function twoCells(): Game {
  const g = new Game(DATA, CFG);
  g.debugLevelUp();
  expect(g.window?.cards.map((c) => c.id)).toEqual(['raft']);
  expect(g.takeCard(0)).toBe(true);
  expect(g.placeCell(1, 0)).toBe(true);
  return g;
}

describe('Game.walk', () => {
  it('на паузе — false, моряк стоит', () => {
    const g = twoCells();
    g.debugLevelUp();
    expect(g.paused).toBe(true);
    expect(g.walk(1, 0)).toBe(false);
    expect([g.sailor.gx, g.sailor.gy]).toEqual([0, 0]);
    expect(g.stats.steps).toBe(0);
    expect(g.hasWalked).toBe(false);
  });

  it('после шага всё — от новой точки: сеть ready, бросок, круг дальности, тяга', () => {
    const g = twoCells();
    expect(g.walk(1, 0)).toBe(true);
    expect([g.sailor.x, g.sailor.y]).toEqual([CELL, 0]);
    expect([g.net.state, g.net.x, g.net.y]).toEqual(['ready', CELL, 0]);
    expect(g.stats.steps).toBe(1);
    expect(g.hasWalked).toBe(true);

    const range = g.net.netParams.range;
    expect(g.throwTo(CELL + 10 * range, 0)).toBe(true);
    expect([g.net.x, g.net.y]).toEqual([CELL, 0]);   // вылетает из точки моряка
    run(g, () => g.net.state === 'flying');
    expect(g.net.x).toBeCloseTo(CELL + range, 6);    // упала на круге дальности вокруг новой точки
    expect(g.net.y).toBeCloseTo(0, 6);
    g.setPull(true);
    run(g, () => g.net.state !== 'ready');
    expect([g.net.x, g.net.y]).toEqual([CELL, 0]);
  });

  it('сеть в воде тянется к новой точке моряка', () => {
    const g = twoCells();
    g.throwTo(0, 150);
    run(g, () => g.net.state === 'flying');
    expect(g.walk(1, 0)).toBe(true);
    expect(g.net.state).toBe('lying');   // лежащая сеть не переезжает
    g.setPull(true);
    g.step(STEP_MS);
    expect(g.net.x).toBeGreaterThan(0);  // тянется вправо, к (CELL, 0)
    run(g, () => g.net.state !== 'ready');
    expect([g.net.x, g.net.y]).toEqual([CELL, 0]);
  });

  it('неудачный шаг не считается', () => {
    const g = twoCells();
    expect(g.walk(0, 1)).toBe(false);
    expect(g.walk(1, 1)).toBe(false);
    expect(g.walk(2, 0)).toBe(false);
    expect(g.stats.steps).toBe(0);
    expect(g.hasWalked).toBe(false);
  });

  it('моряк встал рядом с лежащей сетью — сеть забирается на следующем шаге', () => {
    const g = twoCells();
    g.throwTo(CELL, 0);
    run(g, () => g.net.state === 'flying');
    expect([g.net.state, g.net.x, g.net.y]).toEqual(['lying', CELL, 0]);
    g.step(STEP_MS);
    expect(g.net.state).toBe('lying');   // от (0, 0) не достаёт
    expect(g.walk(1, 0)).toBe(true);
    g.step(STEP_MS);
    expect(g.net.state).toBe('ready');
  });
});

describe('Game.walk и разбитая клетка (M1-03)', () => {
  const HP = DATA.num('cell_hp');

  it('на разбитую клетку — false, моряк стоит', () => {
    const g = twoCells();
    expect(g.debugDamageCell(1, 0, HP)).toBe(HP);
    expect(g.walk(1, 0)).toBe(false);
    expect([g.sailor.gx, g.sailor.gy]).toEqual([0, 0]);
    expect(g.stats.steps).toBe(0);
  });

  it('клетку разбили под моряком — он на ней и сходит на целую', () => {
    const g = twoCells();
    expect(g.walk(1, 0)).toBe(true);
    g.debugDamageCell(1, 0, HP);
    g.step(STEP_MS);
    expect([g.sailor.gx, g.sailor.gy]).toEqual([1, 0]);
    expect(g.walk(-1, 0)).toBe(true);
    expect([g.sailor.gx, g.sailor.gy]).toEqual([0, 0]);
    expect(g.walk(1, 0)).toBe(false);
  });
});

describe('Game.walkHint', () => {
  it('до второй клетки — нет', () => {
    const g = new Game(DATA, CFG);
    run(g, () => g.world.timeMs < 2 * DELAY + 100);
    expect(g.walkHint).toBe(false);
  });

  it('после второй клетки — через walk_hint_delay_ms времени мира', () => {
    const g = twoCells();
    const t0 = g.world.timeMs;
    expect(g.walkHint).toBe(false);
    run(g, () => !g.walkHint);
    const waited = g.world.timeMs - t0;
    expect(waited + TIME_EPS).toBeGreaterThanOrEqual(DELAY);
    expect(waited).toBeLessThan(DELAY + STEP_MS);
  });

  it('третья клетка момент не сдвигает', () => {
    const g = twoCells();
    const t0 = g.world.timeMs;
    run(g, () => g.world.timeMs - t0 < DELAY / 2);
    g.build = { card: 'raft' };   // стройка напрямую: окно 3 уровня здесь не проверяем
    expect(g.placeCell(-1, 0)).toBe(true);
    expect(g.secondCellMs).toBe(t0);
    run(g, () => !g.walkHint);
    expect(g.world.timeMs - t0).toBeLessThan(DELAY + STEP_MS);
  });

  it('на паузе, после первого шага и на уровне walk_hint_max_level — нет', () => {
    const g = twoCells();
    run(g, () => !g.walkHint);
    g.debugLevelUp();
    expect(g.paused).toBe(true);
    expect(g.walkHint).toBe(false);

    const max = DATA.num('walk_hint_max_level');
    const h = twoCells();
    run(h, () => !h.walkHint);
    h.setLevel(max - 1);
    expect(h.walkHint).toBe(true);
    h.setLevel(max);
    expect(h.walkHint).toBe(false);
    h.setLevel(max - 1);
    expect(h.walk(1, 0)).toBe(true);
    expect(h.walkHint).toBe(false);
  });
});
