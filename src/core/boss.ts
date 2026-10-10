import { TIME_EPS } from './clock';
import type { GenericRow, ItemRow, Tables } from './data/tables';
import type { EnemyHit } from './enemies';
import { isIntact, type Cell, type Raft } from './raft';
import type { Rng } from './rng';
import type { Stats } from './stats';
import type { World } from './world';

export type BossSide = 'bottom' | 'top' | 'left' | 'right';
export const BOSS_SIDES: readonly BossSide[] = ['bottom', 'top', 'left', 'right'];
/** Ядро шхуны в полёте: где оно и в какую клетку летит. */
export interface BossBall { x: number; y: number; gx: number; gy: number }
export interface BossSnapshot {
  visiting: boolean; side: BossSide; dir: number; line: number; pos: number; shotMs: number; damage: number; chests: number;
  visits: number; calmMs: number; nextMs: number; balls: BossBall[]; rng: number;
}

/** Повадка босса, которую знает M1: шхуна проходит вдоль стороны поля (имя осталось с «вдоль нижнего края»). */
const PASS_EDGE = 'pass_bottom_edge';

/** Знак числа, 0 — за +1. */
function sign(v: number): number {
  return v < 0 ? -1 : 1;
}

/**
 * Визиты босса локации (GDD, «Угрозы», «Боссы»): первый — сразу после первого события, дальше — через
 * boss_visit_period_min_s…max_s спокойного времени. В Лагуне — шхуна: идёт по течению вдоль случайной стороны поля
 * у самого плота (копьё моряка достаёт), бьёт ядрами по дальней клетке с постройкой и уходит сама.
 * Урон по ней даёт сундуки. Свой Rng (ARCHITECTURE, инвариант 3).
 */
export class BossVisits {
  /** id босса с известной повадкой; null — визитов нет. */
  readonly id: string | null;
  visiting = false;
  side: BossSide = 'bottom';
  /** Ход вдоль стороны: +1 — к большим координатам, −1 — к меньшим. */
  dir = 1;
  /** Середина шхуны поперёк хода: y у нижней и верхней сторон, x у боковых. */
  line = 0;
  /** Середина шхуны вдоль хода. */
  pos = 0;
  /** Время с начала визита или с прошлого выстрела. */
  shotMs = 0;
  /** Урон и сундуки этого визита. */
  damage = 0;
  chests = 0;
  /** Сколько визитов кончилось. */
  visits = 0;
  /** Спокойное время с конца прошлого визита и сколько его нужно до следующего; до первого визита nextMs = 0. */
  calmMs = 0;
  nextMs = 0;
  readonly balls: BossBall[] = [];
  readonly halfLength: number;
  readonly halfWidth: number;
  private readonly row: GenericRow | null;
  private readonly chest: ItemRow | null;
  private readonly speed: number;
  private readonly periodMs: number;
  private readonly ballDamage: number;
  private readonly perChest: number;
  private readonly maxChests: number;
  private readonly currentDx: number;
  private readonly currentDy: number;
  private readonly cellPx: number;

  constructor(
    private readonly data: Tables,
    locationId: string,
    private readonly rng: Rng,
    private readonly world: World,
    private readonly stats: Stats,
  ) {
    const loc = data.location(locationId);
    this.row = data.bosses.find((b) => b.id === loc.bossId && b.location === locationId && b.behavior === PASS_EDGE) ?? null;
    this.id = this.row ? this.row.id! : null;
    this.chest = this.row ? data.item(this.row.chest_item!) : null;
    this.speed = this.row ? Number(this.row.visit_speed) : 0;
    this.periodMs = this.row ? Number(this.row.visit_attack_period_s) * 1000 : 0;
    this.ballDamage = this.row ? Number(this.row.visit_damage) * loc.enemyDmgMult : 0;
    this.perChest = data.num('boss_chest_per_damage') * loc.enemyHpMult;
    this.maxChests = data.num('boss_visit_max_chests');
    this.halfLength = data.num('boss_ship_length_px') / 2;
    this.halfWidth = data.num('boss_ship_width_px') / 2;
    this.currentDx = loc.currentDx;
    this.currentDy = loc.currentDy;
    this.cellPx = data.num('cell_px');
  }

