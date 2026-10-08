/**
 * Слой интерфейса поверх холста (обычная вёрстка). На этапе 0 — одна строка состояния.
 * Окна и полосы игры будут жить здесь же, а не в PixiJS.
 */
export class Overlay {
  private readonly hud: HTMLDivElement;
  private lastUpdate = 0;

  constructor(host: HTMLElement) {
    this.hud = document.createElement('div');
    this.hud.className = 'hud';
    this.hud.dataset.testid = 'hud';
    host.appendChild(this.hud);
  }

  /** Обновляет текст не чаще четырёх раз в секунду. */
  update(nowMs: number, text: string): void {
    if (nowMs - this.lastUpdate < 250) return;
    this.lastUpdate = nowMs;
    this.hud.textContent = text;
  }
}
