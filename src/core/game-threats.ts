/**
 * Угрозы на шаге игры: событие, визиты босса, буст, предложение буста за рекламу и финальный бой
 * (с M1-15 — в своём файле, иначе game.ts перерос бы 400 строк).
 */
import { BOTTLE_ROLE } from './boost';
import type { EnemiesContext, EnemyHit } from './enemies';
import type { Game } from './game';
import { addChest } from './game-rewards';
import type { CaughtItem } from './net';

/**
 * Угрозы шага. Событие, визит и буст — первыми: их множители действуют уже в этом шаге.
 * Спокойное время события копится без визита и буста, визита — без события и буста.
 * Предложение буста за рекламу — не в событие, не в визит и не под бустом; после первого предложения бутылок больше нет.
 * Финальный бой начинается на своём уровне, когда окна уровней показаны и нет ни события, ни визита;
 * в бой спокойное время события и визитов стоит, предложений буста нет.
 */
export function stepThreats(g: Game, dtMs: number): void {
  const fb = g.finalBoss;
  if (fb.phase === 'none' && g.progression.level >= fb.level && g.pending.length === 0 && !g.events.active && !g.boss.visiting) fb.start(g.raft);
  const fight = fb.fighting;
  g.events.step(dtMs, !g.boss.visiting && !g.boost.active && !fight);
  g.boss.step(dtMs, !g.events.active && !g.boost.active && !fight, g.events.count, g.raft);
  g.boostOffer.step(dtMs, !g.events.active && !g.boss.visiting && !g.boost.active && !fight);
  g.boost.step(dtMs, g.stats.enemiesKilled, bottleInNet(g), g.boostOffer.shown > 0);
  g.world.flowMult = g.events.flowMult * (g.boost.active ? g.boost.flowMult : 1);
  fb.step(dtMs, g.raft);
}

/** Бутылка в сети моряка или в сети какой-нибудь сетевой башни: поймана, но ещё не вернулась. */
function bottleInNet(g: Game): boolean {
  const isBottle = (it: CaughtItem): boolean => it.role === BOTTLE_ROLE;
  return g.net.caught.some(isBottle) || g.towers.list.some((t) => t.nets.some((n) => n.caught.some(isBottle)));
}

/** Что враги видят у игры на шаге; под бустом и в финальный бой новые враги не приходят; в событие — вожак (M1-16). */
export function enemiesContext(g: Game): EnemiesContext {
  return {
    raft: g.raft, level: g.progression.level, ready: g.raft.cells.length >= 2 && g.mediumCaught,
    buildings: g.raft.buildingCount(), rateMult: g.events.enemyRateMult, blocked: g.boost.active || g.finalBoss.fighting,
    event: g.events.active ? { count: g.events.count, elapsedMs: g.events.elapsedMs } : undefined,
  };
}

/** Удар по финальному боссу. Добил — победа: большой сундук в опыт и рейтинг, окно «Локация пройдена». */
export function finalHit(g: Game, x: number, y: number, reach: number, damage: number): EnemyHit[] {
  const fb = g.finalBoss;
  const alive = !fb.defeated;
  const hits = fb.hit(x, y, reach, damage);
  if (alive && fb.defeated) {
    addChest(g);
    g.cleared = true;
  }
  return hits;
}

/** «Играть дальше»: окно «Локация пройдена» закрывается, уровни идут дальше. Окна нет → false. */
export function playOn(g: Game): boolean {
  if (!g.cleared) return false;
  g.cleared = false;
  g.progression.maxLevel = levelCap(g);
  return true;
}

/** Предел уровня: до победы в финальном бою и пока открыто окно «Локация пройдена» — уровень боя, иначе без предела. */
export function levelCap(g: Game): number {
  const fb = g.finalBoss;
  return fb.id !== null && (!fb.defeated || g.cleared) ? fb.level : Infinity;
}
