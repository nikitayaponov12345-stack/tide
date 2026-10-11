import { describe, expect, it } from 'vitest';
import { STEP_MS } from '../../src/core/clock';
import { Game, type GameConfig, type GameSnapshot } from '../../src/core/game';
import { isNewerSave, makeSave, parseSave, SAVE_VERSION } from '../../src/core/save';
import { DATA } from '../../src/data';

const CFG: GameConfig = { halfW: 640, halfH: 360, speedMult: 1, locationId: 'lagoon', seed: 1 };
const PORTRAIT: GameConfig = { ...CFG, halfW: 360, halfH: 640, speedMult: DATA.num('current_portrait_mult') };
/** Тактов в прогоне продолжения. */
const RUN_TACTS = 15_000;
/** Предел шагов любого другого цикла: синхронный бесконечный цикл Vitest не прерывает. */
const MAX_STEPS = 20_000;

/** Снимок через JSON — так, как его вернёт запись. */
const viaJson = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const load = (s: GameSnapshot, cfg: GameConfig = CFG): Game => Game.restore(DATA, cfg, viaJson(s));

/**
 * Игрок теста без своей памяти: решает только по состоянию игры, поэтому после загрузки ведёт себя так же.
 * Окно — сетевая башня, если доступна, иначе «Плот», если доступен, иначе первая доступная; стройка — первое место; шаг на вторую клетку;
 * краб, который уже укусил (не approach), при копье — копьём в него, иначе сеть: ready — бросок в ближайший к центру предмет, lying — тянуть.
 */
function decide(g: Game): void {
  if (g.window) {
    const cards = g.window.cards;
    const tower = cards.findIndex((c) => c.available && c.id === 'net_tower');
    const raft = cards.findIndex((c) => c.available && g.deck.card(c.id).kind === 'raft');
    g.takeCard(tower >= 0 ? tower : raft >= 0 ? raft : cards.findIndex((c) => c.available));
    return;
  }
  if (g.build) {
    const c = g.buildSpots()[0]!;
    g.placeCell(c.gx, c.gy);
    return;
  }
  const side = g.raft.cells.find((c) => Math.abs(c.gx) + Math.abs(c.gy) === 1);
  if (side && g.sailor.gx === 0 && g.sailor.gy === 0) g.walk(side.gx, side.gy);
  // Краба по дороге не бьёт: иначе укусов в прогоне нет.
  const crab = g.enemies.list.find((e) => e.phase !== 'approach');
  if (crab && g.spearOwned) {
    g.setWeapon('spear');
    if (g.spear.state === 'ready') g.throwTo(crab.x, crab.y);
    return;
  }
  g.setWeapon('net');
  if (g.net.state === 'ready') {
    g.setPull(false);
    const it = [...g.world.items].sort((a, b) => Math.hypot(a.x, a.y) - Math.hypot(b.x, b.y))[0];
    if (it) g.throwTo(it.x, it.y);
  } else if (g.net.state === 'lying') {
    g.setPull(true);
  }
}

/** Такт: решение игрока, затем шаг, если нет паузы. */
function tact(g: Game): void {
  decide(g);
  if (!g.paused) g.step(STEP_MS);
}

/** Шагать, пока cond; больше MAX_STEPS шагов — ошибка. */
function stepWhile(g: Game, cond: () => boolean): void {
  for (let i = 0; cond(); i++) {
    if (i >= MAX_STEPS) throw new Error('stepWhile: предел шагов');
    g.step(STEP_MS);
  }
}

