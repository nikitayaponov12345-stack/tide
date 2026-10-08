import type { Role } from './core/data/tables';
import type { NetState } from './core/net';
import type { TrialSummary } from './core/stats';
import type { SchemeId } from './game/input/schemes';
import type { Layout } from './game/layout';
import type { PlatformCall } from './platform/platform';

/**
 * Отладочный доступ к игре для тестов Playwright и ботов: `window.__game`.
 * Чтение состояния и отладочные команды; расширяется задачами.
 */
export interface GameDebug {
  ready: boolean;
  version: string;
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
    /** Текущая схема управления. */
    scheme: SchemeId;
    /** Сколько игрового времени осталось до сводки пробы, мс. */
    trialMs: number;
  };
  /** То же, что кнопка схемы, но сразу нужная схема: проба начинается заново. */
  setScheme(id: SchemeId): void;
  /** Цифры сводки по текущим счётчикам (только чтение, окно не открывает). */
  summary(): TrialSummary;
  /** То же, что кнопка «Итоги»: сводка и пауза. */
  openSummary(): void;
  /** Команды ядра — те же, что подаёт слой ввода. */
  command: {
    throwTo(x: number, y: number, autoPullAfterMs?: number | null): boolean;
    setPull(on: boolean, mult?: number): void;
    setFollow(p: { x: number; y: number } | null): void;
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
