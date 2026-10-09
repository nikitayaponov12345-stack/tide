import { describe, expect, it } from 'vitest';
import { STEP_MS } from '../../src/core/clock';
import { Game } from '../../src/core/game';
import type { NetState } from '../../src/core/net';
import { DATA } from '../../src/data';
import { Gesture, type GestureGame, type PointerInfo } from '../../src/game/input/gesture';

type Cmd = { cmd: 'throwTo'; x: number; y: number } | { cmd: 'setPull'; on: boolean };

/** Поддельная игра: записывает команды; состояние сети задаёт тест (бросок из ready переводит в flying). */
class FakeGame implements GestureGame {
  readonly net: { state: NetState } = { state: 'ready' };
  readonly log: Cmd[] = [];

  throwTo(x: number, y: number): boolean {
    this.log.push({ cmd: 'throwTo', x, y });
    if (this.net.state !== 'ready') return false;
    this.net.state = 'flying';
    return true;
  }

  setPull(on: boolean): void {
    this.log.push({ cmd: 'setPull', on });
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

describe('Gesture: команды', () => {
  it('мышь бросает на down, касание — на up; касание, начатое при сети в воде, не бросает', () => {
    const g = new FakeGame();
    const a = new Gesture();
    a.onDown(at(100, 50), g);
    expect(g.log[0]).toEqual({ cmd: 'throwTo', x: 100, y: 50 });
    a.onUp(at(100, 50), g);

    const t = new FakeGame();
    a.onDown(at(10, 20, 'touch'), t);
    expect(t.log).toEqual([]);
    a.onUp(at(30, 40, 'touch'), t);
    expect(t.throws()).toEqual([{ cmd: 'throwTo', x: 30, y: 40 }]);

    const w = inWater();
    a.onDown(at(0, 300, 'touch'), w);
    w.net.state = 'ready';   // сеть успела вернуться, пока палец держали
    a.onUp(at(0, 300, 'touch'), w);
    expect(w.throws()).toEqual([]);
  });

  it('касание, начатое при ready, не бросает, если сеть к отпусканию уже не ready', () => {
    const g = new FakeGame();
    const a = new Gesture();
    a.onDown(at(10, 20, 'touch'), g);
    g.net.state = 'flying';   // бросил кто-то другой (бот)
    a.onUp(at(10, 20, 'touch'), g);
    expect(g.throws()).toEqual([]);
  });

  it('сеть в воде — down удерживает, up отпускает', () => {
    const g = inWater();
    const a = new Gesture();
    a.onDown(at(0, 0), g);
    a.onUp(at(0, 0), g);
    expect(g.log).toEqual([{ cmd: 'setPull', on: true }, { cmd: 'setPull', on: false }]);
  });

  it('перо ведёт себя как касание', () => {
    const g = new FakeGame();
    const a = new Gesture();
    a.onDown(at(10, 20, 'pen'), g);
    expect(g.log).toEqual([]);
    a.onUp(at(30, 40, 'pen'), g);
    expect(g.throws()).toEqual([{ cmd: 'throwTo', x: 30, y: 40 }]);

    const w = inWater();
    a.onDown(at(0, 0, 'pen'), w);
    a.onUp(at(0, 0, 'pen'), w);
    expect(w.log).toEqual([{ cmd: 'setPull', on: true }, { cmd: 'setPull', on: false }]);
  });

  it('второй палец не даёт команд, пока первый не отпущен', () => {
    for (const make of [() => new FakeGame(), inWater]) {
      const g = make();
      const a = new Gesture();
      a.onDown(at(10, 10, 'touch', 1), g);
      const n = g.log.length;
      a.onDown(at(50, 50, 'touch', 2), g);
      a.onUp(at(60, 60, 'touch', 2), g);
      a.onCancel(at(60, 60, 'touch', 2), g);
      expect(g.log.length).toBe(n);
    }
    const g = new FakeGame();
    const a = new Gesture();
    a.onDown(at(10, 10, 'touch', 1), g);
    a.onUp(at(10, 10, 'touch', 1), g);
    g.net.state = 'ready';
    a.onDown(at(70, 70, 'mouse', 2), g);   // после отпускания первого жест снова свободен
    expect(g.throws().at(-1)).toEqual({ cmd: 'throwTo', x: 70, y: 70 });
  });

  it('onCancel не бросает и выключает удержание', () => {
    const r = new FakeGame();
    const a = new Gesture();
    a.onDown(at(10, 10, 'touch'), r);
    a.onCancel(at(40, 40, 'touch'), r);
    expect(r.throws()).toEqual([]);
    a.onUp(at(40, 40, 'touch'), r);   // отпускание после отмены — уже не этот жест
    expect(r.throws()).toEqual([]);

    const w = inWater();
    a.onDown(at(10, 10, 'touch'), w);
    a.onCancel(at(10, 10, 'touch'), w);
    expect(w.log).toEqual([{ cmd: 'setPull', on: true }, { cmd: 'setPull', on: false }]);
  });
});

const newGame = (): Game => new Game(DATA, { halfW: 640, halfH: 360, speedMult: 1, locationId: 'lagoon', seed: 1 });
const stepUntil = (g: Game, cond: () => boolean): void => {
  for (let i = 0; i < 10_000 && !cond(); i++) g.step(STEP_MS);
};

describe('Gesture на ядре', () => {
  it('мышь бросает по нажатию, удержание тянет, отпускание — сеть лежит', () => {
    const g = newGame();
    const a = new Gesture();
    a.onDown(at(100, 50, 'mouse'), g);
    expect(g.net.state).toBe('flying');
    a.onUp(at(100, 50, 'mouse'), g);
    stepUntil(g, () => g.net.state !== 'flying');
    expect(g.net.state).toBe('lying');
    a.onDown(at(-300, 200, 'mouse'), g);
    expect(g.net.state).toBe('pulling');
    a.onUp(at(-300, 200, 'mouse'), g);
    expect(g.net.state).toBe('lying');
    expect(g.stats.throws).toBe(1);
  });

  it('касание бросает по отпусканию; отпускание после удержания до возврата и отмена не бросают', () => {
    const g = newGame();
    const a = new Gesture();
    a.onDown(at(100, 0, 'touch'), g);
    expect(g.net.state).toBe('ready');
    a.onUp(at(120, 0, 'touch'), g);
    expect(g.net.state).toBe('flying');
    stepUntil(g, () => g.net.state !== 'flying');
    a.onDown(at(0, 300, 'touch'), g);
    stepUntil(g, () => g.net.state === 'ready');
    a.onUp(at(0, 300, 'touch'), g);
    expect(g.net.state).toBe('ready');
    a.onDown(at(100, 0, 'touch'), g);
    a.onCancel(at(100, 0, 'touch'), g);
    expect(g.net.state).toBe('ready');
    expect(g.stats.throws).toBe(1);
  });
});
