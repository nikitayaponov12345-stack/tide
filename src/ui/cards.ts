import type { CardKind } from '../core/data/tables';
import { AD_LOCKED, type OfferCard } from '../core/deck';
import type { Game, OfferWindow } from '../core/game';
import { DESIGN, fitDesign, type Layout } from '../game/layout';

/** Картинка карточки до этапа арта — цветной квадрат по виду (вёрстка, не баланс). */
const KIND_COLOR: Record<CardKind, string> = {
  raft: '#c58b4f',
  sailor_upgrade: '#3a86ff',
  building: '#2a9d8f',
  building_upgrade: '#8a8f3c',
};
/** Защита от двойного нажатия: столько мс после появления окна карточки и «Взять» неактивны (часы браузера). */
const GUARD_MS = 300;

/** Раскладка окна в точках поля дизайна: заголовок, карточки, место под «Взять». */
const BOX: Record<Layout, {
  titleY: number; subY: number; top: number; cardW: number; cardH: number; gap: number; takeW: number; takeH: number; takeGap: number;
}> = {
  landscape: { titleY: 70, subY: 150, top: 220, cardW: 300, cardH: 330, gap: 40, takeW: 220, takeH: 70, takeGap: 24 },
  portrait: { titleY: 170, subY: 260, top: 340, cardW: 620, cardH: 200, gap: 24, takeW: 320, takeH: 90, takeGap: 40 },
};
/**
 * «Открыть за рекламу» у закрытой карточки (M1-14), отдельной кнопкой в панели: карточка неактивна.
 * Ряд (ПК) — под своей карточкой, на месте «Взять» (закрытую карточку не выбрать, «Взять» там не появится): ширина rowW,
 * по центру карточки, сверху — top + cardH + takeGap. Стопка (телефон) — под стопкой, по центру поля, ширина stackW;
 * «Взять» в стопке тогда ниже на h + gap.
 */
const UNLOCK = { rowW: 260, stackW: 360, h: 70, gap: 20 };
/**
 * «Новые карточки за рекламу» (M1-18) — по центру поля, под местом «Взять» (оно занято, даже когда «Взять» не видна):
 * сверху — низ места «Взять» + gap; ширина по раскладке. В стопке с «Открыть за рекламу» место «Взять» ниже — и кнопка ниже.
 */
const REFRESH = { rowW: 380, stackW: 440, h: 56, gap: 12 };

/**
 * Окно выбора поверх холста: затемнение на весь экран, «Новый уровень!», карточки (ПК — в ряд, телефон — стопкой).
 * Выбор в два нажатия: карточка подсвечивается, «Взять» берёт её. Раскладывается в точках поля дизайна
 * и масштабируется, как холст (fitDesign), поэтому помещается целиком в любом окне.
 */
export class CardWindow {
  private readonly dim = document.createElement('div');
  private readonly panel = document.createElement('div');
  private win: OfferWindow | null = null;
  /** Карточки, по которым нарисовано окно: открыли воронку — game.window.cards новый массив. */
  private drawn: OfferCard[] | null = null;
  private layout: Layout | null = null;
  private selected: number | null = null;
  private openedAt = 0;
  private ready = false;
  private cards: HTMLButtonElement[] = [];
  private take: HTMLButtonElement | null = null;
  private unlocks: HTMLButtonElement[] = [];
  private refresh: HTMLButtonElement | null = null;

  /** onUnlock — нажата «Открыть за рекламу», onRefresh — «Новые карточки за рекламу» (M1-18); реклама и награда — в main.ts. */
  constructor(
    host: HTMLElement,
    private readonly game: Game,
    private readonly text: (key: string) => string,
    private readonly onUnlock: () => void = () => {},
    private readonly onRefresh: () => void = () => {},
  ) {
    this.dim.className = 'cards-dim';
    this.dim.dataset.testid = 'cards';
    this.dim.hidden = true;
    this.panel.className = 'cards-panel';
    this.dim.append(this.panel);
    host.append(this.dim);
  }

  update(layout: Layout, nowMs: number): void {
    const w = this.game.window;
    if (w === null) {
      if (this.win !== null) {
        this.win = null;
        this.drawn = null;
        this.dim.hidden = true;
      }
      return;
    }
    if (w !== this.win || w.cards !== this.drawn) {
      this.win = w;
      this.drawn = w.cards;
      this.selected = null;
      this.openedAt = nowMs;
      this.ready = false;
      this.render(layout);
    } else if (layout !== this.layout) {
      this.render(layout);
    }
    const ready = nowMs - this.openedAt >= GUARD_MS;
    if (ready !== this.ready) {
      this.ready = ready;
      this.syncEnabled();
    }
    const d = DESIGN[layout];
    const f = fitDesign(window.innerWidth, window.innerHeight, layout);
    Object.assign(this.panel.style, {
      width: `${d.w}px`, height: `${d.h}px`, transform: `translate(${f.x}px, ${f.y}px) scale(${f.scale})`,
    });
  }

