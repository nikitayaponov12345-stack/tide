import { describe, expect, it } from 'vitest';
import { STEP_MS } from '../../src/core/clock';
import { Game } from '../../src/core/game';
import { DATA } from '../../src/data';
import { Control } from '../../src/game/input/control';

const CFG = { halfW: 640, halfH: 360, speedMult: 1, locationId: 'lagoon', seed: 1 };
const CELL_HP = DATA.num('cell_hp');
const PER_TAP = DATA.num('repair_per_tap');

/** Карточка «Плот» в окне выбора; клетку ставит place (без него — стройка остаётся). */
function takeRaft(g: Game): void {
  g.debugLevelUp();
  expect(g.takeCard(g.window!.cards.findIndex((c) => c.id === 'raft'))).toBe(true);
}

/** Две клетки: окно 2-го уровня → «Плот» → (1, 0); с third — и окно 3-го уровня → «Плот» → (−1, 0). */
function setup(third = false): Game {
  const g = new Game(DATA, CFG);
  takeRaft(g);
  expect(g.placeCell(1, 0)).toBe(true);
  if (third) {
    takeRaft(g);
    expect(g.placeCell(-1, 0)).toBe(true);
  }
  return g;
}

const hp = (g: Game, gx: number, gy: number): number => g.raft.cell(gx, gy)!.hp;

