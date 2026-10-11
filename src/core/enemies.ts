import { TIME_EPS } from './clock';
import type { ItemRow, Tables } from './data/tables';
import { isIntact, type Raft } from './raft';
import type { Rng } from './rng';
import type { Stats } from './stats';
import type { World } from './world';

export type EnemyPhase = 'approach' | 'wait' | 'leave';
/** Мелкий враг: плывёт к клетке цели, стоит у неё и уходит в точку появления; leader — вожак события (M1-16); нет поля — обычный. */
export interface Enemy {
  id: number; x: number; y: number; hp: number; radius: number; phase: EnemyPhase;
  spawnX: number; spawnY: number; targetGx: number; targetGy: number; waitLeftMs: number; leader?: boolean;
}
/** Попадание по врагу: где он был и сколько прочности снято. */
export interface EnemyHit { x: number; y: number; dealt: number }
/**
 * Что враги видят у игры на шаге; ready — условие первого врага выполнено; buildings — число построек (нет — 0);
 * rateMult — во сколько раз чаще враги в событие локации (нет — 1); blocked — идёт буст: новые враги не приходят;
 * event — идёт событие: его номер за партию и сколько оно уже идёт (нет поля — события нет).
 */
export interface EnemiesContext {
  raft: Raft; level: number; ready: boolean; buildings?: number; rateMult?: number; blocked?: boolean;
  event?: { count: number; elapsedMs: number };
}

/** leaderEvent — номер события, в которое уже приходил вожак (в записи до M1-16 поля нет — −1). */
export interface EnemiesSnapshot { list: Enemy[]; spawned: number; started: boolean; acc: number; nextId: number; rng: number; leaderEvent?: number }

/** Повадка, которую знает M1: краб Лагуны идёт к клетке под водой и кусает её. */
const WALK_UNDERWATER = 'walk_underwater';

/**
 * Мелкие враги локации: появление по таймеру за краем поля, путь к самой дальней целой клетке (мимо центральной),
 * укус по приходу, ожидание, уход, урон копьём и добыча; в событие локации — вожак (M1-16): крупнее, крепче, медленнее,
 * кусает сильнее, добычи на урон меньше. Свой Rng (ARCHITECTURE, инвариант 3): добыча не сдвигает поток предметов мира.
 */
export class Enemies {
  readonly list: Enemy[] = [];
  /** Сколько появилось за партию. */
  spawned = 0;
  /** Условие первого врага выполнялось: дальше таймер идёт всегда. */
  private started = false;
  private acc = 0;
  private nextId = 1;
  /** Номер события, в которое уже приходил вожак; −1 — ни в какое. */
  private leaderEvent = -1;
  /** Враг локации с известной повадкой; null — в M0 враги не приходят. */
  private readonly speed: number | null;
  private readonly loot: ItemRow | null;
  private readonly hpMult: number;
  /** Укус: damage краба × сила урона локации. */
  private readonly bite: number;
  private readonly radius: number;
  private readonly cellPx: number;
  /** Вожак события: срок от начала события, прочность на уровень, укус × сила урона локации, скорость, радиус, урон на предмет. */
  private readonly leader: { afterMs: number; hpPerLevel: number; bite: number; speed: number; radius: number; lootPerHp: number };

  constructor(
    private readonly data: Tables,
    locationId: string,
    private readonly rng: Rng,
    private readonly world: World,
    private readonly stats: Stats,
  ) {
    const loc = data.location(locationId);
    const row = data.enemies.find((e) => e.id === loc.enemyId);
    const known = row !== undefined && row.behavior === WALK_UNDERWATER;
    this.speed = known ? Number(row.speed) : null;
    this.loot = known ? data.item(row.loot_item!) : null;
    this.hpMult = loc.enemyHpMult;
    this.bite = known ? Number(row.damage) * loc.enemyDmgMult : 0;
    this.radius = data.num('enemy_radius_px');
    this.cellPx = data.num('cell_px');
    this.leader = {
      afterMs: data.num('leader_after_s') * 1000, hpPerLevel: data.num('leader_hp_per_level'),
      bite: data.num('leader_damage') * loc.enemyDmgMult, speed: data.num('leader_speed'),
      radius: data.num('leader_radius_px'), lootPerHp: data.num('leader_loot_per_hp'),
    };
  }

  /** Интервал между врагами, мс: база / (1 + доля × построек) / множитель события, не чаще минимума. */
  intervalMs(buildings: number, rateMult = 1): number {
    const d = this.data;
    const s = d.num('enemy_interval_base_s') / (1 + d.num('enemy_interval_per_building') * buildings) / rateMult;
    return Math.max(d.num('enemy_interval_min_s'), s) * 1000;
  }

