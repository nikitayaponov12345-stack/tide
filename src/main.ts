import './debug';
import { ROLES, type Role } from './core/data/tables';
import { Game } from './core/game';
import { summarize } from './core/stats';
import { DATA } from './data';
import { Control, schemeFromSearch } from './game/input/control';
import { PointerInput } from './game/input/pointer';
import { SchemeD, nextScheme, type SchemeId } from './game/input/schemes';
import { DESIGN, worldToScreen, type Layout } from './game/layout';
import { Stage } from './game/stage';
import { View } from './game/view';
import { StubPlatform } from './platform/stub';
import { Hud } from './ui/hud';
import { Overlay } from './ui/overlay';
import { SummaryWindow } from './ui/summary';

const VERSION = '0.0.2';
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
  const { world, net, progression, stats } = game;
  const view = new View(stage.root, { waterColor: DATA.location(LOCATION).waterColor, cellPx: DATA.num('cell_px') });
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
  const schemeName = (id: SchemeId): string => text(`ui.scheme.${id}`);
  const schemeLabel = (id: SchemeId): string => `${text('ui.scheme')}: ${schemeName(id)}`;

  const ui = document.getElementById('ui')!;
  const hud = new Hud(ui, text);
  // Обработчики ниже вызываются только после создания control и input.
  const overlay = new Overlay(ui, { onScheme: () => control.next(), onSummary: () => control.openSummary() });
  const summaryWindow = new SummaryWindow(ui, text, lang);
  const control: Control = new Control(game, DATA, platform, {
    scheme: (s) => {
      input.setScheme(s);
      overlay.setSchemeLabel(schemeLabel(s.id));
    },
    summary: (sum) => {
      input.enabled = sum === null;
      if (sum === null) {
        summaryWindow.hide();
        return;
      }
      const id = control.scheme.id;
      summaryWindow.show(sum, {
        scheme: schemeLabel(id),
        nextLabel: schemeName(nextScheme(id)),
        onAgain: () => control.restart(),
        onNext: () => control.next(),
      });
    },
  }, schemeFromSearch(location.search));
  const input = new PointerInput(stage.app.canvas, game, control.scheme, () => stage.layout);
  overlay.setSchemeLabel(schemeLabel(control.scheme.id));

  stage.app.ticker.add((ticker) => {
    control.frame(ticker.deltaMS);
    view.sync(game, control.scheme instanceof SchemeD ? control.scheme.aim() : null);
    hud.update(game, stage.layout);
    overlay.update(
      performance.now(),
      `Прилив ${VERSION} · ${stage.layout} · ${Math.round(ticker.FPS)} к/с · схема ${control.scheme.id} · уровень ${progression.level}` +
        ` · сеть ${net.state} ${net.caught.length}/${net.netParams.capacity} · предметов ${world.items.length}` +
        ` · проба ${Math.ceil(control.trialLeftMs / 1000)} с`,
    );
  });

  window.__game = {
    ready: true,
    version: VERSION,
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
      scheme: control.scheme.id,
      trialMs: control.trialLeftMs,
    }),
    setScheme: (id) => control.restart(id),
    summary: () => summarize(stats),
    openSummary: () => control.openSummary(),
    command: {
      throwTo: (x, y, autoPullAfterMs = null) => game.throwTo(x, y, { autoPullAfterMs }),
      setPull: (on, mult) => game.setPull(on, mult),
      setFollow: (p) => game.setFollow(p),
    },
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
