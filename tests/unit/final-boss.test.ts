import { describe, expect, it } from 'vitest';
import { STEP_MS } from '../../src/core/clock';
import { FinalBoss, type FinalBossSnapshot } from '../../src/core/final-boss';
import { Game, type GameConfig, type GameSnapshot } from '../../src/core/game';
import { Raft } from '../../src/core/raft';
import { Rng } from '../../src/core/rng';
import { Stats } from '../../src/core/stats';
import { World } from '../../src/core/world';
import { DATA } from '../../src/data';
import { HumanBot } from '../../src/sim/bot';

const CFG: GameConfig = { halfW: 640, halfH: 360, speedMult: 1, locationId: 'lagoon', seed: 1 };
const LAGOON = DATA.location('lagoon');
const GIANT = DATA.bosses.find((b) => b.location === 'lagoon' && b.final_hp !== '')!;
const SCHOONER = DATA.bosses.find((b) => b.id === LAGOON.bossId)!;
const HP = Number(GIANT.final_hp) * LAGOON.enemyHpMult;
const DAMAGE = Number(GIANT.final_damage) * LAGOON.enemyDmgMult;
const RADIUS = DATA.num('boss_crab_radius_px');
const SPEED = DATA.num('boss_crab_speed');
const WAIT_MS = DATA.num('boss_crab_wait_ms');
const DIVE_MS = DATA.num('boss_crab_dive_ms');
const GAP = DATA.num('boss_final_distance_px');
const LEVEL = DATA.num('level_to_clear');
const CELL = DATA.num('cell_px');
const CELL_HP = DATA.num('cell_hp');
/** Шагов на время ms. */
const steps = (ms: number): number => Math.round(ms / STEP_MS);
/** Предел шагов циклов: синхронный бесконечный цикл Vitest не прерывает. */
const MAX_STEPS = 50_000;
const viaJson = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
type Spot = { gx: number; gy: number };

interface Setup { boss: FinalBoss; raft: Raft; stats: Stats }

function setup(cells: Spot[] = [{ gx: 0, gy: 0 }], halfW = 640, halfH = 360, locationId = 'lagoon'): Setup {
  const world = new World({ halfW, halfH, speedMult: 1, locationId, level: 1 }, DATA, new Rng(1));
  const stats = new Stats();
  const raft = new Raft(DATA);
  raft.restore({ cells });
  return { boss: new FinalBoss(DATA, locationId, world, stats), raft, stats };
}

