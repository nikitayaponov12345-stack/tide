import type { Game } from '../core/game';
import type { BuildCursor } from '../game/input/build';
import { DESIGN, fitDesign, worldToScreen, type Layout } from '../game/layout';
import { xpBarRect } from './hud';

/** Кнопка в точках поля дизайна и её отступ от края поля (вёрстка). */
const SIZE = { w: 300, h: 84, margin: 20 } as const;

/**
 * «Поставить» в стройке на телефоне: видна, когда палец перенёс призрак на подходящее место.
 * Внизу по центру поля; если закрыла бы призрак — вверху, под полосой опыта. На ПК её нет: мышь ставит щелчком.
 */
export class PlaceButton {
  private readonly btn = document.createElement('button');

  constructor(
    host: HTMLElement,
    private readonly game: Game,
    private readonly cursor: BuildCursor,
    text: (key: string) => string,
  ) {
    this.btn.className = 'place';
    this.btn.dataset.testid = 'place';
    this.btn.textContent = text('ui.place');
    this.btn.hidden = true;
    this.btn.addEventListener('click', () => this.game.placeCell(this.cursor.gx, this.cursor.gy));
    host.append(this.btn);
  }

  update(layout: Layout, cellPx: number): void {
    const c = this.cursor;
    const show = this.game.build !== null && c.shown && c.byTouch && this.game.raft.canAdd(c.gx, c.gy);
    this.btn.hidden = !show;
    if (!show) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const f = fitDesign(vw, vh, layout);
    const w = SIZE.w * f.scale;
    const h = SIZE.h * f.scale;
    const left = f.x + (DESIGN[layout].w * f.scale - w) / 2;
    let top = f.y + (DESIGN[layout].h - SIZE.margin - SIZE.h) * f.scale;
    const a = worldToScreen((c.gx - 0.5) * cellPx, (c.gy - 0.5) * cellPx, vw, vh, layout);
    const b = worldToScreen((c.gx + 0.5) * cellPx, (c.gy + 0.5) * cellPx, vw, vh, layout);
    const overlaps = a.x < left + w && b.x > left && a.y < top + h && b.y > top;
    if (overlaps) {
      const bar = xpBarRect(vw, vh, layout);
      top = bar.top + bar.height + SIZE.margin * f.scale;
    }
    Object.assign(this.btn.style, {
      left: `${left}px`, top: `${top}px`, width: `${w}px`, height: `${h}px`, fontSize: `${Math.max(14, 30 * f.scale)}px`,
    });
  }
}
