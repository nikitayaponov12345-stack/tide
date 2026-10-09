import { describe, expect, it } from 'vitest';
import { STEP_MS } from '../../src/core/clock';
import { Game } from '../../src/core/game';
import type { NetState } from '../../src/core/net';
import { DATA } from '../../src/data';
import { Gesture, type GestureGame, type PointerInfo } from '../../src/game/input/gesture';

type Cmd = { cmd: 'throwTo'; x: number; y: number } | { cmd: 'setPull'; on: boolean } | { cmd: 'walk'; dx: number; dy: number };

/** Шаг моряка пальцем, точки мира. */
const PX = DATA.num('walk_drag_px');

/**
 * Поддельная игра: записывает команды; состояние сети задаёт тест (бросок из ready переводит в flying), ответ walk — walkOk.
 * canThrow — по сети, пока тест не задал throwable (как у Game со слотом копья: сеть в воде, копьё у моряка).
 */
class FakeGame implements GestureGame {
  readonly net: { state: NetState } = { state: 'ready' };
  readonly log: Cmd[] = [];
  walkOk = true;
  throwable: boolean | null = null;

  canThrow(): boolean {
    return this.throwable ?? this.net.state === 'ready';
  }

  walk(dx: number, dy: number): boolean {
    this.log.push({ cmd: 'walk', dx, dy });
    return this.walkOk;
  }

  walks(): Cmd[] {
    return this.log.filter((c) => c.cmd === 'walk');
  }

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
  it('бросок и удержание — по canThrow, а не по состоянию сети', () => {
    const a = new Gesture(PX);
    const spear = inWater();
    spear.throwable = true;   // слот копья: сеть в воде, копьё у моряка
    a.onDown(at(10, 20), spear);
    expect(spear.log).toEqual([{ cmd: 'throwTo', x: 10, y: 20 }]);
    a.onUp(at(10, 20), spear);
    a.onDown(at(10, 20, 'touch'), spear);
    a.onUp(at(30, 40, 'touch'), spear);
    expect(spear.throws().at(-1)).toEqual({ cmd: 'throwTo', x: 30, y: 40 });

    const busy = new FakeGame();
    busy.throwable = false;   // сеть у моряка, а копьё в полёте
    a.onDown(at(10, 20), busy);
    a.onUp(at(10, 20), busy);
    a.onDown(at(10, 20, 'touch'), busy);
    a.onUp(at(10, 20, 'touch'), busy);
    expect(busy.throws()).toEqual([]);
    expect(busy.log.filter((c) => c.cmd === 'setPull').length).toBe(4);
  });

  it('мышь бросает на down, касание — на up; касание, начатое при сети в воде, не бросает', () => {
    const g = new FakeGame();
    const a = new Gesture(PX);
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
    const a = new Gesture(PX);
    a.onDown(at(10, 20, 'touch'), g);
    g.net.state = 'flying';   // бросил кто-то другой (бот)
    a.onUp(at(10, 20, 'touch'), g);
    expect(g.throws()).toEqual([]);
  });

  it('сеть в воде — down удерживает, up отпускает', () => {
    const g = inWater();
    const a = new Gesture(PX);
    a.onDown(at(0, 0), g);
    a.onUp(at(0, 0), g);
    expect(g.log).toEqual([{ cmd: 'setPull', on: true }, { cmd: 'setPull', on: false }]);
  });

