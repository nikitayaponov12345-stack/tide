# M1-15 — финальный бой: краб-великан

**Цель.** Из GDD («Угрозы: враги, события, боссы», раздел «Боссы»; решение Никиты 11.10): на 40-м уровне — финальный бой с крабом-великаном. Полоса опыта становится полосой его прочности. Победа — большой сундук и окно «Локация пройдена». У шхуны остаются только визиты.

Как понято (толкование Claude, Никита может поправить):
- бой начинается на `level_to_clear` (40), когда окна уровней показаны и нет ни шторма, ни визита шхуны. Если идёт шторм или визит, бой ждёт его конца. После первого шторма бой ждёт и первого визита: он начинается сразу за штормом;
- краб всплывает с той стороны, где до края поля дальше: на ПК — слева или справа, на телефоне — сверху или снизу. От центра ближайшей целой клетки до края краба — 150 точек (`boss_final_distance_px`, как у визита шхуны), так что копьё моряка его достаёт;
- краб ползёт к этой клетке со скоростью 30 точек в секунду и бьёт её на 50 (центральная клетка неуязвима). Потом стоит 1 с, ныряет на 2 с и всплывает с противоположной стороны. Над водой его бьют копьё моряка и копейные башни, под водой — нет. Поэтому моряку приходится перебегать по плоту, а башни с дальнего края до краба не достают;
- краб не ворует, а бьёт клетки. Никита 11.10: «крабы-вожаки не воруют, просто наносят больший урон» — читаю это так, что и великан не ворует;
- прочность — 180, подобрана ботом по правилу GDD «бой 35–60 с». При 500 из таблицы бой шёл 60–224 с (медиана 131 с), при 180 — 19–108 с (медиана 46 с). Без копейных башен бой длился 108 с, с восемью — 19 с;
- во время боя новые мелкие крабы не приходят, спокойное время шторма и визитов стоит, кнопки буста нет. Уровень выше 40-го не растёт: полоса стоит полной, лишний опыт идёт только в рейтинг;
- победа: большой сундук — 10 % опыта локации, 1624 опыта; он сразу идёт в рейтинг. Открывается окно «Локация пройдена»: оно шлёт «игра остановлена» и переживает перезагрузку. В записи появляется `campaign.passed: ["lagoon"]`;
- карты ещё нет (M2), поэтому кнопка окна — «Играть дальше». Окно закрывается, уровни идут дальше 40-го по формулам, которые уже есть: `levelStep` и поток за 40-м уровнем считают бесконечный режим GDD. Бой больше не приходит. «Сундук ×2» — следующей задачей;
- заодно — английская подпись «Открыть за рекламу» короче: «Unlock with ad» (замечание из отчёта M1-14).

**Что изменится в игре.**
- На 40-м уровне всплывает краб-великан: тёмно-красный круг с двумя клешнями к плоту (заготовка до арта). Полоса опыта красная, на ней подпись «Краб-великан».
- Краб ползёт к плоту, бьёт крайнюю клетку, ныряет и всплывает с другой стороны.
- После победы — окно «Локация пройдена»: «Лагуна», «Большой сундук: +1624 опыта» и кнопка «Играть дальше».
- Версия — 0.0.22: в `main.ts`, `package.json` и в двух полях `version` в `package-lock.json`.

Условие: M1-14 сделана. Перед началом прочитай:
- `CLAUDE.md`;
- в `docs/GDD.md` — «Угрозы: враги, события, боссы» (раздел «Боссы»: финальный бой и таблица боссов) и строку «Финал Лагуны» в «Решениях»;
- файлы:
  - `src/core/boss.ts`, `src/core/game.ts`, `src/core/game-snapshot.ts`, `src/core/progression.ts`, `src/core/spear-towers.ts`, `src/core/save.ts`, `src/core/stats.ts`;
  - `src/game/input/control.ts`, `src/game/view.ts`, `src/ui/hud.ts`, `src/ui/pause.ts`, `index.html` (стили `#ui .xpbar` и `#ui .pause-*`), `src/main.ts`, `src/debug.ts`;
  - `src/sim/bot.ts`, `src/sim/run.ts`, `src/sim/report.ts`, `sim/tempo.sim.ts`, `tools/data-check.mjs`;
