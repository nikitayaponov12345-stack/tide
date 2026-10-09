import { parseCsv } from './csv';

export type Role = 'light1' | 'light2' | 'light3' | 'medium' | 'heavy' | 'loot' | 'boss_chest' | 'bottle';
export const ROLES: readonly Role[] = ['light1', 'light2', 'light3', 'medium', 'heavy', 'loot', 'boss_chest', 'bottle'];
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
export type CardKind = 'raft' | 'building' | 'building_upgrade' | 'sailor_upgrade';
export interface CardRow {
  id: string; kind: CardKind; target: string;
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

/** Колонки файлов — те же и в том же порядке, что в tools/data-check.mjs. */
const FILES: Record<keyof RawTables, { file: string; header: readonly string[] }> = {
  constants: { file: 'data/constants.csv', header: ['key', 'value', 'unit', 'note'] },
  levels: { file: 'data/levels.csv', header: ['level', 'xp_step', 'flow_per_s'] },
  locations: { file: 'data/locations.csv', header: ['id', 'order', 'name_key', 'xp_mult', 'enemy_hp_mult', 'enemy_dmg_mult', 'current_dx', 'current_dy', 'enemy_id', 'boss_id', 'event_id', 'new_buildings', 'water_color'] },
  items: { file: 'data/items.csv', header: ['id', 'location', 'role', 'name_key', 'xp', 'weight', 'radius', 'unlock_level', 'share'] },
  sailor: { file: 'data/sailor.csv', header: ['tier', 'net_radius', 'net_capacity', 'throw_range', 'pull', 'spear_damage', 'spear_count', 'weapon_key'] },
  buildings: { file: 'data/buildings.csv', header: ['id', 'tier', 'name_key', 'intro_location', 'radius', 'pause_s', 'nets', 'net_radius', 'net_capacity', 'pull', 'damage', 'shots', 'sector', 'repair_per_s', 'pull_speed', 'slow_mult', 'drift_speed', 'ad_unlock'] },
  cards: { file: 'data/cards.csv', header: ['id', 'kind', 'target', 'stat', 'value', 'mode', 'max_per_location', 'min_level_gap', 'requires', 'name_key', 'desc_key'] },
  forcedCards: { file: 'data/forced_cards.csv', header: ['location', 'trigger', 'card'] },
  enemies: { file: 'data/enemies.csv', header: ['id', 'location', 'name_key', 'behavior', 'speed', 'damage', 'attacks', 'telegraph_s', 'surfaced_s', 'stun_s', 'loot_item'] },
  enemyHp: { file: 'data/enemy_hp.csv', header: ['from_level', 'hp_min', 'hp_max'] },
  bosses: { file: 'data/bosses.csv', header: ['id', 'location', 'name_key', 'behavior', 'visit_speed', 'visit_attack_period_s', 'visit_damage', 'visit_duration_s', 'final_hp', 'final_attack_period_s', 'final_damage', 'part_hp', 'parts', 'summon_count', 'chest_item'] },
  events: { file: 'data/events.csv', header: ['id', 'location', 'name_key', 'duration_s', 'enemy_rate_mult', 'flow_mult', 'current_speed_mult', 'current_turn_deg', 'enemies_surface'] },
  ads: { file: 'data/ads.csv', header: ['place', 'kind', 'reward', 'first_after_s', 'cooldown_s', 'visible_s', 'note'] },
  strings: { file: 'translations/strings.csv', header: ['key', 'ru', 'en'] },
};

/** Строка данных с местом в файле — для сообщений об ошибках. */
class Row {
  constructor(readonly file: string, readonly line: number, readonly cells: GenericRow) {}

  private fail(col: string, what: string): never {
    throw new Error(`${this.file}:${this.line}: ${col} ${what}`);
  }

  str(col: string): string {
    const v = this.cells[col] ?? '';
    if (v === '') this.fail(col, '— пустое значение');
    return v;
  }

  optStr(col: string): string | null {
    const v = this.cells[col] ?? '';
    return v === '' ? null : v;
  }

  num(col: string): number {
    const v = this.cells[col] ?? '';
    if (v === '') this.fail(col, '— пустое значение, нужно число');
    const n = Number(v);
    if (!Number.isFinite(n)) this.fail(col, `— «${v}» не число`);
    return n;
  }

  optNum(col: string): number | null {
    return (this.cells[col] ?? '') === '' ? null : this.num(col);
  }

  oneOf<T extends string>(col: string, allowed: readonly T[]): T {
    const v = this.str(col);
    if (!(allowed as readonly string[]).includes(v)) this.fail(col, `— «${v}», допустимо: ${allowed.join(', ')}`);
    return v as T;
  }

