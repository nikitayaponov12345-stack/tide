import { TIME_EPS } from '../core/clock';
import type { Tables } from '../core/data/tables';
import type { Enemy } from '../core/enemies';
import type { Game } from '../core/game';
import type { Rng } from '../core/rng';
import type { Item } from '../core/world';

/** Промежуток [a, b): значение — rng.range(a, b). */
export type Span = readonly [number, number];

/**
 * Модель игрока, а не баланс игры: параметры живут здесь, а не в таблицах.
 * Времена в игре — мс игрового времени, окно и стройка — мс по часам.
 */
export interface BotParams {
  reactionMs: Span;     // от «сеть у моряка» до броска
  aimSigma: number;     // промах сети, σ по каждой оси, точки
  pullDelayMs: Span;    // от падения сети до удержания; бросается при каждом броске
  windowMs: Span;       // окно выбора, по часам
  buildMs: Span;        // стройка клетки, по часам
  crabNoticeMs: Span;   // заметить краба в круге дальности
  spearSigma: number;   // промах копья, σ по оси
  retryMs: number;      // цели нет — следующая попытка через столько
}

/** Бот «человек»: GDD «Темп и баланс», TESTPLAN §5. */
export const HUMAN: BotParams = {
  reactionMs: [250, 700],
  aimSigma: 14,
  pullDelayMs: [150, 900],
  windowMs: [2500, 3000],
  buildMs: [1200, 2500],
  crabNoticeMs: [500, 1000],
  spearSigma: 12,
  retryMs: 80,
};

/** Порядок карточек в окне: «Плот» и постройки первыми, как у живого игрока на записях. */
export const CARD_ORDER: readonly string[] = ['raft', 'throw_farther', 'net_bigger', 'net_wider', 'pull_stronger', 'spear_stronger'];

/** Цель сети: запас к дальности, отступ от края поля, радиус «кучки», вес расстояния в счёте, шум счёта, доля упреждения. */
const TARGET_RANGE_SLACK = 10;
const TARGET_EDGE = 8;
const CLUSTER_PX = 45;
const DIST_PENALTY = 250;
const SCORE_NOISE = 1.5;
const LEAD = 0.6;
/** Счёт клетки стройки: чуть к притоку (течение Лагуны приходит справа сверху). */
const BUILD_BIAS_DOWN = 0.3;
const BUILD_BIAS_LEFT = 0.2;

export interface PauseResult { ms: number; card: string | null }

/** Бот «человек» на ядре Game: подаёт те же команды, что палец (CLAUDE.md, правило 9). В M0 моряком не ходит. */
export class HumanBot {
  private holding = false;
  private throwAt: number | null = null;
  private pullAt: number | null = null;
  private pullDelay = 0;
  private crabAt: number | null = null;
  private readonly flightMean: number;

  constructor(
    private readonly game: Game,
    data: Tables,
    private readonly rng: Rng,
    private readonly params: BotParams = HUMAN,
  ) {
    this.flightMean = (data.num('net_flight_speed') * (1 + data.num('net_flight_end_mult'))) / 2;
  }

  /** Перед каждым шагом игры, когда нет паузы. */
  update(): void {
    const g = this.game;
    const p = this.params;
    const now = g.stats.gameMs;

    const crab = this.crab();
    if (crab === null) {
      this.crabAt = null;
    } else if (this.crabAt === null) {
      this.crabAt = now + this.span(p.crabNoticeMs);
    } else if (now + TIME_EPS >= this.crabAt) {
      if (g.weapon !== 'spear') {
        this.release();
        g.setWeapon('spear');
      }
      if (g.spear.state === 'ready') {
        const x = crab.x + this.gauss() * p.spearSigma;
        const y = crab.y + this.gauss() * p.spearSigma;
        g.throwTo(x, y);
      }
      return;
    }

    if (g.weapon !== 'net') g.setWeapon('net');
    const net = g.net.state;
    if (net === 'ready') {
      this.release();
      this.pullAt = null;
      if (this.throwAt === null) this.throwAt = now + this.span(p.reactionMs);
      if (now + TIME_EPS >= this.throwAt) {
        const t = this.target();
        if (t !== null && g.throwTo(t.x, t.y)) {
          this.throwAt = null;
          this.pullDelay = this.span(p.pullDelayMs);
        } else {
          this.throwAt = now + p.retryMs;
        }
      }
    } else if (net === 'lying' && !this.holding) {
      if (this.pullAt === null) this.pullAt = now + this.pullDelay;
      if (now + TIME_EPS >= this.pullAt) {
        g.setPull(true);
        this.holding = true;
      }
    }
  }

