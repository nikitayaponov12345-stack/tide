# M0-02 — сеть моряка, улов, опыт и уровни; схема управления А «Классика»

**Цель.** Моряк бросает сеть, сеть ловит предметы, улов превращается в опыт, опыт — в уровни. Ядро сети сразу умеет всё, что нужно четырём схемам управления (удержание, автотяга, ведение за пальцем); в этой задаче подключена только схема А «Классика». Окна выбора ещё нет — уровень просто растёт.

**Что изменится в игре.** Щелчок мышью по воде бросает сеть (на телефоне — касание и отпускание). Пока сеть в воде, удержание мыши или пальца в любом месте тянет её к плоту; отпустил — сеть остаётся там, где была; с уловом она идёт медленнее. Пойманное разлетается значками к полосе опыта у верхнего края поля по центру, полоса заполняется, номер уровня растёт, на секунду появляется «Новый уровень!». Вокруг плота — тонкий круг дальности, у сети — счётчик улова «3/5». Отладочная строка переезжает в левый нижний угол.

Условие: M0-01 сделана. Перед началом прочитай `CLAUDE.md`, `docs/ARCHITECTURE.md` (§1, 3, 5, 8) и разделы GDD «Управление» и «Ядро локации».

**Проверка до передачи (08.10).** Первая редакция задачи прошла пробную сборку независимым исполнителем. После неё правила сети изменены, и эти изменения проверены только прототипом Claude на этом тексте (Vitest — 57 тестов по списку задачи и 2 пробных теста схемы А, сборка и 4 сценария Playwright зелёные): состояние `following` и просьбы, присланные во время полёта; отпускание удержания (сеть снова лежит); `onCancel`; бросок касанием — только для жеста, начатого при `ready`; опыт и `xpGained` — по прилёту значков; дальность — от (0, 0). «Рука» `game.test` на прототипе: 2-й уровень — на 10,8 с, за 60 с — 3-й уровень. Твои числа могут отличаться — в отчёт.

## 1. Плот — `src/core/raft.ts` (минимум для сети)

```ts
export interface Cell { gx: number; gy: number }        // координаты сетки; (0, 0) — клетка моряка
export class Raft {
  constructor(data: Tables);                             // одна клетка (0, 0)
  readonly cells: readonly Cell[];
  cellCenter(c: Cell): { x: number; y: number };         // центр клетки в координатах мира: (gx × cell_px, gy × cell_px)
  touches(x: number, y: number, r: number): boolean;     // круг (x, y, r) пересекает квадрат хотя бы одной клетки
}
```
Клетки добавляет M0-05; здесь — только клетка моряка.

## 2. Сеть — `src/core/net.ts`

```ts
export type NetState = 'ready' | 'flying' | 'lying' | 'pulling' | 'following';
export interface NetParams { radius: number; capacity: number; range: number; pull: number }  // из sailor.csv (ярус 1) и позже карточек
export interface CaughtItem { kind: string; role: Role; xp: number; weight: number; x: number; y: number }  // xp — Item.xp (без силы локации)
export interface ThrowOptions { autoPullAfterMs: number | null }   // null — тянуть только по удержанию (схема А)
export class Net {
  state: NetState;
  x: number; y: number;                // центр сети; в состоянии ready — (0, 0)
  readonly caught: CaughtItem[];
  get weight(): number;                // сумма весов улова
  constructor(data: Tables, params: NetParams);
  setParams(p: NetParams): void;
  throwTo(x: number, y: number, opts: ThrowOptions): boolean;   // только из ready; иначе false
  setPull(on: boolean, mult?: number): void;                     // удержание; mult по умолчанию 1
  setFollow(p: { x: number; y: number } | null): void;           // ведение за пальцем (схема В, M0-03); null — «возвращайся сама»
  step(dtMs: number, world: World, raft: Raft): CaughtItem[] | null; // не null — сеть вернулась с уловом (в том числе пустым: [])
}
```

Дальность — от центра клетки моряка (0, 0). Пока клетка одна, это и есть весь плот. Как считать дальность при нескольких клетках (в GDD — предложение «от ближайшей клетки», ждёт галочки Никиты), решит M0-05.