/** Случаи, в которые нужна запись: первый такт, когда случай есть. */
const CASES: Record<string, (g: Game) => boolean> = {
  window: (g) => g.window !== null,
  build: (g) => g.build !== null,
  netFlying: (g) => g.net.state === 'flying',
  netPulling: (g) => g.net.state === 'pulling',
  crab: (g) => g.enemies.list.length > 0,
  spearFlying: (g) => g.spear.state === 'flying',
  icons: (g) => g.progression.icons.length > 0,
  cellHurt: (g) => g.raft.cells.some((c) => c.hp < g.raft.cellHp),
  building: (g) => g.raft.cells.some((c) => c.building !== null),
  towerNet: (g) => g.towers.list.some((t) => t.nets.some((n) => n.state !== 'ready')),
  storm: (g) => g.events.active,
  bossVisit: (g) => g.boss.visiting,
  bossBall: (g) => g.boss.balls.length > 0,
  bottle: (g) => g.boost.bottleId !== null,
  boost: (g) => g.boost.active,
  boostOffer: (g) => g.boostOffer.visible,
};

describe('Снимок партии', () => {
  it('снимок → JSON → restore → тот же снимок', () => {
    const g = new Game(DATA, CFG);
    for (let i = 0; i < 3000; i++) tact(g);
    const s = viaJson(g.snapshot());
    expect(viaJson(load(s).snapshot())).toEqual(s);
  });

  it('продолжение с записи в любом из шестнадцати случаев идёт так же, как прогон без перерыва', () => {
    const g = new Game(DATA, CFG);
    const saves: Array<{ name: string; at: number; snap: GameSnapshot }> = [];
    for (let t = 0; t < RUN_TACTS; t++) {
      for (const [name, has] of Object.entries(CASES)) {
        if (!saves.some((s) => s.name === name) && has(g)) saves.push({ name, at: t, snap: viaJson(g.snapshot()) });
      }
      tact(g);
    }
    expect(saves.map((s) => s.name).sort()).toEqual(Object.keys(CASES).sort());
    const end = viaJson(g.snapshot());
    for (const { name, at, snap } of saves) {
      const r = load(snap);
      expect(viaJson(r.snapshot()), `${name}: сразу после загрузки`).toEqual(snap);
      for (let t = at; t < RUN_TACTS; t++) tact(r);
      expect(viaJson(r.snapshot()), `${name}: к концу прогона`).toEqual(end);
    }
  });

  it('запись до M1-03: клетки без hp после restore целые', () => {
    const g = new Game(DATA, CFG);
    g.debugLevelUp();
    g.takeCard(0);
    const c = g.raft.candidates()[0]!;
    g.placeCell(c.gx, c.gy);
    g.debugDamageCell(c.gx, c.gy, 1);
    const s = viaJson(g.snapshot());
    for (const cell of s.raft.cells) delete (cell as { hp?: number }).hp;
    const r = load(s);
    expect(r.raft.cells).toHaveLength(2);
    for (const cell of r.raft.cells) expect(cell.hp).toBe(DATA.num('cell_hp'));
  });

  it('запись до M1-05: клетки без building после restore свободны', () => {
    const g = new Game(DATA, CFG);
    g.debugLevelUp();
    g.takeCard(0);
    const c = g.raft.candidates()[0]!;
    g.placeCell(c.gx, c.gy);
    const s = viaJson(g.snapshot());
    for (const cell of s.raft.cells) delete (cell as { building?: string | null }).building;
    const r = load(s);
    expect(r.raft.cells).toHaveLength(2);
    for (const cell of r.raft.cells) expect(cell.building).toBeNull();
    expect(r.raft.freeCells()).toBe(2);
    expect(r.raft.buildingCount()).toBe(0);
  });

  it('запись до M1-06: без towers башни встают по постройкам плота с готовыми сетями', () => {
    const g = new Game(DATA, CFG);
    g.raft.build(0, 0, 'net_tower');
    g.towers.sync(g.raft);
    stepWhile(g, () => g.stats.towerThrows === 0);
    const s = viaJson(g.snapshot());
    delete s.towers;
    const r = load(s);
    expect(r.towers.list).toHaveLength(1);
    expect(r.towers.list[0]).toMatchObject({ gx: 0, gy: 0 });
    for (const n of r.towers.list[0]!.nets) expect(n).toMatchObject({ state: 'ready', x: 0, y: 0, restMs: 0, caught: [] });
    expect(r.towers.pauseMs).toBe(g.towers.pauseMs);
  });

  it('копьё копейной башни в полёте (M1-09): продолжение с записи идёт так же, как без перерыва', () => {
    const g = new Game(DATA, CFG);
    expect(g.debugBuild(0, 0, 'spear_tower')).toBe(true);
    g.debugSpawnEnemy(150, 0);
    stepWhile(g, () => g.spearTowers.list[0]!.state !== 'flying');
    const snap = viaJson(g.snapshot());
    expect(snap.spearTowers!.list[0]!.state).toBe('flying');
    for (let i = 0; i < 3000; i++) tact(g);
    const r = load(snap);
    for (let i = 0; i < 3000; i++) tact(r);
    expect(viaJson(r.snapshot())).toEqual(viaJson(g.snapshot()));
    expect(g.stats.towerSpearHits).toBeGreaterThan(0);
  });

  it('воронка шире тянет предметы (M1-13): продолжение с записи идёт так же, как без перерыва', () => {
    const g = new Game(DATA, CFG);
    expect(g.debugBuild(0, 0, 'whirlpool')).toBe(true);
    g.whirlpools.radius *= 1.2;
    for (let i = 0; i < 120; i++) tact(g);
    const snap = viaJson(g.snapshot());
    expect(snap.whirlpools!.radius).toBe(g.whirlpools.radius);
    for (let i = 0; i < 3000; i++) tact(g);
    const r = load(snap);
    for (let i = 0; i < 3000; i++) tact(r);
    expect(viaJson(r.snapshot())).toEqual(viaJson(g.snapshot()));
  });

  it('финальный бой (M1-15): продолжение с записи, сделанной в нырке краба, идёт так же, как без перерыва', () => {
    const g = new Game(DATA, CFG);
    g.setLevel(DATA.num('level_to_clear'));
    for (let i = 0; i < 600; i++) tact(g);
    stepWhile(g, () => g.finalBoss.phase !== 'dive');
    const snap = viaJson(g.snapshot());
    expect(snap.finalBoss!.phase).toBe('dive');
    for (let i = 0; i < 3000; i++) tact(g);
    const r = load(snap);
    for (let i = 0; i < 3000; i++) tact(r);
    expect(viaJson(r.snapshot())).toEqual(viaJson(g.snapshot()));
    expect(g.stats.finalStrikes).toBeGreaterThan(1);
  });

  it('очередь окон: после загрузки за окном 2-го уровня и клеткой открывается окно 3-го', () => {
    const g = new Game(DATA, CFG);
    g.debugLevelUp();
    g.debugLevelUp();
    expect(g.window?.level).toBe(2);
    const r = load(g.snapshot());
    expect(r.window?.level).toBe(2);
    expect(r.takeCard(0)).toBe(true);
    const c = r.raft.candidates()[0]!;
    expect(r.placeCell(c.gx, c.gy)).toBe(true);
    expect(r.window?.level).toBe(3);
  });

  it('сеть в полёте при зажатом пальце после загрузки падает сразу в тягу', () => {
    const g = new Game(DATA, CFG);
    expect(g.throwTo(g.net.netParams.range, 0)).toBe(true);
    g.setPull(true);
    g.step(STEP_MS);
    expect(g.net.state).toBe('flying');
    const r = load(g.snapshot());
    stepWhile(r, () => r.net.state === 'flying');
    expect(r.net.state).toBe('pulling');
  });

  it('другая раскладка: предметы на тех же местах, поле и speedMult — новые', () => {
    const g = new Game(DATA, CFG);
    for (let i = 0; i < 600; i++) g.step(STEP_MS);
    const r = load(g.snapshot(), PORTRAIT);
    expect(r.world.items.map(({ id, x, y }) => ({ id, x, y }))).toEqual(g.world.items.map(({ id, x, y }) => ({ id, x, y })));
    expect(r.world.config).toMatchObject({ halfW: PORTRAIT.halfW, halfH: PORTRAIT.halfH, speedMult: PORTRAIT.speedMult });
  });

  it('снимок — копия: дальнейшая игра его не меняет', () => {
    const g = new Game(DATA, CFG);
    for (let i = 0; i < 2000; i++) tact(g);
    const s = g.snapshot();
    const before = viaJson(s);
    for (let i = 0; i < 2000; i++) tact(g);
    g.debugLevelUp();
    expect(viaJson(s)).toEqual(before);
    expect(viaJson(g.snapshot())).not.toEqual(before);
  });
});

