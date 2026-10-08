import { Container, Graphics } from 'pixi.js';
import type { Role } from '../core/data/tables';
import type { World } from '../core/world';
import { DESIGN, type Layout } from './layout';

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

export interface ViewOptions {
  waterColor: string; // цвет воды локации
  cellPx: number;     // сторона клетки плота
}

/**
 * Рабочая отрисовка: вода локации, клетка плота и плывущие предметы.
 * Мир рисуется со сдвигом на центр поля дизайна; только читает состояние ядра.
 */
export class View {
  private readonly sea = new Graphics();
  private readonly world = new Container();
  private readonly raft = new Graphics();
  private readonly items = new Graphics();

  constructor(
    root: Container,
    private readonly opts: ViewOptions,
  ) {
    this.world.addChild(this.raft, this.items);
    root.addChild(this.sea, this.world);
  }

  build(layout: Layout): void {
    const { w, h } = DESIGN[layout];
    this.sea.clear().rect(0, 0, w, h).fill(this.opts.waterColor);
    this.world.position.set(w / 2, h / 2);
    const cell = this.opts.cellPx;
    this.raft.clear().roundRect(-cell / 2 + 2, -cell / 2 + 2, cell - 4, cell - 4, 8).fill(0xc58b4f);
  }

  sync(world: World): void {
    this.items.clear();
    for (const it of world.items) {
      this.items.circle(it.x, it.y, it.radius).fill(ROLE_COLOR[it.role]);
    }
  }
}