  /** Окно или стройка: решение и сколько оно заняло по часам. */
  pause(): PauseResult {
    const g = this.game;
    this.release();
    this.throwAt = null;
    this.pullAt = null;
    if (g.window) {
      const ms = this.span(this.params.windowMs);
      const cards = g.window.cards;
      let i = -1;
      for (const id of CARD_ORDER) {
        i = cards.findIndex((c) => c.available && c.id === id);
        if (i >= 0) break;
      }
      if (i < 0) i = cards.findIndex((c) => c.available);
      const card = cards[i]?.id;
      if (card === undefined || !g.takeCard(i)) throw new Error(`HumanBot: окно ${g.window.level} — карточка не взята`);
      return { ms, card };
    }
    if (g.build) {
      const ms = this.span(this.params.buildMs);
      let best: { gx: number; gy: number } | null = null;
      let bestScore = Infinity;
      for (const c of g.buildSpots()) {
        const s = c.gx * c.gx + c.gy * c.gy + (c.gy > 0 ? BUILD_BIAS_DOWN : 0) + (c.gx < 0 ? BUILD_BIAS_LEFT : 0);
        if (s < bestScore) {
          bestScore = s;
          best = c;
        }
      }
      if (best === null || !g.placeCell(best.gx, best.gy)) throw new Error('HumanBot: стройка — место не нашлось');
      return { ms, card: null };
    }
    throw new Error('HumanBot.pause: паузы нет');
  }

  /** Ближайший к моряку враг в круге дальности копья; копья нет — null. */
  private crab(): Enemy | null {
    const g = this.game;
    if (!g.spearOwned) return null;
    const { x: sx, y: sy } = g.sailor;
    let best: Enemy | null = null;
    let bestD = Infinity;
    for (const e of g.enemies.list) {
      const d = Math.hypot(e.x - sx, e.y - sy);
      if (d <= g.spear.range && d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  /** Точка броска сети: лучшая «кучка» в круге дальности с упреждением и промахом; кандидатов нет — null. */
  private target(): { x: number; y: number } | null {
    const g = this.game;
    const { halfW, halfH } = g.world.config;
    const { x: sx, y: sy } = g.sailor;
    const reach = g.net.netParams.range + TARGET_RANGE_SLACK;
    const items = g.world.items;
    let best: Item | null = null;
    let bestDist = 0;
    let bestScore = -Infinity;
    for (const it of items) {
      const dist = Math.hypot(it.x - sx, it.y - sy);
      if (dist > reach || Math.abs(it.x) > halfW - TARGET_EDGE || Math.abs(it.y) > halfH - TARGET_EDGE) continue;
      let value = 0;
      for (const o of items) if (Math.hypot(o.x - it.x, o.y - it.y) < CLUSTER_PX) value += o.xp;
      const score = value - dist / DIST_PENALTY + this.rng.range(0, SCORE_NOISE);
      if (score > bestScore) {
        bestScore = score;
        best = it;
        bestDist = dist;
      }
    }
    if (best === null) return null;
    const t = (LEAD * bestDist) / this.flightMean;
    const { vx, vy } = g.world.velocityOf(best);
    const x = best.x + vx * t + this.gauss() * this.params.aimSigma;
    const y = best.y + vy * t + this.gauss() * this.params.aimSigma;
    return { x: Math.min(halfW, Math.max(-halfW, x)), y: Math.min(halfH, Math.max(-halfH, y)) };
  }

  /** Отпустить удержание, если бот держит. */
  private release(): void {
    if (!this.holding) return;
    this.game.setPull(false);
    this.holding = false;
  }

  private span(s: Span): number {
    return this.rng.range(s[0], s[1]);
  }

  /** Нормальное отклонение, Бокс — Мюллер: два броска. */
  private gauss(): number {
    const u = 1 - this.rng.next();
    const v = this.rng.next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
}
