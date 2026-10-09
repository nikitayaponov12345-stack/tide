import { TIME_EPS } from './clock';
import type { ItemRow, Role, Tables } from './data/tables';
import { Rng } from './rng';

/**
 * Море вокруг плота: поток предметов по таблицам локации и уровня, течение, засев поля на старте.
 * Начало координат — центр плота (центр клетки моряка), поле видимости — [−halfW, halfW] × [−halfH, halfH].
 */
export interface WorldConfig {
  halfW: number;      // полуразмеры поля видимости, точки дизайна
  halfH: number;
  speedMult: number;  // 1 в горизонтали, num('current_portrait_mult') в портрете
  locationId: string; // 'lagoon'
  level: number;      // 1
}

export interface Item {
  id: number; kind: string; role: Role; xp: number; x: number; y: number;   // xp — опыт из items.csv, без силы локации (её умножает M0-02)
  radius: number; weight: number; speed: number; phase: number;
}

/** Предмет считается ушедшим, когда отплыл за край поля дальше этого запаса (техническая константа). */
export const MARGIN = 60;

export class World {
  readonly items: Item[] = [];
  timeMs = 0;
  spawned = 0;   // появились из потока
  seeded = 0;    // засеяны на старте
  private spawnAcc = 0;
  private nextId = 1;
  private cfg: WorldConfig;
  private open: ItemRow[] = [];
  private openShare = 0;
  /** Направление течения локации, нормированное. */
  private readonly dir: { x: number; y: number };

  constructor(
    cfg: WorldConfig,
    private readonly data: Tables,
    private readonly rng: Rng,
  ) {
    this.cfg = { ...cfg };
    const loc = data.location(cfg.locationId);
    const len = Math.hypot(loc.currentDx, loc.currentDy) || 1;
    this.dir = { x: loc.currentDx / len, y: loc.currentDy / len };
    this.setLevel(cfg.level);
    this.seed();
  }

  get level(): number {
    return this.cfg.level;
  }

  get config(): Readonly<WorldConfig> {
    return this.cfg;
  }

  /** Поток и открытые предметы — по новому уровню; предметы в воде остаются, накопитель потока не сбрасывается. */
  setLevel(level: number): void {
    this.cfg.level = level;
    this.open = this.data.flowItems(this.cfg.locationId).filter((it) => it.unlockLevel !== null && it.unlockLevel <= level);
    this.openShare = this.open.reduce((s, it) => s + it.share, 0);
    if (this.open.length === 0 || !(this.openShare > 0)) {
      throw new Error(`World: на уровне ${level} в локации ${this.cfg.locationId} нет открытых предметов потока`);
    }
  }

  /** Поворот экрана: предметы остаются на своих местах относительно плота. */
  resize(halfW: number, halfH: number, speedMult: number): void {
    this.cfg.halfW = halfW;
    this.cfg.halfH = halfH;
    this.cfg.speedMult = speedMult;
  }

  /** «Ещё раз»: поле засевается заново; timeMs не меняется, id продолжают счёт. */
  reset(): void {
    this.items.length = 0;
    this.spawnAcc = 0;
    this.spawned = 0;
    this.seed();
  }

