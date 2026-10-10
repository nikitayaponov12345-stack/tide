import { describe, expect, it } from 'vitest';
import { FixedStep, STEP_MS } from '../../src/core/clock';
import type { DeckContext } from '../../src/core/deck';
import { Game } from '../../src/core/game';
import { Raft } from '../../src/core/raft';
import { Rng } from '../../src/core/rng';
import { Stats } from '../../src/core/stats';
import { NET_TOWER, Towers, type TowerNet } from '../../src/core/towers';
import { World, type Item } from '../../src/core/world';
import { DATA } from '../../src/data';

const CFG = { halfW: 640, halfH: 360, speedMult: 1, locationId: 'lagoon', seed: 1 };
const TIER1 = DATA.buildings.find((r) => r.id === NET_TOWER && Number(r.tier) === 1)!;
const RADIUS = Number(TIER1.radius);
const PAUSE_MS = Number(TIER1.pause_s) * 1000;
const CAPACITY = Number(TIER1.net_capacity);
const CELL = DATA.num('cell_px');
const FASTER = DATA.cards.find((c) => c.id === 'net_tower_faster')!;
/** Предел шагов циклов: синхронный бесконечный цикл Vitest не прерывает. */
const MAX_STEPS = 20_000;

/** Пустое море и плот с башней на (gx, gy); мир не шагает, предметы кладёт тест. */
function setup(seed = 1, gx = 0, gy = 0): { towers: Towers; world: World; raft: Raft; stats: Stats } {
  const world = new World({ halfW: 640, halfH: 360, speedMult: 1, locationId: 'lagoon', level: 1 }, DATA, new Rng(1));
  world.items.length = 0;
  const raft = new Raft(DATA);
  if (gx !== 0 || gy !== 0) expect(raft.add(gx, gy)).toBe(true);
  expect(raft.build(gx, gy, NET_TOWER)).toBe(true);
  const stats = new Stats();
  const towers = new Towers(DATA, 'lagoon', new Rng(seed), stats);
  towers.sync(raft);
  return { towers, world, raft, stats };
}

let nextId = 1000;
function put(world: World, kind: string, x: number, y: number): Item {
  const row = DATA.item(kind);
  const it: Item = { id: nextId++, kind, role: row.role, xp: row.xp, x, y, radius: row.radius, weight: row.weight, speed: 1, phase: 0 };
  world.items.push(it);
  return it;
}

const net = (s: ReturnType<typeof setup>): TowerNet => s.towers.list[0]!.nets[0]!;
const step = (s: ReturnType<typeof setup>) => s.towers.step(STEP_MS, s.world, s.raft);

/** Шагать до возврата сети; вернуть улов. */
function untilReturn(s: ReturnType<typeof setup>): ReturnType<typeof step> {
  for (let i = 0; i < MAX_STEPS; i++) {
    const out = step(s);
    if (net(s).state === 'ready') return out;
  }
  throw new Error('сеть не вернулась');
}

const ctx = (g: Game): DeckContext => ({
  freeCells: g.raft.freeCells(), canAddCell: g.raft.candidates().length > 0, has: (b) => g.raft.hasBuilding(b), spearOwned: false, bossVisitSeen: false,
});
/** Первое из окон 5–12 уровня, где есть «Сетевая башня быстрее»; с open — оно же открыто в игре. Нет такого — false. */
function offersFaster(g: Game, open = false): boolean {
  for (let level = 5; level <= 12; level++) {
    const cards = g.deck.offer(level, ctx(g));
    if (!cards.some((c) => c.id === FASTER.id)) continue;
    if (open) g.window = { level, cards };
    return true;
  }
  return false;
}

