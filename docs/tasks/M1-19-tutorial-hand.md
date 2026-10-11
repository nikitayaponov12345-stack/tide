# M1-19 — обучение без текста, часть 1: рука

**Цель.** Из GDD («Интерфейс», «Обучение без текста»): стрелки и рука по цепочке «одно запускает следующее». В этой задаче — рука на первых четырёх шагах: первый бросок, тяга упавшей сети, первая карточка (и «Взять»), первая клетка. Первый краб, ремонт, шторм и визит — в M1-20.

Как понято (толкование Claude, Никита может поправить):
- рука — кружок с белой рамкой и пульсом поверх всего (заготовка до арта, M4). Она не перехватывает нажатия, текста нет;
- шаги по порядку, каждый — один раз за партию:
  - «бросок» — пока не было ни одного броска сети. Рука на ближайшем к моряку предмете в круге дальности, а если там пусто — на воде под моряком на половине дальности. Жест «нажми»;
  - «тяга» — после первого броска, пока сеть ни разу не тянули. Рука на упавшей сети, жест «нажми и держи»;
  - «карточка» — в окне выбора, пока не взято ни одной карточки. Рука на первой доступной карточке, после выбора — на «Взять»;
  - «клетка» — в стройке «Плота», пока у плота одна клетка. Рука на первом месте для клетки; на телефоне после выбора места — на «Поставить»;
- шаг считается по состоянию игры: броски, взятые карточки и клетки уже есть в записи. Свой флаг нужен только тяге — по итогам её не видно;
- обучение идёт в новой партии первой локации. Партия, продолженная из записи до M1-19, — без обучения: игрок её уже начал. В следующих локациях — «одна строка о новинке» (GDD), это M2;
- на паузе, в рекламе и в окне «Локация пройдена» руки нет;
- подсказка о ходьбе (M0-07) остаётся как есть.

**Что изменится в игре.**
- В новой партии — пульсирующий кружок у ближайшего предмета, после броска — на сети, в первом окне — на карточке и «Взять», в первой стройке — на месте клетки.
- Версия — 0.0.26: в `main.ts`, `package.json` и в двух полях `version` в `package-lock.json`.

Условие: M1-18 сделана. Перед началом прочитай:
- `CLAUDE.md`;
- в `docs/GDD.md` — «Интерфейс» (абзац «Обучение без текста») и «Моряк и сеть»;
- файлы:
  - `src/core/game.ts`, `src/core/game-snapshot.ts`, `src/core/net.ts` (состояния сети и `setPull`), `src/core/deck.ts` (`takenTotal`);
  - `src/ui/hint.ts` (образец подсказки), `src/ui/cards.ts`, `src/ui/place.ts`, `src/game/layout.ts` (`worldToScreen`), `index.html`, `src/main.ts`, `src/debug.ts`;
- тесты `tests/unit/walk.test.ts`, `tests/e2e/walk.spec.ts`, `tests/e2e/cards.spec.ts`.

**Концы строк.** У части файлов концы строк CRLF: `game.ts`, `main.ts`, `debug.ts`, `index.html`. Сохраняй их, иначе `git diff` покажет файл целиком. У `game-snapshot.ts`, `package.json` и `package-lock.json` — LF. Новые файлы — LF.

**Проверка до передачи (11.10).** Задачу собрал прототипом Claude на коде, где сделана M1-18 (прототипы M1-16…M1-18 на снимке твоего кода после M1-15):
- `npm run check` зелёный: Vitest — 349 тестов (5 новых), Playwright — 70 сценариев и 6 пропусков (4 новых прогона);
- `npm run sim` — те же числа, что после M1-18: в `GameConfig` обучение по умолчанию выключено, бот и прочие тесты его не видят.

## 1. Ядро — `src/core/tutorial.ts` (новый)

