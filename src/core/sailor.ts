import type { Tables } from './data/tables';

/** Моряк: клетка плота и квадрат, которого касается сеть. Пока стоит в центральной клетке; шаг — M0-07. */
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

  /** Круг (x, y, r) пересекает квадрат моряка (касание считается). */
  touches(x: number, y: number, r: number): boolean {
    const h = this.box / 2;
    const nx = Math.max(this.x - h, Math.min(x, this.x + h));
    const ny = Math.max(this.y - h, Math.min(y, this.y + h));
    return Math.hypot(x - nx, y - ny) <= r;
  }
}