  /** Сторона нижняя или верхняя: шхуна идёт по x. */
  get horizontal(): boolean {
    return this.side === 'bottom' || this.side === 'top';
  }

  get x(): number {
    return this.horizontal ? this.pos : this.line;
  }

  get y(): number {
    return this.horizontal ? this.line : this.pos;
  }

  /** Полуразмеры корпуса по осям: вдоль хода — halfLength, поперёк — halfWidth. */
  get hx(): number {
    return this.horizontal ? this.halfLength : this.halfWidth;
  }

  get hy(): number {
    return this.horizontal ? this.halfWidth : this.halfLength;
  }

  /**
   * Шаг: ядра летят всегда; идёт визит — шхуна идёт и стреляет, ушла за край — визит кончился.
   * Визита нет и calm — копится спокойное время; первый визит — сразу после первого события (eventsDone ≥ 1).
   */
  step(dtMs: number, calm: boolean, eventsDone: number, raft: Raft): void {
    this.stepBalls(dtMs, raft);
    if (this.visiting) {
      this.pos += (this.dir * this.speed * dtMs) / 1000;
      this.shotMs += dtMs;
      // За долгий шаг — столько выстрелов, сколько положено по времени.
      while (this.shotMs + TIME_EPS >= this.periodMs) {
        this.shotMs -= this.periodMs;
        this.shoot(raft);
      }
      if (this.dir * this.pos - this.halfLength > this.halfAlong()) {
        this.visiting = false;
        this.visits++;
        this.calmMs = 0;
        this.nextMs = this.rng.range(this.data.num('boss_visit_period_min_s'), this.data.num('boss_visit_period_max_s')) * 1000;
      }
      return;
    }
    if (!calm) return;
    if (this.visits === 0) {
      if (eventsDone >= 1) this.start(raft);
      return;
    }
    this.calmMs += dtMs;
    if (this.calmMs + TIME_EPS >= this.nextMs) this.start(raft);
  }

  /** Визит сейчас вдоль стороны side (нет — случайной). Визит идёт или визитов у локации нет — ничего. */
  start(raft: Raft, side?: BossSide): void {
    if (this.visiting || this.id === null) return;
    this.side = side ?? BOSS_SIDES[this.rng.int(0, 3)]!;
    this.dir = this.horizontal ? sign(this.currentDx) : sign(this.currentDy);
    // Линия хода — от крайней клетки плота с этой стороны на boss_visit_gap_px до борта, но не ближе boss_ship_edge_px к краю.
    const out = this.side === 'bottom' || this.side === 'right' ? 1 : -1;
    let extreme = 0;
    for (const c of raft.cells) extreme = Math.max(extreme, out * (this.horizontal ? c.gy : c.gx) * this.cellPx);
    const { halfW, halfH } = this.world.config;
    const across = this.horizontal ? halfH : halfW;
    this.line = out * Math.min(across - this.data.num('boss_ship_edge_px'), extreme + this.data.num('boss_visit_gap_px') + this.halfWidth);
    this.pos = -this.dir * (this.halfAlong() + this.halfLength);
    this.visiting = true;
    this.shotMs = 0;
    this.damage = 0;
    this.chests = 0;
  }

  /** Шхуна на поле: её видно и можно бить (цель копья, как у финального босса). */
  get present(): boolean {
    return this.visiting;
  }

  /** Ближайшая к (x, y) точка корпуса. */
  nearestPoint(x: number, y: number): { x: number; y: number } {
    return {
      x: Math.min(this.x + this.hx, Math.max(this.x - this.hx, x)),
      y: Math.min(this.y + this.hy, Math.max(this.y - this.hy, y)),
    };
  }

