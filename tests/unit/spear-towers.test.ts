import { describe, expect, it } from 'vitest';
import { BossVisits } from '../../src/core/boss';
import { FixedStep, STEP_MS } from '../../src/core/clock';
import type { DeckContext } from '../../src/core/deck';
import { Enemies } from '../../src/core/enemies';
import { Game, type GameConfig, type GameSnapshot } from '../../src/core/game';
import { Raft } from '../../src/core/raft';
import { Rng } from '../../src/core/rng';
import type { SpearTargets } from '../../src/core/spear';
import { SPEAR_TOWER, SpearTowers, type SpearTower } from '../../src/core/spear-towers';
import { Stats } from '../../src/core/stats';
import { buildingUpgrade } from '../../src/core/upgrades';
import { World } from '../../src/core/world';
import { DATA } from '../../src/data';

const CFG: GameConfig = { halfW: 640, halfH: 360, speedMult: 1, locationId: 'lagoon', seed: 1 };
const TIER1 = DATA.buildings.find((r) => r.id === SPEAR_TOWER && Number(r.tier) === 1)!;
const RADIUS = Number(TIER1.radius);
const PAUSE_MS = Number(TIER1.pause_s) * 1000;
const DAMAGE = Number(TIER1.damage);
const SPEED = DATA.num('tower_spear_speed');
const CELL = DATA.num('cell_px');
const CELL_HP = DATA.num('cell_hp');
const STRONGER = DATA.cards.find((c) => c.id === 'spear_tower_stronger')!;
const VISIT_CARD = DATA.forcedCards.find((f) => f.location === 'lagoon' && f.trigger === 'after:boss_visit')!.card;
const LEVEL_TOWER = DATA.forcedCards.find((f) => f.location === 'lagoon' && f.trigger === 'level:4')!.card;
/** Шагов отдыха после удара. */
const PAUSE_STEPS = Math.round(PAUSE_MS / STEP_MS);
/** Предел шагов циклов: синхронный бесконечный цикл Vitest не прерывает. */
const MAX_STEPS = 20_000;
const viaJson = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

interface Setup { towers: SpearTowers; enemies: Enemies; boss: BossVisits; raft: Raft; stats: Stats; targets: SpearTargets }

/** Пустое море, плот с копейной башней на (gx, gy) и врагами, которые стоят на месте: enemies.step не зовётся. */
function setup(gx = 0, gy = 0): Setup {
  const world = new World({ halfW: 640, halfH: 360, speedMult: 1, locationId: 'lagoon', level: 1 }, DATA, new Rng(1));
  world.items.length = 0;
  const raft = new Raft(DATA);
  if (gx !== 0 || gy !== 0) expect(raft.add(gx, gy)).toBe(true);
  expect(raft.build(gx, gy, SPEAR_TOWER)).toBe(true);
  const stats = new Stats();
  const enemies = new Enemies(DATA, 'lagoon', new Rng(2), world, stats);
  const boss = new BossVisits(DATA, 'lagoon', new Rng(3), world, stats);
  const towers = new SpearTowers(DATA, 'lagoon', stats);
  towers.sync(raft);
  const targets: SpearTargets = { hit: (x, y, reach, damage) => [...enemies.hit(x, y, reach, damage), ...boss.hit(x, y, reach, damage)] };
  return { towers, enemies, boss, raft, stats, targets };
}

function crab(s: Setup, x: number, y: number) {
  const e = s.enemies.spawnNow({ raft: s.raft, level: 1, ready: true }, { x, y });
  expect(e).not.toBeNull();
  return e!;
}

const tower = (s: Setup): SpearTower => s.towers.list[0]!;
const step = (s: Setup): void => s.towers.step(STEP_MS, s.enemies, [s.boss], s.targets, s.raft);

const ctxOf = (freeCells: number, bossVisitSeen: boolean): DeckContext => ({
  freeCells, canAddCell: true, has: () => false, spearOwned: true, bossVisitSeen,
});
const visitShown = (g: Game): boolean => g.deck.snapshot().visitShown === true;

