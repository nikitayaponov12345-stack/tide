import './debug';
import { ROLES, type Role } from './core/data/tables';
import { Game } from './core/game';
import { DATA } from './data';
import { BuildCursor } from './game/input/build';
import { Control } from './game/input/control';
import { KeyboardInput } from './game/input/keys';
import { PointerInput } from './game/input/pointer';
import { DESIGN, worldToScreen, type Layout } from './game/layout';
import { Stage } from './game/stage';
import { View } from './game/view';
import { StubPlatform } from './platform/stub';
import { CardWindow } from './ui/cards';
import { WalkHint } from './ui/hint';
import { Hud } from './ui/hud';
import { Overlay } from './ui/overlay';
import { PlaceButton } from './ui/place';

const VERSION = '0.0.5';
/** Метка сборки: короткий хеш коммита от `npm run publish`, иначе 'dev'. */
const BUILD = import.meta.env.VITE_BUILD ?? 'dev';
const LOCATION = 'lagoon';
const SEED = 1;
/** Отладочные клавиши уровня: не выше этого. */
const DEBUG_MAX_LEVEL = 50;

/** Полуразмеры поля и множитель течения для раскладки. */
function worldSize(layout: Layout): { halfW: number; halfH: number; speedMult: number } {
  const d = DESIGN[layout];
  return { halfW: d.w / 2, halfH: d.h / 2, speedMult: layout === 'portrait' ? DATA.num('current_portrait_mult') : 1 };
}

async function boot(): Promise<void> {
  const platform = new StubPlatform();
  await platform.init();
  const lang = platform.language() === 'ru' ? 'ru' : 'en';

  const stage = new Stage();
  await stage.init(document.getElementById('game')!);

  const game = new Game(DATA, { ...worldSize(stage.layout), locationId: LOCATION, seed: SEED });
  const { world, net, progression, stats, sailor, raft } = game;
  const cellPx = DATA.num('cell_px');
  const view = new View(stage.root, { waterColor: DATA.location(LOCATION).waterColor, cellPx });
  view.build(stage.layout);
  stage.onLayout = (layout) => {
    const s = worldSize(layout);
    world.resize(s.halfW, s.halfH, s.speedMult);
    view.build(layout);
  };

  const setLevel = (n: number): void => game.setLevel(Math.max(1, Math.round(n)));
  const debug = import.meta.env.DEV || new URLSearchParams(location.search).get('debug') === '1';
  if (debug) {
    // По e.code: в русской раскладке e.key у этих клавиш — «ъ» и «х».
    window.addEventListener('keydown', (e) => {
      if (e.code === 'BracketRight') setLevel(Math.min(DEBUG_MAX_LEVEL, progression.level + 1));
      else if (e.code === 'BracketLeft') setLevel(progression.level - 1);
    });
  }

  const text = (key: string): string => DATA.text(key, lang);

  const ui = document.getElementById('ui')!;
  const hud = new Hud(ui, text);
  const overlay = new Overlay(ui);
  const cards = new CardWindow(ui, game, text);
  const cursor = new BuildCursor(cellPx);
  const place = new PlaceButton(ui, game, cursor, text);
  const control = new Control(game, platform);
  const hint = new WalkHint(ui, game, text);
  new PointerInput(stage.app.canvas, game, () => stage.layout, cursor, DATA.num('walk_drag_px'));
  // Шаг с клавиатуры — тоже первое действие игрока; в stats.taps клавиши не входят.
  new KeyboardInput(game, () => control.notePlay());
  // Новая стройка (новый объект game.build) — призрак с нуля. Проверка и в кадре, и до ввода (фаза перехвата):
  // наведение мыши сразу после «Взять» не должно стереться сбросом в следующем кадре.
  let lastBuild = game.build;
  const watchBuild = (): void => {
    if (game.build === lastBuild) return;
    lastBuild = game.build;
    if (lastBuild) cursor.reset();
  };
  for (const type of ['pointerdown', 'pointermove', 'pointerup'] as const) window.addEventListener(type, watchBuild, { capture: true });

  stage.app.ticker.add((ticker) => {
    control.frame(ticker.deltaMS);
    watchBuild();
    view.sync(game, cursor);
    hud.update(game, stage.layout);
    cards.update(stage.layout, performance.now());
    place.update(stage.layout, cellPx);
    hint.update(stage.layout);
    overlay.update(
      performance.now(),
      `Прилив ${VERSION} (${BUILD}) · ${stage.layout} · ${Math.round(ticker.FPS)} к/с · уровень ${progression.level}` +
        ` · сеть ${net.state} ${net.caught.length}/${net.netParams.capacity} · предметов ${world.items.length}`,
    );
  });

  window.__game = {
    ready: true,
    version: VERSION,
    build: BUILD,
    layout: () => stage.layout,
    world: () => {
      const byRole = Object.fromEntries(ROLES.map((r) => [r, 0])) as Record<Role, number>;
      for (const it of world.items) byRole[it.role]++;
      return {
        timeMs: world.timeMs,
        items: world.items.length,
        spawned: world.spawned,
        seeded: world.seeded,
        level: world.level,
        location: LOCATION,
        byRole,
      };
    },
    setLevel,
    state: () => ({
      level: progression.level,
      xp: progression.xp,
      xpToNext: progression.xpToNext(),
      net: {
        state: net.state, x: net.x, y: net.y, caught: net.caught.length,
        capacity: net.netParams.capacity, range: net.netParams.range,
      },
      stats: { ...stats },
      sailor: { gx: sailor.gx, gy: sailor.gy, x: sailor.x, y: sailor.y },
      window: game.window && { level: game.window.level, cards: game.window.cards.map((c) => ({ ...c })) },
      build: game.build && { card: game.build.card, candidates: raft.candidates() },
      raft: raft.cells.map((c) => ({ ...c })),
      walkHint: game.walkHint,
    }),
    command: {
      throwTo: (x, y) => game.throwTo(x, y),
      setPull: (on) => game.setPull(on),
      takeCard: (i) => game.takeCard(i),
      placeCell: (gx, gy) => game.placeCell(gx, gy),
      walk: (dx, dy) => game.walk(dx, dy),
    },
    debugLevelUp: () => game.debugLevelUp(),
    cellToScreen: (gx, gy) => worldToScreen(gx * cellPx, gy * cellPx, window.innerWidth, window.innerHeight, stage.layout),
    items: () => world.items.map(({ id, kind, role, x, y, radius }) => ({ id, kind, role, x, y, radius })),
    toScreen: (x, y) => worldToScreen(x, y, window.innerWidth, window.innerHeight, stage.layout),
    platformLog: () => platform.log.slice(),
  };
  platform.loadingFinished();
  window.addEventListener('pointerdown', () => control.notePlay());
}

boot().catch((err: unknown) => {
  console.error('boot failed', err);
});
