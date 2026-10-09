/** Призрак стройки: клетка под указателем. Состояние слоя ввода, а не ядра. */
export class BuildCursor {
  gx = 0;
  gy = 0;
  shown = false;
  /** Призрак перенесён пальцем или пером: ставит кнопка «Поставить». */
  byTouch = false;

  constructor(private readonly cellPx: number) {}

  /** Точка мира → клетка сетки (без −0). */
  point(x: number, y: number, type: 'mouse' | 'touch' | 'pen'): void {
    this.gx = Math.round(x / this.cellPx) || 0;
    this.gy = Math.round(y / this.cellPx) || 0;
    this.shown = true;
    this.byTouch = type !== 'mouse';
  }

  reset(): void {
    this.shown = false;
    this.byTouch = false;
  }
}
