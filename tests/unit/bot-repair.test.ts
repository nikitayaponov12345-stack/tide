import { describe, expect, it } from 'vitest';
import { STEP_MS } from '../../src/core/clock';
import { Game } from '../../src/core/game';
import { Rng } from '../../src/core/rng';
import { DATA } from '../../src/data';
import { HUMAN, HumanBot } from '../../src/sim/bot';
import { GATE_M1, gateM1 } from '../../src/sim/report';
import { runSim, type SimResult } from '../../src/sim/run';

const CFG = { halfW: 640, halfH: 360, speedMult: 1, locationId: 'lagoon', seed: 1 };
const CELL_HP = DATA.num('cell_hp');
const PER_TAP = DATA.num('repair_per_tap');
const MAX_STEPS = 20_000;

/** Пустая вода, клетка (1, 0) с прочностью hp и бот с Rng(seed + 3), как в runSim. */
function damaged(hp: number): { g: Game; bot: HumanBot } {
  const g = new Game(DATA, CFG);
  g.debugLevelUp();
  expect(g.takeCard(g.window!.cards.findIndex((c) => c.id === 'raft'))).toBe(true);
  expect(g.placeCell(1, 0)).toBe(true);
  g.world.items.length = 0;
  g.debugDamageCell(1, 0, CELL_HP - hp);
  expect(g.raft.cell(1, 0)!.hp).toBe(hp);
  return { g, bot: new HumanBot(g, DATA, new Rng(CFG.seed + 3)) };
}

describe('HumanBot: ремонт (M1-21)', () => {
  it('клетка на repairBelowHp: молоток через repairNoticeMs, нажатия до полной прочности', () => {
    const { g, bot } = damaged(HUMAN.repairBelowHp);
    const start = g.stats.gameMs;
    for (let i = 0; !g.repair; i++) {
      if (i >= MAX_STEPS) throw new Error('ремонт не открылся');
      bot.update();
      if (g.repair) break;
      g.step(STEP_MS);
    }
    const at = g.stats.gameMs - start;
    const [lo, hi] = HUMAN.repairNoticeMs;
    expect(at).toBeGreaterThanOrEqual(lo - STEP_MS);
    expect(at).toBeLessThanOrEqual(hi + STEP_MS);

    const { ms, card } = bot.pause();
    const taps = Math.ceil((CELL_HP - HUMAN.repairBelowHp) / PER_TAP);
    expect(g.repair).toBe(false);
    expect(g.raft.cells.every((c) => c.hp === CELL_HP)).toBe(true);
    expect(g.stats.repairTaps).toBe(taps);
    expect(card).toBeNull();
    expect(ms).toBeGreaterThanOrEqual(taps * HUMAN.repairTapMs[0]);
    expect(ms).toBeLessThanOrEqual(taps * HUMAN.repairTapMs[1]);
  });

  it('чуть выше половины — ремонта нет', () => {
    const { g, bot } = damaged(HUMAN.repairBelowHp + 1);
    for (let i = 0; i < 300; i++) {
      bot.update();
      expect(g.repair).toBe(false);
      g.step(STEP_MS);
    }
    expect(g.stats.repairTaps).toBe(0);
  });
});

describe('ворота M1', () => {
  it('первые 10 прогонов: все прошли, медиана по часам 20–25 мин; тупик, медиана вне цели, 9 прогонов — не пройдены', () => {
    const base = runSim(DATA, 1, { maxGameMs: 1000, untilLevel: 2, bot: HUMAN });
    const runs = (mins: readonly (number | null)[]): SimResult[] =>
      mins.map((m, i) => ({ ...base, seed: i + 1, clearedWallMs: m === null ? null : m * 60_000 }));
    const ok = [21, 22, 22, 22, 22, 22, 22, 22, 22, 23];
    expect(ok.length).toBe(GATE_M1.runs);

    const pass = gateM1(runs(ok));
    expect(pass.passed).toBe(true);
    expect(pass.lines.join(' ')).toContain('пройдены. Прошли 10 из 10, медиана 22,0 мин (21,0 мин – 23,0 мин), тупиков — 0.');

    const stuck = gateM1(runs([...ok.slice(0, 9), null]));
    expect(stuck.passed).toBe(false);
    expect(stuck.lines.join(' ')).toContain('НЕ пройдены');
    expect(stuck.lines.join(' ')).toContain('тупиков — 1.');

    expect(gateM1(runs(ok.map(() => 26))).passed).toBe(false);
    expect(gateM1(runs(ok.map(() => 19))).passed).toBe(false);
    // Считаются первые 10: 11-й без победы не мешает.
    expect(gateM1(runs([...ok, null])).passed).toBe(true);
    expect(gateM1(runs(ok.slice(0, 9))).passed).toBe(false);
  });
});