**Состояния и переходы** (числа — из `constants.csv`):

| Состояние | Что делает сеть | Куда переходит |
|---|---|---|
| `ready` | у моряка в (0, 0), не ловит | `throwTo` → `flying` |
| `flying` | летит к цели, не ловит | падение → см. «Падение» |
| `lying` | лежит на месте и ловит | удержание включено → `pulling`; наступила автотяга → `pulling` «сама» |
| `pulling` | идёт к (0, 0) и ловит | удержание выключено и тяги «сама» нет → `lying`; касание плота → возврат, `ready` |
| `following` | идёт к точке ведения и ловит | `setFollow(p)` — новая точка; `setFollow(null)` → `pulling` «сама»; касание плота → возврат, `ready` |

- **Бросок.** `throwTo` из `ready`: если цель дальше `range` от (0, 0), она переносится на окружность радиуса `range` по тому же направлению. Сеть вылетает из (0, 0), переходит во `flying` и возвращает `true`. Из любого другого состояния `throwTo` ничего не делает и возвращает `false`. Бросок сбрасывает запомненные просьбы (ведение, возврат) и таймер автотяги.
- **Полёт.** Скорость падает линейно по пройденной доле пути: `v = net_flight_speed × (1 − (1 − net_flight_end_mult) × пройдено / путь)`; когда пройдено ≥ путь — сеть в точке цели. Время полёта на путь D в точной формуле — `D × ln(1 / end_mult) / (speed × (1 − end_mult))` (для D = 180: 0,555 с); в шагах по 1/60 с допускается расхождение до 2 шагов.
- **Падение.** Следующее состояние — по первому подходящему: во время полёта пришёл `setFollow(p)` → `following` к последней присланной точке; пришёл `setFollow(null)` → `pulling` «сама»; включено удержание → `pulling`; иначе → `lying`. Таймер автотяги считает игровое время от падения. В шаге падения сеть уже ловит.
- **Ловля.** В `lying`, `pulling` и `following` сеть каждый шаг забирает из мира предметы, у которых расстояние до центра сети меньше `radius + item.radius`, пока `caught.length < capacity` (по одному, в порядке `world.items`; забранный удаляется через `world.removeItem`). `CaughtItem.xp` — `item.xp` предмета мира.
- **Тяга.** В `pulling` сеть идёт к (0, 0) со скоростью `clamp(pull × mult / (1 + weight), net_pull_min, net_pull_max)`; `mult` — удержания, если оно включено, иначе 1.
- **Удержание.** `setPull(true)` — включить (в `lying` → `pulling`; во время полёта — запоминается до падения), `setPull(false)` — выключить: если тяги «сама» нет, сеть снова `lying` и стоит, где была.
- **Тяга «сама».** Её включают автотяга (через `autoPullAfterMs` после падения, ±1 шаг; в `lying` и `pulling`) и `setFollow(null)`. Пока она включена, `setPull(false)` тягу не останавливает: сеть идёт к плоту до возврата (с `mult` удержания, пока оно включено).
- **Ведение.** `setFollow(p)` в `lying` или `pulling` → `following`; во время полёта — запоминается до падения; в `ready` — ничего. Точка ведения ограничивается дальностью, как цель броска. Скорость — как у тяги с `mult` = 1; удержание и автотяга в `following` не действуют. `setFollow(null)` → `pulling` «сама» (во время полёта — после падения).
- **Возврат.** В `pulling` и `following`, когда круг сети касается клетки плота (`raft.touches(x, y, radius)`), `step` возвращает улов (копию массива); сеть очищается, переходит в `ready` в точке (0, 0), удержание, тяга «сама» и запомненные просьбы сбрасываются.
- **Порядок шага сети:** полёт или движение (тяга, ведение) → ловля → проверка возврата.

## 3. Опыт и уровни — `src/core/progression.ts`

