import { BossVisits, type BossSide } from './boss';
import { BOTTLE_ROLE, Boost } from './boost';
import { BoostOffer } from './boost-offer';
import { TIME_EPS } from './clock';
import { FLOW_ROLES, type CardKind, type Tables } from './data/tables';
import { Deck, type OfferCard } from './deck';
import { Enemies } from './enemies';
import { LocationEvents } from './events';
import { FinalBoss } from './final-boss';
import { BUILDINGS_IN_GAME, buildSpots, canPlace, collectLevelUps, debugLevelUp, openNext, placeCell, takeCard, unlockWhirlpool } from './game-cards';
import { restoreGame, snapshotGame, type GameSnapshot } from './game-snapshot';
import { enemiesContext, finalHit, levelCap, playOn, stepThreats } from './game-threats';
import { Net, type CaughtItem } from './net';
import { Progression } from './progression';
import { Raft, type Spot } from './raft';
import { Rng } from './rng';
import { Sailor } from './sailor';
import { Spear, type SpearTargets } from './spear';
import { SpearTowers } from './spear-towers';
import { Stats } from './stats';
import { Towers } from './towers';
import { Whirlpools } from './whirlpools';
import { World } from './world';

/** rewarded — у площадки есть реклама за награду (нет поля — есть); whirlpoolUnlocked — воронку уже открыли в кампании (нет поля — нет). */
export interface GameConfig { halfW: number; halfH: number; speedMult: number; locationId: string; seed: number; rewarded?: boolean; whirlpoolUnlocked?: boolean }
/** Окно выбора уровня level; на каждое окно — новый объект. */
export interface OfferWindow { level: number; cards: OfferCard[] }
export type Weapon = 'net' | 'spear';

export type { GameSnapshot } from './game-snapshot';

/** Виды карточек в игре. */
const KINDS: readonly CardKind[] = ['raft', 'building', 'building_upgrade', 'sailor_upgrade'];
/** Роль предмета, улов которой (вместе со второй клеткой) приводит первого врага: в Лагуне — бочонок. */
const FIRST_ENEMY_ROLE = 'medium';

