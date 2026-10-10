# M1-11 — буст и бутылка

**Цель.** Буст из GDD («Монетизация»): поток втрое гуще, мелкие враги не приходят. Бесплатная проба — бутылка с бустом на 20 с: она приплывает после первого побеждённого врага, как у оригинала. Из «Угроз»: под бустом таймер визитов стоит, как и в событие. Кнопка буста за рекламу (30 с) — следующая задача, M1-12; здесь буст приходит только от бутылки.

Как понято (толкование Claude, Никита может поправить):
- буст один на всё: от бутылки — `boost_bottle_s` (20 с), с M1-12 от рекламы — `boost_ad_s` (30 с). Время складывается, как у оригинала;
- под бустом:
  - поток гуще в `boost_flow_mult` раз; в шторм множители перемножаются;
  - новые мелкие враги не приходят, их таймер стоит, первый враг тоже ждёт. Те, что уже на поле, остаются: гибнут они только от рекламного буста (M1-12), как у оригинала;
  - спокойное время события и визитов стоит — это обещано в M1-07 и M1-08. Уже идущие шторм и визит продолжаются;
- бутылка:
  - «после первого побеждённого врага» — когда `stats.enemiesKilled` ≥ 1. Она всплывает у плота, на расстоянии стартовых предметов у плота (`seed_near_raft_min_px…max_px`, угол случайный), и плывёт, как поток;
  - уплыла непойманной — всплывает новая, пока её не поймают. Пока бутылка в сети (поймана, но ещё не вернулась к моряку или башне), новой нет;
  - вернулась — буст на 20 с, и бутылок больше не будет;
  - «до первого предложения за рекламу» — правило M1-12: после первого предложения бутылка больше не всплывает;
- опыта бутылка не даёт (в `items.csv` у неё 0). Под бустом в полосе опыта пишется «Буст N с» — у оригинала над плотом отсчёт;
- у буста и бутылки свой поток случайных чисел — `seed + 6` (инвариант 3 в ARCHITECTURE).

**Что изменится в игре.**
- После первого побеждённого краба у плота всплывает бутылка с запиской. Поймай её сетью (или её поймает башня) — 20 с буста: предметов втрое больше, новые крабы не приходят, шторм и шхуна откладываются. В полосе опыта — «Уровень N · Буст 18 с».
- Бутылка уплыла — приплывёт новая, пока не поймаешь. После этого бутылок нет.
- Буст и бутылка переживают перезагрузку.
- Бот `npm run sim` ловит бутылку: в «кучке» она стоит для него 30 опыта.
- Версия — 0.0.18: в `main.ts`, `package.json` и в двух полях `version` в `package-lock.json`.

Условие: M1-10 сделана. Перед началом прочитай:
- `CLAUDE.md`;
- в `docs/GDD.md` — «Монетизация» (строка буста и «Бесплатная проба») и «Угрозы» (визиты);
- файлы:
  - `src/core/game.ts`, `src/core/game-snapshot.ts`, `src/core/events.ts`, `src/core/boss.ts`, `src/core/enemies.ts`;
  - `src/core/world.ts` (`addLoot`, `items`, `removeItem`), `src/core/net.ts` и `src/core/towers.ts` (`caught` у сетей), `src/core/stats.ts`, `src/core/data/tables.ts` (`FLOW_ROLES`);
  - `src/ui/hud.ts`, `src/debug.ts`, `src/main.ts`, `src/sim/bot.ts`, `src/sim/run.ts`, `tools/data-check.mjs`, `translations/strings.csv`;
- в `data/constants.csv` — `boost_*`, `seed_near_raft_min_px`, `seed_near_raft_max_px`, `item_speed_min`, `item_speed_max`; в `data/items.csv` — строку `bottle`;
- тесты `tests/unit/save.test.ts` и, для образца, `tests/unit/events.test.ts`, `tests/unit/spear-towers.test.ts` (тест частоты кадров) и `tests/e2e/storm.spec.ts`.

