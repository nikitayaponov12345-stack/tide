import type { Game } from '../core/game';
import { DESIGN, fitDesign, type Layout } from '../game/layout';
import { xpBarRect } from './hud';

/** Кнопка буста в точках поля дизайна: размер, отступ от края, зазор под полосой опыта, шрифт (вёрстка). */
const BTN = { w: 132, h: 64, margin: 12, barGap: 8, font: 15 } as const;
/** Нижние пределы в CSS-пикселях: высота под палец, шрифт. Ширина — в той же пропорции, что высота. */
const BTN_MIN = { h: 44, font: 10 } as const;

/**
 * Кнопка «Буст за рекламу», как у оригинала: в горизонтали — у правого края поля посередине, в вертикали — справа вверху,
 * напротив кнопки паузы (заходит на полосу опыта — под ней). Видна, пока видно предложение и мир не стоит.
 */
export class BoostOfferButton {
  private readonly btn = document.createElement('button');

  constructor(
    host: HTMLElement,
    private readonly game: Game,
    text: (key: string) => string,
    onTake: () => void,
  ) {
    this.btn.className = 'boost-offer-btn';
    this.btn.dataset.testid = 'boost-offer';
    this.btn.textContent = text('ui.boost_offer').replace('{s}', String(Math.round(game.boostOffer.adBoostMs / 1000)));
    this.btn.hidden = true;
    this.btn.addEventListener('click', onTake);
    host.append(this.btn);
  }

  update(layout: Layout): void {
    const show = this.game.boostOffer.visible && !this.game.paused;
    this.btn.hidden = !show;
    if (!show) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const f = fitDesign(vw, vh, layout);
    const d = DESIGN[layout];
    const h = Math.max(BTN_MIN.h, BTN.h * f.scale);
    const w = (h * BTN.w) / BTN.h;
    const left = f.x + (d.w - BTN.margin) * f.scale - w;
    let top: number;
    if (layout === 'portrait') {
      top = f.y + BTN.margin * f.scale;
      const bar = xpBarRect(vw, vh, layout);
      if (left < bar.left + bar.width && left + w > bar.left && top < bar.top + bar.height && top + h > bar.top) {
        top = bar.top + bar.height + BTN.barGap * f.scale;
      }
    } else {
      top = f.y + (d.h * f.scale - h) / 2;
    }
    Object.assign(this.btn.style, {
      left: `${left}px`, top: `${top}px`, width: `${w}px`, height: `${h}px`, fontSize: `${Math.max(BTN_MIN.font, BTN.font * f.scale)}px`,
    });
  }
}
