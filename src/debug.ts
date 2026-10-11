import type { BossBall, BossSide } from './core/boss';
import type { Role } from './core/data/tables';
import type { EnemyPhase } from './core/enemies';
import type { FinalPhase } from './core/final-boss';
import type { Weapon } from './core/game';
import type { NetState } from './core/net';
import type { SpearState } from './core/spear';
import type { SpearTowerState } from './core/spear-towers';
import type { TowerNetState } from './core/towers';
import type { TutorialStep } from './core/tutorial';
import type { Layout } from './game/layout';
import type { PlatformCall } from './platform/platform';

/**
 * Отладочный доступ к игре для тестов Playwright и ботов: `window.__game`.
 * Чтение состояния и отладочные команды; расширяется задачами.
 */
export interface GameDebug {
  ready: boolean;
  version: string;
  /** Метка сборки: хеш коммита (с '+' при незакоммиченных правках) или 'dev'. */
  build: string;
  layout(): Layout;
  world(): {
    timeMs: number;
    items: number;
    spawned: number;
    seeded: number;
    level: number;
    location: string;
    /** Сколько предметов каждой роли сейчас в воде (нули тоже). */
    byRole: Record<Role, number>;
  };
  /** Уровень через Game.setLevel: прогрессия и поток. */
  setLevel(n: number): void;
  state(): {
    level: number;
    xp: number;
    xpToNext: number;
    /** caught — сколько предметов в сети. */
    net: { state: NetState; x: number; y: number; caught: number; capacity: number; range: number };
    stats: {
      throws: number; emptyThrows: number; itemsCaught: number; xpGained: number; taps: number; steps: number; gameMs: number;
      spearThrows: number; spearHits: number; enemiesKilled: number; enemiesEscaped: number; lootDropped: number;
      /** Укусы врагов (и по центральной, и по разбитой клетке) и снятая ими прочность клеток. */
      bites: number; cellDamage: number;
      /** Нажатия в ремонте, прибавившие прочность. */
      repairTaps: number;
      /** Броски сетевых башен и предметы, которые вернули их сети. */
      towerThrows: number; towerCaught: number;
      /** Броски копейных башен и броски, задевшие цель. */
      towerSpearThrows: number; towerSpearHits: number;
      /** Предметов, которые втянули воронки. */
      whirlpoolCaught: number;
      /** Шхуна: выстрелы, снятая ядрами прочность клеток, урон по ней и выпавшие сундуки. */
      bossShots: number; bossCellDamage: number; bossDamage: number; bossChests: number;
      /** Опыт потока, пойманного под бустом (× сила локации). */
      boostFlowXp: number;
      /** Врагов, погибших от буста за рекламу (они же в enemiesKilled). */
      boostKills: number;
      /** Финальный бой: игровое время боя, урон по боссу, его удары по клеткам и снятая ими прочность. */
      finalFightMs: number; finalDamage: number; finalStrikes: number; finalCellDamage: number;
      /** Опыт большого сундука (× сила локации; он же в xpGained). */
      bigChestXp: number;
      /** Вожаки событий (M1-16): сколько пришло и сколько побеждено. */
      leaders: number; leadersKilled: number;
      /** Опыт вернувшегося улова по ролям, × сила локации. */
      xpByRole: Record<Role, number>;
    };
    /** Клетка моряка и её центр в координатах мира. */
    sailor: { gx: number; gy: number; x: number; y: number };
    /** Окно выбора: карточки в порядке показа. */
    window: null | {
      level: number;
      cards: Array<{ id: string; available: boolean; reason: string | null }>;
      /** «Новые карточки» уже были и можно ли их сейчас (M1-18). */
      refreshed: boolean;
      canRefresh: boolean;
    };
    /** Стройка: карточка и места стройки (у «Плота» — для новой клетки, у постройки — свободные целые клетки). */
    build: null | { card: string; candidates: Array<{ gx: number; gy: number }> };
    /** Клетки плота с прочностью и постройкой (id из buildings.csv или null). */
    raft: Array<{ gx: number; gy: number; hp: number; building: string | null }>;
    /** Подсказка о ходьбе видна (правило ядра Game.walkHint). */
    walkHint: boolean;
    /** Открыто окно паузы. */
    menu: boolean;
    /** Идёт ремонт. */
    repair: boolean;
    /** Выбранный слот оружия и есть ли копьё (слоты видны). */
    weapon: Weapon;
    spearOwned: boolean;
    spear: { state: SpearState; x: number; y: number; damage: number };
    /** Мелкие враги, координаты мира. */
    enemies: Array<{ id: number; x: number; y: number; hp: number; radius: number; phase: EnemyPhase; leader: boolean }>;
    /** Сетевые башни: клетка и сети, caught — сколько предметов в сети. */
    towers: Array<{ gx: number; gy: number; nets: Array<{ state: TowerNetState; x: number; y: number; caught: number }> }>;
    /** Копейные башни: урон удара; у каждой — клетка, копьё (у башни или в полёте) и остаток отдыха. */
    spearTowers: { damage: number; list: Array<{ gx: number; gy: number; state: SpearTowerState; x: number; y: number; restMs: number }> };
    /** Воронки: радиус втягивания (у всех один) и клетки воронок. */
    whirlpools: { radius: number; list: Array<{ gx: number; gy: number }> };
    /** Событие локации: id (нет у локации — null), идёт ли, сколько осталось, спокойное время, сколько было. */
    event: { id: string | null; active: boolean; leftMs: number; calmMs: number; count: number };
    /**
     * Визиты босса: id (нет у локации — null), идёт ли визит, сторона, середина и полуразмеры корпуса (координаты мира),
     * урон и сундуки визита, сколько визитов кончилось, спокойное время и сколько его нужно, ядра в полёте.
     */
    boss: {
      id: string | null; visiting: boolean; side: BossSide; x: number; y: number; hx: number; hy: number;
      damage: number; chests: number; visits: number; calmMs: number; nextMs: number; balls: BossBall[];
    };
    /** Буст: идёт ли, сколько осталось, поймана ли бутылка, бутылка в воде (координаты мира; нет — null). */
    boost: { active: boolean; leftMs: number; bottleCaught: boolean; bottle: null | { x: number; y: number } };
    /**
     * Предложение буста за рекламу: есть ли реклама за награду, видна ли кнопка и сколько ещё, игровое время предложения,
     * с какого времени следующее, сколько показано и взято.
     */
    boostOffer: { enabled: boolean; visible: boolean; leftMs: number; ms: number; nextMs: number; shown: number; taken: number };
    /** Идёт реклама за награду: мир стоит. */
    ad: boolean;
    /** Воронка открыта рекламой на всю кампанию (M1-14). */
    whirlpoolUnlocked: boolean;
    /**
     * Финальный бой (M1-15): id босса (нет у локации — null), фаза, сторона, середина и радиус (координаты мира), прочность,
     * клетка цели, остаток стоянки или нырка, уровень боя и опыт большого сундука.
     */
    finalBoss: {
      id: string | null; phase: FinalPhase; side: BossSide; x: number; y: number; radius: number; hp: number; maxHp: number;
      targetGx: number; targetGy: number; leftMs: number; level: number; chestXp: number;
    };
    /** Открыто окно «Локация пройдена». */
    cleared: boolean;
    /** «Сундук ×2» за рекламу уже взят (M1-17). */
    chestDoubled: boolean;
    /** Шаг обучения, который показывает рука (M1-19); руки нет — null. */
    tutorial: TutorialStep | null;
    /** Выше этого уровень не растёт; без предела — null. */
    levelCap: number | null;
  };
  /** Команды ядра — те же, что подаёт слой ввода. */
  command: {
    /** Бросок выбранного оружия. */
    throwTo(x: number, y: number): boolean;
    setPull(on: boolean): void;
    takeCard(i: number): boolean;
    placeCell(gx: number, gy: number): boolean;
    /** Шаг моряка на соседнюю клетку по стороне; клетка разбита → false. */
    walk(dx: number, dy: number): boolean;
    /** Слот оружия; копья ещё нет → false. */
    setWeapon(w: Weapon): boolean;
    /** Ремонт: выход — всегда; вход — при повреждённой клетке, без окна выбора, стройки и паузы. */
    setRepair(on: boolean): boolean;
    /** Нажатие в ремонте по клетке: +repair_per_tap, не выше полной. */
    repairCell(gx: number, gy: number): boolean;
  };
  /** Опыт до следующего уровня сразу: окно открывается тут же. */
  debugLevelUp(): void;
  /** Краб сейчас, без условия и таймера (и на паузе); с точкой — в ней; leader — вожак (M1-16). Даёт копьё. */
  debugSpawnEnemy(x?: number, y?: number, leader?: boolean): void;
  /** Событие локации сейчас (идёт — заново), и на паузе. */
  debugEvent(): void;
  /** Визит босса сейчас вдоль стороны side (нет — случайной), и на паузе; идёт визит — ничего. */
  debugBossVisit(side?: BossSide): void;
  /** Финальный бой сейчас: всплытие у side (нет — где воды больше), и на паузе; бой уже был — ничего. */
  debugFinalBoss(side?: BossSide): void;
  /** Прочность финального босса сейчас (не выше полной); только в бою и при hp > 0. */
  debugFinalBossHp(hp: number): void;
  /** Буст на ms (нет — как от бутылки), и на паузе; идёт — время прибавляется. */
  debugBoost(ms?: number): void;
  /** Кнопка буста за рекламу сейчас, без таймера и условий (и на паузе); рекламы за награду нет — false. */
  debugBoostOffer(): boolean;
  /** Урон клетке сейчас (и на паузе), центральная неуязвима; ответ — сколько снято. Не укус: счётчики укусов не меняет. */
  debugDamageCell(gx: number, gy: number, amount: number): number;
  /** Постройка id на целую свободную клетку без карточки (и на паузе); нельзя — false. */
  debugBuild(gx: number, gy: number, id: string): boolean;
  /** Центр клетки плота в координатах окна (CSS-пиксели). */
  cellToScreen(gx: number, gy: number): { x: number; y: number };
  /** Предметы в воде, координаты мира. */
  items(): Array<{ id: number; kind: string; role: Role; x: number; y: number; radius: number }>;
  /** Точка мира в координатах окна (CSS-пиксели). */
  toScreen(x: number, y: number): { x: number; y: number };
  platformLog(): PlatformCall[];
  /** Партия продолжена из записи. */
  resumed: boolean;
  /** Записать сейчас; текст записи (после disable — ''). */
  debugSave(): string;
}

declare global {
  interface Window {
    __game?: GameDebug;
  }
}
