import { Container, Graphics, Text } from 'pixi.js';
import type { Role } from '../core/data/tables';
import type { Game } from '../core/game';
import { isIntact } from '../core/raft';
import type { BuildCursor } from './input/build';
import { DESIGN, XP_BAR, type Layout } from './layout';

/** Цвета предметов по роли — константы отрисовки до этапа арта, не баланс. */
const ROLE_COLOR: Record<Role, number> = {
  light1: 0xe9d8a6,
  light2: 0xf4a261,
  light3: 0xc9ada7,
  medium: 0x8d6e63,
  heavy: 0xffd166,
  loot: 0xe76f51,
  boss_chest: 0xb5838d,
  bottle: 0xa8dadc,
};
const COUNTER_COLOR = { ok: 0x7bd88f, half: 0xffd166, full: 0xff6b6b };
/** Клетка по степени вида raft.stage: целая, три степени темнее, разбитая — серая. */
const RAFT_COLOR = [0xc58b4f, 0xa8743f, 0x8b5e32, 0x6e4a27, 0x8a8a8a] as const;
const GHOST_COLOR = { ok: 0x7bd88f, bad: 0xff6b6b };
/** Постройка — круг цвета карточки постройки, радиус в долях клетки; на разбитой клетке — бледная. */
const BUILDING = { color: 0x2a9d8f, radius: 0.4, stroke: { width: 2, color: 0xffffff }, brokenAlpha: 0.35 } as const;
/** Цвет постройки по id, если он не BUILDING.color. */
const BUILDING_COLOR: Readonly<Record<string, number>> = { spear_tower: 0xbc4749, whirlpool: 0x48cae4 };
/** Радиус воронки — тонкое кольцо её цвета (M1-13). */
const WHIRLPOOL_RING = { width: 1.5, color: 0x48cae4, alpha: 0.45 } as const;
/** Обводка повреждённых клеток в ремонте. */
const REPAIR_STROKE = { width: 3, color: 0xffd166 } as const;
/** Места для новой клетки в стройке — бледные. */
const CANDIDATE_ALPHA = 0.2;
const ENEMY_COLOR = 0xd62828;
/** Вожак события (M1-16) — темнее мелкого и с белой обводкой; радиус — свой, из ядра. */
const LEADER = { color: 0x8b0a0a, rim: { width: 3, color: 0xffffff, alpha: 0.8 } } as const;
/** Враг под водой (идёт к клетке и уходит) — полупрозрачный, у клетки — нет. */
const ENEMY_UNDERWATER_ALPHA = 0.45;
/** Тёмная вода в событие локации: слой поверх воды, под миром. */
const EVENT_DARK = { color: 0x000000, alpha: 0.35 } as const;
const SPEAR_COLOR = 0xf1e3c8;
/** Шхуна на визите: корпус, палуба с отступом, мачта; ядра — тёмные круги с белой обводкой. */
const SHIP = { hull: 0x4a2c17, hullRound: 24, deck: 0x7a4a2a, deckInset: 10, deckRound: 14, mast: 0xf1e3c8, mastRadius: 8 } as const;
const BALL = { color: 0x1a1a1a, radius: 7, stroke: { width: 1, color: 0xffffff } } as const;
/** Краб-великан (заготовка до арта, M4): тело, обводка; клешни — круги в долях радиуса, впереди к плоту и в стороны. */
const GIANT = { body: 0x9d0208, claw: 0xd62828, rim: { width: 3, color: 0xffffff, alpha: 0.7 }, clawRadius: 0.4, clawAhead: 0.8, clawSpread: 0.75 } as const;
/** Сеть башни: верёвка от клетки башни и круг сети. */
const TOWER_NET = { rope: { width: 1.5, color: 0x9fe3d6, alpha: 0.8 }, ring: { width: 2, color: 0x9fe3d6 } } as const;
/** Копьё копейной башни: черта от клетки башни и наконечник. */
const TOWER_SPEAR = { line: { width: 1, color: SPEAR_COLOR, alpha: 0.5 }, tip: { width: 3, color: 0xffffff }, tipLength: 14 } as const;
/** Длина наконечника копья, точки дизайна. */
const SPEAR_TIP = 18;
const LABEL_STYLE = { fontFamily: 'system-ui, sans-serif', fontSize: 16, fontWeight: '700', stroke: { color: 0x000000, width: 3 } } as const;

