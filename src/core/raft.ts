import type { Tables } from './data/tables';

export interface Cell { gx: number; gy: number }   // координаты сетки; (0, 0) — центральная клетка

/** Плот: клетки сетки. Пока одна центральная клетка, стройка — M0-06. */
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
}
