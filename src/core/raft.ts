import type { Tables } from './data/tables';

export interface Cell { gx: number; gy: number }   // координаты сетки; (0, 0) — клетка моряка

/** Плот: клетки сетки. В M0-02 — только клетка моряка, стройка — M0-05. */
export class Raft {
  readonly cells: Cell[] = [{ gx: 0, gy: 0 }];
  private readonly cellPx: number;

  constructor(data: Tables) {
    this.cellPx = data.num('cell_px');
  }

  /** Центр клетки в координатах мира. */
  cellCenter(c: Cell): { x: number; y: number } {
    return { x: c.gx * this.cellPx, y: c.gy * this.cellPx };
  }

  /** Круг (x, y, r) пересекает квадрат хотя бы одной клетки (касание считается). */
  touches(x: number, y: number, r: number): boolean {
    const h = this.cellPx / 2;
    for (const c of this.cells) {
      const { x: cx, y: cy } = this.cellCenter(c);
      const nx = Math.max(cx - h, Math.min(x, cx + h));
      const ny = Math.max(cy - h, Math.min(y, cy + h));
      if (Math.hypot(x - nx, y - ny) <= r) return true;
    }
    return false;
  }
}
