import { FixedStep } from '../../core/clock';
import type { Game, OfferWindow } from '../../core/game';
import type { Platform } from '../../platform/platform';

/** Метка открытой паузы для сравнения с показанным окном. */
const MENU = {};

/**
 * Шаги ядра в игровом времени и сигналы площадке, как у оригинала: первое нажатие — «игра идёт»,
 * окно выбора или пауза открылись — «игра остановлена», закрылись — «игра идёт» (даже если дальше стройка).
 * Сигналы — только после первого нажатия игрока.
 */
export class Control {
  private playing = false;
  private shown: OfferWindow | typeof MENU | null = null;
  private readonly clock = new FixedStep();

  constructor(
    private readonly game: Game,
    private readonly platform: Pick<Platform, 'gameplayStart' | 'gameplayStop'>,
  ) {}

  /** Время кадра → шаги ядра; затем сигналы о смене окна или паузы (в том числе после команд ввода между кадрами). */
  frame(frameMs: number): void {
    this.clock.advance(frameMs, (dt) => this.game.step(dt));
    const w = this.stopper();
    if (w === this.shown) return;
    if (this.playing) {
      if (this.shown !== null) this.platform.gameplayStart();
      if (w !== null) this.platform.gameplayStop();
    }
    this.shown = w;
  }

  /** Первое действие игрока, один раз. При открытом окне или паузе «игра идёт» придёт, когда они закроются. */
  notePlay(): void {
    if (this.playing) return;
    this.playing = true;
    // До первого нажатия сигналов не было: окно или пауза, открытые сейчас, считаются уже показанными.
    this.shown = this.stopper();
    if (this.shown === null) this.platform.gameplayStart();
  }

  /**
   * Реклама за награду: «игра остановлена» до неё (если игрок уже играл), «игра идёт» после, если нет окна выбора и паузы.
   * Исключение при показе — «не досмотрена». Ответ — досмотрена ли.
   */
  async rewarded(show: () => Promise<boolean>): Promise<boolean> {
    if (this.playing) this.platform.gameplayStop();
    let ok = false;
    try {
      ok = await show();
    } catch {
      ok = false;
    }
    if (this.playing && this.stopper() === null) this.platform.gameplayStart();
    return ok;
  }

  /** То, что останавливает игру для площадки: окно выбора, иначе пауза, иначе null. */
  private stopper(): OfferWindow | typeof MENU | null {
    return this.game.window ?? (this.game.menu ? MENU : null);
  }
}
