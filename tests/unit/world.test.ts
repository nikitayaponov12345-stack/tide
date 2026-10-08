import { describe, expect, it } from 'vitest';
import { FixedStep } from '../../src/core/clock';
import { Rng } from '../../src/core/rng';
import { MARGIN, World, type WorldConfig } from '../../src/core/world';
import { DATA } from '../../src/data';

const LANDSCAPE: WorldConfig = { halfW: 640, halfH: 360, speedMult: 1, locationId: 'lagoon', level: 1 };

function makeWorld(seed = 1, cfg: Partial<WorldConfig> = {}): World {
  return new World({ ...LANDSCAPE, ...cfg }, DATA, new Rng(seed));
}

/** Прогнать мир через FixedStep кадрами заданной частоты. */
function run(world: World, seconds: number, fps = 60): World {
  const clock = new FixedStep();
  const frame = 1000 / fps;
  for (let t = 0; t < seconds * 1000 - 1e-6; t += frame) clock.advance(frame, (dt) => world.step(dt));
  return world;
}

/** Виды предметов, появившихся из потока, пока их не наберётся count. */
function spawnedKinds(world: World, count: number): string[] {
  let maxId = Math.max(0, ...world.items.map((it) => it.id));
  const kinds: string[] = [];
  while (kinds.length < count) {
    world.step(100);
    for (const it of world.items) {
      if (it.id > maxId) kinds.push(it.kind);
    }
    maxId = Math.max(maxId, ...world.items.map((it) => it.id));
  }
  return kinds.slice(0, count);
}

const seedCount = (level: number): number =>
  Math.round(DATA.num('seed_seconds') * DATA.flowPerS(level)) + DATA.num('seed_near_raft');

