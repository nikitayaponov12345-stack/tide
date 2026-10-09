import type { Role } from './core/data/tables';
import type { NetState } from './core/net';
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
    stats: { throws: number; emptyThrows: number; itemsCaught: number; xpGained: number; taps: number; steps: number; gameMs: number };
    /** Клетка моряка и её центр в координатах мира. */
    sailor: { gx: number; gy: number; x: number; y: number };
    /** Окно выбора: карточки в порядке показа. */
    window: null | { level: number; cards: Array<{ id: string; available: boolean; reason: string | null }> };
    /** Стройка: карточка и места для новой клетки. */
    build: null | { card: string; candidates: Array<{ gx: number; gy: number }> };
    raft: Array<{ gx: number; gy: number }>;
    /** Подсказка о ходьбе видна (правило ядра Game.walkHint). */
    walkHint: boolean;
  };
  /** Команды ядра — те же, что подаёт слой ввода. */
  command: {
    throwTo(x: number, y: number): boolean;
    setPull(on: boolean): void;
    takeCard(i: number): boolean;
    placeCell(gx: number, gy: number): boolean;
    /** Шаг моряка на соседнюю клетку по стороне. */
    walk(dx: number, dy: number): boolean;
  };
  /** Опыт до следующего уровня сразу: окно открывается тут же. */
  debugLevelUp(): void;
  /** Центр клетки плота в координатах окна (CSS-пиксели). */
  cellToScreen(gx: number, gy: number): { x: number; y: number };
  /** Предметы в воде, координаты мира. */
  items(): Array<{ id: number; kind: string; role: Role; x: number; y: number; radius: number }>;
  /** Точка мира в координатах окна (CSS-пиксели). */
  toScreen(x: number, y: number): { x: number; y: number };
  platformLog(): PlatformCall[];
}

declare global {
  interface Window {
    __game?: GameDebug;
  }
}
