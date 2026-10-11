import { describe, expect, it } from 'vitest';
import { STEP_MS } from '../../src/core/clock';
import { Enemies } from '../../src/core/enemies';
import { LocationEvents } from '../../src/core/events';
import { Game, type GameConfig, type GameSnapshot } from '../../src/core/game';
import { Raft } from '../../src/core/raft';
import { Rng } from '../../src/core/rng';
import { Stats } from '../../src/core/stats';
import { World } from '../../src/core/world';
import { DATA } from '../../src/data';

const CFG: GameConfig = { halfW: 640, halfH: 360, speedMult: 1, locationId: 'lagoon', seed: 1 };
const STORM = DATA.events.find((e) => e.id === DATA.location('lagoon').eventId && e.location === 'lagoon')!;
const DURATION_MS = Number(STORM.duration_s) * 1000;
const RATE = Number(STORM.enemy_rate_mult);
const FLOW = Number(STORM.flow_mult);
const FIRST_MS = DATA.num('event_first_s') * 1000;
const PERIOD_MS = DATA.num('event_period_s') * 1000;
const BASE_MS = DATA.num('enemy_interval_base_s') * 1000;
/** Шагов на время ms. */
const steps = (ms: number): number => Math.round(ms / STEP_MS);
/** Предел шагов циклов: синхронный бесконечный цикл Vitest не прерывает. */
const MAX_STEPS = 20_000;

const viaJson = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** Шагать событие, пока cond; ответ — сколько шагов. */
function stepUntil(ev: LocationEvents, cond: () => boolean): number {
  for (let i = 1; i <= MAX_STEPS; i++) {
    ev.step(STEP_MS, true);
    if (cond()) return i;
  }
  throw new Error('stepUntil: предел шагов');
}

describe('LocationEvents', () => {
  it('шторм Лагуны — из events.csv; вне события множители 1, после start() — множители строки', () => {
    const ev = new LocationEvents(DATA, 'lagoon');
    expect(ev.id).toBe(STORM.id);
    expect(ev.durationMs).toBe(DURATION_MS);
    expect(ev.active).toBe(false);
    expect(ev.enemyRateMult).toBe(1);
    expect(ev.flowMult).toBe(1);
    expect(ev.enemiesSurface).toBe(false);
    ev.start();
    expect(ev.active).toBe(true);
    expect(ev.leftMs).toBe(DURATION_MS);
    expect(ev.count).toBe(1);
    expect(ev.enemyRateMult).toBe(RATE);
    expect(ev.flowMult).toBe(FLOW);
    expect(ev.enemiesSurface).toBe(STORM.enemies_surface === '1');
  });

  it('первое событие — на event_first_s спокойного времени, длится duration_s, следующее — через event_period_s после конца', () => {
    const ev = new LocationEvents(DATA, 'lagoon');
    expect(stepUntil(ev, () => ev.active)).toBe(steps(FIRST_MS));
    expect(ev.count).toBe(1);
    expect(ev.calmMs).toBe(0);
    expect(stepUntil(ev, () => !ev.active)).toBe(steps(DURATION_MS));
    // В шаге, где событие кончилось, спокойное время не копится.
    expect(ev.calmMs).toBe(0);
    expect(stepUntil(ev, () => ev.active)).toBe(steps(PERIOD_MS));
    expect(ev.count).toBe(2);
  });

  it('при calm = false и в событие спокойное время не копится', () => {
    const ev = new LocationEvents(DATA, 'lagoon');
    for (let i = 0; i < steps(FIRST_MS) * 2; i++) ev.step(STEP_MS, false);
    expect(ev.calmMs).toBe(0);
    expect(ev.active).toBe(false);
    ev.start();
    for (let i = 0; i < steps(DURATION_MS) - 1; i++) ev.step(STEP_MS, true);
    expect(ev.active).toBe(true);
    expect(ev.calmMs).toBe(0);
  });
});