describe('ремонт в ядре', () => {
  it('вход: без повреждений, при паузе, окне выбора и в стройке — false; с повреждённой клеткой — true; выход — true', () => {
    const g = setup();
    expect(g.setRepair(true)).toBe(false);
    g.debugDamageCell(1, 0, PER_TAP);
    g.setMenu(true);
    expect(g.setRepair(true)).toBe(false);
    g.setMenu(false);
    g.debugLevelUp();
    expect(g.window?.level).toBe(3);
    expect(g.setRepair(true)).toBe(false);
    expect(g.takeCard(g.window!.cards.findIndex((c) => c.id === 'raft'))).toBe(true);
    expect(g.build).not.toBeNull();
    expect(g.setRepair(true)).toBe(false);
    expect(g.repair).toBe(false);
    expect(g.placeCell(-1, 0)).toBe(true);
    expect(g.setRepair(true)).toBe(true);
    expect(g.repair).toBe(true);
    expect(g.paused).toBe(true);
    expect(g.setRepair(false)).toBe(true);
    expect(g.repair).toBe(false);
    expect(g.paused).toBe(false);
  });

  it('в ремонте броска и шага нет, мир стоит', () => {
    const g = setup();
    g.debugDamageCell(1, 0, PER_TAP);
    expect(g.net.state).toBe('ready');
    expect(g.setRepair(true)).toBe(true);
    expect(g.throwTo(150, 0)).toBe(false);
    expect(g.walk(1, 0)).toBe(false);
    expect(g.sailor.gx).toBe(0);

    g.setRepair(false);
    expect(g.throwTo(150, 0)).toBe(true);
    g.step(STEP_MS * 3);
    expect(g.net.state).not.toBe('ready');
    g.setRepair(true);
    const before = JSON.stringify(g.snapshot());
    for (let i = 0; i < 60; i++) g.step(STEP_MS);
    expect(JSON.stringify(g.snapshot())).toBe(before);
  });

  it('нажатие: не выше полной; разбитая после нажатия уже не разбита; repairTaps', () => {
    expect(PER_TAP).toBeLessThan(CELL_HP);
    const g = setup();
    // Почти полная: до полной меньше repair_per_tap.
    g.debugDamageCell(1, 0, PER_TAP / 2);
    g.setRepair(true);
    expect(g.repairCell(1, 0)).toBe(true);
    expect(hp(g, 1, 0)).toBe(CELL_HP);

    g.debugDamageCell(1, 0, CELL_HP);
    expect(hp(g, 1, 0)).toBe(0);
    expect(g.setRepair(true)).toBe(true);
    expect(g.repairCell(1, 0)).toBe(true);
    expect(hp(g, 1, 0)).toBe(PER_TAP);
    g.setRepair(false);
    expect(g.walk(1, 0)).toBe(true);
    expect(g.stats.repairTaps).toBe(2);
  });

  it('полная, центральная, нет клетки, вне ремонта, на паузе — false; после «Продолжить» ремонт идёт', () => {
    const g = setup(true);
    g.debugDamageCell(1, 0, PER_TAP * 2);
    const damaged = hp(g, 1, 0);
    expect(g.repairCell(1, 0)).toBe(false);
    g.setRepair(true);
    expect(g.repairCell(-1, 0)).toBe(false);
    expect(g.repairCell(0, 0)).toBe(false);
    expect(g.repairCell(0, 1)).toBe(false);
    expect(g.repairCell(5, 5)).toBe(false);
    g.setMenu(true);
    expect(g.repairCell(1, 0)).toBe(false);
    expect([hp(g, 1, 0), hp(g, -1, 0), hp(g, 0, 0)]).toEqual([damaged, CELL_HP, CELL_HP]);
    expect(g.stats.repairTaps).toBe(0);
    g.setMenu(false);
    expect(g.repair).toBe(true);
    expect(g.paused).toBe(true);
    expect(g.repairCell(1, 0)).toBe(true);
    expect(hp(g, 1, 0)).toBe(damaged + PER_TAP);
    expect(g.stats.repairTaps).toBe(1);
  });

  it('две повреждённые: после первой ремонт идёт, после второй закрывается сам и мир идёт', () => {
    const g = setup(true);
    g.debugDamageCell(1, 0, PER_TAP);
    g.debugDamageCell(-1, 0, PER_TAP);
    g.setRepair(true);
    expect(g.repairCell(1, 0)).toBe(true);
    expect(g.repair).toBe(true);
    expect(g.repairCell(-1, 0)).toBe(true);
    expect(g.repair).toBe(false);
    expect(g.raft.damaged()).toBe(false);
    const t = g.world.timeMs;
    g.step(STEP_MS);
    expect(g.world.timeMs).toBeGreaterThan(t);
  });

  it('repair в снимок не входит; после restore ремонта нет, прочность та же', () => {
    const g = setup();
    g.debugDamageCell(1, 0, PER_TAP);
    g.setRepair(true);
    const s = JSON.parse(JSON.stringify(g.snapshot())) as Record<string, unknown>;
    expect('repair' in s).toBe(false);
    const r = Game.restore(DATA, CFG, s as unknown as ReturnType<Game['snapshot']>);
    expect(r.repair).toBe(false);
    expect(r.paused).toBe(false);
    expect(hp(r, 1, 0)).toBe(CELL_HP - PER_TAP);
  });
});

describe('ремонт и сигналы площадке', () => {
  it('ремонт не шлёт ничего; пауза поверх ремонта — stop, «Продолжить» — start', () => {
    const game = setup();
    const calls: string[] = [];
    const control = new Control(game, { gameplayStart: () => calls.push('start'), gameplayStop: () => calls.push('stop') });
    control.notePlay();
    control.frame(STEP_MS);
    expect(calls).toEqual(['start']);
    game.debugDamageCell(1, 0, PER_TAP);
    expect(game.setRepair(true)).toBe(true);
    control.frame(STEP_MS);
    expect(calls).toEqual(['start']);
    game.setMenu(true);
    control.frame(STEP_MS);
    expect(calls).toEqual(['start', 'stop']);
    game.setMenu(false);
    control.frame(STEP_MS);
    expect(calls).toEqual(['start', 'stop', 'start']);
    expect(game.repair).toBe(true);
    game.setRepair(false);
    control.frame(STEP_MS);
    expect(calls).toEqual(['start', 'stop', 'start']);
  });
});
