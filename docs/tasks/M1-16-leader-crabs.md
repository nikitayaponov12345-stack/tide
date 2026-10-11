# M1-16 — крабы-вожаки в шторм

**Цель.** Из GDD («Угрозы: враги, события, боссы», строка шторма; решения Никиты 11.10): в каждый шторм Лагуны, на 5-й секунде, приходит краб-вожак, как у оригинала. Он крупнее мелкого краба, прочнее (2 × уровень), бьёт клетку сильнее и не ворует.

Как понято (толкование Claude, Никита может поправить):
- вожак — один на шторм, на 5-й секунде шторма (`leader_after_s`). Он приходит, только если мелкие крабы уже начались (первый краб был). Под бустом вожак не приходит, но догоняет: если буст кончился, а шторм ещё идёт, вожак приходит в первом же шаге;
- прочность — `2 × уровень × сила локации` (`leader_hp_per_level`), без случайности, как у оригинала: на 20-м уровне — 40, на 40-м — 80;
- укус по клетке — 50 (`leader_damage`), у мелкого краба 25. «Бьёт сильнее» — решение Никиты, число 50 — предложение Claude, Никита может поправить;
- скорость — 30 точек в секунду (мелкий — 40), радиус — 40 (мелкий — 28). Путь, ожидание у клетки и уход — как у мелкого краба: к самой дальней целой клетке, мимо центральной;
- добыча — предмет на каждые 4 единицы урона (`leader_loot_per_hp`), у мелкого — на каждую. Иначе вожак на 40-м уровне выронил бы 80 предметов;
- буст за рекламу топит вожака вместе с мелкими крабами — как сейчас для всех врагов;
- в финальном бою шторма нет, поэтому и вожака нет.

**Что изменится в игре.**
- В шторм на 5-й секунде появляется крупный тёмно-красный краб с белой обводкой и числом прочности над ним (заготовка до арта).
- Копьё моряка и копейные башни бьют его, как мелкого краба.
- Версия — 0.0.23: в `main.ts`, `package.json` и в двух полях `version` в `package-lock.json`.

Условие: M1-15 сделана. Перед началом прочитай:
- `CLAUDE.md`;
- в `docs/GDD.md` — «Угрозы: враги, события, боссы» (строка шторма в таблице событий и абзац о ворах под ней) и строку «Финал Лагуны» в «Решениях»;
- файлы:
  - `src/core/enemies.ts`, `src/core/events.ts`, `src/core/game-threats.ts`, `src/core/game.ts` (`debugSpawnEnemy`), `src/core/stats.ts`;
  - `src/game/view.ts` (`syncEnemies`), `src/main.ts`, `src/debug.ts`;
  - `src/sim/run.ts`, `src/sim/report.ts`, `tools/data-check.mjs`;
- таблицы: `data/events.csv`; в `data/constants.csv` — строки `enemy_*`; `data/README.md` («Добыча» и строка `constants.csv`);
- тесты `tests/unit/enemies.test.ts`, `tests/unit/events.test.ts`, `tests/e2e/storm.spec.ts`.

**Концы строк.** У части файлов концы строк CRLF: `enemies.ts`, `game.ts`, `stats.ts`, `view.ts`, `debug.ts`, `main.ts`, `tools/data-check.mjs`, `data/README.md`. Сохраняй их, иначе `git diff` покажет файл целиком. У `package.json`, `package-lock.json`, `constants.csv`, `events.ts`, `game-threats.ts`, `run.ts`, `report.ts` и `events.test.ts` — LF. Новые файлы — LF.

**Проверка до передачи (11.10).** Задачу собрал прототипом Claude на снимке твоего кода после M1-15 (два коммита M1-15 от 11.10):
- `npm run check` зелёный: Vitest — 332 теста (5 новых), Playwright — 58 сценариев и 6 пропусков (2 новых прогона);
- `npm run sim`: ворота как после M0-09 (медиана 7,67 с).

| | После M1-15 (твой код) | После M1-16 |
|---|---|---|
| 10-й уровень | 4,9 мин (5,9) | 4,8 мин (5,6) |
| 20-й уровень | 9,4 мин (11,3) | 9,3 мин (11,3) |
| 40-й уровень | 20 из 20, медиана 18,9 мин (22,6) | 20 из 20, медиана 18,7 мин (22,4) |
| Финальный бой | медиана 45 с (19–108 с), в цели — 9 | медиана 46 с (17–101 с), в цели — 8 |
| «Локация пройдена» | 19,6 мин (23,4) | 19,5 мин (23,2) |
| Вожаков за прогон | — | от 4 до 7, всего 114, бот победил 102 |

