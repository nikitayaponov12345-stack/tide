import { BOSS_SIDES, type BossSide } from './boss';
import { TIME_EPS } from './clock';
import type { Tables } from './data/tables';
import type { EnemyHit } from './enemies';
import { isIntact, type Cell, type Raft } from './raft';
import type { Stats } from './stats';
import type { World } from './world';

/** Боя ещё не было, ползёт к клетке, ударил и стоит, под водой, побеждён. */
export type FinalPhase = 'none' | 'crawl' | 'wait' | 'dive' | 'defeated';
export interface FinalBossSnapshot {
  phase: FinalPhase; side: BossSide; x: number; y: number; targetGx: number; targetGy: number; hp: number; leftMs: number;
}

/** Повадка финального босса, которую знает M1: краб-великан ползёт к клетке, бьёт, ныряет и всплывает напротив. */
const CRAWL_DIVE = 'crawl_dive';

const OPPOSITE: Readonly<Record<BossSide, BossSide>> = { bottom: 'top', top: 'bottom', left: 'right', right: 'left' };

/** Сторона левая или правая: краб выходит по x. */
function sideways(side: BossSide): boolean {
  return side === 'left' || side === 'right';
}

/** +1 у нижней и правой стороны, −1 у верхней и левой. */
function sideSign(side: BossSide): number {
  return side === 'bottom' || side === 'right' ? 1 : -1;
}

/**
 * Финальный бой локации (GDD, «Угрозы», «Боссы»; решение Никиты 11.10): в Лагуне — краб-великан.
 * Бой начинается на level_to_clear, когда окна уровней показаны и нет ни шторма, ни визита шхуны (условие — у Game).
 * Краб всплывает с той стороны, где до края поля дальше; от центра ближайшей целой клетки до его края —
 * boss_final_distance_px, так что копьё моряка его достаёт. Ползёт к этой клетке, бьёт её (центральная неуязвима),
 * стоит, ныряет и всплывает с противоположной стороны. Над водой его бьют копьё моряка и копейные башни, под водой — нет.
 * Не ворует, а бьёт клетки. Случайности нет, своего Rng нет.
 */
export class FinalBoss {
  /** id финального босса с известной повадкой; null — боя у локации нет. */
  readonly id: string | null;
  readonly nameKey: string;
  readonly maxHp: number;
  readonly radius: number;
  /** Уровень, на котором начинается бой. */
  readonly level: number;
  /** Опыт большого сундука (× сила локации). */
  readonly chestXp: number;
  phase: FinalPhase = 'none';
  side: BossSide = 'bottom';
  x = 0;
  y = 0;
  /** Клетка, к которой ползёт краб. */
  targetGx = 0;
  targetGy = 0;
  hp = 0;
  /** Остаток стоянки у клетки или нырка. */
  leftMs = 0;
  private readonly damage: number;
  private readonly speed: number;
  private readonly waitMs: number;
  private readonly diveMs: number;
  private readonly gap: number;
  private readonly cellPx: number;

  constructor(
    data: Tables,
    locationId: string,
    private readonly world: World,
    private readonly stats: Stats,
  ) {
    const loc = data.location(locationId);
    const row = data.bosses.find((b) => b.location === locationId && b.final_hp !== '' && b.behavior === CRAWL_DIVE) ?? null;
    this.id = row ? row.id! : null;
    this.nameKey = row ? row.name_key! : '';
    this.maxHp = row ? Number(row.final_hp) * loc.enemyHpMult : 0;
    this.damage = row ? Number(row.final_damage) * loc.enemyDmgMult : 0;
    this.radius = data.num('boss_crab_radius_px');
    this.speed = data.num('boss_crab_speed');
    this.waitMs = data.num('boss_crab_wait_ms');
    this.diveMs = data.num('boss_crab_dive_ms');
    this.gap = data.num('boss_final_distance_px');
    this.cellPx = data.num('cell_px');
    this.level = data.num('level_to_clear');
    let sum = 0;
    for (let l = 2; l <= this.level; l++) sum += data.levelStep(l, loc.xpMult);
    this.chestXp = data.num('boss_big_chest_share') * sum;
  }

  /** Идёт бой: краб ползёт, стоит или под водой. */
  get fighting(): boolean {
    return this.phase === 'crawl' || this.phase === 'wait' || this.phase === 'dive';
  }

  /** Краб над водой: его видно и можно бить. */
  get present(): boolean {
    return this.phase === 'crawl' || this.phase === 'wait';
  }

  get defeated(): boolean {
    return this.phase === 'defeated';
  }

  /** Начать бой: всплытие у side (нет — у стороны, где воды больше). Боя у локации нет или он уже был — ничего. */
  start(raft: Raft, side?: BossSide): void {
    if (this.id === null || this.phase !== 'none') return;
    this.hp = this.maxHp;
    if (side === undefined) {
      let best = -Infinity;
      for (const s of BOSS_SIDES) {
        const water = this.half(s) - this.reachOut(this.target(s, raft), s);
        if (water > best) {
          best = water;
          side = s;
        }
      }
    }
    this.surface(side!, raft);
  }

