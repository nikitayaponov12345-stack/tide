import { TIME_EPS } from './clock';
import type { Role, Tables } from './data/tables';
import type { Raft } from './raft';
import type { World } from './world';

export type NetState = 'ready' | 'flying' | 'lying' | 'pulling' | 'following';
export interface NetParams { radius: number; capacity: number; range: number; pull: number }  // из sailor.csv (ярус 1) и позже карточек
export interface CaughtItem { kind: string; role: Role; xp: number; weight: number; x: number; y: number }  // xp — Item.xp (без силы локации)
export interface ThrowOptions { autoPullAfterMs: number | null }   // null — тянуть только по удержанию (схема А)

type Point = { x: number; y: number };

/**
 * Сеть моряка: бросок, полёт с замедлением, ловля, тяга к плоту, ведение за точкой.
 * Команды (удержание, ведение) запоминаются как состояние; что из них следует, решает step.
 */
export class Net {
  state: NetState = 'ready';
  x = 0;
  y = 0;
  readonly caught: CaughtItem[] = [];
  private params: NetParams;
  private readonly flightSpeed: number;
  private readonly flightEnd: number;
  private readonly pullMin: number;
  private readonly pullMax: number;

  // полёт
  private fromX = 0;
  private fromY = 0;
  private toX = 0;
  private toY = 0;
  private path = 0;
  private done = 0;
  // команды и таймеры
  private hold = false;
  private holdMult = 1;
  private selfPull = false;
  /** Просьба ведения, пришедшая во время полёта: точка, null — «возвращайся сама», undefined — просьбы нет. */
  private pendingFollow: Point | null | undefined = undefined;
  private followPt: Point = { x: 0, y: 0 };
  private autoPullAfterMs: number | null = null;
  private sinceLandMs = 0;

  constructor(data: Tables, params: NetParams) {
    this.params = { ...params };
    this.flightSpeed = data.num('net_flight_speed');
    this.flightEnd = data.num('net_flight_end_mult');
    this.pullMin = data.num('net_pull_min');
    this.pullMax = data.num('net_pull_max');
  }

  get weight(): number {
    return this.caught.reduce((s, it) => s + it.weight, 0);
  }

  get netParams(): Readonly<NetParams> {
    return this.params;
  }

  setParams(p: NetParams): void {
    this.params = { ...p };
  }

  /** Скорость тяги с множителем mult при текущем улове, точек в секунду. */
  pullSpeed(mult = 1): number {
    const v = (this.params.pull * mult) / (1 + this.weight);
    return Math.min(this.pullMax, Math.max(this.pullMin, v));
  }

  throwTo(x: number, y: number, opts: ThrowOptions): boolean {
    if (this.state !== 'ready') return false;
    const t = this.clampToRange(x, y);
    this.fromX = this.x = 0;
    this.fromY = this.y = 0;
    this.toX = t.x;
    this.toY = t.y;
    this.path = Math.hypot(t.x, t.y);
    this.done = 0;
    this.pendingFollow = undefined;
    this.selfPull = false;
    this.autoPullAfterMs = opts.autoPullAfterMs;
    this.sinceLandMs = 0;
    this.state = 'flying';
    return true;
  }

  setPull(on: boolean, mult = 1): void {
    if (this.state === 'ready') return;
    this.hold = on;
    this.holdMult = mult;
    if (on && this.state === 'lying') this.state = 'pulling';
    else if (!on && this.state === 'pulling' && !this.selfPull) this.state = 'lying';
  }

  setFollow(p: Point | null): void {
    if (this.state === 'ready') return;
    const target = p === null ? null : this.clampToRange(p.x, p.y);
    if (this.state === 'flying') {
      this.pendingFollow = target;
    } else if (target === null) {
      this.selfPull = true;
      this.state = 'pulling';
    } else {
      this.followPt = target;
      this.state = 'following';
    }
  }

