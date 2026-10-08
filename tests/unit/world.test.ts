import { describe, expect, it } from 'vitest';
import { FixedStep } from '../../src/core/clock';
import { Rng } from '../../src/core/rng';
import { DEFAULT_WORLD, World } from '../../src/core/world';

/** Прогнать мир через FixedStep кадрами заданной частоты. */
function simulate(fps: number, seconds: number, seed = 1): World {
  const world = new World(DEFAULT_WORLD, new Rng(seed));
  const clock = new FixedStep();
  const frame = 1000 / fps;
  for (let t = 0; t < seconds * 1000 - 1e-6; t += frame) clock.advance(frame, (dt) => world.step(dt));
  return world;
}

describe('World (заглушка этапа 0)', () => {
  it('число появившихся предметов не зависит от частоты кадров', () => {
    const counts = [30, 60, 144].map((fps) => simulate(fps, 10).spawned);
    expect(counts).toEqual([10, 10, 10]); // один предмет в секунду игрового времени
  });

  it('за один долгий шаг появляется столько предметов, сколько положено по времени', () => {
    const world = new World(DEFAULT_WORLD, new Rng(1));
    world.step(5000);
    expect(world.spawned).toBe(5);
  });

  it('одинаковый сид — одинаковое поле', () => {
    const a = simulate(60, 20, 5);
    const b = simulate(60, 20, 5);
    expect(a.items).toEqual(b.items);
  });

  it('предметы плывут по течению и уходят за край', () => {
    const world = simulate(60, 120);
    expect(world.spawned).toBe(120);
    expect(world.items.length).toBeLessThan(world.spawned);
    const { width: w, height: h } = world.config;
    for (const it of world.items) {
      expect(it.x).toBeGreaterThanOrEqual(-60);
      expect(it.x).toBeLessThanOrEqual(w + 60);
      expect(it.y).toBeGreaterThanOrEqual(-60);
      expect(it.y).toBeLessThanOrEqual(h + 60);
    }
  });

  it('предмет появляется за краем, откуда идёт течение', () => {
    const world = new World(DEFAULT_WORLD, new Rng(3));
    world.step(DEFAULT_WORLD.spawnIntervalMs);
    expect(world.items.length).toBe(1);
    const it = world.items[0]!;
    const fromRight = it.x > world.config.width;
    const fromTop = it.y < 0;
    expect(fromRight || fromTop).toBe(true); // течение (−1, 1): справа налево и сверху вниз
  });
});