describe('Towers', () => {
  it('ярус 1 Лагуны — из buildings.csv; у новой башни сеть готова в центре клетки, restMs 0', () => {
    const s = setup();
    expect(s.towers.radius).toBe(RADIUS);
    expect(s.towers.pauseMs).toBe(PAUSE_MS);
    expect(s.towers.capacity).toBe(CAPACITY);
    expect(s.towers.netRadius).toBe(Number(TIER1.net_radius));
    expect(s.towers.list).toHaveLength(1);
    expect(s.towers.list[0]!.nets).toHaveLength(Number(TIER1.nets));
    expect(net(s)).toMatchObject({ state: 'ready', x: 0, y: 0, restMs: 0, caught: [] });
    s.towers.sync(s.raft);
    expect(s.towers.list).toHaveLength(1);
  });

  it('бросок — в предмет в радиусе; вне радиуса и без предметов броска нет', () => {
    const s = setup();
    step(s);
    expect(s.stats.towerThrows).toBe(0);
    put(s.world, 'branch', RADIUS + 1, 0);
    step(s);
    expect(s.stats.towerThrows).toBe(0);
    expect(net(s).state).toBe('ready');
    const it = put(s.world, 'branch', 0, RADIUS - 1);
    step(s);
    expect(s.stats.towerThrows).toBe(1);
    expect(net(s)).toMatchObject({ state: 'flying', x: 0, y: 0, toX: it.x, toY: it.y });
  });

  it('цель случайная: за 30 сидов каждый из трёх предметов в радиусе хоть раз цель', () => {
    const hit = new Set<number>();
    for (let seed = 1; seed <= 30; seed++) {
      const s = setup(seed);
      const items = [put(s.world, 'branch', 100, 0), put(s.world, 'branch', -100, 0), put(s.world, 'branch', 0, 100)];
      step(s);
      hit.add(items.findIndex((it) => it.x === net(s).toX && it.y === net(s).toY));
    }
    expect([...hit].sort()).toEqual([0, 1, 2]);
  });

  it('улов не больше capacity; тяга — pullSpeed за шаг', () => {
    const s = setup();
    for (let i = 0; i < CAPACITY + 2; i++) put(s.world, 'branch', 120, 0);
    step(s);
    while (net(s).state === 'flying') step(s);
    const n = net(s);
    expect(n.state).toBe('pulling');
    expect(n.caught).toHaveLength(CAPACITY);
    expect(s.world.items).toHaveLength(2);
    const v = s.towers.pullSpeed(n);
    expect(v).toBeCloseTo(Number(TIER1.pull) / (1 + CAPACITY * DATA.item('branch').weight), 9);
    const x0 = n.x;
    step(s);
    expect(x0 - n.x).toBeCloseTo((v * STEP_MS) / 1000, 9);
  });

  it('возврат: улов отдан, сеть в центре, отдых pauseMs; бросок — через round(pauseMs / STEP_MS) шагов', () => {
    const s = setup();
    put(s.world, 'branch', 100, 0);
    step(s);
    const out = untilReturn(s);
    expect(out).toHaveLength(1);
    expect(net(s)).toMatchObject({ state: 'ready', x: 0, y: 0, restMs: PAUSE_MS, caught: [] });
    put(s.world, 'branch', 100, 0);
    const wait = Math.round(PAUSE_MS / STEP_MS) - 1;
    for (let i = 0; i < wait; i++) step(s);
    expect(s.stats.towerThrows).toBe(1);
    step(s);
    expect(s.stats.towerThrows).toBe(2);
  });

  it('башня на разбитой клетке: сеть возвращается с уловом, новых бросков нет; после ремонта — снова бросок', () => {
    const s = setup(1, 1, 0);
    put(s.world, 'branch', CELL + 100, 0);
    step(s);
    expect(s.stats.towerThrows).toBe(1);
    s.raft.damage(1, 0, DATA.num('cell_hp'));
    expect(untilReturn(s)).toHaveLength(1);
    expect(net(s)).toMatchObject({ x: CELL, y: 0 });
    put(s.world, 'branch', CELL + 100, 0);
    for (let i = 0; i < 3 * Math.round(PAUSE_MS / STEP_MS); i++) step(s);
    expect(s.stats.towerThrows).toBe(1);
    s.raft.repair(1, 0, DATA.num('cell_hp'));
    step(s);
    expect(s.stats.towerThrows).toBe(2);
  });

  it('в игре: улов башни даёт значки, моряк не бросает', () => {
    const g = new Game(DATA, CFG);
    g.raft.build(0, 0, NET_TOWER);
    g.towers.sync(g.raft);
    const steps = Math.round(120_000 / STEP_MS);
    for (let i = 0; i < steps && g.stats.towerCaught === 0; i++) {
      expect(g.paused).toBe(false);
      g.step(STEP_MS);
    }
    expect(g.stats.towerCaught).toBeGreaterThan(0);
    expect(g.progression.icons).toHaveLength(g.stats.towerCaught);
    expect(g.stats.itemsCaught).toBe(0);
    expect(g.stats.throws).toBe(0);
  });

  it('«Сетевая башня быстрее»: только с башней; отдых всех башен × (1 + value), до предела', () => {
    const g = new Game(DATA, CFG);
    expect(offersFaster(g)).toBe(false);
    expect(g.raft.add(1, 0)).toBe(true);
    g.raft.build(0, 0, NET_TOWER);
    g.raft.build(1, 0, NET_TOWER);
    g.towers.sync(g.raft);
    expect(g.towers.list).toHaveLength(2);
    const max = FASTER.maxPerLocation!;
    for (let i = 1; i <= max; i++) {
      expect(offersFaster(g, true)).toBe(true);
      const at = g.window!.cards.findIndex((c) => c.id === FASTER.id);
      expect(at).toBeGreaterThanOrEqual(0);
      expect(g.takeCard(at)).toBe(true);
      expect(g.towers.pauseMs).toBeCloseTo(PAUSE_MS * (1 + FASTER.value!) ** i, 9);
    }
    expect(offersFaster(g)).toBe(false);
  });

  it('30, 60 и 144 кадров в секунду: после 1200 шагов ядра — одни и те же башни и улов', () => {
    const run = (fps: number) => {
      const g = new Game(DATA, CFG);
      g.raft.build(0, 0, NET_TOWER);
      g.towers.sync(g.raft);
      const clock = new FixedStep(STEP_MS, 1000);
      let steps = 0;
      while (steps < 1200) {
        clock.advance(1000 / fps, (dt) => {
          if (steps < 1200 && !g.paused) g.step(dt);
          steps++;
        });
      }
      return { towers: g.towers.snapshot(), caught: g.stats.towerCaught, throws: g.stats.towerThrows };
    };
    const base = run(60);
    expect(base.throws).toBeGreaterThan(0);
    expect(run(30)).toEqual(base);
    expect(run(144)).toEqual(base);
  });
});
