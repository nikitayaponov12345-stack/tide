import { mkdirSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { STEP_MS } from '../../src/core/clock';
import { Game } from '../../src/core/game';
import { DATA } from '../../src/data';

const CFG = { halfW: 640, halfH: 360, speedMult: 1, locationId: 'lagoon', seed: 1 };
/** «Рука» теста: удержание через столько после падения сети. */
const HAND_PULL_DELAY_MS = 800;

/** Весь опыт, полученный полосой: стоимость пройденных уровней плюс опыт текущего. */
function barXp(g: Game): number {
  const mult = DATA.location(CFG.locationId).xpMult;
  let sum = g.progression.xp;
  for (let l = 2; l <= g.progression.level; l++) sum += DATA.levelStep(l, mult);
  return sum;
}

function nearest(g: Game): { x: number; y: number } | undefined {
  return [...g.world.items].sort((a, b) => Math.hypot(a.x, a.y) - Math.hypot(b.x, b.y))[0];
}

describe('Game', () => {
  it('stats.xpGained растёт по прилёту значков и равен опыту полосы', () => {
    const g = new Game(DATA, CFG);
    const target = nearest(g)!;
    g.throwTo(target.x, target.y);
    while (g.net.state === 'flying') g.step(STEP_MS);
    g.setPull(true);
    while (g.net.state !== 'ready') g.step(STEP_MS);
    const n = g.stats.itemsCaught;
    expect(n).toBeGreaterThan(0);
    expect(g.stats.xpGained).toBe(0);
    const total = g.progression.icons.reduce((s, i) => s + i.xp, 0);
    const back = g.world.timeMs;
    const all = DATA.num('icon_flight_ms') + (n - 1) * DATA.num('icon_interval_ms');
    while (g.world.timeMs + STEP_MS < back + all - 1e-6) g.step(STEP_MS);
    expect(g.stats.xpGained).toBeLessThan(total);
    g.step(STEP_MS);
    expect(g.stats.xpGained).toBe(total);
    expect(barXp(g)).toBe(g.stats.xpGained);
  });

  it('темп: «рука» за 60 с доходит хотя бы до 2 уровня', () => {
    const g = new Game(DATA, CFG);
    let landedMs: number | null = null;
    let level2Ms: number | null = null;
    let levelAt60s = 1;
    while (g.stats.gameMs < 60_000 - 1e-6) {
      if (g.net.state === 'ready') {
        const t = nearest(g);
        if (t) g.throwTo(t.x, t.y);
        landedMs = null;
      } else if (g.net.state !== 'flying') {
        landedMs ??= g.stats.gameMs;
        if (g.stats.gameMs - landedMs >= HAND_PULL_DELAY_MS - 1e-6) g.setPull(true);
      }
      g.step(STEP_MS);
      if (level2Ms === null && g.progression.level >= 2) level2Ms = Math.round(g.stats.gameMs);
      levelAt60s = g.progression.level;
    }
    const probe = {
      seed: CFG.seed, levelAt60s, level2Ms, throws: g.stats.throws, itemsCaught: g.stats.itemsCaught, xpGained: g.stats.xpGained,
    };
    mkdirSync('build/probe', { recursive: true });
    writeFileSync('build/probe/m0-02-game.json', `${JSON.stringify(probe, null, 2)}\n`);
    expect(levelAt60s).toBeGreaterThanOrEqual(2);
  });
});

describe('Game: счётчики', () => {
  it('бросок, повторный бросок в полёте, пустой возврат и нажатие', () => {
    const g = new Game(DATA, CFG);
    g.world.items.length = 0;
    g.noteTap();
    expect(g.throwTo(150, 0)).toBe(true);
    g.step(STEP_MS);
    expect(g.throwTo(-150, 0)).toBe(false);
    while (g.net.state === 'flying') g.step(STEP_MS);
    g.setPull(true);
    while (g.net.state !== 'ready') g.step(STEP_MS);
    const { throws, emptyThrows, itemsCaught, taps, gameMs } = g.stats;
    expect({ throws, emptyThrows, itemsCaught, taps }).toEqual({ throws: 1, emptyThrows: 1, itemsCaught: 0, taps: 1 });
    expect(gameMs).toBe(g.world.timeMs);
  });
});
