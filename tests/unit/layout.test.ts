import { describe, expect, it } from 'vitest';
import { DESIGN, fitDesign, layoutFor } from '../../src/game/layout';

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
});
