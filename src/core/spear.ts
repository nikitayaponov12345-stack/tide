import { TIME_EPS } from './clock';
import type { Tables } from './data/tables';
import type { EnemyHit } from './enemies';
import type { Flight } from './net';
import type { Sailor } from './sailor';

export type SpearState = 'ready' | 'flying' | 'returning';
export interface SpearSnapshot { state: SpearState; x: number; y: number; damage: number; range: number; flight: Flight }

/** Что копьё видит у врагов: урон по кругу. Enemies подходит как есть. */
export interface SpearTargets {
  hit(x: number, y: number, reach: number, damage: number): EnemyHit[];
}

/**
 * Копьё моряка: бросок от моряка в точку внутри круга дальности, полёт с постоянной скоростью,
 * удар по всем врагам у точки падения, возврат к моряку. Копьё одно: пока не вернулось, второго броска нет.
 */
export class Spear {
  state: SpearState = 'ready';
  x = 0;
  y = 0;
  /** Урон по врагу за попадание: ярус моряка плюс карточки. Выставляет Game. */
  damage = 0;
  /** Круг дальности — общий с сетью. Выставляет Game. */
  range = 0;
  private readonly flightSpeed: number;
  private readonly returnSpeed: number;
  private readonly hitRadius: number;

  // полёт
  private fromX = 0;
  private fromY = 0;
  private toX = 0;
  private toY = 0;
  private path = 0;
  private done = 0;

  constructor(
    data: Tables,
    private readonly sailor: Sailor,
  ) {
    this.flightSpeed = data.num('spear_flight_speed');
    this.returnSpeed = data.num('spear_return_speed');
    this.hitRadius = data.num('spear_hit_radius');
    this.reset();
  }

  /** Бросок от точки моряка; точка дальше range переносится на край круга дальности. */
  throwTo(x: number, y: number): boolean {
    if (this.state !== 'ready') return false;
    const sx = this.sailor.x;
    const sy = this.sailor.y;
    const d = Math.hypot(x - sx, y - sy);
    const r = this.range;
    this.fromX = this.x = sx;
    this.fromY = this.y = sy;
    this.toX = d > r ? sx + ((x - sx) / d) * r : x;
    this.toY = d > r ? sy + ((y - sy) / d) * r : y;
    this.path = Math.hypot(this.toX - sx, this.toY - sy);
    this.done = 0;
    this.state = 'flying';
    return true;
  }

  snapshot(): SpearSnapshot {
    const { fromX, fromY, toX, toY, path, done } = this;
    return { state: this.state, x: this.x, y: this.y, damage: this.damage, range: this.range, flight: { fromX, fromY, toX, toY, path, done } };
  }

  restore(s: SpearSnapshot): void {
    this.state = s.state;
    this.x = s.x;
    this.y = s.y;
    this.damage = s.damage;
    this.range = s.range;
    ({ fromX: this.fromX, fromY: this.fromY, toX: this.toX, toY: this.toY, path: this.path, done: this.done } = s.flight);
  }

  /** Шаг копья: полёт → удар в точке падения (ровно один раз) → возврат остатком шага. Попадания этого шага. */
  step(dtMs: number, targets: SpearTargets): EnemyHit[] {
    let restMs = dtMs;
    let hits: EnemyHit[] = [];
    if (this.state === 'flying') {
      const move = (this.flightSpeed * dtMs) / 1000;
      const left = this.path - this.done;
      if (move + 1e-9 < left) {
        this.done += move;
        const f = this.done / this.path;
        this.x = this.fromX + (this.toX - this.fromX) * f;
        this.y = this.fromY + (this.toY - this.fromY) * f;
        return hits;
      }
      this.x = this.toX;
      this.y = this.toY;
      restMs = Math.max(0, dtMs - (left / this.flightSpeed) * 1000);
      hits = targets.hit(this.x, this.y, this.hitRadius, this.damage);
      this.state = 'returning';
    }
    if (this.state === 'returning') {
      if (restMs > TIME_EPS) this.moveTo(this.sailor.x, this.sailor.y, (this.returnSpeed * restMs) / 1000);
      if (this.sailor.touches(this.x, this.y, this.hitRadius)) this.reset();
    }
    return hits;
  }

  /** Копьё у моряка: ready в его точке. */
  reset(): void {
    this.state = 'ready';
    this.x = this.sailor.x;
    this.y = this.sailor.y;
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
}
