/** Счётчики для бота и отладки. */
export class Stats {
  throws = 0;        // успешные throwTo
  emptyThrows = 0;   // сеть вернулась пустой
  itemsCaught = 0;
  xpGained = 0;      // опыт по прилёту значков, уже × сила локации
  taps = 0;          // нажатия (noteTap от слоя ввода)
  steps = 0;         // шаги моряка (удачные walk)
  gameMs = 0;        // игровое время с начала локации
}
