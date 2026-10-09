import { describe, expect, it } from 'vitest';
import type { Weapon } from '../../src/core/game';
import { KeyboardInput, stepForKey, weaponForKey, type KeysTarget } from '../../src/game/input/keys';

type Mods = Partial<Pick<KeyboardEvent, 'key' | 'repeat' | 'ctrlKey' | 'altKey' | 'metaKey'>>;

/** Подменённое окно: хранит обработчик keydown, тест шлёт события сам. */
class FakeWindow implements KeysTarget {
  fn: ((e: KeyboardEvent) => void) | null = null;

  addEventListener(_type: 'keydown', fn: (e: KeyboardEvent) => void): void {
    this.fn = fn;
  }

  /** Событие клавиши; вернёт, был ли preventDefault. */
  press(code: string, mods: Mods = {}): boolean {
    let prevented = false;
    const e = { code, key: '', repeat: false, ctrlKey: false, altKey: false, metaKey: false, ...mods, preventDefault: () => (prevented = true) };
    this.fn!(e as unknown as KeyboardEvent);
    return prevented;
  }
}

function setup(ok = true): { w: FakeWindow; walks: Array<[number, number]>; weapons: Weapon[]; steps: () => number } {
  const w = new FakeWindow();
  const walks: Array<[number, number]> = [];
  const weapons: Weapon[] = [];
  let steps = 0;
  const game = {
    walk: (dx: number, dy: number): boolean => {
      walks.push([dx, dy]);
      return ok;
    },
    setWeapon: (wp: Weapon): boolean => {
      weapons.push(wp);
      return true;
    },
  };
  new KeyboardInput(game, () => steps++, w);
  return { w, walks, weapons, steps: () => steps };
}

describe('stepForKey', () => {
  it('WASD и стрелки — шаг по стороне, остальное — null', () => {
    expect(stepForKey('KeyW')).toEqual({ dx: 0, dy: -1 });
    expect(stepForKey('ArrowUp')).toEqual({ dx: 0, dy: -1 });
    expect(stepForKey('KeyS')).toEqual({ dx: 0, dy: 1 });
    expect(stepForKey('ArrowDown')).toEqual({ dx: 0, dy: 1 });
    expect(stepForKey('KeyA')).toEqual({ dx: -1, dy: 0 });
    expect(stepForKey('ArrowLeft')).toEqual({ dx: -1, dy: 0 });
    expect(stepForKey('KeyD')).toEqual({ dx: 1, dy: 0 });
    expect(stepForKey('ArrowRight')).toEqual({ dx: 1, dy: 0 });
    expect(stepForKey('KeyQ')).toBeNull();
    expect(stepForKey('Space')).toBeNull();
  });
});

describe('weaponForKey', () => {
  it('1 — сеть, 2 — копьё, и на цифровом блоке; остальное — null', () => {
    expect(weaponForKey('Digit1')).toBe('net');
    expect(weaponForKey('Numpad1')).toBe('net');
    expect(weaponForKey('Digit2')).toBe('spear');
    expect(weaponForKey('Numpad2')).toBe('spear');
    expect(weaponForKey('Digit3')).toBeNull();
    expect(weaponForKey('KeyW')).toBeNull();
  });
});

describe('KeyboardInput', () => {
  it('1 и 2 переключают слот, не ходят; с Ctrl, Alt или Meta — не переключают', () => {
    const { w, walks, weapons } = setup();
    w.press('Digit2');
    w.press('Numpad1');
    w.press('Digit2', { ctrlKey: true });
    w.press('Digit1', { altKey: true });
    w.press('Digit2', { metaKey: true });
    expect(weapons).toEqual(['spear', 'net']);
    expect(walks).toEqual([]);
  });

  it('русская раскладка и автоповтор ходят', () => {
    const { w, walks } = setup();
    w.press('KeyW', { key: 'ц' });
    w.press('KeyW', { key: 'ц', repeat: true });
    expect(walks).toEqual([[0, -1], [0, -1]]);
  });

  it('preventDefault — только у стрелок', () => {
    const { w } = setup();
    expect(w.press('ArrowLeft')).toBe(true);
    expect(w.press('ArrowUp')).toBe(true);
    expect(w.press('KeyA')).toBe(false);
    expect(w.press('KeyQ')).toBe(false);
  });

  it('с Ctrl, Alt или Meta — не ходит', () => {
    const { w, walks } = setup();
    w.press('KeyS', { ctrlKey: true });
    w.press('KeyS', { altKey: true });
    w.press('ArrowDown', { metaKey: true });
    expect(walks).toEqual([]);
  });

  it('onStep — только после сделанного шага', () => {
    const ok = setup(true);
    ok.w.press('KeyD');
    ok.w.press('KeyQ');
    expect(ok.steps()).toBe(1);
    const no = setup(false);
    no.w.press('KeyD');
    expect(no.walks.length).toBe(1);
    expect(no.steps()).toBe(0);
  });
});
