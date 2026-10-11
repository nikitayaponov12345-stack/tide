import { BOTTLE_ROLE } from './boost';
import { FLOW_ROLES } from './data/tables';
import type { Game } from './game';
import type { CaughtItem } from './net';

/**
 * Улов на шаге игры (с M1-18 — в своём файле, иначе game.ts перерос бы 400 строк): сеть моряка, сетевые башни и воронки.
 * Порядок — как был в Game.step: сеть, затем башни и воронки.
 */

/** Роль предмета, улов которой (вместе со второй клеткой) приводит первого врага: в Лагуне — бочонок. */
const FIRST_ENEMY_ROLE = 'medium';

/** Улов шага: сеть моряка (со счётчиками её бросков), затем башни и воронки — опыт и значки, как у сети. */
export function stepCatch(g: Game, dtMs: number): void {
  const caught = g.net.step(dtMs, g.world);
  if (caught) {
    addCatch(g, caught);
    g.stats.itemsCaught += caught.length;
    if (caught.length === 0) g.stats.emptyThrows++;
  }
  // Улов башен и воронок — опыт и значки, как улов сети моряка (без счётчиков бросков моряка).
  const fromTowers = g.towers.step(dtMs, g.world, g.raft);
  const fromWhirlpools = g.whirlpools.step(dtMs, g.world, g.raft);
  g.stats.towerCaught += fromTowers.length;
  g.stats.whirlpoolCaught += fromWhirlpools.length;
  if (fromTowers.length + fromWhirlpools.length > 0) addCatch(g, [...fromTowers, ...fromWhirlpools]);
}

/**
 * Улов сети или башен: значки, опыт по ролям, бочонок для первого врага. Под бустом опыт потока идёт ещё и в boostFlowXp.
 * Вернулась бутылка — буст.
 */
function addCatch(g: Game, caught: CaughtItem[]): void {
  g.progression.addCatch(caught, g.world.timeMs);
  const boosted = g.boost.active;
  for (const it of caught) {
    const xp = it.xp * g.xpMult;
    g.stats.xpByRole[it.role] += xp;
    if (boosted && FLOW_ROLES.includes(it.role)) g.stats.boostFlowXp += xp;
  }
  if (caught.some((it) => it.role === FIRST_ENEMY_ROLE)) g.mediumCaught = true;
  if (caught.some((it) => it.role === BOTTLE_ROLE)) g.boost.bottleBack();
}
