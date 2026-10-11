# M1-18 — «Новые карточки» за рекламу

**Цель.** Из GDD («Монетизация», таблица рекламы за награду): «Обновить карточки — три новые карточки — раз за окно, когда в локации взято 8 карточек». В окне выбора появляется кнопка «Новые карточки за рекламу». Досмотрел — в том же окне другие карточки.

Как понято (толкование Claude, Никита может поправить):
- кнопка есть, когда у площадки есть реклама за награду, в локации взято не меньше 8 карточек (`refresh_after_cards`) и это окно ещё не обновляли. У оригинала то же — «Обновить награды», в каждом окне после 12 взятых карточек;
- новые карточки — из тех, которых в окне не было, по тем же весам, что и обычное окно. Принудительных карточек нет: окно их уже показало. «Плот» при нехватке свободных клеток остаётся, как в обычном окне, даже если он уже был;
- среди новых всегда есть карточка, которую можно взять: если по весам выпали только затемнённые, последнюю заменяет доступная. Если новых доступных карточек нет совсем, кнопки нет;
- обновлять окно можно один раз. Обновлённое окно переживает перезагрузку (в записи `window.refreshed`);
- без рекламы за награду кнопки нет;
- окно выбора и так останавливает игру, поэтому сигналов площадке вокруг рекламы нет. Окно остаётся тем же объектом, меняются только карточки, иначе `Control` прислал бы «игра идёт» и «игра остановлена»;
- реклама из окна — одна за раз: воронка и «Новые карточки» делят защиту от двойного нажатия в `main.ts`;
- чтобы `game.ts` не перерос 400 строк, улов шага (сеть, башни, воронки и `addCatch`) переезжает в новый файл `src/core/game-catch.ts`. Порядок шага и броски Rng не меняются: все тесты и `sim` дают те же числа.

**Что изменится в игре.**
- С 9-го окна выбора (взято 8 карточек) — оранжевая кнопка «Новые карточки за рекламу» (англ. «New cards with ad») по центру под карточками.
- Версия — 0.0.25: в `main.ts`, `package.json` и в двух полях `version` в `package-lock.json`.

Условие: M1-17 сделана. Перед началом прочитай:
- `CLAUDE.md`;
- в `docs/GDD.md` — «Монетизация» (реклама за награду) и «Окно выбора и колода»;
- файлы:
  - `src/core/deck.ts`, `src/core/game-cards.ts`, `src/core/game.ts`, `src/core/game-snapshot.ts`, `src/game/input/control.ts` (`frame` и `rewarded`);
  - `src/ui/cards.ts`, `index.html` (стили `#ui .card-unlock`), `src/main.ts`, `src/debug.ts`;
  - `tools/data-check.mjs`;
- таблицы: `data/ads.csv` (строка `refresh_cards`), в `data/constants.csv` — `refresh_after_cards`, `translations/strings.csv`;
- тесты `tests/unit/deck.test.ts`, `tests/unit/whirlpool-unlock.test.ts`, `tests/e2e/whirlpool-unlock.spec.ts`, `tests/e2e/buildings.spec.ts`.

**Концы строк.** У части файлов концы строк CRLF: `game.ts`, `cards.ts`, `main.ts`, `debug.ts`, `index.html`, `tools/data-check.mjs`. Сохраняй их, иначе `git diff` покажет файл целиком. У `deck.ts`, `game-cards.ts`, `game-snapshot.ts`, `strings.csv`, `package.json` и `package-lock.json` — LF. Новые файлы — LF.

**Проверка до передачи (11.10).** Задачу собрал прототипом Claude на коде, где сделана M1-17 (прототипы M1-16 и M1-17 на снимке твоего кода после M1-15):
- `npm run check` зелёный: Vitest — 344 теста (8 новых), Playwright — 66 сценариев и 6 пропусков (4 новых прогона);
- `npm run sim`: ворота, кривая и финальный бой — те же числа, что после M1-17 (бот кнопку не нажимает): 10-й уровень — 4,8 мин (5,6), 20-й — 9,3 (11,3), 40-й — 18,7 (22,4), бой — медиана 46 с.

## 1. Данные и тексты