describe('SpearTowers', () => {
  it('ярус 1 Лагуны — из buildings.csv; башня встаёт по постройке с копьём у башни и restMs 0', () => {
    const s = setup(1, 0);
    expect(s.towers.radius).toBe(RADIUS);
    expect(s.towers.pauseMs).toBe(PAUSE_MS);
    expect(s.towers.damage).toBe(DAMAGE);
    expect(s.towers.list).toEqual([{ gx: 1, gy: 0, state: 'ready', x: CELL, y: 0, toX: CELL, toY: 0, restMs: 0 }]);
    s.towers.sync(s.raft);
    expect(s.towers.list).toHaveLength(1);
    expect(s.towers.at(1, 0)).toBe(tower(s));
  });

  it('краб на радиус + 1 — броска нет; из двух крабов цель — ближний, в его центр', () => {
    const s = setup();
    crab(s, RADIUS + 1, 0);
    step(s);
    expect(s.stats.towerSpearThrows).toBe(0);
    expect(tower(s).state).toBe('ready');
    crab(s, 0, -200);
    const near = crab(s, 120, 50);
    step(s);
    expect(s.stats.towerSpearThrows).toBe(1);
    expect(tower(s)).toMatchObject({ state: 'flying', x: 0, y: 0, toX: near.x, toY: near.y });
  });

  it('краб в 130: полёт — ceil(130 / (скорость × шаг)) шагов, удар снимает damage; следующий бросок — через pause_s', () => {
    const s = setup();
    const e = crab(s, 130, 0);
    const hp = e.hp;
    step(s);
    expect(tower(s).state).toBe('flying');
    const flight = Math.ceil(130 / ((SPEED * STEP_MS) / 1000));
    for (let i = 1; i < flight; i++) step(s);
    expect(tower(s).state).toBe('flying');
    expect(e.hp).toBe(hp);
    step(s);
    expect(e.hp).toBe(hp - DAMAGE);
    expect(s.stats.towerSpearHits).toBe(1);
    expect(tower(s)).toMatchObject({ state: 'ready', x: 0, y: 0, restMs: PAUSE_MS });
    for (let i = 1; i < PAUSE_STEPS; i++) step(s);
    expect(s.stats.towerSpearThrows).toBe(1);
    step(s);
    expect(s.stats.towerSpearThrows).toBe(2);
  });

  it('башня на (0, 1), шхуна вдоль нижней стороны: цель — верх корпуса, удар — урон шхуне', () => {
    const s = setup(0, 1);
    s.boss.start(s.raft, 'bottom');
    s.boss.pos = 0;
    step(s);
    expect(tower(s)).toMatchObject({ state: 'flying', toX: 0, toY: s.boss.y - s.boss.hy });
    for (let i = 0; i < MAX_STEPS && tower(s).state === 'flying'; i++) step(s);
    expect(s.boss.damage).toBe(DAMAGE);
    expect(s.stats.towerSpearHits).toBe(1);
  });

  it('клетку разбили, пока копьё летит: оно долетает и бьёт, новых бросков за три отдыха нет', () => {
    const s = setup(1, 0);
    const e = crab(s, CELL + 130, 0);
    const hp = e.hp;
    step(s);
    expect(tower(s).state).toBe('flying');
    s.raft.damage(1, 0, CELL_HP);
    for (let i = 0; i < MAX_STEPS && tower(s).state === 'flying'; i++) step(s);
    expect(e.hp).toBe(hp - DAMAGE);
    for (let i = 0; i < 3 * PAUSE_STEPS; i++) step(s);
    expect(s.stats.towerSpearThrows).toBe(1);
  });

  it('«Копейная башня сильнее» через buildingUpgrade — урон damage + value', () => {
    const g = new Game(DATA, CFG);
    buildingUpgrade(STRONGER, g.towers, g.spearTowers, g.whirlpools)();
    expect(g.spearTowers.damage).toBe(DAMAGE + STRONGER.value!);
  });
});