  it('перо ведёт себя как касание', () => {
    const g = new FakeGame();
    const a = new Gesture(PX);
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
      const a = new Gesture(PX);
      a.onDown(at(10, 10, 'touch', 1), g);
      const n = g.log.length;
      a.onDown(at(50, 50, 'touch', 2), g);
      a.onUp(at(60, 60, 'touch', 2), g);
      a.onCancel(at(60, 60, 'touch', 2), g);
      expect(g.log.length).toBe(n);
    }
    const g = new FakeGame();
    const a = new Gesture(PX);
    a.onDown(at(10, 10, 'touch', 1), g);
    a.onUp(at(10, 10, 'touch', 1), g);
    g.net.state = 'ready';
    a.onDown(at(70, 70, 'mouse', 2), g);   // после отпускания первого жест снова свободен
    expect(g.throws().at(-1)).toEqual({ cmd: 'throwTo', x: 70, y: 70 });
  });

  it('onCancel не бросает и выключает удержание', () => {
    const r = new FakeGame();
    const a = new Gesture(PX);
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

/** Палец с id 1: нажатие в (0, 0), сдвиги по точкам, отпускание в последней. */
function drag(a: Gesture, g: FakeGame, points: Array<[number, number]>, type: PointerInfo['type'] = 'touch'): void {
  a.onDown(at(0, 0, type), g);
  for (const [x, y] of points) a.onMove(at(x, y, type), g);
  const [x, y] = points.at(-1) ?? [0, 0];
  a.onUp(at(x, y, type), g);
}

describe('Gesture: ходьба пальцем', () => {
  it('конструктор: walkDragPx не больше 0 — ошибка', () => {
    expect(() => new Gesture(0)).toThrow();
    expect(() => new Gesture(-1)).toThrow();
    expect(() => new Gesture(Number.NaN)).toThrow();
  });

  it('каждые PX вдоль оси — шаг по стороне', () => {
    const g = new FakeGame();
    drag(new Gesture(PX), g, [[PX, 0]]);
    expect(g.walks()).toEqual([{ cmd: 'walk', dx: 1, dy: 0 }]);

    const two = new FakeGame();
    drag(new Gesture(PX), two, [[PX / 2, 0], [2 * PX + 2, 0]]);
    expect(two.walks()).toEqual([{ cmd: 'walk', dx: 1, dy: 0 }, { cmd: 'walk', dx: 1, dy: 0 }]);

    const up = new FakeGame();
    drag(new Gesture(PX), up, [[0, -PX]], 'pen');
    expect(up.walks()).toEqual([{ cmd: 'walk', dx: 0, dy: -1 }]);
  });

  it('диагональ: сначала шаг по X, потом по Y', () => {
    const g = new FakeGame();
    drag(new Gesture(PX), g, [[-PX, PX]]);
    expect(g.walks()).toEqual([{ cmd: 'walk', dx: -1, dy: 0 }, { cmd: 'walk', dx: 0, dy: 1 }]);
  });

  it('жест, который шагнул, не бросает; сдвиг PX − 1 — бросок в точку отпускания', () => {
    const g = new FakeGame();
    drag(new Gesture(PX), g, [[PX, 0]]);
    expect(g.throws()).toEqual([]);

    const t = new FakeGame();
    drag(new Gesture(PX), t, [[PX - 1, 0]]);
    expect(t.walks()).toEqual([]);
    expect(t.throws()).toEqual([{ cmd: 'throwTo', x: PX - 1, y: 0 }]);
  });

  it('туда и обратно — шаг туда и шаг обратно; сдвиг до отпускания не считается', () => {
    const g = new FakeGame();
    const a = new Gesture(PX);
    a.onDown(at(0, 0, 'touch'), g);
    a.onMove(at(PX, 0, 'touch'), g);
    a.onMove(at(0, 0, 'touch'), g);
    a.onUp(at(5 * PX, 0, 'touch'), g);
    expect(g.walks()).toEqual([{ cmd: 'walk', dx: 1, dy: 0 }, { cmd: 'walk', dx: -1, dy: 0 }]);
  });

  it('мышь не ходит', () => {
    const g = new FakeGame();
    drag(new Gesture(PX), g, [[3 * PX, 3 * PX]], 'mouse');
    expect(g.walks()).toEqual([]);
  });

  it('шаг не удался — жест всё равно ходьба: броска нет', () => {
    const g = new FakeGame();
    g.walkOk = false;
    drag(new Gesture(PX), g, [[PX, 0]]);
    expect(g.walks().length).toBe(1);
    expect(g.throws()).toEqual([]);
  });

  it('второй палец не ходит, пока первый не отпущен', () => {
    const g = new FakeGame();
    const a = new Gesture(PX);
    a.onDown(at(0, 0, 'touch', 1), g);
    a.onDown(at(0, 0, 'touch', 2), g);
    a.onMove(at(2 * PX, 0, 'touch', 2), g);
    expect(g.walks()).toEqual([]);
    a.onMove(at(PX, 0, 'touch', 1), g);
    expect(g.walks()).toEqual([{ cmd: 'walk', dx: 1, dy: 0 }]);
  });

  it('сеть в воде: нажатие удерживает, ходьба удержание не трогает, отпускание выключает', () => {
    const g = inWater();
    drag(new Gesture(PX), g, [[PX, 0]]);
    expect(g.log).toEqual([{ cmd: 'setPull', on: true }, { cmd: 'walk', dx: 1, dy: 0 }, { cmd: 'setPull', on: false }]);
  });

  it('новый жест копит сдвиг с нуля', () => {
    const g = new FakeGame();
    const a = new Gesture(PX);
    a.onDown(at(0, 0, 'touch'), g);
    a.onMove(at(PX - 1, 0, 'touch'), g);
    a.onCancel(at(PX - 1, 0, 'touch'), g);
    a.onDown(at(100, 0, 'touch'), g);
    a.onMove(at(100 + PX - 1, 0, 'touch'), g);
    expect(g.walks()).toEqual([]);
    a.onMove(at(100 + PX, 0, 'touch'), g);
    expect(g.walks()).toEqual([{ cmd: 'walk', dx: 1, dy: 0 }]);
  });
});

const newGame = (): Game => new Game(DATA, { halfW: 640, halfH: 360, speedMult: 1, locationId: 'lagoon', seed: 1 });
const stepUntil = (g: Game, cond: () => boolean): void => {
  for (let i = 0; i < 10_000 && !cond(); i++) g.step(STEP_MS);
};

describe('Gesture на ядре', () => {
  it('мышь бросает по нажатию, удержание тянет, отпускание — сеть лежит', () => {
    const g = newGame();
    const a = new Gesture(PX);
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
    const a = new Gesture(PX);
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
