import type { BossSnapshot } from './boss';
import type { BoostSnapshot } from './boost';
import type { BoostOfferSnapshot } from './boost-offer';
import type { DeckSnapshot } from './deck';
import type { EnemiesSnapshot } from './enemies';
import type { EventsSnapshot } from './events';
import type { FinalBossSnapshot } from './final-boss';
import type { Game, OfferWindow, Weapon } from './game';
import { levelCap } from './game-threats';
import type { NetSnapshot } from './net';
import type { ProgressionSnapshot } from './progression';
import type { Cell } from './raft';
import type { SpearSnapshot } from './spear';
import type { SpearTowersSnapshot } from './spear-towers';
import type { StatsSnapshot } from './stats';
import type { TowersSnapshot } from './towers';
import type { WhirlpoolsSnapshot } from './whirlpools';
import type { WorldSnapshot } from './world';

/** Снимок партии (ARCHITECTURE §7): снимки модулей и поля игры. Только данные — JSON возвращает его без потерь. */
export interface GameSnapshot {
  world: WorldSnapshot; raft: { cells: Cell[] }; sailor: { gx: number; gy: number }; net: NetSnapshot; spear: SpearSnapshot;
  enemies: EnemiesSnapshot; progression: ProgressionSnapshot; deck: DeckSnapshot; stats: StatsSnapshot;
  window: OfferWindow | null; build: { card: string } | null; weapon: Weapon; spearOwned: boolean; hasWalked: boolean;
  secondCellMs: number | null; mediumCaught: boolean; pending: number[]; hold: boolean;
  /** Нет в записи до M1-06: башни встают по постройкам плота с готовыми сетями. */
  towers?: TowersSnapshot;
  /** Нет в записи до M1-07: спокойное время с нуля, события нет. */
  events?: EventsSnapshot;
  /** Нет в записи до M1-08: визитов ещё не было. */
  boss?: BossSnapshot;
  /** Нет в записи до M1-09: копейные башни встают по постройкам плота с копьём у башни, без отдыха. */
  spearTowers?: SpearTowersSnapshot;
  /** Нет в записи до M1-11: буста нет, бутылку не ловили. */
  boost?: BoostSnapshot;
  /** Нет в записи до M1-12: предложения с начала, первое — через first_after_s игры после загрузки. */
  boostOffer?: BoostOfferSnapshot;
  /** Нет в записи до M1-13: радиус яруса; воронки встают по постройкам плота. */
  whirlpools?: WhirlpoolsSnapshot;
  /** Финальный бой (с M1-15); в записи до M1-15 поля нет — боя ещё не было, на level_to_clear и выше он начнётся сразу. */
  finalBoss?: FinalBossSnapshot;
  /** Открыто окно «Локация пройдена» (с M1-15); нет поля — закрыто. */
  cleared?: boolean;
}

/** Снимок всего, кроме закрытых полей Game (pending, hold): их добавляет Game.snapshot. */
export function snapshotGame(g: Game): Omit<GameSnapshot, 'pending' | 'hold'> {
  const w = g.window;
  return {
    world: g.world.snapshot(), raft: g.raft.snapshot(), sailor: g.sailor.snapshot(), net: g.net.snapshot(),
    spear: g.spear.snapshot(), enemies: g.enemies.snapshot(), progression: g.progression.snapshot(),
    deck: g.deck.snapshot(), stats: g.stats.snapshot(),
    window: w && { level: w.level, cards: w.cards.map((c) => ({ ...c })) },
    build: g.build && { ...g.build },
    weapon: g.weapon, spearOwned: g.spearOwned, hasWalked: g.hasWalked, secondCellMs: g.secondCellMs,
    mediumCaught: g.mediumCaught, towers: g.towers.snapshot(), events: g.events.snapshot(), boss: g.boss.snapshot(),
    spearTowers: g.spearTowers.snapshot(), boost: g.boost.snapshot(), boostOffer: g.boostOffer.snapshot(),
    whirlpools: g.whirlpools.snapshot(), finalBoss: g.finalBoss.snapshot(), cleared: g.cleared,
  };
}

/** Состояние снимка в новую партию g, кроме pending и hold. Битый снимок → throw. */
export function restoreGame(g: Game, s: GameSnapshot): void {
  g.world.restore(s.world);
  g.raft.restore(s.raft);
  g.sailor.restore(s.sailor);
  g.net.restore(s.net);
  g.spear.restore(s.spear);
  g.enemies.restore(s.enemies);
  g.progression.restore(s.progression);
  g.deck.restore(s.deck);
  g.stats.restore(s.stats);
  g.window = s.window && { level: s.window.level, cards: s.window.cards.map((c) => ({ ...c })) };
  g.build = s.build && { card: s.build.card };
  g.weapon = s.weapon;
  g.spearOwned = s.spearOwned;
  g.hasWalked = s.hasWalked;
  g.secondCellMs = s.secondCellMs;
  g.mediumCaught = s.mediumCaught;
  if (s.towers) g.towers.restore(s.towers);
  if (s.spearTowers) g.spearTowers.restore(s.spearTowers);
  if (s.whirlpools) g.whirlpools.restore(s.whirlpools);
  g.syncBuildings();
  if (s.events) g.events.restore(s.events);
  if (s.boss) g.boss.restore(s.boss);
  if (s.boost) g.boost.restore(s.boost);
  if (s.boostOffer) g.boostOffer.restore(s.boostOffer);
  if (s.finalBoss) g.finalBoss.restore(s.finalBoss);
  g.cleared = s.cleared ?? false;
  g.progression.maxLevel = levelCap(g);
}