- `translations/strings.csv` — строка `ui.refresh_cards,Новые карточки за рекламу,New cards with ad` перед `ui.repair` (по алфавиту).
- `tools/data-check.mjs` — после проверки места `double_chest`:
  ```js
  const refreshCards = T.ads.find((r) => r.place === 'refresh_cards');
  if (!refreshCards || refreshCards.kind !== 'rewarded') err('data/ads.csv: нет места refresh_cards вида rewarded — «Новые карточки» (M1-18)');
  if (!(Number.isInteger(C.refresh_after_cards) && C.refresh_after_cards >= 1)) err('data/constants.csv: refresh_after_cards — целое не меньше 1');
  ```
- `data/ads.csv` и `data/constants.csv` не меняются: строка и число там уже есть.

## 2. Улов шага — `game-catch.ts` (новый), `game.ts`

**`src/core/game-catch.ts`** (новый, LF) — то, что сейчас в `Game.step` между `this.world.step(dtMs)` и копьём, и `Game.addCatch`, без изменений правил:
```ts
import { BOTTLE_ROLE } from './boost';
import { FLOW_ROLES } from './data/tables';
import type { Game } from './game';
import type { CaughtItem } from './net';

/**
 * Улов на шаге игры (с M1-18 — в своём файле, иначе game.ts перерос бы 400 строк): сеть моряка, сетевые башни и воронки.
 * Порядок — как был в Game.step: сеть, затем башни и воронки.
 */

/** Роль предмета, улов которой (вместе со второй клеткой) приводит первого врага: в Лагуне — бочонок. */
const FIRST_ENEMY_ROLE = 'medium';

/** Улов шага: сеть моряка (со счётчиками её бросков), затем башни и воронки — опыт и значки, как у сети. */
export function stepCatch(g: Game, dtMs: number): void {
  const caught = g.net.step(dtMs, g.world);
  if (caught) {
    addCatch(g, caught);
    g.stats.itemsCaught += caught.length;
    if (caught.length === 0) g.stats.emptyThrows++;
  }
  // Улов башен и воронок — опыт и значки, как улов сети моряка (без счётчиков бросков моряка).
  const fromTowers = g.towers.step(dtMs, g.world, g.raft);
  const fromWhirlpools = g.whirlpools.step(dtMs, g.world, g.raft);
  g.stats.towerCaught += fromTowers.length;
  g.stats.whirlpoolCaught += fromWhirlpools.length;
  if (fromTowers.length + fromWhirlpools.length > 0) addCatch(g, [...fromTowers, ...fromWhirlpools]);
}

/**
 * Улов сети или башен: значки, опыт по ролям, бочонок для первого врага. Под бустом опыт потока идёт ещё и в boostFlowXp.
 * Вернулась бутылка — буст.
 */
function addCatch(g: Game, caught: CaughtItem[]): void {
  g.progression.addCatch(caught, g.world.timeMs);
  const boosted = g.boost.active;
  for (const it of caught) {
    const xp = it.xp * g.xpMult;
    g.stats.xpByRole[it.role] += xp;
    if (boosted && FLOW_ROLES.includes(it.role)) g.stats.boostFlowXp += xp;
  }
  if (caught.some((it) => it.role === FIRST_ENEMY_ROLE)) g.mediumCaught = true;
  if (caught.some((it) => it.role === BOTTLE_ROLE)) g.boost.bottleBack();
}
```
Если у тебя эти строки в `game.ts` отличаются, переноси свои.

**`src/core/game.ts`:**
- в `step` строки от `const caught = this.net.step(...)` до `if (fromTowers.length + fromWhirlpools.length > 0) this.addCatch(...)` заменить на `stepCatch(this, dtMs);`;
- `addCatch` и `FIRST_ENEMY_ROLE` убрать; в комментарии к `mediumCaught` — «роли FIRST_ENEMY_ROLE (game-catch.ts)»;
- `private readonly xpMult` → `readonly xpMult` (его читает `game-catch.ts`);
- импорты: `import { stepCatch } from './game-catch';`; `BOTTLE_ROLE`, `FLOW_ROLES` и `type CaughtItem` больше не нужны (`import { Boost } from './boost'`, `import type { CardKind, Tables } from './data/tables'`, `import { Net } from './net'`).

После переноса прогони Vitest целиком: числа всех тестов должны совпасть до правок M1-18. В прототипе `game.ts` после переноса — 365 строк, после всей задачи — 377.

## 3. Колода — `deck.ts`