/** Шагать бой, пока cond; ответ — сколько шагов. */
function stepUntil(s: Setup, cond: () => boolean): number {
  for (let i = 1; i <= MAX_STEPS; i++) {
    s.boss.step(STEP_MS, s.raft);
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

/** Бой на level_to_clear: краб на последней единице прочности, копьё моряка в его середину — победа. */
function win(g: Game): void {
  g.setLevel(LEVEL);
  g.step(STEP_MS);
  expect(g.finalBoss.phase).toBe('crawl');
  g.finalBoss.debugHp(1);
  g.spearOwned = true;
  expect(g.setWeapon('spear')).toBe(true);
  expect(g.throwTo(g.finalBoss.x, g.finalBoss.y)).toBe(true);
  gameUntil(g, () => g.cleared);
}

describe('FinalBoss: данные и всплытие', () => {
  it('краб-великан — финальный босс Лагуны; у шхуны final_hp пусто; у Рифа боя нет', () => {
    const { boss, raft } = setup();
    expect(boss.id).toBe(GIANT.id);
    expect(boss.nameKey).toBe(GIANT.name_key);
    expect(boss.maxHp).toBe(HP);
    expect(boss.radius).toBe(RADIUS);
    expect(boss.level).toBe(LEVEL);
    let sum = 0;
    for (let l = 2; l <= LEVEL; l++) sum += DATA.levelStep(l, LAGOON.xpMult);
    expect(boss.chestXp).toBeCloseTo(DATA.num('boss_big_chest_share') * sum, 9);
    expect(SCHOONER.final_hp).toBe('');
    expect(boss.phase).toBe('none');
    boss.start(raft);
    expect(boss.phase).toBe('crawl');
    expect(boss.hp).toBe(HP);
    const reef = setup([{ gx: 0, gy: 0 }], 640, 360, 'reef');
    expect(reef.boss.id).toBeNull();
    reef.boss.start(reef.raft);
    expect(reef.boss.phase).toBe('none');
  });

  it('одна клетка: на ПК — слева, на телефоне — снизу; от центра клетки до края краба — gap', () => {
    const pc = setup();
    pc.boss.start(pc.raft);
    expect(pc.boss.side).toBe('left');
    expect([pc.boss.x, pc.boss.y]).toEqual([-(GAP + RADIUS), 0]);
    const phone = setup([{ gx: 0, gy: 0 }], 360, 640);
    phone.boss.start(phone.raft);
    expect(phone.boss.side).toBe('bottom');
    expect([phone.boss.x, phone.boss.y]).toEqual([0, GAP + RADIUS]);
  });

  it('плот выдаётся влево — краб справа, напротив центральной', () => {
    const s = setup([{ gx: 0, gy: 0 }, { gx: -1, gy: 0 }, { gx: -2, gy: 0 }]);
    s.boss.start(s.raft);
    expect(s.boss.side).toBe('right');
    expect([s.boss.targetGx, s.boss.targetGy]).toEqual([0, 0]);
    expect([s.boss.x, s.boss.y]).toEqual([GAP + RADIUS, 0]);
  });

  it('из крайних клеток (−1, −1), (−1, 1), (−1, 2) цель — (−1, −1): ближе к середине, затем меньшая координата', () => {
    const cells = [[0, 0], [0, -1], [-1, -1], [0, 1], [-1, 1], [0, 2], [-1, 2]].map(([gx, gy]) => ({ gx: gx!, gy: gy! }));
    const s = setup(cells);
    s.boss.start(s.raft, 'left');
    expect([s.boss.targetGx, s.boss.targetGy]).toEqual([-1, -1]);
    expect([s.boss.x, s.boss.y]).toEqual([-(CELL + GAP + RADIUS), -CELL]);
  });

  it('поле 250 × 250: краб целиком в поле — середина на 250 − radius', () => {
    const s = setup([{ gx: 0, gy: 0 }], 250, 250);
    s.boss.start(s.raft);
    expect(s.boss.side).toBe('bottom');
    expect(s.boss.y).toBe(250 - RADIUS);
  });

  it('разбитая крайняя клетка — не цель: краб напротив следующей целой', () => {
    const whole = setup([{ gx: 0, gy: 0 }, { gx: -1, gy: 0 }]);
    whole.boss.start(whole.raft, 'left');
    expect(whole.boss.x).toBe(-(CELL + GAP + RADIUS));
    const broken = setup([{ gx: 0, gy: 0 }, { gx: -1, gy: 0 }]);
    broken.raft.cell(-1, 0)!.hp = 0;
    broken.boss.start(broken.raft, 'left');
    expect([broken.boss.targetGx, broken.boss.targetGy]).toEqual([0, 0]);
    expect(broken.boss.x).toBe(-(GAP + RADIUS));
  });
});

describe('FinalBoss: ход боя', () => {
  it('ползёт, бьёт клетку, стоит, ныряет и всплывает напротив; по центральной удар ничего не снимает', () => {
    const s = setup([{ gx: 0, gy: 0 }, { gx: -1, gy: 0 }]);
    const b = s.boss;
    b.start(s.raft, 'left');
    expect([b.targetGx, b.targetGy]).toEqual([-1, 0]);
    let total = 0;
    const crawl = stepUntil(s, () => b.phase !== 'crawl');
    total += crawl;
    expect(Math.abs(crawl - ((GAP - CELL / 2) / SPEED) * 1000 / STEP_MS)).toBeLessThanOrEqual(1);
    expect(b.phase).toBe('wait');
    expect(s.raft.cell(-1, 0)!.hp).toBe(CELL_HP - DAMAGE);
    expect(s.stats.finalStrikes).toBe(1);
    expect(s.stats.finalCellDamage).toBe(DAMAGE);
    const wait = stepUntil(s, () => b.phase !== 'wait');
    total += wait;
    expect(Math.abs(wait - steps(WAIT_MS))).toBeLessThanOrEqual(1);
    expect(b.phase).toBe('dive');
    expect(b.present).toBe(false);
    expect(b.hit(b.x, b.y, 100, 5)).toEqual([]);
    const dive = stepUntil(s, () => b.phase !== 'dive');
    total += dive;
    expect(Math.abs(dive - steps(DIVE_MS))).toBeLessThanOrEqual(1);
    expect(b.phase).toBe('crawl');
    expect(b.side).toBe('right');
    expect([b.targetGx, b.targetGy]).toEqual([0, 0]);
    expect(b.x).toBe(GAP + RADIUS);
    total += stepUntil(s, () => b.phase !== 'crawl');
    expect(s.stats.finalStrikes).toBe(2);
    expect(s.stats.finalCellDamage).toBe(DAMAGE);
    expect(s.raft.cell(0, 0)!.hp).toBe(CELL_HP);
    expect(s.stats.finalFightMs).toBeCloseTo(total * STEP_MS, 6);
  });

  it('900 шагов по одному и 30 шагов по 30 дают то же (правило 1)', () => {
    const cells = [{ gx: 0, gy: 0 }, { gx: -1, gy: 0 }];
    const a = setup(cells);
    const b = setup(cells);
    a.boss.start(a.raft, 'left');
    b.boss.start(b.raft, 'left');
    for (let i = 0; i < 900; i++) a.boss.step(STEP_MS, a.raft);
    for (let i = 0; i < 30; i++) b.boss.step(30 * STEP_MS, b.raft);
    const sa: FinalBossSnapshot = a.boss.snapshot();
    const sb: FinalBossSnapshot = b.boss.snapshot();
    expect(sb.phase).toBe(sa.phase);
    expect(sb.side).toBe(sa.side);
    expect([sb.targetGx, sb.targetGy]).toEqual([sa.targetGx, sa.targetGy]);
    for (const k of ['x', 'y', 'leftMs', 'hp'] as const) expect(sb[k], k).toBeCloseTo(sa[k], 6);
    expect(b.stats.finalStrikes).toBe(a.stats.finalStrikes);
    expect(a.stats.finalStrikes).toBeGreaterThanOrEqual(2);
    expect(b.stats.finalFightMs).toBeCloseTo(a.stats.finalFightMs, 6);
  });

  it('удар: мимо reach + radius — ничего, внутри — min(урон, прочность); добит — побеждён, дальше ни удара, ни нового боя', () => {
    const s = setup();
    const b = s.boss;
    b.start(s.raft);
    expect(b.hit(b.x + 20 + RADIUS, b.y, 20, 5)).toEqual([]);
    expect(b.hit(b.x + 19 + RADIUS, b.y, 20, 5)).toEqual([{ x: b.x, y: b.y, dealt: 5 }]);
    expect(b.hp).toBe(HP - 5);
    expect(s.stats.finalDamage).toBe(5);
    b.debugHp(2);
    expect(b.hit(b.x, b.y, 20, 5)).toEqual([{ x: b.x, y: b.y, dealt: 2 }]);
    expect(b.defeated).toBe(true);
    expect(b.hp).toBe(0);
    expect(b.fighting).toBe(false);
    expect(s.stats.finalDamage).toBe(7);
    expect(b.hit(b.x, b.y, 20, 5)).toEqual([]);
    b.start(s.raft);
    expect(b.phase).toBe('defeated');
    const ms = s.stats.finalFightMs;
    b.step(STEP_MS, s.raft);
    expect(s.stats.finalFightMs).toBe(ms);
  });
});

describe('Финальный бой в игре', () => {
  it('на 39-м уровне боя нет, на 40-м — краб ползёт', () => {
    const g = new Game(DATA, CFG);
    g.setLevel(LEVEL - 1);
    for (let i = 0; i < 60; i++) g.step(STEP_MS);
    expect(g.finalBoss.phase).toBe('none');
    g.setLevel(LEVEL);
    g.step(STEP_MS);
    expect(g.finalBoss.phase).toBe('crawl');
  });

  it('шторм — бой ждёт его и первого визита шхуны после него', () => {
    const g = new Game(DATA, CFG);
    g.setLevel(LEVEL);
    g.debugEvent();
    g.step(STEP_MS);
    expect(g.finalBoss.phase).toBe('none');
    gameUntil(g, () => !g.events.active);
    expect(g.boss.visiting).toBe(true);
    expect(g.finalBoss.phase).toBe('none');
    gameUntil(g, () => !g.boss.visiting);
    expect(g.finalBoss.phase).toBe('none');
    g.step(STEP_MS);
    expect(g.finalBoss.phase).toBe('crawl');
  });

  it('визит шхуны — бой ждёт его конца', () => {
    const g = new Game(DATA, CFG);
    g.setLevel(LEVEL);
    g.debugBossVisit('bottom');
    for (let i = 0; i < 60; i++) g.step(STEP_MS);
    expect(g.finalBoss.phase).toBe('none');
    gameUntil(g, () => !g.boss.visiting);
    g.step(STEP_MS);
    expect(g.finalBoss.phase).toBe('crawl');
  });

  it('окно 40-го уровня — сначала оно, бой после', () => {
    const g = new Game(DATA, CFG);
    g.setLevel(LEVEL - 1);
    g.debugLevelUp();
    expect(g.window?.level).toBe(LEVEL);
    g.step(STEP_MS);
    expect(g.finalBoss.phase).toBe('none');
    expect(g.takeCard(g.window!.cards.findIndex((c) => c.available))).toBe(true);
    if (g.build) {
      const c = g.buildSpots()[0]!;
      expect(g.placeCell(c.gx, c.gy)).toBe(true);
    }
    g.step(STEP_MS);
    expect(g.finalBoss.phase).toBe('crawl');
  });

  it('в бой новые крабы не приходят, спокойное время шторма и визитов стоит, предложений буста нет', () => {
    const make = (level: number): Game => {
      const g = new Game(DATA, CFG);
      g.raft.add(1, 0);
      g.mediumCaught = true;
      g.boss.visits = 1;
      g.boss.nextMs = 1e9;
      g.boostOffer.nextMs = 0;
      g.setLevel(level);
      for (let i = 0; i < steps(20_000); i++) g.step(STEP_MS);
      return g;
    };
    const fight = make(LEVEL);
    expect(fight.finalBoss.fighting).toBe(true);
    expect(fight.enemies.spawned).toBe(0);
    expect(fight.events.calmMs).toBe(0);
    expect(fight.boss.calmMs).toBe(0);
    expect(fight.boostOffer.shown).toBe(0);
    const before = make(LEVEL - 1);
    expect(before.enemies.spawned).toBeGreaterThan(0);
    expect(before.events.calmMs).toBeGreaterThan(0);
    expect(before.boss.calmMs).toBeGreaterThan(0);
    expect(before.boostOffer.shown).toBeGreaterThan(0);
  });

  it('на 40-м уровне опыт не поднимает уровень: полоса полная, debugLevelUp окна не даёт', () => {
    const g = new Game(DATA, CFG);
    g.setLevel(LEVEL);
    g.progression.addXp(1e6);
    expect(g.progression.level).toBe(LEVEL);
    expect(g.progression.xp).toBe(g.progression.xpToNext());
    g.debugLevelUp();
    expect(g.progression.level).toBe(LEVEL);
    expect(g.window).toBeNull();
    expect(g.pending).toEqual([]);
  });

  it('победа копьём моряка: большой сундук, окно «Локация пройдена»; «Играть дальше» — уровни дальше, боя больше нет', () => {
    const g = new Game(DATA, CFG);
    g.raft.add(1, 0);
    g.debugDamageCell(1, 0, 10);
    const xp = g.stats.xpGained;
    win(g);
    const fb = g.finalBoss;
    expect(fb.defeated).toBe(true);
    expect(g.stats.bigChestXp).toBe(fb.chestXp);
    expect(g.stats.xpGained).toBeCloseTo(xp + fb.chestXp, 6);
    expect(g.cleared).toBe(true);
    expect(g.paused).toBe(true);
    expect(g.progression.level).toBe(LEVEL);
    expect(g.progression.maxLevel).toBe(LEVEL);
    g.setMenu(true);
    expect(g.menu).toBe(false);
    expect(g.setRepair(true)).toBe(false);
    expect(g.playOn()).toBe(true);
    expect(g.playOn()).toBe(false);
    expect(g.cleared).toBe(false);
    expect(g.progression.maxLevel).toBe(Infinity);
    g.debugLevelUp();
    expect(g.window?.level).toBe(LEVEL + 1);
    expect(g.takeCard(g.window!.cards.findIndex((c) => c.available))).toBe(true);
    if (g.build) g.placeCell(g.buildSpots()[0]!.gx, g.buildSpots()[0]!.gy);
    for (let i = 0; i < 120; i++) g.step(STEP_MS);
    expect(fb.phase).toBe('defeated');
  });
});

describe('Финальный бой: снимок и бот', () => {
  it('снимок посреди боя — продолжение как без перерыва', () => {
    const g = new Game(DATA, CFG);
    g.raft.add(-1, 0);
    g.setLevel(LEVEL);
    for (let i = 0; i < 200; i++) g.step(STEP_MS);
    expect(g.finalBoss.fighting).toBe(true);
    const r = Game.restore(DATA, CFG, viaJson(g.snapshot()));
    expect(r.finalBoss.snapshot()).toEqual(g.finalBoss.snapshot());
    for (let i = 0; i < 600; i++) {
      g.step(STEP_MS);
      r.step(STEP_MS);
    }
    expect(viaJson(r.snapshot())).toEqual(viaJson(g.snapshot()));
    expect(g.stats.finalStrikes).toBeGreaterThan(0);
  });

  it('после победы окно и предел уровня на месте, после «Играть дальше» — без предела; запись до M1-15 на 43-м — бой в первом шаге', () => {
    const g = new Game(DATA, CFG);
    win(g);
    const r = Game.restore(DATA, CFG, viaJson(g.snapshot()));
    expect(r.cleared).toBe(true);
    expect(r.paused).toBe(true);
    expect(r.finalBoss.defeated).toBe(true);
    expect(r.progression.maxLevel).toBe(LEVEL);
    expect(r.playOn()).toBe(true);
    expect(r.progression.maxLevel).toBe(Infinity);
    const p = Game.restore(DATA, CFG, viaJson(r.snapshot()));
    expect(p.cleared).toBe(false);
    expect(p.progression.maxLevel).toBe(Infinity);

    const fresh = new Game(DATA, CFG);
    fresh.setLevel(LEVEL + 3);
    const old = viaJson(fresh.snapshot()) as GameSnapshot;
    delete old.finalBoss;
    delete old.cleared;
    const o = Game.restore(DATA, CFG, old);
    expect(o.cleared).toBe(false);
    expect(o.finalBoss.phase).toBe('none');
    o.step(STEP_MS);
    expect(o.finalBoss.phase).toBe('crawl');
  });

  it('бот на плоту из 5 клеток в ряд, с копьём, на 40-м уровне побеждает', () => {
    const g = new Game(DATA, CFG);
    g.raft.restore({ cells: [-2, -1, 0, 1, 2].map((gx) => ({ gx, gy: 0 })) });
    g.spearOwned = true;
    g.setLevel(LEVEL);
    const bot = new HumanBot(g, DATA, new Rng(4));
    for (let i = 0; !g.finalBoss.defeated; i++) {
      if (i >= MAX_STEPS) throw new Error('бот: предел шагов');
      if (g.paused) bot.pause();
      else {
        bot.update();
        g.step(STEP_MS);
      }
    }
    expect(g.stats.finalDamage).toBe(g.finalBoss.maxHp);
    expect(g.stats.steps).toBeGreaterThan(0);
    expect(g.stats.spearHits).toBeGreaterThan(0);
    expect(g.cleared).toBe(true);
  });
});
