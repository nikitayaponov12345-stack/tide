import { ROLES, type Role } from './data/tables';

/** Снимок счётчиков: все числовые поля Stats и xpByRole. */
export type StatsSnapshot = { [K in keyof Stats as Stats[K] extends number ? K : never]: number } & { xpByRole: Record<Role, number> };

/** Счётчики для бота и отладки. Пишут Game и Enemies. */
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
