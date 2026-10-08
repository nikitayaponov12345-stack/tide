import { describe, expect, it } from 'vitest';
import { FixedStep, STEP_MS } from '../../src/core/clock';

function run(frameMs: number, totalMs: number): { steps: number; gameMs: number } {
  const clock = new FixedStep();
  let steps = 0;
  let gameMs = 0;
  for (let t = 0; t < totalMs - 1e-6; t += frameMs) {
    steps += clock.advance(frameMs, (dt) => {
      gameMs += dt;
    });
  }
  return { steps, gameMs };
}

describe('FixedStep', () => {
  it('за секунду выполняет 60 шагов при любой частоте кадров', () => {
    for (const fps of [30, 60, 120, 144]) {
      const { steps } = run(1000 / fps, 1000);
      expect(Math.abs(steps - 60)).toBeLessThanOrEqual(1);
    }
  });

  it('шаг всегда одной длины', () => {
    const clock = new FixedStep();
    const seen = new Set<number>();
    clock.advance(1000 / 7, (dt) => seen.add(dt));
    expect([...seen]).toEqual([STEP_MS]);
  });

  it('долгий кадр обрезается до предела шагов, без рывка потом', () => {
    const clock = new FixedStep(STEP_MS, 8);
    expect(clock.advance(5000, () => {})).toBe(8);
    expect(clock.advance(STEP_MS, () => {})).toBe(1);
  });

  it('нулевой и отрицательный кадр ничего не делают', () => {
    const clock = new FixedStep();
    expect(clock.advance(0, () => {})).toBe(0);
    expect(clock.advance(-5, () => {})).toBe(0);
  });
});
