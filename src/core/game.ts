import type { Tables } from './data/tables';
import { Net, type ThrowOptions } from './net';
import { Progression } from './progression';
import { Raft } from './raft';
import { Rng } from './rng';
import { Stats } from './stats';
import { World } from './world';

export interface GameConfig { halfW: number; halfH: number; speedMult: number; locationId: string; seed: number }

/** Ядро целиком: мир, плот, сеть моряка, прогрессия, счётчики и команды ввода. */
export class Game {
  readonly world: World;
  readonly raft: Raft;
  readonly net: Net;
  readonly progression: Progression;
  readonly stats = new Stats();

  constructor(data: Tables, cfg: GameConfig) {
    const loc = data.location(cfg.locationId);
    this.world = new World(
      { halfW: cfg.halfW, halfH: cfg.halfH, speedMult: cfg.speedMult, locationId: cfg.locationId, level: 1 },
      data,
      new Rng(cfg.seed),
    );
    this.raft = new Raft(data);
    const tier = data.sailorTier(loc.order);
    this.net = new Net(data, { radius: tier.netRadius, capacity: tier.netCapacity, range: tier.throwRange, pull: tier.pull });
    this.progression = new Progression(data, loc.xpMult);
  }

  step(dtMs: number): void {
    this.stats.gameMs += dtMs;
    this.world.step(dtMs);
    const caught = this.net.step(dtMs, this.world, this.raft);
    if (caught) {
      this.progression.addCatch(caught, this.world.timeMs);
      this.stats.itemsCaught += caught.length;
      if (caught.length === 0) this.stats.emptyThrows++;
    }
    this.stats.xpGained += this.progression.step(this.world.timeMs);
    if (this.world.level !== this.progression.level) this.world.setLevel(this.progression.level);
  }

  throwTo(x: number, y: number, opts: ThrowOptions): boolean {
    const ok = this.net.throwTo(x, y, opts);
    if (ok) this.stats.throws++;
    return ok;
  }

  setPull(on: boolean, mult?: number): void {
    this.net.setPull(on, mult);
  }

  setFollow(p: { x: number; y: number } | null): void {
    this.net.setFollow(p);
  }

  noteTap(): void {
    this.stats.taps++;
  }

  /** Отладка: уровень прогрессии и потока. */
  setLevel(level: number): void {
    this.progression.setLevel(level);
    this.world.setLevel(level);
  }
}