**Концы строк.** У части файлов концы строк CRLF: `game.ts`, `stats.ts`, `enemies.ts`, `debug.ts`, `main.ts`, `tools/data-check.mjs`, `data/README.md`, `package*.json`, `save.test.ts`. Сохраняй их, иначе `git diff` покажет файл целиком.

**Проверка до передачи (10.10).** Задачу собрал прототипом Claude на коде, где сделаны M1-09 и M1-10:
- `npm run check` зелёный: Vitest — 271 тест (8 новых), Playwright — 44 сценария и 6 пропусков (2 новых прогона). Число новых тестов — ориентир: у тебя после M1-10 тестов больше, чем у прототипа (270 против 263);
- `npm run sim`: ворота как после M0-09 (медиана 7,67 с). Кривая уровней:
  - 10-й уровень — 5,2 мин игрового времени (5,8 по часам), как после M1-10;
  - 20-й — 10,2 мин (11,6), как после M1-10;
  - 40-й — по-прежнему 20 прогонов из 20, медиана 22,2 мин (25,0) вместо 22,5 (25,4).

  Бот побеждает первого краба на 90–154-й секунде игры, на 4–5-м уровне, и ловит бутылку за 0–34 с. В 5 сидах из 20 первая бутылка уплывала, в одном — три подряд. Двадцать секунд буста за прогон — около процента опыта: в отчёте у буста 0–1 %. Кривая сдвинулась в пределах разброса — буст меняет ход партии.

  Прототип собран на своих версиях M1-08…M1-10, у тебя они чуть другие. Поэтому кривая может отличаться от чисел выше на несколько десятых минуты.

## 1. Данные

Новых чисел нет: `boost_bottle_s` (20), `boost_flow_mult` (3) — в `data/constants.csv`, бутылка — строка `bottle` в `data/items.csv`.
- `tools/data-check.mjs`:
  - `boost_bottle_s`, `boost_flow_mult`, `seed_near_raft_min_px` и `seed_near_raft_max_px` — в `needConst`;
  - `boost_bottle_s` и `boost_flow_mult` — в проверку «больше 0»;
  - вместо «бутылка есть» — «бутылка (роль `bottle`) ровно одна».
- `translations/strings.csv` — строка `ui.boost_left,Буст {s} с,Boost {s} s` (по алфавиту — перед `ui.choose_card`).
- `data/README.md`: у `items.csv` в «Когда нужна» — дописать «M1-11 — бутылка»; у `strings.csv` число строк — 123.

## 2. Окно выбора и стройка — `src/core/game-cards.ts` (новый)

В `game.ts` после M1-09 около 390 строк, с бустом вышло бы больше 400 (правило 4). Поэтому окно выбора и стройка переезжают в свой файл — как снимок в M1-08:
- сюда — `BUILDINGS_IN_GAME` (экспорт) и функции от `g: Game`:
  - `takeCard(g, i)`, `placeCell(g, gx, gy)`, `canPlace(g, gx, gy)`, `buildSpots(g)` — тела нынешних методов, с их комментариями;
  - `collectLevelUps(g)`, `openNext(g)`;
  - `deckContext(g)` — без экспорта;
- в `game.ts`:
  - методы `takeCard`, `placeCell`, `canPlace`, `buildSpots` остаются и зовут функции (одна строка);
  - `step` и `debugLevelUp` зовут `collectLevelUps(this)` и `openNext(this)`;
  - `pending` становится открытым `readonly` с комментарием «для game-cards.ts и снимка; снаружи не трогать»;
  - ставшие лишними импорты — убрать;
- импорт `Game` в `game-cards.ts` — только типом.

Поведение не меняется: после этого шага, ещё без буста, Vitest должен пройти как был.

## 3. Буст — `src/core/boost.ts` (новый)

