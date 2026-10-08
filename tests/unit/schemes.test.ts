import { describe, expect, it } from 'vitest';
import type { NetState, ThrowOptions } from '../../src/core/net';
import { DATA } from '../../src/data';
import {
  SCHEME_IDS, SchemeA, SchemeB, SchemeC, SchemeD, createScheme, nextScheme,
  type PointerInfo, type SchemeGame,
} from '../../src/game/input/schemes';

type Cmd =
  | { cmd: 'throwTo'; x: number; y: number; opts: ThrowOptions }
  | { cmd: 'setPull'; on: boolean; mult?: number }
  | { cmd: 'setFollow'; p: { x: number; y: number } | null };

/** Поддельная игра: записывает команды; состояние сети задаёт тест (бросок из ready переводит в flying). */
class FakeGame implements SchemeGame {
  readonly net: { state: NetState } = { state: 'ready' };
  readonly log: Cmd[] = [];

  throwTo(x: number, y: number, opts: ThrowOptions): boolean {
    this.log.push({ cmd: 'throwTo', x, y, opts });
    if (this.net.state !== 'ready') return false;
    this.net.state = 'flying';
    return true;
  }

  setPull(on: boolean, mult?: number): void {
    this.log.push(mult === undefined ? { cmd: 'setPull', on } : { cmd: 'setPull', on, mult });
  }

  setFollow(p: { x: number; y: number } | null): void {
    this.log.push({ cmd: 'setFollow', p });
  }

  throws(): Cmd[] {
    return this.log.filter((c) => c.cmd === 'throwTo');
  }
}

const at = (x: number, y: number, type: PointerInfo['type'] = 'mouse', id = 1): PointerInfo => ({ x, y, type, id });
const inWater = (): FakeGame => {
  const g = new FakeGame();
  g.net.state = 'lying';
  return g;
};
const AUTO = DATA.num('scheme_b_autopull_ms');
const HOLD = DATA.num('scheme_b_hold_mult');
const GRAB = DATA.num('scheme_d_grab_px');
const POWER = DATA.num('scheme_d_power');
const MIN_DRAG = DATA.num('scheme_d_min_drag_px');

