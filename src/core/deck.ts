import type { CardKind, CardRow, Tables } from './data/tables';
import type { Rng } from './rng';

/** Карточка окна: id из cards.csv; недоступная видна затемнённой, reason — ключ строки причины. */
export interface OfferCard { id: string; available: boolean; reason: string | null }

/** Что колода видит у игры, когда собирает окно. */
export interface DeckContext {
  freeCells: number;                // raft.freeCells()
  canAddCell: boolean;              // raft.candidates().length > 0
  has(building: string): boolean;   // такая постройка стоит на плоту (в M0 — всегда false)
  spearOwned: boolean;              // у моряка есть копьё (с M0-08)
  bossVisitSeen: boolean;           // был визит босса (M1)
}

export interface DeckSnapshot { takes: Array<[string, { count: number; lastLevel: number }]>; rng: number }

export const NEED_FREE_CELL = 'ui.need_free_cell';

/**
 * Колода локации: что предлагать в окне выбора и сколько раз что взято.
 * Окно — выбор по весам card_weight_<kind> без возвращения, принудительная карточка уровня,
 * «Плот» при нехватке свободных клеток (решение 09.10), доступные — первыми.
 */
export class Deck {
  private readonly takes = new Map<string, { count: number; lastLevel: number }>();

  constructor(
    private readonly data: Tables,
    private readonly locationId: string,
    private readonly rng: Rng,
    private readonly kinds: readonly CardKind[],
  ) {}

  /** Строка cards.csv; нет такой → throw. */
  card(id: string): CardRow {
    const c = this.data.cards.find((x) => x.id === id);
    if (!c) throw new Error(`cards.csv: нет карточки ${id}`);
    return c;
  }

  /** Карточек в окне уровня level. */
  size(level: number): number {
    if (level === 2) return this.data.num('window_cards_level2');
    if (level === 3) return this.data.num('window_cards_level3');
    return this.data.num('window_cards');
  }

  take(id: string, level: number): void {
    this.card(id);
    const t = this.takes.get(id);
    this.takes.set(id, { count: (t?.count ?? 0) + 1, lastLevel: level });
  }

  taken(id: string): number {
    return this.takes.get(id)?.count ?? 0;
  }

  snapshot(): DeckSnapshot {
    return { takes: [...this.takes].map(([id, t]) => [id, { ...t }]), rng: this.rng.getState() };
  }

  restore(s: DeckSnapshot): void {
    this.takes.clear();
    for (const [id, t] of s.takes) this.takes.set(id, { count: t.count, lastLevel: t.lastLevel });
    this.rng.setState(s.rng);
  }

  /** Окно уровня level; [] — доступной карточки нет, окно не открывается. */
  offer(level: number, ctx: DeckContext): OfferCard[] {
    const n = this.size(level);
    const pool = this.data.cards.filter((c) => this.canOffer(c, level, ctx));
    const picks: CardRow[] = [];
    while (picks.length < n && pool.length > 0) {
      const total = pool.reduce((s, c) => s + this.weight(c), 0);
      let r = this.rng.next() * total;
      let i = 0;
      for (; i < pool.length - 1; i++) {
        r -= this.weight(pool[i]!);
        if (r < 0) break;
      }
      picks.push(pool.splice(i, 1)[0]!);
    }

    const forcedRow = this.data.forcedCards.find((f) => f.location === this.locationId && f.trigger === `level:${level}`);
    const forced = forcedRow ? this.card(forcedRow.card) : null;
    const forcedId = forced && this.canOffer(forced, level, ctx) ? forced.id : null;
    if (forcedId !== null && !picks.some((c) => c.id === forcedId) && picks.length > 0) {
      picks[picks.length - 1] = forced!;
    }

    const raft = this.data.cards.find((c) => c.kind === 'raft');
    if (ctx.freeCells === 0 && raft && this.canOffer(raft, level, ctx) && !picks.some((c) => c.id === raft.id) && picks.length > 0) {
      let at = picks.length - 1;
      for (let i = picks.length - 1; i >= 0; i--) {
        if (picks[i]!.id !== forcedId) {
          at = i;
          break;
        }
      }
      picks[at] = raft;
    }

    const cards = picks.map((c) => this.availability(c, ctx));
    const sorted = [...cards.filter((c) => c.available), ...cards.filter((c) => !c.available)];
    return sorted.some((c) => c.available) ? sorted : [];
  }

  private weight(c: CardRow): number {
    return this.data.num(`card_weight_${c.kind}`);
  }

  private availability(c: CardRow, ctx: DeckContext): OfferCard {
    if (c.kind === 'building' && ctx.freeCells === 0) return { id: c.id, available: false, reason: NEED_FREE_CELL };
    return { id: c.id, available: true, reason: null };
  }

  /** Карточку можно предложить на уровне level: вид в игре, предел, промежуток уровней, условие. */
  private canOffer(c: CardRow, level: number, ctx: DeckContext): boolean {
    if (!this.kinds.includes(c.kind)) return false;
    if (c.kind === 'raft' && !ctx.canAddCell) return false;
    const t = this.takes.get(c.id);
    if (c.maxPerLocation !== null && (t?.count ?? 0) >= c.maxPerLocation) return false;
    if (c.minLevelGap !== null && t && level - t.lastLevel < c.minLevelGap) return false;
    return c.requires === null || this.requires(c, level, ctx);
  }

  private requires(c: CardRow, level: number, ctx: DeckContext): boolean {
    const req = c.requires!;
    if (req === 'boss_visit_seen') return ctx.bossVisitSeen;
    if (req === 'spear_owned') return ctx.spearOwned;
    if (req.startsWith('level:')) {
      const n = Number(req.slice('level:'.length));
      if (!Number.isFinite(n)) throw new Error(`cards.csv: ${c.id}: requires «${req}»`);
      return level >= n;
    }
    if (req.startsWith('has:')) return ctx.has(req.slice('has:'.length));
    throw new Error(`cards.csv: ${c.id}: неизвестное requires «${req}»`);
  }
}
