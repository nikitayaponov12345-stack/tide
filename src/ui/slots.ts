import type { Game, Weapon } from '../core/game';
import { DESIGN, fitDesign, type Layout } from '../game/layout';

/** Слот в точках поля дизайна: сторона, отступ от краёв поля и между слотами, шрифт подписи (вёрстка). */
const SLOT = { size: 72, gap: 12, font: 15 } as const;
const WEAPONS: readonly Weapon[] = ['net', 'spear'];

/**
 * Слоты оружия «Сеть» и «Копьё» внизу слева поля: видны, когда у моряка есть копьё; выбранный подсвечен.
 * Нажатие — game.setWeapon. Раскладываются в точках поля дизайна с масштабом холста.
 */
export class WeaponSlots {
  private readonly btns: Record<Weapon, HTMLButtonElement>;

  constructor(
    host: HTMLElement,
    private readonly game: Game,
    text: (key: string) => string,
  ) {
    const label: Record<Weapon, string> = { net: text('ui.slot.net'), spear: text(game.weaponKey) };
    const make = (w: Weapon): HTMLButtonElement => {
      const b = document.createElement('button');
      b.className = 'slot';
      b.dataset.testid = `slot-${w}`;
      b.textContent = label[w];
      b.hidden = true;
      b.addEventListener('click', () => this.game.setWeapon(w));
      host.append(b);
      return b;
    };
    this.btns = { net: make('net'), spear: make('spear') };
  }

  update(layout: Layout): void {
    const show = this.game.spearOwned;
    for (const w of WEAPONS) this.btns[w].hidden = !show;
    if (!show) return;
    const f = fitDesign(window.innerWidth, window.innerHeight, layout);
    const d = DESIGN[layout];
    const size = SLOT.size * f.scale;
    const top = f.y + (d.h - SLOT.gap - SLOT.size) * f.scale;
    WEAPONS.forEach((w, i) => {
      const b = this.btns[w];
      b.classList.toggle('selected', this.game.weapon === w);
      Object.assign(b.style, {
        left: `${f.x + (SLOT.gap + i * (SLOT.size + SLOT.gap)) * f.scale}px`,
        top: `${top}px`,
        width: `${size}px`,
        height: `${size}px`,
        fontSize: `${Math.max(10, SLOT.font * f.scale)}px`,
      });
    });
  }
}