- Поле `readonly refreshAfter: number` — `data.num('refresh_after_cards')` в конструкторе, комментарий «„Новые карточки“ за рекламу — когда в локации взято столько карточек (refresh_after_cards, M1-18)».
- После `taken`:
  ```ts
  /** Сколько карточек взято в локации, всех вместе (M1-18). */
  takenTotal(): number {
    let n = 0;
    for (const t of this.takes.values()) n += t.count;
    return n;
  }
  ```
- Выбор по весам из `offer` — в закрытый метод, `offer` зовёт его: `const picks = this.pick(pool, n);`. Броски Rng те же.
  ```ts
  /** До n карточек из pool по весам card_weight_<kind> без возвращения; выбранные уходят из pool. */
  private pick(pool: CardRow[], n: number): CardRow[] {
    const picks: CardRow[] = [];
    while (picks.length < n && pool.length > 0) {
      // ... тот же цикл, что был в offer
      picks.push(pool.splice(i, 1)[0]!);
    }
    return picks;
  }
  ```
- Новое, перед `visitCard`:
  ```ts
  /**
   * «Новые карточки» за рекламу (M1-18): окно того же уровня из карточек, которых в нём не было (old), по весам без
   * возвращения. «Плот» при нехватке свободных клеток — как в offer, даже если он был. Принудительных нет: окно их уже
   * показало. Ни одной доступной — последнюю заменяет доступная из оставшихся, по весам. Доступные — первыми.
   * Новых доступных нет (canReroll — false) — [], Rng не тронут.
   */
  reroll(level: number, ctx: DeckContext, old: readonly string[]): OfferCard[] {
    const pool = this.rerollPool(level, ctx, old);
    const ok = (c: CardRow): boolean => this.availability(c, ctx).available;
    if (!pool.some(ok)) return [];
    const picks = this.pick(pool, this.size(level));
    const raft = this.data.cards.find((c) => c.kind === 'raft');
    if (ctx.freeCells === 0 && raft && this.canOffer(raft, level, ctx) && !picks.some((c) => c.id === raft.id)) picks[picks.length - 1] = raft;
    if (!picks.some(ok)) picks[picks.length - 1] = this.pick(pool.filter(ok), 1)[0]!;
    const cards = picks.map((c) => this.availability(c, ctx));
    return [...cards.filter((c) => c.available), ...cards.filter((c) => !c.available)];
  }

  /** У окна с карточками old есть новые и среди них доступная (M1-18). */
  canReroll(level: number, ctx: DeckContext, old: readonly string[]): boolean {
    return this.rerollPool(level, ctx, old).some((c) => this.availability(c, ctx).available);
  }

  /** Карточки, которые можно предложить на уровне level и которых нет в old. */
  private rerollPool(level: number, ctx: DeckContext, old: readonly string[]): CardRow[] {
    return this.data.cards.filter((c) => !old.includes(c.id) && this.canOffer(c, level, ctx));
  }
  ```

## 4. Игра — `game-cards.ts`, `game.ts`, `game-snapshot.ts`

- `src/core/game-cards.ts` — перед `debugLevelUp`:
  ```ts
  /**
   * «Новые карточки» за рекламу (M1-18): можно, когда у площадки есть реклама за награду, открыто окно выбора и его ещё не
   * обновляли, в локации взято не меньше refresh_after_cards карточек и среди новых карточек есть доступная.
   */
  export function canRefreshCards(g: Game): boolean {
    const w = g.window;
    if (!g.rewarded || w === null || w.refreshed === true || g.deck.takenTotal() < g.deck.refreshAfter) return false;
    return g.deck.canReroll(w.level, deckContext(g), w.cards.map((c) => c.id));
  }

  /** Реклама досмотрена: в окне — новые карточки (Deck.reroll), второй раз это окно не обновить. Нельзя → false. */
  export function refreshCards(g: Game): boolean {
    if (!canRefreshCards(g)) return false;
    const w = g.window!;
    w.cards = g.deck.reroll(w.level, deckContext(g), w.cards.map((c) => c.id));
    w.refreshed = true;
    return true;
  }
  ```
  Окно — тот же объект: меняются `cards` (новый массив — окно на экране перерисуется, как после воронки) и `refreshed`.