- `BOTTLE_ROLE = 'bottle'`; снимок — `{ leftMs, bottleCaught, bottleId, rng }`.
- Класс `Boost(data, rng, world)`:
  - поля: `leftMs` (0 — буста нет), `bottleCaught`, `bottleId` (id бутылки в воде, `null` — её там нет); `flowMult` = `boost_flow_mult`; `bottleMs` = `boost_bottle_s` × 1000;
  - вид бутылки — первый предмет `items.csv` с ролью `bottle`; нет такого — бутылок нет;
  - геттер `active` — `leftMs > 0`;
  - `start(ms)` — `leftMs += ms`;
  - `step(dtMs, enemiesKilled, inNet)`:
    - буст идёт — `leftMs` убывает на `dtMs`; дошёл до `TIME_EPS` и ниже — 0;
    - бутылка уже поймана, её вида нет, `enemiesKilled < 1` или `inNet` — больше ничего;
    - бутылка `bottleId` ещё в воде (`world.items`) — тоже ничего;
    - иначе новая бутылка: угол `rng.range(0, 2π)`, расстояние от центра плота `rng.range(seed_near_raft_min_px, seed_near_raft_max_px)`, скорость `rng.range(item_speed_min, item_speed_max)`, фаза `rng.range(0, 2π)` — в этом порядке. `world.addLoot(вид, x, y, скорость, фаза)`, `bottleId` — id нового предмета;
  - `bottleBack()` — `bottleCaught` = `true`, `bottleId` = `null`, `start(bottleMs)`;
  - `snapshot()` / `restore()`.

## 4. Ядро — `game.ts`, `enemies.ts`, `stats.ts`, `game-snapshot.ts`

- `Game.boost = new Boost(data, new Rng(seed + 6), world)`.
- Начало `step` (после паузы и `gameMs`):
  ```ts
  this.events.step(dtMs, !this.boss.visiting && !this.boost.active);
  this.boss.step(dtMs, !this.events.active && !this.boost.active, this.events.count, this.raft);
  this.boost.step(dtMs, this.stats.enemiesKilled, this.bottleInNet());
  this.world.flowMult = this.events.flowMult * (this.boost.active ? this.boost.flowMult : 1);
  ```
  Комментарий над ними: событие, визит и буст — первыми; спокойное время события — без визита и буста, визита — без события и буста.
- Улов сети моряка и башен — одна закрытая функция `addCatch(caught)`:
  - значки (`progression.addCatch`), опыт по ролям, бочонок для первого врага — как сейчас;
  - под бустом опыт предметов потока (`FLOW_ROLES`) × сила локации идёт ещё и в `stats.boostFlowXp`;
  - есть предмет роли `bottle` — `boost.bottleBack()`.

  Счётчики остаются у своих мест: у сети моряка — `itemsCaught` и `emptyThrows`, у башен — `towerCaught`.
- `bottleInNet()` (закрытая): бутылка в `net.caught` или в `caught` какой-нибудь сети сетевых башен.
- `EnemiesContext.blocked?: boolean` — идёт буст. `Game` передаёт `boost.active`. В `Enemies.step` после движения врагов: `blocked` — сразу выход. Новых нет, накопитель не растёт, первый враг тоже ждёт.
- `debugBoost(ms?)` — `boost.start(ms ?? boost.bottleMs)`, работает и на паузе.
- `Stats.boostFlowXp`.
- Снимок — поле `boost` (необязательное). В записи до M1-11 его нет — буста нет, бутылку не ловили (правило 5). Бутылка всплывёт снова, если враг уже был побеждён.

## 5. Полоса опыта — `src/ui/hud.ts`

Под бустом подпись полосы — «Уровень N · Буст S с», где S = `ceil(leftMs / 1000)`: строка `ui.boost_left`, `{s}` заменяется числом. Без буста — как сейчас.

## 6. Отладка — `debug.ts`, `main.ts`

- `state().boost` — `{ active, leftMs, bottleCaught, bottle }`, где `bottle` — `{ x, y }` бутылки в воде или `null`.
- В тип `state().stats` — `boostFlowXp`.
- `debugBoost(ms?)` — та же команда ядра.

## 7. Бот и отчёт — `src/sim/bot.ts`, `src/sim/run.ts`

- Бот — модель игрока. В `BotParams` — `bottleValue` («бутылка в „кучке“ стоит столько опыта: живой игрок ловит её сразу»), у `HUMAN` — 30. В счёте «кучки» бутылка идёт за `bottleValue` вместо своего опыта 0.
- `run.ts`, опыт по источникам: `flow` — опыт потока минус `boostFlowXp`, `boost` — `boostFlowXp`. Комментарий поля — «flow — поток без буста, boost — поток под бустом (с M1-11)».

