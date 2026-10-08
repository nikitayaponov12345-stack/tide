/**
 * Детерминированный генератор случайных чисел (mulberry32).
 * Одинаковый сид даёт одинаковую последовательность — на этом держатся тесты, боты и повтор партий.
 * В ядре игры случайность берётся только отсюда, Math.random() не используется.
 */
export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** Число в [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Число в [min, max). */
  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  /** Целое в [min, max] включительно. */
  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }

  /** Состояние для сохранения игры. */
  getState(): number {
    return this.state;
  }

  setState(state: number): void {
    this.state = state >>> 0;
  }
}