- `src/core/game.ts`:
  - `OfferWindow` — `{ level: number; cards: OfferCard[]; refreshed?: boolean }`, в комментарии — «refreshed — „Новые карточки“ в нём уже были (M1-18); нет поля — нет»;
  - импорт из `game-cards` — ещё `canRefreshCards` и `refreshCards` (строка импорта стала длинной — в прототипе она разбита на три);
  - после `unlockWhirlpool()`:
    ```ts
    /** Кнопка «Новые карточки за рекламу» в окне выбора (M1-18): реклама за награду, окно не обновляли, взято refresh_after_cards. */
    canRefreshCards(): boolean {
      return canRefreshCards(this);
    }

    /** Реклама досмотрена: новые карточки в окне. Нельзя (canRefreshCards) → false. */
    refreshCards(): boolean {
      return refreshCards(this);
    }
    ```
- `src/core/game-snapshot.ts` — окно в снимке и из снимка с `...(w.refreshed ? { refreshed: true } : {})` (и `s.window.refreshed`): у необновлённого окна поля нет, старые снимки и записи не меняются.

## 5. Интерфейс — `cards.ts`, `index.html`, `main.ts`, `debug.ts`

- `src/ui/cards.ts`:
  - после `UNLOCK`:
    ```ts
    /**
     * «Новые карточки за рекламу» (M1-18) — по центру поля, под местом «Взять» (оно занято, даже когда «Взять» не видна):
     * сверху — низ места «Взять» + gap; ширина по раскладке. В стопке с «Открыть за рекламу» место «Взять» ниже — и кнопка ниже.
     */
    const REFRESH = { rowW: 380, stackW: 440, h: 56, gap: 12 };
    ```
  - поле `private refresh: HTMLButtonElement | null = null;`, в конструкторе последний параметр `private readonly onRefresh: () => void = () => {}` (комментарий: «onRefresh — „Новые карточки за рекламу“ (M1-18)»);
  - в `render` после кнопок «Открыть за рекламу»: `this.refresh = this.game.canRefreshCards() ? this.refreshButton(layout) : null;` и `append`;
  - в `syncEnabled` — `if (this.refresh) this.refresh.disabled = !this.ready;` (защита 300 мс, как у карточек);
  - `refreshButton(layout)`: место «Взять» — `row ? b.top + b.cardH + b.takeGap : b.top + n * b.cardH + (n - 1) * b.gap + b.takeGap + below` (`below` — как в `placeTake`), кнопка — `left = (DESIGN[layout].w − ширина) / 2`, `top = место «Взять» + b.takeH + REFRESH.gap`, класс `cards-refresh`, `data-testid="cards-refresh"`, текст `ui.refresh_cards`, по нажатию при `ready` — `onRefresh()`.
  На ПК кнопка встаёт на 656–712 точек поля 720, на телефоне с «Открыть за рекламу» — на 1220–1276 из 1280: помещается.
- `index.html` — после `#ui .card-unlock:disabled` стиль `#ui .cards-refresh` как у `.card-unlock` (оранжевый `#d97706`, белая рамка 3 px, скругление 12, 24 px, жирный, `white-space: nowrap`) и `#ui .cards-refresh:disabled { opacity: 1; }`.
- `src/main.ts`:
  - `VERSION = '0.0.25'`;
  - защита рекламы из окна — общая:
    ```ts
    // Реклама за награду из окна выбора — воронка (M1-14) или «Новые карточки» (M1-18): одна за раз.
    let rewarding = false;
    const reward = (give: () => boolean): void => {
      if (rewarding) return;
      rewarding = true;
      void control
        .rewarded(() => platform.showRewarded())
        .then((ok) => {
          if (ok && give()) saver.save();
        })
        .finally(() => (rewarding = false));
    };
    const cards = new CardWindow(
      ui,
      game,
      text,
      () => reward(() => game.unlockWhirlpool()),
      () => reward(() => game.refreshCards()),
    );
    ```
  - в `state().window` — ещё `refreshed: game.window.refreshed === true` и `canRefresh: game.canRefreshCards()`.
- `src/debug.ts` — у `window` поля `refreshed: boolean; canRefresh: boolean` с комментарием «„Новые карточки“ уже были и можно ли их сейчас (M1-18)».
- `package.json` и `package-lock.json` (два поля `version`) — 0.0.25.

## 6. Тесты