- таблицы: `data/bosses.csv`; в `data/constants.csv` — `boss_final_distance_px`, `level_to_clear` и `boss_big_chest_share`;
- тесты `tests/unit/boss.test.ts`, `tests/unit/spear-towers.test.ts`, `tests/unit/save.test.ts`, `tests/unit/control.test.ts`, `tests/e2e/boss.spec.ts`.

**Концы строк.** У части файлов концы строк CRLF: `game.ts`, `stats.ts`, `view.ts`, `debug.ts`, `main.ts`, `index.html`, `tools/data-check.mjs`, `data/README.md`, `package*.json`, `save.test.ts`. Сохраняй их, иначе `git diff` покажет файл целиком. Новые файлы — LF.

**Проверка до передачи (11.10).** Задачу собрал прототипом Claude на коде, где сделана M1-14:
- `npm run check` зелёный: Vitest — 311 тестов (15 новых), Playwright — 56 сценариев и 6 пропусков (2 новых прогона). Число новых тестов — ориентир: у тебя после M1-14 тестов больше, чем у прототипа (305 против 296);
- `npm run sim`: ворота как после M0-09 (медиана 7,67 с). Кривая до 40-го уровня не меняется, в отчёте — новый раздел «Финальный бой».

| | Прототип после M1-14 | После M1-15 |
|---|---|---|
| 10-й уровень | 4,8 мин (6,0) | 4,8 мин (6,0) |
| 20-й уровень | 9,3 мин (11,3) | 9,3 мин (11,3) |
| 40-й уровень | 20 из 20, медиана 18,3 мин (21,8) | 20 из 20, медиана 18,3 мин (21,8) |
| Финальный бой | — | 20 из 20, медиана 46 с (19–108 с), в цели 35–60 с — 8 прогонов |
| «Локация пройдена» | — | медиана 19,2 мин игрового времени (23,0 по часам) |

От 40-го уровня до начала боя — медиана 0 с, худшая 28 с (шли шторм или визит). Ударов краба по клеткам — от 3 до 16 за бой.

Прототип собран на своих версиях M1-08…M1-14, у тебя они чуть другие, и кривая у тебя была 18,9 мин (22,6) на 40-м уровне. Поэтому числа боя могут отличаться на несколько секунд.

## 1. Данные

- `data/bosses.csv`:
  - у строки `schooner` очистить `final_hp`, `final_attack_period_s` и `final_damage`: у шхуны только визиты;
  - новая строка сразу за ней: `giant_crab,lagoon,boss.giant_crab,crawl_dive,,,,,180,,50,,,,` — финальный бой, прочность 180, удар по клетке 50, `chest_item` пусто.
- `data/constants.csv`:
  - у `boss_final_distance_px` пояснение «Финальный бой: от центра ближайшей клетки плота до края босса столько; первая сторона — та, где до края поля дальше»;
  - четыре строки после `boss_big_chest_share`:
    - `boss_crab_radius_px,64,px,"Краб-великан (финал Лагуны, решение Никиты 11.10): радиус для копья и отрисовки (заготовка до арта, M4)"`;
    - `boss_crab_speed,30,px/s,Краб-великан ползёт к клетке плота с такой скоростью (мелкий краб — 40)`;
    - `boss_crab_wait_ms,1000,ms,"Краб-великан после удара стоит у клетки столько, потом ныряет (как мелкий краб)"`;
    - `boss_crab_dive_ms,2000,ms,Краб-великан под водой столько и всплывает с противоположной стороны плота`.
- `translations/strings.csv`:
  - четыре новые строки: `boss.giant_crab,Краб-великан,Giant Crab` (за `boss.ghost_ship`), `ui.big_chest,Большой сундук: +{xp} опыта,Big chest: +{xp} XP` (за `ui.ad_unlock`), `ui.cleared,Локация пройдена,Location cleared` (за `ui.choose_card`), `ui.play_on,Играть дальше,Keep playing` (за `ui.place`);
  - у `ui.ad_unlock` английская подпись — `Unlock with ad`.
