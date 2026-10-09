import { describe, expect, it } from 'vitest';
import { FixedStep, STEP_MS } from '../../src/core/clock';
import { Game } from '../../src/core/game';
import { Net, type CaughtItem, type NetParams } from '../../src/core/net';
import { Rng } from '../../src/core/rng';
import { Sailor } from '../../src/core/sailor';
import { World, type Item } from '../../src/core/world';
import { DATA } from '../../src/data';

const tier = DATA.sailorTier(1);
const PARAMS: NetParams = { radius: tier.netRadius, capacity: tier.netCapacity, range: tier.throwRange, pull: tier.pull };
const clamp = (v: number): number => Math.min(DATA.num('net_pull_max'), Math.max(DATA.num('net_pull_min'), v));

/** Пустое море: предметы кладёт тест, мир не шагает. */
function setup(params: NetParams = PARAMS): { net: Net; world: World; sailor: Sailor } {
  const world = new World({ halfW: 640, halfH: 360, speedMult: 1, locationId: 'lagoon', level: 1 }, DATA, new Rng(1));
  world.items.length = 0;
  const sailor = new Sailor(DATA);
  return { net: new Net(DATA, params, sailor), world, sailor };
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
    s.net.step(STEP_MS, s.world);
    n++;
  }
  return n;
}

/** Шагать до возврата; вернуть улов и число шагов. */
function untilReturn(s: ReturnType<typeof setup>, limit = 10_000): { caught: CaughtItem[]; steps: number } {
  for (let n = 1; n <= limit; n++) {
    const c = s.net.step(STEP_MS, s.world);
    if (c) return { caught: c, steps: n };
  }
  throw new Error('сеть не вернулась');
}

