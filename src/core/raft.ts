import type { Tables } from './data/tables';

/** Место сетки; (0, 0) — центральная клетка. */
export interface Spot { gx: number; gy: number }
/** Клетка плота: место и прочность. */
export interface Cell extends Spot { hp: number }
/** Степень вида клетки по четвертям прочности: 0 — больше трёх четвертей, 4 — разбита. */
export type CellStage = 0 | 1 | 2 | 3 | 4;

/** Клетка цела: прочность больше 0. */
export function isIntact(c: Cell): boolean {
  return c.hp > 0;
}

/** Плот: клетки сетки raft_grid × raft_grid вокруг центральной; новая клетка встаёт рядом по стороне. */
export class Raft {
  readonly cells: Cell[];
  /** Половина сетки: |gx|, |gy| ≤ half. */
  readonly half: number;
  /** Прочность целой клетки. */
  readonly cellHp: number;
  private readonly cellPx: number;

  constructor(data: Tables) {
    this.cellPx = data.num('cell_px');
    this.half = (data.num('raft_grid') - 1) / 2;
    this.cellHp = data.num('cell_hp');
    this.cells = [{ gx: 0, gy: 0, hp: this.cellHp }];
  }

  /** Центр клетки в координатах мира. */
  cellCenter(c: Spot): { x: number; y: number } {
    return { x: c.gx * this.cellPx, y: c.gy * this.cellPx };
  }

  has(gx: number, gy: number): boolean {
    return this.cell(gx, gy) !== undefined;
  }

  cell(gx: number, gy: number): Cell | undefined {
    return this.cells.find((c) => c.gx === gx && c.gy === gy);
  }

  /** Урон клетке: не ниже 0; ответ — сколько снято. Центральная неуязвима; нет клетки или amount ≤ 0 — 0. */
  damage(gx: number, gy: number, amount: number): number {
    const c = this.cell(gx, gy);
    if (!c || (gx === 0 && gy === 0) || !(amount > 0)) return 0;
    const dealt = Math.min(amount, c.hp);
    c.hp -= dealt;
    return dealt;
  }

  /** Ремонт клетки: прибавить прочность, не выше cellHp; ответ — сколько прибавлено. Прочность полная, нет клетки или amount ≤ 0 — 0. */
  repair(gx: number, gy: number, amount: number): number {
    const c = this.cell(gx, gy);
    if (!c || !(amount > 0)) return 0;
    const added = Math.min(amount, this.cellHp - c.hp);
    if (!(added > 0)) return 0;
    c.hp += added;
    return added;
  }

  /** Есть клетка с прочностью меньше полной. */
  damaged(): boolean {
    return this.cells.some((c) => c.hp < this.cellHp);
  }

  /** Степень вида: по четвертям cellHp. */
  stage(c: Cell): CellStage {
    if (c.hp > (this.cellHp * 3) / 4) return 0;
    if (c.hp > this.cellHp / 2) return 1;
    if (c.hp > this.cellHp / 4) return 2;
    if (c.hp > 0) return 3;
    return 4;
  }

  /** В сетке, место свободно, рядом по стороне есть клетка (диагональ не считается; разбитая тоже считается). */
  canAdd(gx: number, gy: number): boolean {
    if (!Number.isInteger(gx) || !Number.isInteger(gy)) return false;
    if (Math.abs(gx) > this.half || Math.abs(gy) > this.half) return false;
    if (this.has(gx, gy)) return false;
    return this.has(gx - 1, gy) || this.has(gx + 1, gy) || this.has(gx, gy - 1) || this.has(gx, gy + 1);
  }

  /** Все места для новой клетки: по gy, потом по gx. */
  candidates(): Spot[] {
    const out: Spot[] = [];
    for (let gy = -this.half; gy <= this.half; gy++) {
      for (let gx = -this.half; gx <= this.half; gx++) {
        if (this.canAdd(gx, gy)) out.push({ gx, gy });
      }
    }
    return out;
  }

  add(gx: number, gy: number): boolean {
    if (!this.canAdd(gx, gy)) return false;
    this.cells.push({ gx, gy, hp: this.cellHp });
    return true;
  }

  snapshot(): { cells: Cell[] } {
    return { cells: this.cells.map((c) => ({ ...c })) };
  }

  /** Клетка без hp (запись до M1-03) — целая. */
  restore(s: { cells: Array<Spot & { hp?: number }> }): void {
    this.cells.length = 0;
    for (const c of s.cells) this.cells.push({ gx: c.gx, gy: c.gy, hp: c.hp ?? this.cellHp });
  }

  /** Целые клетки без постройки. Построек пока нет — все целые (центральная тоже, как у оригинала). */
  freeCells(): number {
    return this.cells.filter(isIntact).length;
  }
}