- `data/README.md`:
  - у `constants.csv` — 75 строк, в «Когда нужна» дописать «; M1-15 — `boss_crab_*` краба-великана»;
  - у `bosses.csv` — 5 строк, в «Что» дописать «Финальный босс локации — её строка с `final_hp`, ровно одна: в Лагуне это краб-великан, а у шхуны только визиты (решение Никиты 11.10)», в «Когда нужна» — «; M1-15 — краб-великан, финальный бой»;
  - у `strings.csv` — 130 строк.
- `tools/data-check.mjs`:
  - в обязательные константы и в проверку «больше 0» добавить `boss_final_distance_px`, `boss_big_chest_share` и четыре `boss_crab_*`;
  - сразу за проверкой `boss_visit_gap_px` — такая же для `boss_final_distance_px` (сообщение «копьё не достанет финального босса»), с комментарием «И финального босса (GDD, «Финальный бой»: проиграть нельзя и без копейных башен)»;
  - в `bosses.csv`:
    - `final_hp` — необязательное;
    - `chest_item` проверять, только если он не пуст. У `pass_bottom_edge` пустой `chest_item` — ошибка «у босса с визитами нужен chest_item»;
    - у `crawl_dive` обязательны `final_hp` и `final_damage` (оба ≥ 1);
  - в цикле по локациям: строк `bosses.csv` этой локации с `final_hp` — ровно одна. Сообщение — «строк bosses.csv с final_hp — N, нужна одна (финальный босс)».

## 2. Ядро — `src/core/final-boss.ts` (новый)

`FinalBoss` — финальный бой. Случайности в нём нет, своего `Rng` нет. Комментарий класса — из «Как понято».
- `type FinalPhase = 'none' | 'crawl' | 'wait' | 'dive' | 'defeated'`. Значения: боя ещё не было, ползёт к клетке, ударил и стоит, под водой, побеждён.
- Снимок `FinalBossSnapshot`: `{ phase, side, x, y, targetGx, targetGy, hp, leftMs }`. Сторона — `BossSide` из `boss.ts`.
- Конструктор `(data, locationId, world, stats)`:
  - строка — та, где `location === locationId`, `final_hp !== ''` и `behavior === 'crawl_dive'`. Нет такой — `id = null`, боя нет;
  - `id` и `nameKey` берутся из строки;
  - `maxHp = final_hp × enemy_hp_mult`, удар `final_damage × enemy_dmg_mult` (закрытое поле);
  - `radius`, `speed`, `waitMs` и `diveMs` — из `boss_crab_*`, `gap` — из `boss_final_distance_px`;
  - `level` — `level_to_clear`;
  - `chestXp = boss_big_chest_share × Σ levelStep(l, xp_mult)` по `l` от 2 до `level`.
- Геттеры: `fighting` — фаза `crawl`, `wait` или `dive`; `present` — `crawl` или `wait` (краб над водой); `defeated`.
- `start(raft, side?)`. `id === null` или фаза не `none` — ничего не делать. Иначе `hp = maxHp` и всплытие у `side` или у стороны, где воды больше:
  - выдача стороны `reachOut(c, side) = sign × (left/right ? gx : gy) × cell_px`, где `sign` — +1 у `bottom` и `right`;
  - воды у стороны — `(left/right ? halfW : halfH) − reachOut(цели этой стороны)`. Берётся наибольшая, из равных — первая по `BOSS_SIDES`. На ПК при одной клетке это `left`, на телефоне — `bottom`.
- Цель стороны `side` — целая клетка с наименьшим ключом `[−reachOut, |вдоль|, вдоль]` (сравнение по порядку). Здесь «вдоль» — `gy` у `left`/`right` и `gx` у `top`/`bottom`. Иначе говоря: самая крайняя к стороне, из равных — ближе к середине стороны, затем — с меньшей координатой. Целая клетка есть всегда: центральная неуязвима.
- Всплытие у `side`:
  - `out = sign × min(half − radius, reachOut(цели) + gap + radius)`, где `half` — `halfW` у `left`/`right` и `halfH` у `top`/`bottom`;
  - середина — `(out, gy × cell)` у `left`/`right` и `(gx × cell, out)` у `top`/`bottom`;
  - запомнить сторону и клетку цели, фаза `crawl`, `leftMs = 0`.
