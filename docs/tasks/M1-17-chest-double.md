# M1-17 — «Сундук ×2» за рекламу

**Цель.** Из GDD («Монетизация», таблица рекламы за награду): в окне «Локация пройдена» — кнопка «Сундук ×2 за рекламу». Досмотрел рекламу — большой сундук удваивается. Заодно — замечание из отчёта M1-15: «Ждал боя» в отчёте прогона считается от уровня боя, а не от последнего отмеченного уровня.

Как понято (толкование Claude, Никита может поправить):
- кнопка — над «Играть дальше», цвета кнопок рекламы за награду (как «Открыть за рекламу» у воронки). Она есть, пока окно открыто, у площадки есть реклама за награду и сундук ещё не удвоен;
- досмотрел — опыт большого сундука приходит ещё раз так же, как при победе: в рейтинг и в полосу (она на 40-м уровне стоит полной, поэтому лишнее идёт только в рейтинг). В окне — «Большой сундук: +3248 опыта» вместо +1624, кнопка уходит;
- не досмотрел или ошибка — ничего, кнопка остаётся (правило GDD: «не досмотрел — награды нет»);
- удвоенный сундук входит в запись партии: после перезагрузки окно с удвоенным сундуком и без кнопки;
- без рекламы за награду (площадка без неё, у заглушки — `?rewarded=0`) кнопки нет. Бесплатного удвоения нет: в GDD «где рекламы нет — бесплатно» сказано только про воронку;
- окно и так останавливает игру, поэтому сигналов «игра остановлена» и «игра идёт» вокруг рекламы нет — это уже делает `Control.rewarded`;
- чтобы `game.ts` не перерос 400 строк, буст за рекламу (`takeBoostOffer`, `adDone`) переезжает в новый файл `src/core/game-rewards.ts` вместе с «Сундуком ×2». У `Game` остаются методы с теми же именами — тесты и бот не меняются.

**Что изменится в игре.**
- В окне «Локация пройдена» — оранжевая кнопка «Сундук ×2 за рекламу» (англ. «Chest ×2 with ad») над «Играть дальше».
- Версия — 0.0.24: в `main.ts`, `package.json` и в двух полях `version` в `package-lock.json`.

Условие: M1-16 сделана. Перед началом прочитай:
- `CLAUDE.md`;
- в `docs/GDD.md` — «Монетизация» (реклама за награду) и «Боссы» (финальный бой, большой сундук);
- файлы:
  - `src/core/game.ts`, `src/core/game-threats.ts`, `src/core/game-snapshot.ts`, `src/core/game-cards.ts` (`unlockWhirlpool` — образец), `src/game/input/control.ts` (`rewarded`);
  - `src/ui/cleared.ts`, `src/ui/cards.ts` (кнопка «Открыть за рекламу»), `index.html` (стили `#ui .cleared-*` и `#ui .card-unlock`), `src/main.ts`, `src/debug.ts`;
  - `src/sim/run.ts`, `src/sim/report.ts`, `tools/data-check.mjs`;
- таблицы: `data/ads.csv` (строка `double_chest`), `translations/strings.csv`;
- тесты `tests/unit/final-boss.test.ts`, `tests/e2e/final-boss.spec.ts`, `tests/e2e/whirlpool-unlock.spec.ts`.

**Концы строк.** У части файлов концы строк CRLF: `game.ts`, `main.ts`, `debug.ts`, `index.html`, `tools/data-check.mjs`. Сохраняй их, иначе `git diff` покажет файл целиком. У `game-threats.ts`, `game-snapshot.ts`, `cleared.ts`, `run.ts`, `report.ts`, `strings.csv`, `package.json` и `package-lock.json` — LF. Новые файлы — LF.

**Проверка до передачи (11.10).** Задачу собрал прототипом Claude на коде, где сделана M1-16 (прототип M1-16 на снимке твоего кода после M1-15):
- `npm run check` зелёный: Vitest — 336 тестов (4 новых), Playwright — 62 сценария и 6 пропусков (4 новых прогона);
- `npm run sim`: ворота как после M0-09 (медиана 7,67 с), кривая и финальный бой — как после M1-16 (бот рекламу в окне не смотрит: прогон кончается победой). «Ждал боя» — те же числа (медиана 0 с, худшая 29 с): уровень боя и сейчас 40-й, правка — на случай, если `level_to_clear` разойдётся с отметками отчёта.

