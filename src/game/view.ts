import { Container, Graphics } from 'pixi.js';
import type { World } from '../core/world';
import { DESIGN, type Layout } from './layout';

/**
 * Отрисовка заглушки этапа 0: вода, база из клеток в центре и плывущие предметы.
 * Только рисует состояние ядра; ничего не решает и не меняет.
 */
export class View {
  private readonly sea = new Graphics();
  private readonly base = new Graphics();
  private readonly items = new Graphics();

  constructor(root: Container) {
    root.addChild(this.sea, this.base, this.items);
  }

  build(layout: Layout): void {
    const { w, h } = DESIGN[layout];
    this.sea.clear().rect(0, 0, w, h).fill(0x1b6f8f);
    const cell = 64;
    this.base.clear();
    for (let cx = -1; cx <= 1; cx++) {
      for (let cy = -1; cy <= 1; cy++) {
        if (Math.abs(cx) + Math.abs(cy) > 1) continue; // крест из пяти клеток
        const x = w / 2 + cx * cell - cell / 2 + 2;
        const y = h / 2 + cy * cell - cell / 2 + 2;
        this.base.roundRect(x, y, cell - 4, cell - 4, 8).fill(0xc58b4f);
      }
    }
  }

  sync(world: World): void {
    this.items.clear();
    for (const it of world.items) {
      this.items.circle(it.x, it.y, 12).fill(0xe9d8a6);
    }
  }
}
