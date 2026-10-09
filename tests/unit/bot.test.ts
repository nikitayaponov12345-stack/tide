import { describe, expect, it, vi } from 'vitest';
import { STEP_MS } from '../../src/core/clock';
import { Game } from '../../src/core/game';
import { Rng } from '../../src/core/rng';
import { DATA } from '../../src/data';
import { CARD_ORDER, HUMAN, HumanBot, type BotParams } from '../../src/sim/bot';
import { GATE_L2_MS, gate, median, quantile } from '../../src/sim/report';
import { runSim } from '../../src/sim/run';

const CFG = { halfW: 640, halfH: 360, speedMult: 1, locationId: 'lagoon', seed: 1 };
const LIGHT = DATA.flowItems(CFG.locationId).find((it) => it.role === 'light1')!;
const RANGE = DATA.sailorTier(DATA.location(CFG.locationId).order).throwRange;
const MAX_STEPS = 20_000;

/** Игра с пустой водой и бот с Rng(seed + 3), как в runSim. */
function calm(params: BotParams = HUMAN): { g: Game; bot: HumanBot } {
  const g = new Game(DATA, CFG);
  g.world.items.length = 0;
  return { g, bot: new HumanBot(g, DATA, new Rng(CFG.seed + 3), params) };
}

/** Неподвижный предмет потока в точке (x, y). */
function still(g: Game, x: number, y: number): void {
  g.world.addLoot(LIGHT.id, x, y, 0, 0);
}

/** Бот и шаг игры, пока cond; before — перед ботом. Больше MAX_STEPS шагов — ошибка. */
function play(g: Game, bot: HumanBot, cond: () => boolean, before?: () => void): void {
  for (let i = 0; cond(); i++) {
    if (i >= MAX_STEPS) throw new Error('play: предел шагов');
    before?.();
    bot.update();
    g.step(STEP_MS);
  }
}

/** Игровое время update, в котором счётчик впервые вырос. */
function firstAt(g: Game, bot: HumanBot, count: () => number): number {
  for (let i = 0; ; i++) {
    if (i >= MAX_STEPS) throw new Error('firstAt: предел шагов');
    const now = g.stats.gameMs;
    const before = count();
    bot.update();
    if (count() > before) return now;
    g.step(STEP_MS);
  }
}

describe('HumanBot: сеть', () => {
  it('первый бросок — через reactionMs после старта (± шаг), 10 сидов', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const g = new Game(DATA, { ...CFG, seed });
      const bot = new HumanBot(g, DATA, new Rng(seed + 3));
      // Первый бросок Rng бота — реакция: копья нет, других бросков до неё нет.
      const reaction = new Rng(seed + 3).range(...HUMAN.reactionMs);
      const at = firstAt(g, bot, () => g.stats.throws);
      expect(Math.abs(at - reaction)).toBeLessThanOrEqual(STEP_MS);
    }
  });

  it('цель — плотная тройка, а не одиночный предмет на том же расстоянии; дальний не в счёт', () => {
    const { g, bot } = calm();
    const r = 150;
    still(g, 0, r);
    for (const a of [-0.1, 0, 0.1]) still(g, -r * Math.cos(a), r * Math.sin(a));
    still(g, 0, -(RANGE + 10) - 60);
    const spy = vi.spyOn(g, 'throwTo');
    play(g, bot, () => g.stats.throws === 0);
    const [x, y] = spy.mock.calls[0]!;
    expect(Math.hypot(x + r, y)).toBeLessThan(60);
  });

  it('цели нет — броска нет: предметы убираются перед каждым шагом', () => {
    const g = new Game(DATA, CFG);
    const bot = new HumanBot(g, DATA, new Rng(CFG.seed + 3));
    const spy = vi.spyOn(g, 'throwTo');
    play(g, bot, () => g.stats.gameMs < 2 * HUMAN.reactionMs[1], () => (g.world.items.length = 0));
    expect(spy).not.toHaveBeenCalled();
    expect(g.stats.throws).toBe(0);
  });

  it('удержание — через pullDelayMs после падения (± 2 шага), отпускание — когда сеть вернулась', () => {
    const delay = 500;
    const { g, bot } = calm({ ...HUMAN, pullDelayMs: [delay, delay] });
    still(g, 150, 0);
    const pulls: Array<{ on: boolean; ms: number; net: string }> = [];
    const orig = g.setPull.bind(g);
    vi.spyOn(g, 'setPull').mockImplementation((on) => {
      pulls.push({ on, ms: g.stats.gameMs, net: g.net.state });
      orig(on);
    });
    play(g, bot, () => g.net.state !== 'lying');
    const landed = g.stats.gameMs;
    play(g, bot, () => pulls.length === 0);
    expect(pulls[0]!.on).toBe(true);
    expect(Math.abs(pulls[0]!.ms - landed - delay)).toBeLessThanOrEqual(2 * STEP_MS);
    play(g, bot, () => g.net.state !== 'ready');
    expect(pulls).toHaveLength(1);
    bot.update();
    expect(pulls).toHaveLength(2);
    expect(pulls[1]).toMatchObject({ on: false, net: 'ready' });
  });
});

