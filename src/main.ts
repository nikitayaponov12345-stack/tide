import './debug';
import { FixedStep } from './core/clock';
import { Rng } from './core/rng';
import { DEFAULT_WORLD, World } from './core/world';
import { DESIGN } from './game/layout';
import { Stage } from './game/stage';
import { View } from './game/view';
import { StubPlatform } from './platform/stub';
import { Overlay } from './ui/overlay';

const VERSION = '0.0.1';

async function boot(): Promise<void> {
  const platform = new StubPlatform();
  await platform.init();

  const stage = new Stage();
  await stage.init(document.getElementById('game')!);

  const size = DESIGN[stage.layout];
  const world = new World({ ...DEFAULT_WORLD, width: size.w, height: size.h }, new Rng(1));
  const view = new View(stage.root);
  view.build(stage.layout);
  stage.onLayout = (layout) => {
    const d = DESIGN[layout];
    world.resize(d.w, d.h);
    view.build(layout);
  };

  const overlay = new Overlay(document.getElementById('ui')!);
  const clock = new FixedStep();
  stage.app.ticker.add((ticker) => {
    clock.advance(ticker.deltaMS, (dt) => world.step(dt));
    view.sync(world);
    overlay.update(
      performance.now(),
      `Прилив ${VERSION} · ${stage.layout} · ${Math.round(ticker.FPS)} к/с · предметов ${world.items.length}`,
    );
  });

  window.__game = {
    ready: true,
    version: VERSION,
    layout: () => stage.layout,
    world: () => ({ timeMs: world.timeMs, items: world.items.length, spawned: world.spawned }),
    platformLog: () => platform.log.slice(),
  };
  platform.loadingFinished();
  window.addEventListener('pointerdown', () => platform.gameplayStart(), { once: true });
}

boot().catch((err: unknown) => {
  console.error('boot failed', err);
});
