import { describe, expect, it } from 'vitest';
import { STEP_MS } from '../../src/core/clock';
import { Enemies, type EnemiesContext, type Enemy } from '../../src/core/enemies';
import { Game, type GameConfig, type GameSnapshot } from '../../src/core/game';
import { Raft } from '../../src/core/raft';
import { Rng } from '../../src/core/rng';
import { Stats } from '../../src/core/stats';
import { World } from '../../src/core/world';
import { DATA } from '../../src/data';

// Крабы-вожаки в шторм (M1-16): один на событие, на leader_after_s; прочность × уровень, свой укус, скорость и добыча.
const CFG: GameConfig = { halfW: 640, halfH: 360, speedMult: 1, locationId: 'lagoon', seed: 1 };
const LOC = DATA.location('lagoon');
const AFTER_MS = DATA.num('leader_after_s') * 1000;
const HP_PER_LEVEL = DATA.num('leader_hp_per_level') * LOC.enemyHpMult;
const BITE = DATA.num('leader_damage') * LOC.enemyDmgMult;
const SPEED = DATA.num('leader_speed');
const RADIUS = DATA.num('leader_radius_px');
const LOOT_PER_HP = DATA.num('leader_loot_per_hp') * LOC.enemyHpMult;
const REACH = DATA.num('enemy_reach_px');
const CELL = DATA.num('cell_px');
const CELL_HP = DATA.num('cell_hp');
const DURATION_MS = Number(DATA.events.find((e) => e.id === LOC.eventId && e.location === 'lagoon')!.duration_s) * 1000;
const steps = (ms: number): number => Math.round(ms / STEP_MS);
const MAX_STEPS = 20_000;
const viaJson = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** Плот из трёх клеток в ряд, свой Stats; враги уже начались (первый — без события, его убираем). */
function env(): { enemies: Enemies; raft: Raft; stats: Stats; ctx: (o?: Partial<EnemiesContext>) => EnemiesContext } {
  const world = new World({ halfW: 640, halfH: 360, speedMult: 1, locationId: 'lagoon', level: 1 }, DATA, new Rng(1));
  const stats = new Stats();
  const raft = new Raft(DATA);
  expect(raft.add(1, 0)).toBe(true);
  expect(raft.add(-1, 0)).toBe(true);
  const enemies = new Enemies(DATA, 'lagoon', new Rng(5), world, stats);
  const ctx = (o: Partial<EnemiesContext> = {}): EnemiesContext => ({ raft, level: 20, ready: true, ...o });
  return { enemies, raft, stats, ctx };
}

const leaders = (list: Enemy[]): Enemy[] => list.filter((e) => e.leader === true);
const leadersOf = (g: Game): Enemy[] => leaders(g.enemies.list);

/** Игра со штормом: клетка (1, 0), средний предмет пойман, один шаг (первый краб), шторм. */
function stormGame(): Game {
  const g = new Game(DATA, CFG);
  expect(g.raft.add(1, 0)).toBe(true);
  g.mediumCaught = true;
  g.step(STEP_MS);
  expect(g.enemies.spawned).toBe(1);
  g.debugEvent();
  return g;
}

function stepN(g: Game, n: number): void {
  for (let i = 0; i < n; i++) g.step(STEP_MS);
}