describe('HumanBot: окно и стройка', () => {
  it('окно 2-го уровня — «Плот» за windowMs; стройка — клетка (0, −1) за buildMs', () => {
    const { g, bot } = calm();
    g.debugLevelUp();
    const w = bot.pause();
    expect(w.card).toBe('raft');
    expect(w.ms).toBeGreaterThanOrEqual(HUMAN.windowMs[0]);
    expect(w.ms).toBeLessThan(HUMAN.windowMs[1]);
    // У (0, −1) и (1, 0) счёт по 1; (0, −1) — первая из candidates().
    const first = g.raft.candidates().findIndex((c) => c.gx === 0 && c.gy === -1);
    const right = g.raft.candidates().findIndex((c) => c.gx === 1 && c.gy === 0);
    expect(first).toBeLessThan(right);
    const b = bot.pause();
    expect(b.card).toBeNull();
    expect(b.ms).toBeGreaterThanOrEqual(HUMAN.buildMs[0]);
    expect(b.ms).toBeLessThan(HUMAN.buildMs[1]);
    expect(g.raft.cells).toContainEqual({ gx: 0, gy: -1 });
    expect(g.paused).toBe(false);
  });

  it('без «Плота» — первая доступная карточка по CARD_ORDER', () => {
    const { g, bot } = calm();
    const [, second, third, fourth] = CARD_ORDER;
    g.window = {
      level: 5,
      cards: [
        { id: fourth!, available: true, reason: null },
        { id: third!, available: true, reason: null },
        { id: second!, available: false, reason: 'ui.need_free_cell' },
      ],
    };
    expect(bot.pause().card).toBe(third);
    expect(g.window).toBeNull();
  });
});

describe('HumanBot: краб', () => {
  it('копьё — через crabNoticeMs (± шаг); краб утонул — слот снова сеть', () => {
    const { g, bot } = calm();
    g.debugSpawnEnemy(100, 0);
    // Первый бросок Rng бота — когда заметит краба.
    const notice = new Rng(CFG.seed + 3).range(...HUMAN.crabNoticeMs);
    const at = firstAt(g, bot, () => g.stats.spearThrows);
    expect(Math.abs(at - notice)).toBeLessThanOrEqual(STEP_MS);
    expect(g.weapon).toBe('spear');
    play(g, bot, () => g.enemies.list.length > 0);
    expect(g.stats.enemiesKilled).toBe(1);
    bot.update();
    expect(g.weapon).toBe('net');
  });
});

describe('runSim', () => {
  it('один сид дважды — равные результаты; 2-й уровень по часам = игровому, с окнами часы идут дальше', () => {
    const opts = { maxGameMs: 90_000, untilLevel: 4, bot: HUMAN };
    const a = runSim(DATA, 1, opts);
    expect(runSim(DATA, 1, opts)).toEqual(a);
    expect(a.levelGameMs[2]).not.toBeNull();
    expect(a.levelWallMs[2]).toBe(a.levelGameMs[2]);
    expect(a.windows).toBeGreaterThan(0);
    expect(a.wallMs).toBeGreaterThan(a.gameMs);
  });
});

describe('отчёт', () => {
  it('median и quantile на маленьких выборках', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([1, Infinity, Infinity])).toBe(Infinity);
    expect(quantile([5, 1, 4, 2, 3], 0.9)).toBe(5);
    expect(quantile([5, 1, 4, 2, 3], 0.5)).toBe(3);
    expect(quantile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.9)).toBe(10);
    expect(quantile([1, 2], 1)).toBe(2);
  });

  it('gate: null — Infinity, over и passed', () => {
    expect(gate([8000, 9000, 12_000])).toEqual({ games: 3, medianMs: 9000, p90Ms: 12_000, maxMs: 12_000, over: 1, passed: true });
    const g = gate([8000, null, null]);
    expect(g).toMatchObject({ medianMs: Infinity, maxMs: Infinity, over: 2, passed: false });
    expect(gate([GATE_L2_MS]).passed).toBe(true);
  });
});