Кривая почти не сдвинулась: добыча вожака — 10 предметов на 20-м уровне.

## 1. Данные

- `data/constants.csv`, шесть строк сразу после `enemy_radius_px`:
  - `leader_after_s,5,s,"Вожак (решение Никиты 11.10, как у оригинала): один на событие локации, на этой секунде события"`;
  - `leader_hp_per_level,2,,Прочность вожака — столько × уровень × сила локации (как у оригинала)`;
  - `leader_damage,50,,"Укус вожака, × сила урона локации; у мелкого краба 25 («бьёт сильнее» — решение Никиты 11.10, число — предложение Claude)"`;
  - `leader_speed,30,px/s,"Вожак идёт медленнее мелкого (у оригинала скорость краба падает с прочностью, не ниже 30)"`;
  - `leader_radius_px,40,px,Радиус вожака для копья и отрисовки (заготовка до арта)`;
  - `leader_loot_per_hp,4,,"Добыча вожака: предмет на каждые столько × сила локации единиц урона (у мелкого — на каждую)"`.
- `tools/data-check.mjs`:
  - шесть ключей `leader_*` — в конец списка `needConst` и в конец списка «должен быть больше 0»;
  - в цикле по `T.events` строку `num(r, 'duration_s', { min: 1 });` заменить на:
    ```js
    // Вожак (M1-16) приходит, пока событие идёт.
    if (num(r, 'duration_s', { min: 1 }) <= C.leader_after_s) err(`${where(r)}: duration_s не больше leader_after_s — вожак не успеет прийти`);
    ```
- `data/README.md`:
  - в «Добыче» после «сколько у него базовой прочности;» — «вожак события (M1-16) — на каждые `leader_loot_per_hp × enemy_hp_mult`;»;
  - строка `constants.csv`: число строк 81, в описании после «враги» — «вожаки», в последней колонке в конце — «; M1-16 — `leader_*` вожаков событий».

## 2. Ядро — `enemies.ts`, `events.ts`, `game-threats.ts`, `stats.ts`, `game.ts`

**`src/core/events.ts`** — после `get active()`:
```ts
/** Сколько идёт событие (M1-16: вожак приходит на leader_after_s); события нет — 0. */
get elapsedMs(): number {
  return this.active ? this.durationMs - this.leftMs : 0;
}
```

**`src/core/game-threats.ts`** — в `enemiesContext` последним полем:
```ts
event: g.events.active ? { count: g.events.count, elapsedMs: g.events.elapsedMs } : undefined,
```
В комментарии к функции — «; в событие — вожак (M1-16)».

**`src/core/stats.ts`** — после `bigChestXp`:
```ts
leaders = 0;       // вожаков пришло (M1-16; они же в enemies.spawned)
leadersKilled = 0; // вожаков побеждено копьями (они же в enemiesKilled)
```

**`src/core/enemies.ts`:**
- `Enemy` — необязательное поле `leader?: boolean` (нет поля — обычный краб; старые записи читаются как есть). В комментарии — «leader — вожак события (M1-16); нет поля — обычный».
- `EnemiesContext` — необязательное поле `event?: { count: number; elapsedMs: number }`: идёт событие, его номер за партию и сколько оно уже идёт; нет поля — события нет.
- `EnemiesSnapshot` — необязательное поле `leaderEvent?: number`: номер события, в которое уже приходил вожак. В записи до M1-16 поля нет — читать как −1.
- Поле `private leaderEvent = -1`. В `snapshot` — `leaderEvent: this.leaderEvent`, в `restore` — `this.leaderEvent = s.leaderEvent ?? -1`.
- В конструкторе — `private readonly leader`: `afterMs` (`leader_after_s × 1000`), `hpPerLevel`, `bite` (`leader_damage × enemyDmgMult`), `speed`, `radius`, `lootPerHp`.
- `step`: в самом конце, после блока таймера и первого врага (значит, после `if (ctx.blocked) return;` — под бустом и в финальный бой вожака нет):
  ```ts
  // Вожак (M1-16): один на событие, на leader_after_s от его начала; не раньше первого врага и не под бустом —
  // пропущенный срок вожак догоняет в первом шаге, когда можно, если событие ещё идёт.
  const ev = ctx.event;
  if (this.started && ev && ev.count !== this.leaderEvent && ev.elapsedMs + TIME_EPS >= this.leader.afterMs) {
    this.leaderEvent = ev.count;
    this.spawn(ctx, null, true);
  }
  ```
  Бросков Rng у вожака столько же, сколько у мелкого краба, кроме броска прочности: край и место.
