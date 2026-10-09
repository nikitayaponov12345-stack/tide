import { describe, expect, it } from 'vitest';
import { STEP_MS } from '../../src/core/clock';
import { Game } from '../../src/core/game';
import { DATA } from '../../src/data';
import { Control } from '../../src/game/input/control';

const CFG = { halfW: 640, halfH: 360, speedMult: 1, locationId: 'lagoon', seed: 1 };

function setup() {
  const game = new Game(DATA, CFG);
  const calls: string[] = [];
  const control = new Control(game, { gameplayStart: () => calls.push('start') });
  return { game, control, calls };
}

describe('Control', () => {
  it('frame шагает ядро в игровом времени фиксированным шагом', () => {
    const { game, control } = setup();
    control.frame(STEP_MS * 3);
    expect(game.stats.gameMs).toBeCloseTo(STEP_MS * 3, 6);
    expect(game.world.timeMs).toBeCloseTo(STEP_MS * 3, 6);
    control.frame(STEP_MS / 2);
    expect(game.stats.gameMs).toBeCloseTo(STEP_MS * 3, 6);
    control.frame(STEP_MS / 2);
    expect(game.stats.gameMs).toBeCloseTo(STEP_MS * 4, 6);
  });

  it('notePlay: один gameplayStart на два вызова', () => {
    const { control, calls } = setup();
    control.notePlay();
    control.notePlay();
    expect(calls).toEqual(['start']);
  });
});
