import { describe, expect, it } from 'vitest';
import { BOTTLE_ROLE, Boost } from '../../src/core/boost';
import { FixedStep, STEP_MS } from '../../src/core/clock';
import { Game, type GameConfig, type GameSnapshot } from '../../src/core/game';
import { Rng } from '../../src/core/rng';
import { World } from '../../src/core/world';
import { DATA } from '../../src/data';

const CFG: GameConfig = { halfW: 640, halfH: 360, speedMult: 1, locationId: 'lagoon', seed: 1 };
const STORM = DATA.events.find((e) => e.id === DATA.location('lagoon').eventId && e.location === 'lagoon')!;
const STORM_FLOW = Number(STORM.flow_mult);
const BOOST_FLOW = DATA.num('boost_flow_mult');
const BOTTLE_MS = DATA.num('boost_bottle_s') * 1000;
const NEAR_MIN = DATA.num('seed_near_raft_min_px');
const NEAR_MAX = DATA.num('seed_near_raft_max_px');
/** Шагов на время ms. */
const steps = (ms: number): number => Math.round(ms / STEP_MS);
/** Предел шагов циклов: синхронный бесконечный цикл Vitest не прерывает. */
const MAX_STEPS = 20_000;

const viaJson = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** Шагать игру n шагов. */
function stepN(g: Game, n: number): void {
  for (let i = 0; i < n; i++) g.step(STEP_MS);
}

/** Шагать игру, пока не cond; ответ — сколько шагов. */
function stepUntil(g: Game, cond: () => boolean): number {
  for (let i = 1; i <= MAX_STEPS; i++) {
    g.step(STEP_MS);
    if (cond()) return i;
  }
  throw new Error('stepUntil: предел шагов');
}

const bottles = (g: Game) => g.world.items.filter((it) => it.role === BOTTLE_ROLE);

describe('Boost', () => {
  it('время буста складывается и кончается ровно через столько шагов', () => {
    const world = new World({ halfW: 640, halfH: 360, speedMult: 1, locationId: 'lagoon', level: 1 }, DATA, new Rng(1));
    const b = new Boost(DATA, new Rng(7), world);
    expect(b.active).toBe(false);
    b.start(1000);
    b.start(500);
    expect(b.leftMs).toBe(1500);
    let n = 0;
    while (b.active && n < MAX_STEPS) {
      b.step(STEP_MS, 0, false);
      n++;
    }
    expect(n).toBe(steps(1500));
    expect(b.leftMs).toBe(0);
  });
});

describe('Буст в игре', () => {
  it('поток гуще в boost_flow_mult раз, в шторм множители перемножаются, без буста — 1', () => {
    const g = new Game(DATA, CFG);
    g.step(STEP_MS);
    expect(g.world.flowMult).toBe(1);
    g.debugBoost();
    g.step(STEP_MS);
    expect(g.world.flowMult).toBe(BOOST_FLOW);
    g.debugEvent();
    g.step(STEP_MS);
    expect(g.world.flowMult).toBe(STORM_FLOW * BOOST_FLOW);
  });

  it('под бустом враги не приходят: первый ждёт конца буста, таймер следующих стоит', () => {
    const g = new Game(DATA, CFG);
    expect(g.raft.add(1, 0)).toBe(true);
    g.mediumCaught = true;
    g.debugBoost(60_000);
    stepN(g, steps(59_000));
    expect(g.enemies.spawned).toBe(0);
    stepUntil(g, () => !g.boost.active);
    g.step(STEP_MS);
    expect(g.enemies.spawned).toBe(1);

    g.debugBoost(30_000);
    const acc = g.enemies.snapshot().acc;
    stepN(g, steps(30_000) - 1);
    expect(g.boost.active).toBe(true);
    expect(g.enemies.spawned).toBe(1);
    expect(g.enemies.snapshot().acc).toBe(acc);
  });

  it('под бустом спокойное время события и визитов не копится', () => {
    const g = new Game(DATA, CFG);
    g.debugBossVisit();
    stepUntil(g, () => !g.boss.visiting);
    expect(g.boss.visits).toBe(1);
    stepN(g, 60);
    const eventsCalm = g.events.calmMs;
    const bossCalm = g.boss.calmMs;
    expect(eventsCalm).toBeGreaterThan(0);
    expect(bossCalm).toBeGreaterThan(0);
    g.debugBoost();
    stepN(g, steps(BOTTLE_MS) - 1);
    expect(g.boost.active).toBe(true);
    expect(g.events.calmMs).toBe(eventsCalm);
    expect(g.boss.calmMs).toBe(bossCalm);
  });
});

