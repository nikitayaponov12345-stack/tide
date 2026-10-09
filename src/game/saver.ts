import { TIME_EPS } from '../core/clock';
import type { Game, OfferWindow } from '../core/game';
import { makeSave, SAVE_KEY } from '../core/save';
import type { Platform } from '../platform/platform';

/**
 * Запись партии (ARCHITECTURE §7): после каждого окна и стройки, раз в autosaveMs игрового времени,
 * а по вызову save() — при сворачивании вкладки и уходе со страницы. Ответа площадки не ждёт.
 */
export class Saver {
  private lastWindow: OfferWindow | null;
  private lastBuild: { card: string } | null;
  private lastSaveMs: number;
  private disabled = false;

  constructor(
    private readonly platform: Pick<Platform, 'save'>,
    private readonly game: Game,
    private readonly locationId: string,
    private readonly seed: number,
    private readonly autosaveMs: number,
  ) {
    this.lastWindow = game.window;
    this.lastBuild = game.build;
    this.lastSaveMs = game.world.timeMs;
  }

  /** После шагов кадра: окно или стройка сменились, или с прошлой записи прошло autosaveMs. */
  frame(): void {
    if (this.disabled) return;
    const g = this.game;
    const changed = g.window !== this.lastWindow || g.build !== this.lastBuild;
    if (changed || g.world.timeMs - this.lastSaveMs + TIME_EPS >= this.autosaveMs) this.save();
  }

  /** Записать сейчас; текст записи в ответ. После disable() — '' и без записи. */
  save(): string {
    if (this.disabled) return '';
    const g = this.game;
    this.lastWindow = g.window;
    this.lastBuild = g.build;
    this.lastSaveMs = g.world.timeMs;
    const text = JSON.stringify(makeSave(g, this.locationId, this.seed));
    const warn = (err: unknown): void => console.warn('save failed', err);
    try {
      this.platform.save(SAVE_KEY, text).catch(warn);
    } catch (err) {
      warn(err);
    }
    return text;
  }

  /** Дальше не писать: перед «Стереть прогресс» и при записи новее сборки. */
  disable(): void {
    this.disabled = true;
  }
}
