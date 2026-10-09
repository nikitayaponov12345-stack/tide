import { describe, expect, it } from 'vitest';
import { STEP_MS } from '../../src/core/clock';
import { Enemies, type Enemy } from '../../src/core/enemies';
import { Game } from '../../src/core/game';
import { Raft } from '../../src/core/raft';
import { Rng } from '../../src/core/rng';
import { Stats } from '../../src/core/stats';
import { World } from '../../src/core/world';
import { DATA } from '../../src/data';

const HALF = { halfW: 640, halfH: 360 };
const CRAB = DATA.enemies.find((e) => e.id === DATA.location('lagoon').enemyId)!;
const SPEED = Number(CRAB.speed);
const REACH = DATA.num('enemy_reach_px');
const WAIT = DATA.num('enemy_wait_ms');
const OUT = DATA.num('enemy_spawn_outside_px');
const INTERVAL_MS = DATA.num('enemy_interval_base_s') * 1000;
const CELL = DATA.num('cell_px');
const MAX_STEPS = 20_000;

function env(seed = 3, locationId = 'lagoon'): { enemies: Enemies; world: World; raft: Raft; stats: Stats } {
  const world = new World({ ...HALF, speedMult: 1, locationId, level: 1 }, DATA, new Rng(1));
  const stats = new Stats();
  return { enemies: new Enemies(DATA, locationId, new Rng(seed), world, stats), world, raft: new Raft(DATA), stats };
}

/** Шагать по dtMs суммарно ms времени. */
function advance(e: Enemies, raft: Raft, ms: number, dtMs = STEP_MS, ready = true, level = 1): void {
  const n = Math.round(ms / dtMs);
  if (n > MAX_STEPS * 10) throw new Error('advance: предел шагов');
  for (let i = 0; i < n; i++) e.step(dtMs, { raft, level, ready });
}

const snap = (list: Enemy[]): Array<Pick<Enemy, 'id' | 'x' | 'y' | 'phase' | 'hp'>> => list.map(({ id, x, y, phase, hp }) => ({ id, x, y, phase, hp }));

describe('Enemies: появление', () => {
  it('без условия первого врага крабов нет и таймер не идёт', () => {
    const { enemies, raft } = env();
    advance(enemies, raft, 2 * INTERVAL_MS, STEP_MS, false);
    expect(enemies.list).toEqual([]);
    expect(enemies.spawned).toBe(0);
    enemies.step(STEP_MS, { raft, level: 1, ready: true });
    expect(enemies.spawned).toBe(1);
    // Таймер стоял: второй — только через полный интервал после первого.
    advance(enemies, raft, INTERVAL_MS - 2 * STEP_MS);
    expect(enemies.spawned).toBe(1);
  });

  it('условие выполнено — первый краб сразу, второй — через enemy_interval_base_s; дальше условие не нужно', () => {
    const { enemies, raft } = env();
    enemies.step(STEP_MS, { raft, level: 1, ready: true });
    expect(enemies.spawned).toBe(1);
    expect(enemies.intervalMs(0)).toBe(INTERVAL_MS);
    advance(enemies, raft, INTERVAL_MS - STEP_MS, STEP_MS, false);
    expect(enemies.spawned).toBe(1);
    advance(enemies, raft, STEP_MS, STEP_MS, false);
    expect(enemies.spawned).toBe(2);
  });

  it('точка появления — на enemy_spawn_outside_px за краем поля, на всех четырёх краях', () => {
    const { enemies, raft } = env();
    const ctx = { raft, level: 1, ready: false };
    const edges = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const e = enemies.spawnNow(ctx, null)!;
      const side = Math.abs(Math.abs(e.x) - (HALF.halfW + OUT)) < 1e-9 && Math.abs(e.y) <= HALF.halfH;
      const tb = Math.abs(Math.abs(e.y) - (HALF.halfH + OUT)) < 1e-9 && Math.abs(e.x) <= HALF.halfW;
      expect(side || tb).toBe(true);
      edges.add(side ? (e.x > 0 ? 'right' : 'left') : e.y > 0 ? 'bottom' : 'top');
      expect([e.spawnX, e.spawnY]).toEqual([e.x, e.y]);
    }
    expect(edges.size).toBe(4);
  });

  it('цель — самая дальняя клетка от точки появления', () => {
    const { enemies, raft } = env();
    raft.add(1, 0);
    raft.add(-1, 0);
    raft.add(0, 1);
    const ctx = { raft, level: 1, ready: false };
    const e = enemies.spawnNow(ctx, { x: 500, y: 0 })!;
    expect([e.targetGx, e.targetGy]).toEqual([-1, 0]);
    for (let i = 0; i < 50; i++) {
      const r = enemies.spawnNow(ctx, null)!;
      const far = Math.max(...raft.cells.map((c) => Math.hypot(c.gx * CELL - r.x, c.gy * CELL - r.y)));
      expect(Math.hypot(r.targetGx * CELL - r.x, r.targetGy * CELL - r.y)).toBe(far);
    }
  });
});