```ts
export interface Icon { xp: number; launchMs: number; arriveMs: number; fromX: number; fromY: number }  // xp — уже × сила локации
export class Progression {
  level: number;            // с 1
  xp: number;               // опыт внутри текущего уровня
  readonly icons: Icon[];   // летящие значки (для отрисовки)
  readonly levelUps: number[];   // уровни, которые наступили и ещё не забраны UI; забирает takeLevelUps()
  constructor(data: Tables, xpMult: number);
  xpToNext(): number;       // data.levelStep(level + 1, xpMult)
  addCatch(items: CaughtItem[], nowMs: number): void;  // значки: i-й вылетает в nowMs + i × icon_interval_ms, прилетает через icon_flight_ms
  step(nowMs: number): number;   // прилетевшие значки начисляют свой xp; возвращает опыт, начисленный за этот шаг
  takeLevelUps(): number[];
  setLevel(level: number): void;   // для отладки и пробы: уровень, xp = 0, значки сброшены
}
```
- Сила локации умножается ровно один раз — в `addCatch`: `Icon.xp = item.xp × xpMult` (в Лагуне ×1). `step` прибавляет `Icon.xp` как есть.
- Уровень: пока `xp ≥ xpToNext()` — `xp −= xpToNext()`, `level += 1`, номер — в `levelUps`. В M0 предела уровня нет: что происходит на 40-м (переход, бой с боссом) — веха M1; после 40-го стоимость — запасная формула `levelStep` из M0-01.
- Пустой улов значков не даёт.

## 4. Счётчики — `src/core/stats.ts`

`throws` (успешные `throwTo`), `emptyThrows` (сеть вернулась пустой), `itemsCaught`, `xpGained` (опыт, начисленный по прилёту значков, × сила локации — то же, что получила полоса опыта), `taps` (нажатия; считает слой ввода командой `noteTap()`), `gameMs` (игровое время с последнего `reset()`). Метод `reset()`.

## 5. Ядро целиком — `src/core/game.ts`

```ts
export class Game {
  readonly world: World; readonly raft: Raft; readonly net: Net; readonly progression: Progression; readonly stats: Stats;
  constructor(data: Tables, cfg: { halfW: number; halfH: number; speedMult: number; locationId: string; seed: number });
  step(dtMs: number): void;
  // команды ввода и ботов
  throwTo(x: number, y: number, opts: ThrowOptions): boolean;   // + stats.throws
  setPull(on: boolean, mult?: number): void;
  setFollow(p: { x: number; y: number } | null): void;
  noteTap(): void;
  setLevel(level: number): void;   // отладка: progression и world
}
```
- Порядок `step`: `stats.gameMs += dtMs` → `world.step` → `net.step` (улов → `progression.addCatch(улов, world.timeMs)`, `stats.itemsCaught`, `stats.emptyThrows`) → `stats.xpGained += progression.step(world.timeMs)` → `world.setLevel(progression.level)`, если уровень изменился.
- Сеть — ярус моряка локации (`data.sailorTier(location.order)`, в Лагуне — 1): `radius = netRadius`, `capacity = netCapacity`, `range = throwRange`, `pull`.
- Время значков — `world.timeMs`.
- Команды ввода применяются сразу, между шагами ядра: обработчик события вызывает команду `Game`, следующий шаг её видит (ARCHITECTURE §5).
- `main.ts` и `debug.ts` переходят на `Game` (мир M0-01 живёт внутри него).

## 6. Ввод и схема А — `src/game/input/`

- `pointer.ts`: слушает `pointerdown`, `pointermove`, `pointerup`, `pointercancel` на холсте; на `pointerdown` — `setPointerCapture` и `game.noteTap()`; переводит координаты окна в координаты мира (обратное `fitDesign` и сдвиг на центр поля — тот же расчёт, что `toScreen` из M0-01, только наоборот) и передаёт событие текущей схеме вместе с `pointerType`. `pointercancel` — это `onCancel`, а не `onUp`. Работает первый `pointerId`, второй палец игнорируется. Контекстное меню на холсте отключает `pointer.ts` (`contextmenu` → `preventDefault`); `touch-action: none` и запрет выделения уже стоят в `index.html`.
- `schemes.ts`: интерфейс схемы — на него в M0-03 лягут Б, В, Г:
  ```ts
  export interface PointerInfo { x: number; y: number; type: 'mouse' | 'touch' | 'pen'; id: number }
  export interface ControlScheme {
    readonly id: 'a' | 'b' | 'c' | 'd';
    onDown(p: PointerInfo, g: Game): void;
    onMove(p: PointerInfo, g: Game): void;
    onUp(p: PointerInfo, g: Game): void;
    onCancel(p: PointerInfo, g: Game): void;   // палец ушёл (системный жест, вызов): никогда не бросает
  }
  ```
