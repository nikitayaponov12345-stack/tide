import { describe, expect, it } from 'vitest';
import { STEP_MS } from '../../src/core/clock';
import { Game } from '../../src/core/game';
import { DATA } from '../../src/data';
import { Control } from '../../src/game/input/control';

const CFG = { halfW: 640, halfH: 360, speedMult: 1, locationId: 'lagoon', seed: 1 };

function setup() {
  const game = new Game(DATA, CFG);
  const calls: string[] = [];
  const control = new Control(game, { gameplayStart: () => calls.push('start'), gameplayStop: () => calls.push('stop') });
  return { game, control, calls };
}

describe('Control', () => {
  it('frame шагает ядро в игровом времени фиксированным шагом', () => {
    const { game, control } = setup();
    control.frame(STEP_MS * 3);
    expect(game.stats.gameMs).toBeCloseTo(STEP_MS * 3, 6);
    expect(game.world.timeMs).toBeCloseTo(STEP_MS * 3, 6);
    control.frame(STEP_MS / 2);
    expect(game.stats.gameMs).toBeCloseTo(STEP_MS * 3, 6);
    control.frame(STEP_MS / 2);
    expect(game.stats.gameMs).toBeCloseTo(STEP_MS * 4, 6);
  });

  it('notePlay: один gameplayStart на два вызова', () => {
    const { control, calls } = setup();
    control.notePlay();
    control.notePlay();
    expect(calls).toEqual(['start']);
  });

  it('окно — stop, «Взять» — start; в стройке сигналов нет; смена окна — оба по порядку', () => {
    const { game, control, calls } = setup();
    control.notePlay();
    control.frame(STEP_MS);
    game.debugLevelUp();
    control.frame(STEP_MS);
    expect(calls).toEqual(['start', 'stop']);
    game.takeCard(0);
    control.frame(STEP_MS);
    expect(calls).toEqual(['start', 'stop', 'start']);
    control.frame(STEP_MS * 10);
    expect(calls).toHaveLength(3);
    game.placeCell(1, 0);
    control.frame(STEP_MS);
    expect(calls).toHaveLength(3);

    // Два уровня: окно 3 уровня, «Взять» карточку моряка или «Плот» → следующее окно.
    const mult = DATA.location(CFG.locationId).xpMult;
    game.progression.addXp(DATA.levelStep(3, mult) + DATA.levelStep(4, mult));
    control.frame(STEP_MS);
    expect(game.window?.level).toBe(3);
    expect(calls.slice(3)).toEqual(['stop']);
    game.takeCard(game.window!.cards.findIndex((c) => c.id !== 'raft'));
    expect(game.window?.level).toBe(4);
    control.frame(STEP_MS);
    expect(calls.slice(3)).toEqual(['stop', 'start', 'stop']);
  });

  it('окно до первого нажатия сигналов не даёт; нажатие на нём — start только после закрытия', () => {
    const { game, control, calls } = setup();
    game.debugLevelUp();
    control.frame(STEP_MS);
    expect(calls).toEqual([]);
    control.notePlay();
    control.frame(STEP_MS);
    expect(calls).toEqual([]);
    game.takeCard(0);
    control.frame(STEP_MS);
    expect(calls).toEqual(['start']);
  });

  it('реклама за награду: без окна — stop, затем start; при открытом окне сигналов нет (M1-14)', async () => {
    const { game, control, calls } = setup();
    control.notePlay();
    control.frame(STEP_MS);
    expect(await control.rewarded(async () => true)).toBe(true);
    expect(calls).toEqual(['start', 'stop', 'start']);
    game.debugLevelUp();
    control.frame(STEP_MS);
    expect(calls).toEqual(['start', 'stop', 'start', 'stop']);
    expect(await control.rewarded(async () => true)).toBe(true);
    expect(calls).toEqual(['start', 'stop', 'start', 'stop']);
  });

  it('Локация пройдена (M1-15): окно — stop, «Играть дальше» — start; пауза поверх окна не открывается', () => {
    const { game, control, calls } = setup();
    control.notePlay();
    game.setLevel(DATA.num('level_to_clear'));
    control.frame(STEP_MS);
    expect(game.finalBoss.phase).toBe('crawl');
    game.finalBoss.debugHp(1);
    game.spearOwned = true;
    game.setWeapon('spear');
    game.throwTo(game.finalBoss.x, game.finalBoss.y);
    for (let i = 0; i < 600 && !game.cleared; i++) control.frame(STEP_MS);
    expect(game.cleared).toBe(true);
    expect(calls).toEqual(['start', 'stop']);
    game.setMenu(true);
    expect(game.menu).toBe(false);
    control.frame(STEP_MS);
    expect(calls).toEqual(['start', 'stop']);
    expect(game.playOn()).toBe(true);
    control.frame(STEP_MS);
    expect(calls).toEqual(['start', 'stop', 'start']);
  });
});
