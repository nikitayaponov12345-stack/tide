import type { NetState } from '../../core/net';

export interface PointerInfo { x: number; y: number; type: 'mouse' | 'touch' | 'pen'; id: number }   // x, y — координаты мира

/** То, что жест видит у игры: состояние сети и команды ядра. Game подходит как есть; тесты подают подделку. */
export interface GestureGame {
  readonly net: { readonly state: NetState };
  throwTo(x: number, y: number): boolean;
  setPull(on: boolean): void;
}

/**
 * Классическая схема, как в оригинале: мышь бросает сеть по нажатию, касание и перо — по отпусканию
 * (если жест начался при ready и сеть всё ещё ready); когда сеть в воде, нажатие включает удержание, отпускание выключает.
 * Жест ведёт первый палец: до его up или cancel события других пальцев не дают команд
 * (pointer.ts фильтрует так же; здесь — чтобы жест вёл себя одинаково и под ботом). cancel никогда не бросает.
 */
export class Gesture {
  private finger: number | null = null;
  private fromReady = false;

  onDown(p: PointerInfo, g: GestureGame): void {
    if (this.finger !== null) return;
    this.finger = p.id;
    this.fromReady = false;
    if (g.net.state === 'ready') {
      if (p.type === 'mouse') g.throwTo(p.x, p.y);
      else this.fromReady = true;
    } else {
      g.setPull(true);
    }
  }

  onUp(p: PointerInfo, g: GestureGame): void {
    if (p.id !== this.finger) return;
    this.finger = null;
    if (p.type !== 'mouse' && this.fromReady && g.net.state === 'ready') g.throwTo(p.x, p.y);
    this.fromReady = false;
    g.setPull(false);
  }

  /** Палец ушёл (системный жест, вызов): удержание выключено, броска нет. */
  onCancel(p: PointerInfo, g: GestureGame): void {
    if (p.id !== this.finger) return;
    this.finger = null;
    this.fromReady = false;
    g.setPull(false);
  }
}
