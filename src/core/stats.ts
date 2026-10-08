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