- `tests/unit/refresh-cards.test.ts` (новый):
  - `Deck` (контекст: 5 свободных клеток, `has` — всё, копьё есть, визит был):
    - `takenTotal` — сумма взятий, `refreshAfter` — из таблицы;
    - сиды 1–50, 10-й уровень, все виды: новое окно того же размера, ни одной карточки старого, первая доступна;
    - нет свободной клетки (сиды 1–30): в старом и новом окне есть «Плот», постройки затемнены с причиной `ui.need_free_cell`, доступные первыми;
    - без «Плота» (`canAddCell: false`, `has` — ничего, визита не было), старое окно — четыре улучшения моряка: при сидах 1–100 первая карточка — `spear_stronger`, доступная;
    - виды M0 без копья, старое окно — все пять карточек: `canReroll` — `false`, `reroll` — `[]`, состояние Rng колоды не изменилось;
  - `Game` (окно 10-го уровня: `deck.take('net_wider', 1)` n раз, `setLevel(9)`, `debugLevelUp`):
    - после 7 взятий — нельзя; после 8 — можно; `refreshCards` — `true`, `g.window` — тот же объект, ни одной старой карточки, `refreshed`, второй раз — нельзя; взять доступную — окно закрыто, `refreshCards` — `false`;
    - `rewarded: false` — нельзя;
    - снимок через JSON: у необновлённого окна `refreshed` нет; после обновления — те же карточки, `refreshed`, нельзя; запись до обновления — можно.
- `tests/e2e/save.spec.ts`, тест «открытое окно выбора переживает перезагрузку»: у окна в `state()` теперь ещё два поля — проверка `expect(w.window).toEqual({ level: 4, cards, refreshed: false, canRefresh: false })` с комментарием «M1-18: у окна в state() ещё refreshed и canRefresh; в начале партии окно не обновлялось и обновить его нельзя».
- `tests/e2e/refresh-cards.spec.ts` (новый), оба проекта, `locale: 'ru-RU'`, `test.setTimeout(90_000)`:
  - помощник: n окон подряд через `debugLevelUp` и `command.takeCard` (первая доступная), стройка — `command.placeCell` на первое место из `state().build.candidates`; затем ещё одно окно;
  - «после 8 карточек — кнопка, реклама, новые карточки, перезагрузка помнит»: после 7 взятых кнопки нет; после 8-й — `cards-refresh` видна, текст «Новые карточки за рекламу», `state().window.canRefresh`; снимок `build/shots/m1-18_refresh_<проект>.png`; пауза 400 мс (защита окна), нажатие — `expect.poll` на `refreshed`, новых карточек нет среди старых (кроме «Плота»), кнопки нет, карточек на экране столько же, сколько в окне, последний вызов площадки — `rewarded`; перезагрузка — окно с теми же новыми карточками, кнопки нет; ошибок в консоли нет;
  - «без рекламы за награду кнопки нет»: `/?new=1&rewarded=0`, 8 карточек и окно — `cards-refresh` нет.

## Проверка поломками

Все поломки ловит Vitest (`refresh-cards.test.ts`). Внеси по одной, убедись, что падает свой тест, и верни код:
1. окно обновляется дважды (в `canRefreshCards` нет `w.refreshed === true`);
2. кнопка на взятие раньше (`refreshAfter − 1`);
3. в новом окне бывают старые карточки (в `rerollPool` нет `!old.includes(c.id)`);
4. нет замены, когда выпали только затемнённые (строка `if (!picks.some(ok)) …` убрана);
5. `refreshCards` создаёт новый объект окна (`g.window = { … }`) — падает проверка `g.window` тот же.

При отладке гоняй один файл тестов. Полный `npm run check` — в конце.

## Критерии готовности
- `npm run check` зелёный.
- `npm run sim`: ворота, кривая и финальный бой — как после M1-17 (перенос улова чисел не меняет).
- Все 5 поломок пойманы. Поломки, которые видит только Playwright, Claude проверит ночью.
- На снимках `m1-18_refresh_*` кнопка «Новые карточки за рекламу» целиком в поле, не налезает на карточки и место «Взять»; на телефоне, если в окне есть «Открыть за рекламу», — ниже неё.
- `docs/tasks/README.md`: в строке M1-18 — «сделано ДД.ММ».

## Чего не делать
- Не давать новые карточки бесплатно там, где рекламы нет, и не учить бота нажимать кнопку.
- Не менять веса колоды, принудительные карточки и правила воронки за рекламу.
- Документы в `docs/`, кроме `docs/tasks/README.md`, не править: их ведёт Claude.
- Не коммитить и не пушить; `git stash`, `git reset` и `git checkout` не нужны (правило в `CLAUDE.md`).
