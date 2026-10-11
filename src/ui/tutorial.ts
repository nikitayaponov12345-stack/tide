import type { Game } from '../core/game';
import type { TutorialStep } from '../core/tutorial';
import { worldToScreen, type Layout } from '../game/layout';

/** Как рука показывает шаг: нажать или нажать и держать. */
const GESTURE: Record<TutorialStep, 'tap' | 'hold'> = { throw: 'tap', pull: 'hold', card: 'tap', cell: 'tap' };

/**
 * Рука обучения (M1-19): кружок с пульсом поверх всего, нажатия не перехватывает (заготовка до арта, M4). Шаг даёт
 * game.tutorial.step, место — здесь: бросок — ближайший к моряку предмет в круге дальности (нет — вода под моряком на
 * полдальности), тяга — сеть, карточка — первая доступная, а после выбора — «Взять», клетка — первое место стройки,
 * а на телефоне после выбора места — «Поставить». Кнопки ищет в host по data-testid.
 */
export class TutorialHand {
  private readonly el = document.createElement('div');

  constructor(
    private readonly host: HTMLElement,
    private readonly game: Game,
    private readonly cellPx: number,
  ) {
    this.el.className = 'tutorial-hand';
    this.el.dataset.testid = 'tutorial-hand';
    this.el.hidden = true;
    host.append(this.el);
  }

  update(layout: Layout): void {
    const step = this.game.tutorial.step(this.game);
    const at = step === null ? null : this.target(step, layout);
    this.el.hidden = at === null;
    if (step === null || at === null) return;
    if (this.el.dataset.step !== step) {
      this.el.dataset.step = step;
      this.el.className = `tutorial-hand ${GESTURE[step]}`;
    }
    Object.assign(this.el.style, { left: `${at.x}px`, top: `${at.y}px` });
  }

  /** Точка руки в координатах окна; цели нет — null. */
  private target(step: TutorialStep, layout: Layout): { x: number; y: number } | null {
    const g = this.game;
    const screen = (x: number, y: number) => worldToScreen(x, y, window.innerWidth, window.innerHeight, layout);
    switch (step) {
      case 'throw': {
        const s = g.sailor;
        const range = g.net.netParams.range;
        let best: { x: number; y: number } | null = null;
        let bestD = range;
        for (const it of g.world.items) {
          const d = Math.hypot(it.x - s.x, it.y - s.y);
          if (d <= bestD) {
            bestD = d;
            best = it;
          }
        }
        return best ? screen(best.x, best.y) : screen(s.x, s.y + range / 2);
      }
      case 'pull':
        return screen(g.net.x, g.net.y);
      case 'card':
        return this.center('[data-testid="take"]') ?? this.center('[data-testid="card"]:not(.unavailable)');
      case 'cell': {
        const place = this.center('[data-testid="place"]');
        if (place) return place;
        const c = g.raft.candidates()[0];
        return c ? screen(c.gx * this.cellPx, c.gy * this.cellPx) : null;
      }
    }
  }

  /** Середина видимой кнопки по селектору; нет или скрыта — null. */
  private center(selector: string): { x: number; y: number } | null {
    const el = this.host.querySelector<HTMLElement>(selector);
    if (!el || el.hidden || el.getClientRects().length === 0) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
}
