import type { Game } from '../core/game';
import { DESIGN, XP_BAR, fitDesign, type Layout } from '../game/layout';

/** Полоса опыта не уже этого, CSS-пиксели (вёрстка). */
const BAR_MIN_PX = 280;
/** Доля ширины поля под полосу опыта. */
const BAR_SHARE = 0.4;

/** Прямоугольник полосы опыта в координатах окна (CSS-пиксели). */
export function xpBarRect(width: number, height: number, layout: Layout): { left: number; top: number; width: number; height: number } {
  const f = fitDesign(width, height, layout);
  const fieldW = DESIGN[layout].w * f.scale;
  const w = Math.min(fieldW, Math.max(BAR_MIN_PX, fieldW * BAR_SHARE));
  return { left: f.x + (fieldW - w) / 2, top: f.y + XP_BAR.top * f.scale, width: w, height: XP_BAR.height * Math.max(f.scale, 0.75) };
}

/**
 * Полоса опыта у верхнего края поля дизайна по центру: «Уровень N» (под бустом — «Уровень N · Буст S с») и заполнение xp / xpToNext.
 * Только читает ядро; новый уровень показывает окно выбора.
 */
export class Hud {
  private readonly bar = document.createElement('div');
  private readonly fill = document.createElement('div');
  private readonly label = document.createElement('div');
  private lastText = '';

  constructor(host: HTMLElement, private readonly text: (key: string) => string) {
    this.bar.className = 'xpbar';
    this.bar.dataset.testid = 'xpbar';
    this.fill.className = 'xpbar-fill';
    this.label.className = 'xpbar-label';
    this.bar.append(this.fill, this.label);
    host.append(this.bar);
  }

  update(game: Game, layout: Layout): void {
    const p = game.progression;
    const r = xpBarRect(window.innerWidth, window.innerHeight, layout);
    Object.assign(this.bar.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });

    this.fill.style.width = `${Math.min(100, (p.xp / p.xpToNext()) * 100)}%`;
    let text = `${this.text('ui.level')} ${p.level}`;
    const boost = game.boost;
    if (boost.active) text += ` · ${this.text('ui.boost_left').replace('{s}', String(Math.ceil(boost.leftMs / 1000)))}`;
    if (text !== this.lastText) this.label.textContent = this.lastText = text;
  }
}
