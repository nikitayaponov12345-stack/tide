import type { Game } from '../../core/game';
import { screenToWorld, type Layout } from '../layout';
import type { BuildCursor } from './build';
import { Gesture, type PointerInfo } from './gesture';

/**
 * Слой ввода: события указателя на холсте → жест классической схемы или стройка → команды ядра.
 * Работает первый палец (pointerId), второй игнорируется. pointercancel — это onCancel, а не onUp.
 * Жест, нажатие которого пришлось на стройку, ведёт призрак: мышь ставит клетку по отпусканию,
 * палец и перо только переносят призрак (ставит кнопка «Поставить»). Жест, начатый до стройки, доводит Gesture.
 * Сдвиги первого пальца жеста, начатого не в стройке, идут в Gesture.onMove — так палец водит моряка.
 */
export class PointerInput {
  private readonly gesture: Gesture;
  private active: number | null = null;
  /** Активный жест начался в стройке. */
  private building = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly game: Game,
    private readonly layout: () => Layout,
    private readonly cursor: BuildCursor,
    walkDragPx: number,
  ) {
    this.gesture = new Gesture(walkDragPx);
    canvas.addEventListener('pointerdown', (e) => this.down(e));
    canvas.addEventListener('pointermove', (e) => this.move(e));
    canvas.addEventListener('pointerup', (e) => this.end(e, false));
    canvas.addEventListener('pointercancel', (e) => this.end(e, true));
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private info(e: PointerEvent): PointerInfo {
    const rect = this.canvas.getBoundingClientRect();
    const p = screenToWorld(e.clientX - rect.left, e.clientY - rect.top, rect.width, rect.height, this.layout());
    const type = e.pointerType === 'touch' || e.pointerType === 'pen' ? e.pointerType : 'mouse';
    return { x: p.x, y: p.y, type, id: e.pointerId };
  }

  private down(e: PointerEvent): void {
    if (this.active !== null) return;
    this.active = e.pointerId;
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      // указатель уже ушёл — захват не нужен
    }
    this.game.noteTap();
    const p = this.info(e);
    this.building = this.game.build !== null;
    if (this.building) this.cursor.point(p.x, p.y, p.type);
    else this.gesture.onDown(p, this.game);
  }

  /** Мышь ведёт призрак и без нажатия (наведение), палец и перо — пока прижаты. Вне стройки — ходьба пальцем. */
  private move(e: PointerEvent): void {
    if (e.pointerId === this.active && !this.building) this.gesture.onMove(this.info(e), this.game);
    if (this.game.build === null) return;
    const p = this.info(e);
    if (p.type === 'mouse' || (this.building && e.pointerId === this.active)) this.cursor.point(p.x, p.y, p.type);
  }

  private end(e: PointerEvent, cancel: boolean): void {
    if (e.pointerId !== this.active) return;
    this.active = null;
    const p = this.info(e);
    if (this.building) {
      this.building = false;
      if (cancel) return;
      this.cursor.point(p.x, p.y, p.type);
      if (p.type === 'mouse') this.game.placeCell(this.cursor.gx, this.cursor.gy);
      return;
    }
    if (cancel) this.gesture.onCancel(p, this.game);
    else this.gesture.onUp(p, this.game);
  }
}
