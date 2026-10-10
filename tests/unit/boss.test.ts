import { describe, expect, it } from 'vitest';
import { BossVisits, type BossSide } from '../../src/core/boss';
import { STEP_MS, TIME_EPS } from '../../src/core/clock';
import { Game, type GameConfig, type GameSnapshot } from '../../src/core/game';
import { Raft } from '../../src/core/raft';
import { Rng } from '../../src/core/rng';
import { Stats } from '../../src/core/stats';
import { World } from '../../src/core/world';
import { DATA } from '../../src/data';

const CFG: GameConfig = { halfW: 640, halfH: 360, speedMult: 1, locationId: 'lagoon', seed: 1 };
const LAGOON = DATA.location('lagoon');
const SCHOONER = DATA.bosses.find((b) => b.id === LAGOON.bossId)!;
const SPEED = Number(SCHOONER.visit_speed);
const PERIOD_MS = Number(SCHOONER.visit_attack_period_s) * 1000;
const BALL_DAMAGE = Number(SCHOONER.visit_damage) * LAGOON.enemyDmgMult;
const HALF_LENGTH = DATA.num('boss_ship_length_px') / 2;
const HALF_WIDTH = DATA.num('boss_ship_width_px') / 2;
const GAP = DATA.num('boss_visit_gap_px');
const EDGE = DATA.num('boss_ship_edge_px');
const BALL_SPEED = DATA.num('boss_ball_speed');
const PER_CHEST = DATA.num('boss_chest_per_damage') * LAGOON.enemyHpMult;
const MAX_CHESTS = DATA.num('boss_visit_max_chests');
const CELL = DATA.num('cell_px');
const CELL_HP = DATA.num('cell_hp');
const SCATTER = DATA.num('loot_scatter_px');
/** Шагов на время ms. */
const steps = (ms: number): number => Math.round(ms / STEP_MS);
/** Предел шагов циклов: синхронный бесконечный цикл Vitest не прерывает. */
const MAX_STEPS = 50_000;
const viaJson = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
/** Знак течения, 0 — за +1. */
const sign = (v: number): number => (v < 0 ? -1 : 1);

interface Setup { boss: BossVisits; raft: Raft; world: World; stats: Stats }

function setup(locationId = 'lagoon', halfW = 640, halfH = 360): Setup {
  const world = new World({ halfW, halfH, speedMult: 1, locationId, level: 1 }, DATA, new Rng(1));
  const stats = new Stats();
  const boss = new BossVisits(DATA, locationId, new Rng(7), world, stats);
  return { boss, raft: new Raft(DATA), world, stats };
}

/** Шагать визиты, пока cond; ответ — сколько шагов. */
function stepUntil(s: Setup, cond: () => boolean, calm = true, eventsDone = 1): number {
  for (let i = 1; i <= MAX_STEPS; i++) {
    s.boss.step(STEP_MS, calm, eventsDone, s.raft);
    if (cond()) return i;
  }
  throw new Error('stepUntil: предел шагов');
}

function gameUntil(g: Game, cond: () => boolean): number {
  for (let i = 1; i <= MAX_STEPS; i++) {
    g.step(STEP_MS);
    if (cond()) return i;
  }
  throw new Error('gameUntil: предел шагов');
}

