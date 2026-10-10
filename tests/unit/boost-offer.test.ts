import { describe, expect, it } from 'vitest';
import { BOTTLE_ROLE } from '../../src/core/boost';
import { BOOST_OFFER_PLACE, BoostOffer } from '../../src/core/boost-offer';
import { FixedStep, STEP_MS } from '../../src/core/clock';
import { Game, type GameConfig, type GameSnapshot } from '../../src/core/game';
import { DATA } from '../../src/data';

const CFG: GameConfig = { halfW: 640, halfH: 360, speedMult: 1, locationId: 'lagoon', seed: 1 };
const ROW = DATA.ads.find((a) => a.place === BOOST_OFFER_PLACE)!;
const FIRST_MS = Number(ROW.first_after_s) * 1000;
const COOLDOWN_MS = Number(ROW.cooldown_s) * 1000;
const VISIBLE_MS = Number(ROW.visible_s) * 1000;
const AD_BOOST_MS = DATA.num('boost_ad_s') * 1000;
/** Шагов на время ms. */
const steps = (ms: number): number => Math.round(ms / STEP_MS);
/** Предел шагов циклов: синхронный бесконечный цикл Vitest не прерывает. */
const MAX_STEPS = 50_000;

const viaJson = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

function stepN(g: Game, n: number): void {
  for (let i = 0; i < n; i++) g.step(STEP_MS);
}

/** Шагать игру, пока не cond; ответ — сколько шагов. */
function stepUntil(g: Game, cond: () => boolean): number {
  for (let i = 1; i <= MAX_STEPS; i++) {
    g.step(STEP_MS);
    if (cond()) return i;
  }
  throw new Error('stepUntil: предел шагов');
}

describe('BoostOffer', () => {
  it('первое — на first_after_s, видно visible_s, следующее — через cooldown_s от начала прошлого', () => {
    const o = new BoostOffer(DATA, true);
    for (let i = 0; i < steps(FIRST_MS) - 1; i++) o.step(STEP_MS, true);
    expect(o.visible).toBe(false);
    expect(o.shown).toBe(0);
    o.step(STEP_MS, true);
    expect(o.visible).toBe(true);
    expect(o.shown).toBe(1);
    let n = 0;
    while (o.visible && n < MAX_STEPS) {
      o.step(STEP_MS, true);
      n++;
    }
    expect(n).toBe(steps(VISIBLE_MS));
    for (let i = 0; i < steps(COOLDOWN_MS - VISIBLE_MS) - 1; i++) o.step(STEP_MS, true);
    expect(o.shown).toBe(1);
    o.step(STEP_MS, true);
    expect(o.visible).toBe(true);
    expect(o.shown).toBe(2);
  });

  it('нельзя дольше first_after_s — предложения нет; первый шаг, когда можно, — кнопка, следующее через cooldown_s от неё', () => {
    const o = new BoostOffer(DATA, true);
    for (let i = 0; i < steps(FIRST_MS) + 600; i++) o.step(STEP_MS, false);
    expect(o.shown).toBe(0);
    o.step(STEP_MS, true);
    expect(o.visible).toBe(true);
    expect(o.nextMs).toBe(o.ms + COOLDOWN_MS);
  });

  it('рекламы за награду нет — ни предложений, ни show(); у Game — debugBoostOffer() ложно', () => {
    const o = new BoostOffer(DATA, false);
    for (let i = 0; i < steps(FIRST_MS) + 60; i++) o.step(STEP_MS, true);
    expect(o.shown).toBe(0);
    expect(o.show()).toBe(false);
    expect(o.visible).toBe(false);
    const g = new Game(DATA, { ...CFG, rewarded: false });
    expect(g.boostOffer.enabled).toBe(false);
    expect(g.debugBoostOffer()).toBe(false);
  });
});

