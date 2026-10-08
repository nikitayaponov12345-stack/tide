import { describe, expect, it } from 'vitest';
import { Rng } from '../../src/core/rng';

describe('Rng', () => {
  it('одинаковый сид даёт одинаковую последовательность', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });

  it('разные сиды дают разные последовательности', () => {
    const a = new Rng(1);
    const b = new Rng(2);
    const sa = Array.from({ length: 10 }, () => a.next());
    const sb = Array.from({ length: 10 }, () => b.next());
    expect(sa).not.toEqual(sb);
  });

  it('next() лежит в [0, 1), int() — в границах включительно', () => {
    const r = new Rng(7);
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      const n = r.int(1, 3);
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(3);
      seen.add(n);
    }
    expect([...seen].sort()).toEqual([1, 2, 3]);
  });

  it('сохранённое состояние повторяет продолжение', () => {
    const r = new Rng(99);
    r.next();
    const saved = r.getState();
    const first = [r.next(), r.next(), r.next()];
    r.setState(saved);
    expect([r.next(), r.next(), r.next()]).toEqual(first);
  });
});