describe('BossVisits: данные и линия хода', () => {
  it('шхуна Лагуны — из таблиц; у Рифа (другая повадка) визитов нет', () => {
    const { boss } = setup();
    expect(boss.id).toBe(SCHOONER.id);
    expect(boss.halfLength).toBe(HALF_LENGTH);
    expect(boss.halfWidth).toBe(HALF_WIDTH);
    const reef = setup('reef');
    expect(reef.boss.id).toBeNull();
    reef.boss.start(reef.raft);
    expect(reef.boss.visiting).toBe(false);
    stepUntil(reef, () => true);
    expect(reef.boss.visiting).toBe(false);
  });

  it('линия хода: от центральной клетки — gap + halfWidth; клетка (0, 1) отодвигает нижнюю; плот до (0, 3) — у края поля', () => {
    const expected: Record<BossSide, number> = { bottom: 1, top: -1, left: -1, right: 1 };
    for (const side of Object.keys(expected) as BossSide[]) {
      const s = setup();
      s.boss.start(s.raft, side);
      expect(s.boss.line, side).toBe(expected[side] * (GAP + HALF_WIDTH));
    }
    const s = setup();
    s.raft.add(0, 1);
    s.boss.start(s.raft, 'bottom');
    expect(s.boss.line).toBe(CELL + GAP + HALF_WIDTH);
    const far = setup();
    for (let gy = 1; gy <= 3; gy++) far.raft.add(0, gy);
    far.boss.start(far.raft, 'bottom');
    expect(far.boss.line).toBe(360 - EDGE);
  });

  it('копьё достаёт: в обеих раскладках у всех сторон от крайней клетки до корпуса — gap, не больше дальности броска', () => {
    const extremeCell: Record<BossSide, { gx: number; gy: number }> = {
      bottom: { gx: 0, gy: 1 }, top: { gx: 0, gy: 0 }, left: { gx: 0, gy: 0 }, right: { gx: 1, gy: 0 },
    };
    for (const [halfW, halfH] of [[640, 360], [360, 640]] as const) {
      for (const side of Object.keys(extremeCell) as BossSide[]) {
        const s = setup('lagoon', halfW, halfH);
        s.raft.add(1, 0);
        s.raft.add(0, 1);
        s.boss.start(s.raft, side);
        const c = s.raft.cellCenter(extremeCell[side]);
        // Шхуна напротив клетки.
        s.boss.pos = s.boss.horizontal ? c.x : c.y;
        const p = s.boss.nearestPoint(c.x, c.y);
        const d = Math.hypot(p.x - c.x, p.y - c.y);
        expect(d, `${halfW}×${halfH} ${side}`).toBeCloseTo(GAP, 9);
        expect(d).toBeLessThanOrEqual(DATA.sailorTier(LAGOON.order).throwRange);
      }
    }
  });

  it('40 визитов подряд: встречаются все четыре стороны, ход — по течению Лагуны', () => {
    const s = setup();
    const seen = new Set<BossSide>();
    for (let i = 0; i < 40; i++) {
      s.boss.start(s.raft);
      const b = s.boss;
      seen.add(b.side);
      expect(b.dir, b.side).toBe(b.horizontal ? sign(LAGOON.currentDx) : sign(LAGOON.currentDy));
      stepUntil(s, () => !s.boss.visiting, false);
    }
    expect([...seen].sort()).toEqual(['bottom', 'left', 'right', 'top']);
  });
});

describe('BossVisits: таймеры', () => {
  it('первый визит — сразу после первого события, не раньше и не в событие; шхуна за краем, откуда идёт', () => {
    const s = setup();
    for (let i = 0; i < steps(300_000); i++) s.boss.step(STEP_MS, true, 0, s.raft);
    expect(s.boss.visiting).toBe(false);
    s.boss.step(STEP_MS, false, 1, s.raft);
    expect(s.boss.visiting).toBe(false);
    s.boss.step(STEP_MS, true, 1, s.raft);
    expect(s.boss.visiting).toBe(true);
    const b = s.boss;
    const along = b.horizontal ? 640 : 360;
    expect(b.dir * b.pos + b.halfLength).toBeCloseTo(-along, 9);
  });

  it('в Game первый визит — в тот же шаг, когда кончился первый шторм', () => {
    const g = new Game(DATA, CFG);
    gameUntil(g, () => g.events.active);
    expect(g.boss.visiting).toBe(false);
    gameUntil(g, () => !g.events.active);
    expect(g.boss.visiting).toBe(true);
    expect(g.events.count).toBe(1);
  });

  it('визит вдоль нижней и левой сторон длится по скорости; потом — пауза 100–120 с спокойного времени', () => {
    const move = (SPEED * STEP_MS) / 1000;
    for (const [side, along] of [['bottom', 640], ['left', 360]] as const) {
      const s = setup();
      s.boss.start(s.raft, side);
      const n = stepUntil(s, () => !s.boss.visiting, false);
      expect(n, side).toBe(Math.floor((2 * along + 2 * HALF_LENGTH) / move) + 1);
      expect(s.boss.visits).toBe(1);
      expect(s.boss.nextMs).toBeGreaterThanOrEqual(DATA.num('boss_visit_period_min_s') * 1000);
      expect(s.boss.nextMs).toBeLessThanOrEqual(DATA.num('boss_visit_period_max_s') * 1000);
      for (let i = 0; i < steps(200_000); i++) s.boss.step(STEP_MS, false, 1, s.raft);
      expect(s.boss.calmMs).toBe(0);
      expect(s.boss.visiting).toBe(false);
      const m = stepUntil(s, () => s.boss.visiting);
      expect((m - 1) * STEP_MS).toBeLessThan(s.boss.nextMs - TIME_EPS);
      expect(m * STEP_MS + TIME_EPS).toBeGreaterThanOrEqual(s.boss.nextMs);
    }
  });
});

