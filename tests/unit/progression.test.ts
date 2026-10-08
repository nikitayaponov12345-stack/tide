import { describe, expect, it } from 'vitest';
import type { CaughtItem } from '../../src/core/net';
import { Progression } from '../../src/core/progression';
import { DATA } from '../../src/data';

const item = (xp: number): CaughtItem => ({ kind: 'test', role: 'light1', xp, weight: 0.1, x: 10, y: 20 });
const interval = DATA.num('icon_interval_ms');
const flight = DATA.num('icon_flight_ms');

describe('Progression', () => {
  it('значки: опыт только по прилёту, последний — через 4 × interval + flight', () => {
    const p = new Progression(DATA, 1);
    p.addCatch([item(1), item(1), item(1), item(1), item(1)], 1000);
    expect(p.icons).toHaveLength(5);
    expect(p.step(1000 + flight - 1)).toBe(0);
    expect(p.xp).toBe(0);
    expect(p.step(1000 + flight)).toBe(1);
    expect(p.step(1000 + 4 * interval + flight - 1)).toBe(3);
    expect(p.step(1000 + 4 * interval + flight)).toBe(1);
    expect(p.icons).toHaveLength(0);
    expect(p.xp).toBe(5);
  });

  it('порог 2 уровня — levelStep(2, 1)', () => {
    const p = new Progression(DATA, 1);
    const need = DATA.levelStep(2, 1);
    expect(p.xpToNext()).toBe(need);
    p.addCatch(Array.from({ length: need - 1 }, () => item(1)), 0);
    p.step(1e6);
    expect(p.level).toBe(1);
    p.addCatch([item(1)], 1e6);
    p.step(2e6);
    expect(p.level).toBe(2);
    expect(p.xp).toBe(0);
  });

  it('перенос и несколько уровней подряд', () => {
    const p = new Progression(DATA, 1);
    p.addCatch([item(30)], 0);
    p.step(flight);
    expect(p.level).toBe(3);
    expect(p.xp).toBe(30 - DATA.levelStep(2, 1) - DATA.levelStep(3, 1));
    expect(p.takeLevelUps()).toEqual([2, 3]);
    expect(p.takeLevelUps()).toEqual([]);
  });

  it('сила локации умножается один раз; стоимость уровня — levelStep(…, xpMult)', () => {
    const p = new Progression(DATA, 2);
    p.addCatch([item(10)], 0);
    expect(p.icons[0]!.xp).toBe(20);
    expect(p.xpToNext()).toBe(DATA.levelStep(2, 2));
    expect(p.step(flight)).toBe(20);
    expect(p.level).toBe(2);
    expect(p.xp).toBe(20 - DATA.levelStep(2, 2));
  });

  it('после 40 уровня — запасная формула levelStep(41, …)', () => {
    const p = new Progression(DATA, 1);
    p.setLevel(40);
    expect(p.xpToNext()).toBe(DATA.levelStep(41, 1));
    p.addCatch([item(DATA.levelStep(41, 1))], 0);
    p.step(flight);
    expect(p.level).toBe(41);
    expect(p.xpToNext()).toBe(DATA.levelStep(42, 1));
  });

  it('пустой улов значков не даёт; setLevel сбрасывает значки', () => {
    const p = new Progression(DATA, 1);
    p.addCatch([], 0);
    expect(p.icons).toHaveLength(0);
    p.addCatch([item(3)], 0);
    p.setLevel(5);
    expect(p.icons).toHaveLength(0);
    expect(p.step(flight)).toBe(0);
    expect(p.level).toBe(5);
  });
});
