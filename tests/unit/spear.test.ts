import { describe, expect, it } from 'vitest';
import { STEP_MS } from '../../src/core/clock';
import { Enemies, type EnemyHit } from '../../src/core/enemies';
import { Raft } from '../../src/core/raft';
import { Rng } from '../../src/core/rng';
import { Sailor } from '../../src/core/sailor';
import { Spear, type SpearTargets } from '../../src/core/spear';
import { Stats } from '../../src/core/stats';
import { World } from '../../src/core/world';
import { DATA } from '../../src/data';

const FLIGHT = DATA.num('spear_flight_speed');
const RETURN = DATA.num('spear_return_speed');
const HIT_R = DATA.num('spear_hit_radius');
const ENEMY_R = DATA.num('enemy_radius_px');
const TIER = DATA.sailorTier(DATA.location('lagoon').order);
/** Предел шагов любого цикла. */
const MAX_STEPS = 20_000;

/** Цели-подделка: записывает удары, на каждый отвечает одним попаданием. */
class FakeTargets implements SpearTargets {
  readonly calls: Array<{ x: number; y: number; reach: number; damage: number }> = [];

  hit(x: number, y: number, reach: number, damage: number): EnemyHit[] {
    this.calls.push({ x, y, reach, damage });
    return [{ x, y, dealt: damage }];
  }
}

function setup(): { spear: Spear; sailor: Sailor; raft: Raft; enemies: Enemies; stats: Stats } {
  const raft = new Raft(DATA);
  const sailor = new Sailor(DATA);
  const spear = new Spear(DATA, sailor);
  spear.damage = TIER.spearDamage;
  spear.range = TIER.throwRange;
  const world = new World({ halfW: 640, halfH: 360, speedMult: 1, locationId: 'lagoon', level: 1 }, DATA, new Rng(1));
  const stats = new Stats();
  const enemies = new Enemies(DATA, 'lagoon', new Rng(3), world, stats);
  return { spear, sailor, raft, enemies, stats };
}

/** Шагать по dtMs, пока cond; число шагов. */
function run(spear: Spear, t: SpearTargets, dtMs: number, cond: () => boolean): number {
  let n = 0;
  for (; cond(); n++) {
    if (n >= MAX_STEPS) throw new Error('run: предел шагов');
    spear.step(dtMs, t);
  }
  return n;
}