- **Схема А «Классика»:**
  - `onDown`: сеть `ready` — мышь бросает сразу в точку нажатия; касание и перо запоминают, что жест начался при `ready`. Сеть не `ready` — `setPull(true)`.
  - `onUp`: касание или перо, жест начался при `ready` и сеть всё ещё `ready` — бросок в точку отпускания. Всегда `setPull(false)`. Так отпускание после удержания, за которое сеть успела вернуться, не бросает её снова.
  - `onCancel`: `setPull(false)`, броска нет.
  - Автотяги нет (`autoPullAfterMs: null`).

## 7. Отрисовка и интерфейс

- `src/game/view.ts`: моряк — круг поменьше в центре клетки; круг дальности — тонкая линия радиуса `range` вокруг центра клетки моряка, видна, пока сеть `ready`; сеть — окружность радиуса `radius` с крестом внутри и верёвка от моряка до сети; значки — маленькие круги, летящие от места улова к полосе опыта (положение по `launchMs`/`arriveMs`, линейно). Счётчик улова у сети `n/capacity`: зелёный, с половины — жёлтый, полная — красный.
- `src/ui/hud.ts` (новый, вёрстка): полоса опыта у верхнего края поля дизайна по центру (не окна: при полосах по краям экрана она остаётся над водой; ширина 40 % поля, не уже 280 px), внутри — `Уровень N` (строка `ui.level`) и заполнение `xp / xpToNext`; при новом уровне на 1 с — «Новый уровень!» (`ui.new_level`). Строки — через `DATA.text(key, lang)`, язык — `platform.language()`.
- Отладочная строка — в левом нижнем углу, чтобы не спорить с полосой опыта: `… · уровень 3 · сеть lying 2/5 · предметов 31`.

## 8. Отладка — `src/debug.ts`

- `state()` → `{ level, xp, xpToNext, net: { state, x, y, caught, capacity, range }, stats }`, где `caught` — сколько предметов в сети (число);
- `command` — объект с методами: `{ throwTo(x, y, autoPullAfterMs?: number | null): boolean; setPull(on: boolean, mult?: number): void; setFollow(p: { x: number; y: number } | null): void }`;
- `setLevel(n)` — теперь через `Game.setLevel`.

## 9. Тесты

Числа — из `DATA` (`sailorTier(1)`, `num(...)`, `levelStep(...)`), не вписывать; числа в скобках ниже — для сверки.
- `tests/unit/raft.test.ts`: `touches` — круг, касающийся стороны клетки, касающийся угла, и мимо.
- `tests/unit/net.test.ts`:
  1. Бросок дальше предела — цель на окружности `range` вокруг (0, 0), направление сохранено.
  2. Время полёта на `range` — по формуле из п. 2 (±2 шага); во время полёта предметы рядом не ловятся.
  3. Лежащая сеть ловит предметы в радиусе `radius + item.radius` и не ловит дальше; не больше `capacity`; `CaughtItem.xp` — опыт вида из `items.csv`.
  4. Скорость тяги: пустая — `clamp(pull, min, max)`; с тремя тяжёлыми (вес 3) — `pull / 10`; после `setParams` с `pull` = 1 — ровно `net_pull_min`.
  5. Возврат: при касании плота `step` отдаёт улов, сеть `ready` в (0, 0), `caught` пуст.
  6. `throwTo` не из `ready` — `false`, состояние не меняется.
  7. Удержание: `setPull(true)` в `lying` → `pulling`; `setPull(false)` → снова `lying`, сеть стоит на месте; `setPull(true)` во время полёта → сразу после падения `pulling`.
  8. Автотяга: `autoPullAfterMs = scheme_b_autopull_ms` — `pulling` не раньше и не позже чем через это время после падения (±1 шаг); после неё `setPull(false)` тягу не останавливает; удержание с `mult = scheme_b_hold_mult` ускоряет.
  9. Ведение: `setFollow(p)` в `lying` → `following`, сеть идёт к точке, не выходит за дальность, ловит по пути; `setFollow(p)` во время полёта — после падения `following` к последней присланной точке; `setFollow(null)` → `pulling`, сеть возвращается сама (и `setFollow(null)` во время полёта — после падения).
  10. Независимость от частоты кадров: один сценарий (бросок → 2 с → удержание до возврата) при 30, 60 и 144 кадрах в секунду через `FixedStep` даёт одинаковый улов и время возврата (±1 шаг).