/** Ядро целиком: мир, плот, моряк, его сеть и копьё, враги, буст, прогрессия, окно выбора, стройка (game-cards.ts), счётчики и команды ввода. */
export class Game {
  readonly world: World;
  readonly raft: Raft;
  readonly sailor: Sailor;
  readonly net: Net;
  readonly spear: Spear;
  readonly enemies: Enemies;
  readonly towers: Towers;
  readonly spearTowers: SpearTowers;
  readonly whirlpools: Whirlpools;
  readonly events: LocationEvents;
  readonly boss: BossVisits;
  readonly finalBoss: FinalBoss;
  readonly boost: Boost;
  readonly boostOffer: BoostOffer;
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
  /** Идёт реклама за награду: мир стоит. В снимок не входит: после загрузки рекламы нет и награды нет. */
  ad = false;
  /** Открыто окно «Локация пройдена» (M1-15): мир стоит. Входит в снимок: после загрузки окно на месте. */
  cleared = false;
  /** У площадки есть реклама за награду. */
  readonly rewarded: boolean;
  /** Воронка открыта на всю кампанию (M1-14). В снимок не входит: это запись кампании. */
  whirlpoolUnlocked: boolean;
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
  /** Уровни, чьи окна ещё не показаны. Открыто для game-cards.ts и снимка; снаружи не трогать. */
  readonly pending: number[] = [];
  private readonly walkHintDelayMs: number;
  private readonly walkHintMaxLevel: number;
  private readonly repairPerTap: number;
  /** Удержание пальца: сеть тянется, только если выбран слот сети. */
  private hold = false;
  /** Цели копья моряка и копейных башен: враги, босс на визите и финальный босс. */
  private readonly spearTargets: SpearTargets = {
    hit: (x, y, reach, damage) => [
      ...this.enemies.hit(x, y, reach, damage), ...this.boss.hit(x, y, reach, damage), ...finalHit(this, x, y, reach, damage),
    ],
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
    this.spearTowers = new SpearTowers(data, cfg.locationId, this.stats);
    this.whirlpools = new Whirlpools(data, cfg.locationId);
    this.events = new LocationEvents(data, cfg.locationId);
    this.boss = new BossVisits(data, cfg.locationId, new Rng(cfg.seed + 5), this.world, this.stats);
    this.finalBoss = new FinalBoss(data, cfg.locationId, this.world, this.stats);
    this.boost = new Boost(data, new Rng(cfg.seed + 6), this.world);
    this.rewarded = cfg.rewarded ?? true;
    this.whirlpoolUnlocked = cfg.whirlpoolUnlocked ?? false;
    this.boostOffer = new BoostOffer(data, this.rewarded);
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
    this.progression.maxLevel = levelCap(this);
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

  /** Открыто окно выбора, идёт стройка, открыта пауза, идёт ремонт или реклама, открыто «Локация пройдена»: мир стоит. */
  get paused(): boolean {
    return this.window !== null || this.build !== null || this.menu || this.repair || this.ad || this.cleared;
  }

  /** Окно паузы. Уровень, набранный до неё, открывает окно на первом шаге после. */
  setMenu(on: boolean): void {
    if (on && (this.ad || this.cleared)) return; // во время рекламы и поверх «Локация пройдена» не открывается
    this.menu = on;
  }

  /** Режим ремонта. Выход — всегда; вход — только при повреждённой клетке, без окна выбора, стройки, паузы и «Локация пройдена», иначе false. */
  setRepair(on: boolean): boolean {
    if (on && (!this.raft.damaged() || this.window !== null || this.build !== null || this.menu || this.cleared)) return false;
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
    // Угрозы первыми: множители события и буста действуют уже в этом шаге (порядок — в game-threats.ts).
    stepThreats(this, dtMs);
    this.world.step(dtMs);
    const caught = this.net.step(dtMs, this.world);
    if (caught) {
      this.addCatch(caught);
      this.stats.itemsCaught += caught.length;
      if (caught.length === 0) this.stats.emptyThrows++;
    }
    // Улов башен и воронок — опыт и значки, как улов сети моряка (без счётчиков бросков моряка).
    const fromTowers = this.towers.step(dtMs, this.world, this.raft);
    const fromWhirlpools = this.whirlpools.step(dtMs, this.world, this.raft);
    this.stats.towerCaught += fromTowers.length;
    this.stats.whirlpoolCaught += fromWhirlpools.length;
    if (fromTowers.length + fromWhirlpools.length > 0) this.addCatch([...fromTowers, ...fromWhirlpools]);
    if (this.spear.step(dtMs, this.spearTargets).length > 0) this.stats.spearHits++;
    this.spearTowers.step(dtMs, this.enemies, [this.boss, this.finalBoss], this.spearTargets, this.raft);
    this.enemies.step(dtMs, enemiesContext(this));
    if (this.enemies.spawned > 0) this.spearOwned = true;
    this.stats.xpGained += this.progression.step(this.world.timeMs);
    collectLevelUps(this);
    openNext(this);
  }

  /** Нажатие на кнопку буста за рекламу: она гаснет, мир стоит до adDone. Пауза или кнопки нет → false. */
  takeBoostOffer(): boolean {
    if (this.paused || !this.boostOffer.take()) return false;
    this.ad = true;
    return true;
  }

  /** Реклама кончилась; досмотрена (rewarded) — буст на boost_ad_s, враги на поле гибнут без добычи. Рекламы нет → false. */
  adDone(rewarded: boolean): boolean {
    if (!this.ad) return false;
    this.ad = false;
    if (rewarded) {
      this.boost.start(this.boostOffer.adBoostMs);
      this.stats.boostKills += this.enemies.killAll();
    }
    return true;
  }

  /** «Играть дальше» в окне «Локация пройдена»: окно закрывается, уровни идут дальше. Окна нет → false. */
  playOn(): boolean {
    return playOn(this);
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
    return takeCard(this, i);
  }

  /** Место (gx, gy) подходит стройке: у «Плота» — новая клетка, у постройки — свободная целая. Стройки нет → false. Паузу не смотрит. */
  canPlace(gx: number, gy: number): boolean {
    return canPlace(this, gx, gy);
  }

  /** Места стройки: у «Плота» — raft.candidates(), у постройки — raft.buildSpots(). Стройки нет → []. */
  buildSpots(): Spot[] {
    return buildSpots(this);
  }

  /** Стройка на (gx, gy): у «Плота» — клетка, у постройки — постройка target. Стройки нет, место не подходит или открыта пауза → false. */
  placeCell(gx: number, gy: number): boolean {
    return placeCell(this, gx, gy);
  }

  /** Башни и воронки — по постройкам плота: новые постройки получают свои башни и воронки. */
  syncBuildings(): void {
    this.towers.sync(this.raft);
    this.spearTowers.sync(this.raft);
    this.whirlpools.sync(this.raft);
  }

  /** Отладка: постройка id из BUILDINGS_IN_GAME на целую свободную клетку (gx, gy) без карточки, и на паузе. Нельзя → false. */
  debugBuild(gx: number, gy: number, id: string): boolean {
    if (!BUILDINGS_IN_GAME.includes(id) || !this.raft.canBuild(gx, gy)) return false;
    this.raft.build(gx, gy, id);
    this.syncBuildings();
    return true;
  }

  /** Отладка: опыт до следующего уровня сразу; окно открывается тут же. В stats.xpGained не входит. */
  debugLevelUp(): void {
    debugLevelUp(this);
  }

  /** Воронка открыта рекламой на всю кампанию; открытое окно пересчитывает доступность. Нет рекламы за награду или уже открыта → false. */
  unlockWhirlpool(): boolean {
    return unlockWhirlpool(this);
  }

  /**
   * Отладка: враг сейчас, без условия и таймера; обычное расписание не запускает, работает и на паузе.
   * С точкой — появляется в ней и туда же уходит. Даёт копьё, как первый враг; leader — вожак события (M1-16).
   */
  debugSpawnEnemy(x?: number, y?: number, leader = false): void {
    const at = x !== undefined && y !== undefined ? { x, y } : null;
    if (this.enemies.spawnNow(enemiesContext(this), at, leader)) this.spearOwned = true;
  }

  /** Отладка: событие локации сейчас (идёт — начинается заново); работает и на паузе. */
  debugEvent(): void {
    this.events.start();
  }

  /** Отладка: визит босса сейчас вдоль стороны side (нет — случайной); работает и на паузе. */
  debugBossVisit(side?: BossSide): void {
    this.boss.start(this.raft, side);
  }

  /** Отладка: буст на ms (нет — как от бутылки); идёт — время прибавляется. Работает и на паузе. */
  debugBoost(ms?: number): void {
    this.boost.start(ms ?? this.boost.bottleMs);
  }

  /** Отладка: кнопка буста за рекламу сейчас, без таймера и условий, и на паузе. Рекламы за награду нет → false. */
  debugBoostOffer(): boolean {
    return this.boostOffer.show();
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

  /**
   * Улов сети или башен: значки, опыт по ролям, бочонок для первого врага. Под бустом опыт потока идёт ещё и в boostFlowXp.
   * Вернулась бутылка — буст.
   */
  private addCatch(caught: CaughtItem[]): void {
    this.progression.addCatch(caught, this.world.timeMs);
    const boosted = this.boost.active;
    for (const it of caught) {
      const xp = it.xp * this.xpMult;
      this.stats.xpByRole[it.role] += xp;
      if (boosted && FLOW_ROLES.includes(it.role)) this.stats.boostFlowXp += xp;
    }
    if (caught.some((it) => it.role === FIRST_ENEMY_ROLE)) this.mediumCaught = true;
    if (caught.some((it) => it.role === BOTTLE_ROLE)) this.boost.bottleBack();
  }
}
