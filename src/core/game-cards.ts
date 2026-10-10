import type { CardRow } from './data/tables';
import type { DeckContext } from './deck';
import type { Game } from './game';
import type { Spot } from './raft';
import { buildingUpgrade, sailorUpgrade } from './upgrades';

/** Постройки, которые уже можно ставить (id из buildings.csv). */
export const BUILDINGS_IN_GAME: readonly string[] = ['net_tower', 'spear_tower'];

/** Взять карточку i окна (в порядке показа). Окна нет, индекса нет, карточка недоступна, открыта пауза → false. */
export function takeCard(g: Game, i: number): boolean {
  if (g.menu) return false;
  const w = g.window;
  const offer = w?.cards[i];
  if (!w || !offer || !offer.available) return false;
  const card = g.deck.card(offer.id);
  // Сначала проверки и расчёт: ошибка оставляет окно открытым, а карточку — невзятой.
  let apply: (() => void) | null = null;
  if (card.kind === 'sailor_upgrade') apply = sailorUpgrade(card, g.net, g.spear);
  else if (card.kind === 'building_upgrade') apply = buildingUpgrade(card, g.towers, g.spearTowers);
  else if (card.kind === 'building' && !BUILDINGS_IN_GAME.includes(card.target)) throw new Error(`takeCard: постройка ${card.target} ещё не в игре`);
  g.deck.take(card.id, w.level);
  g.window = null;
  if (apply) {
    apply();
    openNext(g);
  } else {
    g.build = { card: card.id };
  }
  return true;
}

/** Место (gx, gy) подходит стройке: у «Плота» — новая клетка, у постройки — свободная целая. Стройки нет → false. Паузу не смотрит. */
export function canPlace(g: Game, gx: number, gy: number): boolean {
  const card = buildCard(g);
  if (!card) return false;
  return card.kind === 'raft' ? g.raft.canAdd(gx, gy) : g.raft.canBuild(gx, gy);
}

/** Места стройки: у «Плота» — raft.candidates(), у постройки — raft.buildSpots(). Стройки нет → []. */
export function buildSpots(g: Game): Spot[] {
  const card = buildCard(g);
  if (!card) return [];
  return card.kind === 'raft' ? g.raft.candidates() : g.raft.buildSpots();
}

/** Стройка на (gx, gy): у «Плота» — клетка, у постройки — постройка target. Стройки нет, место не подходит или открыта пауза → false. */
export function placeCell(g: Game, gx: number, gy: number): boolean {
  const card = buildCard(g);
  if (g.menu || !card || !canPlace(g, gx, gy)) return false;
  if (card.kind === 'raft') g.raft.add(gx, gy);
  else {
    g.raft.build(gx, gy, card.target);
    g.syncBuildings();
  }
  if (g.secondCellMs === null && g.raft.cells.length >= 2) g.secondCellMs = g.world.timeMs;
  g.build = null;
  openNext(g);
  return true;
}

/** Новые уровни прогрессии — в очередь окон; поток — по уровню. */
export function collectLevelUps(g: Game): void {
  g.pending.push(...g.progression.takeLevelUps());
  if (g.world.level !== g.progression.level) g.world.setLevel(g.progression.level);
}

/** Следующее окно из очереди; уровень без доступной карточки — без окна. */
export function openNext(g: Game): void {
  while (!g.paused && g.pending.length > 0) {
    const level = g.pending.shift()!;
    const cards = g.deck.offer(level, deckContext(g));
    if (cards.length > 0) g.window = { level, cards };
  }
}

function buildCard(g: Game): CardRow | null {
  return g.build && g.deck.card(g.build.card);
}

function deckContext(g: Game): DeckContext {
  return {
    freeCells: g.raft.freeCells(),
    canAddCell: g.raft.candidates().length > 0,
    has: (b) => g.raft.hasBuilding(b),
    spearOwned: g.spearOwned,
    bossVisitSeen: g.boss.visits > 0,
  };
}
