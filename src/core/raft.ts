import type { Tables } from './data/tables';

export interface Cell { gx: number; gy: number }   // координаты сетки; (0, 0) — центральная клетка

/** Плот: клетки сетки raft_grid × raft_grid вокруг центральной; новая клетка встаёт рядом по стороне. */
export class Raft {
  readonly cells: Cell[] = [{ gx: 0, gy: 0 }];
  /** Половина сетки: |gx|, |gy| ≤ half. */
  readonly half: number;
  private readonly cellPx: number;

  constructor(data: Tables) {
    this.cellPx = data.num('cell_px');
    this.half = (data.num('raft_grid') - 1) / 2;
  }

  /** Центр клетки в координатах мира. */
  cellCenter(c: Cell): { x: number; y: number } {
    return { x: c.gx * this.cellPx, y: c.gy * this.cellPx };
  }

  has(gx: number, gy: number): boolean {
    return this.cells.some((c) => c.gx === gx && c.gy === gy);
  }

  /** В сетке, место свободно, рядом по стороне есть клетка (диагональ не считается). */
  canAdd(gx: number, gy: number): boolean {
    if (!Number.isInteger(gx) || !Number.isInteger(gy)) return false;
    if (Math.abs(gx) > this.half || Math.abs(gy) > this.half) return false;
    if (this.has(gx, gy)) return false;
    return this.has(gx - 1, gy) || this.has(gx + 1, gy) || this.has(gx, gy - 1) || this.has(gx, gy + 1);
  }

  /** Все места для новой клетки: по gy, потом по gx. */
  candidates(): Cell[] {
    const out: Cell[] = [];
    for (let gy = -this.half; gy <= this.half; gy++) {
      for (let gx = -this.half; gx <= this.half; gx++) {
        if (this.canAdd(gx, gy)) out.push({ gx, gy });
      }
    }
    return out;
  }

  add(gx: number, gy: number): boolean {
    if (!this.canAdd(gx, gy)) return false;
    this.cells.push({ gx, gy });
    return true;
  }

  snapshot(): { cells: Cell[] } {
    return { cells: this.cells.map((c) => ({ ...c })) };
  }

  restore(s: { cells: Cell[] }): void {
    this.cells.length = 0;
    for (const c of s.cells) this.cells.push({ gx: c.gx, gy: c.gy });
  }

  /** Целые клетки без постройки. В M0 построек и урона нет — все клетки (центральная тоже, как у оригинала). */
  freeCells(): number {
    return this.cells.length;
  }
}
