import { TIME_EPS } from './clock';
import type { GenericRow, Tables } from './data/tables';
import type { CaughtItem } from './net';
import { isIntact, type Raft, type Spot } from './raft';
import type { Rng } from './rng';
import type { Stats } from './stats';
import type { World } from './world';

export const NET_TOWER = 'net_tower';

export type TowerNetState = 'ready' | 'flying' | 'pulling';
/** Сеть башни: у башни (ready, отдыхает restMs), летит к (toX, toY) или тянется к башне с уловом. */
export interface TowerNet { state: TowerNetState; x: number; y: number; toX: number; toY: number; restMs: number; caught: CaughtItem[] }
/** Башня на клетке (gx, gy) и её сети. */
export interface Tower { gx: number; gy: number; nets: TowerNet[] }
export interface TowersSnapshot { list: Tower[]; pauseMs: number; rng: number }

/** Число из ячейки общей таблицы buildings.csv; пусто или не число → throw. */
function cellNum(row: GenericRow, key: string): number {
  const v = Number(row[key]);
  if (row[key] === undefined || row[key] === '' || !Number.isFinite(v)) {
    throw new Error(`buildings.csv: ${row.id} ярус ${row.tier}: ${key} «${row[key] ?? ''}» — не число`);
  }
  return v;
}

/**
 * Сетевые башни плота: каждая сеть, отдохнув pauseMs у башни, летит в случайный предмет в радиусе radius
 * от клетки башни, ловит до capacity предметов и тянется назад со скоростью pull / (1 + вес).
 * Башня на разбитой клетке новых бросков не делает; сеть в воде возвращается.
 */
export class Towers {
  readonly list: Tower[] = [];
  /** Отдых сети после возврата, мс; меняет «Сетевая башня быстрее». */
  pauseMs: number;
  readonly radius: number;
  readonly netRadius: number;
  readonly capacity: number;
  private readonly nets: number;
  private readonly pull: number;
  private readonly flightSpeed: number;
  private readonly pullMin: number;
  private readonly pullMax: number;

  constructor(
    data: Tables,
    locationId: string,
    private readonly rng: Rng,
    private readonly stats: Stats,
  ) {
    const rows = data.buildings.filter((r) => r.id === NET_TOWER);
    if (rows.length === 0) throw new Error(`buildings.csv: нет постройки ${NET_TOWER}`);
    const tier = data.location(locationId).order - data.location(rows[0]!.intro_location!).order + 1;
    const row = rows.find((r) => Number(r.tier) === tier);
    if (!row) throw new Error(`buildings.csv: нет яруса ${tier} постройки ${NET_TOWER} (локация ${locationId})`);
    this.radius = cellNum(row, 'radius');
    this.pauseMs = cellNum(row, 'pause_s') * 1000;
    this.nets = cellNum(row, 'nets');
    this.netRadius = cellNum(row, 'net_radius');
    this.capacity = cellNum(row, 'net_capacity');
    this.pull = cellNum(row, 'pull');
    this.flightSpeed = data.num('tower_net_flight_speed');
    this.pullMin = data.num('net_pull_min');
    this.pullMax = data.num('net_pull_max');
  }

  /** Башня каждой клетке с сетевой башней, где её ещё нет: сети готовы, в центре клетки; в порядке raft.cells. */
  sync(raft: Raft): void {
    for (const c of raft.cells) {
      if (c.building !== NET_TOWER || this.list.some((t) => t.gx === c.gx && t.gy === c.gy)) continue;
      const { x, y } = raft.cellCenter(c);
      const nets: TowerNet[] = [];
      for (let i = 0; i < this.nets; i++) nets.push({ state: 'ready', x, y, toX: x, toY: y, restMs: 0, caught: [] });
      this.list.push({ gx: c.gx, gy: c.gy, nets });
    }
  }

