import { Application, Container } from 'pixi.js';
import { fitDesign, layoutFor, type Layout } from './layout';

/** Холст PixiJS на всё окно и корневой контейнер в координатах дизайна. */
export class Stage {
  readonly app = new Application();
  readonly root = new Container();
  layout: Layout = 'landscape';
  scale = 1;
  onLayout: ((layout: Layout) => void) | null = null;

  async init(host: HTMLElement): Promise<void> {
    await this.app.init({
      resizeTo: window,
      background: '#0b2a3a',
      antialias: true,
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      preference: 'webgl',
    });
    host.appendChild(this.app.canvas);
    this.app.stage.addChild(this.root);
    this.layout = layoutFor(window.innerWidth, window.innerHeight);
    this.fit();
    window.addEventListener('resize', () => this.fit());
  }

  fit(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const layout = layoutFor(w, h);
    const f = fitDesign(w, h, layout);
    this.scale = f.scale;
    this.root.scale.set(f.scale);
    this.root.position.set(f.x, f.y);
    if (layout !== this.layout) {
      this.layout = layout;
      this.onLayout?.(layout);
    }
  }
}
