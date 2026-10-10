import { describe, expect, it } from 'vitest';
import { STEP_MS } from '../../src/core/clock';
import { Enemies } from '../../src/core/enemies';
import { Game } from '../../src/core/game';
import { Raft } from '../../src/core/raft';
import { Rng } from '../../src/core/rng';
import { Stats } from '../../src/core/stats';
import { World } from '../../src/core/world';
import { DATA } from '../../src/data';

const CFG = { halfW: 640, halfH: 360, speedMult: 1, locationId: 'lagoon', seed: 1 };
const TOWER = 'net_tower';
/** Время прогона врагов: первый враг на первом шаге, дальше — по интервалу. */
const ENEMY_RUN_MS = 61_000;

const ids = (g: Game): string[] => g.window!.cards.map((c) => c.id);

/** Интервал врагов по таблице при числе построек n, мс. */
function intervalMs(n: number): number {
  const s = DATA.num('enemy_interval_base_s') / (1 + DATA.num('enemy_interval_per_building') * n);
  return Math.max(DATA.num('enemy_interval_min_s'), s) * 1000;
}

/** Сколько врагов за ENEMY_RUN_MS шагами STEP_MS: первый на первом шаге, затем за остаток — по одному на интервал (сейчас 3, 4 и 5 при 0, 1 и 2 постройках). */
function expectedEnemies(n: number): number {
  const steps = Math.round(ENEMY_RUN_MS / STEP_MS);
  return 1 + Math.floor(((steps - 1) * STEP_MS) / intervalMs(n) + 1e-9);
}

/** До окна 3-го уровня: окно 2-го — «Плот» на (1, 0). */
function toLevel3(g: Game): void {
  g.debugLevelUp();
  expect(g.takeCard(ids(g).indexOf('raft'))).toBe(true);
  expect(g.placeCell(1, 0)).toBe(true);
  g.debugLevelUp();
  expect(g.window?.level).toBe(3);
}

/** До окна 4-го уровня: окно 3-го — «Плот», если он есть, на buildSpots()[0], иначе первая карточка. */
function toLevel4(g: Game): void {
  toLevel3(g);
  const raft = ids(g).indexOf('raft');
  expect(g.takeCard(raft >= 0 ? raft : 0)).toBe(true);
  if (g.build) {
    const c = g.buildSpots()[0]!;
    expect(g.placeCell(c.gx, c.gy)).toBe(true);
  }
  g.debugLevelUp();
  expect(g.window?.level).toBe(4);
}

/** Взять башню в окне 4-го уровня: открывается стройка. */
function takeTower(g: Game): void {
  toLevel4(g);
  expect(g.takeCard(ids(g).indexOf(TOWER))).toBe(true);
  expect(g.build).toEqual({ card: TOWER });
}

describe('Сетевая башня: окно', () => {
  it('в окне 3-го уровня башни нет, в окне 4-го — есть', () => {
    const g = new Game(DATA, CFG);
    toLevel3(g);
    expect(ids(g)).not.toContain(TOWER);
    const raft = ids(g).indexOf('raft');
    g.takeCard(raft >= 0 ? raft : 0);
    if (g.build) {
      const c = g.buildSpots()[0]!;
      g.placeCell(c.gx, c.gy);
    }
    g.debugLevelUp();
    expect(g.window?.level).toBe(4);
    expect(ids(g)).toContain(TOWER);
  });

  it('в Лагуне из построек предлагается только net_tower', () => {
    const ctx = { freeCells: 3, canAddCell: true, spearOwned: true, has: () => true, bossVisitSeen: true };
    for (let seed = 1; seed <= 20; seed++) {
      const g = new Game(DATA, { ...CFG, seed });
      for (let level = 4; level <= 30; level++) {
        for (const c of g.deck.offer(level, ctx)) {
          const row = g.deck.card(c.id);
          if (row.kind === 'building' || row.kind === 'building_upgrade') expect(row.target, `сид ${seed}, уровень ${level}`).toBe(TOWER);
        }
      }
    }
  });
});

describe('Сетевая башня: стройка', () => {
  it('места — свободные целые клетки, среди них центральная; башня встаёт под моряка', () => {
    const g = new Game(DATA, CFG);
    takeTower(g);
    expect(g.buildSpots()).toEqual(g.raft.buildSpots());
    expect(g.buildSpots()).toContainEqual({ gx: 0, gy: 0 });
    const free = g.raft.freeCells();
    expect(g.canPlace(0, 0)).toBe(true);
    expect(g.placeCell(0, 0)).toBe(true);
    expect(g.raft.cell(0, 0)!.building).toBe(TOWER);
    expect({ gx: g.sailor.gx, gy: g.sailor.gy }).toEqual({ gx: 0, gy: 0 });
    expect(g.raft.freeCells()).toBe(free - 1);
    expect(g.deck.taken(TOWER)).toBe(1);
    expect(g.build).toBeNull();
  });

  it('место для «Плота», разбитая клетка, нет клетки, открытая пауза — false, стройка остаётся', () => {
    const g = new Game(DATA, CFG);
    takeTower(g);
    const spot = g.raft.candidates()[0]!;
    expect(g.placeCell(spot.gx, spot.gy)).toBe(false);
    g.debugDamageCell(1, 0, DATA.num('cell_hp'));
    expect(g.canPlace(1, 0)).toBe(false);
    expect(g.placeCell(1, 0)).toBe(false);
    expect(g.placeCell(g.raft.half + 1, 0)).toBe(false);
    g.setMenu(true);
    expect(g.canPlace(0, 0)).toBe(true);
    expect(g.placeCell(0, 0)).toBe(false);
    expect(g.build).toEqual({ card: TOWER });
    expect(g.raft.buildingCount()).toBe(0);
  });
});

describe('Враги и постройки', () => {
  it('Enemies: интервал по числу построек', () => {
    for (const n of [0, 1, 2]) {
      const world = new World({ halfW: CFG.halfW, halfH: CFG.halfH, speedMult: 1, locationId: 'lagoon', level: 1 }, DATA, new Rng(1));
      const enemies = new Enemies(DATA, 'lagoon', new Rng(3), world, new Stats());
      const raft = new Raft(DATA);
      expect(enemies.intervalMs(n)).toBe(intervalMs(n));
      const steps = Math.round(ENEMY_RUN_MS / STEP_MS);
      for (let i = 0; i < steps; i++) {
        enemies.step(STEP_MS, { raft, level: 1, ready: true, buildings: n });
        if (i === 0) expect(enemies.spawned, `${n} построек: первый шаг`).toBe(1);
      }
      expect(enemies.spawned, `${n} построек`).toBe(expectedEnemies(n));
    }
  });

  it('Game передаёт врагам число построек', () => {
    const count = (tower: boolean): number => {
      const g = new Game(DATA, CFG);
      expect(g.raft.add(1, 0)).toBe(true);
      g.mediumCaught = true;
      if (tower) expect(g.raft.build(0, 0, TOWER)).toBe(true);
      const steps = Math.round(ENEMY_RUN_MS / STEP_MS);
      for (let i = 0; i < steps; i++) g.step(STEP_MS);
      return g.enemies.spawned;
    };
    expect(count(false)).toBe(expectedEnemies(0));
    expect(count(true)).toBe(expectedEnemies(1));
  });
});