describe('World: поток Лагуны', () => {
  it('число появившихся предметов не зависит от частоты кадров', () => {
    const counts = [30, 60, 144].map((fps) => run(makeWorld(), 10, fps).spawned);
    const expected = Math.floor(10 * DATA.flowPerS(1) + 1e-9);
    expect(counts).toEqual([expected, expected, expected]);
  });

  it('за один долгий шаг появляется столько предметов, сколько положено по времени', () => {
    const world = makeWorld();
    world.step(5000);
    expect(world.spawned).toBe(Math.floor(5 * DATA.flowPerS(1) + 1e-9));
  });

  it('одинаковый сид — одинаковое поле, другой сид — другое', () => {
    const a = run(makeWorld(5), 20);
    const b = run(makeWorld(5), 20);
    const c = run(makeWorld(6), 20);
    expect(a.items).toEqual(b.items);
    expect(a.items).not.toEqual(c.items);
  });

  it('предметы плывут по течению и уходят за край', () => {
    const world = run(makeWorld(), 120);
    expect(world.items.length).toBeLessThan(world.seeded + world.spawned);
    for (const it of world.items) {
      expect(Math.abs(it.x)).toBeLessThanOrEqual(LANDSCAPE.halfW + MARGIN);
      expect(Math.abs(it.y)).toBeLessThanOrEqual(LANDSCAPE.halfH + MARGIN);
    }
  });

  it('предмет из потока появляется за краем, откуда идёт течение', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const world = makeWorld(seed);
      const seededIds = new Set(world.items.map((it) => it.id));
      world.step(1000 / DATA.flowPerS(1));
      const fresh = world.items.filter((it) => !seededIds.has(it.id));
      expect(fresh).toHaveLength(1);
      const it = fresh[0]!;
      expect(it.x > LANDSCAPE.halfW || it.y < -LANDSCAPE.halfH).toBe(true); // течение Лагуны (−1, 1)
    }
  });

  it('поток растёт с уровнем', () => {
    const world = run(makeWorld(1, { level: 10 }), 60);
    expect(world.spawned).toBe(Math.floor(60 * DATA.flowPerS(10) + 1e-9));
  });

  it('предметы открываются по уровням', () => {
    const unlockedAt = (level: number): string[] =>
      DATA.flowItems('lagoon').filter((i) => i.unlockLevel !== null && i.unlockLevel <= level).map((i) => i.id);
    expect(new Set(spawnedKinds(makeWorld(1, { level: 1 }), 100))).toEqual(new Set(unlockedAt(1)));
    expect(unlockedAt(1)).toEqual(['branch']);
    const l3 = new Set(spawnedKinds(makeWorld(1, { level: 3 }), 300));
    expect(l3).toEqual(new Set(unlockedAt(3)));
    expect(l3).toEqual(new Set(['branch', 'coconut']));
    const l4 = new Set(spawnedKinds(makeWorld(1, { level: 4 }), 300));
    expect(l4).toEqual(new Set(unlockedAt(4)));
    expect(l4.has('keg')).toBe(true);
    const l9 = new Set(spawnedKinds(makeWorld(1, { level: 9 }), 2000));
    expect(l9).toEqual(new Set(DATA.flowItems('lagoon').map((i) => i.id)));
  });

  it('вид предмета выбирается по долям', () => {
    const world = makeWorld(7, { level: 9 });
    const n = 20000;
    const counts = new Map<string, number>();
    for (let i = 0; i < n; i++) {
      const k = world.rollKind().id;
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    const flow = DATA.flowItems('lagoon');
    const total = flow.reduce((s, i) => s + i.share, 0);
    for (const item of flow) {
      const pct = ((counts.get(item.id) ?? 0) / n) * 100;
      expect(Math.abs(pct - (item.share / total) * 100)).toBeLessThanOrEqual(1.5);
    }
  });

  it('засев поля на старте', () => {
    const world = makeWorld();
    expect(world.seeded).toBe(seedCount(1));
    expect(world.items).toHaveLength(world.seeded);
    expect(world.spawned).toBe(0);
    const min = DATA.num('seed_near_raft_min_px');
    const max = DATA.num('seed_near_raft_max_px');
    const near = world.items.filter((it) => {
      const d = Math.hypot(it.x, it.y);
      return d >= min && d <= max;
    });
    expect(near).toHaveLength(DATA.num('seed_near_raft'));
    for (const it of world.items) {
      expect(Math.hypot(it.x, it.y)).toBeGreaterThanOrEqual(min);
      expect(it.xp).toBe(DATA.item(it.kind).xp);
    }
    expect(makeWorld(1, { level: 10 }).seeded).toBe(seedCount(10));
  });

  it('reset() засевает поле заново', () => {
    const world = run(makeWorld(), 15);
    const time = world.timeMs;
    const maxId = Math.max(...world.items.map((it) => it.id));
    world.reset();
    expect(world.seeded).toBe(seedCount(1));
    expect(world.items).toHaveLength(world.seeded);
    expect(world.spawned).toBe(0);
    expect(world.timeMs).toBe(time);
    for (const it of world.items) expect(it.id).toBeGreaterThan(maxId);
  });

  it('в портрете течение медленнее во столько раз, сколько в current_portrait_mult', () => {
    const mult = DATA.num('current_portrait_mult');
    const a = makeWorld(3);
    const b = makeWorld(3, { speedMult: mult });
    a.step(1234);
    b.step(1234);
    const va = a.velocityOf(a.items[0]!);
    const vb = b.velocityOf(b.items[0]!);
    expect(vb.vx).toBeCloseTo(va.vx * mult, 9);
    expect(vb.vy).toBeCloseTo(va.vy * mult, 9);
    expect(Math.hypot(va.vx, va.vy)).toBeGreaterThan(0);
  });

  it('setLevel оставляет предметы в воде и меняет поток', () => {
    const world = run(makeWorld(), 10);
    expect(world.spawned).toBe(Math.floor(10 * DATA.flowPerS(1) + 1e-9));
    const before = world.items.map((it) => ({ ...it }));
    world.setLevel(10);
    expect(world.level).toBe(10);
    expect(world.items).toEqual(before);
    const spawned = world.spawned;
    run(world, 10);
    expect(world.spawned - spawned).toBe(Math.floor(10 * DATA.flowPerS(10) + 1e-9));
  });
});
