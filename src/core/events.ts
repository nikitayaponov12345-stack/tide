import { TIME_EPS } from './clock';
import type { GenericRow, Tables } from './data/tables';

export interface EventsSnapshot { calmMs: number; leftMs: number; count: number }

/**
 * Событие локации (GDD, «Угрозы», «События»): одно на локацию, первое — на event_first_s спокойного времени,
 * дальше — через event_period_s после конца прошлого. Спокойное время — игровое время вне события.
 */
export class LocationEvents {
  /** id события локации; null — у локации событий нет. */
  readonly id: string | null;
  readonly durationMs: number;
  /** Спокойное время с начала локации или с конца прошлого события. */
  calmMs = 0;
  /** Сколько осталось идущему событию; 0 — события нет. */
  leftMs = 0;
  /** Сколько событий было. */
  count = 0;
  private readonly row: GenericRow | null;
  private readonly firstMs: number;
  private readonly periodMs: number;

  constructor(data: Tables, locationId: string) {
    const loc = data.location(locationId);
    this.row = data.events.find((e) => e.id === loc.eventId && e.location === locationId) ?? null;
    this.id = this.row ? this.row.id! : null;
    this.durationMs = this.row ? Number(this.row.duration_s) * 1000 : 0;
    this.firstMs = data.num('event_first_s') * 1000;
    this.periodMs = data.num('event_period_s') * 1000;
  }

  get active(): boolean {
    return this.leftMs > 0;
  }

  /** Во сколько раз чаще приходят враги; вне события — 1. */
  get enemyRateMult(): number {
    return this.active ? Number(this.row!.enemy_rate_mult) : 1;
  }

  /** Множитель потока предметов; вне события — 1. */
  get flowMult(): number {
    return this.active ? Number(this.row!.flow_mult) : 1;
  }

  /** Враги видны целиком (на поверхности): идёт событие с enemies_surface = 1. */
  get enemiesSurface(): boolean {
    return this.active && this.row!.enemies_surface === '1';
  }

  /** Шаг: идёт событие — оно убывает; нет события и calm — копится спокойное время. Остаток шага на границе не переносится. */
  step(dtMs: number, calm: boolean): void {
    if (this.id === null) return;
    if (this.active) {
      this.leftMs -= dtMs;
      if (this.leftMs <= TIME_EPS) this.leftMs = 0;
      return;
    }
    if (!calm) return;
    this.calmMs += dtMs;
    if (this.calmMs + TIME_EPS >= (this.count === 0 ? this.firstMs : this.periodMs)) this.start();
  }

  /** Событие сейчас; идёт — начинается заново. Нет события у локации — ничего. */
  start(): void {
    if (this.id === null) return;
    this.leftMs = this.durationMs;
    this.calmMs = 0;
    this.count++;
  }

  snapshot(): EventsSnapshot {
    return { calmMs: this.calmMs, leftMs: this.leftMs, count: this.count };
  }

  restore(s: EventsSnapshot): void {
    this.calmMs = s.calmMs;
    this.leftMs = s.leftMs;
    this.count = s.count;
  }
}
