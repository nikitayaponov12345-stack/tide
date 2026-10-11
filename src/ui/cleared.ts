import type { Game } from '../core/game';
import { DESIGN, fitDesign, type Layout } from '../game/layout';

/**
 * Окно «Локация пройдена» (M1-15): после победы в финальном бою — название локации, большой сундук и «Играть дальше».
 * Карты ещё нет (M2): кнопка закрывает окно, уровни идут дальше. Видно, пока game.cleared; панель — по полю дизайна, как у паузы.
 * «Сундук ×2 за рекламу» (M1-17) — над «Играть дальше», пока у площадки есть реклама за награду и сундук не удвоен.
 */
export class ClearedWindow {
  private readonly dim = document.createElement('div');
  private readonly panel = document.createElement('div');
  private readonly chest = document.createElement('div');
  private readonly double = document.createElement('button');
  private lastXp = -1;

  constructor(
    host: HTMLElement,
    private readonly game: Game,
    private readonly text: (key: string) => string,
    locationKey: string,
    onPlayOn: () => void,
    onDouble: () => void,
  ) {
    this.dim.className = 'cleared-dim';
    this.dim.dataset.testid = 'cleared';
    this.dim.hidden = true;
    this.panel.className = 'cleared-panel';
    const col = document.createElement('div');
    col.className = 'cleared-col';
    const title = document.createElement('div');
    title.className = 'cleared-title';
    title.textContent = text('ui.cleared');
    const sub = document.createElement('div');
    sub.className = 'cleared-sub';
    sub.textContent = text(locationKey);
    this.chest.className = 'cleared-chest';
    this.chest.dataset.testid = 'big-chest';
    this.double.className = 'cleared-double';
    this.double.dataset.testid = 'chest-double';
    this.double.textContent = text('ui.chest_double');
    this.double.addEventListener('click', onDouble);
    const play = document.createElement('button');
    play.className = 'cleared-play';
    play.dataset.testid = 'play-on';
    play.textContent = text('ui.play_on');
    play.addEventListener('click', onPlayOn);
    col.append(title, sub, this.chest, this.double, play);
    this.panel.append(col);
    this.dim.append(this.panel);
    host.append(this.dim);
  }

  update(layout: Layout): void {
    const open = this.game.cleared;
    this.dim.hidden = !open;
    if (!open) return;
    this.double.hidden = !this.game.rewarded || this.game.chestDoubled;
    const xp = Math.round(this.game.finalBoss.chestXp * (this.game.chestDoubled ? 2 : 1));
    if (xp !== this.lastXp) {
      this.lastXp = xp;
      this.chest.textContent = this.text('ui.big_chest').replace('{xp}', String(xp));
    }
    const f = fitDesign(window.innerWidth, window.innerHeight, layout);
    const d = DESIGN[layout];
    Object.assign(this.panel.style, {
      width: `${d.w}px`, height: `${d.h}px`, transform: `translate(${f.x}px, ${f.y}px) scale(${f.scale})`,
    });
  }
}
