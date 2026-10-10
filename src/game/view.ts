import { Container, Graphics, Text } from 'pixi.js';
import type { Role } from '../core/data/tables';
import type { Game } from '../core/game';
import { isIntact } from '../core/raft';
import type { BuildCursor } from './input/build';
import { DESIGN, XP_BAR, type Layout } from './layout';

/** Цвета предметов по роли — константы отрисовки до этапа арта, не баланс. */
const ROLE_COLOR: Record<Role, number> = {
  light1: 0xe9d8a6,
  light2: 0xf4a261,
  light3: 0xc9ada7,
  medium: 0x8d6e63,
  heavy: 0xffd166,
  loot: 0xe76f51,
  boss_chest: 0xb5838d,
  bottle: 0xa8dadc,
};
const COUNTER_COLOR = { ok: 0x7bd88f, half: 0xffd166, full: 0xff6b6b };
/** Клетка по степени вида raft.stage: целая, три степени темнее, разбитая — серая. */
const RAFT_COLOR = [0xc58b4f, 0xa8743f, 0x8b5e32, 0x6e4a27, 0x8a8a8a] as const;
const GHOST_COLOR = { ok: 0x7bd88f, bad: 0xff6b6b };
/** Постройка — круг цвета карточки постройки, радиус в долях клетки; на разбитой клетке — бледная. */
const BUILDING = { color: 0x2a9d8f, radius: 0.4, stroke: { width: 2, color: 0xffffff }, brokenAlpha: 0.35 } as const;
/** Обводка повреждённых клеток в ремонте. */
const REPAIR_STROKE = { width: 3, color: 0xffd166 } as const;
/** Места для новой клетки в стройке — бледные. */
const CANDIDATE_ALPHA = 0.2;
const ENEMY_COLOR = 0xd62828;
/** Враг под водой (идёт к клетке и уходит) — полупрозрачный, у клетки — нет. */
const ENEMY_UNDERWATER_ALPHA = 0.45;
const SPEAR_COLOR = 0xf1e3c8;
/** Длина наконечника копья, точки дизайна. */
const SPEAR_TIP = 18;
const LABEL_STYLE = { fontFamily: 'system-ui, sans-serif', fontSize: 16, fontWeight: '700', stroke: { color: 0x000000, width: 3 } } as const;

export interface ViewOptions {
  waterColor: string; // цвет воды локации
  cellPx: number;     // сторона клетки плота
  enemyRadius: number; // радиус мелкого врага
}

/**
 * Рабочая отрисовка: вода, плот с постройками (в стройке — места для клетки и призрак, в ремонте — обводка повреждённых клеток), моряк, круг дальности, предметы и добыча, враги с прочностью,
 * сеть и копьё с верёвкой, значки опыта.
 * Мир рисуется со сдвигом на центр поля дизайна и обрезается по полю; только читает состояние ядра.
 */
export class View {
  private readonly sea = new Graphics();
  /** Маска мира: поле дизайна — полосы за краем поля остаются пустыми. */
  private readonly field = new Graphics();
  private readonly world = new Container();
  private readonly raft = new Graphics();
  private readonly ghost = new Graphics();
  private readonly sailor = new Graphics();
  private readonly range = new Graphics();
  private readonly items = new Graphics();
  private readonly net = new Graphics();
  private readonly spear = new Graphics();
  private readonly enemies = new Graphics();
  private readonly enemyHp = new Container();
  private readonly icons = new Graphics();
  private readonly counter = new Text({ text: '', style: LABEL_STYLE });
  private iconTargetY = 0;

  constructor(
    root: Container,
    private readonly opts: ViewOptions,
  ) {
    this.counter.anchor.set(0.5, 1);
    this.world.addChild(this.raft, this.ghost, this.range, this.items, this.enemies, this.enemyHp, this.net, this.spear, this.sailor, this.counter, this.icons);
    this.world.mask = this.field;
    root.addChild(this.sea, this.field, this.world);
  }

  build(layout: Layout): void {
    const { w, h } = DESIGN[layout];
    this.sea.clear().rect(0, 0, w, h).fill(this.opts.waterColor);
    this.field.clear().rect(0, 0, w, h).fill(0xffffff);
    this.world.position.set(w / 2, h / 2);
    this.iconTargetY = -h / 2 + XP_BAR.top + XP_BAR.height / 2;
    this.sailor.clear().circle(0, 0, this.opts.cellPx / 5).fill(0x264653);
  }

