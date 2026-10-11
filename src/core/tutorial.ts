import type { Game } from './game';

/** Шаг обучения, который показывает рука (M1-19): бросок сети, тяга, карточка в окне, клетка в стройке. */
export type TutorialStep = 'throw' | 'pull' | 'card' | 'cell';
export interface TutorialSnapshot { enabled: boolean; pulled: boolean }

/** Карточка, со стройки которой рука показывает место клетки. */
const RAFT_CARD = 'raft';

/**
 * Обучение без текста (M1-19, GDD «Интерфейс»): рука показывает, что сделать, по цепочке «одно запускает следующее» —
 * первый бросок, тяга упавшей сети, первая карточка, первая клетка. Шаг считается по состоянию игры: пройденное видно
 * по счётчикам, колоде и плоту; свой флаг — только у тяги (по итогам её не видно). Ядро только отвечает, какой шаг
 * сейчас; руку рисует ui/tutorial.ts. Партия без обучения (выключено в GameConfig или запись до M1-19) шагов не даёт.
 */
export class Tutorial {
  /** Моряк хоть раз тянул сеть. */
  pulled = false;

  constructor(public enabled: boolean) {}

  /** После команды тяги: сеть тянется — тяга пройдена. */
  notePull(pulling: boolean): void {
    if (pulling) this.pulled = true;
  }

  /**
   * Шаг сейчас; null — руки нет. Окно выбора — «карточка», пока ни одной не взято; стройка «Плота» — «клетка», пока
   * клетка одна; иначе на паузе руки нет. Ни одного броска — «бросок», когда сеть у моряка и выбрана; сеть ни разу не
   * тянули — «тяга», когда она лежит на воде.
   */
  step(g: Game): TutorialStep | null {
    if (!this.enabled) return null;
    if (g.window) return g.deck.takenTotal() === 0 ? 'card' : null;
    if (g.build) return g.build.card === RAFT_CARD && g.raft.cells.length < 2 ? 'cell' : null;
    if (g.paused) return null;
    if (g.stats.throws === 0) return g.weapon === 'net' && g.net.state === 'ready' ? 'throw' : null;
    if (!this.pulled) return g.net.state === 'lying' ? 'pull' : null;
    return null;
  }

  snapshot(): TutorialSnapshot {
    return { enabled: this.enabled, pulled: this.pulled };
  }

  restore(s: TutorialSnapshot): void {
    this.enabled = s.enabled;
    this.pulled = s.pulled;
  }
}
