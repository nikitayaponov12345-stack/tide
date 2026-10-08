import { describe, expect, it } from 'vitest';
import { Raft } from '../../src/core/raft';
import { DATA } from '../../src/data';

describe('Raft', () => {
  const raft = new Raft(DATA);
  const h = DATA.num('cell_px') / 2;

  it('одна клетка моряка в (0, 0)', () => {
    expect(raft.cells).toEqual([{ gx: 0, gy: 0 }]);
    expect(raft.cellCenter({ gx: 2, gy: -1 })).toEqual({ x: 2 * 2 * h, y: -2 * h });
  });

  it('touches: сторона, угол и мимо', () => {
    expect(raft.touches(h + 10, 0, 10)).toBe(true);               // касается стороны
    expect(raft.touches(h + 10, 0, 9.9)).toBe(false);
    expect(raft.touches(h + 6, h + 8, 10)).toBe(true);            // касается угла
    expect(raft.touches(h + 6, h + 8, 9.9)).toBe(false);          // мимо угла
    expect(raft.touches(h + 100, h + 100, 24)).toBe(false);       // мимо
  });
});
