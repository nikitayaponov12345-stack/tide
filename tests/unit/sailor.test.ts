import { describe, expect, it } from 'vitest';
import { Raft } from '../../src/core/raft';
import { Sailor } from '../../src/core/sailor';
import { DATA } from '../../src/data';

describe('Sailor', () => {
  const h = DATA.num('sailor_box_px') / 2;

  it('точка моряка — центр его клетки', () => {
    const s = new Sailor(DATA);
    expect([s.gx, s.gy, s.x, s.y]).toEqual([0, 0, 0, 0]);
    expect(s.box).toBe(DATA.num('sailor_box_px'));
    s.gx = 2;
    s.gy = -1;
    expect([s.x, s.y]).toEqual([2 * DATA.num('cell_px'), -DATA.num('cell_px')]);
  });

  it('touches: сторона, угол и мимо — от квадрата sailor_box_px', () => {
    const s = new Sailor(DATA);
    expect(s.touches(h + 10, 0, 10)).toBe(true);               // касается стороны
    expect(s.touches(h + 10, 0, 9.9)).toBe(false);
    expect(s.touches(h + 6, h + 8, 10)).toBe(true);            // касается угла
    expect(s.touches(h + 6, h + 8, 9.9)).toBe(false);          // мимо угла
    expect(s.touches(h + 100, h + 100, 24)).toBe(false);       // мимо

    s.gx = 1;   // квадрат идёт за клеткой
    const x = DATA.num('cell_px');
    expect(s.touches(x + h + 10, 0, 10)).toBe(true);
    expect(s.touches(-(h + 10), 0, 10)).toBe(false);   // у клетки (0, 0) — касание, у (1, 0) — нет
  });

  it('move: шаг на соседнюю клетку по стороне; пусто, диагональ и через клетку — нет', () => {
    const raft = new Raft(DATA);
    raft.add(1, 0);
    raft.add(1, 1);
    raft.add(2, 0);
    const s = new Sailor(DATA);
    const px = DATA.num('cell_px');
    expect(s.move(0, 1, raft)).toBe(false);    // пусто
    expect(s.move(1, 1, raft)).toBe(false);    // диагональ, хотя клетка есть
    expect(s.move(2, 0, raft)).toBe(false);    // через клетку, хотя она есть
    expect(s.move(0, 0, raft)).toBe(false);
    expect([s.gx, s.gy]).toEqual([0, 0]);
    expect(s.move(1, 0, raft)).toBe(true);
    expect([s.gx, s.gy, s.x, s.y]).toEqual([1, 0, px, 0]);
    expect(s.move(0, 1, raft)).toBe(true);
    expect([s.gx, s.gy, s.x, s.y]).toEqual([1, 1, px, px]);
    expect(s.move(-1, 0, raft)).toBe(false);   // (0, 1) пуст
  });
});
