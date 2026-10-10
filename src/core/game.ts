import { BossVisits, type BossSide } from './boss';
import { TIME_EPS } from './clock';
import type { CardKind, CardRow, Tables } from './data/tables';
import { Deck, type DeckContext, type OfferCard } from './deck';
import { Enemies, type EnemiesContext } from './enemies';
import { LocationEvents } from './events';
import { restoreGame, snapshotGame, type GameSnapshot } from './game-snapshot';
import { Net, type CaughtItem } from './net';
import { Progression } from './progression';
import { Raft, type Spot } from './raft';
import { Rng } from './rng';
import { Sailor } from './sailor';
import { Spear, type SpearTargets } from './spear';
import { Stats } from './stats';
import { Towers } from './towers';
import { buildingUpgrade, sailorUpgrade } from './upgrades';
import { World } from './world';

export interface GameConfig { halfW: number; halfH: number; speedMult: number; locationId: string; seed: number }
/** Окно выбора уровня level; на каждое окно — новый объект. */
export interface OfferWindow { level: number; cards: OfferCard[] }
export type Weapon = 'net' | 'spear';

export type { GameSnapshot } from './game-snapshot';

/** Виды карточек в игре. */
const KINDS: readonly CardKind[] = ['raft', 'building', 'building_upgrade', 'sailor_upgrade'];
/** Постройки, которые уже можно ставить (id из buildings.csv). */
export const BUILDINGS_IN_GAME: readonly string[] = ['net_tower'];
/** Роль предмета, улов которой (вместе со второй клеткой) приводит первого врага: в Лагуне — бочонок. */
const FIRST_ENEMY_ROLE = 'medium';

