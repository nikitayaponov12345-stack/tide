import { describe, expect, it } from 'vitest';
import { Raft } from '../../src/core/raft';
import { DATA } from '../../src/data';

describe('Raft', () => {
  it('одна центральная клетка; центр клетки — gx × cell_px', () => {
    const raft = new Raft(DATA);
    const cell = DATA.num('cell_px');
    expect(raft.cells).toEqual([{ gx: 0, gy: 0 }]);
    expect(raft.cellCenter({ gx: 2, gy: -1 })).toEqual({ x: 2 * cell, y: -cell });
  });
});
