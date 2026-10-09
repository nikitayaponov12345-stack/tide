/**
 * Отладочная строка в левом нижнем углу: версия, раскладка, кадры, уровень и сеть.
 * Видна всегда; отладку отключает веха M5.
 */
export class Overlay {
  private readonly hud: HTMLDivElement;
  private lastUpdate = 0;

  constructor(host: HTMLElement) {
    const panel = document.createElement('div');
    panel.className = 'debug-panel';
    this.hud = document.createElement('div');
    this.hud.className = 'hud';
    this.hud.dataset.testid = 'hud';
    panel.append(this.hud);
    host.appendChild(panel);
  }

  /** Обновляет текст не чаще четырёх раз в секунду. */
  update(nowMs: number, text: string): void {
    if (nowMs - this.lastUpdate < 250) return;
    this.lastUpdate = nowMs;
    this.hud.textContent = text;
  }
}
