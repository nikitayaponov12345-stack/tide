import { FixedStep } from '../../core/clock';
import type { Game } from '../../core/game';
import type { Platform } from '../../platform/platform';

/** Шаги ядра в игровом времени и начало игры для площадки. */
export class Control {
  private playing = false;
  private readonly clock = new FixedStep();

  constructor(
    private readonly game: Game,
    private readonly platform: Pick<Platform, 'gameplayStart'>,
  ) {}

  /** Время кадра → шаги ядра. */
  frame(frameMs: number): void {
    this.clock.advance(frameMs, (dt) => this.game.step(dt));
  }

  /** Первое действие игрока: игра пошла (для площадки), один раз. */
  notePlay(): void {
    if (this.playing) return;
    this.playing = true;
    this.platform.gameplayStart();
  }
}
