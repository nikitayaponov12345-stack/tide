import './debug';
import { FixedStep } from './core/clock';
import { ROLES, type Role } from './core/data/tables';
import { Rng } from './core/rng';
import { World } from './core/world';
import { DATA } from './data';
import { DESIGN, fitDesign, type Layout } from './game/layout';
import { Stage } from './game/stage';
import { View } from './game/view';
import { StubPlatform } from './platform/stub';
import { Overlay } from './ui/overlay';

const VERSION = '0.0.2';
const LOCATION = 'lagoon';
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

  const stage = new Stage();
  await stage.init(document.getElementById('game')!);

  const world = new World({ ...worldSize(stage.layout), locationId: LOCATION, level: 1 }, DATA, new Rng(1));
  const view = new View(stage.root, { waterColor: DATA.location(LOCATION).waterColor, cellPx: DATA.num('cell_px') });
  view.build(stage.layout);
  stage.onLayout = (layout) => {
    const s = worldSize(layout);
    world.resize(s.halfW, s.halfH, s.speedMult);
    view.build(layout);
  };

  const setLevel = (n: number): void => world.setLevel(Math.max(1, Math.round(n)));
  const debug = import.meta.env.DEV || new URLSearchParams(location.search).get('debug') === '1';
  if (debug) {
    // По e.code: в русской раскладке e.key у этих клавиш — «ъ» и «х».
    window.addEventListener('keydown', (e) => {
      if (e.code === 'BracketRight') setLevel(Math.min(DEBUG_MAX_LEVEL, world.level + 1));
      else if (e.code === 'BracketLeft') setLevel(world.level - 1);
    });
  }

  const overlay = new Overlay(document.getElementById('ui')!);
  const clock = new FixedStep();
  stage.app.ticker.add((ticker) => {
    clock.advance(ticker.deltaMS, (dt) => world.step(dt));
    view.sync(world);
    overlay.update(
      performance.now(),
      `Прилив ${VERSION} · ${stage.layout} · ${Math.round(ticker.FPS)} к/с · уровень ${world.level} · предметов ${world.items.length}`,
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
    items: () => world.items.map(({ id, kind, role, x, y, radius }) => ({ id, kind, role, x, y, radius })),
    toScreen: (x, y) => {
      const d = DESIGN[stage.layout];
      const f = fitDesign(window.innerWidth, window.innerHeight, stage.layout);
      return { x: f.x + (x + d.w / 2) * f.scale, y: f.y + (y + d.h / 2) * f.scale };
    },
    platformLog: () => platform.log.slice(),
  };
  platform.loadingFinished();
  window.addEventListener('pointerdown', () => platform.gameplayStart(), { once: true });
}

boot().catch((err: unknown) => {
  console.error('boot failed', err);
});