  /** Шаг сети: полёт или движение → ловля → проверка возврата. Не null — сеть вернулась с уловом. */
  step(dtMs: number, world: World, raft: Raft): CaughtItem[] | null {
    if (this.state === 'ready') return null;
    const dt = dtMs / 1000;
    if (this.state === 'flying') {
      this.fly(dt);
    } else {
      this.sinceLandMs += dtMs;
      if (this.autoPullAfterMs !== null && this.sinceLandMs + TIME_EPS >= this.autoPullAfterMs
        && (this.state === 'lying' || this.state === 'pulling')) {
        this.selfPull = true;
        this.state = 'pulling';
      }
      if (this.state === 'pulling') this.moveTo(0, 0, this.pullSpeed(this.hold ? this.holdMult : 1) * dt);
      else if (this.state === 'following') this.moveTo(this.followPt.x, this.followPt.y, this.pullSpeed(1) * dt);
    }
    if (this.state === 'flying') return null;
    this.catchItems(world);
    if ((this.state === 'pulling' || this.state === 'following') && raft.touches(this.x, this.y, this.params.radius)) {
      return this.finish();
    }
    return null;
  }

  /** Полёт с линейным по пути замедлением; путь за шаг — точное решение ds/dt = v0 (1 − k s / D). */
  private fly(dt: number): void {
    const k = 1 - this.flightEnd;
    if (this.path <= 0) {
      this.done = this.path;
    } else if (k <= 0) {
      this.done += this.flightSpeed * dt;
    } else {
      const lim = this.path / k;
      this.done = lim - (lim - this.done) * Math.exp((-this.flightSpeed * k * dt) / this.path);
    }
    if (this.done + 1e-9 >= this.path) {
      this.x = this.toX;
      this.y = this.toY;
      this.land();
      return;
    }
    const f = this.done / this.path;
    this.x = this.fromX + (this.toX - this.fromX) * f;
    this.y = this.fromY + (this.toY - this.fromY) * f;
  }

  private land(): void {
    this.sinceLandMs = 0;
    const pf = this.pendingFollow;
    this.pendingFollow = undefined;
    if (pf) {
      this.followPt = pf;
      this.state = 'following';
    } else if (pf === null) {
      this.selfPull = true;
      this.state = 'pulling';
    } else {
      this.state = this.hold ? 'pulling' : 'lying';
    }
  }

  private moveTo(tx: number, ty: number, dist: number): void {
    const dx = tx - this.x;
    const dy = ty - this.y;
    const len = Math.hypot(dx, dy);
    if (len <= dist) {
      this.x = tx;
      this.y = ty;
    } else {
      this.x += (dx / len) * dist;
      this.y += (dy / len) * dist;
    }
  }

  private catchItems(world: World): void {
    const { radius, capacity } = this.params;
    if (this.caught.length >= capacity) return;
    const ids: number[] = [];
    for (const it of world.items) {
      if (this.caught.length + ids.length >= capacity) break;
      if (Math.hypot(it.x - this.x, it.y - this.y) < radius + it.radius) ids.push(it.id);
    }
    for (const id of ids) {
      const it = world.removeItem(id);
      if (it) this.caught.push({ kind: it.kind, role: it.role, xp: it.xp, weight: it.weight, x: it.x, y: it.y });
    }
  }

  private finish(): CaughtItem[] {
    const out = this.caught.slice();
    this.reset();
    return out;
  }

  /** Сеть у моряка: ready в (0, 0), улов пуст, удержание, тяга «сама» и запомненные просьбы сброшены. */
  reset(): void {
    this.caught.length = 0;
    this.state = 'ready';
    this.x = 0;
    this.y = 0;
    this.hold = false;
    this.holdMult = 1;
    this.selfPull = false;
    this.pendingFollow = undefined;
    this.autoPullAfterMs = null;
    this.sinceLandMs = 0;
  }

  private clampToRange(x: number, y: number): Point {
    const d = Math.hypot(x, y);
    const r = this.params.range;
    return d > r ? { x: (x / d) * r, y: (y / d) * r } : { x, y };
  }
}
