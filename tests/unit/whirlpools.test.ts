import { describe, expect, it } from 'vitest';
import { FixedStep, STEP_MS } from '../../src/core/clock';
import type { DeckContext } from '../../src/core/deck';
import { Game, type GameConfig, type GameSnapshot } from '../../src/core/game';
import { Raft } from '../../src/core/raft';
import { Rng } from '../../src/core/rng';
import { buildingUpgrade } from '../../src/core/upgrades';
import { WHIRLPOOL, Whirlpools } from '../../src/core/whirlpools';
import { World } from '../../src/core/world';
import { DATA } from '../../src/data';

const CFG: GameConfig = { halfW: 640, halfH: 360, speedMult: 1, locationId: 'lagoon', seed: 1 };
const TIER1 = DATA.buildings.find((r) => r.id === WHIRLPOOL && Number(r.tier) === 1)!;
const RADIUS = Number(TIER1.radius);
const PULL_SPEED = Number(TIER1.pull_speed);
const CELL = DATA.num('cell_px');
const CELL_HP = DATA.num('cell_hp');
const WIDER = DATA.cards.find((c) => c.id === 'whirlpool_wider')!;
const LEVEL_CARD = DATA.forcedCards.find((f) => f.location === 'lagoon' && f.trigger === 'level:6')!.card;
/** Предмет для тестов модуля: лёгкий из потока Лагуны. */
const KIND = DATA.items.find((it) => it.role === 'light1')!.id;
/** Предел шагов циклов: синхронный бесконечный цикл Vitest не прерывает. */
const MAX_STEPS = 20_000;
const viaJson = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

interface Setup { pools: Whirlpools; world: World; raft: Raft }

/** Пустое море, плот с воронкой на (gx, gy). */
function setup(gx = 0, gy = 0): Setup {
  const world = new World({ halfW: 640, halfH: 360, speedMult: 1, locationId: 'lagoon', level: 1 }, DATA, new Rng(1));
  world.items.length = 0;
  const raft = new Raft(DATA);
  if (gx !== 0 || gy !== 0) expect(raft.add(gx, gy)).toBe(true);
  expect(raft.build(gx, gy, WHIRLPOOL)).toBe(true);
  const pools = new Whirlpools(DATA, 'lagoon');
  pools.sync(raft);
  return { pools, world, raft };
}

const step = (s: Setup) => s.pools.step(STEP_MS, s.world, s.raft);

describe('Whirlpools', () => {
  it('ярус 1 Лагуны — из buildings.csv; воронка встаёт по постройке плота', () => {
    const s = setup(1, 0);
    expect(s.pools.radius).toBe(RADIUS);
    expect(s.pools.pullSpeed).toBe(PULL_SPEED);
    expect(s.pools.list).toEqual([{ gx: 1, gy: 0 }]);
    s.pools.sync(s.raft);
    expect(s.pools.list).toHaveLength(1);
  });

  it('предмет на радиус / 2 за шаг сдвигается к центру на pull_speed × 0,5; на радиус + 1 — на месте', () => {
    const s = setup();
    const near = s.world.addLoot(KIND, RADIUS / 2, 0, 0, 0);
    const far = s.world.addLoot(KIND, 0, -(RADIUS + 1), 0, 0);
    expect(step(s)).toEqual([]);
    expect(near.x).toBeCloseTo(RADIUS / 2 - (PULL_SPEED * 0.5 * STEP_MS) / 1000, 9);
    expect(near.y).toBe(0);
    expect(far).toMatchObject({ x: 0, y: -(RADIUS + 1) });
  });

  it('10 предметов в радиусе — все пойманы, предела нет; предмет у самой клетки пойман в первом же шаге', () => {
    const s = setup();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * 2 * Math.PI;
      s.world.addLoot(KIND, Math.cos(a) * RADIUS * 0.8, Math.sin(a) * RADIUS * 0.8, 0, 0);
    }
    let caught = 0;
    for (let i = 0; i < MAX_STEPS && s.world.items.length > 0; i++) caught += step(s).length;
    expect(caught).toBe(10);
    expect(s.world.items).toHaveLength(0);

    const it = s.world.addLoot(KIND, CELL / 2 - 1, 0, 0, 0);
    const out = step(s);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ kind: KIND, role: it.role, xp: it.xp, weight: it.weight });
    expect(s.world.items).toHaveLength(0);
  });

  it('воронка на разбитой клетке не тянет', () => {
    const s = setup(1, 0);
    s.raft.damage(1, 0, CELL_HP);
    const it = s.world.addLoot(KIND, CELL + 40, 0, 0, 0);
    for (let i = 0; i < 60; i++) expect(step(s)).toEqual([]);
    expect(it).toMatchObject({ x: CELL + 40, y: 0 });
  });
});

