import type { Role, Tables } from './data/tables';
import type { Sailor } from './sailor';
import type { World } from './world';

export type NetState = 'ready' | 'flying' | 'lying' | 'pulling';
export interface NetParams { radius: number; capacity: number; range: number; pull: number }  // из sailor.csv (ярус 1) и позже карточек
export interface CaughtItem { kind: string; role: Role; xp: number; weight: number; x: number; y: number }  // xp — Item.xp (без силы локации)

type Point = { x: number; y: number };

/**
 * Сеть моряка: бросок от моряка, полёт с замедлением, ловля, тяга к моряку удержанием.
 * Удержание запоминается как состояние; что из него следует, решает step.
 * Сеть забирается, когда касается квадрата моряка, — и тягой, и упав у него.
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
  /** Удержание включено (в том числе в полёте — тогда упавшая сеть сразу тянется). */
  private hold = false;

  constructor(
    data: Tables,
    params: NetParams,
    private readonly sailor: Sailor,
  ) {
    this.params = { ...params };
    this.flightSpeed = data.num('net_flight_speed');
    this.flightEnd = data.num('net_flight_end_mult');
    this.pullMin = data.num('net_pull_min');
    this.pullMax = data.num('net_pull_max');
    this.reset();
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

  /** Скорость тяги при текущем улове, точек в секунду. */
  pullSpeed(): number {
    const v = this.params.pull / (1 + this.weight);
    return Math.min(this.pullMax, Math.max(this.pullMin, v));
  }

  /** Бросок от точки моряка; точка дальше range переносится на край круга дальности. */
  throwTo(x: number, y: number): boolean {
    if (this.state !== 'ready') return false;
    const t = this.clampToRange(x, y);
    this.fromX = this.x = this.sailor.x;
    this.fromY = this.y = this.sailor.y;
    this.toX = t.x;
    this.toY = t.y;
    this.path = Math.hypot(t.x - this.fromX, t.y - this.fromY);
    this.done = 0;
    this.state = 'flying';
    return true;
  }

  setPull(on: boolean): void {
    if (this.state === 'ready') return;
    this.hold = on;
    if (on && this.state === 'lying') this.state = 'pulling';
    else if (!on && this.state === 'pulling') this.state = 'lying';
  }

  /** Шаг сети: полёт или тяга → ловля → касание моряка. Не null — сеть забрана с уловом. */
  step(dtMs: number, world: World): CaughtItem[] | null {
    if (this.state === 'ready') return null;
    const dt = dtMs / 1000;
    if (this.state === 'flying') this.fly(dt);
    else if (this.state === 'pulling') this.moveTo(this.sailor.x, this.sailor.y, this.pullSpeed() * dt);
    if (this.state === 'flying') return null;
    this.catchItems(world);
    if (this.sailor.touches(this.x, this.y, this.params.radius)) return this.finish();
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
    this.state = this.hold ? 'pulling' : 'lying';
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

  /** Сеть у моряка: ready в его точке, улов пуст, удержание сброшено. */
  reset(): void {
    this.caught.length = 0;
    this.state = 'ready';
    this.x = this.sailor.x;
    this.y = this.sailor.y;
    this.hold = false;
  }

  /** Точка в круге дальности вокруг моряка: дальше range — на его край. */
  private clampToRange(x: number, y: number): Point {
    const sx = this.sailor.x;
    const sy = this.sailor.y;
    const d = Math.hypot(x - sx, y - sy);
    const r = this.params.range;
    return d > r ? { x: sx + ((x - sx) / d) * r, y: sy + ((y - sy) / d) * r } : { x, y };
  }
}