export interface ViewOptions {
  waterColor: string; // цвет воды локации
  cellPx: number;     // сторона клетки плота
}

/**
 * Рабочая отрисовка: вода, плот с постройками (в стройке — места для клетки и призрак, в ремонте — обводка повреждённых клеток), моряк, круг дальности, предметы и добыча, враги с прочностью,
 * шхуна с ядрами и краб-великан, сеть и копьё с верёвкой, сети башен, значки опыта.
 * Мир рисуется со сдвигом на центр поля дизайна и обрезается по полю; только читает состояние ядра.
 */
export class View {
  private readonly sea = new Graphics();
  /** Затемнение воды в событие локации (шторм). */
  private readonly dark = new Graphics();
  /** Маска мира: поле дизайна — полосы за краем поля остаются пустыми. */
  private readonly field = new Graphics();
  private readonly world = new Container();
  private readonly raft = new Graphics();
  private readonly ghost = new Graphics();
  private readonly sailor = new Graphics();
  private readonly range = new Graphics();
  private readonly items = new Graphics();
  private readonly net = new Graphics();
  private readonly spear = new Graphics();
  private readonly enemies = new Graphics();
  private readonly enemyHp = new Container();
  /** Шхуна на визите и её ядра. */
  private readonly boss = new Graphics();
  /** Краб-великан над водой. */
  private readonly finalBoss = new Graphics();
  private readonly icons = new Graphics();
  private readonly counter = new Text({ text: '', style: LABEL_STYLE });
  private iconTargetY = 0;

  constructor(
    root: Container,
    private readonly opts: ViewOptions,
  ) {
    this.counter.anchor.set(0.5, 1);
    this.world.addChild(this.raft, this.ghost, this.range, this.items, this.enemies, this.enemyHp, this.boss, this.finalBoss, this.net, this.spear, this.sailor, this.counter, this.icons);
    this.world.mask = this.field;
    this.dark.visible = false;
    root.addChild(this.sea, this.dark, this.field, this.world);
  }

  build(layout: Layout): void {
    const { w, h } = DESIGN[layout];
    this.sea.clear().rect(0, 0, w, h).fill(this.opts.waterColor);
    this.dark.clear().rect(0, 0, w, h).fill(EVENT_DARK);
    this.field.clear().rect(0, 0, w, h).fill(0xffffff);
    this.world.position.set(w / 2, h / 2);
    this.iconTargetY = -h / 2 + XP_BAR.top + XP_BAR.height / 2;
    this.sailor.clear().circle(0, 0, this.opts.cellPx / 5).fill(0x264653);
  }