- `step(dtMs, raft)`. Не бой — ничего. Иначе `stats.finalFightMs += dtMs`, затем цикл по остатку шага `t` (правило 1), пока `t > TIME_EPS` и бой идёт:
  - `crawl`:
    - `d` — расстояние до центра клетки цели; `need = max(0, d − cell_px / 2 − radius)` — краб касается клетки краем; `can = speed × t / 1000`;
    - сдвинуться к центру на `min(need, can)`. Если `need > can` — шаг кончен;
    - иначе `t −= need / speed × 1000` и удар: `stats.finalStrikes++`, `stats.finalCellDamage += raft.damage(цель, удар)`. Цель не меняется, даже если клетку разбили по дороге. Дальше фаза `wait`, `leftMs = waitMs`;
  - `wait` и `dive`:
    - если `leftMs > t + TIME_EPS` — `leftMs −= t`, шаг кончен;
    - иначе `t −= leftMs`, `leftMs = 0`. Из `wait` — в `dive` с `leftMs = diveMs`, из `dive` — всплытие у противоположной стороны (`bottom` ↔ `top`, `left` ↔ `right`).
- `nearestPoint(x, y)` — ближайшая точка круга краба; изнутри круга — сама точка.
- `hit(x, y, reach, damage)` — как у мелкого врага:
  - не над водой, `!(damage > 0)` или расстояние до середины `≥ reach + radius` → `[]`;
  - иначе `dealt = min(damage, hp)`, `hp −= dealt`, `stats.finalDamage += dealt`;
  - `hp ≤ 1e-9` → `hp = 0`, фаза `defeated`;
  - ответ — `[{ x, y, dealt }]` с серединой краба.
- `debugHp(hp)` — в бою и при `hp > 0`: `this.hp = min(hp, maxHp)`.
- `snapshot()` и `restore(s)` — поля снимка.

## 3. Ядро — `game-threats.ts` (новый), `game.ts`, `game-snapshot.ts`, `progression.ts` и другие

`game.ts` растёт, поэтому шаг угроз переезжает в `src/core/game-threats.ts` (правило 4, как `game-cards.ts` в M1-11). Комментарий файла: «Угрозы на шаге игры: событие, визиты босса, буст, предложение буста за рекламу и финальный бой (с M1-15 — в своём файле, иначе game.ts перерос бы 400 строк)».

```ts
export function stepThreats(g: Game, dtMs: number): void {
  const fb = g.finalBoss;
  if (fb.phase === 'none' && g.progression.level >= fb.level && g.pending.length === 0 && !g.events.active && !g.boss.visiting) fb.start(g.raft);
  const fight = fb.fighting;
  g.events.step(dtMs, !g.boss.visiting && !g.boost.active && !fight);
  g.boss.step(dtMs, !g.events.active && !g.boost.active && !fight, g.events.count, g.raft);
  g.boostOffer.step(dtMs, !g.events.active && !g.boss.visiting && !g.boost.active && !fight);
  g.boost.step(dtMs, g.stats.enemiesKilled, bottleInNet(g), g.boostOffer.shown > 0);
  g.world.flowMult = g.events.flowMult * (g.boost.active ? g.boost.flowMult : 1);
  fb.step(dtMs, g.raft);
}
```

Над функцией — комментарий о порядке: прежний комментарий из `Game.step` плюс финальный бой. Ещё в этом файле:
- `bottleInNet(g)` — переезжает из `Game` (закрытая функция файла);
- `enemiesContext(g)` (экспорт) — переезжает из `Game`, `blocked: g.boost.active || g.finalBoss.fighting`;
- `finalHit(g, x, y, reach, damage)` (экспорт) — удар по финальному боссу. Если краб был жив, а после удара `defeated`, — победа:
  - `stats.bigChestXp += chestXp`;
  - `stats.xpGained += chestXp`;
  - `progression.addXp(chestXp)` — на пределе полоса просто полная;
  - `g.cleared = true`;
