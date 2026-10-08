import type { Tables } from '../../core/data/tables';
import type { NetState, ThrowOptions } from '../../core/net';

export type SchemeId = 'a' | 'b' | 'c' | 'd';
/** Порядок схем по кругу: кнопка в отладочной панели и вторая кнопка сводки. */
export const SCHEME_IDS: readonly SchemeId[] = ['a', 'b', 'c', 'd'];

export interface PointerInfo { x: number; y: number; type: 'mouse' | 'touch' | 'pen'; id: number }   // x, y — координаты мира

/** То, что схема видит у игры: состояние сети и команды ядра. Game подходит как есть; тесты подают подделку. */
export interface SchemeGame {
  readonly net: { readonly state: NetState };
  throwTo(x: number, y: number, opts: ThrowOptions): boolean;
  setPull(on: boolean, mult?: number): void;
  setFollow(p: { x: number; y: number } | null): void;
}

/** Схема управления: превращает жест в команды ядра. */
export interface ControlScheme {
  readonly id: SchemeId;
  onDown(p: PointerInfo, g: SchemeGame): void;
  onMove(p: PointerInfo, g: SchemeGame): void;
  onUp(p: PointerInfo, g: SchemeGame): void;
  onCancel(p: PointerInfo, g: SchemeGame): void;   // палец ушёл (системный жест, вызов): никогда не бросает
}

/** Натяжение «Рогатки» для отрисовки: палец и точка броска до ограничения дальностью (null — натяжение короче минимума). */
export interface Aim { x: number; y: number; target: { x: number; y: number } | null }

export function nextScheme(id: SchemeId): SchemeId {
  return SCHEME_IDS[(SCHEME_IDS.indexOf(id) + 1) % SCHEME_IDS.length]!;
}

/** Новая схема (без незаконченного жеста); числа — из constants.csv. */
export function createScheme(id: SchemeId, data: Tables): ControlScheme {
  switch (id) {
    case 'a': return new SchemeA();
    case 'b': return new SchemeB(data);
    case 'c': return new SchemeC();
    case 'd': return new SchemeD(data);
  }
}

/**
 * Общее для схем: жест ведёт первый палец; до его up или cancel события других пальцев не дают команд.
 * pointer.ts фильтрует так же; здесь — чтобы схема вела себя одинаково и под ботом.
 */
abstract class BaseScheme implements ControlScheme {
  abstract readonly id: SchemeId;
  private finger: number | null = null;

  onDown(p: PointerInfo, g: SchemeGame): void {
    if (this.finger !== null) return;
    this.finger = p.id;
    this.down(p, g);
  }

  onMove(p: PointerInfo, g: SchemeGame): void {
    if (p.id === this.finger) this.move(p, g);
  }

  onUp(p: PointerInfo, g: SchemeGame): void {
    if (p.id !== this.finger) return;
    this.finger = null;
    this.up(p, g);
  }

  onCancel(p: PointerInfo, g: SchemeGame): void {
    if (p.id !== this.finger) return;
    this.finger = null;
    this.cancel(p, g);
  }

  protected abstract down(p: PointerInfo, g: SchemeGame): void;
  protected move(_p: PointerInfo, _g: SchemeGame): void {}
  protected abstract up(p: PointerInfo, g: SchemeGame): void;
  protected abstract cancel(p: PointerInfo, g: SchemeGame): void;
}

/**
 * Бросок и удержание: мышь бросает по нажатию, касание и перо — по отпусканию (если жест начался при ready);
 * удержание в любом месте тянет сеть, отпускание — сеть снова лежит (или идёт сама, если автотяга уже наступила).
 */
class TapPullScheme extends BaseScheme {
  private gestureFromReady = false;

  constructor(
    readonly id: SchemeId,
    private readonly autoPullAfterMs: number | null,
    private readonly holdMult: number | undefined,
  ) {
    super();
  }

  protected down(p: PointerInfo, g: SchemeGame): void {
    this.gestureFromReady = false;
    if (g.net.state === 'ready') {
      if (p.type === 'mouse') this.throw(p, g);
      else this.gestureFromReady = true;
    } else if (this.holdMult === undefined) {
      g.setPull(true);
    } else {
      g.setPull(true, this.holdMult);
    }
  }

  protected up(p: PointerInfo, g: SchemeGame): void {
    if (p.type !== 'mouse' && this.gestureFromReady && g.net.state === 'ready') this.throw(p, g);
    this.gestureFromReady = false;
    g.setPull(false);
  }

