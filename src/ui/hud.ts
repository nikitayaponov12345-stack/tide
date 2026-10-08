import type { Game } from '../core/game';
import { DESIGN, XP_BAR, fitDesign, type Layout } from '../game/layout';

/** Полоса опыта не уже этого, CSS-пиксели (вёрстка). */
const BAR_MIN_PX = 280;
/** Доля ширины поля под полосу опыта. */
const BAR_SHARE = 0.4;
/** «Новый уровень!» держится столько игрового времени. */
const NEW_LEVEL_MS = 1000;

/**
 * Полоса опыта у верхнего края поля дизайна по центру: «Уровень N» и заполнение xp / xpToNext;
 * при новом уровне — «Новый уровень!» на секунду. Только читает ядро и забирает levelUps.
 */
export class Hud {
  private readonly bar = document.createElement('div');
  private readonly fill = document.createElement('div');
  private readonly label = document.createElement('div');
  private readonly banner = document.createElement('div');
  private bannerUntil = -Infinity;
  private lastText = '';

  constructor(host: HTMLElement, private readonly text: (key: string) => string) {
    this.bar.className = 'xpbar';
    this.bar.dataset.testid = 'xpbar';
    this.fill.className = 'xpbar-fill';
    this.label.className = 'xpbar-label';
    this.bar.append(this.fill, this.label);
    this.banner.className = 'newlevel';
    this.banner.dataset.testid = 'newlevel';
    this.banner.textContent = text('ui.new_level');
    this.banner.hidden = true;
    host.append(this.bar, this.banner);
  }

  update(game: Game, layout: Layout): void {
    const p = game.progression;
    const now = game.world.timeMs;
    if (p.takeLevelUps().length > 0) this.bannerUntil = now + NEW_LEVEL_MS;
    this.banner.hidden = now >= this.bannerUntil;

    const f = fitDesign(window.innerWidth, window.innerHeight, layout);
    const fieldW = DESIGN[layout].w * f.scale;
    const w = Math.min(fieldW, Math.max(BAR_MIN_PX, fieldW * BAR_SHARE));
    const top = f.y + XP_BAR.top * f.scale;
    const h = XP_BAR.height * Math.max(f.scale, 0.75);
    Object.assign(this.bar.style, { left: `${f.x + (fieldW - w) / 2}px`, top: `${top}px`, width: `${w}px`, height: `${h}px` });
    Object.assign(this.banner.style, { left: `${f.x + fieldW / 2}px`, top: `${top + h + 8}px` });

    this.fill.style.width = `${Math.min(100, (p.xp / p.xpToNext()) * 100)}%`;
    const text = `${this.text('ui.level')} ${p.level}`;
    if (text !== this.lastText) this.label.textContent = this.lastText = text;
  }
}