  snapshot(): EnemiesSnapshot {
    return {
      list: this.list.map((e) => ({ ...e })), spawned: this.spawned, started: this.started, acc: this.acc,
      nextId: this.nextId, rng: this.rng.getState(), leaderEvent: this.leaderEvent,
    };
  }

  restore(s: EnemiesSnapshot): void {
    this.list.length = 0;
    for (const e of s.list) this.list.push({ ...e });
    this.spawned = s.spawned;
    this.started = s.started;
    this.acc = s.acc;
    this.nextId = s.nextId;
    this.rng.setState(s.rng);
    this.leaderEvent = s.leaderEvent ?? -1;
  }

  /** Шаг: движение врагов → таймер появления; в шаг, когда условие стало выполнено, — первый враг. Под бустом таймер стоит. */
  step(dtMs: number, ctx: EnemiesContext): void {
    if (this.speed === null) return;
    for (const e of [...this.list]) this.advance(e, dtMs, ctx.raft);
    // Буст: новых нет, накопитель не растёт, первый враг тоже ждёт. Те, что на поле, остаются.
    if (ctx.blocked) return;
    if (this.started) {
      // Враг, появившийся внутри шага, проходит остаток шага. Интервал стал короче накопленного — враг сразу, но один:
      // накопитель не больше нынешнего интервала. Долгий шаг по-прежнему даёт столько врагов, сколько положено.
      const interval = this.intervalMs(ctx.buildings ?? 0, ctx.rateMult ?? 1);
      this.acc = Math.min(this.acc, interval) + dtMs;
      while (this.acc + TIME_EPS >= interval) {
        this.acc -= interval;
        const e = this.spawn(ctx, null);
        if (this.acc > TIME_EPS) this.advance(e, this.acc, ctx.raft);
      }
    } else if (ctx.ready) {
      this.started = true;
      this.acc = 0;
      this.spawn(ctx, null);
    }
    // Вожак (M1-16): один на событие, на leader_after_s от его начала; не раньше первого врага и не под бустом —
    // пропущенный срок вожак догоняет в первом шаге, когда можно, если событие ещё идёт.
    const ev = ctx.event;
    if (this.started && ev && ev.count !== this.leaderEvent && ev.elapsedMs + TIME_EPS >= this.leader.afterMs) {
      this.leaderEvent = ev.count;
      this.spawn(ctx, null, true);
    }
  }

  /** Враг сейчас, без условия и таймера (отладка). С точкой — появляется в ней и туда же уходит. null — у локации нет врага M0. */
  spawnNow(ctx: EnemiesContext, at: { x: number; y: number } | null, leader = false): Enemy | null {
    return this.speed === null ? null : this.spawn(ctx, at, leader);
  }

  /** Урон всем врагам ближе reach + радиус к (x, y): min(damage, прочность), добыча по снятому, прочность 0 — утонул. */
  hit(x: number, y: number, reach: number, damage: number): EnemyHit[] {
    const out: EnemyHit[] = [];
    for (const e of [...this.list]) {
      if (Math.hypot(e.x - x, e.y - y) >= reach + e.radius) continue;
      const before = e.hp;
      const dealt = Math.min(damage, e.hp);
      if (!(dealt > 0)) continue;
      e.hp -= dealt;
      out.push({ x: e.x, y: e.y, dealt });
      // Один предмет на каждые enemy_hp_mult единиц снятой прочности, у вожака — на leader_loot_per_hp × enemy_hp_mult (data/README.md, «Добыча»).
      const per = e.leader ? this.hpMult * this.leader.lootPerHp : this.hpMult;
      const drops = Math.ceil(before / per - 1e-9) - Math.ceil(e.hp / per - 1e-9);
      for (let i = 0; i < drops; i++) this.dropLoot(e);
      if (e.hp <= 0) {
        this.remove(e);
        this.stats.enemiesKilled++;
        if (e.leader) this.stats.leadersKilled++;
      }
    }
    return out;
  }

  /** Все враги на поле гибнут сразу, без добычи (буст за рекламу); они идут в enemiesKilled. Ответ — сколько. */
  killAll(): number {
    const n = this.list.length;
    this.list.length = 0;
    this.stats.enemiesKilled += n;
    return n;
  }

