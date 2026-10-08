import { describe, expect, it } from 'vitest';
import { STEP_MS } from '../../src/core/clock';
import { Game } from '../../src/core/game';
import { DATA } from '../../src/data';
import { SchemeA, type PointerInfo } from '../../src/game/input/schemes';

const newGame = (): Game => new Game(DATA, { halfW: 640, halfH: 360, speedMult: 1, locationId: 'lagoon', seed: 1 });
const at = (x: number, y: number, type: PointerInfo['type']): PointerInfo => ({ x, y, type, id: 1 });
const stepUntil = (g: Game, cond: () => boolean): void => {
  for (let i = 0; i < 10_000 && !cond(); i++) g.step(STEP_MS);
};

describe('схема А «Классика»', () => {
  it('мышь бросает по нажатию, удержание тянет, отпускание — сеть лежит', () => {
    const g = newGame();
    const a = new SchemeA();
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
    const a = new SchemeA();
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