  /** Удар по шхуне ближе reach к корпусу: весь урон, сундуки по накопленному урону визита. Не визит — мимо (финального боя у шхуны нет — решение Никиты 11.10). */
  hit(x: number, y: number, reach: number, damage: number): EnemyHit[] {
    if (!this.visiting || !(damage > 0)) return [];
    const p = this.nearestPoint(x, y);
    if (Math.hypot(p.x - x, p.y - y) >= reach) return [];
    this.damage += damage;
    this.stats.bossDamage += damage;
    while (this.chests < this.maxChests && Math.floor(this.damage / this.perChest + 1e-9) > this.chests) this.dropChest(p.x, p.y);
    return [{ x: p.x, y: p.y, dealt: damage }];
  }

  snapshot(): BossSnapshot {
    return {
      visiting: this.visiting, side: this.side, dir: this.dir, line: this.line, pos: this.pos, shotMs: this.shotMs,
      damage: this.damage, chests: this.chests, visits: this.visits, calmMs: this.calmMs, nextMs: this.nextMs,
      balls: this.balls.map((b) => ({ ...b })), rng: this.rng.getState(),
    };
  }

  restore(s: BossSnapshot): void {
    this.visiting = s.visiting;
    this.side = s.side;
    this.dir = s.dir;
    this.line = s.line;
    this.pos = s.pos;
    this.shotMs = s.shotMs;
    this.damage = s.damage;
    this.chests = s.chests;
    this.visits = s.visits;
    this.calmMs = s.calmMs;
    this.nextMs = s.nextMs;
    this.balls.length = 0;
    for (const b of s.balls) this.balls.push({ ...b });
    this.rng.setState(s.rng);
  }

  /** Полуразмер поля вдоль хода. */
  private halfAlong(): number {
    const { halfW, halfH } = this.world.config;
    return this.horizontal ? halfW : halfH;
  }

  /** Ядра летят к центрам своих клеток; долетевшее снимает прочность. Цель в полёте не меняется. */
  private stepBalls(dtMs: number, raft: Raft): void {
    const speed = this.data.num('boss_ball_speed');
    for (const b of [...this.balls]) {
      const tx = b.gx * this.cellPx;
      const ty = b.gy * this.cellPx;
      const left = Math.hypot(tx - b.x, ty - b.y);
      const move = (speed * dtMs) / 1000;
      if (left <= move + 1e-9) {
        this.balls.splice(this.balls.indexOf(b), 1);
        this.stats.bossCellDamage += raft.damage(b.gx, b.gy, this.ballDamage);
      } else {
        b.x += ((tx - b.x) / left) * move;
        b.y += ((ty - b.y) / left) * move;
      }
    }
  }

  /** Выстрел: в самую дальнюю от шхуны целую клетку с постройкой; таких нет — в дальнюю целую, кроме центральной. */
  private shoot(raft: Raft): void {
    const far = (cells: Cell[]): Cell | null => {
      let best: Cell | null = null;
      let bestD = -1;
      for (const c of cells) {
        const d = Math.hypot(c.gx * this.cellPx - this.x, c.gy * this.cellPx - this.y);
        if (d > bestD) {
          bestD = d;
          best = c;
        }
      }
      return best;
    };
    const intact = raft.cells.filter(isIntact);
    const target =
      far(intact.filter((c) => c.building !== null)) ?? far(intact.filter((c) => !(c.gx === 0 && c.gy === 0)));
    if (!target) return;
    this.balls.push({ x: this.x, y: this.y, gx: target.gx, gy: target.gy });
    this.stats.bossShots++;
  }

  /** Сундук у места удара: броски — место по осям, дрейф, фаза (как добыча врага). */
  private dropChest(x: number, y: number): void {
    const d = this.data;
    const s = d.num('loot_scatter_px');
    const cx = x + this.rng.range(-s, s);
    const cy = y + this.rng.range(-s, s);
    const speed = this.rng.range(d.num('loot_drift_min'), d.num('loot_drift_max'));
    const phase = this.rng.range(0, 2 * Math.PI);
    this.world.addLoot(this.chest!.id, cx, cy, speed, phase);
    this.chests++;
    this.stats.bossChests++;
  }
}
