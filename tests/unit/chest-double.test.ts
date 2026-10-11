import { describe, expect, it } from 'vitest';
import { STEP_MS } from '../../src/core/clock';
import { Game, type GameConfig, type GameSnapshot } from '../../src/core/game';
import { DATA } from '../../src/data';
import { gate, toMarkdown } from '../../src/sim/report';
import { DEFAULT_SIM, runSim, type SimResult } from '../../src/sim/run';

const CFG: GameConfig = { halfW: 640, halfH: 360, speedMult: 1, locationId: 'lagoon', seed: 1 };
const LEVEL = DATA.num('level_to_clear');
/** Предел шагов циклов: синхронный бесконечный цикл Vitest не прерывает. */
const MAX_STEPS = 50_000;
const viaJson = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** Бой на level_to_clear: краб на последней единице прочности, копьё моряка в его середину — победа (как в final-boss.test.ts). */
function win(g: Game): void {
  g.setLevel(LEVEL);
  g.step(STEP_MS);
  expect(g.finalBoss.phase).toBe('crawl');
  g.finalBoss.debugHp(1);
  g.spearOwned = true;
  expect(g.setWeapon('spear')).toBe(true);
  expect(g.throwTo(g.finalBoss.x, g.finalBoss.y)).toBe(true);
  for (let i = 0; i < MAX_STEPS && !g.cleared; i++) g.step(STEP_MS);
  expect(g.cleared).toBe(true);
}

describe('«Сундук ×2» за рекламу', () => {
  it('только в окне «Локация пройдена» и один раз: опыт сундука ещё раз, уровень и окно на месте', () => {
    const g = new Game(DATA, CFG);
    expect(g.doubleChest()).toBe(false);
    win(g);
    const chest = g.finalBoss.chestXp;
    const xp = g.stats.xpGained;
    expect(g.doubleChest()).toBe(true);
    expect(g.chestDoubled).toBe(true);
    expect(g.stats.bigChestXp).toBe(2 * chest);
    expect(g.stats.xpGained).toBeCloseTo(xp + chest, 6);
    expect(g.progression.level).toBe(LEVEL);
    expect(g.progression.xp).toBe(g.progression.xpToNext());
    expect(g.cleared).toBe(true);
    expect(g.doubleChest()).toBe(false);
    expect(g.stats.bigChestXp).toBe(2 * chest);
  });

  it('после «Играть дальше» и без рекламы за награду — нельзя', () => {
    const g = new Game(DATA, CFG);
    win(g);
    expect(g.playOn()).toBe(true);
    expect(g.doubleChest()).toBe(false);
    expect(g.chestDoubled).toBe(false);

    const n = new Game(DATA, { ...CFG, rewarded: false });
    win(n);
    expect(n.doubleChest()).toBe(false);
    expect(n.chestDoubled).toBe(false);
    expect(n.stats.bigChestXp).toBe(n.finalBoss.chestXp);
  });

  it('снимок помнит удвоение; запись до M1-17 — сундук не удвоен', () => {
    const g = new Game(DATA, CFG);
    win(g);
    const before = viaJson(g.snapshot());
    expect(g.doubleChest()).toBe(true);
    const r = Game.restore(DATA, CFG, viaJson(g.snapshot()));
    expect(r.cleared).toBe(true);
    expect(r.chestDoubled).toBe(true);
    expect(r.doubleChest()).toBe(false);

    const old = before as GameSnapshot;
    delete old.chestDoubled;
    const o = Game.restore(DATA, CFG, old);
    expect(o.chestDoubled).toBe(false);
    expect(o.doubleChest()).toBe(true);
  });

  it('отчёт прогона: «Ждал боя» — от уровня боя, а не от последнего отмеченного уровня', () => {
    const run = runSim(DATA, 1, { ...DEFAULT_SIM, untilLevel: 2, maxGameMs: 60_000 });
    const r: SimResult = {
      ...run,
      fightLevel: 30,
      fightLevelGameMs: 60_000,
      fightStartGameMs: 63_000,
      fightMs: 45_000,
      levelGameMs: { ...run.levelGameMs, 40: null },
    };
    const md = toMarkdown(gate([run.levelGameMs[2] ?? null]), [r]);
    expect(md).toContain('От 30-го уровня до начала боя: медиана 3 с, худшая 3 с.');
    expect(md).toContain('| 1 | 3 с | 45 с |');
  });
});
