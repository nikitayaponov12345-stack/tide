import { describe, expect, it } from 'vitest';
import type { CardKind } from '../../src/core/data/tables';
import { Deck, NEED_FREE_CELL, type DeckContext, type OfferCard } from '../../src/core/deck';
import { Game, type GameConfig, type GameSnapshot } from '../../src/core/game';
import { Rng } from '../../src/core/rng';
import { DATA } from '../../src/data';

const CFG: GameConfig = { halfW: 640, halfH: 360, speedMult: 1, locationId: 'lagoon', seed: 1 };
const ALL: CardKind[] = ['raft', 'building', 'building_upgrade', 'sailor_upgrade'];
const M0: CardKind[] = ['raft', 'sailor_upgrade'];
const LEVEL = 10;
const AFTER = DATA.num('refresh_after_cards');

function ctx(over: Partial<DeckContext> = {}): DeckContext {
  return { freeCells: 5, canAddCell: true, has: () => true, spearOwned: true, bossVisitSeen: true, ...over };
}

const ids = (cards: readonly OfferCard[]): string[] => cards.map((c) => c.id);
const kindOf = (id: string): CardKind => DATA.cards.find((c) => c.id === id)!.kind;

/** Доступные карточки — первыми. */
function availableFirst(cards: readonly OfferCard[]): void {
  const firstLocked = cards.findIndex((c) => !c.available);
  if (firstLocked >= 0) expect(cards.slice(firstLocked).every((c) => !c.available)).toBe(true);
}

/** Игра с окном 10-го уровня, в локации взято taken карточек. */
function windowGame(taken: number, cfg: Partial<GameConfig> = {}): Game {
  const g = new Game(DATA, { ...CFG, ...cfg });
  for (let i = 0; i < taken; i++) g.deck.take('net_wider', 1);
  g.setLevel(LEVEL - 1);
  g.debugLevelUp();
  expect(g.window?.level).toBe(LEVEL);
  return g;
}

describe('«Новые карточки» за рекламу: колода (M1-18)', () => {
  it('takenTotal — сумма взятий, refreshAfter — из таблицы', () => {
    const d = new Deck(DATA, 'lagoon', new Rng(1), ALL);
    expect(d.refreshAfter).toBe(AFTER);
    expect(d.takenTotal()).toBe(0);
    d.take('net_wider', 1);
    d.take('net_wider', 2);
    d.take('raft', 3);
    expect(d.takenTotal()).toBe(3);
  });

  it('новое окно того же размера, без карточек старого, первая доступна', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const d = new Deck(DATA, 'lagoon', new Rng(seed), ALL);
      const old = d.offer(LEVEL, ctx());
      expect(d.canReroll(LEVEL, ctx(), ids(old))).toBe(true);
      const next = d.reroll(LEVEL, ctx(), ids(old));
      expect(next).toHaveLength(d.size(LEVEL));
      for (const id of ids(next)) expect(ids(old)).not.toContain(id);
      expect(next[0]!.available).toBe(true);
    }
  });

  it('нет свободной клетки: «Плот» в старом и новом окне, постройки затемнены, доступные первыми', () => {
    const c = ctx({ freeCells: 0 });
    for (let seed = 1; seed <= 30; seed++) {
      const d = new Deck(DATA, 'lagoon', new Rng(seed), ALL);
      const old = d.offer(LEVEL, c);
      expect(ids(old)).toContain('raft');
      const next = d.reroll(LEVEL, c, ids(old));
      expect(ids(next)).toContain('raft');
      for (const x of next) {
        if (kindOf(x.id) === 'building') expect(x).toEqual({ id: x.id, available: false, reason: NEED_FREE_CELL });
      }
      availableFirst(next);
    }
  });

  it('выпали только затемнённые — последнюю заменяет доступная', () => {
    // Без «Плота» и без построек на плоту: доступно только «Копьё сильнее», остальное — затемнённые постройки.
    const c = ctx({ freeCells: 0, canAddCell: false, has: () => false, bossVisitSeen: false });
    const old = ['net_wider', 'net_bigger', 'throw_farther', 'pull_stronger'];
    for (let seed = 1; seed <= 100; seed++) {
      const next = new Deck(DATA, 'lagoon', new Rng(seed), ALL).reroll(LEVEL, c, old);
      expect(next[0]).toEqual({ id: 'spear_stronger', available: true, reason: null });
    }
  });

  it('новых доступных карточек нет: canReroll — false, reroll — [], Rng не тронут', () => {
    const rng = new Rng(3);
    const d = new Deck(DATA, 'lagoon', rng, M0);
    const c = ctx({ spearOwned: false });
    const old = ['raft', 'net_wider', 'net_bigger', 'throw_farther', 'pull_stronger'];
    const state = rng.getState();
    expect(d.canReroll(LEVEL, c, old)).toBe(false);
    expect(d.reroll(LEVEL, c, old)).toEqual([]);
    expect(rng.getState()).toBe(state);
  });
});

describe('«Новые карточки» за рекламу: игра (M1-18)', () => {
  it('после refresh_after_cards взятий — можно, один раз; то же окно, новые карточки; взяли карточку — нельзя', () => {
    expect(windowGame(AFTER - 1).canRefreshCards()).toBe(false);
    const g = windowGame(AFTER);
    expect(g.canRefreshCards()).toBe(true);
    const w = g.window!;
    const old = ids(w.cards);
    expect(g.refreshCards()).toBe(true);
    expect(g.window).toBe(w);
    for (const id of ids(w.cards)) expect(old).not.toContain(id);
    expect(w.refreshed).toBe(true);
    expect(g.canRefreshCards()).toBe(false);
    expect(g.refreshCards()).toBe(false);
    expect(g.takeCard(w.cards.findIndex((c) => c.available))).toBe(true);
    expect(g.window).toBeNull();
    expect(g.refreshCards()).toBe(false);
  });

  it('без рекламы за награду — нельзя', () => {
    const g = windowGame(AFTER, { rewarded: false });
    expect(g.canRefreshCards()).toBe(false);
    expect(g.refreshCards()).toBe(false);
  });

  it('снимок: у необновлённого окна refreshed нет; обновлённое окно переживает запись', () => {
    const g = windowGame(AFTER);
    const before = JSON.parse(JSON.stringify(g.snapshot())) as GameSnapshot;
    expect(before.window).not.toHaveProperty('refreshed');
    expect(g.refreshCards()).toBe(true);
    const after = JSON.parse(JSON.stringify(g.snapshot())) as GameSnapshot;
    const r = Game.restore(DATA, CFG, after);
    expect(r.window!.cards).toEqual(g.window!.cards);
    expect(r.window!.refreshed).toBe(true);
    expect(r.canRefreshCards()).toBe(false);
    expect(Game.restore(DATA, CFG, before).canRefreshCards()).toBe(true);
  });
});