- `playOn(g)` (экспорт): окна нет → `false`; иначе `cleared = false`, `progression.maxLevel = levelCap(g)`, `true`;
- `levelCap(g)` (экспорт): `finalBoss.id !== null && (!finalBoss.defeated || g.cleared) ? finalBoss.level : Infinity`.

Правки в остальных файлах:
- `game.ts`:
  - поле `readonly finalBoss: FinalBoss` — создаётся сразу после `boss`;
  - поле `cleared = false` с комментарием «Открыто окно «Локация пройдена» (M1-15): мир стоит. Входит в снимок: после загрузки окно на месте»;
  - в конце конструктора — `this.progression.maxLevel = levelCap(this)`;
  - `spearTargets.hit` — ещё `...finalHit(this, x, y, reach, damage)`, комментарий — «враги, босс на визите и финальный босс»;
  - `paused` — ещё `|| this.cleared`;
  - `setMenu`: при `on` и `ad || cleared` — ничего;
  - `setRepair`: вход нельзя ещё и при `cleared`;
  - в `step` вместо шагов события, визита, предложения буста, буста и `flowMult` — `stepThreats(this, dtMs)`, с однострочным комментарием;
  - `spearTowers.step(…, [this.boss, this.finalBoss], …)`;
  - `enemiesContext(this)` — в `step` и в `debugSpawnEnemy`; закрытые `enemiesContext()` и `bottleInNet()` удалить;
  - `playOn(): boolean` — обёртка в одну строку (`playOn(this)`).

  У прототипа после правки 379 строк (было 386), у тебя — около 391.
- `game-snapshot.ts`:
  - необязательные поля `finalBoss?` («Финальный бой (с M1-15); в записи до M1-15 поля нет — боя ещё не было, на level_to_clear и выше он начнётся сразу») и `cleared?` («нет поля — закрыто»);
  - `snapshotGame` пишет оба;
  - `restoreGame` после `boostOffer`: `finalBoss` (если есть), `cleared = s.cleared ?? false`, затем `progression.maxLevel = levelCap(g)`.
- `progression.ts`: поле `maxLevel = Infinity` с комментарием «выше этого уровень не растёт (M1-15: до победы в финальном бою — level_to_clear); полоса на нём стоит полной, лишний опыт идёт только в рейтинг. Задаёт Game; в снимок не входит». В `addXp`:
  ```ts
  while (this.level < this.maxLevel && this.xp >= this.xpToNext()) { … }
  if (this.level >= this.maxLevel) this.xp = Math.min(this.xp, this.xpToNext());
  ```
- `boss.ts`:
  - геттер `present` — это `visiting`, комментарий «шхуна на поле: её видно и можно бить (цель копья, как у финального босса)»;
  - в комментарии `hit` — «(финального боя у шхуны нет — решение Никиты 11.10)».
- `spear-towers.ts`:
  - экспорт `interface BossTarget { readonly present: boolean; nearestPoint(x, y) }` с комментарием «Большая цель копья: шхуна на визите, финальный босс над водой (M1-15)»;
  - `nearestTarget(enemies, bosses: readonly BossTarget[], x, y, r)` — перебор присутствующих целей, ближайшая в радиусе (обновлять и `bestD`);
  - `SpearTowers.step(dtMs, enemies, bosses, targets, raft)`;
  - импорт `BossVisits` больше не нужен. В комментарии класса — «или большую цель (шхуну на визите, с M1-15 — и финального босса над водой)».
- `stats.ts` — счётчики `finalFightMs` (игровое время финального боя), `finalDamage` (урон по финальному боссу), `finalStrikes` (его ударов по клеткам), `finalCellDamage` (снятая ими прочность) и `bigChestXp` (опыт большого сундука, × сила локации; он же в `xpGained`).
- `save.ts`:
  - `makeSave`: `campaign.passed` — `[locationId]`, если `game.finalBoss.defeated`, иначе `[]`;
  - комментарий поля `campaign` — «Пройденные локации — с M1-15 (победа в финальном бою; карта — M2); открытая за рекламу воронка — с M1-14»;
  - комментарий `makeSave` — «…а пройденная локация — её, если финальный бой выигран».

