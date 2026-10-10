import { TIME_EPS } from './clock';
import type { Tables } from './data/tables';

/** Место кнопки буста в ads.csv. */
export const BOOST_OFFER_PLACE = 'boost_offer';

export interface BoostOfferSnapshot { ms: number; nextMs: number; leftMs: number; shown: number; taken: number }

/**
 * Предложение буста за рекламу (GDD, «Монетизация»): кнопка у края на visible_s, первое — на first_after_s игры,
 * следующее — через cooldown_s после начала прошлого. Пора, а нельзя (allowed ложно) — ждёт первого шага, когда можно.
 * Время — игровое; случайности нет. Нет рекламы за награду (enabled ложно) — предложений нет.
 */
export class BoostOffer {
  /** Игровое время, отсчитанное предложением. */
  ms = 0;
  /** С какого ms можно следующее предложение. */
  nextMs: number;
  /** Сколько ещё видна кнопка; 0 — не видна. */
  leftMs = 0;
  /** Предложений показано и взято. */
  shown = 0;
  taken = 0;
  /** Буст за рекламу, мс. */
  readonly adBoostMs: number;
  private readonly visibleMs: number;
  private readonly cooldownMs: number;

  constructor(data: Tables, readonly enabled: boolean) {
    const row = data.ads.find((a) => a.place === BOOST_OFFER_PLACE);
    if (!row) throw new Error(`ads.csv: нет места ${BOOST_OFFER_PLACE}`);
    this.cooldownMs = Number(row.cooldown_s) * 1000;
    this.visibleMs = Number(row.visible_s) * 1000;
    this.nextMs = Number(row.first_after_s) * 1000;
    this.adBoostMs = data.num('boost_ad_s') * 1000;
  }

  get visible(): boolean {
    return this.leftMs > 0;
  }

  /** Шаг: кнопка видна — время её убывает; иначе пора и можно (allowed) — новое предложение. */
  step(dtMs: number, allowed: boolean): void {
    this.ms += dtMs;
    if (this.visible) {
      this.leftMs -= dtMs;
      if (this.leftMs <= TIME_EPS) this.leftMs = 0;
      return;
    }
    if (allowed && this.ms + TIME_EPS >= this.nextMs) this.show();
  }

  /** Кнопка сейчас; следующее — через cooldown_s. Рекламы за награду нет → false. */
  show(): boolean {
    if (!this.enabled) return false;
    this.leftMs = this.visibleMs;
    this.shown++;
    this.nextMs = this.ms + this.cooldownMs;
    return true;
  }

  /** Нажатие на кнопку: она гаснет. Кнопки нет → false. */
  take(): boolean {
    if (!this.visible) return false;
    this.leftMs = 0;
    this.taken++;
    return true;
  }

  snapshot(): BoostOfferSnapshot {
    return { ms: this.ms, nextMs: this.nextMs, leftMs: this.leftMs, shown: this.shown, taken: this.taken };
  }

  restore(s: BoostOfferSnapshot): void {
    this.ms = s.ms;
    this.nextMs = s.nextMs;
    this.leftMs = s.leftMs;
    this.shown = s.shown;
    this.taken = s.taken;
  }
}