  /** Шаг игрового времени: время → движение → удаление ушедших → появление новых. */
  step(dtMs: number): void {
    this.timeMs += dtMs;
    const dt = dtMs / 1000;
    for (const it of this.items) {
      const { vx, vy } = this.velocityOf(it);
      it.x += vx * dt;
      it.y += vy * dt;
    }
    const { halfW, halfH } = this.cfg;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i]!;
      if (Math.abs(it.x) > halfW + MARGIN || Math.abs(it.y) > halfH + MARGIN) this.items.splice(i, 1);
    }
    // Накопитель: за долгий шаг появляется столько предметов, сколько положено по времени.
    const interval = 1000 / this.data.flowPerS(this.cfg.level);
    this.spawnAcc += dtMs;
    while (this.spawnAcc + TIME_EPS >= interval) {
      this.spawnAcc -= interval;
      this.spawn();
    }
  }

  removeItem(id: number): Item | undefined {
    const i = this.items.findIndex((it) => it.id === id);
    return i < 0 ? undefined : this.items.splice(i, 1)[0];
  }

  /** Добыча врага в точке (x, y): множитель скорости и фазу бросает Rng врагов — поток предметов не сдвигается. */
  addLoot(kind: string, x: number, y: number, speed: number, phase: number): Item {
    return this.push(this.data.item(kind), x, y, speed, phase);
  }

  /** Выбор вида по долям среди открытых предметов в порядке файла; тратит один бросок rng. */
  rollKind(): ItemRow {
    let r = this.rng.next() * this.openShare;
    for (const it of this.open) {
      r -= it.share;
      if (r < 0) return it;
    }
    return this.open[this.open.length - 1]!;
  }

  /** Текущая скорость предмета, точек в секунду. */
  velocityOf(item: Item): { vx: number; vy: number } {
    const d = this.data;
    const wobble = 1 + d.num('item_wobble') * Math.sin((2 * Math.PI * this.timeMs) / d.num('item_wobble_period_ms') + item.phase);
    const v = d.num('current_speed') * this.cfg.speedMult * item.speed * wobble;
    return { vx: this.dir.x * v, vy: this.dir.y * v };
  }

  /** Новый предмет за тем краем, откуда идёт течение. Броски: край, место вдоль края, вид, speed, phase. */
  private spawn(): void {
    const { halfW, halfH } = this.cfg;
    const { x: dx, y: dy } = this.dir;
    const edge = MARGIN / 2;
    // Вес края — длина края, умноженная на составляющую течения поперёк него.
    const wSide = Math.abs(dx) * 2 * halfH;
    const wTopBottom = Math.abs(dy) * 2 * halfW;
    let x: number;
    let y: number;
    if (this.rng.next() * (wSide + wTopBottom) < wSide) {
      x = dx < 0 ? halfW + edge : -halfW - edge;
      y = this.rng.range(-halfH, halfH);
    } else {
      x = this.rng.range(-halfW, halfW);
      y = dy > 0 ? -halfH - edge : halfH + edge;
    }
    this.add(x, y);
    this.spawned++;
  }

  /** Засев: поле равномерно (не ближе seed_near_raft_max_px к центру), затем несколько предметов у самого плота. */
  private seed(): void {
    const d = this.data;
    const { halfW, halfH } = this.cfg;
    const nearMin = d.num('seed_near_raft_min_px');
    const nearMax = d.num('seed_near_raft_max_px');
    const field = Math.round(d.num('seed_seconds') * d.flowPerS(this.cfg.level));
    for (let i = 0; i < field; i++) {
      let x: number;
      let y: number;
      do {
        x = this.rng.range(-halfW, halfW);
        y = this.rng.range(-halfH, halfH);
      } while (Math.hypot(x, y) < nearMax);
      this.add(x, y);
    }
    const near = d.num('seed_near_raft');
    for (let i = 0; i < near; i++) {
      const angle = this.rng.range(0, 2 * Math.PI);
      const dist = this.rng.range(nearMin, nearMax);
      this.add(Math.cos(angle) * dist, Math.sin(angle) * dist);
    }
    this.seeded = field + near;
  }

  /** Предмет в точке (x, y); броски: вид, speed, phase. */
  private add(x: number, y: number): void {
    const row = this.rollKind();
    const speed = this.rng.range(this.data.num('item_speed_min'), this.data.num('item_speed_max'));
    const phase = this.rng.range(0, 2 * Math.PI);
    this.push(row, x, y, speed, phase);
  }

  private push(row: ItemRow, x: number, y: number, speed: number, phase: number): Item {
    const it: Item = {
      id: this.nextId++, kind: row.id, role: row.role, xp: row.xp, x, y,
      radius: row.radius, weight: row.weight, speed, phase,
    };
    this.items.push(it);
    return it;
  }
}
