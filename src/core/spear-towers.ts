import { TIME_EPS } from './clock';
import type { Tables } from './data/tables';
import { isIntact, type Raft } from './raft';
import type { SpearTargets } from './spear';
import type { Stats } from './stats';
import { cellNum, tierRow } from './towers';

export const SPEAR_TOWER = 'spear_tower';

export type SpearTowerState = 'ready' | 'flying';
/** Копейная башня на клетке (gx, gy) и её копьё: у башни (ready, отдыхает restMs) или летит к (toX, toY). */
export interface SpearTower { gx: number; gy: number; state: SpearTowerState; x: number; y: number; toX: number; toY: number; restMs: number }
export interface SpearTowersSnapshot { list: SpearTower[]; damage: number }

/** Что башня видит у врагов и босса, когда выбирает цель. Enemies и BossVisits подходят как есть. */
export interface TargetEnemies { list: readonly { x: number; y: number }[] }
export interface TargetBoss { visiting: boolean; nearestPoint(x: number, y: number): { x: number; y: number } }

/**
 * Ближайшая к (x, y) цель не дальше r: центр врага или ближайшая точка корпуса шхуны на визите; нет — null.
 * При равном расстоянии остаётся найденная раньше: враги по списку, потом шхуна.
 */
export function nearestTarget(enemies: TargetEnemies, boss: TargetBoss, x: number, y: number, r: number): { x: number; y: number } | null {
  const points: { x: number; y: number }[] = enemies.list.map((e) => ({ x: e.x, y: e.y }));
  if (boss.visiting) points.push(boss.nearestPoint(x, y));
  let best: { x: number; y: number } | null = null;
  let bestD = Infinity;
  for (const p of points) {
    const d = Math.hypot(p.x - x, p.y - y);
    if (d <= r && d < bestD) {
      best = { x: p.x, y: p.y };
      bestD = d;
    }
  }
  return best;
}

/**
 * Копейные башни плота (GDD, «Плот и постройки»): копьё у башни, отдохнув pauseMs, летит в ближайшего врага
 * или в шхуну в радиусе radius от клетки башни и бьёт, как копьё моряка, всех у точки падения. После удара
 * копьё сразу снова у башни и отдыхает. Башня на разбитой клетке новых бросков не делает. Случайности нет.
 */
export class SpearTowers {
  readonly list: SpearTower[] = [];
  /** Урон удара; меняет «Копейная башня сильнее». */
  damage: number;
  readonly radius: number;
  readonly pauseMs: number;
  private readonly speed: number;
  private readonly hitRadius: number;

  constructor(
    data: Tables,
    locationId: string,
    private readonly stats: Stats,
  ) {
    const row = tierRow(data, SPEAR_TOWER, locationId);
    this.radius = cellNum(row, 'radius');
    this.pauseMs = cellNum(row, 'pause_s') * 1000;
    this.damage = cellNum(row, 'damage');
    this.speed = data.num('tower_spear_speed');
    this.hitRadius = data.num('spear_hit_radius');
  }

  at(gx: number, gy: number): SpearTower | undefined {
    return this.list.find((t) => t.gx === gx && t.gy === gy);
  }

  /** Башня каждой клетке с копейной башней, где её ещё нет: копьё у башни, без отдыха; в порядке raft.cells. */
  sync(raft: Raft): void {
    for (const c of raft.cells) {
      if (c.building !== SPEAR_TOWER || this.at(c.gx, c.gy)) continue;
      const { x, y } = raft.cellCenter(c);
      this.list.push({ gx: c.gx, gy: c.gy, state: 'ready', x, y, toX: x, toY: y, restMs: 0 });
    }
  }

  /** Шаг башен: копьё в полёте летит и бьёт, долетев; копьё у башни отдыхает, затем бросок в ближайшую цель. */
  step(dtMs: number, enemies: TargetEnemies, boss: TargetBoss, targets: SpearTargets, raft: Raft): void {
    const move = (this.speed * dtMs) / 1000;
    for (const t of this.list) {
      if (t.state === 'flying') {
        const dx = t.toX - t.x;
        const dy = t.toY - t.y;
        const left = Math.hypot(dx, dy);
        if (move + 1e-9 < left) {
          t.x += (dx / left) * move;
          t.y += (dy / left) * move;
          continue;
        }
        if (targets.hit(t.toX, t.toY, this.hitRadius, this.damage).length > 0) this.stats.towerSpearHits++;
        const home = raft.cellCenter(t);
        Object.assign(t, { state: 'ready', x: home.x, y: home.y, toX: home.x, toY: home.y, restMs: this.pauseMs });
        continue;
      }
      t.restMs = Math.max(0, t.restMs - dtMs);
      const cell = raft.cell(t.gx, t.gy);
      if (!cell || !isIntact(cell) || t.restMs > TIME_EPS) continue;
      const home = raft.cellCenter(t);
      const p = nearestTarget(enemies, boss, home.x, home.y, this.radius);
      if (!p) continue;
      Object.assign(t, { state: 'flying', x: home.x, y: home.y, toX: p.x, toY: p.y });
      this.stats.towerSpearThrows++;
    }
  }

  snapshot(): SpearTowersSnapshot {
    return { list: this.list.map((t) => ({ ...t })), damage: this.damage };
  }

  restore(s: SpearTowersSnapshot): void {
    this.list.length = 0;
    for (const t of s.list) this.list.push({ ...t });
    this.damage = s.damage;
  }
}