## 1. Данные и тексты

- `translations/strings.csv` — строка `ui.chest_double,Сундук ×2 за рекламу,Chest ×2 with ad` перед `ui.choose_card` (по алфавиту).
- `tools/data-check.mjs` — после проверки места `whirlpool_unlock`:
  ```js
  const doubleChest = T.ads.find((r) => r.place === 'double_chest');
  if (!doubleChest || doubleChest.kind !== 'rewarded') err('data/ads.csv: нет места double_chest вида rewarded — «Сундук ×2» (M1-17)');
  ```
- `data/ads.csv` не меняется: строка `double_chest` там уже есть.

## 2. Ядро — `game-rewards.ts` (новый), `game.ts`, `game-threats.ts`, `game-snapshot.ts`

**`src/core/game-rewards.ts`** (новый, LF):
```ts
import type { Game } from './game';

/**
 * Награды за рекламу (с M1-17 — в своём файле, иначе game.ts перерос бы 400 строк): буст за рекламу и «Сундук ×2».
 * Воронка за рекламу — в game-cards.ts: она пересчитывает окно выбора. Функции работают с Game: его команды зовут их.
 */

/** Нажатие на кнопку буста за рекламу: она гаснет, мир стоит до adDone. Пауза или кнопки нет → false. */
export function takeBoostOffer(g: Game): boolean {
  if (g.paused || !g.boostOffer.take()) return false;
  g.ad = true;
  return true;
}

/** Реклама буста кончилась; досмотрена (rewarded) — буст на boost_ad_s, враги на поле гибнут без добычи. Рекламы нет → false. */
export function adDone(g: Game, rewarded: boolean): boolean {
  if (!g.ad) return false;
  g.ad = false;
  if (rewarded) {
    g.boost.start(g.boostOffer.adBoostMs);
    g.stats.boostKills += g.enemies.killAll();
  }
  return true;
}

/**
 * «Сундук ×2» (M1-17): реклама досмотрена в окне «Локация пройдена» — опыт большого сундука ещё раз, как при победе.
 * Окна нет, рекламы за награду у площадки нет или сундук уже удвоен → false.
 */
export function doubleChest(g: Game): boolean {
  if (!g.cleared || !g.rewarded || g.chestDoubled) return false;
  g.chestDoubled = true;
  addChest(g);
  return true;
}

/** Опыт большого сундука: в рейтинг и в полосу (на пределе уровня она стоит полной, лишнее идёт только в рейтинг). */
export function addChest(g: Game): void {
  const xp = g.finalBoss.chestXp;
  g.stats.bigChestXp += xp;
  g.stats.xpGained += xp;
  g.progression.addXp(xp);
}
```
Тела `takeBoostOffer` и `adDone` — те, что сейчас в `game.ts`, только `this` → `g`. Если у тебя они отличаются от этих, переноси свои.

**`src/core/game.ts`:**
- импорт `import { adDone, doubleChest, takeBoostOffer } from './game-rewards';`;
- после поля `cleared`:
  ```ts
  /** «Сундук ×2» за рекламу уже взят (M1-17). Входит в снимок. */
  chestDoubled = false;
  ```
- `takeBoostOffer()` — `return takeBoostOffer(this);`, `adDone(rewarded)` — `return adDone(this, rewarded);`, комментарии прежние;
- после `playOn()`:
  ```ts
  /** «Сундук ×2» за рекламу в окне «Локация пройдена» (M1-17): опыт большого сундука ещё раз. Окна, рекламы нет или уже взят → false. */
  doubleChest(): boolean {
    return doubleChest(this);
  }
  ```
- в прототипе `game.ts` после этого — 393 строки, как и было.

