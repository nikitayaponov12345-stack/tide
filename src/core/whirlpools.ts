import type { Tables } from './data/tables';
import type { CaughtItem } from './net';
import { isIntact, type Raft, type Spot } from './raft';
import { cellNum, tierRow } from './towers';
import type { World } from './world';

export const WHIRLPOOL = 'whirlpool';

/** Воронка на клетке (gx, gy). */
export type Whirlpool = Spot;
export interface WhirlpoolsSnapshot { radius: number }

/**
 * Воронки плота (GDD, «Плот и постройки»): каждый предмет в воде ближе radius к центру клетки воронки
 * сдвигается к нему со скоростью pullSpeed × (1 − d / radius); центр предмета в квадрате клетки — пойман.
 * Предела улова нет. Воронка на разбитой клетке не тянет. Случайности нет.
 */
export class Whirlpools {
  readonly list: Whirlpool[] = [];
  /** Радиус втягивания; меняет «Воронка шире». */
  radius: number;
  readonly pullSpeed: number;
  private readonly cellPx: number;

  constructor(data: Tables, locationId: string) {
    const row = tierRow(data, WHIRLPOOL, locationId);
    this.radius = cellNum(row, 'radius');
    this.pullSpeed = cellNum(row, 'pull_speed');
    this.cellPx = data.num('cell_px');
  }

  /** Воронка каждой клетке с воронкой, где её ещё нет; в порядке raft.cells. */
  sync(raft: Raft): void {
    for (const c of raft.cells) {
      if (c.building !== WHIRLPOOL || this.list.some((w) => w.gx === c.gx && w.gy === c.gy)) continue;
      this.list.push({ gx: c.gx, gy: c.gy });
    }
  }

  /** Шаг воронок по очереди: втягивание предметов в радиусе и улов тех, чей центр вошёл в клетку. Ответ — улов. */
  step(dtMs: number, world: World, raft: Raft): CaughtItem[] {
    const out: CaughtItem[] = [];
    const half = this.cellPx / 2;
    for (const w of this.list) {
      const cell = raft.cell(w.gx, w.gy);
      if (!cell || !isIntact(cell)) continue;
      const cx = w.gx * this.cellPx;
      const cy = w.gy * this.cellPx;
      for (const it of world.items.slice()) {
        const dx = cx - it.x;
        const dy = cy - it.y;
        const d = Math.hypot(dx, dy);
        if (d > this.radius) continue;
        if (d > 0) {
          const move = Math.min(d, (this.pullSpeed * (1 - d / this.radius) * dtMs) / 1000);
          it.x += (dx / d) * move;
          it.y += (dy / d) * move;
        }
        if (Math.abs(it.x - cx) > half || Math.abs(it.y - cy) > half) continue;
        world.removeItem(it.id);
        out.push({ kind: it.kind, role: it.role, xp: it.xp, weight: it.weight, x: it.x, y: it.y });
      }
    }
    return out;
  }

  snapshot(): WhirlpoolsSnapshot {
    return { radius: this.radius };
  }

  restore(s: WhirlpoolsSnapshot): void {
    this.radius = s.radius;
  }
}
