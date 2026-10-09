import type { Game } from '../core/game';
import { DESIGN, fitDesign, type Layout } from '../game/layout';
import { xpBarRect } from './hud';

/** Вёрстка подсказки в точках поля дизайна: горизонталь — справа вверху, портрет — по центру в верхней трети. */
const BOX = {
  landscape: { margin: 8, font: 18, maxW: 360 },
  portrait: { centerY: 0.175, font: 30, maxW: 600 },
} as const;
/** Отступ под полосой опыта, точки дизайна. */
const BAR_GAP = 8;

/**
 * Подсказка о ходьбе, как у оригинала: видна, когда game.walkHint. Текст — по последнему указателю
 * (палец или перо — «проведи пальцем», мышь — WASD); до первого нажатия — по (pointer: coarse).
 * Полосу опыта не закрывает; нажатия не перехватывает.
 */
export class WalkHint {
  private readonly el = document.createElement('div');
  private touch: boolean;
  private lastText = '';

  constructor(
    host: HTMLElement,
    private readonly game: Game,
    private readonly text: (key: string) => string,
  ) {
    this.el.className = 'walk-hint';
    this.el.dataset.testid = 'walk-hint';
    this.el.hidden = true;
    host.append(this.el);
    this.touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    window.addEventListener('pointerdown', (e) => {
      this.touch = e.pointerType === 'touch' || e.pointerType === 'pen';
    }, { capture: true });
  }

  update(layout: Layout): void {
    const show = this.game.walkHint;
    this.el.hidden = !show;
    if (!show) return;
    const text = this.text(this.touch ? 'ui.hint.walk_touch' : 'ui.hint.walk_keys');
    if (text !== this.lastText) this.el.textContent = this.lastText = text;

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const f = fitDesign(vw, vh, layout);
    const d = DESIGN[layout];
    const s = this.el.style;
    if (layout === 'landscape') {
      const b = BOX.landscape;
      Object.assign(s, {
        left: '', transform: '', textAlign: 'right',
        right: `${vw - (f.x + (d.w - b.margin) * f.scale)}px`,
        top: `${f.y + b.margin * f.scale}px`,
        maxWidth: `${b.maxW * f.scale}px`,
        fontSize: `${Math.max(12, b.font * f.scale)}px`,
      });
    } else {
      const b = BOX.portrait;
      Object.assign(s, {
        right: '', textAlign: 'center',
        left: `${f.x + (d.w / 2) * f.scale}px`,
        top: `${f.y + d.h * b.centerY * f.scale}px`,
        transform: 'translate(-50%, -50%)',
        maxWidth: `${b.maxW * f.scale}px`,
        fontSize: `${Math.max(14, b.font * f.scale)}px`,
      });
    }
    // Наехала на полосу опыта (узкое окно — у полосы минимальная ширина) — уходит под неё.
    const r = this.el.getBoundingClientRect();
    const bar = xpBarRect(vw, vh, layout);
    const overlaps = r.left < bar.left + bar.width && r.right > bar.left && r.top < bar.top + bar.height && r.bottom > bar.top;
    if (overlaps) {
      const top = bar.top + bar.height + BAR_GAP * f.scale;
      s.top = `${layout === 'portrait' ? top + r.height / 2 : top}px`;
    }
  }
}
