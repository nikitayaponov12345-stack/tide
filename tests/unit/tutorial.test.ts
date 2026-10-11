import { describe, expect, it } from 'vitest';
import { STEP_MS } from '../../src/core/clock';
import { Game, type GameConfig, type GameSnapshot } from '../../src/core/game';
import { DATA } from '../../src/data';

const CFG: GameConfig = { halfW: 640, halfH: 360, speedMult: 1, locationId: 'lagoon', seed: 1, tutorial: true };
/** Предел шагов любого цикла: синхронный бесконечный цикл Vitest не прерывает. */
const MAX_STEPS = 20_000;

function run(g: Game, cond: () => boolean): void {
  for (let i = 0; cond(); i++) {
    if (i >= MAX_STEPS) throw new Error('run: предел шагов');
    g.step(STEP_MS);
  }
}

/** Снимок через JSON — так, как его вернёт запись. */
const viaJson = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** Новая партия с обучением: сеть брошена в (0, 200) и упала. */
function lying(): Game {
  const g = new Game(DATA, CFG);
  expect(g.throwTo(0, 200)).toBe(true);
  run(g, () => g.net.state === 'flying');
  expect(g.net.state).toBe('lying');
  return g;
}

describe('Tutorial (M1-19)', () => {
  it('без обучения — шагов нет', () => {
    const { tutorial: _t, ...noField } = CFG;
    for (const cfg of [{ ...CFG, tutorial: false }, noField]) {
      const g = new Game(DATA, cfg);
      expect(g.tutorial.enabled).toBe(false);
      expect(g.tutorial.step(g)).toBeNull();
      g.throwTo(0, 200);
      run(g, () => g.net.state === 'flying');
      expect(g.tutorial.step(g)).toBeNull();
      g.debugLevelUp();
      expect(g.tutorial.step(g)).toBeNull();
    }
  });

  it('бросок, пауза, полёт, тяга упавшей сети', () => {
    const g = new Game(DATA, CFG);
    expect(g.tutorial.step(g)).toBe('throw');
    g.menu = true;
    expect(g.tutorial.step(g)).toBeNull();
    g.menu = false;
    expect(g.throwTo(0, 200)).toBe(true);
    expect(g.net.state).toBe('flying');
    expect(g.tutorial.step(g)).toBeNull();
    run(g, () => g.net.state === 'flying');
    expect(g.net.state).toBe('lying');
    expect(g.tutorial.step(g)).toBe('pull');
    g.setPull(true);
    expect(g.net.state).toBe('pulling');
    expect(g.tutorial.pulled).toBe(true);
    expect(g.tutorial.step(g)).toBeNull();
    g.setPull(false);
    expect(g.net.state).toBe('lying');
    expect(g.tutorial.step(g)).toBeNull();
  });

  it('тяга, нажатая в полёте, засчитывается следующим нажатием по упавшей сети', () => {
    const g = new Game(DATA, CFG);
    g.throwTo(0, 200);
    g.setPull(true);
    expect(g.tutorial.pulled).toBe(false);
    run(g, () => g.net.state === 'flying');
    expect(g.net.state).toBe('pulling');
    expect(g.tutorial.pulled).toBe(false);
    g.setPull(true);
    expect(g.tutorial.pulled).toBe(true);
  });

  it('первая карточка и первая клетка; дальше окна без руки', () => {
    const g = new Game(DATA, CFG);
    g.debugLevelUp();
    expect(g.window?.level).toBe(2);
    expect(g.tutorial.step(g)).toBe('card');
    expect(g.takeCard(0)).toBe(true);
    expect(g.build?.card).toBe('raft');
    expect(g.tutorial.step(g)).toBe('cell');
    const c = g.buildSpots()[0]!;
    expect(g.placeCell(c.gx, c.gy)).toBe(true);
    expect(g.raft.cells).toHaveLength(2);
    expect(g.tutorial.step(g)).toBe('throw');
    g.build = { card: 'raft' };
    expect(g.tutorial.step(g)).toBeNull();
    g.build = null;
    g.debugLevelUp();
    expect(g.window).not.toBeNull();
    expect(g.tutorial.step(g)).toBeNull();
  });

  it('снимок: enabled и pulled; запись до M1-19 — без обучения', () => {
    const g = lying();
    const before = viaJson(g.snapshot());
    g.setPull(true);
    const after = viaJson(g.snapshot());
    expect(after.tutorial).toEqual({ enabled: true, pulled: true });

    const a = Game.restore(DATA, CFG, after);
    expect([a.tutorial.enabled, a.tutorial.pulled]).toEqual([true, true]);
    const b = Game.restore(DATA, CFG, before);
    expect(b.tutorial.step(b)).toBe('pull');

    const { tutorial: _t, ...old } = before;
    const o = Game.restore(DATA, CFG, old as GameSnapshot);
    expect(o.tutorial.enabled).toBe(false);
    expect(o.tutorial.step(o)).toBeNull();
  });
});
