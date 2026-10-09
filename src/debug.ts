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
    stats: { throws: number; emptyThrows: number; itemsCaught: number; xpGained: number; taps: number; gameMs: number };
    /** Клетка моряка и её центр в координатах мира. */
    sailor: { gx: number; gy: number; x: number; y: number };
  };
  /** Команды ядра — те же, что подаёт слой ввода. */
  command: {
    throwTo(x: number, y: number): boolean;
    setPull(on: boolean): void;
  };
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