  /** Новый враг: случайный край за полем (или точка), цель — самая дальняя целая клетка, кроме центральной, прочность по уровню. Броски: край, место, прочность (у вожака прочность без броска). */
  private spawn(ctx: EnemiesContext, at: { x: number; y: number } | null, leader = false): Enemy {
    let x: number;
    let y: number;
    if (at) {
      ({ x, y } = at);
    } else {
      const { halfW, halfH } = this.world.config;
      const out = this.data.num('enemy_spawn_outside_px');
      const edge = this.rng.int(0, 3);
      if (edge === 0 || edge === 2) {
        x = this.rng.range(-halfW, halfW);
        y = edge === 0 ? -halfH - out : halfH + out;
      } else {
        x = edge === 1 ? halfW + out : -halfW - out;
        y = this.rng.range(-halfH, halfH);
      }
    }
    // Нет целых клеток, кроме центральной, — цель центральная (её укус не ранит).
    let target = ctx.raft.cells.find((c) => c.gx === 0 && c.gy === 0)!;
    let best = -1;
    for (const c of ctx.raft.cells) {
      if (!isIntact(c) || (c.gx === 0 && c.gy === 0)) continue;
      const d = Math.hypot(c.gx * this.cellPx - x, c.gy * this.cellPx - y);
      if (d > best) {
        best = d;
        target = c;
      }
    }
    const hp = leader ? this.leader.hpPerLevel * ctx.level * this.hpMult : this.rollHp(ctx.level);
    const e: Enemy = {
      id: this.nextId++, x, y, hp, radius: leader ? this.leader.radius : this.radius, phase: 'approach',
      spawnX: x, spawnY: y, targetGx: target.gx, targetGy: target.gy, waitLeftMs: 0,
    };
    // У обычного краба поля leader нет совсем: записи не меняются.
    if (leader) {
      e.leader = true;
      this.stats.leaders++;
    }
    this.list.push(e);
    this.spawned++;
    return e;
  }

  /** Прочность: строка enemy_hp.csv с наибольшим from_level ≤ уровень, затем × сила локации. */
  private rollHp(level: number): number {
    let row = this.data.enemyHp[0]!;
    for (const r of this.data.enemyHp) if (Number(r.from_level) <= level) row = r;
    return this.rng.int(Number(row.hp_min), Number(row.hp_max)) * this.hpMult;
  }

  /** Время ms для врага: остаток уходит в следующую фазу. raft — для укуса. */
  private advance(e: Enemy, ms: number, raft: Raft): void {
    const speed = e.leader ? this.leader.speed : this.speed!;
    let t = ms;
    while (t > TIME_EPS) {
      if (e.phase === 'approach') {
        const tx = e.targetGx * this.cellPx;
        const ty = e.targetGy * this.cellPx;
        const need = Math.max(0, Math.hypot(tx - e.x, ty - e.y) - this.data.num('enemy_reach_px'));
        const can = (speed * t) / 1000;
        if (need <= can) {
          this.moveToward(e, tx, ty, need);
          t -= (need / speed) * 1000;
          // Укус — один раз, по приходу; цель не меняется, даже если клетку разбили по дороге.
          this.stats.bites++;
          this.stats.cellDamage += raft.damage(e.targetGx, e.targetGy, e.leader ? this.leader.bite : this.bite);
          e.phase = 'wait';
          e.waitLeftMs = this.data.num('enemy_wait_ms');
        } else {
          this.moveToward(e, tx, ty, can);
          t = 0;
        }
      } else if (e.phase === 'wait') {
        if (e.waitLeftMs <= t + TIME_EPS) {
          t -= e.waitLeftMs;
          e.waitLeftMs = 0;
          e.phase = 'leave';
        } else {
          e.waitLeftMs -= t;
          t = 0;
        }
      } else {
        const can = (speed * t) / 1000;
        if (Math.hypot(e.spawnX - e.x, e.spawnY - e.y) <= can) {
          this.remove(e);
          this.stats.enemiesEscaped++;
          return;
        }
        this.moveToward(e, e.spawnX, e.spawnY, can);
        t = 0;
      }
    }
  }

  private moveToward(e: Enemy, tx: number, ty: number, dist: number): void {
    const dx = tx - e.x;
    const dy = ty - e.y;
    const len = Math.hypot(dx, dy);
    if (len <= dist) {
      e.x = tx;
      e.y = ty;
      return;
    }
    e.x += (dx / len) * dist;
    e.y += (dy / len) * dist;
  }

  /** Предмет-добыча у врага: броски — место по осям, дрейф, фаза. */
  private dropLoot(e: Enemy): void {
    const d = this.data;
    const s = d.num('loot_scatter_px');
    const x = e.x + this.rng.range(-s, s);
    const y = e.y + this.rng.range(-s, s);
    const speed = this.rng.range(d.num('loot_drift_min'), d.num('loot_drift_max'));
    const phase = this.rng.range(0, 2 * Math.PI);
    this.world.addLoot(this.loot!.id, x, y, speed, phase);
    this.stats.lootDropped++;
  }

  private remove(e: Enemy): void {
    const i = this.list.indexOf(e);
    if (i >= 0) this.list.splice(i, 1);
  }
}
