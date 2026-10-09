/** Счётчики для бота и отладки. Пишут Game и Enemies. */
export class Stats {
  throws = 0;        // успешные throwTo
  emptyThrows = 0;   // сеть вернулась пустой
  itemsCaught = 0;
  xpGained = 0;      // опыт по прилёту значков, уже × сила локации
  taps = 0;          // нажатия (noteTap от слоя ввода)
  steps = 0;         // шаги моряка (удачные walk)
  gameMs = 0;        // игровое время с начала локации
  spearThrows = 0;   // успешные броски копья
  spearHits = 0;     // броски копья, задевшие хотя бы одного врага (меткость — spearHits / spearThrows)
  enemiesKilled = 0;
  enemiesEscaped = 0;
  lootDropped = 0;   // предметов-добычи выпало
}
