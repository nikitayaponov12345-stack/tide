export interface OverlayActions {
  onScheme(): void;
  onSummary(): void;
}

/**
 * Отладочная панель в левом нижнем углу: кнопки «Схема: …» и «Итоги» над строкой состояния.
 * Панель видна всегда (по ней переключают схемы на телефоне); отладку отключает веха M5.
 */
export class Overlay {
  private readonly hud: HTMLDivElement;
  private readonly schemeBtn: HTMLButtonElement;
  private lastUpdate = 0;

  constructor(host: HTMLElement, actions: OverlayActions) {
    const panel = document.createElement('div');
    panel.className = 'debug-panel';
    const buttons = document.createElement('div');
    buttons.className = 'debug-buttons';
    this.schemeBtn = button('debug-scheme', actions.onScheme);
    // «Итоги» — отладочная кнопка, без перевода, как и строка состояния.
    buttons.append(this.schemeBtn, button('debug-summary', actions.onSummary, 'Итоги'));
    this.hud = document.createElement('div');
    this.hud.className = 'hud';
    this.hud.dataset.testid = 'hud';
    panel.append(buttons, this.hud);
    host.appendChild(panel);
  }

  setSchemeLabel(text: string): void {
    this.schemeBtn.textContent = text;
  }

  /** Обновляет текст не чаще четырёх раз в секунду. */
  update(nowMs: number, text: string): void {
    if (nowMs - this.lastUpdate < 250) return;
    this.lastUpdate = nowMs;
    this.hud.textContent = text;
  }
}

function button(testid: string, onClick: () => void, text = ''): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.dataset.testid = testid;
  b.textContent = text;
  b.addEventListener('click', onClick);
  return b;
}