## 4. Сигналы — `control.ts`

Окно «Локация пройдена» останавливает игру для площадки:
- метка `CLEARED = {}` рядом с `MENU`;
- `stopper()` возвращает `game.window ?? (game.cleared ? CLEARED : game.menu ? MENU : null)`;
- в комментарии класса — «окно выбора, «Локация пройдена» (M1-15) или пауза».

## 5. Интерфейс — `hud.ts`, `cleared.ts` (новый), `view.ts`, `index.html`, `main.ts`, `debug.ts`

- `hud.ts`: в бою (`finalBoss.fighting`) у полосы класс `boss`, заполнение — `hp / maxHp`, подпись — имя босса (`text(nameKey)`). Строка буста за ним — как сейчас. Комментарий класса дописать.
- `src/ui/cleared.ts` — `ClearedWindow(host, game, text, locationKey, onPlayOn)`:
  - затемнение `div.cleared-dim` с `data-testid="cleared"`, видно, пока `game.cleared`;
  - панель `cleared-panel` по размеру поля дизайна — как у паузы: `translate` и `scale` из `fitDesign`;
  - в колонке `cleared-col`:
    - заголовок `cleared-title` — `ui.cleared`;
    - `cleared-sub` — название локации;
    - `cleared-chest` с `data-testid="big-chest"` — `ui.big_chest`, где `{xp}` = `Math.round(finalBoss.chestXp)`;
    - кнопка `cleared-play` с `data-testid="play-on"` — `ui.play_on`, нажатие — `onPlayOn`.
- `index.html`:
  - `#ui .xpbar.boss .xpbar-fill { background: #e63946; }`;
  - стили окна по образцу паузы: `.cleared-dim` (как `.pause-dim`, `z-index: 10`), `.cleared-panel` (как `.pause-panel`), `.cleared-col` (как `.pause-col`, ширина 600, `text-align: center`, тень текста);
  - `.cleared-title` — 60px, 800, `#ffd166`; `.cleared-sub` — 34px, `margin-top: -16px`; `.cleared-chest` — 36px, 700, `#9be564`;
  - `.cleared-play` — высота 84, 30px, 700, фон `#2a9d8f`, рамка `3px solid #fff`, скругление 14px.
- `view.ts` — краб-великан над водой (заготовка до арта, M4):
  - свой слой `finalBoss` сразу за `boss`;
  - константа `GIANT = { body: 0x9d0208, claw: 0xd62828, rim: { width: 3, color: 0xffffff, alpha: 0.7 }, clawRadius: 0.4, clawAhead: 0.8, clawSpread: 0.75 }`;
  - две клешни — круги радиусом `0.4 × radius` впереди на `0.8 × radius` к центру плота и в стороны на `0.75 × radius`, поверх — тело. Под водой краб не рисуется;
  - в комментарии класса дописать «шхуна и краб-великан».
- `main.ts`:
  - `ClearedWindow` создаётся после `WalkHint`, с названием локации; `onPlayOn` — `if (game.playOn()) saver.save()`;
  - запись сразу после победы: в кадре после `control.frame`, когда `game.cleared` стало истинным, — `saver.save()` (запомнить прошлое значение);
  - `cleared.update(layout)` — в кадре;
  - в `state()`:
    - `finalBoss: { id, phase, side, x, y, radius, hp, maxHp, targetGx, targetGy, leftMs, level, chestXp }`;
    - `cleared`;
    - `levelCap` — `progression.maxLevel`, а `Infinity` — `null`;
  - команды `debugFinalBoss(side?)` (`game.finalBoss.start(game.raft, side)`) и `debugFinalBossHp(hp)` (`game.finalBoss.debugHp(hp)`).
- `debug.ts` — типы этих полей, команд и пяти новых счётчиков `stats`.

## 6. Бот и прогон — `bot.ts`, `run.ts`, `report.ts`

