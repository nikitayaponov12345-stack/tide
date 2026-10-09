import { Container, Graphics, Text } from 'pixi.js';
import type { Role } from '../core/data/tables';
import type { Game } from '../core/game';
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
const RAFT_COLOR = 0xc58b4f;
const GHOST_COLOR = { ok: 0x7bd88f, bad: 0xff6b6b };
/** Места для новой клетки в стройке — бледные. */
const CANDIDATE_ALPHA = 0.2;

export interface ViewOptions {
  waterColor: string; // цвет воды локации
  cellPx: number;     // сторона клетки плота
}

/**
 * Рабочая отрисовка: вода, плот (в стройке — места для клетки и призрак), моряк, круг дальности, предметы, сеть с верёвкой и значки опыта.
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
  private readonly icons = new Graphics();
  private readonly counter = new Text({ text: '', style: { fontFamily: 'system-ui, sans-serif', fontSize: 16, fontWeight: '700', stroke: { color: 0x000000, width: 3 } } });
  private iconTargetY = 0;

  constructor(
    root: Container,
    private readonly opts: ViewOptions,
  ) {
    this.counter.anchor.set(0.5, 1);
    this.world.addChild(this.raft, this.ghost, this.range, this.items, this.net, this.sailor, this.counter, this.icons);
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
    for (const c of raft.cells) this.tile(this.raft, c.gx, c.gy).fill(RAFT_COLOR);
    this.ghost.clear();
    if (game.build) {
      for (const c of raft.candidates()) this.tile(this.raft, c.gx, c.gy).fill({ color: 0xffffff, alpha: CANDIDATE_ALPHA });
      if (cursor.shown) {
        const ok = raft.canAdd(cursor.gx, cursor.gy);
        this.tile(this.ghost, cursor.gx, cursor.gy).fill({ color: ok ? GHOST_COLOR.ok : GHOST_COLOR.bad, alpha: 0.6 });
      }
    }
    this.sailor.position.set(sailor.x, sailor.y);
    this.range.clear().circle(sailor.x, sailor.y, p.range).stroke({ width: 1.5, color: 0xffffff, alpha: 0.35 });

    this.items.clear();
    for (const it of world.items) this.items.circle(it.x, it.y, it.radius).fill(ROLE_COLOR[it.role]);

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

  /** Клетка сетки (gx, gy) со скруглением, в координатах мира. */
  private tile(g: Graphics, gx: number, gy: number): Graphics {
    const cell = this.opts.cellPx;
    return g.roundRect(gx * cell - cell / 2 + 2, gy * cell - cell / 2 + 2, cell - 4, cell - 4, 8);
  }
}
