import { ROLES, type Role } from './data/tables';

/** Снимок счётчиков: все числовые поля Stats и xpByRole. */
export type StatsSnapshot = { [K in keyof Stats as Stats[K] extends number ? K : never]: number } & { xpByRole: Record<Role, number> };

/** Счётчики для бота и отладки. Пишут Game, Enemies, Towers, SpearTowers и BossVisits. */
export class Stats {
  throws = 0;        // успешные throwTo
  emptyThrows = 0;   // сеть вернулась пустой
  itemsCaught = 0;
  xpGained = 0;      // опыт по прилёту значков, уже × сила локации
  taps = 0;          // нажатия (noteTap от слоя ввода)
  steps = 0;         // шаги моряка (удачные walk)
  gameMs = 0;        // игровое время с начала локации
  spearThrows = 0;   // успешные броски копья
  spearHits = 0;     // броски копья, задевшие хотя бы одного врага (меткость — spearHits / spearThrows)
  enemiesKilled = 0;
  enemiesEscaped = 0;
  lootDropped = 0;   // предметов-добычи выпало
  bites = 0;         // укусы врагов, в том числе по центральной и по разбитой клетке
  cellDamage = 0;    // прочности клеток снято укусами
  repairTaps = 0;    // нажатия в ремонте, прибавившие прочность
  towerThrows = 0;   // броски сетевых башен
  towerCaught = 0;   // предметов вернули сети башен
  towerSpearThrows = 0; // броски копейных башен
  towerSpearHits = 0;   // броски копейных башен, задевшие хотя бы одну цель
  bossShots = 0;     // выстрелы шхуны (ядра)
  bossCellDamage = 0; // прочности клеток снято ядрами
  bossDamage = 0;    // урон по шхуне на визитах
  bossChests = 0;    // сундуков выпало на визитах
  boostFlowXp = 0;   // опыт потока, пойманного под бустом (× сила локации); входит и в xpByRole
  /** Опыт вернувшегося улова по ролям, × сила локации; считается в момент возврата сети, а не по прилёту значков. */
  readonly xpByRole = Object.fromEntries(ROLES.map((r) => [r, 0])) as Record<Role, number>;

  snapshot(): StatsSnapshot {
    return { ...this, xpByRole: { ...this.xpByRole } };
  }

  /** Счётчик, которого нет в записи, остаётся 0. */
  restore(s: StatsSnapshot): void {
    const self = this as unknown as Record<string, unknown>;
    const src = s as unknown as Record<string, unknown>;
    for (const k of Object.keys(self)) if (typeof self[k] === 'number' && typeof src[k] === 'number') self[k] = src[k];
    for (const r of ROLES) this.xpByRole[r] = s.xpByRole[r] ?? 0;
  }
}