describe('Воронка в игре', () => {
  it('воронка в центре за 600 шагов втягивает предметы, опыт по ролям растёт', () => {
    const g = new Game(DATA, CFG);
    expect(g.debugBuild(0, 0, WHIRLPOOL)).toBe(true);
    for (let i = 0; i < 600; i++) g.step(STEP_MS);
    expect(g.stats.whirlpoolCaught).toBeGreaterThan(0);
    expect(g.stats.throws).toBe(0);
    expect(Object.values(g.stats.xpByRole).reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
  });

  it('«Воронка шире» через buildingUpgrade — радиус × (1 + value)', () => {
    const g = new Game(DATA, CFG);
    buildingUpgrade(WIDER, g.towers, g.spearTowers, g.whirlpools)();
    expect(g.whirlpools.radius).toBeCloseTo(RADIUS * (1 + WIDER.value!), 9);
  });

  it('10 сидов: в окне 5-го уровня воронки нет, в окне 6-го — есть', () => {
    const ctx: DeckContext = { freeCells: 3, canAddCell: true, has: () => false, spearOwned: true, bossVisitSeen: false };
    for (let seed = 1; seed <= 10; seed++) {
      const g = new Game(DATA, { ...CFG, seed });
      expect(g.deck.offer(5, ctx).map((c) => c.id), `сид ${seed}`).not.toContain(LEVEL_CARD);
      expect(g.deck.offer(6, ctx).find((c) => c.id === LEVEL_CARD), `сид ${seed}`).toMatchObject({ available: true });
    }
  });

  /** Воронка в центре; 20 с через FixedStep при fps кадрах в секунду. */
  const run = (fps: number) => {
    const g = new Game(DATA, CFG);
    expect(g.debugBuild(0, 0, WHIRLPOOL)).toBe(true);
    const clock = new FixedStep(STEP_MS, 1000);
    const total = Math.round(20_000 / STEP_MS);
    let steps = 0;
    while (steps < total) {
      clock.advance(1000 / fps, (dt) => {
        if (steps < total && !g.paused) g.step(dt);
        steps++;
      });
    }
    return { world: g.world.snapshot(), whirlpools: g.whirlpools.snapshot(), list: g.whirlpools.list.slice(), stats: g.stats.snapshot() };
  };

  it('30, 60 и 144 кадров в секунду — одна и та же партия', () => {
    const base = run(60);
    expect(base.stats.whirlpoolCaught).toBeGreaterThan(0);
    expect(run(30)).toEqual(base);
    expect(run(144)).toEqual(base);
  });

  it('снимок после «Воронка шире»: после restore радиус и воронки те же и дальше идёт так же', () => {
    const g = new Game(DATA, CFG);
    g.debugBuild(0, 0, WHIRLPOOL);
    buildingUpgrade(WIDER, g.towers, g.spearTowers, g.whirlpools)();
    for (let i = 0; i < 120; i++) g.step(STEP_MS);
    const snap = viaJson(g.snapshot());
    const r = Game.restore(DATA, CFG, viaJson(snap));
    expect(viaJson(r.snapshot())).toEqual(snap);
    expect(r.whirlpools.radius).toBe(g.whirlpools.radius);
    expect(r.whirlpools.list).toEqual(g.whirlpools.list);
    for (let i = 0; i < 600; i++) {
      g.step(STEP_MS);
      r.step(STEP_MS);
    }
    expect(viaJson(r.snapshot())).toEqual(viaJson(g.snapshot()));
  });

  it('запись без whirlpools: радиус яруса, воронка на месте по постройке', () => {
    const g = new Game(DATA, CFG);
    g.debugBuild(0, 0, WHIRLPOOL);
    buildingUpgrade(WIDER, g.towers, g.spearTowers, g.whirlpools)();
    const old: GameSnapshot = viaJson(g.snapshot());
    delete old.whirlpools;
    const r = Game.restore(DATA, CFG, old);
    expect(r.whirlpools.radius).toBe(RADIUS);
    expect(r.whirlpools.list).toEqual([{ gx: 0, gy: 0 }]);
  });
});
