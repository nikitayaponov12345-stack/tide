import { describe, expect, it } from 'vitest';
import { DESIGN, fitDesign, layoutFor, screenToWorld, worldToScreen } from '../../src/game/layout';

describe('раскладка', () => {
  it('выбирается по соотношению сторон окна', () => {
    expect(layoutFor(1366, 768)).toBe('landscape');
    expect(layoutFor(412, 915)).toBe('portrait');
    expect(layoutFor(800, 800)).toBe('landscape');
  });

  it('поле дизайна целиком помещается в окно и стоит по центру', () => {
    for (const [w, h] of [
      [1366, 768],
      [412, 915],
      [915, 412],
      [1920, 1080],
    ] as const) {
      const layout = layoutFor(w, h);
      const f = fitDesign(w, h, layout);
      const d = DESIGN[layout];
      expect(d.w * f.scale).toBeLessThanOrEqual(w + 1e-6);
      expect(d.h * f.scale).toBeLessThanOrEqual(h + 1e-6);
      expect(f.x).toBeCloseTo((w - d.w * f.scale) / 2);
      expect(f.y).toBeCloseTo((h - d.h * f.scale) / 2);
    }
  });

  it('экран → мир — обратное мир → экран; центр поля — (0, 0)', () => {
    for (const [w, h] of [
      [1366, 768],
      [412, 915],
    ] as const) {
      const layout = layoutFor(w, h);
      const s = worldToScreen(123, -45, w, h, layout);
      const back = screenToWorld(s.x, s.y, w, h, layout);
      expect(back.x).toBeCloseTo(123, 9);
      expect(back.y).toBeCloseTo(-45, 9);
      const c = screenToWorld(w / 2, h / 2, w, h, layout);
      expect(c.x).toBeCloseTo(0, 9);
      expect(c.y).toBeCloseTo(0, 9);
    }
  });
});