describe('Spear', () => {
  it('полёт до точки — d / spear_flight_speed', () => {
    const { spear } = setup();
    const t = new FakeTargets();
    expect(spear.throwTo(150, 0)).toBe(true);
    const n = run(spear, t, STEP_MS, () => spear.state === 'flying');
    expect(Math.abs(n * STEP_MS - (150 / FLIGHT) * 1000)).toBeLessThanOrEqual(STEP_MS);
  });

  it('бросок дальше круга — на край круга вокруг моряка', () => {
    const { spear } = setup();
    const t = new FakeTargets();
    spear.throwTo(1000, 1000);
    run(spear, t, STEP_MS, () => spear.state === 'flying');
    const r = TIER.throwRange;
    expect(t.calls[0]!.x).toBeCloseTo(r / Math.SQRT2, 6);
    expect(t.calls[0]!.y).toBeCloseTo(r / Math.SQRT2, 6);
  });

  it('бросок не из ready — false', () => {
    const { spear } = setup();
    const t = new FakeTargets();
    spear.throwTo(100, 0);
    expect(spear.throwTo(-100, 0)).toBe(false);
    run(spear, t, STEP_MS, () => spear.state === 'flying');
    expect(spear.state).toBe('returning');
    expect(spear.throwTo(-100, 0)).toBe(false);
  });

  it('граница попадания: ближе spear_hit_radius + радиус краба — урон, ровно и дальше — нет', () => {
    for (const [off, hurt] of [[-0.5, true], [0, false], [0.5, false]] as const) {
      const { spear, raft, enemies } = setup();
      const e = enemies.spawnNow({ raft, level: 1, ready: false }, { x: 100 + HIT_R + ENEMY_R + off, y: 0 })!;
      const hp = e.hp;
      spear.throwTo(100, 0);
      run(spear, enemies, STEP_MS, () => spear.state === 'flying');
      expect(e.hp, `сдвиг ${off}`).toBe(hurt ? hp - TIER.spearDamage : hp);
    }
  });

  it('два краба рядом — урон обоим', () => {
    const { spear, raft, enemies } = setup();
    const ctx = { raft, level: 1, ready: false };
    const a = enemies.spawnNow(ctx, { x: 90, y: 0 })!;
    const b = enemies.spawnNow(ctx, { x: 110, y: 10 })!;
    const hpA = a.hp;
    const hpB = b.hp;
    spear.throwTo(100, 0);
    let hits: EnemyHit[] = [];
    for (let i = 0; i < MAX_STEPS && spear.state === 'flying'; i++) hits = spear.step(STEP_MS, enemies);
    expect(hits.length).toBe(2);
    expect(a.hp).toBe(hpA - TIER.spearDamage);
    expect(b.hp).toBe(hpB - TIER.spearDamage);
  });

  it('возврат к моряку со скоростью spear_return_speed; ready — когда коснулось моряка', () => {
    const { spear, sailor } = setup();
    const t = new FakeTargets();
    spear.throwTo(150, 0);
    spear.step((150 / FLIGHT) * 1000, t);   // ровно до падения: остатка шага нет
    expect(spear.state).toBe('returning');
    expect(spear.x).toBeCloseTo(150, 6);
    spear.step(10, t);
    expect(spear.x).toBeCloseTo(150 - RETURN * 0.01, 6);
    run(spear, t, 1, () => spear.state === 'returning');
    expect(spear.state).toBe('ready');
    expect([spear.x, spear.y]).toEqual([sailor.x, sailor.y]);
  });

  it('моряк ушёл, пока копьё летит, — копьё возвращается к его новой точке', () => {
    const { spear, sailor, raft } = setup();
    raft.add(1, 0);
    const t = new FakeTargets();
    spear.throwTo(-150, 0);
    spear.step(STEP_MS, t);
    expect(sailor.move(1, 0, raft)).toBe(true);
    run(spear, t, STEP_MS, () => spear.state !== 'ready');
    expect([spear.x, spear.y]).toEqual([sailor.x, sailor.y]);
    expect(sailor.x).toBe(DATA.num('cell_px'));
  });

  it('30, 60 и 144 кадра в секунду — одно и то же попадание', () => {
    const results = [30, 60, 144].map((fps) => {
      const { spear } = setup();
      const t = new FakeTargets();
      spear.throwTo(120, -70);
      run(spear, t, 1000 / fps, () => spear.state !== 'ready');
      return t.calls;
    });
    for (const calls of results) {
      expect(calls.length).toBe(1);
      expect(calls[0]!.x).toBeCloseTo(120, 9);
      expect(calls[0]!.y).toBeCloseTo(-70, 9);
      expect(calls[0]!.reach).toBe(HIT_R);
      expect(calls[0]!.damage).toBe(TIER.spearDamage);
    }
  });

  it('step возвращает попадания только на шаге падения', () => {
    const { spear } = setup();
    const t = new FakeTargets();
    expect(spear.step(STEP_MS, t)).toEqual([]);
    spear.throwTo(150, 0);
    const got: number[] = [];
    for (let i = 0; i < MAX_STEPS && spear.state !== 'ready'; i++) got.push(spear.step(STEP_MS, t).length);
    expect(got.filter((n) => n > 0)).toEqual([1]);
    expect(t.calls.length).toBe(1);
    // Шаг падения — тот, после которого копьё уже не летит.
    const landing = got.findIndex((n) => n > 0);
    expect(landing).toBe(Math.ceil((150 / FLIGHT) * 1000 / STEP_MS - 1e-9) - 1);
  });
});