describe('BossVisits: ядра', () => {
  it('выстрел — шагом на visit_attack_period_s; ядро в дальнюю клетку с постройкой, долетает по скорости и снимает visit_damage', () => {
    const s = setup();
    s.raft.add(1, 0);
    s.raft.add(-1, 0);
    s.raft.build(1, 0, 'net_tower');
    s.raft.build(-1, 0, 'net_tower');
    s.boss.start(s.raft, 'bottom');
    const n = stepUntil(s, () => s.boss.balls.length > 0);
    expect(n).toBe(steps(PERIOD_MS));
    expect(s.stats.bossShots).toBe(1);
    const ball = s.boss.balls[0]!;
    const far = Math.hypot(-CELL - s.boss.x, -s.boss.y) > Math.hypot(CELL - s.boss.x, -s.boss.y) ? -1 : 1;
    expect(ball).toMatchObject({ x: s.boss.x, y: s.boss.y, gx: far, gy: 0 });
    const dist = Math.hypot(far * CELL - ball.x, -ball.y);
    const k = stepUntil(s, () => s.boss.balls.length === 0);
    expect(k).toBe(Math.ceil(dist / ((BALL_SPEED * STEP_MS) / 1000)));
    expect(s.raft.cell(far, 0)!.hp).toBe(CELL_HP - BALL_DAMAGE);
    expect(s.raft.cell(-far, 0)!.hp).toBe(CELL_HP);
    expect(s.stats.bossCellDamage).toBe(BALL_DAMAGE);
  });

  it('построек нет — в дальнюю целую клетку, кроме центральной; цела только центральная — выстрела нет', () => {
    const s = setup();
    s.raft.add(1, 0);
    s.raft.add(-1, 0);
    s.boss.start(s.raft, 'bottom');
    // Шхуна справа: дальняя — (−1, 0), но она разбита.
    s.boss.pos = 3 * CELL;
    s.raft.damage(-1, 0, CELL_HP);
    s.boss.shotMs = PERIOD_MS - STEP_MS;
    s.boss.step(STEP_MS, true, 1, s.raft);
    expect(s.boss.balls.map((b) => [b.gx, b.gy])).toEqual([[1, 0]]);
    s.raft.damage(1, 0, CELL_HP);
    s.boss.shotMs = PERIOD_MS - STEP_MS;
    s.boss.step(STEP_MS, true, 1, s.raft);
    expect(s.stats.bossShots).toBe(1);
  });
});

