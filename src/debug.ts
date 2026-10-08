import type { Role } from './core/data/tables';
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
  setLevel(n: number): void;
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
