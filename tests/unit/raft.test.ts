import { describe, expect, it } from 'vitest';
import { isIntact, Raft } from '../../src/core/raft';
import { DATA } from '../../src/data';

const HALF = (DATA.num('raft_grid') - 1) / 2;
const HP = DATA.num('cell_hp');

describe('Raft', () => {
  it('одна центральная клетка; центр клетки — gx × cell_px', () => {
    const raft = new Raft(DATA);
    const cell = DATA.num('cell_px');
    expect(raft.cells).toEqual([{ gx: 0, gy: 0, hp: HP, building: null }]);
    expect(raft.half).toBe(HALF);
    expect(raft.cellCenter({ gx: 2, gy: -1 })).toEqual({ x: 2 * cell, y: -cell });
  });

  it('у одной клетки 4 места: по gy, потом по gx', () => {
    const raft = new Raft(DATA);
    expect(raft.candidates()).toEqual([{ gx: 0, gy: -1 }, { gx: -1, gy: 0 }, { gx: 1, gy: 0 }, { gx: 0, gy: 1 }]);
  });

  it('диагональ и занятое место — нельзя', () => {
    const raft = new Raft(DATA);
    expect(raft.canAdd(1, 1)).toBe(false);
    expect(raft.canAdd(0, 0)).toBe(false);
    expect(raft.has(0, 0)).toBe(true);
    expect(raft.add(1, 0)).toBe(true);
    expect(raft.has(1, 0)).toBe(true);
    expect(raft.canAdd(1, 0)).toBe(false);
    expect(raft.canAdd(1, 1)).toBe(true);
  });

  it('цепочка до gx = half — можно, half + 1 — нельзя', () => {
    const raft = new Raft(DATA);
    for (let gx = 1; gx <= HALF; gx++) expect(raft.add(gx, 0)).toBe(true);
    expect(raft.canAdd(HALF + 1, 0)).toBe(false);
    expect(raft.add(HALF + 1, 0)).toBe(false);
    for (let gy = 1; gy <= HALF; gy++) expect(raft.add(0, -gy)).toBe(true);
    expect(raft.canAdd(0, -HALF - 1)).toBe(false);
  });

  it('add на неверное место — false, клеток не прибавилось; freeCells = число клеток', () => {
    const raft = new Raft(DATA);
    expect(raft.add(2, 0)).toBe(false);
    expect(raft.add(1, 1)).toBe(false);
    expect(raft.cells).toHaveLength(1);
    expect(raft.freeCells()).toBe(1);
    raft.add(0, 1);
    raft.add(0, 2);
    expect(raft.freeCells()).toBe(3);
    expect(raft.freeCells()).toBe(raft.cells.length);
  });

  it('центральная и новая клетка — cell_hp; cell — клетка или undefined', () => {
    const raft = new Raft(DATA);
    expect(raft.cellHp).toBe(HP);
    raft.add(1, 0);
    expect(raft.cell(0, 0)?.hp).toBe(HP);
    expect(raft.cell(1, 0)).toEqual({ gx: 1, gy: 0, hp: HP, building: null });
    expect(raft.cell(2, 0)).toBeUndefined();
  });

  it('damage: снимает и отвечает снятым, не ниже 0; разбитая, центральная и нет клетки — 0', () => {
    const raft = new Raft(DATA);
    raft.add(1, 0);
    expect(raft.damage(1, 0, HP / 4)).toBe(HP / 4);
    expect(raft.cell(1, 0)!.hp).toBe(HP - HP / 4);
    expect(raft.damage(1, 0, 10 * HP)).toBe(HP - HP / 4);
    expect(raft.cell(1, 0)!.hp).toBe(0);
    expect(isIntact(raft.cell(1, 0)!)).toBe(false);
    expect(raft.damage(1, 0, HP)).toBe(0);
    expect(raft.cell(1, 0)!.hp).toBe(0);
    expect(raft.damage(0, 0, HP)).toBe(0);
    expect(raft.cell(0, 0)!.hp).toBe(HP);
    expect(raft.damage(3, 3, HP)).toBe(0);
    raft.add(-1, 0);
    expect(raft.damage(-1, 0, 0)).toBe(0);
    expect(raft.damage(-1, 0, -HP)).toBe(0);   // урон не лечит
    expect(raft.cell(-1, 0)!.hp).toBe(HP);
  });

  it('stage — по четвертям cell_hp', () => {
    const raft = new Raft(DATA);
    const hps = [HP, 0.76 * HP, 0.75 * HP, 0.51 * HP, 0.5 * HP, 0.26 * HP, 0.25 * HP, 1, 0];
    expect(hps.map((hp) => raft.stage({ gx: 0, gy: 0, hp }))).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 4]);
  });

  it('freeCells — только целые; рядом с разбитой клеткой можно поставить новую', () => {
    const raft = new Raft(DATA);
    raft.add(1, 0);
    raft.add(2, 0);
    expect(raft.freeCells()).toBe(3);
    raft.damage(2, 0, HP);
    expect(raft.freeCells()).toBe(2);
    expect(raft.canAdd(3, 0)).toBe(true);
    expect(raft.candidates()).toContainEqual({ gx: 3, gy: 0 });
    expect(raft.add(3, 0)).toBe(true);
    expect(raft.cell(3, 0)!.hp).toBe(HP);
  });

  it('снимок → JSON → restore — та же прочность; клетка без hp — cell_hp', () => {
    const raft = new Raft(DATA);
    raft.add(1, 0);
    raft.add(-1, 0);
    raft.damage(1, 0, HP / 4);
    raft.damage(-1, 0, HP);
    const s = JSON.parse(JSON.stringify(raft.snapshot())) as ReturnType<Raft['snapshot']>;
    const r = new Raft(DATA);
    r.restore(s);
    expect(r.cells).toEqual(raft.cells);
    r.restore({ cells: [{ gx: 0, gy: 0 }, { gx: 1, gy: 0 }] });
    expect(r.cells).toEqual([{ gx: 0, gy: 0, hp: HP, building: null }, { gx: 1, gy: 0, hp: HP, building: null }]);
  });

  it('постройка — на целую свободную клетку, в том числе центральную; разбитая клетка с постройкой не свободна', () => {
    const raft = new Raft(DATA);
    raft.add(1, 0);
    raft.add(-1, 0);
    raft.add(0, 1);
    raft.damage(-1, 0, HP);
    expect(raft.freeCells()).toBe(3);
    expect(raft.canBuild(0, 0)).toBe(true);
    expect(raft.build(0, 0, 'net_tower')).toBe(true);
    expect(raft.cell(0, 0)!.building).toBe('net_tower');
    expect(raft.build(0, 0, 'net_tower')).toBe(false);
    expect(raft.build(-1, 0, 'net_tower')).toBe(false);
    expect(raft.build(2, 0, 'net_tower')).toBe(false);
    expect(raft.canBuild(0, 0)).toBe(false);
    expect(raft.buildSpots()).toEqual([{ gx: 1, gy: 0 }, { gx: 0, gy: 1 }]);
    expect(raft.freeCells()).toBe(2);
    expect(raft.buildingCount()).toBe(1);
    expect(raft.hasBuilding('net_tower')).toBe(true);
    expect(raft.hasBuilding('spear_tower')).toBe(false);
    // Клетку с постройкой разбили: постройка считается, клетка не свободна.
    expect(raft.build(1, 0, 'spear_tower')).toBe(true);
    raft.damage(1, 0, HP);
    expect(raft.buildingCount()).toBe(2);
    expect(raft.hasBuilding('spear_tower')).toBe(true);
    expect(raft.freeCells()).toBe(1);
    expect(raft.buildSpots()).toEqual([{ gx: 0, gy: 1 }]);
  });

  it('buildSpots — по gy, потом по gx', () => {
    const raft = new Raft(DATA);
    for (const [gx, gy] of [[0, 1], [1, 1], [-1, 1], [0, -1], [1, -1], [-1, 0]] as const) expect(raft.add(gx, gy)).toBe(true);
    expect(raft.buildSpots()).toEqual([
      { gx: 0, gy: -1 }, { gx: 1, gy: -1 }, { gx: -1, gy: 0 }, { gx: 0, gy: 0 }, { gx: -1, gy: 1 }, { gx: 0, gy: 1 }, { gx: 1, gy: 1 },
    ]);
  });
});