  sync(game: Game, cursor: BuildCursor): void {
    const { net, world, progression, sailor, raft } = game;
    const p = net.netParams;
    this.raft.clear();
    for (const c of raft.cells) this.tile(this.raft, c.gx, c.gy).fill(RAFT_COLOR[raft.stage(c)]);
    if (game.repair) for (const c of raft.cells) if (c.hp < raft.cellHp) this.tile(this.raft, c.gx, c.gy).stroke(REPAIR_STROKE);
    const cell = this.opts.cellPx;
    for (const c of raft.cells) {
      if (c.building === null) continue;
      const alpha = isIntact(c) ? 1 : BUILDING.brokenAlpha;
      this.raft
        .circle(c.gx * cell, c.gy * cell, BUILDING.radius * cell)
        .fill({ color: BUILDING.color, alpha })
        .stroke({ ...BUILDING.stroke, alpha });
    }
    this.ghost.clear();
    if (game.build) {
      for (const c of game.buildSpots()) this.tile(this.raft, c.gx, c.gy).fill({ color: 0xffffff, alpha: CANDIDATE_ALPHA });
      if (cursor.shown) {
        const ok = game.canPlace(cursor.gx, cursor.gy);
        this.tile(this.ghost, cursor.gx, cursor.gy).fill({ color: ok ? GHOST_COLOR.ok : GHOST_COLOR.bad, alpha: 0.6 });
      }
    }
    this.sailor.position.set(sailor.x, sailor.y);
    this.range.clear().circle(sailor.x, sailor.y, p.range).stroke({ width: 1.5, color: 0xffffff, alpha: 0.35 });

    this.items.clear();
    for (const it of world.items) this.items.circle(it.x, it.y, it.radius).fill(ROLE_COLOR[it.role]);

    this.syncEnemies(game);

    this.spear.clear();
    const sp = game.spear;
    if (sp.state !== 'ready') {
      const dx = sp.x - sailor.x;
      const dy = sp.y - sailor.y;
      const len = Math.hypot(dx, dy) || 1;
      this.spear
        .moveTo(sailor.x, sailor.y).lineTo(sp.x, sp.y).stroke({ width: 1, color: SPEAR_COLOR, alpha: 0.6 })
        .moveTo(sp.x - (dx / len) * SPEAR_TIP, sp.y - (dy / len) * SPEAR_TIP).lineTo(sp.x, sp.y).stroke({ width: 4, color: 0xffffff });
    }

    this.net.clear();
    this.counter.visible = net.state !== 'ready';
    if (net.state !== 'ready') {
      const r = p.radius;
      this.net
        .moveTo(sailor.x, sailor.y).lineTo(net.x, net.y).stroke({ width: 2, color: 0xf1e3c8, alpha: 0.8 })
        .circle(net.x, net.y, r).stroke({ width: 2, color: 0xffffff })
        .moveTo(net.x - r, net.y).lineTo(net.x + r, net.y)
        .moveTo(net.x, net.y - r).lineTo(net.x, net.y + r)
        .stroke({ width: 1, color: 0xffffff, alpha: 0.7 });
      const n = net.caught.length;
      this.counter.text = `${n}/${p.capacity}`;
      this.counter.style.fill = n >= p.capacity ? COUNTER_COLOR.full : n * 2 >= p.capacity ? COUNTER_COLOR.half : COUNTER_COLOR.ok;
      this.counter.position.set(net.x, net.y - r - 4);
    }

    this.icons.clear();
    const now = world.timeMs;
    for (const icon of progression.icons) {
      if (now < icon.launchMs) continue;
      const t = Math.min(1, (now - icon.launchMs) / (icon.arriveMs - icon.launchMs));
      this.icons.circle(icon.fromX * (1 - t), icon.fromY + (this.iconTargetY - icon.fromY) * t, 6).fill(0x9be564).stroke({ width: 1, color: 0x1d3b1d });
    }
  }

  /** Враги — красные круги, под водой полупрозрачные; число прочности над каждым. */
  private syncEnemies(game: Game): void {
    const list = game.enemies.list;
    const r = this.opts.enemyRadius;
    this.enemies.clear();
    while (this.enemyHp.children.length < list.length) {
      const t = new Text({ text: '', style: { ...LABEL_STYLE, fill: 0xffffff } });
      t.anchor.set(0.5, 1);
      this.enemyHp.addChild(t);
    }
    this.enemyHp.children.forEach((c, i) => (c.visible = i < list.length));
    list.forEach((e, i) => {
      const alpha = e.phase === 'wait' ? 1 : ENEMY_UNDERWATER_ALPHA;
      this.enemies.circle(e.x, e.y, r).fill({ color: ENEMY_COLOR, alpha });
      const t = this.enemyHp.children[i] as Text;
      const hp = String(e.hp);
      if (t.text !== hp) t.text = hp;
      t.alpha = alpha;
      t.position.set(e.x, e.y - r - 2);
    });
  }

  /** Клетка сетки (gx, gy) со скруглением, в координатах мира. */
  private tile(g: Graphics, gx: number, gy: number): Graphics {
    const cell = this.opts.cellPx;
    return g.roundRect(gx * cell - cell / 2 + 2, gy * cell - cell / 2 + 2, cell - 4, cell - 4, 8);
  }
}