**`src/core/game-threats.ts`** — импорт `import { addChest } from './game-rewards';`; в `finalHit` строки опыта сундука — `g.stats.bigChestXp += …`, `g.stats.xpGained += …`, комментарий про предел уровня и `g.progression.addXp(…)` — заменить на `addChest(g);`.

**`src/core/game-snapshot.ts`:**
- в `GameSnapshot` после `cleared?` — `chestDoubled?: boolean;` с комментарием «„Сундук ×2“ уже взят (с M1-17); нет поля — нет»;
- в `snapshotGame` — `chestDoubled: g.chestDoubled`;
- в `restoreGame` после `cleared` — `g.chestDoubled = s.chestDoubled ?? false;`.

## 3. Интерфейс — `cleared.ts`, `index.html`, `main.ts`, `debug.ts`

- `src/ui/cleared.ts`:
  - в комментарии класса — «„Сундук ×2 за рекламу“ (M1-17) — над „Играть дальше“, пока у площадки есть реклама за награду и сундук не удвоен»;
  - поле `private readonly double = document.createElement('button');`;
  - в конструкторе последний параметр `onDouble: () => void`; кнопка: класс `cleared-double`, `data-testid="chest-double"`, текст `ui.chest_double`, по нажатию — `onDouble`; порядок в колонке — заголовок, локация, сундук, «Сундук ×2», «Играть дальше»;
  - в `update`: `this.double.hidden = !this.game.rewarded || this.game.chestDoubled;`, опыт в строке сундука — `Math.round(this.game.finalBoss.chestXp * (this.game.chestDoubled ? 2 : 1))`.
- `index.html` — перед `#ui .cleared-play`:
  ```css
  /* «Сундук ×2 за рекламу» (M1-17) — цвет кнопок рекламы за награду, как «Открыть за рекламу». */
  #ui .cleared-double {
    height: 84px;
    font-size: 30px;
    font-weight: 700;
    background: #d97706;
    border: 3px solid #fff;
    border-radius: 14px;
    white-space: nowrap;
  }
  ```
  Скрытие даёт общее правило `#ui [hidden]`.
- `src/main.ts`:
  - `VERSION = '0.0.24'`;
  - `ClearedWindow` получает второй обработчик, по образцу воронки:
    ```ts
    let doubling = false;
    const cleared = new ClearedWindow(
      ui,
      game,
      text,
      DATA.location(LOCATION).nameKey,
      () => {
        if (game.playOn()) saver.save();
      },
      () => {
        // «Сундук ×2» (M1-17): окно стоит, сигналов площадке нет (Control.rewarded); досмотрел — запись сразу.
        if (doubling) return;
        doubling = true;
        void control
          .rewarded(() => platform.showRewarded())
          .then((ok) => {
            if (ok && game.doubleChest()) saver.save();
          })
          .finally(() => (doubling = false));
      },
    );
    ```
  - в `state()` после `cleared` — `chestDoubled: game.chestDoubled`.
- `src/debug.ts` — в `state` после `cleared` поле `chestDoubled: boolean` с комментарием «„Сундук ×2“ за рекламу уже взят (M1-17)».
- `package.json` и `package-lock.json` (два поля `version`) — 0.0.24.

## 4. Прогон — «Ждал боя» от уровня боя

- `src/sim/run.ts`:
  - в `SimResult` после `fightStartGameMs` — `fightLevel: number` и `fightLevelGameMs: number | null` с комментарием «Уровень боя (finalBoss.level) и игровое время, когда партия до него дошла (не дошла — null; с M1-17)»;
  - в цикле после строки `fightStartGameMs`: `if (fightLevelGameMs === null && game.progression.level >= game.finalBoss.level) fightLevelGameMs = game.stats.gameMs;`;
  - в результат — `fightLevel: game.finalBoss.level` и `fightLevelGameMs`.
- `src/sim/report.ts`:
  - `fightWait` — `const at = r.fightLevelGameMs;`, комментарий «От уровня боя (finalBoss.level, M1-17) до начала боя…»;
  - в итоговой строке раздела — «От ${curve[0]?.fightLevel ?? '—'}-го уровня до начала боя».

## 5. Тесты

