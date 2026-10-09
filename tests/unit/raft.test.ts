import { describe, expect, it } from 'vitest';
import { Raft } from '../../src/core/raft';
import { DATA } from '../../src/data';

const HALF = (DATA.num('raft_grid') - 1) / 2;

describe('Raft', () => {
  it('одна центральная клетка; центр клетки — gx × cell_px', () => {
    const raft = new Raft(DATA);
    const cell = DATA.num('cell_px');
    expect(raft.cells).toEqual([{ gx: 0, gy: 0 }]);
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
});
