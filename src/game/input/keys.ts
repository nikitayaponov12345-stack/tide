import type { Weapon } from '../../core/game';

/** Шаг моряка по клавише или null. По e.code: в русской раскладке e.key у W — «ц». */
export function stepForKey(code: string): { dx: number; dy: number } | null {
  switch (code) {
    case 'KeyW':
    case 'ArrowUp':
      return { dx: 0, dy: -1 };
    case 'KeyS':
    case 'ArrowDown':
      return { dx: 0, dy: 1 };
    case 'KeyA':
    case 'ArrowLeft':
      return { dx: -1, dy: 0 };
    case 'KeyD':
    case 'ArrowRight':
      return { dx: 1, dy: 0 };
    default:
      return null;
  }
}

/** Слот оружия по клавише или null: 1 — сеть, 2 — копьё (и на цифровом блоке). */
export function weaponForKey(code: string): Weapon | null {
  switch (code) {
    case 'Digit1':
    case 'Numpad1':
      return 'net';
    case 'Digit2':
    case 'Numpad2':
      return 'spear';
    default:
      return null;
  }
}

/** То, что клавиатура видит у игры. */
export interface KeysGame {
  walk(dx: number, dy: number): boolean;
  setWeapon(w: Weapon): boolean;
}

/** То, что нужно от окна: подписка на keydown (тесты подают подделку). */
export interface KeysTarget {
  addEventListener(type: 'keydown', fn: (e: KeyboardEvent) => void): void;
}

/**
 * Клавиатура, как у оригинала: WASD или стрелки → game.walk, 1 и 2 → game.setWeapon. Зажатая клавиша ведёт моряка дальше
 * (автоповтор не отсекается). С Ctrl, Alt или Meta клавиши не работают: Ctrl+S — сохранение страницы, а не шаг.
 * У стрелок preventDefault — страница не прокручивается. Сделан шаг → onStep (первое действие игрока).
 */
export class KeyboardInput {
  constructor(
    private readonly game: KeysGame,
    private readonly onStep: () => void,
    target: KeysTarget = window,
  ) {
    target.addEventListener('keydown', (e) => this.key(e));
  }

  private key(e: KeyboardEvent): void {
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    const w = weaponForKey(e.code);
    if (w) {
      this.game.setWeapon(w);
      return;
    }
    const s = stepForKey(e.code);
    if (!s) return;
    if (e.code.startsWith('Arrow')) e.preventDefault();
    if (this.game.walk(s.dx, s.dy)) this.onStep();
  }
}
