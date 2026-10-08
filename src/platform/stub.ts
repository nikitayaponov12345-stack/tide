import type { Platform, PlatformCall } from './platform';

/**
 * Заглушка площадки: пишет вызовы в журнал (его читают тесты и боты), сохраняет в localStorage,
 * реклама «показывается» мгновенно, реклама за вознаграждение всегда досмотрена.
 */
export class StubPlatform implements Platform {
  readonly name = 'stub';
  readonly log: PlatformCall[] = [];
  private readonly t0 = performance.now();

  private rec(name: string): void {
    this.log.push({ t: Math.round(performance.now() - this.t0), name });
  }

  async init(): Promise<void> {
    this.rec('init');
  }

  loadingFinished(): void {
    this.rec('loadingFinished');
  }

  gameplayStart(): void {
    this.rec('gameplayStart');
  }

  gameplayStop(): void {
    this.rec('gameplayStop');
  }

  async showInterstitial(): Promise<void> {
    this.rec('interstitial');
  }

  async showRewarded(): Promise<boolean> {
    this.rec('rewarded');
    return true;
  }

  async save(key: string, data: string): Promise<void> {
    try {
      localStorage.setItem(key, data);
    } catch {
      // приватный режим или запрет хранилища: игра продолжает без сохранения
    }
  }

  async load(key: string): Promise<string | null> {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  language(): string {
    const lang = (navigator.languages?.[0] || navigator.language || 'en').toLowerCase();
    return lang.startsWith('ru') ? 'ru' : 'en';
  }
}
