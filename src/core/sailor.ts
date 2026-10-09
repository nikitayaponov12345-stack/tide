import type { Tables } from './data/tables';
import type { Raft } from './raft';

/** Моряк: клетка плота и квадрат, которого касается сеть. Начинает в центральной клетке и ходит по плоту. */
export class Sailor {
  gx = 0;
  gy = 0;
  /** Сторона квадрата моряка для сети, по центру его клетки. */
  readonly box: number;
  private readonly cellPx: number;

  constructor(data: Tables) {
    this.box = data.num('sailor_box_px');
    this.cellPx = data.num('cell_px');
  }

  /** Центр клетки моряка в координатах мира. */
  get x(): number {
    return this.gx * this.cellPx;
  }

  get y(): number {
    return this.gy * this.cellPx;
  }

  /** Шаг на соседнюю клетку по стороне; не по стороне или клетки нет → false. */
  move(dx: number, dy: number, raft: Raft): boolean {
    if (Math.abs(dx) + Math.abs(dy) !== 1) return false;
    if (!raft.has(this.gx + dx, this.gy + dy)) return false;
    this.gx += dx;
    this.gy += dy;
    return true;
  }

  snapshot(): { gx: number; gy: number } {
    return { gx: this.gx, gy: this.gy };
  }

  restore(s: { gx: number; gy: number }): void {
    this.gx = s.gx;
    this.gy = s.gy;
  }

  /** Круг (x, y, r) пересекает квадрат моряка (касание считается). */
  touches(x: number, y: number, r: number): boolean {
    const h = this.box / 2;
    const nx = Math.max(this.x - h, Math.min(x, this.x + h));
    const ny = Math.max(this.y - h, Math.min(y, this.y + h));
    return Math.hypot(x - nx, y - ny) <= r;
  }
}