```ts
import type { Game } from './game';

/** Шаг обучения, который показывает рука (M1-19): бросок сети, тяга, карточка в окне, клетка в стройке. */
export type TutorialStep = 'throw' | 'pull' | 'card' | 'cell';
export interface TutorialSnapshot { enabled: boolean; pulled: boolean }

/** Карточка, со стройки которой рука показывает место клетки. */
const RAFT_CARD = 'raft';

/**
 * Обучение без текста (M1-19, GDD «Интерфейс»): рука показывает, что сделать, по цепочке «одно запускает следующее» —
 * первый бросок, тяга упавшей сети, первая карточка, первая клетка. Шаг считается по состоянию игры: пройденное видно
 * по счётчикам, колоде и плоту; свой флаг — только у тяги (по итогам её не видно). Ядро только отвечает, какой шаг
 * сейчас; руку рисует ui/tutorial.ts. Партия без обучения (выключено в GameConfig или запись до M1-19) шагов не даёт.
 */
export class Tutorial {
  /** Моряк хоть раз тянул сеть. */
  pulled = false;

  constructor(public enabled: boolean) {}

  /** После команды тяги: сеть тянется — тяга пройдена. */
  notePull(pulling: boolean): void {
    if (pulling) this.pulled = true;
  }

  /**
   * Шаг сейчас; null — руки нет. Окно выбора — «карточка», пока ни одной не взято; стройка «Плота» — «клетка», пока
   * клетка одна; иначе на паузе руки нет. Ни одного броска — «бросок», когда сеть у моряка и выбрана; сеть ни разу не
   * тянули — «тяга», когда она лежит на воде.
   */
  step(g: Game): TutorialStep | null {
    if (!this.enabled) return null;
    if (g.window) return g.deck.takenTotal() === 0 ? 'card' : null;
    if (g.build) return g.build.card === RAFT_CARD && g.raft.cells.length < 2 ? 'cell' : null;
    if (g.paused) return null;
    if (g.stats.throws === 0) return g.weapon === 'net' && g.net.state === 'ready' ? 'throw' : null;
    if (!this.pulled) return g.net.state === 'lying' ? 'pull' : null;
    return null;
  }

  snapshot(): TutorialSnapshot {
    return { enabled: this.enabled, pulled: this.pulled };
  }

  restore(s: TutorialSnapshot): void {
    this.enabled = s.enabled;
    this.pulled = s.pulled;
  }
}
```

## 2. Игра и запись — `game.ts`, `game-snapshot.ts`

- `src/core/game.ts`:
  - `GameConfig` — поле `tutorial?: boolean`, комментарий: «rewarded — есть реклама за награду (нет поля — есть); whirlpoolUnlocked — воронка открыта в кампании, tutorial — обучение (M1-19); нет поля — нет»;
  - импорт `import { Tutorial } from './tutorial';`, поле после `stats`: `readonly tutorial: Tutorial;` с комментарием «Обучение (M1-19): какой шаг показывает рука»; в конструкторе — `this.tutorial = new Tutorial(cfg.tutorial ?? false);`;
  - `setPull` последней строкой — `this.tutorial.notePull(this.net.state === 'pulling');`. Так засчитывается и тяга, начатая в полёте: сеть упала — тянется — следующее нажатие засчитает.
  В прототипе `game.ts` — 382 строки.
- `src/core/game-snapshot.ts`:
  - импорт `type TutorialSnapshot`; в `GameSnapshot` последним — `tutorial?: TutorialSnapshot` с комментарием «Обучение (с M1-19); нет поля — запись до обучения: партия без него»;
  - в `snapshotGame` — `tutorial: g.tutorial.snapshot()`;
  - в `restoreGame` — `g.tutorial.restore(s.tutorial ?? { enabled: false, pulled: false });`. Запись до M1-19 выключает обучение, даже если `cfg.tutorial` включён.

## 3. Рука — `src/ui/tutorial.ts` (новый), `index.html`

