import { DESIGN, fitDesign, type Layout } from '../game/layout';

/** Шрифт плашки, точки поля дизайна, и нижний предел в CSS-пикселях. */
const FONT = 40;
const MIN_FONT = 16;

/**
 * Плашка «Лагуна · N уровень» по центру поля при продолжении партии. Видна durationMs по часам браузера,
 * считая с первого кадра; нажатий не перехватывает.
 */
export class ResumePlaque {
  private readonly el = document.createElement('div');
  private shownAt: number | null = null;
  private done = false;

  constructor(
    host: HTMLElement,
    text: string,
    private readonly durationMs: number,
  ) {
    this.el.className = 'resume-plaque';
    this.el.dataset.testid = 'resume-plaque';
    this.el.textContent = text;
    this.el.hidden = true;
    host.append(this.el);
  }

  update(layout: Layout, nowMs: number): void {
    if (this.done) return;
    this.shownAt ??= nowMs;
    if (nowMs - this.shownAt >= this.durationMs) {
      this.done = true;
      this.el.hidden = true;
      return;
    }
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const f = fitDesign(vw, vh, layout);
    const d = DESIGN[layout];
    Object.assign(this.el.style, {
      left: `${f.x + (d.w / 2) * f.scale}px`,
      top: `${f.y + (d.h / 2) * f.scale}px`,
      fontSize: `${Math.max(MIN_FONT, FONT * f.scale)}px`,
    });
    this.el.hidden = false;
  }
}
