import { describe, expect, it } from 'vitest';
import type { CardKind } from '../../src/core/data/tables';
import { Deck, NEED_FREE_CELL, type DeckContext, type OfferCard } from '../../src/core/deck';
import { Rng } from '../../src/core/rng';
import { DATA } from '../../src/data';

const M0: CardKind[] = ['raft', 'sailor_upgrade'];
const ALL: CardKind[] = ['raft', 'building', 'building_upgrade', 'sailor_upgrade'];
const LOC = 'lagoon';

function deck(kinds: CardKind[], seed = 1): Deck {
  return new Deck(DATA, LOC, new Rng(seed), kinds);
}

function ctx(over: Partial<DeckContext> = {}): DeckContext {
  return { freeCells: 5, canAddCell: true, has: () => false, spearOwned: false, bossVisitSeen: false, ...over };
}

const kindOf = (c: OfferCard): CardKind => DATA.cards.find((x) => x.id === c.id)!.kind;
const ids = (cards: OfferCard[]): string[] => cards.map((c) => c.id);
const card = (id: string) => DATA.cards.find((c) => c.id === id)!;

/** Сколько окон из count на уровне level содержат карточку id. */
function seen(d: Deck, level: number, c: DeckContext, id: string, count = 300): number {
  let n = 0;
  for (let i = 0; i < count; i++) if (ids(d.offer(level, c)).includes(id)) n++;
  return n;
}

