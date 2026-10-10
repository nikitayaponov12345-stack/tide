import { describe, expect, it } from 'vitest';
import { STEP_MS } from '../../src/core/clock';
import { Game } from '../../src/core/game';
import { DATA } from '../../src/data';

const CFG = { halfW: 640, halfH: 360, speedMult: 1, locationId: 'lagoon', seed: 1 };
const LOC = DATA.location(CFG.locationId);
const TIER = DATA.sailorTier(LOC.order);
const MEDIUM = DATA.flowItems(CFG.locationId).find((it) => it.role === 'medium')!;
const LOOT = DATA.item(DATA.enemies.find((e) => e.id === LOC.enemyId)!.loot_item!);
const SPEAR_CARD = DATA.cards.find((c) => c.stat === 'spear_damage')!;
const MAX_STEPS = 20_000;

function run(g: Game, cond: () => boolean): void {
  for (let i = 0; cond(); i++) {
    if (i >= MAX_STEPS) throw new Error('run: предел шагов');
    g.step(STEP_MS);
  }
}

/** Игра с пустой водой: только то, что положит тест (поток появляется за краем и до плота за тест не доплывает). */
function calm(): Game {
  const g = new Game(DATA, CFG);
  g.world.items.length = 0;
  return g;
}

/** Бросок сети в точку и тяга до возврата. */
function netCatch(g: Game, x: number, y: number): void {
  expect(g.throwTo(x, y)).toBe(true);
  run(g, () => g.net.state === 'flying');
  g.setPull(true);
  run(g, () => g.net.state !== 'ready');
  g.setPull(false);
}

describe('Game: слоты оружия', () => {
  it('setWeapon(spear) без копья — false; debugSpawnEnemy даёт копьё', () => {
    const g = calm();
    expect(g.spearOwned).toBe(false);
    expect(g.setWeapon('spear')).toBe(false);
    expect(g.weapon).toBe('net');
    g.debugSpawnEnemy(150, 0);
    expect(g.spearOwned).toBe(true);
    expect(g.enemies.list.length).toBe(1);
    expect(g.setWeapon('spear')).toBe(true);
    expect(g.weapon).toBe('spear');
  });

  it('со слотом копья throwTo бросает копьё, сеть остаётся ready; canThrow — по выбранному оружию', () => {
    const g = calm();
    g.debugSpawnEnemy(150, 0);
    g.setWeapon('spear');
    expect(g.canThrow()).toBe(true);
    expect(g.throwTo(100, 0)).toBe(true);
    expect(g.spear.state).toBe('flying');
    expect(g.net.state).toBe('ready');
    expect(g.stats.spearThrows).toBe(1);
    expect(g.stats.throws).toBe(0);
    expect(g.canThrow()).toBe(false);
    expect(g.throwTo(100, 0)).toBe(false);
    g.setWeapon('net');
    expect(g.canThrow()).toBe(true);
    g.debugLevelUp();   // пауза
    expect(g.canThrow()).toBe(false);
    expect(g.throwTo(100, 0)).toBe(false);
  });

  it('удержание со слотом копья сеть не тянет; переключение на сеть при удержании — тянет, обратно — перестаёт', () => {
    const g = calm();
    g.debugSpawnEnemy(300, 300);
    g.throwTo(150, 0);
    run(g, () => g.net.state === 'flying');
    expect(g.net.state).toBe('lying');
    g.setWeapon('spear');
    g.setPull(true);
    expect(g.net.state).toBe('lying');
    g.setWeapon('net');
    expect(g.net.state).toBe('pulling');
    g.setWeapon('spear');
    expect(g.net.state).toBe('lying');
    g.setWeapon('net');
    g.setPull(false);
    expect(g.net.state).toBe('lying');
  });

  it('карточка «Копьё сильнее» — только после появления копья и даёт урон по таблице', () => {
    const offered = (g: Game, levels: number, take: boolean): boolean => {
      for (let i = 0; i < levels; i++) {
        g.debugLevelUp();
        while (g.window || g.build) {
          if (g.build) {
            const c = g.buildSpots()[0]!;
            g.placeCell(c.gx, c.gy);
            continue;
          }
          const at = g.window!.cards.findIndex((c) => c.id === SPEAR_CARD.id);
          if (at >= 0) {
            if (take) g.takeCard(at);
            return true;
          }
          g.takeCard(0);
        }
      }
      return false;
    };
    expect(offered(calm(), 30, false)).toBe(false);
    const g = calm();
    g.debugSpawnEnemy(300, 300);
    expect(offered(g, 30, true)).toBe(true);
    expect(g.spear.damage).toBe(TIER.spearDamage + SPEAR_CARD.value!);
  });

  it('копьё бьёт на всю дальность сети: «Бросок дальше» растит и её', () => {
    const g = calm();
    const card = DATA.cards.find((c) => c.stat === 'throw_range')!;
    g.window = { level: 5, cards: [{ id: card.id, available: true, reason: null }] };
    g.takeCard(0);
    expect(g.spear.range).toBe(g.net.netParams.range);
    expect(g.spear.range).toBe(TIER.throwRange + card.value!);
  });
});