  private render(layout: Layout): void {
    const w = this.win!;
    this.layout = layout;
    this.dim.hidden = false;
    this.panel.replaceChildren();
    const b = BOX[layout];
    const d = DESIGN[layout];
    const row = layout === 'landscape';
    this.panel.append(
      this.el('div', 'cards-title', this.text('ui.new_level'), { top: b.titleY }),
      this.el('div', 'cards-sub', this.text('ui.choose_card'), { top: b.subY }),
    );

    const n = w.cards.length;
    const rowW = n * b.cardW + (n - 1) * b.gap;
    this.cards = w.cards.map((offer, i) => {
      const card = this.game.deck.card(offer.id);
      const btn = document.createElement('button');
      btn.className = `card ${row ? 'card-row' : 'card-stack'}${offer.available ? '' : ' unavailable'}`;
      btn.dataset.testid = 'card';
      btn.dataset.id = offer.id;
      const left = row ? (d.w - rowW) / 2 + i * (b.cardW + b.gap) : (d.w - b.cardW) / 2;
      const top = row ? b.top : b.top + i * (b.cardH + b.gap);
      Object.assign(btn.style, { left: `${left}px`, top: `${top}px`, width: `${b.cardW}px`, height: `${b.cardH}px` });
      const pic = this.el('div', 'card-pic', '');
      pic.style.background = KIND_COLOR[card.kind];
      const name = this.el('div', 'card-name', this.text(card.nameKey));
      const desc = this.el('div', offer.available ? 'card-desc' : 'card-reason', this.text(offer.available || offer.reason === null ? card.descKey : offer.reason));
      const body = this.el('div', 'card-body', '');
      body.append(name, desc);
      btn.append(pic, body);
      btn.addEventListener('click', () => this.select(i));
      return btn;
    });
    this.panel.append(...this.cards);

    this.unlocks = [];
    w.cards.forEach((offer, i) => {
      if (offer.reason !== AD_LOCKED) return;
      const btn = document.createElement('button');
      btn.className = 'card-unlock';
      btn.dataset.testid = 'card-unlock';
      btn.textContent = this.text('ui.ad_unlock');
      const width = row ? UNLOCK.rowW : UNLOCK.stackW;
      const left = row ? parseFloat(this.cards[i]!.style.left) + (b.cardW - width) / 2 : (d.w - width) / 2;
      const top = row ? b.top + b.cardH + b.takeGap : b.top + n * b.cardH + (n - 1) * b.gap + b.takeGap;
      Object.assign(btn.style, { left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${UNLOCK.h}px` });
      btn.addEventListener('click', () => {
        if (this.ready) this.onUnlock();
      });
      this.unlocks.push(btn);
    });
    this.panel.append(...this.unlocks);
    this.refresh = this.game.canRefreshCards() ? this.refreshButton(layout) : null;
    if (this.refresh) this.panel.append(this.refresh);

    const take = document.createElement('button');
    take.className = 'cards-take';
    take.dataset.testid = 'take';
    take.textContent = this.text('ui.take');
    take.addEventListener('click', () => this.takeSelected(w));
    this.take = take;
    this.panel.append(take);
    this.placeTake();
    this.syncEnabled();
  }

  private select(i: number): void {
    if (!this.ready || !this.win?.cards[i]?.available) return;
    this.selected = i;
    this.placeTake();
  }

  /** «Взять» — только для своего окна: нажатие, пришедшее при другом game.window, ничего не делает. */
  private takeSelected(w: OfferWindow): void {
    if (!this.ready || this.selected === null || this.game.window !== w) return;
    this.game.takeCard(this.selected);
  }

  /** Ряд — под выбранной карточкой (место есть под каждой), стопка — под стопкой. Без выбора кнопки нет. */
  private placeTake(): void {
    const take = this.take!;
    this.cards.forEach((c, i) => c.classList.toggle('selected', i === this.selected));
    take.hidden = this.selected === null;
    if (this.selected === null || this.layout === null) return;
    const b = BOX[this.layout];
    const card = this.cards[this.selected]!;
    const left = this.layout === 'landscape' ? parseFloat(card.style.left) + (b.cardW - b.takeW) / 2 : (DESIGN.portrait.w - b.takeW) / 2;
    const n = this.cards.length;
    const below = this.unlocks.length > 0 ? UNLOCK.h + UNLOCK.gap : 0;
    const top = this.layout === 'landscape' ? b.top + b.cardH + b.takeGap : b.top + n * b.cardH + (n - 1) * b.gap + b.takeGap + below;
    Object.assign(take.style, { left: `${left}px`, top: `${top}px`, width: `${b.takeW}px`, height: `${b.takeH}px` });
  }

  private syncEnabled(): void {
    this.win?.cards.forEach((offer, i) => (this.cards[i]!.disabled = !this.ready || !offer.available));
    if (this.take) this.take.disabled = !this.ready;
    for (const u of this.unlocks) u.disabled = !this.ready;
    if (this.refresh) this.refresh.disabled = !this.ready;
  }

  /** «Новые карточки за рекламу» под местом «Взять» (REFRESH). */
  private refreshButton(layout: Layout): HTMLButtonElement {
    const b = BOX[layout];
    const n = this.cards.length;
    const row = layout === 'landscape';
    const below = this.unlocks.length > 0 ? UNLOCK.h + UNLOCK.gap : 0;
    const takeTop = row ? b.top + b.cardH + b.takeGap : b.top + n * b.cardH + (n - 1) * b.gap + b.takeGap + below;
    const width = row ? REFRESH.rowW : REFRESH.stackW;
    const btn = document.createElement('button');
    btn.className = 'cards-refresh';
    btn.dataset.testid = 'cards-refresh';
    btn.textContent = this.text('ui.refresh_cards');
    Object.assign(btn.style, {
      left: `${(DESIGN[layout].w - width) / 2}px`, top: `${takeTop + b.takeH + REFRESH.gap}px`, width: `${width}px`, height: `${REFRESH.h}px`,
    });
    btn.addEventListener('click', () => {
      if (this.ready) this.onRefresh();
    });
    return btn;
  }

  private el(tag: string, cls: string, text: string, pos?: { top: number }): HTMLElement {
    const e = document.createElement(tag);
    e.className = cls;
    e.textContent = text;
    if (pos) e.style.top = `${pos.top}px`;
    return e;
  }
}