describe('BossVisits: удар и сундуки', () => {
  it('удар ближе reach к корпусу — весь урон; сундук на каждые boss_chest_per_damage, не больше boss_visit_max_chests', () => {
    const s = setup();
    const chests = (): number => s.world.items.filter((it) => it.kind === SCHOONER.chest_item).length;
    const reach = DATA.num('spear_hit_radius');
    expect(s.boss.hit(0, 0, reach, 1)).toEqual([]);
    s.boss.start(s.raft, 'bottom');
    s.boss.pos = 0;
    const top = s.boss.y - s.boss.hy;
    expect(s.boss.hit(0, top - reach, reach, 1)).toEqual([]);
    expect(s.boss.damage).toBe(0);
    const at = top - reach + 1;
    while (s.boss.damage + 1 < PER_CHEST) {
      expect(s.boss.hit(0, at, reach, 1)).toEqual([{ x: 0, y: top, dealt: 1 }]);
    }
    expect(chests()).toBe(0);
    s.boss.hit(0, at, reach, 1);
    expect(chests()).toBe(1);
    const chest = s.world.items.find((it) => it.kind === SCHOONER.chest_item)!;
    expect(Math.abs(chest.x)).toBeLessThanOrEqual(SCATTER);
    expect(Math.abs(chest.y - top)).toBeLessThanOrEqual(SCATTER);
    s.boss.hit(0, at, reach, PER_CHEST * (MAX_CHESTS + 5));
    expect(chests()).toBe(MAX_CHESTS);
    expect(s.boss.chests).toBe(MAX_CHESTS);
    expect(s.stats.bossChests).toBe(MAX_CHESTS);
    expect(s.stats.bossDamage).toBe(s.boss.damage);
  });
});

describe('Шхуна в игре', () => {
  it('копьё моряка с центральной клетки бьёт шхуну', () => {
    const g = new Game(DATA, CFG);
    g.spearOwned = true;
    g.debugBossVisit('bottom');
    g.boss.pos = 0;
    expect(g.setWeapon('spear')).toBe(true);
    expect(g.throwTo(0, g.boss.y - g.boss.hy)).toBe(true);
    gameUntil(g, () => g.spear.state !== 'flying');
    expect(g.boss.damage).toBe(g.spear.damage);
    expect(g.stats.spearHits).toBe(1);
  });

  it('в визит спокойное время события не копится, в событие — спокойное время визита', () => {
    const g = new Game(DATA, CFG);
    g.debugBossVisit('bottom');
    for (let i = 0; i < 300; i++) g.step(STEP_MS);
    expect(g.boss.visiting).toBe(true);
    expect(g.events.calmMs).toBe(0);
    gameUntil(g, () => !g.boss.visiting);
    expect(g.events.calmMs).toBe(0);
    g.debugEvent();
    for (let i = 0; i < 300; i++) g.step(STEP_MS);
    expect(g.events.active).toBe(true);
    expect(g.boss.calmMs).toBe(0);
  });

  it('в окне выбора визит стоит; debugBossVisit работает и на паузе', () => {
    const g = new Game(DATA, CFG);
    g.debugLevelUp();
    expect(g.window).not.toBeNull();
    g.debugBossVisit('left');
    expect(g.boss.visiting).toBe(true);
    const pos = g.boss.pos;
    for (let i = 0; i < 300; i++) g.step(STEP_MS);
    expect(g.boss.pos).toBe(pos);
  });

  it('снимок в визит с ядром в полёте — после restore то же и дальше так же; запись до M1-08 — визитов не было', () => {
    const g = new Game(DATA, CFG);
    g.raft.add(1, 0);
    g.debugBossVisit('bottom');
    gameUntil(g, () => g.boss.balls.length > 0);
    const s = viaJson(g.snapshot());
    const r = Game.restore(DATA, CFG, viaJson(s));
    expect(r.boss.snapshot()).toEqual(g.boss.snapshot());
    for (let i = 0; i < 200; i++) {
      g.step(STEP_MS);
      r.step(STEP_MS);
    }
    expect(viaJson(r.snapshot())).toEqual(viaJson(g.snapshot()));
    const old = viaJson(s) as GameSnapshot;
    delete old.boss;
    const o = Game.restore(DATA, CFG, old);
    expect(o.boss.visiting).toBe(false);
    expect(o.boss.visits).toBe(0);
    expect(o.boss.balls).toEqual([]);
  });
});