  /** Шаг боя в игровом времени: за долгий шаг — всё, что положено по времени (правило 1). Не бой — ничего. */
  step(dtMs: number, raft: Raft): void {
    if (!this.fighting) return;
    this.stats.finalFightMs += dtMs;
    let t = dtMs;
    while (t > TIME_EPS && this.fighting) {
      if (this.phase === 'crawl') {
        const tx = this.targetGx * this.cellPx;
        const ty = this.targetGy * this.cellPx;
        const d = Math.hypot(tx - this.x, ty - this.y);
        // Краб касается клетки краем.
        const need = Math.max(0, d - this.cellPx / 2 - this.radius);
        const can = (this.speed * t) / 1000;
        const move = Math.min(need, can);
        if (d > 0) {
          this.x += ((tx - this.x) / d) * move;
          this.y += ((ty - this.y) / d) * move;
        }
        if (need > can) return;
        t -= (need / this.speed) * 1000;
        this.stats.finalStrikes++;
        this.stats.finalCellDamage += raft.damage(this.targetGx, this.targetGy, this.damage);
        this.phase = 'wait';
        this.leftMs = this.waitMs;
        continue;
      }
      if (this.leftMs > t + TIME_EPS) {
        this.leftMs -= t;
        return;
      }
      t -= this.leftMs;
      this.leftMs = 0;
      if (this.phase === 'wait') {
        this.phase = 'dive';
        this.leftMs = this.diveMs;
      } else {
        this.surface(OPPOSITE[this.side], raft);
      }
    }
  }

  /** Ближайшая к (x, y) точка круга краба; изнутри круга — сама точка. */
  nearestPoint(x: number, y: number): { x: number; y: number } {
    const dx = x - this.x;
    const dy = y - this.y;
    const d = Math.hypot(dx, dy);
    if (d <= this.radius) return { x, y };
    return { x: this.x + (dx / d) * this.radius, y: this.y + (dy / d) * this.radius };
  }

  /** Удар ближе reach к краю краба над водой: урон не больше прочности; прочность кончилась — побеждён. Иначе — мимо. */
  hit(x: number, y: number, reach: number, damage: number): EnemyHit[] {
    if (!this.present || !(damage > 0) || Math.hypot(this.x - x, this.y - y) >= reach + this.radius) return [];
    const dealt = Math.min(damage, this.hp);
    this.hp -= dealt;
    this.stats.finalDamage += dealt;
    if (this.hp <= 1e-9) {
      this.hp = 0;
      this.phase = 'defeated';
    }
    return [{ x: this.x, y: this.y, dealt }];
  }

  /** Отладка: прочность сейчас (не выше полной); только в бою и при hp > 0. */
  debugHp(hp: number): void {
    if (this.fighting && hp > 0) this.hp = Math.min(hp, this.maxHp);
  }

  snapshot(): FinalBossSnapshot {
    return {
      phase: this.phase, side: this.side, x: this.x, y: this.y, targetGx: this.targetGx, targetGy: this.targetGy,
      hp: this.hp, leftMs: this.leftMs,
    };
  }

  restore(s: FinalBossSnapshot): void {
    this.phase = s.phase;
    this.side = s.side;
    this.x = s.x;
    this.y = s.y;
    this.targetGx = s.targetGx;
    this.targetGy = s.targetGy;
    this.hp = s.hp;
    this.leftMs = s.leftMs;
  }

  /** Полуразмер поля поперёк стороны: halfW у боковых, halfH у нижней и верхней. */
  private half(side: BossSide): number {
    const { halfW, halfH } = this.world.config;
    return sideways(side) ? halfW : halfH;
  }

  /** Насколько клетка выдаётся к стороне side: координата её центра наружу. */
  private reachOut(c: Cell, side: BossSide): number {
    return sideSign(side) * (sideways(side) ? c.gx : c.gy) * this.cellPx;
  }

  /**
   * Цель стороны: самая крайняя к ней целая клетка, из равных — ближе к середине стороны, затем — с меньшей координатой вдоль.
   * Целая клетка есть всегда: центральная неуязвима.
   */
  private target(side: BossSide, raft: Raft): Cell {
    const key = (c: Cell): number[] => {
      const along = sideways(side) ? c.gy : c.gx;
      return [-this.reachOut(c, side), Math.abs(along), along];
    };
    let best: Cell | null = null;
    let bestKey: number[] = [];
    for (const c of raft.cells) {
      if (!isIntact(c)) continue;
      const k = key(c);
      if (best === null || k[0]! < bestKey[0]! || (k[0] === bestKey[0] && (k[1]! < bestKey[1]! || (k[1] === bestKey[1] && k[2]! < bestKey[2]!)))) {
        best = c;
        bestKey = k;
      }
    }
    return best!;
  }

  /** Всплытие у стороны side напротив её цели: край краба — в gap от центра цели, но краб целиком в поле. */
  private surface(side: BossSide, raft: Raft): void {
    const c = this.target(side, raft);
    const out = sideSign(side) * Math.min(this.half(side) - this.radius, this.reachOut(c, side) + this.gap + this.radius);
    if (sideways(side)) {
      this.x = out;
      this.y = c.gy * this.cellPx;
    } else {
      this.x = c.gx * this.cellPx;
      this.y = out;
    }
    this.side = side;
    this.targetGx = c.gx;
    this.targetGy = c.gy;
    this.phase = 'crawl';
    this.leftMs = 0;
  }
}