  protected cancel(_p: PointerInfo, g: SchemeGame): void {
    this.gestureFromReady = false;
    g.setPull(false);
  }

  private throw(p: PointerInfo, g: SchemeGame): void {
    g.throwTo(p.x, p.y, { autoPullAfterMs: this.autoPullAfterMs });
  }
}

/** Схема А «Классика»: бросок и удержание, автотяги нет. */
export class SchemeA extends TapPullScheme {
  constructor() {
    super('a', null, undefined);
  }
}

/** Схема Б «Автотяга»: как А, но сеть идёт назад сама через scheme_b_autopull_ms; удержание ×scheme_b_hold_mult. */
export class SchemeB extends TapPullScheme {
  constructor(data: Tables) {
    super('b', data.num('scheme_b_autopull_ms'), data.num('scheme_b_hold_mult'));
  }
}

/**
 * Схема В «Трал»: палец на воде — сеть сразу летит к нему (и мышь, и касание) и после падения идёт за пальцем;
 * отпустил — сеть возвращается сама. setFollow уходит уже на down: ядро запоминает точку на время полёта.
 */
export class SchemeC extends BaseScheme {
  readonly id = 'c' as const;

  protected down(p: PointerInfo, g: SchemeGame): void {
    if (g.net.state === 'ready') g.throwTo(p.x, p.y, { autoPullAfterMs: null });
    g.setFollow({ x: p.x, y: p.y });
  }

  protected override move(p: PointerInfo, g: SchemeGame): void {
    g.setFollow({ x: p.x, y: p.y });
  }

  protected up(_p: PointerInfo, g: SchemeGame): void {
    g.setFollow(null);
  }

  protected cancel(_p: PointerInfo, g: SchemeGame): void {
    g.setFollow(null);
  }
}

/**
 * Схема Г «Рогатка»: нажатие у плота и отпускание бросают сеть в точку плот + (плот − палец) × scheme_d_power
 * с автотягой «Автотяги»; натяжение короче scheme_d_min_drag_px (от точки нажатия) — не бросок.
 * Сеть в воде — удержание, как в «Автотяге».
 */
export class SchemeD extends BaseScheme {
  readonly id = 'd' as const;
  private readonly grab: number;
  private readonly power: number;
  private readonly minDrag: number;
  private readonly autoPullAfterMs: number;
  private readonly holdMult: number;
  private mode: 'none' | 'aim' | 'pull' = 'none';
  private startX = 0;
  private startY = 0;
  private x = 0;
  private y = 0;

  constructor(data: Tables) {
    super();
    this.grab = data.num('scheme_d_grab_px');
    this.power = data.num('scheme_d_power');
    this.minDrag = data.num('scheme_d_min_drag_px');
    this.autoPullAfterMs = data.num('scheme_b_autopull_ms');
    this.holdMult = data.num('scheme_b_hold_mult');
  }

  aim(): Aim | null {
    if (this.mode !== 'aim') return null;
    return { x: this.x, y: this.y, target: this.dragged() ? this.target() : null };
  }

  protected down(p: PointerInfo, g: SchemeGame): void {
    this.mode = 'none';
    if (g.net.state !== 'ready') {
      this.mode = 'pull';
      g.setPull(true, this.holdMult);
    } else if (Math.hypot(p.x, p.y) <= this.grab) {
      this.mode = 'aim';
      this.startX = this.x = p.x;
      this.startY = this.y = p.y;
    }
  }

  protected override move(p: PointerInfo): void {
    this.x = p.x;
    this.y = p.y;
  }

  protected up(p: PointerInfo, g: SchemeGame): void {
    const mode = this.mode;
    this.mode = 'none';
    this.x = p.x;
    this.y = p.y;
    if (mode === 'pull') {
      g.setPull(false);
    } else if (mode === 'aim' && this.dragged() && g.net.state === 'ready') {
      const t = this.target();
      g.throwTo(t.x, t.y, { autoPullAfterMs: this.autoPullAfterMs });
    }
  }

  protected cancel(_p: PointerInfo, g: SchemeGame): void {
    const mode = this.mode;
    this.mode = 'none';
    if (mode === 'pull') g.setPull(false);
  }

  private dragged(): boolean {
    return Math.hypot(this.x - this.startX, this.y - this.startY) >= this.minDrag;
  }

  /** Плот в (0, 0): плот + (плот − палец) × power. */
  private target(): { x: number; y: number } {
    return { x: -this.x * this.power, y: -this.y * this.power };
  }
}
