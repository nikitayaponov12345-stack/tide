# M0-01 — данные в коде и поток Лагуны

**Цель.** Таблицы `data/*.csv` читаются в типизированные структуры и становятся единственным источником чисел. Мир переходит на координаты с началом в центре плота. Поток предметов идёт по таблицам: частота — по уровню, состав — предметы Лагуны с открытием по уровням и долями, на старте поле засеяно.

**Что изменится в игре.** При запуске поле уже засеяно ветками (около двадцати) и три лежат рядом с плотом; дальше они приплывают по одной в секунду справа и сверху. В локации 40 уровней (решение Никиты 08.10), поток растёт с уровнем до 9 предметов в секунду к 21-му. В центре — одна клетка плота (вместо креста из пяти). Вода — цвета Лагуны. В отладочной строке — уровень и число предметов. В отладке клавиши `]` и `[` поднимают и опускают уровень: с 3-го плывут кокосы, с 4-го бочонки, с 6-го мотки каната, с 9-го сундучки, и поток с каждым уровнем гуще.

Перед началом прочитай `CLAUDE.md`, `docs/ARCHITECTURE.md` (§1–5) и `data/README.md`.

## 1. Разбор CSV — `src/core/data/csv.ts`

`export function parseCsv(text: string, file: string): string[][]` — те же правила, что в `tools/data-check.mjs`: разделитель запятая, поле в кавычках может содержать запятые и переводы строк (CRLF внутри кавычек становится LF), `""` внутри кавычек — одна кавычка, перевод строки LF или CRLF, пустые строки пропускаются. BOM в начале текста → `throw new Error(\`${file}: BOM в начале файла\`)`.

## 2. Таблицы — `src/core/data/tables.ts`

Типы и имена полей — ровно такие (camelCase из имён колонок):

```ts
export type Role = 'light1' | 'light2' | 'light3' | 'medium' | 'heavy' | 'loot' | 'boss_chest' | 'bottle';
export const FLOW_ROLES: readonly Role[] = ['light1', 'light2', 'light3', 'medium', 'heavy'];

export interface LevelRow { level: number; xpStep: number; flowPerS: number }
export interface LocationRow {
  id: string; order: number; nameKey: string; xpMult: number; enemyHpMult: number; enemyDmgMult: number;
  currentDx: number; currentDy: number; enemyId: string; bossId: string; eventId: string;
  newBuildings: string[]; waterColor: string;
}
export interface ItemRow {
  id: string; location: string; role: Role; nameKey: string; xp: number; weight: number; radius: number;
  unlockLevel: number | null; share: number;
}
export interface SailorTier {
  tier: number; netRadius: number; netCapacity: number; throwRange: number; pull: number;
  spearDamage: number; spearCount: number; weaponKey: string;
}
export interface CardRow {
  id: string; kind: 'raft' | 'building' | 'building_upgrade' | 'sailor_upgrade' | 'fallback'; target: string;
  stat: string | null; value: number | null; mode: 'add' | 'mul' | 'set' | null;
  maxPerLocation: number | null; minLevelGap: number | null;
  requires: string | null;   // boss_visit_seen | spear_owned | level:N | has:<постройка> — как в data/README.md
  nameKey: string; descKey: string;
}
export interface ForcedCard { location: string; trigger: string; card: string }
/** Таблицы, которые типизируются позже (M1): buildings, enemies, enemy_hp, bosses, events, ads. Ключи — имена колонок файла как есть (snake_case). */
export type GenericRow = Readonly<Record<string, string>>;

export interface RawTables {
  constants: string; levels: string; locations: string; items: string; sailor: string; buildings: string;
  cards: string; forcedCards: string; enemies: string; enemyHp: string; bosses: string; events: string;
  ads: string; strings: string;
}

export interface Tables {
  readonly levels: readonly LevelRow[];
  readonly locations: readonly LocationRow[];
  readonly items: readonly ItemRow[];
  readonly sailor: readonly SailorTier[];
  readonly cards: readonly CardRow[];
  readonly forcedCards: readonly ForcedCard[];
  readonly buildings: readonly GenericRow[];
  readonly enemies: readonly GenericRow[];
  readonly enemyHp: readonly GenericRow[];
  readonly bosses: readonly GenericRow[];
  readonly events: readonly GenericRow[];
  readonly ads: readonly GenericRow[];
  /** Значение из constants.csv; нет ключа → throw Error('constants.csv: нет ключа <key>'). */
  num(key: string): number;
  /** Нет локации → throw. */
  location(id: string): LocationRow;
  /** Опыт, чтобы перейти с level − 1 на level, при силе локации xpMult. */
  levelStep(level: number, xpMult: number): number;
  /** Предметов в секунду на уровне level. */
  flowPerS(level: number): number;
  /** Предметы потока локации (роль из FLOW_ROLES) в порядке файла. */
  flowItems(locationId: string): readonly ItemRow[];
  /** Нет предмета → throw. */
  item(id: string): ItemRow;
  /** Нет яруса → throw. */
  sailorTier(tier: number): SailorTier;
  /** Строка перевода; нет ключа → throw. */
  text(key: string, lang: 'ru' | 'en'): string;
}

export function loadTables(raw: RawTables): Tables;
```