  /** Скорость тяги сети с её уловом, точек в секунду. */
  pullSpeed(net: TowerNet): number {
    const v = this.pull / (1 + net.caught.reduce((s, it) => s + it.weight, 0));
    return Math.min(this.pullMax, Math.max(this.pullMin, v));
  }

  /** Шаг башен по очереди: сначала сети башни (полёт, тяга, отдых), потом её броски. Ответ — улов, вернувшийся к башням. */
  step(dtMs: number, world: World, raft: Raft): CaughtItem[] {
    const out: CaughtItem[] = [];
    const dt = dtMs / 1000;
    for (const t of this.list) {
      const home = raft.cellCenter(t);
      for (const n of t.nets) {
        if (n.state === 'flying') {
          if (moveTo(n, n.toX, n.toY, this.flightSpeed * dt)) {
            n.state = 'pulling';
            this.catchItems(n, world);
          }
        } else if (n.state === 'pulling') {
          const arrived = moveTo(n, home.x, home.y, this.pullSpeed(n) * dt);
          this.catchItems(n, world);
          if (arrived) {
            out.push(...n.caught);
            n.caught = [];
            n.state = 'ready';
            n.restMs = this.pauseMs;
          }
        } else {
          n.restMs = Math.max(0, n.restMs - dtMs);
        }
      }
      const cell = raft.cell(t.gx, t.gy);
      if (cell && isIntact(cell)) this.throwNets(t, home, world);
    }
    return out;
  }

  snapshot(): TowersSnapshot {
    return { list: this.list.map(copyTower), pauseMs: this.pauseMs, rng: this.rng.getState() };
  }

  restore(s: TowersSnapshot): void {
    this.list.length = 0;
    for (const t of s.list) this.list.push(copyTower(t));
    this.pauseMs = s.pauseMs;
    this.rng.setState(s.rng);
  }

  /** Готовые сети башни — в случайные предметы в радиусе; предметов нет — броска нет. */
  private throwNets(t: Tower, home: { x: number; y: number }, world: World): void {
    for (const n of t.nets) {
      if (n.state !== 'ready' || n.restMs > TIME_EPS) continue;
      const near = world.items.filter((it) => Math.hypot(it.x - home.x, it.y - home.y) <= this.radius);
      if (near.length === 0) return;
      const it = near[this.rng.int(0, near.length - 1)]!;
      n.x = home.x;
      n.y = home.y;
      n.toX = it.x;
      n.toY = it.y;
      n.state = 'flying';
      this.stats.towerThrows++;
    }
  }

  /** Ловля, как у сети моряка: ближе netRadius + радиус предмета, пока улов меньше capacity. */
  private catchItems(n: TowerNet, world: World): void {
    if (n.caught.length >= this.capacity) return;
    const ids: number[] = [];
    for (const it of world.items) {
      if (n.caught.length + ids.length >= this.capacity) break;
      if (Math.hypot(it.x - n.x, it.y - n.y) < this.netRadius + it.radius) ids.push(it.id);
    }
    for (const id of ids) {
      const it = world.removeItem(id);
      if (it) n.caught.push({ kind: it.kind, role: it.role, xp: it.xp, weight: it.weight, x: it.x, y: it.y });
    }
  }
}

/** Сдвиг точки к (tx, ty) не дальше dist; true — дошла. */
function moveTo(p: { x: number; y: number }, tx: number, ty: number, dist: number): boolean {
  const dx = tx - p.x;
  const dy = ty - p.y;
  const len = Math.hypot(dx, dy);
  if (len <= dist) {
    p.x = tx;
    p.y = ty;
    return true;
  }
  p.x += (dx / len) * dist;
  p.y += (dy / len) * dist;
  return false;
}

function copyTower(t: Spot & { nets: TowerNet[] }): Tower {
  return { gx: t.gx, gy: t.gy, nets: t.nets.map((n) => ({ ...n, caught: n.caught.map((it) => ({ ...it })) })) };
}
