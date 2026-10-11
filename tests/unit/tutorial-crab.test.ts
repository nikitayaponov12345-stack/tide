import { describe, expect, it } from 'vitest';
import { STEP_MS } from '../../src/core/clock';
import { Game, type GameConfig } from '../../src/core/game';
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

function steps(g: Game, n: number): void {
  for (let i = 0; i < n; i++) g.step(STEP_MS);
}

/** Партия с обучением после первых шагов: клетка (1, 0), бросок и тяга пройдены. */
function started(cfg: GameConfig = CFG): Game {
  const g = new Game(DATA, cfg);
  expect(g.raft.add(1, 0)).toBe(true);
  g.stats.throws = 1;
  g.tutorial.pulled = true;
  return g;
}

describe('Tutorial: первый краб, ремонт, визит (M1-20)', () => {
  it('краб в круге дальности: мир стоит до первого попадания копья', () => {
    const g = started();
    expect(g.tutorial.step(g)).toBeNull();
    g.debugSpawnEnemy(100, 0);
    expect(g.tutorial.step(g)).toBe('spear_slot');
    expect(g.tutorial.holds(g)).toBe(true);
    const crab = g.enemies.list[0]!;
    const [t0, x0] = [g.world.timeMs, crab.x];
    steps(g, 30);
    expect([g.world.timeMs, crab.x]).toEqual([t0, x0]);

    // Копьё выбрано — рука на крабе, мир по-прежнему стоит.
    expect(g.setWeapon('spear')).toBe(true);
    expect(g.tutorial.step(g)).toBe('spear_aim');
    expect(g.tutorial.holds(g)).toBe(true);
    steps(g, 30);
    expect([g.world.timeMs, crab.x]).toEqual([t0, x0]);

    // Промах: пока копьё летит, мир идёт; вернулось — снова стоит.
    expect(g.throwTo(crab.x, crab.y + 150)).toBe(true);
    expect(g.tutorial.holds(g)).toBe(false);
    run(g, () => g.spear.state !== 'ready');
    expect(g.world.timeMs).toBeGreaterThan(t0);
    expect(g.stats.spearHits).toBe(0);
    expect(g.enemies.list).toContain(crab);
    expect(g.tutorial.step(g)).toBe('spear_aim');
    expect(g.tutorial.holds(g)).toBe(true);

    // Попадание — пауз больше нет.
    g.debugSpawnEnemy(100, 0);
    const target = g.enemies.list[g.enemies.list.length - 1]!;
    expect(g.throwTo(target.x, target.y)).toBe(true);
    run(g, () => g.stats.spearHits === 0 && g.spear.state !== 'ready');
    expect(g.stats.spearHits).toBeGreaterThan(0);
    run(g, () => g.spear.state !== 'ready');
    expect(g.setWeapon('net')).toBe(true);
    g.debugSpawnEnemy(90, 0);
    expect(g.tutorial.holds(g)).toBe(false);
    expect(g.setWeapon('spear')).toBe(true);
    expect(g.tutorial.holds(g)).toBe(false);
    const t1 = g.world.timeMs;
    g.step(STEP_MS);
    expect(g.world.timeMs).toBeGreaterThan(t1);
  });

  it('далёкий краб и партия без обучения — мир не стоит; шаг краба важнее тяги', () => {
    const g = started();
    g.debugSpawnEnemy(-3000, -3000);
    expect(g.tutorial.step(g)).toBeNull();
    expect(g.tutorial.holds(g)).toBe(false);

    const off = started({ ...CFG, tutorial: false });
    off.debugSpawnEnemy(100, 0);
    expect(off.tutorial.holds(off)).toBe(false);

    const p = started();
    p.tutorial.pulled = false;
    expect(p.throwTo(0, 200)).toBe(true);
    run(p, () => p.net.state === 'flying');
    expect(p.tutorial.step(p)).toBe('pull');
    p.debugSpawnEnemy(100, 0);
    expect(p.tutorial.step(p)).toBe('spear_slot');
  });

  it('ремонт: молоток, клетка ремонта до первого нажатия', () => {
    const g = started();
    expect(g.tutorial.step(g)).toBeNull();
    expect(g.debugDamageCell(1, 0, 30)).toBe(30);
    expect(g.tutorial.step(g)).toBe('repair');
    expect(g.tutorial.holds(g)).toBe(false);
    expect(g.setRepair(true)).toBe(true);
    expect(g.tutorial.step(g)).toBe('repair_cell');
    expect(g.repairCell(1, 0)).toBe(true);
    expect(g.tutorial.step(g)).toBeNull();
    g.setRepair(false);
    g.debugDamageCell(1, 0, 30);
    expect(g.tutorial.step(g)).toBeNull();
  });

  it('визит: шхуна до первого удара, на втором визите руки нет', () => {
    const g = started();
    g.debugBossVisit('bottom');
    expect(g.boss.visiting).toBe(true);
    expect(g.tutorial.step(g)).toBe('visit');
    expect(g.tutorial.holds(g)).toBe(false);
    g.stats.bossDamage = 1;
    expect(g.tutorial.step(g)).toBeNull();

    g.stats.bossDamage = 0;
    run(g, () => g.boss.visiting);
    expect(g.boss.visits).toBe(1);
    g.debugBossVisit('bottom');
    expect(g.boss.visiting).toBe(true);
    // Ядра могли разбить клетку — тогда рука на молотке, но не на шхуне.
    expect(g.tutorial.step(g)).not.toBe('visit');
  });
});