  sync(game: Game, cursor: BuildCursor): void {
    const { net, world, progression, sailor, raft } = game;
    const p = net.netParams;
    this.dark.visible = game.events.active;
    this.raft.clear();
    for (const c of raft.cells) this.tile(this.raft, c.gx, c.gy).fill(RAFT_COLOR[raft.stage(c)]);
    if (game.repair) for (const c of raft.cells) if (c.hp < raft.cellHp) this.tile(this.raft, c.gx, c.gy).stroke(REPAIR_STROKE);
    const cell = this.opts.cellPx;
    for (const c of raft.cells) {
      if (c.building === null) continue;
      const alpha = isIntact(c) ? 1 : BUILDING.brokenAlpha;
      this.raft
        .circle(c.gx * cell, c.gy * cell, BUILDING.radius * cell)
        .fill({ color: BUILDING_COLOR[c.building] ?? BUILDING.color, alpha })
        .stroke({ ...BUILDING.stroke, alpha });
    }
    for (const w of game.whirlpools.list) {
      const c = raft.cell(w.gx, w.gy);
      if (c && isIntact(c)) this.raft.circle(w.gx * cell, w.gy * cell, game.whirlpools.radius).stroke(WHIRLPOOL_RING);
    }
    this.ghost.clear();
    if (game.build) {
      for (const c of game.buildSpots()) this.tile(this.raft, c.gx, c.gy).fill({ color: 0xffffff, alpha: CANDIDATE_ALPHA });
      if (cursor.shown) {
        const ok = game.canPlace(cursor.gx, cursor.gy);
        this.tile(this.ghost, cursor.gx, cursor.gy).fill({ color: ok ? GHOST_COLOR.ok : GHOST_COLOR.bad, alpha: 0.6 });
      }
    }
    this.sailor.position.set(sailor.x, sailor.y);
    this.range.clear().circle(sailor.x, sailor.y, p.range).stroke({ width: 1.5, color: 0xffffff, alpha: 0.35 });

    this.items.clear();
    for (const it of world.items) this.items.circle(it.x, it.y, it.radius).fill(ROLE_COLOR[it.role]);

    this.syncEnemies(game);
    this.syncBoss(game);
    this.syncFinalBoss(game);

    this.spear.clear();
    const sp = game.spear;
    if (sp.state !== 'ready') {
      const dx = sp.x - sailor.x;
      const dy = sp.y - sailor.y;
      const len = Math.hypot(dx, dy) || 1;
      this.spear
        .moveTo(sailor.x, sailor.y).lineTo(sp.x, sp.y).stroke({ width: 1, color: SPEAR_COLOR, alpha: 0.6 })
        .moveTo(sp.x - (dx / len) * SPEAR_TIP, sp.y - (dy / len) * SPEAR_TIP).lineTo(sp.x, sp.y).stroke({ width: 4, color: 0xffffff });
    }
    for (const t of game.spearTowers.list) {
      if (t.state !== 'flying') continue;
      const home = raft.cellCenter(t);
      const dx = t.x - home.x;
      const dy = t.y - home.y;
      const len = Math.hypot(dx, dy) || 1;
      const tip = TOWER_SPEAR.tipLength;
      this.spear
        .moveTo(home.x, home.y).lineTo(t.x, t.y).stroke(TOWER_SPEAR.line)
        .moveTo(t.x - (dx / len) * tip, t.y - (dy / len) * tip).lineTo(t.x, t.y).stroke(TOWER_SPEAR.tip);
    }

    this.net.clear();
    for (const t of game.towers.list) {
      const home = raft.cellCenter(t);
      for (const n of t.nets) {
        if (n.state === 'ready') continue;
        this.net
          .moveTo(home.x, home.y).lineTo(n.x, n.y).stroke(TOWER_NET.rope)
          .circle(n.x, n.y, game.towers.netRadius).stroke(TOWER_NET.ring);
      }
    }
    this.counter.visible = net.state !== 'ready';
    if (net.state !== 'ready') {
      const r = p.radius;
      this.net
        .moveTo(sailor.x, sailor.y).lineTo(net.x, net.y).stroke({ width: 2, color: 0xf1e3c8, alpha: 0.8 })
        .circle(net.x, net.y, r).stroke({ width: 2, color: 0xffffff })
        .moveTo(net.x - r, net.y).lineTo(net.x + r, net.y)
        .moveTo(net.x, net.y - r).lineTo(net.x, net.y + r)
        .stroke({ width: 1, color: 0xffffff, alpha: 0.7 });
      const n = net.caught.length;
      this.counter.text = `${n}/${p.capacity}`;
      this.counter.style.fill = n >= p.capacity ? COUNTER_COLOR.full : n * 2 >= p.capacity ? COUNTER_COLOR.half : COUNTER_COLOR.ok;
      this.counter.position.set(net.x, net.y - r - 4);
    }

    this.icons.clear();
    const now = world.timeMs;
    for (const icon of progression.icons) {
      if (now < icon.launchMs) continue;
      const t = Math.min(1, (now - icon.launchMs) / (icon.arriveMs - icon.launchMs));
      this.icons.circle(icon.fromX * (1 - t), icon.fromY + (this.iconTargetY - icon.fromY) * t, 6).fill(0x9be564).stroke({ width: 1, color: 0x1d3b1d });
    }
  }