Правила загрузки:
- Первая строка каждого файла — заголовок; он должен совпасть с колонками из `tools/data-check.mjs` (тот же порядок). Не совпал → `throw` с именем файла, например `data/levels.csv: заголовок …`.
- Обязательное число пустое или не число → `throw` с `файл:строка` и именем колонки так, как оно в файле (`data/items.csv:4: weight …`, `data/items.csv:7: unlock_level …`). Номер строки — индекс строки данных + 2 (заголовок — строка 1). Необязательные числа — `unlock_level`, `value`, `max_per_location`, `min_level_gap` — пустая ячейка даёт `null`. Пустая строковая ячейка `stat`, `mode`, `requires` → `null`.
- Имена файлов в ошибках: `data/constants.csv`, `data/levels.csv`, … , `translations/strings.csv`.
- `levelStep(level, xpMult)`: при 2 ≤ level ≤ последний уровень таблицы (40) — `levels[level − 1].xpStep × xpMult`; при level > 40 — `(xpStep последнего уровня + num('endless_xp_step_add') × (level − 40)) × xpMult`; level < 2 → `throw`.
- `flowPerS(level)`: при level ≤ 40 — из таблицы; при level > 40 — `Math.min(num('endless_flow_cap'), flowPerS(40) + (level − 40) × num('endless_flow_per_level'))`.
- Формулы для уровня выше 40 — запасные: по решению Никиты локация кончается на 40-м, бесконечный режим — предложение. Они нужны, чтобы отладка и тесты на уровне выше 40 не падали.
- `newBuildings` — ячейка, разбитая по `|`; пустая → `[]`.

## 3. `src/data.ts` — таблицы для игры и тестов

```ts
import constants from '../data/constants.csv?raw';
// … остальные 12 таблиц data/*.csv и translations/strings.csv так же
import { loadTables, type Tables } from './core/data/tables';

export const DATA: Tables = loadTables({ constants, levels, locations, items, sailor, buildings, cards, forcedCards, enemies, enemyHp, bosses, events, ads, strings });
```

Vite встраивает текст файлов в сборку (сетевых запросов нет), Vitest понимает `?raw` так же; объявление модулей `*?raw` уже есть в `vite/client`. Ядро (`src/core/`) `src/data.ts` не импортирует — таблицы приходят в конструкторы.

## 4. Мир — `src/core/world.ts` (заменяет заглушку этапа 0)

```ts
export interface WorldConfig {
  halfW: number;      // полуразмеры поля видимости, точки дизайна
  halfH: number;
  speedMult: number;  // 1 в горизонтали, num('current_portrait_mult') в портрете
  locationId: string; // 'lagoon'
  level: number;      // 1
}
export interface Item {
  id: number; kind: string; role: Role; xp: number; x: number; y: number;   // xp — опыт из items.csv, без силы локации (её умножает M0-02)
  radius: number; weight: number; speed: number; phase: number;
}
export class World {
  readonly items: Item[];
  timeMs: number;
  spawned: number;   // появились из потока
  seeded: number;    // засеяны на старте
  constructor(cfg: WorldConfig, data: Tables, rng: Rng);
  get level(): number;
  setLevel(level: number): void;                         // поток и открытые предметы — по новому уровню; предметы в воде остаются, накопитель потока не сбрасывается
  resize(halfW: number, halfH: number, speedMult: number): void;
  reset(): void;                                         // для M0-03 «Ещё раз»: убрать все предметы, обнулить накопитель потока и spawned, засеять заново; timeMs не меняется, id продолжают счёт
  step(dtMs: number): void;
  removeItem(id: number): Item | undefined;              // для сети в M0-02
  rollKind(): ItemRow;                                   // выбор вида по долям среди открытых (тратит один бросок rng)
  velocityOf(item: Item): { vx: number; vy: number };    // текущая скорость, точек в секунду
}
```