describe('Enemies: движение', () => {
  it('скорость — из enemies.csv', () => {
    const { enemies, raft } = env();
    const e = enemies.spawnNow({ raft, level: 1, ready: false }, { x: 500, y: 0 })!;
    advance(enemies, raft, 1000, STEP_MS, false);
    expect(e.x).toBeCloseTo(500 - SPEED, 6);
    expect(e.phase).toBe('approach');
  });

  it('стоит в enemy_reach_px от центра клетки enemy_wait_ms, потом уходит; у точки появления — пропал', () => {
    const { enemies, raft, stats } = env();
    const ctx = { raft, level: 1, ready: false };
    const e = enemies.spawnNow(ctx, { x: 200, y: 0 })!;
    const arrive = ((200 - REACH) / SPEED) * 1000;
    enemies.step(arrive - 1, ctx);
    expect(e.phase).toBe('approach');
    enemies.step(1, ctx);
    expect(e.phase).toBe('wait');
    expect(Math.hypot(e.x, e.y)).toBeCloseTo(REACH, 6);
    enemies.step(WAIT - 1, ctx);
    expect(e.phase).toBe('wait');
    enemies.step(2, ctx);
    expect(e.phase).toBe('leave');
    const back = ((200 - REACH) / SPEED) * 1000;
    enemies.step(back - 10, ctx);
    expect(enemies.list).toContain(e);
    expect(stats.enemiesEscaped).toBe(0);
    enemies.step(20, ctx);
    expect(enemies.list).not.toContain(e);
    expect(stats.enemiesEscaped).toBe(1);
  });

  it('30, 60 и 144 кадра в секунду и один долгий шаг — крабы в тех же точках и фазах', () => {
    const DURATION = 95_000;
    const runs = [30, 60, 144, 1000 / DURATION].map((fps) => {
      const { enemies, raft } = env();
      raft.add(1, 0);
      // Первый краб — в шаг нулевой длины: момент выполнения условия у всех частот один.
      enemies.step(0, { raft, level: 1, ready: true });
      advance(enemies, raft, DURATION, 1000 / fps);
      return snap(enemies.list);
    });
    const [base, ...rest] = runs;
    expect(base!.length).toBeGreaterThan(0);
    for (const r of rest) {
      expect(r.map((e) => [e.id, e.phase, e.hp])).toEqual(base!.map((e) => [e.id, e.phase, e.hp]));
      r.forEach((e, i) => {
        expect(e.x).toBeCloseTo(base![i]!.x, 6);
        expect(e.y).toBeCloseTo(base![i]!.y, 6);
      });
    }
  });

  it('один сид — одни и те же крабы', () => {
    const a = env(9);
    const b = env(9);
    for (const { enemies, raft } of [a, b]) {
      enemies.step(STEP_MS, { raft, level: 1, ready: true });
      advance(enemies, raft, 3 * INTERVAL_MS);
    }
    expect(a.enemies.spawned).toBe(b.enemies.spawned);
    expect(snap(a.enemies.list)).toEqual(snap(b.enemies.list));
  });
});