- `spawn(ctx, at, leader = false)`:
  - прочность: `leader ? this.leader.hpPerLevel * ctx.level * this.hpMult : this.rollHp(ctx.level)` — у вожака броска прочности нет;
  - радиус: `leader ? this.leader.radius : this.radius`;
  - у вожака `e.leader = true` и `this.stats.leaders++`. У обычного краба поля `leader` нет совсем — так записи и тесты на снимках не меняются.
- `spawnNow(ctx, at, leader = false)` передаёт `leader` в `spawn`.
- `advance`: скорость `e.leader ? this.leader.speed : this.speed!`, укус `e.leader ? this.leader.bite : this.bite`.
- `hit`: шаг добычи `const per = e.leader ? this.hpMult * this.leader.lootPerHp : this.hpMult;` и формула `drops` — через `per` вместо `this.hpMult`. Утонул вожак — ещё и `this.stats.leadersKilled++`.
- Комментарий класса: «…урон копьём и добыча; в событие локации — вожак (M1-16): крупнее, крепче, медленнее, кусает сильнее, добычи на урон меньше».

**`src/core/game.ts`** — `debugSpawnEnemy(x?, y?, leader = false)` передаёт `leader` в `spawnNow`; в комментарии — «; leader — вожак события (M1-16)». Строк в `game.ts` не прибавляется.

## 3. Интерфейс и отладка — `view.ts`, `main.ts`, `debug.ts`

- `src/game/view.ts`:
  - константа после `ENEMY_COLOR`:
    ```ts
    /** Вожак события (M1-16) — темнее мелкого и с белой обводкой; радиус — свой, из ядра. */
    const LEADER = { color: 0x8b0a0a, rim: { width: 3, color: 0xffffff, alpha: 0.8 } } as const;
    ```
  - `syncEnemies` рисует каждого врага его `e.radius` (поле `ViewOptions.enemyRadius` и строка `const r = this.opts.enemyRadius;` больше не нужны — удалить). Вожак: `circle(...).fill({ color: LEADER.color, alpha }).stroke({ ...LEADER.rim, alpha: LEADER.rim.alpha * alpha })`; под водой он полупрозрачный, как мелкий краб.
- `src/main.ts`:
  - `VERSION = '0.0.23'`;
  - `new View(...)` без `enemyRadius`;
  - в `state().enemies` — поле `leader: leader === true`;
  - `debugSpawnEnemy: (x, y, leader) => game.debugSpawnEnemy(x, y, leader)`.
- `src/debug.ts`:
  - в `stats` — `leaders: number; leadersKilled: number;` с комментарием «Вожаки событий (M1-16): сколько пришло и сколько побеждено»;
  - у `enemies` — поле `leader: boolean`;
  - `debugSpawnEnemy(x?: number, y?: number, leader?: boolean): void` — «leader — вожак (M1-16)».
- `package.json` и `package-lock.json` (два поля `version`) — 0.0.23.

## 4. Прогон — `run.ts`, `report.ts`

- `src/sim/run.ts`: в `SimResult` после `enemiesEscaped` — `leaders` и `leadersKilled` (комментарий «Вожаков событий пришло и побеждено копьями (с M1-16)»), в результат — из `stats`.
- `src/sim/report.ts`: в таблице «Прогоны» — последняя колонка «Вожаки: пришло / побеждено» (`${r.leaders} / ${r.leadersKilled}`), в строке разделителя — ещё одна `| --- |`.

Бота не трогать: он и так бьёт копьём ближайшего краба.

## 5. Тесты

