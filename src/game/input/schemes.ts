import type { Game } from '../../core/game';

export interface PointerInfo { x: number; y: number; type: 'mouse' | 'touch' | 'pen'; id: number }   // x, y — координаты мира

/** Схема управления: превращает жест в команды ядра. Б, В, Г — в M0-03. */
export interface ControlScheme {
  readonly id: 'a' | 'b' | 'c' | 'd';
  onDown(p: PointerInfo, g: Game): void;
  onMove(p: PointerInfo, g: Game): void;
  onUp(p: PointerInfo, g: Game): void;
  onCancel(p: PointerInfo, g: Game): void;   // палец ушёл (системный жест, вызов): никогда не бросает
}

/**
 * Схема А «Классика»: мышь бросает по нажатию, касание и перо — по отпусканию (если жест начался при ready);
 * удержание в любом месте тянет сеть, отпускание — сеть снова лежит. Автотяги нет.
 */
export class SchemeA implements ControlScheme {
  readonly id = 'a' as const;
  private gestureFromReady = false;

  onDown(p: PointerInfo, g: Game): void {
    this.gestureFromReady = false;
    if (g.net.state === 'ready') {
      if (p.type === 'mouse') g.throwTo(p.x, p.y, { autoPullAfterMs: null });
      else this.gestureFromReady = true;
    } else {
      g.setPull(true);
    }
  }

  onMove(): void {}

  onUp(p: PointerInfo, g: Game): void {
    if (p.type !== 'mouse' && this.gestureFromReady && g.net.state === 'ready') {
      g.throwTo(p.x, p.y, { autoPullAfterMs: null });
    }
    this.gestureFromReady = false;
    g.setPull(false);
  }

  onCancel(_p: PointerInfo, g: Game): void {
    this.gestureFromReady = false;
    g.setPull(false);
  }
}
