import { describe, expect, it } from 'vitest';
import { STEP_MS, TIME_EPS } from '../../src/core/clock';
import { Game } from '../../src/core/game';
import { SAVE_KEY } from '../../src/core/save';
import { DATA } from '../../src/data';
import { Saver } from '../../src/game/saver';

const CFG = { halfW: 640, halfH: 360, speedMult: 1, locationId: 'lagoon', seed: 1 };
const AUTOSAVE_MS = DATA.num('autosave_s') * 1000;

/** Подделка площадки: запоминает каждую запись. */
function setup(): { game: Game; saver: Saver; saves: Array<{ key: string; data: string }> } {
  const saves: Array<{ key: string; data: string }> = [];
  const platform = { save: async (key: string, data: string): Promise<void> => void saves.push({ key, data }) };
  const game = new Game(DATA, CFG);
  return { game, saver: new Saver(platform, game, 'lagoon', 1, AUTOSAVE_MS), saves };
}

describe('Saver', () => {
  it(`запись раз в autosave_s игрового времени, не раньше; ключ — ${SAVE_KEY}`, () => {
    const { game, saver, saves } = setup();
    // Бросков нет — нет опыта и окон: мир идёт без пауз.
    while (game.world.timeMs + STEP_MS < AUTOSAVE_MS - TIME_EPS) {
      game.step(STEP_MS);
      saver.frame();
    }
    expect(saves).toHaveLength(0);
    while (saves.length === 0) {
      game.step(STEP_MS);
      saver.frame();
    }
    expect(game.world.timeMs).toBeGreaterThanOrEqual(AUTOSAVE_MS - TIME_EPS);
    expect(game.world.timeMs).toBeLessThan(AUTOSAVE_MS + STEP_MS);
    expect(saves[0]!.key).toBe(SAVE_KEY);
    expect(JSON.parse(saves[0]!.data).run.game.world.timeMs).toBe(game.world.timeMs);
    const first = game.world.timeMs;
    while (game.world.timeMs + STEP_MS < first + AUTOSAVE_MS - TIME_EPS) {
      game.step(STEP_MS);
      saver.frame();
    }
    expect(saves).toHaveLength(1);
    game.step(STEP_MS);
    saver.frame();
    expect(saves).toHaveLength(2);
  });

  it('окно открылось, закрылось, стройка закончилась — запись сразу, по одной на событие', () => {
    const { game, saver, saves } = setup();
    saver.frame();
    expect(saves).toHaveLength(0);
    game.debugLevelUp();
    saver.frame();
    saver.frame();
    expect(saves).toHaveLength(1);
    // «Взять» на «Плоте» меняет и окно, и стройку — одна запись.
    expect(game.takeCard(0)).toBe(true);
    expect(game.build).not.toBeNull();
    saver.frame();
    expect(saves).toHaveLength(2);
    const c = game.raft.candidates()[0]!;
    game.placeCell(c.gx, c.gy);
    saver.frame();
    saver.frame();
    expect(saves).toHaveLength(3);
    // Окно с карточкой моряка: закрылось без стройки.
    game.setLevel(3);
    game.debugLevelUp();
    saver.frame();
    expect(saves).toHaveLength(4);
    const i = game.window!.cards.findIndex((card) => card.available && game.deck.card(card.id).kind !== 'raft');
    expect(game.takeCard(i)).toBe(true);
    expect(game.paused).toBe(false);
    saver.frame();
    expect(saves).toHaveLength(5);
  });

  it("после disable() записей нет — ни по таймеру, ни через save(), а save() возвращает ''", () => {
    const { game, saver, saves } = setup();
    expect(saver.save()).not.toBe('');
    expect(saves).toHaveLength(1);
    saver.disable();
    game.debugLevelUp();
    saver.frame();
    game.takeCard(0);
    const c = game.raft.candidates()[0]!;
    game.placeCell(c.gx, c.gy);
    expect(game.paused).toBe(false);
    while (game.world.timeMs < 3 * AUTOSAVE_MS) {
      game.step(STEP_MS);
      saver.frame();
    }
    expect(saver.save()).toBe('');
    expect(saves).toHaveLength(1);
  });
});