describe('Запись: makeSave, parseSave, isNewerSave', () => {
  const game = (): Game => {
    const g = new Game(DATA, CFG);
    for (let i = 0; i < 3000; i++) tact(g);
    return g;
  };
  const text = (o: unknown): string => JSON.stringify(o);

  it('поля записи: версия, рейтинг — опыт партии, пустая кампания, replay — null', () => {
    const g = game();
    expect(g.stats.xpGained).toBeGreaterThan(0);
    const s = makeSave(g, 'lagoon', 7);
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.rating).toBe(g.stats.xpGained);
    expect(s.campaign).toEqual({ passed: [], whirlpoolUnlocked: false });
    expect(s.replay).toBeNull();
    expect(s.run).toMatchObject({ locationId: 'lagoon', seed: 7 });
    expect(viaJson(s.run!.game)).toEqual(viaJson(g.snapshot()));
    expect(parseSave(text(s))).toEqual(viaJson(s));
  });

  it('кампания: после победы в финальном бою локация — в passed (M1-15)', () => {
    const g = new Game(DATA, CFG);
    g.setLevel(DATA.num('level_to_clear'));
    g.step(STEP_MS);
    expect(makeSave(g, 'lagoon', 1).campaign.passed).toEqual([]);
    g.finalBoss.debugHp(1);
    g.spearOwned = true;
    g.setWeapon('spear');
    expect(g.throwTo(g.finalBoss.x, g.finalBoss.y)).toBe(true);
    stepWhile(g, () => !g.cleared);
    const s = makeSave(g, 'lagoon', 1);
    expect(s.campaign.passed).toEqual(['lagoon']);
    expect(s.rating).toBe(g.stats.xpGained);
    expect(s.run!.game.cleared).toBe(true);
    expect(s.run!.game.chestDoubled).toBe(false);
    expect(g.doubleChest()).toBe(true);
    expect(makeSave(g, 'lagoon', 1).run!.game.chestDoubled).toBe(true);
  });

  it('parseSave: null на пустом тексте, не JSON, массиве, плохой версии и плохом run', () => {
    const s = viaJson(makeSave(game(), 'lagoon', 1));
    const { game: _g, ...noGame } = s.run!;
    const { seed: _s, ...noSeed } = s.run!;
    const { run: _r, ...noRun } = s;
    for (const bad of [
      null, '', '{', 'null', '42', text([s]),
      text({ ...s, version: 0 }), text({ ...s, version: 1.5 }), text({ ...s, version: '1' }), text({ ...s, version: SAVE_VERSION + 1 }),
      text(noRun), text({ ...s, run: noGame }), text({ ...s, run: noSeed }), text({ ...s, run: { ...s.run, game: [] } }),
    ]) {
      expect(parseSave(bad), String(bad).slice(0, 40)).toBeNull();
    }
    expect(parseSave(text({ ...s, run: null }))?.run).toBeNull();
  });

  it('isNewerSave: true только у версии новее нашей', () => {
    const s = viaJson(makeSave(game(), 'lagoon', 1));
    expect(isNewerSave(text({ ...s, version: SAVE_VERSION + 1 }))).toBe(true);
    for (const t of [null, '', '{', text(s), text({ ...s, version: 0 }), text([{ version: SAVE_VERSION + 1 }]), text({ version: '9' })]) {
      expect(isNewerSave(t)).toBe(false);
    }
  });
});