describe('Буст за рекламу в игре', () => {
  it('не в событие, не в визит и не под бустом: кнопка приходит после них', () => {
    const g = new Game(DATA, CFG);
    g.boostOffer.nextMs = 0;
    g.debugEvent();
    g.step(STEP_MS);
    expect(g.events.active).toBe(true);
    stepUntil(g, () => !g.events.active);
    expect(g.boss.visiting).toBe(true);
    expect(g.boostOffer.shown).toBe(0);
    stepUntil(g, () => !g.boss.visiting);
    expect(g.boostOffer.visible).toBe(true);

    const h = new Game(DATA, CFG);
    h.boostOffer.nextMs = 0;
    h.debugBoost(1000);
    stepN(h, steps(1000) - 1);
    expect(h.boostOffer.shown).toBe(0);
    stepUntil(h, () => !h.boost.active);
    h.step(STEP_MS);
    expect(h.boostOffer.visible).toBe(true);
  });

  it('нажатие — мир стоит до конца рекламы; досмотрена — буст boost_ad_s, крабы гибнут без добычи', () => {
    const g = new Game(DATA, CFG);
    g.debugSpawnEnemy();
    g.debugSpawnEnemy();
    expect(g.enemies.list).toHaveLength(2);
    expect(g.debugBoostOffer()).toBe(true);
    g.setMenu(true);
    expect(g.takeBoostOffer()).toBe(false);
    g.setMenu(false);
    expect(g.takeBoostOffer()).toBe(true);
    expect(g.ad).toBe(true);
    expect(g.paused).toBe(true);
    const t = g.world.timeMs;
    stepN(g, 60);
    expect(g.world.timeMs).toBe(t);
    expect(g.boostOffer.visible).toBe(false);
    expect(g.boostOffer.taken).toBe(1);
    expect(g.adDone(true)).toBe(true);
    expect(g.ad).toBe(false);
    expect(g.boost.leftMs).toBe(AD_BOOST_MS);
    expect(g.enemies.list).toHaveLength(0);
    expect(g.stats.enemiesKilled).toBe(2);
    expect(g.stats.boostKills).toBe(2);
    expect(g.stats.lootDropped).toBe(0);
    expect(g.adDone(true)).toBe(false);
  });

  it('не досмотрена — ни буста, ни гибели крабов', () => {
    const g = new Game(DATA, CFG);
    g.debugSpawnEnemy();
    g.debugBoostOffer();
    expect(g.takeBoostOffer()).toBe(true);
    expect(g.adDone(false)).toBe(true);
    expect(g.boost.active).toBe(false);
    expect(g.enemies.list).toHaveLength(1);
    expect(g.stats.boostKills).toBe(0);
  });

  it('после первого предложения бутылка не всплывает', () => {
    const g = new Game(DATA, CFG);
    g.stats.enemiesKilled = 1;
    g.debugBoostOffer();
    stepN(g, 600);
    expect(g.world.items.filter((it) => it.role === BOTTLE_ROLE)).toEqual([]);
    expect(g.boost.bottleId).toBeNull();
  });
});

describe('Буст за рекламу: время и снимок', () => {
  /** Предложения с nextMs = 1000: first + cooldown игрового времени через FixedStep при fps кадрах в секунду. */
  const run = (fps: number) => {
    const g = new Game(DATA, CFG);
    g.boostOffer.nextMs = 1000;
    const clock = new FixedStep(STEP_MS, 1000);
    const total = steps(FIRST_MS + COOLDOWN_MS);
    let n = 0;
    while (n < total) {
      clock.advance(1000 / fps, (dt) => {
        if (n < total && !g.paused) g.step(dt);
        n++;
      });
    }
    return { offer: g.boostOffer.snapshot(), boost: g.boost.snapshot(), events: g.events.snapshot() };
  };

  it('30, 60 и 144 кадров в секунду — одни и те же предложения', () => {
    const base = run(60);
    expect(base.offer.shown).toBeGreaterThan(1);
    expect(run(30)).toEqual(base);
    expect(run(144)).toEqual(base);
  });

  it('снимок с кнопкой и во время рекламы; запись без boostOffer — предложения с начала', () => {
    const g = new Game(DATA, CFG);
    g.debugBoostOffer();
    stepN(g, 10);
    expect(g.boostOffer.visible).toBe(true);
    const snap = viaJson(g.snapshot());
    const r = Game.restore(DATA, CFG, snap);
    expect(viaJson(r.snapshot())).toEqual(snap);
    stepN(g, 600);
    stepN(r, 600);
    expect(viaJson(r.snapshot())).toEqual(viaJson(g.snapshot()));

    const a = new Game(DATA, CFG);
    a.debugBoostOffer();
    expect(a.takeBoostOffer()).toBe(true);
    const ad = Game.restore(DATA, CFG, viaJson(a.snapshot()));
    expect(ad.ad).toBe(false);
    expect(ad.paused).toBe(false);
    expect(ad.boostOffer.taken).toBe(1);
    const t = ad.world.timeMs;
    ad.step(STEP_MS);
    expect(ad.world.timeMs).toBeGreaterThan(t);

    const old: GameSnapshot = viaJson(snap);
    delete old.boostOffer;
    const o = Game.restore(DATA, CFG, old).boostOffer;
    expect(o.ms).toBe(0);
    expect(o.nextMs).toBe(FIRST_MS);
    expect(o.shown).toBe(0);
  });
});
