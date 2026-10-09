import { FixedStep } from '../../core/clock';
import type { Game, OfferWindow } from '../../core/game';
import type { Platform } from '../../platform/platform';

/**
 * Шаги ядра в игровом времени и сигналы площадке, как у оригинала: первое нажатие — «игра идёт»,
 * окно выбора открылось — «игра остановлена», закрылось после «Взять» — «игра идёт» (даже если дальше стройка).
 * Сигналы — только после первого нажатия игрока.
 */
export class Control {
  private playing = false;
  private shownWindow: OfferWindow | null = null;
  private readonly clock = new FixedStep();

  constructor(
    private readonly game: Game,
    private readonly platform: Pick<Platform, 'gameplayStart' | 'gameplayStop'>,
  ) {}

  /** Время кадра → шаги ядра; затем сигналы о смене окна (в том числе после команд ввода между кадрами). */
  frame(frameMs: number): void {
    this.clock.advance(frameMs, (dt) => this.game.step(dt));
    const w = this.game.window;
    if (w === this.shownWindow) return;
    if (this.playing) {
      if (this.shownWindow !== null) this.platform.gameplayStart();
      if (w !== null) this.platform.gameplayStop();
    }
    this.shownWindow = w;
  }

  /** Первое действие игрока, один раз. При открытом окне «игра идёт» придёт, когда окно закроется. */
  notePlay(): void {
    if (this.playing) return;
    this.playing = true;
    // До первого нажатия сигналов не было: окно, открытое сейчас, считается уже показанным.
    this.shownWindow = this.game.window;
    if (this.game.window === null) this.platform.gameplayStart();
  }
}
