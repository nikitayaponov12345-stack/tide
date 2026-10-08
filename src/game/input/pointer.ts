import type { Game } from '../../core/game';
import { screenToWorld, type Layout } from '../layout';
import type { ControlScheme, PointerInfo } from './schemes';

/**
 * Слой ввода: события указателя на холсте → текущая схема управления → команды ядра.
 * Работает первый палец (pointerId), второй игнорируется. pointercancel — это onCancel, а не onUp.
 */
export class PointerInput {
  private active: number | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly game: Game,
    private readonly scheme: () => ControlScheme,
    private readonly layout: () => Layout,
  ) {
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
    this.scheme().onDown(this.info(e), this.game);
  }

  private move(e: PointerEvent): void {
    if (e.pointerId !== this.active) return;
    this.scheme().onMove(this.info(e), this.game);
  }

  private end(e: PointerEvent, cancel: boolean): void {
    if (e.pointerId !== this.active) return;
    this.active = null;
    const p = this.info(e);
    if (cancel) this.scheme().onCancel(p, this.game);
    else this.scheme().onUp(p, this.game);
  }
}
