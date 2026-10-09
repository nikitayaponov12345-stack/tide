export interface PointerInfo { x: number; y: number; type: 'mouse' | 'touch' | 'pen'; id: number }   // x, y — координаты мира

/** То, что жест видит у игры: можно ли бросить выбранное оружие, и команды ядра. Game подходит как есть; тесты подают подделку. */
export interface GestureGame {
  canThrow(): boolean;
  throwTo(x: number, y: number): boolean;
  setPull(on: boolean): void;
  walk(dx: number, dy: number): boolean;
}

/**
 * Классическая схема, как в оригинале: мышь бросает выбранное оружие по нажатию, касание и перо — по отпусканию
 * (если жест начался, когда бросить было можно, и можно до сих пор); иначе нажатие включает удержание, отпускание выключает.
 * Жест ведёт первый палец: до его up или cancel события других пальцев не дают команд
 * (pointer.ts фильтрует так же; здесь — чтобы жест вёл себя одинаково и под ботом). cancel никогда не бросает.
 * Палец и перо ещё и водят моряка: каждые walkDragPx вдоль оси — шаг на соседнюю клетку. Жест, набравший
 * walkDragPx хоть раз, — ходьба: на отпускание он не бросает, даже если шаг не удался. Мышь не ходит.
 */
export class Gesture {
  private finger: number | null = null;
  private fromReady = false;
  /** Жест хоть раз набрал walkDragPx. */
  private walked = false;
  private lastX = 0;
  private lastY = 0;
  /** Накопленный сдвиг по осям, точки мира. */
  private accX = 0;
  private accY = 0;

  constructor(private readonly walkDragPx: number) {
    if (!(walkDragPx > 0)) throw new Error(`Gesture: walkDragPx = ${walkDragPx}, нужно больше 0`);
  }

  onDown(p: PointerInfo, g: GestureGame): void {
    if (this.finger !== null) return;
    this.finger = p.id;
    this.fromReady = false;
    this.walked = false;
    this.lastX = p.x;
    this.lastY = p.y;
    this.accX = 0;
    this.accY = 0;
    if (g.canThrow()) {
      if (p.type === 'mouse') g.throwTo(p.x, p.y);
      else this.fromReady = true;
    } else {
      g.setPull(true);
    }
  }

  /** Сдвиг первого пальца или пера: шаги моряка, сначала по X, потом по Y. Удержание сети не трогает. */
  onMove(p: PointerInfo, g: GestureGame): void {
    if (p.id !== this.finger || p.type === 'mouse') return;
    this.accX += p.x - this.lastX;
    this.accY += p.y - this.lastY;
    this.lastX = p.x;
    this.lastY = p.y;
    const d = this.walkDragPx;
    while (Math.abs(this.accX) >= d) {
      const sx = Math.sign(this.accX);
      this.accX -= sx * d;
      this.walked = true;
      g.walk(sx, 0);
    }
    while (Math.abs(this.accY) >= d) {
      const sy = Math.sign(this.accY);
      this.accY -= sy * d;
      this.walked = true;
      g.walk(0, sy);
    }
  }

  onUp(p: PointerInfo, g: GestureGame): void {
    if (p.id !== this.finger) return;
    this.finger = null;
    if (p.type !== 'mouse' && this.fromReady && !this.walked && g.canThrow()) g.throwTo(p.x, p.y);
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
