import { describe, expect, it } from 'vitest';
import type { CardKind } from '../../src/core/data/tables';
import { AD_LOCKED, Deck, NEED_FREE_CELL, type DeckContext } from '../../src/core/deck';
import { Game, type GameConfig } from '../../src/core/game';
import { Rng } from '../../src/core/rng';
import { makeSave } from '../../src/core/save';
import { DATA } from '../../src/data';

const CFG: GameConfig = { halfW: 640, halfH: 360, speedMult: 1, locationId: 'lagoon', seed: 1 };
const ALL: CardKind[] = ['raft', 'building', 'building_upgrade', 'sailor_upgrade'];
/** Уровень окна, где воронка принудительна (forced_cards.csv). */
const LEVEL = Number(DATA.forcedCards.find((f) => f.location === 'lagoon' && f.card === 'whirlpool')!.trigger.slice('level:'.length));

function ctx(over: Partial<DeckContext> = {}): DeckContext {
  return { freeCells: 5, canAddCell: true, has: () => false, spearOwned: false, bossVisitSeen: false, ...over };
}

/** Игра с окном уровня воронки. */
function windowGame(cfg: Partial<GameConfig> = {}): Game {
  const g = new Game(DATA, { ...CFG, ...cfg });
  g.setLevel(LEVEL - 1);
  g.debugLevelUp();
  expect(g.window?.level).toBe(LEVEL);
  return g;
}

const whirlpool = (g: Game) => g.window!.cards.find((c) => c.id === 'whirlpool');

describe('Воронка за рекламу (M1-14)', () => {
  it('колода: при adLocked воронка закрыта, остальные карточки окна доступны; без adLocked — доступна', () => {
    for (let seed = 1; seed <= 5; seed++) {
      const locked = new Deck(DATA, 'lagoon', new Rng(seed), ALL).offer(LEVEL, ctx({ adLocked: true }));
      expect(locked.find((c) => c.id === 'whirlpool')).toEqual({ id: 'whirlpool', available: false, reason: AD_LOCKED });
      expect(locked.filter((c) => c.id !== 'whirlpool').every((c) => c.available)).toBe(true);
      const open = new Deck(DATA, 'lagoon', new Rng(seed), ALL).offer(LEVEL, ctx());
      expect(open.find((c) => c.id === 'whirlpool')).toEqual({ id: 'whirlpool', available: true, reason: null });
    }
  });

  it('в игре: закрыта до unlockWhirlpool, после — доступна в том же окне, порядок прежний; второй раз — false', () => {
    const g = windowGame();
    expect(whirlpool(g)).toEqual({ id: 'whirlpool', available: false, reason: AD_LOCKED });
    const w = g.window!;
    const order = w.cards.map((c) => c.id);
    expect(g.unlockWhirlpool()).toBe(true);
    expect(g.whirlpoolUnlocked).toBe(true);
    expect(g.window).toBe(w);
    expect(w.cards.map((c) => c.id)).toEqual(order);
    expect(whirlpool(g)).toEqual({ id: 'whirlpool', available: true, reason: null });
    expect(g.unlockWhirlpool()).toBe(false);
    expect(g.takeCard(w.cards.findIndex((c) => c.id === 'whirlpool'))).toBe(true);
    expect(g.build).toEqual({ card: 'whirlpool' });
  });

  it('нет свободной клетки: после открытия причина — нужна свободная клетка', () => {
    const g = new Game(DATA, CFG);
    expect(g.debugBuild(0, 0, 'net_tower')).toBe(true);
    g.setLevel(LEVEL - 1);
    g.debugLevelUp();
    expect(whirlpool(g)?.reason).toBe(AD_LOCKED);
    expect(g.unlockWhirlpool()).toBe(true);
    expect(whirlpool(g)).toEqual({ id: 'whirlpool', available: false, reason: NEED_FREE_CELL });
  });

  it('без рекламы за награду или уже открыта в кампании — доступна сразу', () => {
    const g = windowGame({ rewarded: false });
    expect(whirlpool(g)).toEqual({ id: 'whirlpool', available: true, reason: null });
    expect(g.unlockWhirlpool()).toBe(false);
    expect(whirlpool(windowGame({ whirlpoolUnlocked: true }))).toEqual({ id: 'whirlpool', available: true, reason: null });
  });

  it('запись: campaign.whirlpoolUnlocked — false, после открытия — true', () => {
    const g = windowGame();
    expect(makeSave(g, 'lagoon', CFG.seed).campaign.whirlpoolUnlocked).toBe(false);
    g.unlockWhirlpool();
    expect(makeSave(g, 'lagoon', CFG.seed).campaign.whirlpoolUnlocked).toBe(true);
  });

  it('во время рекламы буста пауза не открывается; после adDone — открывается', () => {
    const g = new Game(DATA, CFG);
    expect(g.debugBoostOffer()).toBe(true);
    expect(g.takeBoostOffer()).toBe(true);
    g.setMenu(true);
    expect(g.menu).toBe(false);
    expect(g.adDone(true)).toBe(true);
    g.setMenu(true);
    expect(g.menu).toBe(true);
  });
});
