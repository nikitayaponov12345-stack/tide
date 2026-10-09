import type { Game } from '../core/game';
import { DESIGN, fitDesign, type Layout } from '../game/layout';
import type { Lang } from '../game/settings';
import { xpBarRect } from './hud';

/** Кнопка паузы в точках поля дизайна: размер, отступ от краёв поля и от полосы опыта, шрифт (вёрстка). */
const BTN = { w: 120, h: 40, margin: 12, barGap: 8, font: 20 } as const;
/** Нижние пределы кнопки паузы в CSS-пикселях: под палец. */
const BTN_MIN = { w: 96, h: 44, font: 14 } as const;
const LANGS: readonly Lang[] = ['ru', 'en'];

export interface PauseActions {
  /** Сменить язык: запись партии и настроек, перезагрузка. */
  language(lang: Lang): void;
  /** Стереть прогресс: запись стирается, перезагрузка с 1 уровня. */
  erase(): void;
}

/**
 * Кнопка «Пауза» в левом верхнем углу поля (в узком портрете — под полосой опыта) и окно паузы:
 * «Продолжить», язык самоназваниями, «Стереть прогресс» удержанием. Esc на ПК открывает и закрывает.
 * Поверх окна выбора пауза не открывается: окно выбора — само пауза. Видно, когда game.menu.
 */
export class PauseMenu {
  private readonly btn = document.createElement('button');
  private readonly dim = document.createElement('div');
  private readonly panel = document.createElement('div');
  private readonly erase = document.createElement('button');
  private readonly eraseFill = document.createElement('div');
  /** Начало удержания «Стереть» по часам браузера; null — не держат. */
  private holdStart: number | null = null;
  private erased = false;

  constructor(
    host: HTMLElement,
    private readonly game: Game,
    text: (key: string) => string,
    lang: Lang,
    private readonly eraseHoldMs: number,
    private readonly actions: PauseActions,
  ) {
    this.btn.className = 'pause-btn';
    this.btn.dataset.testid = 'pause-button';
    this.btn.textContent = text('ui.pause');
    this.btn.addEventListener('click', () => this.open());
    host.append(this.btn);

    this.dim.className = 'pause-dim';
    this.dim.dataset.testid = 'pause';
    this.dim.hidden = true;
    this.panel.className = 'pause-panel';
    const col = document.createElement('div');
    col.className = 'pause-col';
    const title = document.createElement('div');
    title.className = 'pause-title';
    title.textContent = text('ui.pause');
    const resume = this.button('pause-resume', text('ui.resume'), () => this.close());
    const langs = document.createElement('div');
    langs.className = 'pause-langs';
    for (const l of LANGS) {
      const b = this.button(`lang-${l}`, text(`ui.lang.${l}`), () => {
        if (l !== lang) this.actions.language(l);
      });
      b.classList.toggle('selected', l === lang);
      langs.append(b);
    }
    this.erase.className = 'pause-item pause-erase';
    this.erase.dataset.testid = 'erase';
    const label = document.createElement('span');
    label.textContent = text('ui.erase');
    this.eraseFill.className = 'pause-erase-fill';
    this.erase.append(this.eraseFill, label);
    this.erase.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (this.game.menu) this.holdStart = performance.now();
    });
    for (const type of ['pointerup', 'pointerleave', 'pointercancel'] as const) this.erase.addEventListener(type, () => this.resetHold());
    // Долгое касание на телефоне не открывает меню браузера.
    this.erase.addEventListener('contextmenu', (e) => e.preventDefault());
    const hint = document.createElement('div');
    hint.className = 'pause-hint';
    hint.textContent = text('ui.erase_hold').replace('{s}', String(eraseHoldMs / 1000));
    col.append(title, resume, langs, this.erase, hint);
    this.panel.append(col);
    this.dim.append(this.panel);
    host.append(this.dim);

    window.addEventListener('keydown', (e) => {
      if (e.code !== 'Escape' || e.ctrlKey || e.altKey || e.metaKey || e.repeat) return;
      if (this.game.menu) this.close();
      else this.open();
    });
  }

  update(layout: Layout, nowMs: number): void {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const f = fitDesign(vw, vh, layout);
    const w = Math.max(BTN_MIN.w, BTN.w * f.scale);
    const h = Math.max(BTN_MIN.h, BTN.h * f.scale);
    const left = f.x + BTN.margin * f.scale;
    let top = f.y + BTN.margin * f.scale;
    const bar = xpBarRect(vw, vh, layout);
    if (left < bar.left + bar.width && left + w > bar.left && top < bar.top + bar.height && top + h > bar.top) {
      top = bar.top + bar.height + BTN.barGap * f.scale;
    }
    Object.assign(this.btn.style, {
      left: `${left}px`, top: `${top}px`, width: `${w}px`, height: `${h}px`, fontSize: `${Math.max(BTN_MIN.font, BTN.font * f.scale)}px`,
    });

    const open = this.game.menu;
    this.dim.hidden = !open;
    if (!open) {
      this.resetHold();
      return;
    }
    const d = DESIGN[layout];
    Object.assign(this.panel.style, {
      width: `${d.w}px`, height: `${d.h}px`, transform: `translate(${f.x}px, ${f.y}px) scale(${f.scale})`,
    });
    if (this.holdStart === null) return;
    const share = Math.min(1, (nowMs - this.holdStart) / this.eraseHoldMs);
    this.eraseFill.style.width = `${share * 100}%`;
    if (share >= 1 && !this.erased) {
      this.erased = true;
      this.actions.erase();
    }
  }

  /** Открыть паузу; при открытом окне выбора — ничего. */
  private open(): void {
    if (this.game.window === null) this.game.setMenu(true);
  }

  private close(): void {
    this.game.setMenu(false);
    this.resetHold();
  }

  private resetHold(): void {
    if (this.holdStart === null) return;
    this.holdStart = null;
    this.eraseFill.style.width = '0';
  }

  private button(testid: string, label: string, onClick: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.className = 'pause-item';
    b.dataset.testid = testid;
    b.textContent = label;
    b.addEventListener('click', onClick);
    return b;
  }
}
