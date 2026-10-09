/** Призрак стройки: клетка под указателем. Состояние слоя ввода, а не ядра. */
export class BuildCursor {
  gx = 0;
  gy = 0;
  shown = false;
  /** Призрак перенесён пальцем или пером: ставит кнопка «Поставить». */
  byTouch = false;

  constructor(private readonly cellPx: number) {}

  /** Клетка сетки под точкой мира (без −0). */
  cellAt(x: number, y: number): { gx: number; gy: number } {
    return { gx: Math.round(x / this.cellPx) || 0, gy: Math.round(y / this.cellPx) || 0 };
  }

  /** Призрак — на клетку под точкой мира. */
  point(x: number, y: number, type: 'mouse' | 'touch' | 'pen'): void {
    const c = this.cellAt(x, y);
    this.gx = c.gx;
    this.gy = c.gy;
    this.shown = true;
    this.byTouch = type !== 'mouse';
  }

  reset(): void {
    this.shown = false;
    this.byTouch = false;
  }
}