describe('Копейная башня: колода', () => {
  it('10 сидов: до визита копейной нет; окно 4-го — с сетевой, следующее — с копейной', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const g = new Game(DATA, { ...CFG, seed });
      for (let level = 4; level <= 12; level++) expect(g.deck.offer(level, ctxOf(3, false)).map((c) => c.id)).not.toContain(VISIT_CARD);
      expect(visitShown(g)).toBe(false);
      const w4 = g.deck.offer(4, ctxOf(3, true));
      expect(w4.some((c) => c.id === LEVEL_TOWER && c.available), `сид ${seed}`).toBe(true);
      expect(visitShown(g)).toBe(false);
      const w5 = g.deck.offer(5, ctxOf(3, true));
      expect(w5.some((c) => c.id === VISIT_CARD && c.available), `сид ${seed}`).toBe(true);
      expect(visitShown(g)).toBe(true);
    }
  });

  it('10 сидов: без свободной клетки копейная затемнена и не в счёт; в следующем окне — снова принудительная', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const g = new Game(DATA, { ...CFG, seed });
      const w5 = g.deck.offer(5, ctxOf(0, true));
      expect(w5.find((c) => c.id === VISIT_CARD), `сид ${seed}`).toMatchObject({ available: false });
      expect(visitShown(g)).toBe(false);
      // У 6-го уровня своя принудительная — воронка (M1-13): следующее окно копейной — 7-го.
      const w7 = g.deck.offer(7, ctxOf(1, true));
      expect(w7.find((c) => c.id === VISIT_CARD), `сид ${seed}`).toMatchObject({ available: true });
      expect(visitShown(g)).toBe(true);
    }
  });

  it('в Game: после визита окно 7-го уровня — с копейной (у 6-го своя принудительная — воронка)', () => {
    const g = new Game(DATA, CFG);
    expect(g.raft.add(1, 0)).toBe(true);
    g.setLevel(6);
    g.debugBossVisit();
    for (let i = 0; i < MAX_STEPS && g.boss.visiting; i++) g.step(STEP_MS);
    expect(g.boss.visits).toBe(1);
    expect(g.window).toBeNull();
    g.debugLevelUp();
    expect(g.window?.level).toBe(7);
    expect(g.window!.cards.find((c) => c.id === VISIT_CARD)).toMatchObject({ available: true });
    expect(visitShown(g)).toBe(true);
  });
});

describe('Копейная башня: игра', () => {
  /** Башня в центре, шторм, шхуна снизу и краб в 150; 20 с через FixedStep при fps кадрах в секунду. */
  const run = (fps: number) => {
    const g = new Game(DATA, CFG);
    expect(g.debugBuild(0, 0, SPEAR_TOWER)).toBe(true);
    g.debugEvent();
    g.debugBossVisit('bottom');
    g.debugSpawnEnemy(150, 0);
    const clock = new FixedStep(STEP_MS, 1000);
    const total = Math.round(20_000 / STEP_MS);
    let steps = 0;
    while (steps < total) {
      clock.advance(1000 / fps, (dt) => {
        if (steps < total && !g.paused) g.step(dt);
        steps++;
      });
    }
    return { spearTowers: g.spearTowers.snapshot(), events: g.events.snapshot(), boss: g.boss.snapshot(), stats: g.stats.snapshot() };
  };

  it('30, 60 и 144 кадров в секунду — одна и та же партия', () => {
    const base = run(60);
    expect(base.stats.towerSpearHits).toBeGreaterThan(0);
    expect(run(30)).toEqual(base);
    expect(run(144)).toEqual(base);
  });

  it('снимок с копьём в полёте: после restore то же и дальше идёт так же', () => {
    const g = new Game(DATA, CFG);
    g.debugBuild(0, 0, SPEAR_TOWER);
    g.debugSpawnEnemy(130, 0);
    for (let i = 0; i < MAX_STEPS && g.spearTowers.list[0]!.state !== 'flying'; i++) g.step(STEP_MS);
    const snap = viaJson(g.snapshot());
    const r = Game.restore(DATA, CFG, viaJson(snap));
    expect(viaJson(r.snapshot())).toEqual(snap);
    for (let i = 0; i < 300; i++) {
      g.step(STEP_MS);
      r.step(STEP_MS);
    }
    expect(r.spearTowers.snapshot()).toEqual(g.spearTowers.snapshot());
    expect(r.stats.snapshot()).toEqual(g.stats.snapshot());
  });

  it('запись без spearTowers и visitShown: башня у постройки с копьём у башни, visitShown — false', () => {
    const g = new Game(DATA, CFG);
    g.debugBuild(0, 0, SPEAR_TOWER);
    g.debugSpawnEnemy(130, 0);
    for (let i = 0; i < MAX_STEPS && g.spearTowers.list[0]!.state !== 'flying'; i++) g.step(STEP_MS);
    const s: GameSnapshot = viaJson(g.snapshot());
    s.deck.visitShown = true;
    const old = viaJson(s);
    delete old.spearTowers;
    delete old.deck.visitShown;
    const r = Game.restore(DATA, CFG, old);
    expect(r.spearTowers.list).toEqual([{ gx: 0, gy: 0, state: 'ready', x: 0, y: 0, toX: 0, toY: 0, restMs: 0 }]);
    expect(r.spearTowers.damage).toBe(DAMAGE);
    expect(r.deck.snapshot().visitShown).toBe(false);
    expect(Game.restore(DATA, CFG, s).deck.snapshot().visitShown).toBe(true);
  });
});
