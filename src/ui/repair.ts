import type { Game } from '../core/game';
import { DESIGN, fitDesign, type Layout } from '../game/layout';

/** Молоток в точках поля дизайна: сторона, отступ от правого и нижнего края поля, шрифт подписи (вёрстка). */
const BTN = { size: 72, gap: 12, font: 15 } as const;
/** Нижний предел стороны в CSS-пикселях: под палец. */
const BTN_MIN = 44;

/**
 * Кнопка «Ремонт» внизу справа поля: видна в ремонте или при повреждённой клетке, кроме окна выбора и стройки.
 * Нажатие — вход в ремонт и выход. active — идёт ремонт, danger — у какой-нибудь клетки прочность не больше четверти.
 */
export class RepairButton {
  private readonly btn = document.createElement('button');

  constructor(
    host: HTMLElement,
    private readonly game: Game,
    text: (key: string) => string,
  ) {
    this.btn.className = 'repair-btn';
    this.btn.dataset.testid = 'repair-button';
    this.btn.textContent = text('ui.repair');
    this.btn.hidden = true;
    this.btn.addEventListener('click', () => this.game.setRepair(!this.game.repair));
    host.append(this.btn);
  }

  update(layout: Layout): void {
    const { game } = this;
    const raft = game.raft;
    const show = (game.repair || raft.damaged()) && game.window === null && game.build === null;
    this.btn.hidden = !show;
    if (!show) return;
    this.btn.classList.toggle('active', game.repair);
    this.btn.classList.toggle('danger', raft.cells.some((c) => c.hp <= raft.cellHp / 4));
    const f = fitDesign(window.innerWidth, window.innerHeight, layout);
    const d = DESIGN[layout];
    const size = Math.max(BTN_MIN, BTN.size * f.scale);
    Object.assign(this.btn.style, {
      left: `${f.x + (d.w - BTN.gap) * f.scale - size}px`,
      top: `${f.y + (d.h - BTN.gap) * f.scale - size}px`,
      width: `${size}px`,
      height: `${size}px`,
      fontSize: `${Math.max(10, BTN.font * f.scale)}px`,
    });
  }
}
