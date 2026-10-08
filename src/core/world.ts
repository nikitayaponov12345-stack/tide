import { TIME_EPS } from './clock';
import { Rng } from './rng';

/**
 * Заглушка мира для этапа 0: предметы плывут по течению через поле и уходят за край.
 * Правила настоящей игры появятся в M0; здесь только то, на чём проверяется каркас:
 * шаг в игровых миллисекундах, появление через накопитель (не «один предмет за кадр»), сид.
 */
export interface Item {
  id: number;
  x: number;
  y: number;
  /** Множитель скорости предмета относительно течения. */
  speed: number;
}

export interface WorldConfig {
  width: number;
  height: number;
  /** Направление течения; длина не важна. */
  current: { x: number; y: number };
  /** Скорость течения, точек в секунду. */
  currentSpeed: number;
  /** Один предмет каждые spawnIntervalMs миллисекунд игрового времени. */
  spawnIntervalMs: number;
}

export const DEFAULT_WORLD: WorldConfig = {
  width: 1280,
  height: 720,
  current: { x: -1, y: 1 },
  currentSpeed: 55,
  spawnIntervalMs: 1000,
};

/** Предмет считается ушедшим, когда отплыл за край дальше этого запаса. */
const MARGIN = 60;

export class World {
  readonly items: Item[] = [];
  timeMs = 0;
  spawned = 0;
  private spawnAcc = 0;
  private nextId = 1;
  private cfg: WorldConfig;

  constructor(
    config: WorldConfig,
    private readonly rng: Rng,
  ) {
    this.cfg = { ...config, current: { ...config.current } };
  }

  get config(): Readonly<WorldConfig> {
    return this.cfg;
  }

  /** Сменить размер поля (поворот экрана). Предметы остаются, ушедшие за край уберутся сами. */
  resize(width: number, height: number): void {
    this.cfg.width = width;
    this.cfg.height = height;
  }

  /** Один шаг игрового времени: сначала движутся и уходят старые предметы, потом появляются новые. */
  step(dtMs: number): void {
    this.timeMs += dtMs;
    const { vx, vy } = this.velocity();
    const dt = dtMs / 1000;
    for (const it of this.items) {
      it.x += vx * it.speed * dt;
      it.y += vy * it.speed * dt;
    }
    const { width: w, height: h } = this.cfg;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i]!;
      if (it.x < -MARGIN || it.x > w + MARGIN || it.y < -MARGIN || it.y > h + MARGIN) this.items.splice(i, 1);
    }
    // Накопитель: за долгий шаг появляется столько предметов, сколько положено по времени, а не один.
    this.spawnAcc += dtMs;
    while (this.spawnAcc + TIME_EPS >= this.cfg.spawnIntervalMs) {
      this.spawnAcc -= this.cfg.spawnIntervalMs;
      this.spawn();
    }
  }

  private velocity(): { vx: number; vy: number } {
    const { x, y } = this.cfg.current;
    const len = Math.hypot(x, y) || 1;
    return { vx: (x / len) * this.cfg.currentSpeed, vy: (y / len) * this.cfg.currentSpeed };
  }

  /** Новый предмет появляется за тем краем, откуда идёт течение. */
  private spawn(): void {
    const { width: w, height: h } = this.cfg;
    const { vx, vy } = this.velocity();
    const edge = MARGIN / 2;
    // Вес края — длина края, умноженная на составляющую течения поперёк него.
    const wSide = Math.abs(vx) * h;
    const wTopBottom = Math.abs(vy) * w;
    let x: number;
    let y: number;
    if (this.rng.next() * (wSide + wTopBottom) < wSide) {
      x = vx < 0 ? w + edge : -edge;
      y = this.rng.range(0, h);
    } else {
      x = this.rng.range(0, w);
      y = vy > 0 ? -edge : h + edge;
    }
    this.items.push({ id: this.nextId++, x, y, speed: this.rng.range(0.7, 1.3) });
    this.spawned++;
  }
}