```ts
import type { Game } from '../core/game';
import type { TutorialStep } from '../core/tutorial';
import { worldToScreen, type Layout } from '../game/layout';

/** Как рука показывает шаг: нажать или нажать и держать. */
const GESTURE: Record<TutorialStep, 'tap' | 'hold'> = { throw: 'tap', pull: 'hold', card: 'tap', cell: 'tap' };

/**
 * Рука обучения (M1-19): кружок с пульсом поверх всего, нажатия не перехватывает (заготовка до арта, M4). Шаг даёт
 * game.tutorial.step, место — здесь: бросок — ближайший к моряку предмет в круге дальности (нет — вода под моряком на
 * полдальности), тяга — сеть, карточка — первая доступная, а после выбора — «Взять», клетка — первое место стройки,
 * а на телефоне после выбора места — «Поставить». Кнопки ищет в host по data-testid.
 */
export class TutorialHand {
  private readonly el = document.createElement('div');

  constructor(
    private readonly host: HTMLElement,
    private readonly game: Game,
    private readonly cellPx: number,
  ) {
    this.el.className = 'tutorial-hand';
    this.el.dataset.testid = 'tutorial-hand';
    this.el.hidden = true;
    host.append(this.el);
  }

  update(layout: Layout): void {
    const step = this.game.tutorial.step(this.game);
    const at = step === null ? null : this.target(step, layout);
    this.el.hidden = at === null;
    if (step === null || at === null) return;
    if (this.el.dataset.step !== step) {
      this.el.dataset.step = step;
      this.el.className = `tutorial-hand ${GESTURE[step]}`;
    }
    Object.assign(this.el.style, { left: `${at.x}px`, top: `${at.y}px` });
  }

  /** Точка руки в координатах окна; цели нет — null. */
  private target(step: TutorialStep, layout: Layout): { x: number; y: number } | null {
    const g = this.game;
    const screen = (x: number, y: number) => worldToScreen(x, y, window.innerWidth, window.innerHeight, layout);
    switch (step) {
      case 'throw': {
        const s = g.sailor;
        const range = g.net.netParams.range;
        let best: { x: number; y: number } | null = null;
        let bestD = range;
        for (const it of g.world.items) {
          const d = Math.hypot(it.x - s.x, it.y - s.y);
          if (d <= bestD) {
            bestD = d;
            best = it;
          }
        }
        return best ? screen(best.x, best.y) : screen(s.x, s.y + range / 2);
      }
      case 'pull':
        return screen(g.net.x, g.net.y);
      case 'card':
        return this.center('[data-testid="take"]') ?? this.center('[data-testid="card"]:not(.unavailable)');
      case 'cell': {
        const place = this.center('[data-testid="place"]');
        if (place) return place;
        const c = g.raft.candidates()[0];
        return c ? screen(c.gx * this.cellPx, c.gy * this.cellPx) : null;
      }
    }
  }

  /** Середина видимой кнопки по селектору; нет или скрыта — null. */
  private center(selector: string): { x: number; y: number } | null {
    const el = this.host.querySelector<HTMLElement>(selector);
    if (!el || el.hidden || el.getClientRects().length === 0) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
}
```

`index.html` — перед `</style>`:
```css
/* Рука обучения (M1-19): кружок с пульсом поверх всего, нажатия проходят сквозь (заготовка до арта). */
#ui .tutorial-hand {
  position: absolute;
  z-index: 30;
  box-sizing: border-box;
  width: 64px;
  height: 64px;
  margin: -32px 0 0 -32px;
  border: 4px solid #fff;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.25);
  box-shadow: 0 0 12px rgba(0, 0, 0, 0.6);
}
#ui .tutorial-hand.tap {
  animation: tutorial-tap 1s ease-in-out infinite;
}
#ui .tutorial-hand.hold {
  animation: tutorial-hold 1.6s ease-in-out infinite;
}
@keyframes tutorial-tap {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(0.7); }
}
@keyframes tutorial-hold {
  0%, 100% { transform: scale(1); background: rgba(255, 255, 255, 0.15); }
  30%, 80% { transform: scale(0.7); background: rgba(255, 255, 255, 0.6); }
}
```
`box-sizing: border-box` обязателен: без него середина кружка сдвинута на толщину рамки (в прототипе тест ловил 5,7 px).

## 4. `main.ts`, `debug.ts`

- `src/main.ts`:
  - `VERSION = '0.0.26'`;
  - в `cfg` — `tutorial: DATA.location(LOCATION).order === 1` с комментарием «Обучение (M1-19) — в новой партии первой локации; у продолженной — из записи»;
  - `const tutorial = new TutorialHand(ui, game, cellPx);` — сразу после `WeaponSlots`, с комментарием «Рука обучения — последней: поверх всех кнопок и окон»;
  - в кадре — `tutorial.update(stage.layout);` после `boostOffer.update`;
  - в `state()` после `chestDoubled` — `tutorial: game.tutorial.step(game)`.
