import type { Game } from './game';

/**
 * Шаг обучения, который показывает рука: бросок сети, тяга, карточка в окне, клетка в стройке (M1-19); слот копья и
 * краб — у первого краба, молоток и клетка — у первого ремонта, шхуна — на первом визите (M1-20).
 */
export type TutorialStep = 'throw' | 'pull' | 'card' | 'cell' | 'spear_slot' | 'spear_aim' | 'repair' | 'repair_cell' | 'visit';
export interface TutorialSnapshot { enabled: boolean; pulled: boolean }

/** Карточка, со стройки которой рука показывает место клетки. */
const RAFT_CARD = 'raft';
/** Шаги, на которых мир стоит, пока игрок не сделает показанное (первый краб, как у оригинала). */
const HOLD: readonly TutorialStep[] = ['spear_slot', 'spear_aim'];

/**
 * Обучение без текста (M1-19, GDD «Интерфейс»): рука показывает, что сделать, по цепочке «одно запускает следующее» —
 * первый бросок, тяга упавшей сети, первая карточка, первая клетка. Шаг считается по состоянию игры: пройденное видно
 * по счётчикам, колоде и плоту; свой флаг — только у тяги (по итогам её не видно). Ядро только отвечает, какой шаг
 * сейчас; руку рисует ui/tutorial.ts. Партия без обучения (выключено в GameConfig или запись до M1-19) шагов не даёт.
 *
 * Первый краб (M1-20): пока ни одного попадания копья, краб в круге дальности моряка — мир стоит, пока не выбран слот
 * копья, и снова, пока копьё у моряка (holds), — до первого попадания, как у оригинала.
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
   * клетка одна; ремонт — «клетка ремонта», пока ни одного нажатия; иначе на паузе руки нет. Первый краб в круге
   * дальности, пока ни одного попадания копья, — «слот копья», а с копьём у моряка — «краб». Ни одного броска —
   * «бросок», когда сеть у моряка и выбрана; сеть ни разу не тянули — «тяга», когда она лежит на воде. Клетка
   * повреждена, ремонта ещё не было — «молоток». Первый визит шхуны, пока по ней ни одного удара, — «шхуна».
   */
  step(g: Game): TutorialStep | null {
    if (!this.enabled) return null;
    if (g.window) return g.deck.takenTotal() === 0 ? 'card' : null;
    if (g.build) return g.build.card === RAFT_CARD && g.raft.cells.length < 2 ? 'cell' : null;
    if (g.repair) return g.stats.repairTaps === 0 ? 'repair_cell' : null;
    if (g.paused) return null;
    if (g.stats.spearHits === 0 && this.crabInRange(g)) {
      if (g.weapon === 'net') return 'spear_slot';
      if (g.spear.state === 'ready') return 'spear_aim';
    }
    if (g.stats.throws === 0) return g.weapon === 'net' && g.net.state === 'ready' ? 'throw' : null;
    if (!this.pulled && g.net.state === 'lying') return 'pull';
    if (g.stats.repairTaps === 0 && g.raft.damaged()) return 'repair';
    if (g.boss.visiting && g.boss.visits === 0 && g.stats.bossDamage === 0) return 'visit';
    return null;
  }

  /** Мир стоит: шаг первого краба (слот копья или краб, M1-20). */
  holds(g: Game): boolean {
    const s = this.step(g);
    return s !== null && HOLD.includes(s);
  }

  /** Мелкий враг ближе дальности броска копья к моряку. */
  private crabInRange(g: Game): boolean {
    const s = g.sailor;
    return g.spearOwned && g.enemies.list.some((e) => Math.hypot(e.x - s.x, e.y - s.y) <= g.spear.range);
  }

  snapshot(): TutorialSnapshot {
    return { enabled: this.enabled, pulled: this.pulled };
  }

  restore(s: TutorialSnapshot): void {
    this.enabled = s.enabled;
    this.pulled = s.pulled;
  }
}