describe('Game: первый враг', () => {
  it('бочонок, пойманный сетью при двух клетках, приводит первого краба', () => {
    for (const cells of [1, 2]) {
      const g = calm();
      if (cells === 2) g.raft.add(1, 0);
      g.world.addLoot(MEDIUM.id, -120, 0, 0, 0);
      netCatch(g, -120, 0);
      expect(g.mediumCaught).toBe(true);
      expect(g.enemies.spawned, `клеток ${cells}`).toBe(cells === 2 ? 1 : 0);
      expect(g.spearOwned).toBe(cells === 2);
      expect(g.weapon).toBe('net');
    }
  });
});

describe('Game: копьё по крабу', () => {
  it('на паузе крабы и копьё стоят', () => {
    const g = calm();
    g.debugSpawnEnemy(300, 0);
    g.setWeapon('spear');
    g.throwTo(-150, 0);
    g.step(STEP_MS);
    g.debugLevelUp();
    expect(g.paused).toBe(true);
    const crab = { ...g.enemies.list[0]! };
    const spear = [g.spear.x, g.spear.y, g.spear.state];
    for (let i = 0; i < 60; i++) g.step(STEP_MS);
    expect(g.enemies.list[0]).toEqual(crab);
    expect([g.spear.x, g.spear.y, g.spear.state]).toEqual(spear);
  });

  it('spearHits — один за бросок, даже если задеты два краба; добычу ловит сеть, опыт за клешню — по items.csv', () => {
    const g = calm();
    g.setLevel(10);   // опыт клешней не доводит до нового уровня: окно не встанет посреди проверки
    g.debugSpawnEnemy(100, 0);
    g.debugSpawnEnemy(110, 10);
    g.setWeapon('spear');
    g.throwTo(100, 0);
    run(g, () => g.spear.state !== 'ready');
    expect(g.stats.spearThrows).toBe(1);
    expect(g.stats.spearHits).toBe(1);
    expect(g.stats.lootDropped).toBe(2 * TIER.spearDamage);
    const loot = g.world.items.filter((it) => it.role === 'loot');
    expect(loot.length).toBe(g.stats.lootDropped);

    g.setWeapon('net');
    const it = loot[0]!;
    const xp = g.stats.xpGained;
    const caughtBefore = g.stats.itemsCaught;
    g.throwTo(it.x, it.y);
    run(g, () => g.net.state === 'flying');
    expect(g.net.caught.map((c) => c.kind)).toContain(LOOT.id);
    g.setPull(true);
    run(g, () => g.net.state !== 'ready');
    const claws = g.stats.itemsCaught - caughtBefore;
    expect(claws).toBeGreaterThan(0);
    run(g, () => g.progression.icons.length > 0);
    expect(g.paused).toBe(false);
    expect(g.stats.xpGained - xp).toBe(claws * LOOT.xp * LOC.xpMult);
  });
});
