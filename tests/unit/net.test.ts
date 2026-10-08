import { describe, expect, it } from 'vitest';
import { FixedStep, STEP_MS } from '../../src/core/clock';
import { Game } from '../../src/core/game';
import { Net, type CaughtItem, type NetParams } from '../../src/core/net';
import { Raft } from '../../src/core/raft';
import { Rng } from '../../src/core/rng';
import { World, type Item } from '../../src/core/world';
import { DATA } from '../../src/data';

const tier = DATA.sailorTier(1);
const PARAMS: NetParams = { radius: tier.netRadius, capacity: tier.netCapacity, range: tier.throwRange, pull: tier.pull };
const NO_AUTO = { autoPullAfterMs: null };
const clamp = (v: number): number => Math.min(DATA.num('net_pull_max'), Math.max(DATA.num('net_pull_min'), v));

/** Пустое море: предметы кладёт тест, мир не шагает. */
function setup(params: NetParams = PARAMS): { net: Net; world: World; raft: Raft } {
  const world = new World({ halfW: 640, halfH: 360, speedMult: 1, locationId: 'lagoon', level: 1 }, DATA, new Rng(1));
  world.items.length = 0;
  return { net: new Net(DATA, params), world, raft: new Raft(DATA) };
}

let nextId = 1000;
function put(world: World, kind: string, x: number, y: number): Item {
  const row = DATA.item(kind);
  const it: Item = { id: nextId++, kind, role: row.role, xp: row.xp, x, y, radius: row.radius, weight: row.weight, speed: 1, phase: 0 };
  world.items.push(it);
  return it;
}

/** Шагать, пока сеть летит; вернуть число шагов. */
function land(s: ReturnType<typeof setup>): number {
  let n = 0;
  while (s.net.state === 'flying') {
    s.net.step(STEP_MS, s.world, s.raft);
    n++;
  }
  return n;
}

/** Шагать до возврата; вернуть улов и число шагов. */
function untilReturn(s: ReturnType<typeof setup>, limit = 10_000): { caught: CaughtItem[]; steps: number } {
  for (let n = 1; n <= limit; n++) {
    const c = s.net.step(STEP_MS, s.world, s.raft);
    if (c) return { caught: c, steps: n };
  }
  throw new Error('сеть не вернулась');
}