describe('Enemies: прочность, урон, добыча', () => {
  const hpRow = (level: number) => [...DATA.enemyHp].reverse().find((r) => Number(r.from_level) <= level)!;

  it('прочность по enemy_hp.csv: на 1 уровне — 2, на 14-м — от 3 до 5', () => {
    for (const level of [1, 14]) {
      const { enemies, raft } = env();
      const row = hpRow(level);
      const seen = new Set<number>();
      for (let i = 0; i < 200; i++) seen.add(enemies.spawnNow({ raft, level, ready: false }, null)!.hp);
      const mult = DATA.location('lagoon').enemyHpMult;
      for (let hp = Number(row.hp_min); hp <= Number(row.hp_max); hp++) expect(seen.has(hp * mult), `уровень ${level}, ${hp}`).toBe(true);
      expect(Math.min(...seen)).toBe(Number(row.hp_min) * mult);
      expect(Math.max(...seen)).toBe(Number(row.hp_max) * mult);
    }
  });

  it('hit: урон не больше прочности, добыча — по клешне на снятую единицу, в квадрате и с дрейфом из таблицы', () => {
    const { enemies, raft, world, stats } = env();
    world.items.length = 0;
    const e = enemies.spawnNow({ raft, level: 14, ready: false }, { x: 300, y: 100 })!;
    const hp = e.hp;
    const hits = enemies.hit(300, 100, 0, 1);
    expect(hits).toEqual([{ x: 300, y: 100, dealt: 1 }]);
    expect(e.hp).toBe(hp - 1);
    const big = enemies.hit(300, 100, 0, 100);
    expect(big[0]!.dealt).toBe(hp - 1);
    const loot = world.items;
    expect(loot.length).toBe(hp);
    expect(stats.lootDropped).toBe(hp);
    const s = DATA.num('loot_scatter_px');
    for (const it of loot) {
      expect(it.kind).toBe(CRAB.loot_item);
      expect(it.role).toBe('loot');
      expect(Math.abs(it.x - 300)).toBeLessThanOrEqual(s);
      expect(Math.abs(it.y - 100)).toBeLessThanOrEqual(s);
      expect(it.speed).toBeGreaterThanOrEqual(DATA.num('loot_drift_min'));
      expect(it.speed).toBeLessThan(DATA.num('loot_drift_max'));
    }
  });

  it('прочность 0 — краб удалён, enemiesKilled + 1; промах — без урона', () => {
    const { enemies, raft, stats } = env();
    const e = enemies.spawnNow({ raft, level: 1, ready: false }, { x: 300, y: 0 })!;
    expect(enemies.hit(0, 0, 10, 99)).toEqual([]);
    enemies.hit(300, 0, 0, e.hp);
    expect(enemies.list).not.toContain(e);
    expect(stats.enemiesKilled).toBe(1);
  });

  it('добыча не сдвигает поток предметов', () => {
    const CFG = { ...HALF, speedMult: 1, locationId: 'lagoon', seed: 4 };
    const a = new Game(DATA, CFG);
    const b = new Game(DATA, CFG);
    a.debugSpawnEnemy(100, 0);
    a.setWeapon('spear');
    a.throwTo(100, 0);
    for (let i = 0; i < 300; i++) {
      a.step(STEP_MS);
      b.step(STEP_MS);
    }
    expect(a.stats.lootDropped).toBeGreaterThan(0);
    const flow = (g: Game) => g.world.items.filter((it) => it.role !== 'loot').map(({ kind, x, y, speed, phase }) => ({ kind, x, y, speed, phase }));
    expect(flow(a)).toEqual(flow(b));
    expect(a.world.spawned).toBe(b.world.spawned);
  });

  it('повадка не walk_underwater — враги не приходят, конструктор не падает', () => {
    const g = new Game(DATA, { ...HALF, speedMult: 1, locationId: 'north', seed: 1 });
    const { enemies, raft } = env(3, 'north');
    advance(enemies, raft, 2 * INTERVAL_MS);
    expect(enemies.spawned).toBe(0);
    expect(enemies.spawnNow({ raft, level: 1, ready: true }, null)).toBeNull();
    g.debugSpawnEnemy();
    expect(g.enemies.list).toEqual([]);
    expect(g.spearOwned).toBe(false);
  });
});