- `bot.ts`:
  - цель копья — `nearestTarget(g.enemies, [g.boss, g.finalBoss], …)`;
  - шаг к цели — при `g.boss.visiting || g.finalBoss.present`. `stepToBoss` идёт к ближайшей точке финального босса, если он над водой, иначе — к шхуне;
  - `pause()`: окно «Локация пройдена» — `windowMs` по часам, затем `g.playOn()`;
  - в комментарии класса — «ходит только к шхуне на визите и к финальному боссу».
- `run.ts`:
  - `SimOptions.untilLevel: number | 'cleared'` (комментарий «'cleared' — до победы в финальном бою (M1-15)»), `DEFAULT_SIM.untilLevel = 'cleared'`. Ворота в `tempo.sim.ts` задают `untilLevel: 2` сами — их не трогать;
  - `maxIters` — с `level_to_clear` вместо числа уровней при `'cleared'`;
  - победа — прогон кончен, окно не ждём: проверка в начале цикла, до паузы;
  - в `SimResult` новые поля:
    - `fightStartGameMs` — игровое время начала шага, в котором бой начался;
    - `fightMs` — `stats.finalFightMs` при победе, иначе `null`;
    - `clearedGameMs` и `clearedWallMs` — когда побеждён;
    - `finalStrikes` и `finalCellDamage`.
- `report.ts`:
  - константа `FIGHT_TARGET_MS = [35_000, 60_000]`;
  - раздел «## Финальный бой» перед «Прогонами»:
    - строка итогов: сколько прошли локацию; медиана боя и разброс; сколько боёв в цели; от 40-го уровня до начала боя — медиана и худшая; «Локация пройдена» — медиана игрового времени и по часам;
    - таблица «Сид | Ждал боя | Бой | Ударов по клеткам | Снято прочности | Пройдена, по часам».

## 7. Тесты

- `tests/unit/final-boss.test.ts` (новый):
  - таблицы: краб-великан — финальный босс Лагуны, `maxHp`, `radius`, `level`, `chestXp`; у шхуны `final_hp` пусто; у Рифа `id === null`, `start` ничего не делает;
  - всплытие (через `raft.restore`):
    - ПК, одна клетка — `left`, `x = −(gap + radius)`; телефон — `bottom`;
    - плот выдаётся влево — `right`, напротив центральной;
    - из крайних клеток `(−1, −1)`, `(−1, 1)`, `(−1, 2)` — `(−1, −1)`;
    - поле 250 × 250 — середина краба на `250 − radius`;
  - разбитая крайняя клетка — не цель: краб напротив следующей целой;
  - ход: ползёт столько шагов, сколько `(gap − cell / 2) / speed` (±1), бьёт клетку на `final_damage`, стоит `boss_crab_wait_ms`, ныряет на `boss_crab_dive_ms` (под водой `hit` даёт `[]`), всплывает с противоположной стороны; удар по центральной ничего не снимает; `finalFightMs` — всё прошедшее время;
  - 900 шагов по одному и 30 шагов по 30 дают то же (правило 1);
  - `hit`: мимо `reach + radius` — ничего, внутри — `min(урон, прочность)`; `debugHp(2)` и удар 5 — `defeated`; дальше ни удара, ни нового боя;
  - в `Game`:
    - на 39-м уровне боя нет, на 40-м — `crawl`;
    - шторм — бой ждёт его и первого визита после него;
    - визит шхуны — ждёт;
    - окно 40-го уровня — сначала оно;
  - в бой новые крабы не приходят, `calmMs` шторма и визитов не растут, предложений буста нет (`boostOffer.nextMs = 0` до боя);
  - на 40-м уровне `addXp` — уровень 40, полоса полная; `debugLevelUp` окна не даёт;
  - победа копьём моряка:
    - `bigChestXp` и прибавка `xpGained` — `chestXp`;
    - `cleared`, `paused`, уровень 40, `levelCap` 40;
    - пауза и ремонт не открываются;
    - `playOn` — `true`, второй — `false`; `debugLevelUp` даёт окно 41-го уровня, бой больше не начинается;
  - снимок:
    - посреди боя — продолжение как без перерыва;
    - после победы — окно и `levelCap` на месте, после `playOn` — `Infinity`;
    - запись без `finalBoss` и `cleared` на 43-м уровне — бой в первом шаге;
  - бот на плоту из 5 клеток в ряд, с копьём, на 40-м уровне побеждает: `finalDamage` = прочности, шагал, попадал копьём.
