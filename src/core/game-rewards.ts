import type { Game } from './game';

/**
 * Награды за рекламу (с M1-17 — в своём файле, иначе game.ts перерос бы 400 строк): буст за рекламу и «Сундук ×2».
 * Воронка за рекламу — в game-cards.ts: она пересчитывает окно выбора. Функции работают с Game: его команды зовут их.
 */

/** Нажатие на кнопку буста за рекламу: она гаснет, мир стоит до adDone. Пауза или кнопки нет → false. */
export function takeBoostOffer(g: Game): boolean {
  if (g.paused || !g.boostOffer.take()) return false;
  g.ad = true;
  return true;
}

/** Реклама буста кончилась; досмотрена (rewarded) — буст на boost_ad_s, враги на поле гибнут без добычи. Рекламы нет → false. */
export function adDone(g: Game, rewarded: boolean): boolean {
  if (!g.ad) return false;
  g.ad = false;
  if (rewarded) {
    g.boost.start(g.boostOffer.adBoostMs);
    g.stats.boostKills += g.enemies.killAll();
  }
  return true;
}

/**
 * «Сундук ×2» (M1-17): реклама досмотрена в окне «Локация пройдена» — опыт большого сундука ещё раз, как при победе.
 * Окна нет, рекламы за награду у площадки нет или сундук уже удвоен → false.
 */
export function doubleChest(g: Game): boolean {
  if (!g.cleared || !g.rewarded || g.chestDoubled) return false;
  g.chestDoubled = true;
  addChest(g);
  return true;
}

/** Опыт большого сундука: в рейтинг и в полосу (на пределе уровня она стоит полной, лишнее идёт только в рейтинг). */
export function addChest(g: Game): void {
  const xp = g.finalBoss.chestXp;
  g.stats.bigChestXp += xp;
  g.stats.xpGained += xp;
  g.progression.addXp(xp);
}