Правила:
- **Координаты.** Начало — центр плота (центр клетки моряка). Поле — прямоугольник `[−halfW, halfW] × [−halfH, halfH]`. Запас `MARGIN = 60` точек — техническая константа в коде: предмет дальше этого за краем поля убирается.
- **Скорость предмета.** Направление — нормированный вектор `(currentDx, currentDy)` локации. Величина — `current_speed × speedMult × item.speed × (1 + item_wobble × sin(2π × timeMs / item_wobble_period_ms + item.phase))`. `item.speed` — `rng.range(item_speed_min, item_speed_max)`, `item.phase` — `rng.range(0, 2π)`.
- **Порядок шага** — как у заглушки: `timeMs += dtMs` → движение → удаление ушедших → появление новых.
- **Поток.** Накопитель в игровом времени: интервал `1000 / flowPerS(level)` мс; `while (acc + TIME_EPS >= interval) { acc -= interval; spawn(); }`. За долгий шаг появляется столько предметов, сколько положено.
- **Место появления** — за тем краем, откуда идёт течение, на `MARGIN / 2` за полем; край выбирается с весом «длина края × составляющая скорости поперёк него», как в заглушке.
- **Вид предмета** — `rollKind()`: `r = rng.next() × сумма share` открытых предметов (`unlockLevel ≤ level`) из `flowItems(locationId)`, перебор в порядке файла.
- **Порядок бросков `rng` при появлении:** край, место вдоль края, вид, `speed`, `phase`.
- **Засев** (в конструкторе и в `reset()`): `Math.round(seed_seconds × flowPerS(level))` предметов равномерно по полю, но не ближе `seed_near_raft_max_px` к центру (повторный бросок места, если ближе); затем `seed_near_raft` предметов на расстоянии `rng.range(seed_near_raft_min_px, seed_near_raft_max_px)` от центра под углом `rng.range(0, 2π)`. Вид, `speed`, `phase` — как при появлении. Порядок бросков: для поля — x, y (повтор при отказе), вид, speed, phase; у плота — угол, расстояние, вид, speed, phase. `seeded` — их число; в `spawned` они не входят.

## 5. Отрисовка — `src/game/view.ts`

- Вода — цвет `waterColor` локации.
- Плот — одна клетка `cell_px` × `cell_px` в центре поля (заглушечный коричневый `#c58b4f`) вместо креста из пяти клеток.
- Предметы — круги радиусом из таблицы, цвет по роли (цвета — константы отрисовки, не баланс): light1 `#e9d8a6`, light2 `#f4a261`, light3 `#c9ada7`, medium `#8d6e63`, heavy `#ffd166`, loot `#e76f51`, boss_chest `#b5838d`, bottle `#a8dadc`.
- Мир рисуется со сдвигом на центр поля дизайна (`DESIGN[layout].w / 2`, `h / 2`).

## 6. Связка — `src/main.ts`

- Мир: `halfW`, `halfH` — половины `DESIGN[layout]`; `speedMult` — 1 в горизонтали и `DATA.num('current_portrait_mult')` в портрете; `locationId: 'lagoon'`, `level: 1`, `new Rng(1)`.
- Смена раскладки: `world.resize(…)`; предметы остаются на своих местах относительно плота.
- Отладочные клавиши — только в режиме разработки (`import.meta.env.DEV`) или с `?debug=1` в адресе: `]` — уровень +1 (не выше 50), `[` — уровень −1 (не ниже 1). Клавиши — по `e.code` (`BracketRight`, `BracketLeft`): в русской раскладке `e.key` у них «ъ» и «х».
- Отладочная строка: `Прилив 0.0.2 · landscape · 60 к/с · уровень 1 · предметов 24` — она отладочная и без перевода. `VERSION = '0.0.2'`, в `package.json` — `"version": "0.0.2"`.

## 7. Отладка — `src/debug.ts`

Добавить в `window.__game`:
- `world()` → `{ timeMs, items, spawned, seeded, level, location, byRole }`, где `byRole` — сколько предметов каждой роли сейчас в воде (`Record<Role, number>`, нули тоже);
- `setLevel(n: number): void`;
- `items(): Array<{ id: number; kind: string; role: Role; x: number; y: number; radius: number }>` — координаты мира;
- `toScreen(x: number, y: number): { x: number; y: number }` — точка мира в координатах окна (CSS-пиксели) с учётом масштаба и сдвига `fitDesign`: по ней тесты Playwright и боты будут нажимать (M0-02).

## 8. Тесты

`tests/unit/world.test.ts` заменяется целиком — тесты заглушки этапа 0 уходят, их правила остаются в новых тестах (пункты 1–5). Остальные тесты этапа 0 (`clock`, `layout`, `rng`) не трогать. Числа в тестах мира берутся из `DATA`.

