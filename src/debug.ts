import type { Layout } from './game/layout';
import type { PlatformCall } from './platform/platform';

/**
 * Отладочный доступ к игре для тестов Playwright и ботов: `window.__game`.
 * Только чтение состояния; в M0 сюда добавятся команды для ботов.
 */
export interface GameDebug {
  ready: boolean;
  version: string;
  layout(): Layout;
  world(): { timeMs: number; items: number; spawned: number };
  platformLog(): PlatformCall[];
}

declare global {
  interface Window {
    __game?: GameDebug;
  }
}