describe('Шторм: поток и враги', () => {
  it('мир с flowMult = flow_mult за duration_s выпускает floor(n × flow_mult) предметов', () => {
    const spawned = (mult: number): number => {
      const w = new World({ halfW: 640, halfH: 360, speedMult: 1, locationId: 'lagoon', level: 1 }, DATA, new Rng(5));
      w.flowMult = mult;
      for (let i = 0; i < steps(DURATION_MS); i++) w.step(STEP_MS);
      return w.spawned;
    };
    const n = spawned(1);
    expect(n).toBeGreaterThan(0);
    expect(spawned(FLOW)).toBe(Math.floor(n * FLOW));
  });

  it('intervalMs(0, rate) = база / rate; при 10 постройках — enemy_interval_min_s', () => {
    const world = new World({ halfW: 640, halfH: 360, speedMult: 1, locationId: 'lagoon', level: 1 }, DATA, new Rng(1));
    const e = new Enemies(DATA, 'lagoon', new Rng(3), world, new Stats());
    expect(e.intervalMs(0, RATE)).toBeCloseTo(BASE_MS / RATE, 6);
    expect(e.intervalMs(10, RATE)).toBe(DATA.num('enemy_interval_min_s') * 1000);
  });

  it('интервал сократился при почти полном накопителе — один новый враг сразу, следующий — через intervalMs(0, rate)', () => {
    const world = new World({ halfW: 640, halfH: 360, speedMult: 1, locationId: 'lagoon', level: 1 }, DATA, new Rng(1));
    const enemies = new Enemies(DATA, 'lagoon', new Rng(3), world, new Stats());
    const raft = new Raft(DATA);
    enemies.step(STEP_MS, { raft, level: 1, ready: true });
    expect(enemies.spawned).toBe(1);
    for (let i = 0; i < steps(BASE_MS) - 2; i++) enemies.step(STEP_MS, { raft, level: 1, ready: true });
    expect(enemies.spawned).toBe(1);
    const storm = { raft, level: 1, ready: true, rateMult: RATE };
    enemies.step(STEP_MS, storm);
    expect(enemies.spawned).toBe(2);
    let n = 0;
    while (enemies.spawned === 2 && n < MAX_STEPS) {
      enemies.step(STEP_MS, storm);
      n++;
    }
    expect(enemies.spawned).toBe(3);
    // Второй родился в начале своего шага (накопитель перевалил интервал на целый шаг), третий — в конце: между ними n + 1 шагов.
    expect(n + 1).toBe(steps(enemies.intervalMs(0, RATE)));
  });
});

describe('Шторм в игре', () => {
  it('первый шторм — на event_first_s спокойного времени, в нём world.flowMult = flow_mult', () => {
    const g = new Game(DATA, CFG);
    let n = 0;
    while (!g.events.active && n < MAX_STEPS) {
      g.step(STEP_MS);
      n++;
    }
    expect(n).toBe(steps(FIRST_MS));
    expect(g.world.flowMult).toBe(FLOW);
    expect(g.events.id).toBe(STORM.id);
  });

  it('с debugEvent за duration_s минус шаг крабов 1 + floor((duration − шаг) / интервал) и вожак (M1-16)', () => {
    const g = new Game(DATA, CFG);
    expect(g.raft.add(1, 0)).toBe(true);
    g.mediumCaught = true;
    g.debugEvent();
    const total = steps(DURATION_MS - STEP_MS);
    for (let i = 0; i < total; i++) g.step(STEP_MS);
    expect(g.events.active).toBe(true);
    const interval = g.enemies.intervalMs(0, RATE);
    // Вожак — один на событие, сверх таймера.
    expect([g.enemies.spawned, g.stats.leaders]).toEqual([2 + Math.floor((DURATION_MS - STEP_MS) / interval), 1]);
  });

  it('в окне выбора таймер события стоит; debugEvent работает и на паузе', () => {
    const g = new Game(DATA, CFG);
    for (let i = 0; i < 100; i++) g.step(STEP_MS);
    const calm = g.events.calmMs;
    expect(calm).toBeGreaterThan(0);
    g.debugLevelUp();
    expect(g.window).not.toBeNull();
    for (let i = 0; i < steps(FIRST_MS); i++) g.step(STEP_MS);
    expect(g.events.calmMs).toBe(calm);
    expect(g.events.active).toBe(false);
    g.debugEvent();
    expect(g.events.active).toBe(true);
    for (let i = 0; i < 100; i++) g.step(STEP_MS);
    expect(g.events.leftMs).toBe(DURATION_MS);
  });

  it('снимок в шторм — то же событие после restore; запись до M1-07 — события нет, спокойное время с нуля', () => {
    const g = new Game(DATA, CFG);
    for (let i = 0; i < 100; i++) g.step(STEP_MS);
    g.debugEvent();
    for (let i = 0; i < 100; i++) g.step(STEP_MS);
    const s = viaJson(g.snapshot());
    const r = Game.restore(DATA, CFG, viaJson(s));
    expect(r.events.snapshot()).toEqual(g.events.snapshot());
    expect(r.events.active).toBe(true);
    const old = viaJson(s) as GameSnapshot;
    delete old.events;
    const o = Game.restore(DATA, CFG, old);
    expect(o.events.snapshot()).toEqual({ calmMs: 0, leftMs: 0, count: 0 });
    expect(o.events.active).toBe(false);
  });
});