/** Ядро целиком: мир, плот, моряк, его сеть и копьё, враги, прогрессия, окно выбора, стройка, счётчики и команды ввода. */
export class Game {
  readonly world: World;
  readonly raft: Raft;
  readonly sailor: Sailor;
  readonly net: Net;
  readonly spear: Spear;
  readonly enemies: Enemies;
  readonly towers: Towers;
  readonly events: LocationEvents;
  readonly boss: BossVisits;
  readonly progression: Progression;
  readonly deck: Deck;
  readonly stats = new Stats();
  /** Сила локации: множитель опыта, тот же, что у Progression. */
  private readonly xpMult: number;
  window: OfferWindow | null = null;
  build: { card: string } | null = null;
  /** Открыто окно паузы. В снимок не входит: после загрузки игра идёт. */
  menu = false;
  /** Режим ремонта: мир стоит, нажатия по клеткам чинят. В снимок не входит: после загрузки игра идёт. */
  repair = false;
  /** Выбранный слот оружия. */
  weapon: Weapon = 'net';
  /** У моряка есть копьё (с первым врагом): видны слоты, в колоде — «Копьё сильнее». */
  spearOwned = false;
  /** Название оружия яруса моряка — подпись слота копья. */
  readonly weaponKey: string;
  /** Моряк уже шагал: подсказка о ходьбе больше не нужна. */
  hasWalked = false;
  /** Время мира, когда клеток впервые стало две; null — ещё не стало. */
  secondCellMs: number | null = null;
  /** Сеть хоть раз вернула предмет роли FIRST_ENEMY_ROLE. */
  mediumCaught = false;
  /** Уровни, чьи окна ещё не показаны. */
  private readonly pending: number[] = [];
  private readonly walkHintDelayMs: number;
  private readonly walkHintMaxLevel: number;
  private readonly repairPerTap: number;
  /** Удержание пальца: сеть тянется, только если выбран слот сети. */
  private hold = false;
  /** Цели копья моряка: враги и шхуна на визите. */
  private readonly spearTargets: SpearTargets = {
    hit: (x, y, reach, damage) => [...this.enemies.hit(x, y, reach, damage), ...this.boss.hit(x, y, reach, damage)],
  };

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
    this.spear = new Spear(data, this.sailor);
    this.spear.damage = tier.spearDamage;
    this.spear.range = tier.throwRange;
    this.weaponKey = tier.weaponKey;
    this.enemies = new Enemies(data, cfg.locationId, new Rng(cfg.seed + 2), this.world, this.stats);
    this.towers = new Towers(data, cfg.locationId, new Rng(cfg.seed + 4), this.stats);
    this.events = new LocationEvents(data, cfg.locationId);
    this.boss = new BossVisits(data, cfg.locationId, new Rng(cfg.seed + 5), this.world, this.stats);
    this.xpMult = loc.xpMult;
    this.progression = new Progression(data, loc.xpMult);
    // Постройки колоды: новинки этой локации и прошлых, из тех, что уже в игре.
    const buildings = data.locations
      .filter((l) => l.order <= loc.order)
      .flatMap((l) => l.newBuildings)
      .filter((b) => BUILDINGS_IN_GAME.includes(b));
    this.deck = new Deck(data, cfg.locationId, new Rng(cfg.seed + 1), KINDS, buildings);
    this.walkHintDelayMs = data.num('walk_hint_delay_ms');
    this.walkHintMaxLevel = data.num('walk_hint_max_level');
    this.repairPerTap = data.num('repair_per_tap');
  }

  /** Снимок партии: копии, дальнейшая игра его не меняет. */
  snapshot(): GameSnapshot {
    return { ...snapshotGame(this), pending: this.pending.slice(), hold: this.hold };
  }

  /** Партия из снимка. В cfg — нынешняя раскладка (поле и speedMult) и тот же сид. Битый снимок → throw. */
  static restore(data: Tables, cfg: GameConfig, s: GameSnapshot): Game {
    const g = new Game(data, cfg);
    restoreGame(g, s);
    g.pending.push(...s.pending);
    g.hold = s.hold;
    return g;
  }

  /** Открыто окно выбора, идёт стройка, открыта пауза или идёт ремонт: мир стоит. */
  get paused(): boolean {
    return this.window !== null || this.build !== null || this.menu || this.repair;
  }

  /** Окно паузы. Уровень, набранный до неё, открывает окно на первом шаге после. */
  setMenu(on: boolean): void {
    this.menu = on;
  }

  /** Режим ремонта. Выход — всегда; вход — только при повреждённой клетке, без окна выбора, стройки и паузы, иначе false. */
  setRepair(on: boolean): boolean {
    if (on && (!this.raft.damaged() || this.window !== null || this.build !== null || this.menu)) return false;
    this.repair = on;
    return true;
  }

  /**
   * Нажатие в ремонте по клетке (gx, gy): +repair_per_tap, не выше полной. Не ремонт, пауза или прибавить нечего → false.
   * Когда у всех клеток полная прочность, ремонт закрывается сам.
   */
  repairCell(gx: number, gy: number): boolean {
    if (!this.repair || this.menu || this.raft.repair(gx, gy, this.repairPerTap) === 0) return false;
    this.stats.repairTaps++;
    if (!this.raft.damaged()) this.repair = false;
    return true;
  }

  step(dtMs: number): void {
    if (this.paused) return;
    this.stats.gameMs += dtMs;
    // Множители события действуют уже в этом шаге. Спокойное время события стоит в визит, визита — в событие.
    this.events.step(dtMs, !this.boss.visiting);
    this.boss.step(dtMs, !this.events.active, this.events.count, this.raft);
    this.world.flowMult = this.events.flowMult;
    this.world.step(dtMs);
    const caught = this.net.step(dtMs, this.world);
    if (caught) {
      this.addCatch(caught);
      this.stats.itemsCaught += caught.length;
      if (caught.length === 0) this.stats.emptyThrows++;
    }
    const towerCaught = this.towers.step(dtMs, this.world, this.raft);
    if (towerCaught.length > 0) {
      this.addCatch(towerCaught);
      this.stats.towerCaught += towerCaught.length;
    }
    if (this.spear.step(dtMs, this.spearTargets).length > 0) this.stats.spearHits++;
    this.enemies.step(dtMs, this.enemiesContext());
    if (this.enemies.spawned > 0) this.spearOwned = true;
    this.stats.xpGained += this.progression.step(this.world.timeMs);
    this.collectLevelUps();
    this.openNext();
  }

  /** Выбранное оружие можно бросить: не пауза и оно у моряка. */
  canThrow(): boolean {
    if (this.paused) return false;
    return this.weapon === 'net' ? this.net.state === 'ready' : this.spear.state === 'ready';
  }

  /** Бросок выбранного оружия. Пауза или оружие не у моряка → false. */
  throwTo(x: number, y: number): boolean {
    if (this.paused) return false;
    if (this.weapon === 'spear') {
      const ok = this.spear.throwTo(x, y);
      if (ok) this.stats.spearThrows++;
      return ok;
    }
    const ok = this.net.throwTo(x, y);
    if (ok) this.stats.throws++;
    return ok;
  }

  /** Слот оружия. Работает и на паузе, как setPull. Копья ещё нет → false. */
  setWeapon(w: Weapon): boolean {
    if (w === 'spear' && !this.spearOwned) return false;
    this.weapon = w;
    // Переключение на сеть при зажатом пальце продолжает тягу, как у оригинала.
    this.net.setPull(this.hold && w === 'net');
    return true;
  }

  /** Шаг моряка на соседнюю клетку по стороне. Пауза, не по стороне, клетки нет или клетка разбита → false. */
  walk(dx: number, dy: number): boolean {
    if (this.paused || !this.sailor.move(dx, dy, this.raft)) return false;
    this.stats.steps++;
    this.hasWalked = true;
    // Сеть и копьё у моряка переезжают с ним; в воде и в полёте — догоняют его новую точку сами.
    if (this.net.state === 'ready') this.net.reset();
    if (this.spear.state === 'ready') this.spear.reset();
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

  /** Работает и на паузе: отпускание пальца во время окна выключает удержание. Сеть тянется только со слотом сети. */
  setPull(on: boolean): void {
    this.hold = on;
    this.net.setPull(on && this.weapon === 'net');
  }

  noteTap(): void {
    this.stats.taps++;
  }

  /** Взять карточку i окна (в порядке показа). Окна нет, индекса нет, карточка недоступна, открыта пауза → false. */
  takeCard(i: number): boolean {
    if (this.menu) return false;
    const w = this.window;
    const offer = w?.cards[i];
    if (!w || !offer || !offer.available) return false;
    const card = this.deck.card(offer.id);
    // Сначала проверки и расчёт: ошибка оставляет окно открытым, а карточку — невзятой.
    let apply: (() => void) | null = null;
    if (card.kind === 'sailor_upgrade') apply = sailorUpgrade(card, this.net, this.spear);
    else if (card.kind === 'building_upgrade') apply = buildingUpgrade(card, this.towers);
    else if (card.kind === 'building' && !BUILDINGS_IN_GAME.includes(card.target)) throw new Error(`takeCard: постройка ${card.target} ещё не в игре`);
    this.deck.take(card.id, w.level);
    this.window = null;
    if (apply) {
      apply();
      this.openNext();
    } else {
      this.build = { card: card.id };
    }
    return true;
  }

  /** Место (gx, gy) подходит стройке: у «Плота» — новая клетка, у постройки — свободная целая. Стройки нет → false. Паузу не смотрит. */
  canPlace(gx: number, gy: number): boolean {
    const card = this.buildCard();
    if (!card) return false;
    return card.kind === 'raft' ? this.raft.canAdd(gx, gy) : this.raft.canBuild(gx, gy);
  }

  /** Места стройки: у «Плота» — raft.candidates(), у постройки — raft.buildSpots(). Стройки нет → []. */
  buildSpots(): Spot[] {
    const card = this.buildCard();
    if (!card) return [];
    return card.kind === 'raft' ? this.raft.candidates() : this.raft.buildSpots();
  }

  /** Стройка на (gx, gy): у «Плота» — клетка, у постройки — постройка target. Стройки нет, место не подходит или открыта пауза → false. */
  placeCell(gx: number, gy: number): boolean {
    const card = this.buildCard();
    if (this.menu || !card || !this.canPlace(gx, gy)) return false;
    if (card.kind === 'raft') this.raft.add(gx, gy);
    else {
      this.raft.build(gx, gy, card.target);
      this.towers.sync(this.raft);
    }
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

  /**
   * Отладка: враг сейчас, без условия и таймера; обычное расписание не запускает, работает и на паузе.
   * С точкой — появляется в ней и туда же уходит. Даёт копьё, как первый враг.
   */
  debugSpawnEnemy(x?: number, y?: number): void {
    const at = x !== undefined && y !== undefined ? { x, y } : null;
    if (this.enemies.spawnNow(this.enemiesContext(), at)) this.spearOwned = true;
  }

  /** Отладка: событие локации сейчас (идёт — начинается заново); работает и на паузе. */
  debugEvent(): void {
    this.events.start();
  }

  /** Отладка: визит босса сейчас вдоль стороны side (нет — случайной); работает и на паузе. */
  debugBossVisit(side?: BossSide): void {
    this.boss.start(this.raft, side);
  }

  /** Отладка: урон клетке сейчас (центральная неуязвима), и на паузе; ответ — сколько снято. Не укус: в bites и cellDamage не идёт. */
  debugDamageCell(gx: number, gy: number, amount: number): number {
    return this.raft.damage(gx, gy, amount);
  }

  /** Отладка: уровень прогрессии и потока. */
  setLevel(level: number): void {
    this.progression.setLevel(level);
    this.world.setLevel(level);
  }

  /** Улов сети или башен: значки, опыт по ролям, бочонок для первого врага. */
  private addCatch(caught: CaughtItem[]): void {
    this.progression.addCatch(caught, this.world.timeMs);
    for (const it of caught) this.stats.xpByRole[it.role] += it.xp * this.xpMult;
    if (caught.some((it) => it.role === FIRST_ENEMY_ROLE)) this.mediumCaught = true;
  }

  private buildCard(): CardRow | null {
    return this.build && this.deck.card(this.build.card);
  }

  private enemiesContext(): EnemiesContext {
    return {
      raft: this.raft, level: this.progression.level, ready: this.raft.cells.length >= 2 && this.mediumCaught,
      buildings: this.raft.buildingCount(), rateMult: this.events.enemyRateMult,
    };
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
      has: (b) => this.raft.hasBuilding(b),
      spearOwned: this.spearOwned,
      bossVisitSeen: false,
    };
  }
}