  optOneOf<T extends string>(col: string, allowed: readonly T[]): T | null {
    return this.optStr(col) === null ? null : this.oneOf(col, allowed);
  }
}

function read(raw: RawTables, key: keyof RawTables): Row[] {
  const { file, header } = FILES[key];
  const rows = parseCsv(raw[key], file);
  const head = rows.shift() ?? [];
  if (head.join(',') !== header.join(',')) {
    throw new Error(`${file}: заголовок «${head.join(',')}», ожидался «${header.join(',')}»`);
  }
  return rows.map((r, i) => {
    const line = i + 2;
    if (r.length !== header.length) throw new Error(`${file}:${line}: ${r.length} полей вместо ${header.length}`);
    const cells: Record<string, string> = {};
    header.forEach((h, j) => (cells[h] = (r[j] ?? '').trim()));
    return new Row(file, line, cells);
  });
}

const CARD_KINDS: readonly CardKind[] = ['raft', 'building', 'building_upgrade', 'sailor_upgrade'];
const MODES = ['add', 'mul', 'set'] as const;

export function loadTables(raw: RawTables): Tables {
  const constants = new Map<string, number>();
  for (const r of read(raw, 'constants')) constants.set(r.str('key'), r.num('value'));

  const levels: LevelRow[] = read(raw, 'levels').map((r, i) => {
    const row = { level: r.num('level'), xpStep: r.num('xp_step'), flowPerS: r.num('flow_per_s') };
    if (row.level !== i + 1) throw new Error(`${r.file}:${r.line}: level = ${row.level}, ожидался ${i + 1}`);
    return row;
  });
  if (levels.length === 0) throw new Error(`${FILES.levels.file}: нет уровней`);

  const locations: LocationRow[] = read(raw, 'locations').map((r) => {
    const nb = r.optStr('new_buildings');
    return {
      id: r.str('id'), order: r.num('order'), nameKey: r.str('name_key'), xpMult: r.num('xp_mult'),
      enemyHpMult: r.num('enemy_hp_mult'), enemyDmgMult: r.num('enemy_dmg_mult'),
      currentDx: r.num('current_dx'), currentDy: r.num('current_dy'),
      enemyId: r.str('enemy_id'), bossId: r.str('boss_id'), eventId: r.str('event_id'),
      newBuildings: nb === null ? [] : nb.split('|'), waterColor: r.str('water_color'),
    };
  });

  const items: ItemRow[] = read(raw, 'items').map((r) => ({
    id: r.str('id'), location: r.str('location'), role: r.oneOf('role', ROLES), nameKey: r.str('name_key'),
    xp: r.num('xp'), weight: r.num('weight'), radius: r.num('radius'),
    unlockLevel: r.optNum('unlock_level'), share: r.num('share'),
  }));

  const sailor: SailorTier[] = read(raw, 'sailor').map((r) => ({
    tier: r.num('tier'), netRadius: r.num('net_radius'), netCapacity: r.num('net_capacity'),
    throwRange: r.num('throw_range'), pull: r.num('pull'), spearDamage: r.num('spear_damage'),
    spearCount: r.num('spear_count'), weaponKey: r.str('weapon_key'),
  }));

  const cards: CardRow[] = read(raw, 'cards').map((r) => ({
    id: r.str('id'), kind: r.oneOf('kind', CARD_KINDS), target: r.str('target'),
    stat: r.optStr('stat'), value: r.optNum('value'), mode: r.optOneOf('mode', MODES),
    maxPerLocation: r.optNum('max_per_location'), minLevelGap: r.optNum('min_level_gap'),
    requires: r.optStr('requires'), nameKey: r.str('name_key'), descKey: r.str('desc_key'),
  }));

  const forcedCards: ForcedCard[] = read(raw, 'forcedCards').map((r) => ({
    location: r.str('location'), trigger: r.str('trigger'), card: r.str('card'),
  }));

  const generic = (key: keyof RawTables): GenericRow[] => read(raw, key).map((r) => r.cells);

  const strings = new Map<string, { ru: string; en: string }>();
  for (const r of read(raw, 'strings')) strings.set(r.str('key'), { ru: r.str('ru'), en: r.str('en') });

  const lastLevel = levels[levels.length - 1]!;
  const num = (key: string): number => {
    const v = constants.get(key);
    if (v === undefined) throw new Error(`constants.csv: нет ключа ${key}`);
    return v;
  };
  const flowPerS = (level: number): number => {
    if (level <= lastLevel.level) return levels[Math.max(1, Math.floor(level)) - 1]!.flowPerS;
    const extra = (level - lastLevel.level) * num('endless_flow_per_level');
    return Math.min(num('endless_flow_cap'), lastLevel.flowPerS + extra);
  };

  return {
    levels, locations, items, sailor, cards, forcedCards,
    buildings: generic('buildings'), enemies: generic('enemies'), enemyHp: generic('enemyHp'),
    bosses: generic('bosses'), events: generic('events'), ads: generic('ads'),
    num,
    location(id) {
      const loc = locations.find((l) => l.id === id);
      if (!loc) throw new Error(`locations.csv: нет локации ${id}`);
      return loc;
    },
    levelStep(level, xpMult) {
      if (level < 2) throw new Error(`levelStep: уровень ${level} < 2`);
      if (level <= lastLevel.level) return levels[level - 1]!.xpStep * xpMult;
      return (lastLevel.xpStep + num('endless_xp_step_add') * (level - lastLevel.level)) * xpMult;
    },
    flowPerS,
    flowItems(locationId) {
      return items.filter((it) => it.location === locationId && FLOW_ROLES.includes(it.role));
    },
    item(id) {
      const it = items.find((x) => x.id === id);
      if (!it) throw new Error(`items.csv: нет предмета ${id}`);
      return it;
    },
    sailorTier(tier) {
      const t = sailor.find((x) => x.tier === tier);
      if (!t) throw new Error(`sailor.csv: нет яруса ${tier}`);
      return t;
    },
    text(key, lang) {
      const s = strings.get(key);
      if (!s) throw new Error(`strings.csv: нет ключа ${key}`);
      return s[lang];
    },
  };
}
