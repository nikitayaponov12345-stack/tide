import { TIME_EPS } from './clock';
import type { Tables } from './data/tables';
import type { Rng } from './rng';
import type { World } from './world';

/** Роль предмета-бутылки в items.csv. */
export const BOTTLE_ROLE = 'bottle';

export interface BoostSnapshot { leftMs: number; bottleCaught: boolean; bottleId: number | null; rng: number }

/**
 * Буст (GDD, «Монетизация»): поток гуще в boost_flow_mult раз, новые мелкие враги не приходят, спокойное время события
 * и визитов стоит. Время буста складывается. Бесплатная проба — бутылка: всплывает у плота после первого побеждённого врага,
 * пока её не поймают; вернулась — буст на boost_bottle_s. Свой Rng (ARCHITECTURE, инвариант 3): бутылка не сдвигает поток мира.
 */
export class Boost {
  /** Сколько осталось бусту; 0 — буста нет. */
  leftMs = 0;
  /** Бутылку поймали: больше она не всплывает. */
  bottleCaught = false;
  /** id бутылки в воде; null — её там нет. */
  bottleId: number | null = null;
  readonly flowMult: number;
  /** Буст от бутылки, мс. */
  readonly bottleMs: number;
  /** Вид бутылки; null — в items.csv её нет, бутылок нет. */
  private readonly bottleKind: string | null;

  constructor(
    private readonly data: Tables,
    private readonly rng: Rng,
    private readonly world: World,
  ) {
    this.flowMult = data.num('boost_flow_mult');
    this.bottleMs = data.num('boost_bottle_s') * 1000;
    this.bottleKind = data.items.find((it) => it.role === BOTTLE_ROLE)?.id ?? null;
  }

  get active(): boolean {
    return this.leftMs > 0;
  }

  /** Буст на ms; идёт — время прибавляется. */
  start(ms: number): void {
    this.leftMs += ms;
  }

  /**
   * Шаг: буст убывает. Бутылки ещё не ловили, враг уже побеждён, бутылки нет ни в сети (inNet), ни в воде — всплывает новая
   * у плота. offered (M1-12) — уже было предложение буста за рекламу: новая не всплывает, та, что уже в воде, остаётся.
   * Броски: угол, расстояние, скорость, фаза.
   */
  step(dtMs: number, enemiesKilled: number, inNet: boolean, offered = false): void {
    if (this.active) {
      this.leftMs -= dtMs;
      if (this.leftMs <= TIME_EPS) this.leftMs = 0;
    }
    if (this.bottleCaught || this.bottleKind === null || enemiesKilled < 1 || inNet || offered) return;
    if (this.bottleId !== null && this.world.items.some((it) => it.id === this.bottleId)) return;
    const d = this.data;
    const angle = this.rng.range(0, 2 * Math.PI);
    const dist = this.rng.range(d.num('seed_near_raft_min_px'), d.num('seed_near_raft_max_px'));
    const speed = this.rng.range(d.num('item_speed_min'), d.num('item_speed_max'));
    const phase = this.rng.range(0, 2 * Math.PI);
    this.bottleId = this.world.addLoot(this.bottleKind, Math.cos(angle) * dist, Math.sin(angle) * dist, speed, phase).id;
  }

  /** Бутылка вернулась к моряку или башне: буст на bottleMs, бутылок больше нет. */
  bottleBack(): void {
    this.bottleCaught = true;
    this.bottleId = null;
    this.start(this.bottleMs);
  }

  snapshot(): BoostSnapshot {
    return { leftMs: this.leftMs, bottleCaught: this.bottleCaught, bottleId: this.bottleId, rng: this.rng.getState() };
  }

  restore(s: BoostSnapshot): void {
    this.leftMs = s.leftMs;
    this.bottleCaught = s.bottleCaught;
    this.bottleId = s.bottleId;
    this.rng.setState(s.rng);
  }
}
