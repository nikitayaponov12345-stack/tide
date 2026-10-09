import { TIME_EPS } from './clock';
import type { CardKind, CardRow, Tables } from './data/tables';
import { Deck, type DeckContext, type OfferCard } from './deck';
import { Net, type NetParams } from './net';
import { Progression } from './progression';
import { Raft } from './raft';
import { Rng } from './rng';
import { Sailor } from './sailor';
import { Stats } from './stats';
import { World } from './world';

export interface GameConfig { halfW: number; halfH: number; speedMult: number; locationId: string; seed: number }
/** Окно выбора уровня level; на каждое окно — новый объект. */
export interface OfferWindow { level: number; cards: OfferCard[] }

/** Виды карточек M0: постройки и их улучшения придут в M1 вместе с механиками. */
const M0_KINDS: readonly CardKind[] = ['raft', 'sailor_upgrade'];
/** Показатель карточки моряка → поле параметров сети. */
const NET_STATS: Record<string, keyof NetParams> = { net_radius: 'radius', net_capacity: 'capacity', throw_range: 'range', pull: 'pull' };

/** Ядро целиком: мир, плот, моряк, его сеть, прогрессия, окно выбора, стройка, счётчики и команды ввода. */
export class Game {
  readonly world: World;
  readonly raft: Raft;
  readonly sailor: Sailor;
  readonly net: Net;
  readonly progression: Progression;
  readonly deck: Deck;
  readonly stats = new Stats();
  window: OfferWindow | null = null;
  build: { card: string } | null = null;
  /** Моряк уже шагал: подсказка о ходьбе больше не нужна. В сохранение — M1. */
  hasWalked = false;
  /** Время мира, когда клеток впервые стало две; null — ещё не стало. В сохранение — M1. */
  secondCellMs: number | null = null;
  /** Уровни, чьи окна ещё не показаны. */
  private readonly pending: number[] = [];
  private readonly walkHintDelayMs: number;
  private readonly walkHintMaxLevel: number;

  constructor(data: Tables, cfg: GameConfig) {
    const loc = data.location(cfg.locationId);
    this.world = new World(
      { halfW: cfg.halfW, halfH: cfg.halfH, speedMult: cfg.speedMult, locationId: cfg.locationId, level: 1 },
      data,
      new Rng(cfg.seed),
    );
    this.raft = new Raft(data);
    this.sailor = new Sailor(data);
    const tier = data.sailorTier(loc.order);
    this.net = new Net(data, { radius: tier.netRadius, capacity: tier.netCapacity, range: tier.throwRange, pull: tier.pull }, this.sailor);
    this.progression = new Progression(data, loc.xpMult);
    this.deck = new Deck(data, cfg.locationId, new Rng(cfg.seed + 1), M0_KINDS);
    this.walkHintDelayMs = data.num('walk_hint_delay_ms');
    this.walkHintMaxLevel = data.num('walk_hint_max_level');
  }

  /** Открыто окно выбора или идёт стройка: мир стоит. */
  get paused(): boolean {
    return this.window !== null || this.build !== null;
  }

  step(dtMs: number): void {
    if (this.paused) return;
    this.stats.gameMs += dtMs;
    this.world.step(dtMs);
    const caught = this.net.step(dtMs, this.world);
    if (caught) {
      this.progression.addCatch(caught, this.world.timeMs);
      this.stats.itemsCaught += caught.length;
      if (caught.length === 0) this.stats.emptyThrows++;
    }
    this.stats.xpGained += this.progression.step(this.world.timeMs);
    this.collectLevelUps();
    this.openNext();
  }

  throwTo(x: number, y: number): boolean {
    if (this.paused) return false;
    const ok = this.net.throwTo(x, y);
    if (ok) this.stats.throws++;
    return ok;
  }

  /** Шаг моряка на соседнюю клетку по стороне. Пауза, не по стороне или клетки нет → false. */
  walk(dx: number, dy: number): boolean {
    if (this.paused || !this.sailor.move(dx, dy, this.raft)) return false;
    this.stats.steps++;
    this.hasWalked = true;
    // Сеть у моряка переезжает с ним; сеть в воде тянется к его новой точке сама.
    if (this.net.state === 'ready') this.net.reset();
    return true;
  }