describe('Deck', () => {
  it('размеры окна: 2 уровень, 3 уровень, дальше', () => {
    const d = deck(M0);
    expect(d.size(2)).toBe(DATA.num('window_cards_level2'));
    expect(d.size(3)).toBe(DATA.num('window_cards_level3'));
    expect(d.size(4)).toBe(DATA.num('window_cards'));
    expect(d.offer(3, ctx())).toHaveLength(DATA.num('window_cards_level3'));
    expect(d.offer(4, ctx())).toHaveLength(DATA.num('window_cards'));
  });

  it('card: нет такой — ошибка', () => {
    expect(() => deck(M0).card('nope')).toThrow(/nope/);
  });

  it('на 2 уровне — всегда [raft]', () => {
    for (let seed = 1; seed <= 100; seed++) {
      expect(ids(deck(M0, seed).offer(2, ctx()))).toEqual(['raft']);
      expect(ids(deck(ALL, seed).offer(2, ctx()))).toEqual(['raft']);
    }
  });

  it('с видами M0 постройки и их улучшения не попадаются', () => {
    const d = deck(M0, 7);
    const c = ctx({ has: () => true, bossVisitSeen: true });
    for (let i = 0; i < 1000; i++) {
      for (const x of d.offer(4 + (i % 7), c)) expect(['raft', 'sailor_upgrade']).toContain(kindOf(x));
    }
  });

  it('throw_farther после max_per_location взятий не предлагается', () => {
    const d = deck(M0, 3);
    const max = card('throw_farther').maxPerLocation!;
    for (let i = 0; i < max - 1; i++) d.take('throw_farther', 4 + i);
    expect(d.taken('throw_farther')).toBe(max - 1);
    expect(seen(d, 20, ctx(), 'throw_farther')).toBeGreaterThan(0);
    d.take('throw_farther', 20);
    expect(seen(d, 20, ctx(), 'throw_farther')).toBe(0);
  });

  it('spear_stronger — только при spearOwned', () => {
    expect(seen(deck(ALL, 4), 8, ctx(), 'spear_stronger')).toBe(0);
    expect(seen(deck(ALL, 4), 8, ctx({ spearOwned: true }), 'spear_stronger')).toBeGreaterThan(0);
  });

  it('улучшение постройки — только при has', () => {
    expect(seen(deck(ALL, 5), 8, ctx(), 'net_tower_faster')).toBe(0);
    expect(seen(deck(ALL, 5), 8, ctx({ has: (b) => b === 'net_tower' }), 'net_tower_faster')).toBeGreaterThan(0);
  });

  it('whirlpool (level:6) — не раньше 6 уровня', () => {
    const d = deck(ALL, 6);
    expect(card('whirlpool').requires).toBe('level:6');
    expect(seen(d, 4, ctx(), 'whirlpool') + seen(d, 5, ctx(), 'whirlpool')).toBe(0);
    expect(seen(d, 7, ctx(), 'whirlpool')).toBeGreaterThan(0);
  });

  it('копейная башня — после визита босса; её улучшение — через min_level_gap уровней', () => {
    const d = deck(ALL, 8);
    expect(seen(d, 8, ctx(), 'spear_tower')).toBe(0);
    expect(seen(d, 8, ctx({ bossVisitSeen: true }), 'spear_tower')).toBeGreaterThan(0);
    const gap = card('spear_tower_stronger').minLevelGap!;
    const c = ctx({ bossVisitSeen: true, has: (b) => b === 'spear_tower' });
    d.take('spear_tower_stronger', 10);
    for (let l = 10; l < 10 + gap; l++) expect(seen(d, l, c, 'spear_tower_stronger')).toBe(0);
    expect(seen(d, 10 + gap, c, 'spear_tower_stronger')).toBeGreaterThan(0);
  });

  it('нет свободной клетки: постройки затемнены с причиной, «Плот» есть, доступные — первыми', () => {
    let blocked = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const cards = deck(ALL, seed).offer(5, ctx({ freeCells: 0 }));
      expect(ids(cards)).toContain('raft');
      const firstBlocked = cards.findIndex((c) => !c.available);
      for (const [i, c] of cards.entries()) {
        if (kindOf(c) === 'building') {
          expect(c).toEqual({ id: c.id, available: false, reason: NEED_FREE_CELL });
          blocked++;
        } else {
          expect(c.available).toBe(true);
        }
        if (firstBlocked >= 0 && i > firstBlocked) expect(c.available).toBe(false);
      }
    }
    expect(blocked).toBeGreaterThan(0);
    for (let seed = 1; seed <= 50; seed++) {
      for (const c of deck(ALL, seed).offer(5, ctx({ freeCells: 1 }))) expect(c.available).toBe(true);
    }
  });

  it('принудительная net_tower на 4 уровне — в окне при любом сиде', () => {
    expect(DATA.forcedCards.find((f) => f.location === LOC && f.trigger === 'level:4')?.card).toBe('net_tower');
    for (let seed = 1; seed <= 200; seed++) expect(ids(deck(ALL, seed).offer(4, ctx()))).toContain('net_tower');
  });

  it('веса: первая карточка на 4 уровне — «Плот» с частотой по card_weight_*', () => {
    const d = deck(M0, 11);
    const sailorCards = DATA.cards.filter((c) => c.kind === 'sailor_upgrade' && c.requires === null).length;
    const wRaft = DATA.num('card_weight_raft');
    const expected = wRaft / (wRaft + sailorCards * DATA.num('card_weight_sailor_upgrade'));
    let first = 0;
    const N = 4000;
    for (let i = 0; i < N; i++) if (d.offer(4, ctx())[0]!.id === 'raft') first++;
    expect(Math.abs(first / N - expected)).toBeLessThanOrEqual(0.03);
  });

  it('нечего предложить или всё недоступно — []', () => {
    const d = deck(M0, 12);
    for (const c of DATA.cards.filter((x) => x.kind === 'sailor_upgrade' && x.maxPerLocation !== null)) {
      for (let i = 0; i < c.maxPerLocation!; i++) d.take(c.id, 4);
    }
    expect(d.offer(5, ctx({ canAddCell: false }))).toEqual([]);
    expect(d.offer(5, ctx()).map((c) => c.id)).toEqual(['raft']);

    const all = deck(ALL, 12);
    for (const c of DATA.cards.filter((x) => x.kind === 'sailor_upgrade' && x.maxPerLocation !== null)) {
      for (let i = 0; i < c.maxPerLocation!; i++) all.take(c.id, 4);
    }
    for (let i = 0; i < 50; i++) expect(all.offer(5, ctx({ freeCells: 0, canAddCell: false }))).toEqual([]);
  });

  it('один сид — одни и те же окна', () => {
    const a = deck(ALL, 42);
    const b = deck(ALL, 42);
    for (let l = 2; l < 30; l++) expect(a.offer(l, ctx())).toEqual(b.offer(l, ctx()));
  });

  it('неизвестное requires — ошибка', () => {
    const data = { ...DATA, cards: [{ ...card('net_wider'), requires: 'moon_phase' }] };
    expect(() => new Deck(data, LOC, new Rng(1), M0).offer(5, ctx())).toThrow(/moon_phase/);
  });
});
