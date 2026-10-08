import { FixedStep, TIME_EPS } from '../../core/clock';
import type { Tables } from '../../core/data/tables';
import type { Game } from '../../core/game';
import { summarize, type TrialSummary } from '../../core/stats';
import type { Platform } from '../../platform/platform';
import { SCHEME_IDS, createScheme, nextScheme, type ControlScheme, type SchemeId } from './schemes';

/** Начальная схема из адреса: ?scheme=a|b|c|d (регистр не важен), иначе — a. */
export function schemeFromSearch(search: string): SchemeId {
  const v = new URLSearchParams(search).get('scheme')?.toLowerCase();
  return SCHEME_IDS.find((id) => id === v) ?? 'a';
}

export interface ControlListener {
  /** Новая проба с этой схемой (в том числе после сводки). */
  scheme(scheme: ControlScheme): void;
  /** Сводка открыта (цифры) или закрыта (null). */
  summary(s: TrialSummary | null): void;
}

/**
 * Проба схем управления: текущая схема, шаги ядра в игровом времени, конец пробы через trial_ms и пауза на сводке.
 * Пока сводка открыта, ядро не шагает; обе кнопки сводки начинают пробу заново.
 */
export class Control {
  scheme: ControlScheme;
  private paused = false;
  private playing = false;
  private readonly trialMs: number;
  private readonly clock = new FixedStep();

  constructor(
    private readonly game: Game,
    private readonly data: Tables,
    private readonly platform: Pick<Platform, 'gameplayStart' | 'gameplayStop'>,
    private readonly listener: ControlListener,
    initial: SchemeId = 'a',
  ) {
    this.trialMs = data.num('trial_ms');
    this.scheme = createScheme(initial, data);
  }

  get summaryOpen(): boolean {
    return this.paused;
  }

  /** Сколько игрового времени осталось до сводки (сумма шагов по 1/60 с не даёт ровного нуля — отсюда TIME_EPS). */
  get trialLeftMs(): number {
    const left = this.trialMs - this.game.stats.gameMs;
    return left < TIME_EPS ? 0 : left;
  }

  /** Время кадра → шаги ядра; на шаге, где проба кончилась, открывается сводка, и дальше ядро стоит. */
  frame(frameMs: number): void {
    this.clock.advance(frameMs, (dt) => {
      if (this.paused) return;
      this.game.step(dt);
      if (this.game.stats.gameMs + TIME_EPS >= this.trialMs) this.openSummary();
    });
  }

  /** Первое действие игрока: игра пошла (для площадки). */
  notePlay(): void {
    if (this.playing || this.paused) return;
    this.playing = true;
    this.platform.gameplayStart();
  }

  /** Сводка по текущим счётчикам и пауза (конец пробы или отладочная кнопка «Итоги»). */
  openSummary(): void {
    if (this.paused) return;
    this.paused = true;
    if (this.playing) {
      this.playing = false;
      this.platform.gameplayStop();
    }
    this.listener.summary(summarize(this.game.stats));
  }

  /** Новая проба со схемой id (кнопка схемы, кнопки сводки, __game.setScheme). */
  restart(id: SchemeId = this.scheme.id): void {
    this.scheme = createScheme(id, this.data);
    this.game.resetTrial();
    this.listener.scheme(this.scheme);
    if (this.paused) {
      this.paused = false;
      this.listener.summary(null);
      this.playing = true;
      this.platform.gameplayStart();
    }
  }

  /** Следующая схема по кругу, проба заново. */
  next(): void {
    this.restart(nextScheme(this.scheme.id));
  }
}
