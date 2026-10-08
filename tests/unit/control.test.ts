import { describe, expect, it } from 'vitest';
import { STEP_MS } from '../../src/core/clock';
import { Game } from '../../src/core/game';
import type { TrialSummary } from '../../src/core/stats';
import { DATA } from '../../src/data';
import { Control, schemeFromSearch } from '../../src/game/input/control';

const CFG = { halfW: 640, halfH: 360, speedMult: 1, locationId: 'lagoon', seed: 1 };

function setup(initial: Parameters<typeof schemeFromSearch>[0] = '') {
  const game = new Game(DATA, CFG);
  const calls: string[] = [];
  const summaries: Array<TrialSummary | null> = [];
  const schemes: string[] = [];
  const control = new Control(
    game, DATA,
    { gameplayStart: () => calls.push('start'), gameplayStop: () => calls.push('stop') },
    { scheme: (s) => schemes.push(s.id), summary: (s) => summaries.push(s) },
    schemeFromSearch(initial),
  );
  return { game, control, calls, summaries, schemes };
}

describe('Control', () => {
  it('схема из адреса: регистр не важен, неизвестное — a', () => {
    expect(schemeFromSearch('?scheme=B')).toBe('b');
    expect(schemeFromSearch('?scheme=d&debug=1')).toBe('d');
    expect(schemeFromSearch('?scheme=x')).toBe('a');
    expect(schemeFromSearch('')).toBe('a');
    expect(setup('?scheme=c').control.scheme.id).toBe('c');
  });

  it('проба кончается ровно на trial_ms игрового времени, дальше ядро не шагает', () => {
    const { game, control, calls, summaries } = setup();
    control.notePlay();
    const steps = Math.round(DATA.num('trial_ms') / STEP_MS);
    for (let i = 0; i < steps - 1; i++) control.frame(STEP_MS);
    expect(summaries).toEqual([]);
    expect(control.summaryOpen).toBe(false);
    control.frame(STEP_MS);
    expect(summaries).toHaveLength(1);
    expect(control.summaryOpen).toBe(true);
    expect(game.stats.gameMs).toBeCloseTo(DATA.num('trial_ms'), 6);
    expect(control.trialLeftMs).toBe(0);

    const t = game.world.timeMs;
    for (let i = 0; i < 100; i++) control.frame(STEP_MS * 4);
    control.openSummary();
    control.notePlay();
    expect(game.world.timeMs).toBe(t);
    expect(calls).toEqual(['start', 'stop']);
    expect(summaries).toHaveLength(1);
  });

  it('кнопки сводки начинают пробу заново: «Ещё раз» — та же схема, вторая — следующая', () => {
    const { game, control, calls, summaries, schemes } = setup('?scheme=b');
    control.frame(STEP_MS * 5);
    control.openSummary();
    expect(calls).toEqual([]);   // игра ещё не шла — gameplayStop не нужен
    control.restart();
    expect(control.scheme.id).toBe('b');
    expect(summaries).toEqual([expect.anything(), null]);
    expect(calls).toEqual(['start']);
    expect(game.stats.gameMs).toBe(0);

    control.openSummary();
    control.next();
    expect(control.scheme.id).toBe('c');
    expect(schemes).toEqual(['b', 'c']);
    expect(calls).toEqual(['start', 'stop', 'start']);
    control.frame(STEP_MS);
    expect(game.stats.gameMs).toBeCloseTo(STEP_MS);
  });
});
