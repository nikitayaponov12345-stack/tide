import { describe, expect, it } from 'vitest';
import { Stats, summarize } from '../../src/core/stats';

const stats = (s: Partial<Stats>): Stats => Object.assign(new Stats(), s);

describe('summarize', () => {
  it('цифры сводки на известных счётчиках', () => {
    const s = summarize(stats({ gameMs: 180_000, throws: 30, itemsCaught: 60, emptyThrows: 6, taps: 90, xpGained: 600 }));
    expect(s.minutes).toBeCloseTo(3);
    expect(s.throwsPerMin).toBeCloseTo(10);
    expect(s.itemsPerThrow).toBeCloseTo(2);
    expect(s.emptyPct).toBeCloseTo(20);
    expect(s.tapsPerMin).toBeCloseTo(30);
    expect(s.xpPerMin).toBeCloseTo(200);
  });

  it('0 бросков и 0 минут — нули, а не деление на ноль', () => {
    const noThrows = summarize(stats({ gameMs: 60_000, taps: 5 }));
    expect(noThrows.itemsPerThrow).toBe(0);
    expect(noThrows.emptyPct).toBe(0);
    expect(noThrows.tapsPerMin).toBeCloseTo(5);
    const zero = summarize(new Stats());
    expect(Object.values(zero).every((v) => v === 0)).toBe(true);
    const noTime = summarize(stats({ throws: 2, itemsCaught: 3, taps: 4, xpGained: 5 }));
    expect([noTime.throwsPerMin, noTime.tapsPerMin, noTime.xpPerMin]).toEqual([0, 0, 0]);
    expect(noTime.itemsPerThrow).toBeCloseTo(1.5);
  });
});