describe('Бутылка', () => {
  it('до первого побеждённого врага её нет; потом всплывает у плота', () => {
    const g = new Game(DATA, CFG);
    stepN(g, 60);
    expect(bottles(g)).toEqual([]);
    expect(g.boost.bottleId).toBeNull();
    g.stats.enemiesKilled = 1;
    g.step(STEP_MS);
    const [b] = bottles(g);
    expect(b).toBeDefined();
    expect(bottles(g)).toHaveLength(1);
    expect(g.boost.bottleId).toBe(b!.id);
    // В шаге всплытия она уже сдвинулась.
    const d = Math.hypot(b!.x, b!.y);
    expect(d).toBeGreaterThanOrEqual(NEAR_MIN - 2);
    expect(d).toBeLessThanOrEqual(NEAR_MAX + 2);
  });

  it('ушла из воды — всплывает новая; в сети — новой нет; вернулась — буст, и бутылок больше нет', () => {
    const g = new Game(DATA, CFG);
    g.stats.enemiesKilled = 1;
    g.step(STEP_MS);
    const first = g.boost.bottleId!;
    g.world.removeItem(first);
    g.step(STEP_MS);
    expect(bottles(g)).toHaveLength(1);
    expect(g.boost.bottleId).not.toBe(first);

    // Бутылка в сети моряка (из воды убрана): новой нет.
    const b = g.world.removeItem(g.boost.bottleId!)!;
    g.net.caught.push({ kind: b.kind, role: b.role, xp: b.xp, weight: b.weight, x: b.x, y: b.y });
    stepN(g, 60);
    expect(bottles(g)).toEqual([]);
    g.net.caught.length = 0;
    g.step(STEP_MS);
    expect(bottles(g)).toHaveLength(1);

    // Настоящая ловля: бутылка стоит, сеть в неё, тяга до возврата.
    const bottle = bottles(g)[0]!;
    bottle.speed = 0;
    for (const it of [...g.world.items]) if (it.id !== bottle.id) g.world.removeItem(it.id);
    expect(g.throwTo(bottle.x, bottle.y)).toBe(true);
    g.setPull(true);
    stepUntil(g, () => g.boost.bottleCaught);
    expect(g.boost.active).toBe(true);
    expect(g.boost.leftMs).toBe(BOTTLE_MS);
    expect(g.boost.bottleId).toBeNull();
    stepN(g, steps(30_000));
    expect(bottles(g)).toEqual([]);
    expect(g.boost.bottleId).toBeNull();
  });
});

describe('Буст: время и снимок', () => {
  /** Буст и бутылка; 20 с через FixedStep при fps кадрах в секунду. */
  const run = (fps: number) => {
    const g = new Game(DATA, CFG);
    g.stats.enemiesKilled = 1;
    g.debugBoost();
    const clock = new FixedStep(STEP_MS, 1000);
    const total = Math.round(20_000 / STEP_MS);
    let n = 0;
    while (n < total) {
      clock.advance(1000 / fps, (dt) => {
        if (n < total && !g.paused) g.step(dt);
        n++;
      });
    }
    return { boost: g.boost.snapshot(), world: g.world.snapshot(), stats: g.stats.snapshot() };
  };

  it('30, 60 и 144 кадров в секунду — одна и та же партия', () => {
    const base = run(60);
    expect(base.boost.bottleId).not.toBeNull();
    expect(run(30)).toEqual(base);
    expect(run(144)).toEqual(base);
  });

  it('снимок с бустом и бутылкой: после restore то же и дальше идёт так же; запись без boost — буста нет', () => {
    const g = new Game(DATA, CFG);
    g.stats.enemiesKilled = 1;
    g.debugBoost();
    stepN(g, 10);
    expect(g.boost.active).toBe(true);
    expect(g.boost.bottleId).not.toBeNull();
    const snap = viaJson(g.snapshot());
    const r = Game.restore(DATA, CFG, snap);
    expect(viaJson(r.snapshot())).toEqual(snap);
    stepN(g, 600);
    stepN(r, 600);
    expect(viaJson(r.snapshot())).toEqual(viaJson(g.snapshot()));

    const old: GameSnapshot = viaJson(snap);
    delete old.boost;
    const o = Game.restore(DATA, CFG, old);
    expect(o.boost.active).toBe(false);
    expect(o.boost.bottleCaught).toBe(false);
    expect(o.boost.bottleId).toBeNull();
  });
});