- `tests/unit/events.test.ts`, тест «с debugEvent за duration_s минус шаг крабов…»: к названию — «и вожак (M1-16)», проверка — `expect([g.enemies.spawned, g.stats.leaders]).toEqual([2 + Math.floor((DURATION_MS - STEP_MS) / interval), 1])` с комментарием «Вожак — один на событие, сверх таймера».
- `tests/unit/leader.test.ts` (новый), числа — из таблиц (`DATA.num('leader_*')`, укус × `enemyDmgMult` Лагуны):
  - через `Enemies` напрямую (плот из трёх клеток в ряд, свой `Stats`):
    - без события вожака нет; событие на `afterMs − 2 шага` — нет; на `afterMs` — один, прочность `hpPerLevel × 20` на 20-м уровне, свой радиус, `stats.leaders` 1; ещё 100 шагов того же события — всё ещё 1; событие с новым номером — второй, прочность по новому уровню;
    - `ready: false` — нет; `blocked: true` — нет; следующий шаг без `blocked` в том же событии — пришёл;
    - за 1000 мс вожак проходит `leader_speed` точек; дошёл — стоит в `enemy_reach_px` от центра клетки и снял с неё ровно `leader_damage × enemyDmgMult`;
    - удар `2 × leader_loot_per_hp` — 2 предмета; добил — всего `hpPerLevel × 10 / lootPerHp` предметов, `leadersKilled` 1, `enemiesKilled` 1;
  - в `Game` (клетка `(1, 0)`, `mediumCaught`, один шаг, `debugEvent`):
    - за `steps(afterMs) − 1` шагов вожака нет, на следующем — есть, прочность `hpPerLevel × уровень`;
    - снимок через JSON посреди шторма — продолжение на `duration_s` идёт так же, как без перерыва; вожак за шторм один;
    - новый `debugEvent` — второй вожак; запись без `enemies.leaderEvent` (до M1-16) — в первом шаге третий (в идущем событии вожак ещё «не приходил»);
    - `debugBoostOffer`, `takeBoostOffer`, `adDone(true)` — вожаков в списке нет.
- `tests/e2e/leader.spec.ts` (новый), оба проекта, `locale: 'ru-RU'`, `test.setTimeout(90_000)`:
  - `/?new=1`, `setLevel(10)`, `debugEvent()`, `debugSpawnEnemy(150, 0)`, `debugSpawnEnemy(-150, 0, true)`;
  - у вожака `hp` 20, радиус больше, чем у краба; снимок `build/shots/m1-16_leader_<проект>.png`;
  - слот копья, бросок в вожака — `expect.poll`: прочность меньше 20;
  - ошибок в консоли нет.

## Проверка поломками

Все поломки ловит Vitest (`leader.test.ts`, `events.test.ts`, `save.test.ts`). Внеси по одной, убедись, что падает свой тест, и верни код:
1. вожак в каждом шаге события (в условии нет `ev.count !== this.leaderEvent`);
2. вожак кусает как мелкий (`this.bite` вместо `this.leader.bite`);
3. добыча вожака — на каждую единицу урона (`per = this.hpMult`);
4. `restore` не восстанавливает `leaderEvent`;
5. вожак в первом шаге шторма (в `enemiesContext` — `elapsedMs: g.events.durationMs`).

При отладке гоняй один файл тестов. Полный `npm run check` — в конце.

## Критерии готовности
- `npm run check` зелёный.
- `npm run sim`: ворота как после M0-09 (медиана 7,67 с); кривая до 40-го уровня — в пределах 0,3 мин от твоей после M1-15; финальный бой — 20 из 20. В таблице «Прогоны» — колонка «Вожаки», в каждом прогоне вожаков не меньше 3.
- Все 5 поломок пойманы. Поломки, которые видит только Playwright, Claude проверит ночью.
- На снимках `m1-16_leader_*` вожак заметно крупнее и темнее мелкого краба, обводка видна, число прочности над ним не обрезано.
- `docs/tasks/README.md`: в строке M1-16 — «сделано ДД.ММ».

## Чего не делать
- Не делать вожаков, которые воруют постройки (решение Никиты 11.10: не воруют), и вожаков других локаций.
- Не менять правила мелких крабов, шторма, буста и финального боя.
- Документы в `docs/`, кроме `docs/tasks/README.md`, не править: их ведёт Claude.
- Не коммитить и не пушить; `git stash`, `git reset` и `git checkout` не нужны (правило в `CLAUDE.md`).
