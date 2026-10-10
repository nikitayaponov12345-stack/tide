import { BOTTLE_ROLE } from '../core/boost';
import { TIME_EPS } from '../core/clock';
import type { Tables } from '../core/data/tables';
import type { Game } from '../core/game';
import { isIntact } from '../core/raft';
import type { Rng } from '../core/rng';
import { nearestTarget } from '../core/spear-towers';
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
  bottleValue: number;  // бутылка в «кучке» стоит столько опыта: живой игрок ловит её сразу
  boostTakeShare: number; // доля предложений буста за рекламу, которые бот берёт
  offerNoticeMs: Span;  // заметить кнопку буста и нажать
  adMs: Span;           // реклама за награду, по часам
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
  bottleValue: 30,
  // Живой игрок взял буст в 3 предложениях из 7 (GDD, «Монетизация»); кнопку замечает, как краба;
  // реклама за награду на записи ПК стояла 12,5–13,5 с.
  boostTakeShare: 3 / 7,
  offerNoticeMs: [500, 1000],
  adMs: [12500, 13500],
};

/** Порядок карточек в окне: «Плот» и постройки первыми, как у живого игрока на записях. */
export const CARD_ORDER: readonly string[] = ['raft', 'net_tower', 'spear_tower', 'whirlpool', 'net_tower_faster', 'spear_tower_stronger', 'whirlpool_wider', 'throw_farther', 'net_bigger', 'net_wider', 'pull_stronger', 'spear_stronger'];

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
/** Шаги к шхуне, если копьё её не достаёт: при равенстве — вниз, вправо, влево, вверх. */
const WALK_DIRS: ReadonlyArray<readonly [number, number]> = [[0, 1], [1, 0], [-1, 0], [0, -1]];

export interface PauseResult { ms: number; card: string | null }

/** Бот «человек» на ядре Game: подаёт те же команды, что палец (CLAUDE.md, правило 9). Ходит только к шхуне на визите. */
export class HumanBot {
  private holding = false;
  private throwAt: number | null = null;
  private pullAt: number | null = null;
  private pullDelay = 0;
  private crabAt: number | null = null;
  private walkAt: number | null = null;
  /** Последнее замеченное предложение буста (boostOffer.shown) и когда его нажать; null — не нажимать. */
  private offerSeen = 0;
  private offerAt: number | null = null;
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

    const offer = g.boostOffer;
    if (!offer.visible) {
      this.offerAt = null;
    } else if (offer.shown !== this.offerSeen) {
      this.offerSeen = offer.shown;
      if (this.rng.next() < p.boostTakeShare) this.offerAt = now + this.span(p.offerNoticeMs);
    }
    if (this.offerAt !== null && now + TIME_EPS >= this.offerAt) {
      this.offerAt = null;
      if (g.takeBoostOffer()) return;
    }

    const crab = this.spearTarget();
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

    // Копьё шхуну не достаёт — через время реакции шаг к ней.
    if (crab === null && g.spearOwned && g.boss.visiting) {
      if (this.walkAt === null) this.walkAt = now + this.span(p.reactionMs);
      if (now + TIME_EPS >= this.walkAt && this.stepToBoss()) this.walkAt = null;
    } else {
      this.walkAt = null;
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

  /** Окно, стройка или реклама за награду: решение и сколько оно заняло по часам. */
  pause(): PauseResult {
    const g = this.game;
    this.release();
    if (g.ad) {
      const ms = this.span(this.params.adMs);
      g.adDone(true);
      return { ms, card: null };
    }
    this.throwAt = null;
    this.pullAt = null;
    this.walkAt = null;
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

  /** Цель копья — ближайшая к моряку в круге дальности: враг или, на визите, ближайшая точка корпуса шхуны. Копья нет — null. */
  private spearTarget(): { x: number; y: number } | null {
    const g = this.game;
    if (!g.spearOwned) return null;
    return nearestTarget(g.enemies, g.boss, g.sailor.x, g.sailor.y, g.spear.range);
  }

  /** Шаг на соседнюю целую клетку, с которой до корпуса шхуны ближе всего и ближе, чем с нынешней. Такой нет — false. */
  private stepToBoss(): boolean {
    const g = this.game;
    const toHull = (gx: number, gy: number): number => {
      const c = g.raft.cellCenter({ gx, gy });
      const p = g.boss.nearestPoint(c.x, c.y);
      return Math.hypot(p.x - c.x, p.y - c.y);
    };
    const { gx, gy } = g.sailor;
    let best: readonly [number, number] | null = null;
    let bestD = toHull(gx, gy);
    for (const d of WALK_DIRS) {
      const c = g.raft.cell(gx + d[0], gy + d[1]);
      if (!c || !isIntact(c)) continue;
      const dist = toHull(c.gx, c.gy);
      if (dist < bestD) {
        bestD = dist;
        best = d;
      }
    }
    return best !== null && g.walk(best[0], best[1]);
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
      for (const o of items) {
        if (Math.hypot(o.x - it.x, o.y - it.y) < CLUSTER_PX) value += o.role === BOTTLE_ROLE ? this.params.bottleValue : o.xp;
      }
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
