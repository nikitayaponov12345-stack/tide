/** Счётчики для сводки пробы и бота. */
export class Stats {
  throws = 0;        // успешные throwTo
  emptyThrows = 0;   // сеть вернулась пустой
  itemsCaught = 0;
  xpGained = 0;      // опыт по прилёту значков, уже × сила локации
  taps = 0;          // нажатия (noteTap от слоя ввода)
  gameMs = 0;        // игровое время с последнего reset()

  reset(): void {
    this.throws = 0;
    this.emptyThrows = 0;
    this.itemsCaught = 0;
    this.xpGained = 0;
    this.taps = 0;
    this.gameMs = 0;
  }
}

/** Цифры сводки пробы, неокруглённые (округляет окно). */
export interface TrialSummary {
  minutes: number;
  throwsPerMin: number;
  itemsPerThrow: number;
  emptyPct: number;      // доля пустых бросков, %
  tapsPerMin: number;
  xpPerMin: number;
}

type StatsView = Pick<Stats, 'throws' | 'emptyThrows' | 'itemsCaught' | 'xpGained' | 'taps' | 'gameMs'>;

/** Сводка по счётчикам; 0 бросков и 0 минут дают нули, а не деление на ноль. */
export function summarize(s: StatsView): TrialSummary {
  const minutes = s.gameMs / 60_000;
  const perMin = (n: number): number => (minutes > 0 ? n / minutes : 0);
  const perThrow = (n: number): number => (s.throws > 0 ? n / s.throws : 0);
  return {
    minutes,
    throwsPerMin: perMin(s.throws),
    itemsPerThrow: perThrow(s.itemsCaught),
    emptyPct: 100 * perThrow(s.emptyThrows),
    tapsPerMin: perMin(s.taps),
    xpPerMin: perMin(s.xpGained),
  };
}