  /** Враги — красные круги своего радиуса (вожак — тёмный с обводкой), под водой полупрозрачные (в событие с enemiesSurface — все целиком); число прочности над каждым. */
  private syncEnemies(game: Game): void {
    const list = game.enemies.list;
    const surface = game.events.enemiesSurface;
    this.enemies.clear();
    while (this.enemyHp.children.length < list.length) {
      const t = new Text({ text: '', style: { ...LABEL_STYLE, fill: 0xffffff } });
      t.anchor.set(0.5, 1);
      this.enemyHp.addChild(t);
    }
    this.enemyHp.children.forEach((c, i) => (c.visible = i < list.length));
    list.forEach((e, i) => {
      const alpha = surface || e.phase === 'wait' ? 1 : ENEMY_UNDERWATER_ALPHA;
      if (e.leader) {
        this.enemies.circle(e.x, e.y, e.radius).fill({ color: LEADER.color, alpha }).stroke({ ...LEADER.rim, alpha: LEADER.rim.alpha * alpha });
      } else {
        this.enemies.circle(e.x, e.y, e.radius).fill({ color: ENEMY_COLOR, alpha });
      }
      const t = this.enemyHp.children[i] as Text;
      const hp = String(e.hp);
      if (t.text !== hp) t.text = hp;
      t.alpha = alpha;
      t.position.set(e.x, e.y - e.radius - 2);
    });
  }

  /** Шхуна — корпус по hx, hy (у боковых сторон стоймя), палуба и мачта; ядра в полёте. */
  private syncBoss(game: Game): void {
    const b = game.boss;
    this.boss.clear();
    if (b.visiting) {
      const i = SHIP.deckInset;
      this.boss
        .roundRect(b.x - b.hx, b.y - b.hy, 2 * b.hx, 2 * b.hy, SHIP.hullRound).fill(SHIP.hull)
        .roundRect(b.x - b.hx + i, b.y - b.hy + i, 2 * (b.hx - i), 2 * (b.hy - i), SHIP.deckRound).fill(SHIP.deck)
        .circle(b.x, b.y, SHIP.mastRadius).fill(SHIP.mast);
    }
    for (const ball of b.balls) this.boss.circle(ball.x, ball.y, BALL.radius).fill(BALL.color).stroke(BALL.stroke);
  }

  /** Краб-великан над водой: две клешни к центру плота, поверх — тело. Под водой не рисуется. */
  private syncFinalBoss(game: Game): void {
    const b = game.finalBoss;
    this.finalBoss.clear();
    if (!b.present) return;
    const r = b.radius;
    const len = Math.hypot(b.x, b.y) || 1;
    const fx = -b.x / len;
    const fy = -b.y / len;
    for (const s of [-1, 1]) {
      const cx = b.x + fx * GIANT.clawAhead * r - fy * s * GIANT.clawSpread * r;
      const cy = b.y + fy * GIANT.clawAhead * r + fx * s * GIANT.clawSpread * r;
      this.finalBoss.circle(cx, cy, GIANT.clawRadius * r).fill(GIANT.claw).stroke(GIANT.rim);
    }
    this.finalBoss.circle(b.x, b.y, r).fill(GIANT.body).stroke(GIANT.rim);
  }

  /** Клетка сетки (gx, gy) со скруглением, в координатах мира. */
  private tile(g: Graphics, gx: number, gy: number): Graphics {
    const cell = this.opts.cellPx;
    return g.roundRect(gx * cell - cell / 2 + 2, gy * cell - cell / 2 + 2, cell - 4, cell - 4, 8);
  }
}
