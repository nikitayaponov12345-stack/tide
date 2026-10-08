import { mkdirSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { STEP_MS } from '../../src/core/clock';
import { Game } from '../../src/core/game';
import { DATA } from '../../src/data';

const CFG = { halfW: 640, halfH: 360, speedMult: 1, locationId: 'lagoon', seed: 1 };
const NO_AUTO = { autoPullAfterMs: null };
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
    g.throwTo(target.x, target.y, NO_AUTO);
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
        if (t) g.throwTo(t.x, t.y, NO_AUTO);
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

/** Шаги, пока сеть летит. */
function land(g: Game): void {
  while (g.net.state === 'flying') g.step(STEP_MS);
}

describe('Game.resetTrial', () => {
  it('посреди пробы на 3-м уровне: всё с начала, поле засеяно по 1 уровню', () => {
    const g = new Game(DATA, CFG);
    const seededAtStart = g.world.seeded;
    g.setLevel(3);
    const target = nearest(g)!;
    g.throwTo(target.x, target.y, NO_AUTO);
    land(g);
    g.setPull(true);
    while (g.net.state !== 'ready') g.step(STEP_MS);
    // второй бросок — сразу, пока значки первого летят: сеть в воде с уловом
    const next = nearest(g)!;
    g.throwTo(next.x, next.y, NO_AUTO);
    land(g);
    g.setPull(true);
    g.noteTap();
    expect(g.net.state).not.toBe('ready');
    expect(g.net.caught.length).toBeGreaterThan(0);
    expect(g.progression.icons.length).toBeGreaterThan(0);
    expect(g.progression.level).toBe(3);

    g.resetTrial();
    expect(g.progression.level).toBe(1);
    expect(g.progression.xp).toBe(0);
    expect(g.progression.icons).toEqual([]);
    expect(g.progression.levelUps).toEqual([]);
    expect(g.world.level).toBe(1);
    expect(g.world.seeded).toBe(seededAtStart);
    expect(g.world.items.length).toBe(seededAtStart);
    expect(g.world.spawned).toBe(0);
    expect(g.net.state).toBe('ready');
    expect([g.net.x, g.net.y, g.net.caught.length]).toEqual([0, 0, 0]);
    expect({ ...g.stats }).toEqual({ throws: 0, emptyThrows: 0, itemsCaught: 0, xpGained: 0, taps: 0, gameMs: 0 });
    // удержание сброшено: новый бросок ложится, а не тянется
    g.throwTo(100, 0, NO_AUTO);
    land(g);
    expect(g.net.state).toBe('lying');
  });
});
