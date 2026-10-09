import { TIME_EPS } from './clock';
import type { Tables } from './data/tables';
import type { CaughtItem } from './net';

export interface Icon { xp: number; launchMs: number; arriveMs: number; fromX: number; fromY: number }  // xp — уже × сила локации

export interface ProgressionSnapshot { level: number; xp: number; icons: Icon[]; levelUps: number[] }

/** Опыт и уровни. Улов превращается в значки, опыт начисляется по их прилёту к полосе. */
export class Progression {
  level = 1;
  xp = 0;
  readonly icons: Icon[] = [];
  readonly levelUps: number[] = [];
  private readonly interval: number;
  private readonly flight: number;

  constructor(
    private readonly data: Tables,
    private readonly xpMult: number,
  ) {
    this.interval = data.num('icon_interval_ms');
    this.flight = data.num('icon_flight_ms');
  }

  xpToNext(): number {
    return this.data.levelStep(this.level + 1, this.xpMult);
  }

  /** Значки улова: i-й вылетает в nowMs + i × icon_interval_ms. Сила локации умножается здесь, один раз. */
  addCatch(items: CaughtItem[], nowMs: number): void {
    items.forEach((it, i) => {
      const launchMs = nowMs + i * this.interval;
      this.icons.push({ xp: it.xp * this.xpMult, launchMs, arriveMs: launchMs + this.flight, fromX: it.x, fromY: it.y });
    });
  }

  /** Прилетевшие значки начисляют опыт; возвращает опыт, начисленный за этот шаг. */
  step(nowMs: number): number {
    let gained = 0;
    for (let i = 0; i < this.icons.length; ) {
      const icon = this.icons[i]!;
      if (icon.arriveMs <= nowMs + TIME_EPS) {
        gained += icon.xp;
        this.icons.splice(i, 1);
      } else {
        i++;
      }
    }
    if (gained > 0) this.addXp(gained);
    return gained;
  }

  /** Прибавить опыт; каждый новый уровень уходит в levelUps. */
  addXp(amount: number): void {
    this.xp += amount;
    while (this.xp >= this.xpToNext()) {
      this.xp -= this.xpToNext();
      this.level += 1;
      this.levelUps.push(this.level);
    }
  }

  takeLevelUps(): number[] {
    return this.levelUps.splice(0, this.levelUps.length);
  }

  /** Значки в полёте — в снимке: их опыт ещё не начислен. */
  snapshot(): ProgressionSnapshot {
    return { level: this.level, xp: this.xp, icons: this.icons.map((i) => ({ ...i })), levelUps: this.levelUps.slice() };
  }

  restore(s: ProgressionSnapshot): void {
    this.level = s.level;
    this.xp = s.xp;
    this.icons.length = 0;
    for (const i of s.icons) this.icons.push({ ...i });
    this.levelUps.length = 0;
    this.levelUps.push(...s.levelUps);
  }

  /** Отладка и проба: уровень, xp = 0, значки сброшены. */
  setLevel(level: number): void {
    this.level = level;
    this.xp = 0;
    this.icons.length = 0;
  }

  /** Новая проба: уровень 1, опыт 0, значки и levelUps сброшены. */
  reset(): void {
    this.setLevel(1);
    this.levelUps.length = 0;
  }
}
