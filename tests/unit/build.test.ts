import { describe, expect, it } from 'vitest';
import { DATA } from '../../src/data';
import { BuildCursor } from '../../src/game/input/build';

const CELL = DATA.num('cell_px');

describe('BuildCursor', () => {
  it('точка мира → ближайшая клетка, без −0; тип указателя', () => {
    const c = new BuildCursor(CELL);
    expect(c.shown).toBe(false);
    c.point(CELL * 0.6, -CELL * 0.4, 'mouse');
    expect({ gx: c.gx, gy: c.gy, shown: c.shown, byTouch: c.byTouch }).toEqual({ gx: 1, gy: 0, shown: true, byTouch: false });
    expect(Object.is(c.gy, -0)).toBe(false);
    c.point(-CELL * 1.6, CELL * 2.2, 'touch');
    expect({ gx: c.gx, gy: c.gy, byTouch: c.byTouch }).toEqual({ gx: -2, gy: 2, byTouch: true });
    c.point(0, 0, 'pen');
    expect(c.byTouch).toBe(true);
    c.reset();
    expect({ shown: c.shown, byTouch: c.byTouch }).toEqual({ shown: false, byTouch: false });
  });
});