- `src/debug.ts` — импорт `type TutorialStep`, в `state` поле `tutorial: TutorialStep | null` («Шаг обучения, который показывает рука (M1-19); руки нет — null»).
- `package.json` и `package-lock.json` (два поля `version`) — 0.0.26.

## 5. Тесты

- `tests/unit/tutorial.test.ts` (новый), `CFG` с `tutorial: true`:
  - без обучения (`tutorial: false` и без поля) — шагов нет;
  - новая партия: `throw`; пауза — `null`; бросок `(0, 200)` — пока летит, `null`; упала (`lying`) — `pull`; `setPull(true)` — `pulling`, `pulled`, `null`; отпустил — `null`;
  - тяга, нажатая в полёте: `pulled` — `false`, пока сеть не упала; упала и тянется, следующий `setPull(true)` — `pulled`;
  - `debugLevelUp` — окно 2-го уровня, `card`; взял — стройка «Плота», `cell`; поставил — `throw`; `g.build = { card: 'raft' }` при двух клетках — `null`; следующее окно — `null`;
  - снимок через JSON после тяги — `enabled` и `pulled`; снимок до тяги — снова `pull`; без поля `tutorial` (до M1-19) — `enabled: false`, шагов нет.
- `tests/e2e/tutorial.spec.ts` (новый), оба проекта, `locale: 'ru-RU'`, `test.setTimeout(90_000)`; помощник `handAt(step, точка)`: рука видна, `data-step` — шаг, середина рамки рукой — в 3 px от точки (`expect.poll`):
  - «бросок, тяга упавшей сети»: `/?new=1` — `throw`, рука внутри окна; снимок `build/shots/m1-19_throw_<проект>.png`; нажатие по воде в `(0, 160)` — `expect.poll` до `lying`, рука на сети (`toScreen` сети), класс `hold`; тяга (ПК — `mouse.down`, телефон — `command.setPull(true)`: у касаний Playwright нет удержания) — руки нет; отпустил — руки нет;
  - «первая карточка, «Взять» и первая клетка»: `debugLevelUp` — рука на первой карточке; снимок `m1-19_card_<проект>.png`; пауза 400 мс, нажатие на карточку — рука на «Взять»; «Взять» — рука на первом месте стройки (`cellToScreen`); нажатие туда — на ПК клетка поставлена, на телефоне рука на «Поставить», нажатие — поставлена; дальше `throw`; новое окно — руки нет; ошибок в консоли нет.

## Проверка поломками

Все поломки ловит Vitest (`tutorial.test.ts`). Внеси по одной, убедись, что падает свой тест, и верни код:
1. шаги и без обучения (в `step` нет `!this.enabled`);
2. рука на паузе (нет `if (g.paused) return null`);
3. тяга не засчитывается (`notePull` ничего не делает);
4. рука в каждом окне (`'card'` без `takenTotal() === 0`);
5. запись до M1-19 оставляет обучение из `cfg` (`if (s.tutorial) g.tutorial.restore(s.tutorial)`).

При отладке гоняй один файл тестов. Полный `npm run check` — в конце.

## Критерии готовности
- `npm run check` зелёный; прочие сценарии Playwright не меняются: рука не перехватывает нажатия.
- `npm run sim` — как после M1-18.
- Все 5 поломок пойманы. Поломки, которые видит только Playwright, Claude проверит ночью.
- На снимках `m1-19_throw_*` рука на предмете в круге дальности, на `m1-19_card_*` — на карточке поверх затемнения.
- `docs/tasks/README.md`: в строке M1-19 — «сделано ДД.ММ».

## Чего не делать
- Не делать шаги первого краба, ремонта, шторма и визита (M1-20) и строку о новинке следующих локаций (M2).
- Не менять подсказку о ходьбе и правила сети, окна и стройки.
- Документы в `docs/`, кроме `docs/tasks/README.md`, не править: их ведёт Claude.
- Не коммитить и не пушить; `git stash`, `git reset` и `git checkout` не нужны (правило в `CLAUDE.md`).