describe('Net', () => {
  it('бросок дальше предела — на окружность range, направление сохранено', () => {
    const s = setup();
    expect(s.net.throwTo(600, 800, NO_AUTO)).toBe(true);
    land(s);
    expect(Math.hypot(s.net.x, s.net.y)).toBeCloseTo(PARAMS.range, 6);
    expect(s.net.x / s.net.y).toBeCloseTo(600 / 800, 9);
    expect(s.net.state).toBe('lying');
  });

  it('время полёта на range — по формуле; в полёте не ловит', () => {
    const s = setup();
    const it = put(s.world, 'branch', PARAMS.range / 2, 0);
    s.net.throwTo(PARAMS.range, 0, NO_AUTO);
    const e = DATA.num('net_flight_end_mult');
    const v = DATA.num('net_flight_speed');
    const expectedMs = ((PARAMS.range * Math.log(1 / e)) / (v * (1 - e))) * 1000;
    let steps = 0;
    while (s.net.state === 'flying') {
      expect(s.world.items).toContain(it);
      s.net.step(STEP_MS, s.world, s.raft);
      steps++;
    }
    expect(Math.abs(steps * STEP_MS - expectedMs)).toBeLessThanOrEqual(2 * STEP_MS);
  });

  it('лежащая сеть ловит в радиусе radius + item.radius, не больше capacity', () => {
    const s = setup();
    s.net.throwTo(150, 0, NO_AUTO);
    land(s);
    const r = PARAMS.radius + DATA.item('keg').radius;
    const near = put(s.world, 'keg', 150, r - 0.5);
    const far = put(s.world, 'keg', 150, -(r + 0.5));
    s.net.step(STEP_MS, s.world, s.raft);
    expect(s.world.items).not.toContain(near);
    expect(s.world.items).toContain(far);
    expect(s.net.caught).toHaveLength(1);
    expect(s.net.caught[0]!.xp).toBe(DATA.item('keg').xp);
    for (let i = 0; i < PARAMS.capacity + 2; i++) put(s.world, 'branch', 150, 0);
    s.net.step(STEP_MS, s.world, s.raft);
    expect(s.net.caught).toHaveLength(PARAMS.capacity);
    expect(s.world.items.filter((x) => x.kind === 'branch')).toHaveLength(3);
  });

  it('скорость тяги: пустая, с тремя тяжёлыми, нижний предел', () => {
    const dx = (s: ReturnType<typeof setup>): number => {
      const x0 = s.net.x;
      s.net.step(STEP_MS, s.world, s.raft);
      return ((x0 - s.net.x) / STEP_MS) * 1000;
    };
    const a = setup();
    a.net.throwTo(PARAMS.range, 0, NO_AUTO);
    land(a);
    a.net.setPull(true);
    expect(dx(a)).toBeCloseTo(clamp(PARAMS.pull), 6);

    const b = setup();
    for (let i = 0; i < 3; i++) put(b.world, 'small_chest', PARAMS.range, 0);
    b.net.throwTo(PARAMS.range, 0, NO_AUTO);
    land(b);
    expect(b.net.weight).toBeCloseTo(3 * DATA.item('small_chest').weight, 9);
    b.net.setPull(true);
    expect(dx(b)).toBeCloseTo(PARAMS.pull / 10, 6);
    b.net.setParams({ ...PARAMS, pull: 1 });
    expect(dx(b)).toBeCloseTo(DATA.num('net_pull_min'), 6);
  });

  it('возврат: улов отдаётся, сеть ready в (0, 0), caught пуст', () => {
    const s = setup();
    put(s.world, 'keg', 120, 0);
    s.net.throwTo(120, 0, NO_AUTO);
    land(s);
    s.net.setPull(true);
    const { caught } = untilReturn(s);
    expect(caught.map((c) => c.kind)).toEqual(['keg']);
    expect(s.net.state).toBe('ready');
    expect([s.net.x, s.net.y]).toEqual([0, 0]);
    expect(s.net.caught).toHaveLength(0);
  });

  it('throwTo не из ready — false, состояние не меняется', () => {
    const s = setup();
    s.net.throwTo(100, 0, NO_AUTO);
    s.net.step(STEP_MS, s.world, s.raft);
    const before = { state: s.net.state, x: s.net.x, y: s.net.y };
    expect(s.net.throwTo(-100, 0, NO_AUTO)).toBe(false);
    expect({ state: s.net.state, x: s.net.x, y: s.net.y }).toEqual(before);
    land(s);
    expect(s.net.throwTo(-100, 0, NO_AUTO)).toBe(false);
    expect(s.net.state).toBe('lying');
  });

  it('удержание: lying ↔ pulling, сеть стоит; удержание в полёте — pulling после падения', () => {
    const s = setup();
    s.net.throwTo(150, 0, NO_AUTO);
    land(s);
    s.net.setPull(true);
    expect(s.net.state).toBe('pulling');
    for (let i = 0; i < 10; i++) s.net.step(STEP_MS, s.world, s.raft);
    s.net.setPull(false);
    expect(s.net.state).toBe('lying');
    const x = s.net.x;
    for (let i = 0; i < 30; i++) s.net.step(STEP_MS, s.world, s.raft);
    expect(s.net.x).toBe(x);
    expect(s.net.state).toBe('lying');

    const f = setup();
    f.net.throwTo(150, 0, NO_AUTO);
    f.net.step(STEP_MS, f.world, f.raft);
    f.net.setPull(true);
    expect(f.net.state).toBe('flying');
    land(f);
    expect(f.net.state).toBe('pulling');
  });

  it('автотяга: через autoPullAfterMs после падения, не останавливается, удержание ускоряет', () => {
    const after = DATA.num('scheme_b_autopull_ms');
    const s = setup();
    s.net.throwTo(PARAMS.range, 0, { autoPullAfterMs: after });
    land(s);
    let steps = 0;
    while (s.net.state === 'lying') {
      s.net.step(STEP_MS, s.world, s.raft);
      steps++;
    }
    expect(s.net.state).toBe('pulling');
    expect(Math.abs(steps * STEP_MS - after)).toBeLessThanOrEqual(STEP_MS + 1e-9);
    s.net.setPull(true);
    s.net.setPull(false);
    expect(s.net.state).toBe('pulling');
    let x0 = s.net.x;
    s.net.step(STEP_MS, s.world, s.raft);
    const plain = x0 - s.net.x;
    expect(plain).toBeGreaterThan(0);
    s.net.setPull(true, DATA.num('scheme_b_hold_mult'));
    x0 = s.net.x;
    s.net.step(STEP_MS, s.world, s.raft);
    expect(x0 - s.net.x).toBeCloseTo(plain * DATA.num('scheme_b_hold_mult'), 6);
    expect(untilReturn(s).caught).toEqual([]);
  });

  it('ведение: following к точке, в пределах дальности, ловит по пути; просьбы в полёте; null — возврат сам', () => {
    const s = setup();
    s.net.throwTo(100, 0, NO_AUTO);
    land(s);
    const it = put(s.world, 'branch', 100, 60);
    s.net.setFollow({ x: 100, y: 1000 });
    expect(s.net.state).toBe('following');
    for (let i = 0; i < 300; i++) {
      s.net.step(STEP_MS, s.world, s.raft);
      expect(Math.hypot(s.net.x, s.net.y)).toBeLessThanOrEqual(PARAMS.range + 1e-6);
    }
    expect(s.world.items).not.toContain(it);
    expect(s.net.caught).toHaveLength(1);
    expect(Math.hypot(s.net.x, s.net.y)).toBeCloseTo(PARAMS.range, 6);
    s.net.setFollow(null);
    expect(s.net.state).toBe('pulling');
    s.net.setPull(false);
    expect(s.net.state).toBe('pulling');
    expect(untilReturn(s).caught).toHaveLength(1);

    const f = setup();
    f.net.throwTo(150, 0, NO_AUTO);
    f.net.step(STEP_MS, f.world, f.raft);
    f.net.setFollow({ x: 0, y: 150 });
    f.net.setFollow({ x: 0, y: -150 });
    land(f);
    expect(f.net.state).toBe('following');
    for (let i = 0; i < 300; i++) f.net.step(STEP_MS, f.world, f.raft);
    expect(f.net.x).toBeCloseTo(0, 6);
    expect(f.net.y).toBeCloseTo(-150, 6);

    const g = setup();
    g.net.throwTo(150, 0, NO_AUTO);
    g.net.step(STEP_MS, g.world, g.raft);
    g.net.setFollow(null);
    land(g);
    expect(g.net.state).toBe('pulling');
    untilReturn(g);
    expect(g.net.state).toBe('ready');
  });

  it('не зависит от частоты кадров: 30, 60 и 144 к/с', () => {
    const run = (fps: number): { kinds: string[]; returnMs: number } => {
      const game = new Game(DATA, { halfW: 640, halfH: 360, speedMult: 1, locationId: 'lagoon', seed: 3 });
      const clock = new FixedStep();
      const frame = 1000 / fps;
      let landedMs: number | null = null;
      let kinds: string[] | null = null;
      let returnMs = 0;
      const near = [...game.world.items].sort((a, b) => Math.hypot(a.x, a.y) - Math.hypot(b.x, b.y))[0]!;
      game.throwTo(near.x, near.y, NO_AUTO);
      for (let t = 0; t < 30_000 && kinds === null; t += frame) {
        clock.advance(frame, (dt) => {
          game.step(dt);
          if (landedMs === null && game.net.state !== 'flying') landedMs = game.stats.gameMs;
          if (kinds === null && game.net.state === 'ready') {
            kinds = game.progression.icons.map((i) => `${i.xp}@${Math.round(i.fromX)},${Math.round(i.fromY)}`);
            returnMs = game.stats.gameMs;
          }
        });
        if (landedMs !== null && game.stats.gameMs - landedMs >= 2000) game.setPull(true);
      }
      return { kinds: kinds ?? [], returnMs };
    };
    const results = [30, 60, 144].map(run);
    const base = results[1]!;
    expect(base.kinds.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(r.kinds).toEqual(base.kinds);
      expect(Math.abs(r.returnMs - base.returnMs)).toBeLessThanOrEqual(STEP_MS + 1e-6);
    }
  });
});