describe('Net', () => {
  it('бросок дальше предела — на окружность range, направление сохранено', () => {
    const s = setup();
    expect(s.net.throwTo(600, 800)).toBe(true);
    land(s);
    expect(Math.hypot(s.net.x, s.net.y)).toBeCloseTo(PARAMS.range, 6);
    expect(s.net.x / s.net.y).toBeCloseTo(600 / 800, 9);
    expect(s.net.state).toBe('lying');
  });

  it('время полёта на range — по формуле; в полёте не ловит', () => {
    const s = setup();
    const it = put(s.world, 'branch', PARAMS.range / 2, 0);
    s.net.throwTo(PARAMS.range, 0);
    const e = DATA.num('net_flight_end_mult');
    const v = DATA.num('net_flight_speed');
    const expectedMs = ((PARAMS.range * Math.log(1 / e)) / (v * (1 - e))) * 1000;
    let steps = 0;
    while (s.net.state === 'flying') {
      expect(s.world.items).toContain(it);
      s.net.step(STEP_MS, s.world);
      steps++;
    }
    expect(Math.abs(steps * STEP_MS - expectedMs)).toBeLessThanOrEqual(2 * STEP_MS);
  });

  it('лежащая сеть ловит в радиусе radius + item.radius, не больше capacity', () => {
    const s = setup();
    s.net.throwTo(150, 0);
    land(s);
    const r = PARAMS.radius + DATA.item('keg').radius;
    const near = put(s.world, 'keg', 150, r - 0.5);
    const far = put(s.world, 'keg', 150, -(r + 0.5));
    s.net.step(STEP_MS, s.world);
    expect(s.world.items).not.toContain(near);
    expect(s.world.items).toContain(far);
    expect(s.net.caught).toHaveLength(1);
    expect(s.net.caught[0]!.xp).toBe(DATA.item('keg').xp);
    for (let i = 0; i < PARAMS.capacity + 2; i++) put(s.world, 'branch', 150, 0);
    s.net.step(STEP_MS, s.world);
    expect(s.net.caught).toHaveLength(PARAMS.capacity);
    expect(s.world.items.filter((x) => x.kind === 'branch')).toHaveLength(3);
  });

  it('скорость тяги: пустая, с тремя тяжёлыми, нижний предел', () => {
    const dx = (s: ReturnType<typeof setup>): number => {
      const x0 = s.net.x;
      s.net.step(STEP_MS, s.world);
      return ((x0 - s.net.x) / STEP_MS) * 1000;
    };
    const a = setup();
    a.net.throwTo(PARAMS.range, 0);
    land(a);
    a.net.setPull(true);
    expect(dx(a)).toBeCloseTo(clamp(PARAMS.pull), 6);

    const b = setup();
    for (let i = 0; i < 3; i++) put(b.world, 'small_chest', PARAMS.range, 0);
    b.net.throwTo(PARAMS.range, 0);
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
    s.net.throwTo(120, 0);
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
    s.net.throwTo(100, 0);
    s.net.step(STEP_MS, s.world);
    const before = { state: s.net.state, x: s.net.x, y: s.net.y };
    expect(s.net.throwTo(-100, 0)).toBe(false);
    expect({ state: s.net.state, x: s.net.x, y: s.net.y }).toEqual(before);
    land(s);
    expect(s.net.throwTo(-100, 0)).toBe(false);
    expect(s.net.state).toBe('lying');
  });

  it('удержание: lying ↔ pulling, сеть стоит; удержание в полёте — pulling после падения', () => {
    const s = setup();
    s.net.throwTo(150, 0);
    land(s);
    s.net.setPull(true);
    expect(s.net.state).toBe('pulling');
    for (let i = 0; i < 10; i++) s.net.step(STEP_MS, s.world);
    s.net.setPull(false);
    expect(s.net.state).toBe('lying');
    const x = s.net.x;
    for (let i = 0; i < 30; i++) s.net.step(STEP_MS, s.world);
    expect(s.net.x).toBe(x);
    expect(s.net.state).toBe('lying');

    const f = setup();
    f.net.throwTo(150, 0);
    f.net.step(STEP_MS, f.world);
    f.net.setPull(true);
    expect(f.net.state).toBe('flying');
    land(f);
    expect(f.net.state).toBe('pulling');
  });

  it('забирается, коснувшись квадрата моряка; без удержания — только упав вплотную', () => {
    const s = setup();
    s.net.throwTo(150, 0);
    land(s);
    s.net.setPull(true);
    untilReturn(s);
    expect(s.net.state).toBe('ready');
    expect([s.net.x, s.net.y]).toEqual([s.sailor.x, s.sailor.y]);

    const edge = DATA.num('sailor_box_px') / 2 + PARAMS.radius;
    const near = setup();
    near.net.throwTo(edge, 0);
    land(near);
    expect(near.net.state).toBe('ready');

    const far = setup();
    far.net.throwTo(edge + 0.5, 0);
    land(far);
    for (let i = 0; i < 30; i++) expect(far.net.step(STEP_MS, far.world)).toBeNull();
    expect(far.net.state).toBe('lying');
    expect(far.net.x).toBe(edge + 0.5);
  });

  it('упавшая у моряка сеть забирается сразу, без удержания, и отдаёт улов', () => {
    const s = setup();
    const x = DATA.num('sailor_box_px') / 2;
    put(s.world, 'keg', x, 0);
    s.net.throwTo(x, 0);
    let caught: CaughtItem[] | null = null;
    while (caught === null && s.net.state === 'flying') caught = s.net.step(STEP_MS, s.world);
    expect(caught?.map((c) => c.kind)).toEqual(['keg']);
    expect(s.net.state).toBe('ready');
    expect(s.world.items).toHaveLength(0);
  });

  it('всё — от моряка: точка после reset, круг дальности, тяга и возврат', () => {
    const s = setup();
    s.sailor.gx = 1;
    s.net.reset();
    const sx = s.sailor.x;
    expect(sx).toBe(DATA.num('cell_px'));
    expect([s.net.x, s.net.y]).toEqual([sx, 0]);

    s.net.throwTo(sx + 600, 800);
    expect([s.net.x, s.net.y]).toEqual([sx, 0]);
    s.net.step(STEP_MS, s.world);
    expect((s.net.x - sx) / s.net.y).toBeCloseTo(600 / 800, 9);   // летит от моряка
    land(s);
    expect(Math.hypot(s.net.x - sx, s.net.y)).toBeCloseTo(PARAMS.range, 6);
    expect((s.net.x - sx) / s.net.y).toBeCloseTo(600 / 800, 9);

    s.net.setPull(true);
    const d0 = Math.hypot(s.net.x - sx, s.net.y);
    s.net.step(STEP_MS, s.world);
    const d1 = Math.hypot(s.net.x - sx, s.net.y);
    expect(d0 - d1).toBeCloseTo((s.net.pullSpeed() * STEP_MS) / 1000, 6);

    untilReturn(s);
    expect([s.net.x, s.net.y]).toEqual([sx, 0]);
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
      game.throwTo(near.x, near.y);
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