- `tests/unit/chest-double.test.ts` (новый); `win(g)` — как в `final-boss.test.ts`: `setLevel(level_to_clear)`, шаг, `debugHp(1)`, копьё в середину краба, шаги до `cleared`:
  - до победы `doubleChest()` — `false`; после — `true`: `chestDoubled`, `bigChestXp` — `2 × chestXp`, `xpGained` прибавил `chestXp`; уровень 40, полоса полная, окно открыто; второй раз — `false`, `bigChestXp` не меняется;
  - после `playOn()` — `false`; партия с `rewarded: false` — `false`, сундук один;
  - снимок через JSON после удвоения — `cleared`, `chestDoubled`, повторно нельзя; снимок без `chestDoubled` (до M1-17) — не удвоен, удвоить можно;
  - отчёт: прогон `runSim(DATA, 1, { ...DEFAULT_SIM, untilLevel: 2, maxGameMs: 60_000 })`, в его копии `fightLevel: 30`, `fightLevelGameMs: 60_000`, `fightStartGameMs: 63_000`, `fightMs: 45_000`, `levelGameMs[40]: null`, `clearedGameMs`/`clearedWallMs` — любые. В `toMarkdown` — «От 30-го уровня до начала боя: медиана 3 с, худшая 3 с.» и строка `| 1 | 3 с | 45 с |`.
- `tests/e2e/chest-double.spec.ts` (новый), оба проекта, `locale: 'ru-RU'`, `test.setTimeout(90_000)`; победа — как в `final-boss.spec.ts` (нажатие по воде, `setLevel(40)`, `debugSpawnEnemy(-3000, -3000)`, `debugFinalBossHp(1)`, слот копья, бросок в краба):
  - «реклама — сундук вдвое, кнопка уходит, перезагрузка помнит»:
    - в окне сундук «+N опыта» (N — `Math.round(finalBoss.chestXp)`), кнопка `chest-double` видна, текст «Сундук ×2 за рекламу»; снимок `build/shots/m1-17_cleared_<проект>.png`;
    - нажатие — «+2N опыта», кнопка скрыта, `chestDoubled` и `cleared` — `true`; в журнале площадки есть `rewarded`, последний сигнал — по-прежнему `gameplayStop`;
    - перезагрузка — окно на месте, «+2N», кнопки нет; ошибок в консоли нет;
  - «без рекламы за награду кнопки нет»: `/?new=1&rewarded=0`, победа — «Играть дальше» видна, `chest-double` скрыта.

## Проверка поломками

Все поломки ловит Vitest (`chest-double.test.ts`). Внеси по одной, убедись, что падает свой тест, и верни код:
1. сундук удваивается дважды (в `doubleChest` нет `g.chestDoubled`);
2. удвоение после «Играть дальше» (нет `!g.cleared`);
3. удвоение без рекламы за награду (нет `!g.rewarded`);
4. `restoreGame` не восстанавливает `chestDoubled`;
5. `fightWait` снова от `levelGameMs[40]`.

При отладке гоняй один файл тестов. Полный `npm run check` — в конце.

## Критерии готовности
- `npm run check` зелёный.
- `npm run sim`: ворота как после M0-09 (медиана 7,67 с), кривая и раздел «Финальный бой» — как после M1-16; «Ждал боя» — от 40-го уровня, как и было, числа не меняются.
- Все 5 поломок пойманы. Поломки, которые видит только Playwright, Claude проверит ночью.
- На снимках `m1-17_cleared_*` обе кнопки одной ширины, текст «Сундук ×2 за рекламу» не обрезан, окно не шире поля.
- `docs/tasks/README.md`: в строке M1-17 — «сделано ДД.ММ».

## Чего не делать
- Не делать карту и переход (M2), «Обновить карточки» за рекламу (следующая задача).
- Не менять правила буста за рекламу и воронки — только перенести код буста в `game-rewards.ts`.
- Документы в `docs/`, кроме `docs/tasks/README.md`, не править: их ведёт Claude.
- Не коммитить и не пушить; `git stash`, `git reset` и `git checkout` не нужны (правило в `CLAUDE.md`).