describe('схемы управления', () => {
  it('createScheme и порядок по кругу', () => {
    for (const id of SCHEME_IDS) expect(createScheme(id, DATA).id).toBe(id);
    expect(SCHEME_IDS.map(nextScheme)).toEqual(['b', 'c', 'd', 'a']);
  });

  it('А: мышь бросает на down, касание — на up; касание, начатое при сети в воде, не бросает', () => {
    const g = new FakeGame();
    const a = new SchemeA();
    a.onDown(at(100, 50), g);
    expect(g.log[0]).toEqual({ cmd: 'throwTo', x: 100, y: 50, opts: { autoPullAfterMs: null } });
    a.onUp(at(100, 50), g);

    const t = new FakeGame();
    a.onDown(at(10, 20, 'touch'), t);
    expect(t.log).toEqual([]);
    a.onUp(at(30, 40, 'touch'), t);
    expect(t.throws()).toEqual([{ cmd: 'throwTo', x: 30, y: 40, opts: { autoPullAfterMs: null } }]);

    const w = inWater();
    a.onDown(at(0, 300, 'touch'), w);
    w.net.state = 'ready';   // сеть успела вернуться, пока палец держали
    a.onUp(at(0, 300, 'touch'), w);
    expect(w.throws()).toEqual([]);
  });

  it('А: сеть в воде — down удерживает, up отпускает', () => {
    const g = inWater();
    const a = new SchemeA();
    a.onDown(at(0, 0), g);
    a.onUp(at(0, 0), g);
    expect(g.log).toEqual([{ cmd: 'setPull', on: true }, { cmd: 'setPull', on: false }]);
  });

  it('Б: бросок с автотягой, удержание с множителем', () => {
    const g = new FakeGame();
    const b = new SchemeB(DATA);
    b.onDown(at(50, 60), g);
    expect(g.log[0]).toEqual({ cmd: 'throwTo', x: 50, y: 60, opts: { autoPullAfterMs: AUTO } });
    b.onUp(at(50, 60), g);

    const t = new FakeGame();
    b.onDown(at(5, 5, 'touch'), t);
    b.onUp(at(70, 80, 'touch'), t);
    expect(t.throws()).toEqual([{ cmd: 'throwTo', x: 70, y: 80, opts: { autoPullAfterMs: AUTO } }]);

    const w = inWater();
    b.onDown(at(0, 0), w);
    b.onUp(at(0, 0), w);
    expect(w.log).toEqual([{ cmd: 'setPull', on: true, mult: HOLD }, { cmd: 'setPull', on: false }]);
  });

  it('В: бросок и ведение сразу на down, move ведёт, up отпускает; в воде down ведёт', () => {
    for (const type of ['mouse', 'touch'] as const) {
      const g = new FakeGame();
      const c = new SchemeC();
      c.onDown(at(100, 0, type), g);
      expect(g.log).toEqual([
        { cmd: 'throwTo', x: 100, y: 0, opts: { autoPullAfterMs: null } },
        { cmd: 'setFollow', p: { x: 100, y: 0 } },
      ]);
      c.onMove(at(80, 10, type), g);
      c.onUp(at(80, 10, type), g);
      expect(g.log.slice(2)).toEqual([{ cmd: 'setFollow', p: { x: 80, y: 10 } }, { cmd: 'setFollow', p: null }]);
    }
    const w = inWater();
    new SchemeC().onDown(at(-50, 40), w);
    expect(w.log).toEqual([{ cmd: 'setFollow', p: { x: -50, y: 40 } }]);
  });

  it('Г: натяжение от плота бросает в обратную сторону с автотягой', () => {
    const g = new FakeGame();
    const d = new SchemeD(DATA);
    d.onDown(at(0, 0, 'touch'), g);
    d.onMove(at(20, -30, 'touch'), g);
    expect(d.aim()).toEqual({ x: 20, y: -30, target: { x: -20 * POWER, y: 30 * POWER } });
    d.onUp(at(30, -40, 'touch'), g);
    expect(g.log).toEqual([{ cmd: 'throwTo', x: -30 * POWER, y: 40 * POWER, opts: { autoPullAfterMs: AUTO } }]);
    expect(d.aim()).toBeNull();
  });

  it('Г: нажатие дальше scheme_d_grab_px и натяжение короче минимума не бросают', () => {
    const g = new FakeGame();
    const d = new SchemeD(DATA);
    d.onDown(at(GRAB + 1, 0), g);
    expect(d.aim()).toBeNull();
    d.onMove(at(GRAB + 100, 0), g);
    d.onUp(at(GRAB + 100, 0), g);
    expect(g.log).toEqual([]);

    // касание без движения в 30 точках от центра плота
    d.onDown(at(30, 0, 'touch'), g);
    expect(d.aim()).toEqual({ x: 30, y: 0, target: null });
    d.onUp(at(30, 0, 'touch'), g);
    // палец ушёл от точки нажатия чуть меньше минимума
    d.onDown(at(10, 10), g);
    d.onUp(at(10 + MIN_DRAG - 0.5, 10), g);
    expect(g.log).toEqual([]);
  });

  it('Г: сеть в воде — удержание с множителем «Автотяги»', () => {
    const w = inWater();
    const d = new SchemeD(DATA);
    d.onDown(at(0, 0), w);
    d.onUp(at(0, 0), w);
    expect(w.log).toEqual([{ cmd: 'setPull', on: true, mult: HOLD }, { cmd: 'setPull', on: false }]);
  });

  it('второй палец во время жеста первого не даёт команд', () => {
    for (const id of SCHEME_IDS) {
      const g = inWater();
      const s = createScheme(id, DATA);
      s.onDown(at(10, 10, 'touch', 1), g);
      const n = g.log.length;
      s.onDown(at(50, 50, 'touch', 2), g);
      s.onMove(at(60, 60, 'touch', 2), g);
      s.onUp(at(60, 60, 'touch', 2), g);
      s.onCancel(at(60, 60, 'touch', 2), g);
      expect(g.log.length, `схема ${id}`).toBe(n);
    }
  });

  it('cancel не бросает: удержание выключено, ведение — null, натяжение Г отменено без команд', () => {
    for (const id of ['a', 'b', 'd'] as const) {
      const w = inWater();
      const s = createScheme(id, DATA);
      s.onDown(at(10, 10, 'touch'), w);
      s.onCancel(at(10, 10, 'touch'), w);
      expect(w.log.at(-1), `схема ${id}`).toEqual({ cmd: 'setPull', on: false });

      const r = new FakeGame();
      s.onDown(at(10, 10, 'touch'), r);
      s.onMove(at(40, 40, 'touch'), r);
      s.onCancel(at(40, 40, 'touch'), r);
      expect(r.throws(), `схема ${id}`).toEqual([]);
    }
    const c = new SchemeC();
    const w = inWater();
    c.onDown(at(10, 10, 'touch'), w);
    c.onCancel(at(10, 10, 'touch'), w);
    expect(w.log.at(-1)).toEqual({ cmd: 'setFollow', p: null });
    expect(w.throws()).toEqual([]);

    const d = new SchemeD(DATA);
    const r = new FakeGame();
    d.onDown(at(0, 0, 'touch'), r);
    d.onMove(at(40, 40, 'touch'), r);
    d.onCancel(at(40, 40, 'touch'), r);
    expect(r.log).toEqual([]);
    expect(d.aim()).toBeNull();
  });
});