- `tests/unit/save.test.ts`:
  - тест «кампания: после победы в финальном бою локация — в passed (M1-15)»;
  - тест «финальный бой (M1-15): продолжение с записи, сделанной в нырке краба, идёт так же, как без перерыва»: `setLevel(40)`, 600 тактов игрока теста, шаги до `dive`, дальше как у копейной башни.
- `tests/unit/control.test.ts` — тест «Локация пройдена (M1-15): окно — stop, «Играть дальше» — start; пауза поверх окна не открывается».
- `tests/unit/spear-towers.test.ts` — вызов `towers.step(…, [boss], …)`.
- `tests/e2e/final-boss.spec.ts` (новый), оба проекта, `locale: 'ru-RU'`, `test.setTimeout(90_000)`:
  - `/?new=1`, нажатие по воде под плотом — пришёл `gameplayStart`;
  - `setLevel(40)`:
    - `expect.poll` — фаза `crawl`; сторона на ПК — `left` или `right`, на телефоне — `top` или `bottom`;
    - полная прочность, `levelCap` 40;
    - у `xpbar` класс `boss` и текст «Краб-великан»;
    - снимок `build/shots/m1-15_final_boss_<проект>.png`;
  - `debugSpawnEnemy(-3000, -3000)` (копьё), `debugFinalBossHp(1)`, слот копья, бросок в середину краба:
    - окно `cleared` видно, в нём «Локация пройдена» и «Лагуна»;
    - `big-chest` — «Большой сундук: +N опыта»;
    - последний сигнал — `gameplayStop`, мир стоит;
    - снимок `m1-15_cleared_<проект>.png`;
  - перезагрузка: окно на месте, фаза `defeated`, уровень 40, в `debugSave()` есть `"passed":["lagoon"]`;
  - «Играть дальше»:
    - окно скрыто, последний сигнал — `gameplayStart`, `levelCap` — `null`;
    - `debugLevelUp()` — 41-й уровень, у полосы нет класса `boss`;
    - ошибок в консоли нет.

## Проверка поломками

Все поломки ловит Vitest. Внеси по одной, убедись, что падает свой тест, и верни код:
1. бой начинается уровнем раньше (`level − 1`);
2. в бой мелкие крабы приходят (`blocked` без `finalBoss.fighting`);
3. нет предела уровня (`while` без `level < maxLevel`);
4. краба можно бить под водой (`present` — то же, что `fighting`);
5. `restoreGame` не восстанавливает `cleared`.

При отладке гоняй один файл тестов. Полный `npm run check` — в конце.

## Критерии готовности
- `npm run check` зелёный.
- `npm run sim`: ворота как после M0-09 (медиана 7,67 с), кривая до 40-го уровня — как после M1-14. В разделе «Финальный бой» — 20 из 20, медиана боя — в цели 35–60 с.
- Все 5 поломок пойманы.
- На снимках `m1-15_final_boss_*` краб целиком в поле, клешни смотрят на плот, полоса красная с подписью «Краб-великан». На `m1-15_cleared_*` окно не шире поля, кнопка «Играть дальше» не закрывает текст.
- `docs/tasks/README.md`: в строке M1-15 — «сделано ДД.ММ».

## Чего не делать
- Не делать карту и переход (M2), «Сундук ×2» и крабов-вожаков (следующие задачи), повадки финальных боссов других локаций.
- Не менять правила визитов шхуны, шторма, буста и колоды.
- Документы в `docs/`, кроме `docs/tasks/README.md`, не править: их ведёт Claude.
- Не коммитить и не пушить; `git stash`, `git reset` и `git checkout` не нужны (правило в `CLAUDE.md`).
