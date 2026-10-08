import { Container, Graphics, Text } from 'pixi.js';
import type { Role } from '../core/data/tables';
import type { Game } from '../core/game';
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

export interface ViewOptions {
  waterColor: string; // цвет воды локации
  cellPx: number;     // сторона клетки плота
}

/**
 * Рабочая отрисовка: вода, плот, моряк, круг дальности, предметы, сеть с верёвкой и значки опыта.
 * Мир рисуется со сдвигом на центр поля дизайна; только читает состояние ядра.
 */
export class View {
  private readonly sea = new Graphics();
  private readonly world = new Container();
  private readonly raft = new Graphics();
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
    this.world.addChild(this.range, this.raft, this.items, this.net, this.counter, this.icons);
    root.addChild(this.sea, this.world);
  }

  build(layout: Layout): void {
    const { w, h } = DESIGN[layout];
    this.sea.clear().rect(0, 0, w, h).fill(this.opts.waterColor);
    this.world.position.set(w / 2, h / 2);
    this.iconTargetY = -h / 2 + XP_BAR.top + XP_BAR.height / 2;
    const cell = this.opts.cellPx;
    this.raft
      .clear()
      .roundRect(-cell / 2 + 2, -cell / 2 + 2, cell - 4, cell - 4, 8)
      .fill(0xc58b4f)
      .circle(0, 0, cell / 5)
      .fill(0x264653);
  }

  sync(game: Game): void {
    const { net, world, progression } = game;
    const p = net.netParams;

    this.range.clear();
    if (net.state === 'ready') this.range.circle(0, 0, p.range).stroke({ width: 1.5, color: 0xffffff, alpha: 0.35 });

    this.items.clear();
    for (const it of world.items) this.items.circle(it.x, it.y, it.radius).fill(ROLE_COLOR[it.role]);

    this.net.clear();
    this.counter.visible = net.state !== 'ready';
    if (net.state !== 'ready') {
      const r = p.radius;
      this.net
        .moveTo(0, 0).lineTo(net.x, net.y).stroke({ width: 2, color: 0xf1e3c8, alpha: 0.8 })
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
}
