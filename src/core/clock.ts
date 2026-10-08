/** Длина одного шага логики: 60 шагов в секунду игрового времени. */
export const STEP_MS = 1000 / 60;

/** Допуск на ошибку округления: 60 шагов по 1000/60 мс в сумме дают 999,999… мс. */
export const TIME_EPS = 1e-6;

/**
 * Фиксированный шаг логики. Кадр любой длины превращается в целое число шагов по stepMs,
 * поэтому правила игры не зависят от частоты кадров (у оригинала густота потока от неё зависела).
 * Слишком долгий кадр (вкладка была скрыта, браузер подвис) обрезается до maxStepsPerFrame шагов:
 * игровое время в этот момент отстаёт от настоящего, но игра не «догоняет» рывком.
 */
export class FixedStep {
  private acc = 0;

  constructor(
    readonly stepMs: number = STEP_MS,
    readonly maxStepsPerFrame: number = 8,
  ) {}

  /** Добавить время кадра и выполнить накопившиеся шаги. Возвращает число выполненных шагов. */
  advance(frameMs: number, step: (dtMs: number) => void): number {
    if (!(frameMs > 0)) return 0;
    this.acc += frameMs;
    let steps = 0;
    while (this.acc + TIME_EPS >= this.stepMs && steps < this.maxStepsPerFrame) {
      step(this.stepMs);
      this.acc -= this.stepMs;
      steps++;
    }
    if (this.acc < 0 || (steps === this.maxStepsPerFrame && this.acc + TIME_EPS >= this.stepMs)) this.acc = 0;
    return steps;
  }

  /** Доля следующего шага (0..1) — для сглаживания отрисовки между шагами. */
  get alpha(): number {
    return this.acc / this.stepMs;
  }
}
