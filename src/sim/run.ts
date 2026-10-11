import { STEP_MS, TIME_EPS } from '../core/clock';
import { FLOW_ROLES, type Tables } from '../core/data/tables';
import { Game } from '../core/game';
import { Rng } from '../core/rng';
import { HUMAN, HumanBot, type BotParams } from './bot';

export interface SimOptions {
  maxGameMs: number;
  /** 'cleared' — до победы в финальном бою (M1-15). */
  untilLevel: number | 'cleared';
  bot: BotParams;
}
export const DEFAULT_SIM: SimOptions = { maxGameMs: 40 * 60_000, untilLevel: 'cleared', bot: HUMAN };

/** Уровни, на которых прогон отмечает первое достижение. */
export const MARK_LEVELS = [2, 10, 20, 40] as const;
/** Точка рекламы, которую считает бот: закрытие окна выбора. */
const AD_PLACE = 'window_close';

export interface SimResult {
  seed: number;
  level: number;
  gameMs: number;
  wallMs: number;
  /** Уровень → мс первого достижения (игровое время и по часам); не дошла — null. */
  levelGameMs: Record<number, number | null>;
  levelWallMs: Record<number, number | null>;
  throws: number;
  itemsCaught: number;
  emptyThrows: number;
  spearThrows: number;
  spearHits: number;
  enemiesKilled: number;
  enemiesEscaped: number;
  /** Вожаков событий пришло и побеждено копьями (с M1-16). */
  leaders: number;
  leadersKilled: number;
  lootDropped: number;
  cells: number;
  windows: number;
  /** id карточки → сколько раз взята. */
  cards: Record<string, number>;
  /** Опыт вернувшегося улова по источникам: flow — поток без буста, boost — поток под бустом (с M1-11). */
  xp: { flow: number; loot: number; chest: number; boost: number };
  /** Точки межстраничной рекламы: в M0 рекламы нет, бот только считает. */
  adPoints: number;
  /** Предложений буста за рекламу показано и взято (с M1-12). */
  offers: number;
  offersTaken: number;
  /** Финальный бой (с M1-15): игровое время начала шага, в котором он начался (не начался — null). */
  fightStartGameMs: number | null;
  /** Игровое время боя (stats.finalFightMs) при победе, иначе null. */
  fightMs: number | null;
  /** Когда финальный босс побеждён: игровое время и по часам; не побеждён — null. */
  clearedGameMs: number | null;
  clearedWallMs: number | null;
  /** Ударов финального босса по клеткам и снятая ими прочность. */
  finalStrikes: number;
  finalCellDamage: number;
}

/** Партия бота «человек» на одном сиде: горизонталь, Лагуна, до уровня untilLevel (или победы в финальном бою) или maxGameMs игрового времени. */
export function runSim(data: Tables, seed: number, opts: SimOptions = DEFAULT_SIM): SimResult {
  const game = new Game(data, { halfW: 640, halfH: 360, speedMult: 1, locationId: 'lagoon', seed });
  const bot = new HumanBot(game, data, new Rng(seed + 3), opts.bot);
  const ad = data.ads.find((a) => a.place === AD_PLACE);
  if (!ad) throw new Error(`ads.csv: нет точки ${AD_PLACE}`);
  const adFirstMs = Number(ad.first_after_s) * 1000;
  const adCooldownMs = Number(ad.cooldown_s) * 1000;

  const levelGameMs: Record<number, number | null> = {};
  const levelWallMs: Record<number, number | null> = {};
  for (const l of MARK_LEVELS) {
    levelGameMs[l] = null;
    levelWallMs[l] = null;
  }
  const cards: Record<string, number> = {};
  let wallMs = 0;
  let windows = 0;
  let adPoints = 0;
  let lastAdMs: number | null = null;
  let fightStartGameMs: number | null = null;
  let clearedGameMs: number | null = null;
  let clearedWallMs: number | null = null;
  const untilCleared = opts.untilLevel === 'cleared';
  const untilLevel = typeof opts.untilLevel === 'number' ? opts.untilLevel : data.num('level_to_clear');

  // Шаги игры плюс паузы: окно и стройка на уровень, с большим запасом.
  const maxIters = Math.ceil(opts.maxGameMs / STEP_MS) + 4 * untilLevel + 1000;
  for (let i = 0; ; i++) {
    if (i >= maxIters) throw new Error(`runSim: сид ${seed} — предел шагов`);
    // Победа — прогон кончен, окно «Локация пройдена» не ждём.
    if (untilCleared && game.finalBoss.defeated) break;
    if (game.paused) {
      const isWindow = game.window !== null;
      const { ms, card, rewarded } = bot.pause();
      wallMs += ms;
      // Реклама за награду (буст, с M1-14 и воронка) тоже считается в перерыв межстраничной (ads.csv, window_close).
      if (rewarded) lastAdMs = wallMs;
      if (card !== null) cards[card] = (cards[card] ?? 0) + 1;
      if (isWindow) {
        windows++;
        const first = wallMs + TIME_EPS >= adFirstMs;
        const cool = lastAdMs === null || wallMs - lastAdMs + TIME_EPS >= adCooldownMs;
        if (first && cool) {
          adPoints++;
          lastAdMs = wallMs;
        }
      }
      continue;
    }
    if ((!untilCleared && game.progression.level >= untilLevel) || game.stats.gameMs + TIME_EPS >= opts.maxGameMs) break;
    bot.update();
    const stepStartMs = game.stats.gameMs;
    game.step(STEP_MS);
    wallMs += STEP_MS;
    if (fightStartGameMs === null && game.finalBoss.phase !== 'none') fightStartGameMs = stepStartMs;
    if (clearedGameMs === null && game.finalBoss.defeated) {
      clearedGameMs = game.stats.gameMs;
      clearedWallMs = wallMs;
    }
    for (const l of MARK_LEVELS) {
      if (levelGameMs[l] === null && game.progression.level >= l) {
        levelGameMs[l] = game.stats.gameMs;
        levelWallMs[l] = wallMs;
      }
    }
  }

  const s = game.stats;
  return {
    seed,
    level: game.progression.level,
    gameMs: s.gameMs,
    wallMs,
    levelGameMs,
    levelWallMs,
    throws: s.throws,
    itemsCaught: s.itemsCaught,
    emptyThrows: s.emptyThrows,
    spearThrows: s.spearThrows,
    spearHits: s.spearHits,
    enemiesKilled: s.enemiesKilled,
    enemiesEscaped: s.enemiesEscaped,
    leaders: s.leaders,
    leadersKilled: s.leadersKilled,
    lootDropped: s.lootDropped,
    cells: game.raft.cells.length,
    windows,
    cards,
    xp: {
      flow: FLOW_ROLES.reduce((sum, r) => sum + s.xpByRole[r], 0) - s.boostFlowXp,
      loot: s.xpByRole.loot,
      chest: s.xpByRole.boss_chest,
      boost: s.boostFlowXp,
    },
    adPoints,
    offers: game.boostOffer.shown,
    offersTaken: game.boostOffer.taken,
    fightStartGameMs,
    fightMs: game.finalBoss.defeated ? s.finalFightMs : null,
    clearedGameMs,
    clearedWallMs,
    finalStrikes: s.finalStrikes,
    finalCellDamage: s.finalCellDamage,
  };
}
