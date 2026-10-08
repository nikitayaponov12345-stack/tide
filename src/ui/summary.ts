import type { TrialSummary } from '../core/stats';

/** Кнопки окна неактивны столько после появления: двойное нажатие не запускает две пробы подряд (вёрстка). */
const ARM_DELAY_MS = 300;

export interface SummaryContent {
  scheme: string;      // «Схема: Б — автотяга»
  nextLabel: string;   // название следующей схемы
  onAgain(): void;
  onNext(): void;
}

/**
 * Окно «Итоги пробы» поверх затемнённого поля: цифры summarize и две кнопки — «Ещё раз» и следующая схема.
 * Рабочая заготовка до этапа арта; округление — только здесь.
 */
export class SummaryWindow {
  private readonly shade = document.createElement('div');
  private readonly box = document.createElement('div');
  private armTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    host: HTMLElement,
    private readonly text: (key: string) => string,
    private readonly lang: string,
  ) {
    this.shade.className = 'summary-shade';
    this.shade.dataset.testid = 'summary';
    this.shade.hidden = true;
    this.box.className = 'summary';
    this.shade.appendChild(this.box);
    host.appendChild(this.shade);
  }

  get open(): boolean {
    return !this.shade.hidden;
  }

  show(s: TrialSummary, c: SummaryContent): void {
    const t = this.text;
    const fmt = (n: number, digits: number): string =>
      n.toLocaleString(this.lang, { minimumFractionDigits: digits, maximumFractionDigits: digits });
    const rows: Array<[string, string]> = [
      [t('ui.summary.throws'), fmt(s.throwsPerMin, 1)],
      [t('ui.summary.items'), fmt(s.itemsPerThrow, 2)],
      [t('ui.summary.empty'), `${fmt(s.emptyPct, 0)} %`],
      [t('ui.summary.taps'), fmt(s.tapsPerMin, 1)],
      [t('ui.summary.xp'), fmt(s.xpPerMin, 1)],
    ];

    const title = el('h2', t('ui.summary'));
    const scheme = el('p', c.scheme);
    scheme.className = 'summary-scheme';
    const table = document.createElement('table');
    for (const [label, value] of rows) {
      const tr = document.createElement('tr');
      tr.append(el('td', label), el('td', value));
      table.appendChild(tr);
    }
    const again = this.button('again', t('ui.summary.again'), c.onAgain);
    const next = this.button('next', c.nextLabel, c.onNext);
    const buttons = document.createElement('div');
    buttons.className = 'summary-buttons';
    buttons.append(again, next);
    this.box.replaceChildren(title, scheme, table, buttons);

    this.shade.hidden = false;
    clearTimeout(this.armTimer);
    this.armTimer = setTimeout(() => {
      again.disabled = false;
      next.disabled = false;
    }, ARM_DELAY_MS);
  }

  hide(): void {
    clearTimeout(this.armTimer);
    this.shade.hidden = true;
    this.box.replaceChildren();
  }

  private button(testid: string, label: string, onClick: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.testid = `summary-${testid}`;
    b.textContent = label;
    b.disabled = true;
    b.addEventListener('click', () => {
      if (b.disabled || !this.open) return;
      onClick();
    });
    return b;
  }
}

function el(tag: string, text: string): HTMLElement {
  const e = document.createElement(tag);
  e.textContent = text;
  return e;
}
