import { describe, expect, it } from 'vitest';
import { STEP_MS } from '../../src/core/clock';
import { Game } from '../../src/core/game';
import { DATA } from '../../src/data';
import { Control } from '../../src/game/input/control';
import { parseSettings } from '../../src/game/settings';

const CFG = { halfW: 640, halfH: 360, speedMult: 1, locationId: 'lagoon', seed: 1 };

function setup() {
  const game = new Game(DATA, CFG);
  const calls: string[] = [];
  const control = new Control(game, { gameplayStart: () => calls.push('start'), gameplayStop: () => calls.push('stop') });
  return { game, control, calls };
}

describe('пауза в ядре', () => {
  it('мир стоит, броска нет, окно уровня ждёт конца паузы; на паузе окно и стройка не берутся', () => {
    const g = new Game(DATA, CFG);
    expect(g.throwTo(150, 0)).toBe(true);
    g.step(STEP_MS * 3);
    expect(g.net.state).not.toBe('ready');
    g.setMenu(true);
    expect(g.paused).toBe(true);
    const before = JSON.stringify(g.snapshot());
    for (let i = 0; i < 60; i++) g.step(STEP_MS);
    expect(JSON.stringify(g.snapshot())).toBe(before);
    expect(g.throwTo(-150, 0)).toBe(false);

    g.debugLevelUp();
    expect(g.progression.level).toBe(2);
    expect(g.window).toBeNull();
    g.setMenu(false);
    g.step(STEP_MS);
    expect(g.window?.level).toBe(2);

    g.setMenu(true);
    expect(g.takeCard(0)).toBe(false);
    expect(g.window?.level).toBe(2);
    g.setMenu(false);
    expect(g.takeCard(g.window!.cards.findIndex((c) => c.id === 'raft'))).toBe(true);
    expect(g.build).not.toBeNull();
    g.setMenu(true);
    expect(g.placeCell(1, 0)).toBe(false);
    g.setMenu(false);
    expect(g.placeCell(1, 0)).toBe(true);
    expect(g.raft.cells).toHaveLength(2);
  });

  it('menu в снимок не входит; после restore игра идёт', () => {
    const g = new Game(DATA, CFG);
    g.setMenu(true);
    const s = JSON.parse(JSON.stringify(g.snapshot())) as Record<string, unknown>;
    expect('menu' in s).toBe(false);
    const r = Game.restore(DATA, CFG, s as unknown as ReturnType<Game['snapshot']>);
    expect(r.menu).toBe(false);
    expect(r.paused).toBe(false);
  });
});

describe('пауза и сигналы площадке', () => {
  it('пауза — stop, «Продолжить» — start; так же во время стройки', () => {
    const { game, control, calls } = setup();
    control.notePlay();
    control.frame(STEP_MS);
    game.setMenu(true);
    control.frame(STEP_MS);
    expect(calls).toEqual(['start', 'stop']);
    game.setMenu(false);
    control.frame(STEP_MS);
    expect(calls).toEqual(['start', 'stop', 'start']);

    game.debugLevelUp();
    control.frame(STEP_MS);
    game.takeCard(game.window!.cards.findIndex((c) => c.id === 'raft'));
    control.frame(STEP_MS);
    expect(game.build).not.toBeNull();
    expect(calls.slice(3)).toEqual(['stop', 'start']);
    game.setMenu(true);
    control.frame(STEP_MS);
    game.setMenu(false);
    control.frame(STEP_MS);
    expect(calls.slice(5)).toEqual(['stop', 'start']);
  });

  it('до первого нажатия сигналов нет; нажатие на паузе — start только после неё', () => {
    const { game, control, calls } = setup();
    game.setMenu(true);
    control.frame(STEP_MS);
    game.setMenu(false);
    control.frame(STEP_MS);
    game.setMenu(true);
    control.frame(STEP_MS);
    expect(calls).toEqual([]);
    control.notePlay();
    control.frame(STEP_MS);
    expect(calls).toEqual([]);
    game.setMenu(false);
    control.frame(STEP_MS);
    expect(calls).toEqual(['start']);
  });
});

describe('parseSettings', () => {
  it('ru и en; пусто, не JSON, массив, другой язык — {}', () => {
    expect(parseSettings('{"lang":"ru"}')).toEqual({ lang: 'ru' });
    expect(parseSettings('{"lang":"en"}')).toEqual({ lang: 'en' });
    for (const t of [null, '', '{не json', '["ru"]', '{"lang":"de"}', 'null', '"ru"']) expect(parseSettings(t)).toEqual({});
  });
});