## 8. Тесты

- `tests/unit/boost.test.ts` (новый). Числа — из `constants.csv`, `items.csv` и `events.csv`, шаг — `STEP_MS`:
  - `Boost` отдельно: `start(1000)` и `start(500)` — 1500; кончается ровно через столько шагов;
  - `Game` под `debugBoost()`: `world.flowMult` = `boost_flow_mult`, в шторм — `flow_mult × boost_flow_mult`, без буста — 1;
  - две клетки и `mediumCaught`, буст 60 с:
    - 59 с первого врага нет, после буста он приходит;
    - потом ещё буст 30 с: врагов не прибавилось, `enemies.snapshot().acc` тот же;
  - под бустом `events.calmMs` и `boss.calmMs` (при `visits` 1) не растут;
  - бутылка:
    - до первого побеждённого врага её нет;
    - после `stats.enemiesKilled = 1` и шага — бутылка роли `bottle` в `seed_near_raft_min…max` от центра. Допуск 2 точки: в шаге всплытия она уже сдвинулась;
  - бутылку убрали из воды — всплывает новая. Бутылка в `net.caught` (из воды убрана) — новой нет. Настоящая ловля: бутылке `speed` = 0, `throwTo` в неё, `setPull(true)`, шаги до возврата — `bottleCaught`, буст идёт, после — бутылок нет;
  - 30, 60 и 144 кадра — одна партия с бустом и бутылкой (как тест частоты в `spear-towers.test.ts`);
  - снимок с бустом и бутылкой — после `restore` то же и дальше идёт так же. Запись без `boost` — буста нет, `bottleCaught` = `false`, `bottleId` = `null`.
- `tests/unit/save.test.ts`: два новых случая общего прогона — «бутылка в воде» (`boost.bottleId !== null`) и «буст идёт» (`boost.active`). В заголовке — «…в любом из пятнадцати случаев…». У прототипа они случаются на тактах 4669 и 4733: игрок теста бьёт краба копьём, а бутылку ловит сетью, ведь она ближе всего к центру.
- `tests/e2e/boost.spec.ts` (новый). Оба проекта, `test.use({ locale: 'ru-RU' })`, `test.setTimeout(90_000)`:
  - `/?new=1`; буста нет, в полосе опыта (`getByTestId('xpbar')`) нет «Буст»;
  - `debugBoost()`; `state().boost.active`, в полосе — «Буст»;
  - `expect.poll`: `leftMs` убывает; снимок — `build/shots/m1-11_boost_<проект>.png`;
  - ошибок в консоли нет.

## Проверка поломками

Все поломки ловит Vitest. Внеси по одной, убедись, что падает свой тест, и верни код:
1. под бустом поток не гуще (`world.flowMult` = `events.flowMult`);
2. враги приходят под бустом (нет выхода по `blocked`);
3. спокойное время события копится под бустом;
4. новая бутылка, пока старая в сети (нет условия `inNet`);
5. `restoreGame` теряет буст.

При отладке гоняй один файл тестов. Полный `npm run check` — в конце.

## Критерии готовности
- `npm run check` зелёный; `npm run sim` — ворота как после M0-09 (медиана 7,67 с), кривая — близко к «Проверке до передачи».
- Все 5 поломок пойманы.
- На снимках `m1-11_boost_*` в полосе опыта — «Уровень 1 · Буст 20 с» (или 19 с).
- `docs/tasks/README.md`: в строке M1-11 — «сделано ДД.ММ».

## Чего не делать
- Не делать кнопку буста, рекламу за награду и гибель крабов от буста — это M1-12. Не делать вспышку «BOOST» и звук.
- Не менять правила шторма, шхуны и башен.
- Документы в `docs/`, кроме `docs/tasks/README.md`, не править: их ведёт Claude.
- Не коммитить и не пушить; `git stash`, `git reset` и `git checkout` не нужны (правило в `CLAUDE.md`).