- `tests/unit/progression.test.ts`:
  1. Значки: улов из 5 предметов — последний прилетает через `4 × icon_interval_ms + icon_flight_ms` после `addCatch`; опыт начисляется только по прилёту; `step` возвращает опыт, начисленный за этот шаг.
  2. Пороги из `DATA`: `levelStep(2, 1)` опыта на 1 уровне (6) → 2 уровень.
  3. Перенос и несколько уровней подряд: 1 уровень + улов на 30 опыта → уровень 3, `xp` = 30 − `levelStep(2, 1)` − `levelStep(3, 1)` (14); `takeLevelUps()` → `[2, 3]`, повторный вызов → `[]`.
  4. `xpMult = 2`: значок предмета на 10 опыта несёт 20 (сила умножается один раз), стоимость уровня — `levelStep(…, 2)`.
  5. После 40 уровня стоимость — `levelStep(41, …)` (запасная формула).
- `tests/unit/game.test.ts`:
  1. `stats.xpGained` растёт по прилёту значков: сразу после возврата сети с уловом прироста нет, через `icon_flight_ms` + `(n − 1) × icon_interval_ms` — весь опыт улова; `stats.xpGained` равен опыту, полученному полосой.
  2. Темп: сид 1, «рука» из теста — каждый раз, когда сеть `ready`, бросок в ближайший к плоту предмет, через 0,8 с после падения — удержание до возврата. За 60 с игрового времени уровень ≥ 2. Тест пишет `build/probe/m0-02-game.json`: `{ seed, levelAt60s, level2Ms, throws, itemsCaught, xpGained }` — первая точка темпа для бота M0-07; эти числа — в отчёт.
- `tests/e2e/smoke.spec.ts` — новый сценарий `сеть ловит и даёт опыт`: найти предмет через `__game.items()`, нажать в его экранную точку `page.mouse.click` (координаты — `__game.toScreen`); сразу после щелчка `state().net.state` не `ready`; затем `page.mouse.down()` и ждать, пока сеть вернётся (`ready`, до 8 с), `page.mouse.up()`; подождать 1,5 с (значки долетают) и проверить `state().xp > 0` или уровень > 1; если сеть вернулась пустой — повторить, до 4 раз. Снимки — `build/shots/m0-02_<проект>.png` в момент, когда сеть в воде.

## Критерии готовности
- `npm run check` зелёный; в отчёте — число тестов и числа `build/probe/m0-02-game.json` (уровень за 60 с и время 2-го уровня).
- Вручную (`npm run dev`, мышь): бросок, удержание, отпускание (сеть стоит), улов, значки, полоса опыта, «Новый уровень!»; на телефоне через Network-адрес Vite или в эмуляции DevTools — касание бросает по отпусканию, а отпускание после удержания сеть снова не бросает.
- `src/core/` без PixiJS, DOM и `Math.random`; числа — из `DATA`.
- `docs/tasks/README.md`: «сделано ДД.ММ» в строке M0-02.

## Чего не делать
- Окна выбора и карточек нет (M0-05): уровень просто растёт.
- Схемы Б, В, Г — в M0-03; здесь только интерфейс схемы и А.
- Копья нет (M0-06).
- Дальность от ближайшей клетки не делать — плот пока из одной клетки (M0-05).