describe('Enemies: вожак события', () => {
  it('без события нет; до leader_after_s нет; на сроке — один, прочность по уровню, свой радиус; новое событие — второй', () => {
    const { enemies, stats, ctx } = env();
    enemies.step(STEP_MS, ctx());
    enemies.list.length = 0;
    for (let i = 0; i < 100; i++) enemies.step(STEP_MS, ctx({ rateMult: 0.001 }));
    expect(stats.leaders).toBe(0);
    enemies.step(STEP_MS, ctx({ event: { count: 1, elapsedMs: AFTER_MS - 2 * STEP_MS } }));
    expect(leaders(enemies.list)).toEqual([]);
    enemies.step(STEP_MS, ctx({ event: { count: 1, elapsedMs: AFTER_MS } }));
    const ls = leaders(enemies.list);
    expect(ls).toHaveLength(1);
    expect(ls[0]!.hp).toBe(HP_PER_LEVEL * 20);
    expect(ls[0]!.radius).toBe(RADIUS);
    expect(stats.leaders).toBe(1);
    for (let i = 0; i < 100; i++) enemies.step(STEP_MS, ctx({ event: { count: 1, elapsedMs: AFTER_MS + i * STEP_MS } }));
    expect(stats.leaders).toBe(1);
    enemies.step(STEP_MS, ctx({ level: 30, event: { count: 2, elapsedMs: AFTER_MS } }));
    expect(stats.leaders).toBe(2);
    expect(leaders(enemies.list).at(-1)!.hp).toBe(HP_PER_LEVEL * 30);
  });

  it('до первого врага и под бустом вожака нет; буст кончился, событие идёт — пришёл', () => {
    const { enemies, stats, ctx } = env();
    const ev = { count: 1, elapsedMs: AFTER_MS };
    enemies.step(STEP_MS, ctx({ ready: false, event: ev }));
    expect(stats.leaders).toBe(0);
    expect(enemies.spawned).toBe(0);
    enemies.step(STEP_MS, ctx({ ready: false, event: ev }));
    expect(stats.leaders).toBe(0);

    const b = env();
    b.enemies.step(STEP_MS, b.ctx());
    b.enemies.step(STEP_MS, b.ctx({ blocked: true, event: ev }));
    expect(b.stats.leaders).toBe(0);
    b.enemies.step(STEP_MS, b.ctx({ event: { count: 1, elapsedMs: AFTER_MS + 10_000 } }));
    expect(b.stats.leaders).toBe(1);
  });

  it('идёт leader_speed точек в секунду; дошёл — стоит в enemy_reach_px от клетки и снял leader_damage × сила урона', () => {
    const { enemies, raft, ctx } = env();
    const e = enemies.spawnNow(ctx(), { x: 600, y: 0 }, true)!;
    expect(e.leader).toBe(true);
    // Самая дальняя целая клетка, кроме центральной, — по ту сторону плота.
    expect([e.targetGx, e.targetGy]).toEqual([-1, 0]);
    for (let i = 0; i < steps(1000); i++) enemies.step(STEP_MS, ctx({ ready: false }));
    expect(600 - e.x).toBeCloseTo(SPEED, 6);
    for (let i = 0; i < MAX_STEPS && e.phase === 'approach'; i++) enemies.step(STEP_MS, ctx({ ready: false }));
    expect(e.phase).toBe('wait');
    expect(Math.hypot(e.x + CELL, e.y)).toBeCloseTo(REACH, 6);
    expect(raft.cells.find((c) => c.gx === -1 && c.gy === 0)!.hp).toBe(CELL_HP - BITE);
  });

  it('добыча — предмет на leader_loot_per_hp единиц урона; добит — leadersKilled и enemiesKilled', () => {
    const { enemies, stats, ctx } = env();
    const e = enemies.spawnNow(ctx({ level: 10 }), { x: 600, y: 0 }, true)!;
    expect(e.hp).toBe(HP_PER_LEVEL * 10);
    enemies.hit(e.x, e.y, 1, 2 * LOOT_PER_HP);
    expect(stats.lootDropped).toBe(2);
    enemies.hit(e.x, e.y, 1, 1000);
    expect(stats.lootDropped).toBe((HP_PER_LEVEL * 10) / LOOT_PER_HP);
    expect([stats.leadersKilled, stats.enemiesKilled]).toEqual([1, 1]);
  });
});

describe('Вожак в игре', () => {
  it('приходит на leader_after_s шторма, прочность — leader_hp_per_level × уровень', () => {
    const g = stormGame();
    stepN(g, steps(AFTER_MS) - 1);
    expect(leadersOf(g)).toEqual([]);
    g.step(STEP_MS);
    expect(leadersOf(g)).toHaveLength(1);
    expect(leadersOf(g)[0]!.hp).toBe(HP_PER_LEVEL * g.progression.level);
  });

  it('снимок посреди шторма: продолжение как без перерыва; вожак за шторм один', () => {
    const g = stormGame();
    stepN(g, steps(AFTER_MS / 2));
    const s = viaJson(g.snapshot());
    const h = Game.restore(DATA, CFG, viaJson(s));
    stepN(g, steps(DURATION_MS));
    stepN(h, steps(DURATION_MS));
    expect(viaJson(h.snapshot())).toEqual(viaJson(g.snapshot()));
    expect(g.stats.leaders).toBe(1);
  });

  it('новый шторм — второй вожак; запись без leaderEvent (до M1-16) — в первом шаге третий', () => {
    const g = stormGame();
    stepN(g, steps(AFTER_MS));
    expect(g.stats.leaders).toBe(1);
    g.debugEvent();
    stepN(g, steps(AFTER_MS));
    expect(g.stats.leaders).toBe(2);
    const s = viaJson(g.snapshot()) as GameSnapshot;
    delete s.enemies.leaderEvent;
    const h = Game.restore(DATA, CFG, s);
    h.step(STEP_MS);
    expect(h.stats.leaders).toBe(3);
  });

  it('буст за рекламу топит вожака', () => {
    const g = stormGame();
    stepN(g, steps(AFTER_MS));
    expect(leadersOf(g)).toHaveLength(1);
    expect(g.debugBoostOffer()).toBe(true);
    expect(g.takeBoostOffer()).toBe(true);
    expect(g.adDone(true)).toBe(true);
    expect(leadersOf(g)).toEqual([]);
  });
});