  /** Подсказка о ходьбе: две клетки и больше, ещё не шагал, уровень ниже порога, не пауза, после второй клетки прошла задержка. */
  get walkHint(): boolean {
    return (
      this.raft.cells.length >= 2 &&
      !this.hasWalked &&
      this.progression.level < this.walkHintMaxLevel &&
      !this.paused &&
      this.secondCellMs !== null &&
      this.world.timeMs - this.secondCellMs + TIME_EPS >= this.walkHintDelayMs
    );
  }

  /** Работает и на паузе: отпускание пальца во время окна выключает удержание. */
  setPull(on: boolean): void {
    this.net.setPull(on);
  }

  noteTap(): void {
    this.stats.taps++;
  }

  /** Взять карточку i окна (в порядке показа). Окна нет, индекса нет, карточка недоступна → false. */
  takeCard(i: number): boolean {
    const w = this.window;
    const offer = w?.cards[i];
    if (!w || !offer || !offer.available) return false;
    const card = this.deck.card(offer.id);
    // Сначала проверки и расчёт: ошибка оставляет окно открытым, а карточку — невзятой.
    let params: NetParams | null = null;
    if (card.kind === 'sailor_upgrade') params = this.upgradedNet(card);
    else if (card.kind !== 'raft') throw new Error(`takeCard: вид ${card.kind} (${card.id}) ещё не в игре`);
    this.deck.take(card.id, w.level);
    this.window = null;
    if (params) {
      this.net.setParams(params);
      this.openNext();
    } else {
      this.build = { card: card.id };
    }
    return true;
  }

  /** Стройка: клетка на (gx, gy). Стройки нет или место не подходит → false. */
  placeCell(gx: number, gy: number): boolean {
    if (!this.build || !this.raft.canAdd(gx, gy)) return false;
    this.raft.add(gx, gy);
    if (this.secondCellMs === null && this.raft.cells.length >= 2) this.secondCellMs = this.world.timeMs;
    this.build = null;
    this.openNext();
    return true;
  }

  /** Отладка: опыт до следующего уровня сразу; окно открывается тут же. В stats.xpGained не входит. */
  debugLevelUp(): void {
    const p = this.progression;
    const level = p.level;
    p.addXp(p.xpToNext() - p.xp);
    // xp + (step − xp) может не дотянуть до step на долю ulp — тогда добираем чуть с запасом.
    if (p.level === level) p.addXp((p.xpToNext() - p.xp) * (1 + 1e-9));
    this.collectLevelUps();
    this.openNext();
  }

  /** Отладка: уровень прогрессии и потока. */
  setLevel(level: number): void {
    this.progression.setLevel(level);
    this.world.setLevel(level);
  }

  private collectLevelUps(): void {
    this.pending.push(...this.progression.takeLevelUps());
    if (this.world.level !== this.progression.level) this.world.setLevel(this.progression.level);
  }

  /** Следующее окно из очереди; уровень без доступной карточки — без окна. */
  private openNext(): void {
    while (!this.paused && this.pending.length > 0) {
      const level = this.pending.shift()!;
      const cards = this.deck.offer(level, this.deckContext());
      if (cards.length > 0) this.window = { level, cards };
    }
  }

  private deckContext(): DeckContext {
    return {
      freeCells: this.raft.freeCells(),
      canAddCell: this.raft.candidates().length > 0,
      has: () => false,
      spearOwned: false,
      bossVisitSeen: false,
    };
  }

  /** Параметры сети после карточки моряка: add — += value, mul — × (1 + value), set — = value. */
  private upgradedNet(card: CardRow): NetParams {
    const key = card.stat === null ? undefined : NET_STATS[card.stat];
    if (!key || card.value === null || card.mode === null) {
      throw new Error(`takeCard: ${card.id} не меняет сеть (stat ${card.stat ?? '—'})`);
    }
    const p = { ...this.net.netParams };
    if (card.mode === 'add') p[key] += card.value;
    else if (card.mode === 'mul') p[key] *= 1 + card.value;
    else p[key] = card.value;
    return p;
  }
}