- `tests/unit/csv.test.ts`: (1) простая таблица 2×3; (2) поле в кавычках с запятой; (3) `""` внутри кавычек; (4) CRLF даёт те же строки, что LF; (5) пустые строки и перевод строки в конце пропускаются; (6) BOM → ошибка с именем файла.
- `tests/unit/data.test.ts` — сторож таблиц (исключение TESTPLAN §1, здесь числа вписаны): (1) 40 уровней, сумма `xpStep` со 2-го по 40-й — 38211; (2) `levelStep(2, 1)` = 6, `levelStep(40, 2)` = 3120, `levelStep(41, 1)` = 1575; (3) `flowPerS(1)` = 1, `flowPerS(10)` = 4.6, `flowPerS(21)` = 9, `flowPerS(41)` ≈ 9.05, `flowPerS(200)` = 11; (4) `flowItems('lagoon')` — пять предметов `branch, coconut, keg, rope, small_chest`, доли дают 100; (5) `num('nope')` бросает ошибку, `text('loc.lagoon', 'ru')` — «Лагуна», `'en'` — «Lagoon»; (6) испорченный заголовок → ошибка с именем файла; (7) пустое обязательное число → ошибка с `файл:строка` и именем колонки (например, пустой `weight` во второй строке данных `items.csv` → `data/items.csv:3: weight`).
- `tests/unit/world.test.ts` (числа в скобках — для сверки; в тестах — выражения через `DATA`, как написано до скобок):
  1. Независимость от частоты кадров: 10 с при 30, 60 и 144 кадрах в секунду через `FixedStep` — `spawned` одинаков и равен 10 (1 уровень).
  2. Один шаг `step(5000)` на 1 уровне — `spawned` = 5.
  3. Одинаковый сид — одинаковые предметы через 20 с (глубокое равенство); другой сид — другие.
  4. Через 120 с все предметы в пределах поля ± `MARGIN`; `items.length` меньше `seeded + spawned`.
  5. Первый предмет из потока (после засева) появляется за правым (`x > halfW`) или верхним (`y < −halfH`) краем — течение Лагуны (−1, 1).
  6. Поток по уровню: на 10 уровне за 60 с — `spawned === Math.floor(60 * DATA.flowPerS(10) + 1e-9)` (276).
  7. Открытие: на 1 уровне из 100 появившихся все — `branch`; на 3-м — только `branch` и `coconut`; на 4-м добавляется `keg`; на 9-м за 2000 появлений встречаются все пять.
  8. Доли: на 9 уровне 20 000 вызовов `rollKind()` — доля каждого вида в пределах ±1,5 процентного пункта от `share`.
  9. Засев: на 1 уровне `seeded` = `Math.round(seed_seconds × flowPerS(1)) + seed_near_raft` (23); ровно `seed_near_raft` предметов лежат на расстоянии от `seed_near_raft_min_px` до `seed_near_raft_max_px` от центра; на 10 уровне — по той же формуле (95). У каждого предмета `xp` — из `items.csv` его вида.
  12. `reset()`: предметы засеяны заново (`seeded` как при старте), `spawned` = 0, `timeMs` прежний, id новых предметов больше прежних.
  10. Портрет: при `speedMult` = 0,8 скорость предмета (`velocityOf`) в 0,8 раза меньше, чем при 1, в тот же момент.
  11. `setLevel` оставляет предметы в воде и меняет поток: ровно 10 с на 1 уровне (накопитель пуст), затем `setLevel(10)` — предметы в воде те же, а за следующие 10 с появляется `Math.floor(10 * flowPerS(10) + 1e-9)` (46).
- `tests/e2e/smoke.spec.ts`: сразу после `ready` — `world().level === 1`, `world().seeded >= 23`, `world().items > 0`; через 1,5 с `spawned > 0`; снимок — `build/shots/m0-01_<проект>.png`; остальные проверки этапа 0 остаются.

## Критерии готовности
- `npm run check` зелёный; тестов Vitest — около 35 (10 прежних, 6 csv, 7 data, 12 world — число ориентировочное).
- На снимках: вода Лагуны, одна клетка в центре, светлые предметы разбросаны по полю и три — у клетки; в отладочной строке — уровень.
- В `src/core/` нет `Math.random` и нет чисел баланса — только `data.num(…)` и таблицы (константы `MARGIN`, `TIME_EPS`, `STEP_MS` — технические).
- `docs/tasks/README.md`: «сделано ДД.ММ» в строке M0-01.

## Чего не делать
- Сети, опыта и ввода нет — это M0-02.
- `buildings`, `enemies` и другие таблицы M1 — только `GenericRow`, без типов.
- `data/*.csv` не менять. Если число в таблице мешает тесту — в отчёт.
