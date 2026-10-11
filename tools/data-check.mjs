// Проверка таблиц данных: `npm run data`. Без зависимостей, Node 22+.
// Читает data/*.csv и translations/strings.csv, проверяет заголовки, типы, уникальность id и ссылки между таблицами.
// Любая ошибка — строка «data-check: …» и код выхода 1; всё хорошо — «data-check: ok …».
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const errors = [];
const err = (msg) => errors.push(msg);

/** CSV по RFC 4180: запятая, кавычки, "" внутри кавычек; CRLF и LF равны (и внутри кавычек); BOM в начале файла запрещён. */
export function parseCsv(text, file) {
  if (text.charCodeAt(0) === 0xfeff) err(`${file}: файл начинается с BOM — сохранить как UTF-8 без BOM`);
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else if (ch === '\r' && text[i + 1] === '\n') {
        cell += '\n';
        i++;
      } else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => !(r.length === 1 && r[0] === ''));
}

function load(rel, header) {
  let text;
  try {
    text = readFileSync(join(ROOT, rel), 'utf8');
  } catch {
    err(`${rel}: файла нет`);
    return [];
  }
  const rows = parseCsv(text, rel);
  const head = rows.shift() ?? [];
  if (head.join(',') !== header.join(',')) err(`${rel}: заголовок «${head.join(',')}», ожидался «${header.join(',')}»`);
  return rows.map((r, i) => {
    if (r.length !== header.length) err(`${rel}: строка ${i + 2} — ${r.length} полей вместо ${header.length}`);
    const o = { __line: i + 2, __file: rel };
    header.forEach((h, j) => (o[h] = (r[j] ?? '').trim()));
    return o;
  });
}

const where = (r) => `${r.__file}:${r.__line}`;
function num(r, col, { min = -Infinity, max = Infinity, int = false, optional = false } = {}) {
  const v = r[col];
  if (v === '') {
    if (!optional) err(`${where(r)}: пустое поле ${col}`);
    return null;
  }
  const n = Number(v);
  if (!Number.isFinite(n)) err(`${where(r)}: ${col} = «${v}» — не число`);
  else if (int && !Number.isInteger(n)) err(`${where(r)}: ${col} = ${v} — нужно целое`);
  else if (n < min || n > max) err(`${where(r)}: ${col} = ${v} вне [${min}, ${max}]`);
  return n;
}
function unique(rows, keyFn, file) {
  const seen = new Set();
  for (const r of rows) {
    const k = keyFn(r);
    if (seen.has(k)) err(`${file}: повтор ключа «${k}» (строка ${r.__line})`);
    seen.add(k);
  }
  return seen;
}
function oneOf(r, col, allowed) {
  if (!allowed.includes(r[col])) err(`${where(r)}: ${col} = «${r[col]}», допустимо: ${allowed.join(', ')}`);
}

// ---------- таблицы ----------
const T = {
  constants: load('data/constants.csv', ['key', 'value', 'unit', 'note']),
  levels: load('data/levels.csv', ['level', 'xp_step', 'flow_per_s']),
  locations: load('data/locations.csv', ['id', 'order', 'name_key', 'xp_mult', 'enemy_hp_mult', 'enemy_dmg_mult', 'current_dx', 'current_dy', 'enemy_id', 'boss_id', 'event_id', 'new_buildings', 'water_color']),
  items: load('data/items.csv', ['id', 'location', 'role', 'name_key', 'xp', 'weight', 'radius', 'unlock_level', 'share']),
  sailor: load('data/sailor.csv', ['tier', 'net_radius', 'net_capacity', 'throw_range', 'pull', 'spear_damage', 'spear_count', 'weapon_key']),
  buildings: load('data/buildings.csv', ['id', 'tier', 'name_key', 'intro_location', 'radius', 'pause_s', 'nets', 'net_radius', 'net_capacity', 'pull', 'damage', 'shots', 'sector', 'repair_per_s', 'pull_speed', 'slow_mult', 'drift_speed', 'ad_unlock']),
  cards: load('data/cards.csv', ['id', 'kind', 'target', 'stat', 'value', 'mode', 'max_per_location', 'min_level_gap', 'requires', 'name_key', 'desc_key']),
  forced: load('data/forced_cards.csv', ['location', 'trigger', 'card']),
  enemies: load('data/enemies.csv', ['id', 'location', 'name_key', 'behavior', 'speed', 'damage', 'attacks', 'telegraph_s', 'surfaced_s', 'stun_s', 'loot_item']),
  enemyHp: load('data/enemy_hp.csv', ['from_level', 'hp_min', 'hp_max']),
  bosses: load('data/bosses.csv', ['id', 'location', 'name_key', 'behavior', 'visit_speed', 'visit_attack_period_s', 'visit_damage', 'visit_duration_s', 'final_hp', 'final_attack_period_s', 'final_damage', 'part_hp', 'parts', 'summon_count', 'chest_item']),
  events: load('data/events.csv', ['id', 'location', 'name_key', 'duration_s', 'enemy_rate_mult', 'flow_mult', 'current_speed_mult', 'current_turn_deg', 'enemies_surface']),
  ads: load('data/ads.csv', ['place', 'kind', 'reward', 'first_after_s', 'cooldown_s', 'visible_s', 'note']),
  strings: load('translations/strings.csv', ['key', 'ru', 'en']),
};

// Лишние файлы в data/ — значит, таблицу добавили, а проверку нет.
const known = new Set(['constants.csv', 'levels.csv', 'locations.csv', 'items.csv', 'sailor.csv', 'buildings.csv', 'cards.csv', 'forced_cards.csv', 'enemies.csv', 'enemy_hp.csv', 'bosses.csv', 'events.csv', 'ads.csv', 'README.md']);
let dataFiles = [];
try {
  dataFiles = readdirSync(join(ROOT, 'data'));
} catch {
  err('папки data/ нет — запускать из корня репозитория');
}
for (const f of dataFiles) if (!known.has(f)) err(`data/${f}: таблица не описана в tools/data-check.mjs`);

// ---------- строки ----------
const strings = unique(T.strings, (r) => r.key, 'translations/strings.csv');
for (const r of T.strings) {
  if (!r.ru) err(`${where(r)}: нет русской строки для ${r.key}`);
  if (!r.en) err(`${where(r)}: нет английской строки для ${r.key}`);
}
const needKey = (r, col, optional = false) => {
  if (!r[col]) {
    if (!optional) err(`${where(r)}: пустой ${col}`);
    return;
  }
  if (!strings.has(r[col])) err(`${where(r)}: ${col} «${r[col]}» нет в translations/strings.csv`);
};

// ---------- constants ----------
unique(T.constants, (r) => r.key, 'data/constants.csv');
const C = Object.fromEntries(T.constants.map((r) => [r.key, num(r, 'value')]));
const needConst = ['cell_px', 'raft_grid', 'cell_hp', 'current_speed', 'current_portrait_mult', 'item_speed_min', 'item_speed_max', 'item_wobble', 'seed_seconds', 'seed_near_raft', 'net_flight_speed', 'net_flight_end_mult', 'net_pull_min', 'net_pull_max', 'icon_interval_ms', 'icon_flight_ms', 'sailor_box_px', 'walk_drag_px', 'walk_hint_delay_ms', 'walk_hint_max_level', 'level_to_clear', 'window_cards', 'window_cards_level2', 'window_cards_level3', 'refresh_after_cards', 'card_weight_raft', 'card_weight_building', 'card_weight_building_upgrade', 'card_weight_sailor_upgrade', 'spear_flight_speed', 'spear_return_speed', 'spear_hit_radius', 'enemy_interval_base_s', 'enemy_interval_per_building', 'enemy_interval_min_s', 'enemy_spawn_outside_px', 'enemy_reach_px', 'enemy_wait_ms', 'enemy_radius_px', 'loot_drift_min', 'loot_drift_max', 'loot_scatter_px', 'autosave_s', 'resume_plaque_ms', 'erase_hold_ms', 'repair_per_tap', 'tower_net_flight_speed', 'tower_spear_speed', 'event_first_s', 'event_period_s', 'boss_visit_period_min_s', 'boss_visit_period_max_s', 'boss_chest_per_damage', 'boss_visit_max_chests', 'boss_ship_length_px', 'boss_ship_width_px', 'boss_ship_edge_px', 'boss_visit_gap_px', 'boss_ball_speed', 'boss_final_distance_px', 'boss_big_chest_share', 'boss_crab_radius_px', 'boss_crab_speed', 'boss_crab_wait_ms', 'boss_crab_dive_ms', 'boost_bottle_s', 'boost_ad_s', 'boost_flow_mult', 'seed_near_raft_min_px', 'seed_near_raft_max_px', 'leader_after_s', 'leader_hp_per_level', 'leader_damage', 'leader_speed', 'leader_radius_px', 'leader_loot_per_hp'];
for (const k of needConst) if (!(k in C)) err(`data/constants.csv: нет ключа ${k}`);
if (C.item_speed_min > C.item_speed_max) err('data/constants.csv: item_speed_min больше item_speed_max');
if (C.net_pull_min > C.net_pull_max) err('data/constants.csv: net_pull_min больше net_pull_max');
if (!(C.walk_drag_px > 0)) err('data/constants.csv: walk_drag_px должен быть больше 0 — иначе шаги пальцем не кончатся');
if (!(C.walk_hint_delay_ms >= 0)) err('data/constants.csv: walk_hint_delay_ms не может быть меньше 0');
if (!(Number.isInteger(C.walk_hint_max_level) && C.walk_hint_max_level >= 2)) err('data/constants.csv: walk_hint_max_level — целое не меньше 2');
if (!(C.loot_drift_min > 0 && C.loot_drift_min <= C.loot_drift_max)) err('data/constants.csv: нужно 0 < loot_drift_min ≤ loot_drift_max');
for (const k of ['enemy_radius_px', 'enemy_reach_px', 'enemy_spawn_outside_px', 'spear_flight_speed', 'spear_return_speed', 'autosave_s', 'resume_plaque_ms', 'erase_hold_ms', 'repair_per_tap', 'tower_net_flight_speed', 'tower_spear_speed', 'event_first_s', 'event_period_s', 'boss_chest_per_damage', 'boss_ship_length_px', 'boss_ship_width_px', 'boss_ship_edge_px', 'boss_visit_gap_px', 'boss_ball_speed', 'boss_final_distance_px', 'boss_big_chest_share', 'boss_crab_radius_px', 'boss_crab_speed', 'boss_crab_wait_ms', 'boss_crab_dive_ms', 'boost_bottle_s', 'boost_ad_s', 'boost_flow_mult', 'leader_after_s', 'leader_hp_per_level', 'leader_damage', 'leader_speed', 'leader_radius_px', 'leader_loot_per_hp']) if (!(C[k] > 0)) err(`data/constants.csv: ${k} должен быть больше 0`);
for (const k of ['enemy_wait_ms', 'loot_scatter_px']) if (!(C[k] >= 0)) err(`data/constants.csv: ${k} не может быть меньше 0`);
if (!(C.boss_visit_period_min_s > 0 && C.boss_visit_period_min_s <= C.boss_visit_period_max_s)) err('data/constants.csv: нужно 0 < boss_visit_period_min_s ≤ boss_visit_period_max_s');
if (!(Number.isInteger(C.boss_visit_max_chests) && C.boss_visit_max_chests >= 0)) err('data/constants.csv: boss_visit_max_chests — целое не меньше 0');
if (C.raft_grid % 2 !== 1) err('data/constants.csv: raft_grid должен быть нечётным — моряк начинает в центральной клетке');

// ---------- levels ----------
const lv = T.levels.map((r) => ({ L: num(r, 'level', { min: 1, int: true }), xp: num(r, 'xp_step', { min: 0, int: true }), flow: num(r, 'flow_per_s', { min: 0.1 }), r }));
lv.forEach((x, i) => {
  if (x.L !== i + 1) err(`${where(x.r)}: уровни должны идти подряд с 1, здесь ${x.L}`);
  if (i === 0 && x.xp !== 0) err(`${where(x.r)}: у 1 уровня xp_step = 0`);
  if (i > 0 && x.xp <= 0) err(`${where(x.r)}: xp_step должен быть больше 0`);
  if (i > 0 && x.flow < lv[i - 1].flow) err(`${where(x.r)}: поток не должен падать с уровнем`);
});
if (lv.length && lv[lv.length - 1].L !== C.level_to_clear) err(`data/levels.csv: последний уровень ${lv[lv.length - 1]?.L}, а level_to_clear = ${C.level_to_clear}`);

// ---------- locations ----------
const locIds = unique(T.locations, (r) => r.id, 'data/locations.csv');
const locOrder = new Map();
T.locations.forEach((r, i) => {
  const o = num(r, 'order', { min: 1, int: true });
  if (o !== i + 1) err(`${where(r)}: order должен идти подряд с 1`);
  locOrder.set(r.id, o);
  needKey(r, 'name_key');
  num(r, 'xp_mult', { min: 1 });
  num(r, 'enemy_hp_mult', { min: 1 });
  num(r, 'enemy_dmg_mult', { min: 1 });
  const dx = num(r, 'current_dx');
  const dy = num(r, 'current_dy');
  if (dx === 0 && dy === 0) err(`${where(r)}: течение без направления`);
  if (!/^#[0-9a-f]{6}$/i.test(r.water_color)) err(`${where(r)}: water_color «${r.water_color}» — нужен #rrggbb`);
});
for (let i = 1; i < T.locations.length; i++) {
  const a = T.locations[i - 1];
  const b = T.locations[i];
  if (Number(b.xp_mult) < Number(a.xp_mult)) err(`${where(b)}: сила локации (xp_mult) не должна падать`);
}

// ---------- items ----------
const itemIds = unique(T.items, (r) => r.id, 'data/items.csv');
const ROLES = ['light1', 'light2', 'light3', 'medium', 'heavy', 'loot', 'boss_chest', 'bottle'];
const flowShare = new Map();
for (const r of T.items) {
  oneOf(r, 'role', ROLES);
  needKey(r, 'name_key');
  if (r.location !== '*' && !locIds.has(r.location)) err(`${where(r)}: локации «${r.location}» нет`);
  num(r, 'xp', { min: 0, int: true });
  num(r, 'weight', { min: 0 });
  num(r, 'radius', { min: 4, max: 64 });
  const share = num(r, 'share', { min: 0, max: 100 });
  const unlock = num(r, 'unlock_level', { min: 1, int: true, optional: true });
  const inFlow = ['light1', 'light2', 'light3', 'medium', 'heavy'].includes(r.role);
  if (inFlow && (unlock === null || share === 0)) err(`${where(r)}: предмет потока без unlock_level или с долей 0`);
  if (!inFlow && share !== 0) err(`${where(r)}: у добычи, сундука и бутылки доля в потоке 0`);
  if (inFlow) flowShare.set(r.location, (flowShare.get(r.location) ?? 0) + share);
}
for (const id of locIds) {
  if (flowShare.get(id) !== 100) err(`data/items.csv: доли потока в «${id}» дают ${flowShare.get(id) ?? 0}, а не 100`);
  const first = T.items.filter((r) => r.location === id && r.unlock_level === '1');
  if (!first.length) err(`data/items.csv: в «${id}» нет предмета с 1 уровня`);
}
if (T.items.filter((r) => r.role === 'bottle').length !== 1) err('data/items.csv: бутылка (роль bottle) должна быть ровно одна');

// ---------- sailor ----------
T.sailor.forEach((r, i) => {
  if (num(r, 'tier', { min: 1, int: true }) !== i + 1) err(`${where(r)}: ярусы моряка подряд с 1`);
  for (const c of ['net_radius', 'net_capacity', 'throw_range', 'pull', 'spear_damage', 'spear_count']) num(r, c, { min: 1 });
  needKey(r, 'weapon_key');
});
if (T.sailor.length !== T.locations.length) err(`data/sailor.csv: ярусов ${T.sailor.length}, локаций ${T.locations.length}`);

const minThrow = Math.min(...T.sailor.map((r) => Number(r.throw_range)));
if (C.boss_visit_gap_px > minThrow) err(`data/constants.csv: boss_visit_gap_px = ${C.boss_visit_gap_px} больше наименьшей throw_range (${minThrow}) — копьё моряка не достанет шхуну на визите`);
// И финального босса (GDD, «Финальный бой»: проиграть нельзя и без копейных башен).
if (C.boss_final_distance_px > minThrow) err(`data/constants.csv: boss_final_distance_px = ${C.boss_final_distance_px} больше наименьшей throw_range (${minThrow}) — копьё не достанет финального босса`);

// ---------- buildings ----------
const buildingIds = new Set(T.buildings.map((r) => r.id));
unique(T.buildings, (r) => `${r.id}#${r.tier}`, 'data/buildings.csv');
for (const id of buildingIds) {
  const tiers = T.buildings.filter((r) => r.id === id);
  tiers.forEach((r, i) => {
    if (Number(r.tier) !== i + 1) err(`${where(r)}: ярусы «${id}» подряд с 1`);
    if (r.intro_location !== tiers[0].intro_location) err(`${where(r)}: у всех ярусов «${id}» одна intro_location`);
  });
  const intro = tiers[0].intro_location;
  if (!locIds.has(intro)) err(`data/buildings.csv: «${id}» — локации «${intro}» нет`);
  else {
    const need = T.locations.length - locOrder.get(intro) + 1;
    if (tiers.length !== need) err(`data/buildings.csv: у «${id}» ${tiers.length} ярусов, нужно ${need} (от ${intro} до последней локации)`);
  }
}
for (const r of T.buildings) {
  needKey(r, 'name_key');
  for (const c of ['radius', 'pause_s', 'nets', 'net_radius', 'net_capacity', 'pull', 'damage', 'shots', 'sector', 'repair_per_s', 'pull_speed', 'slow_mult', 'drift_speed']) num(r, c, { min: 0, optional: true });
  num(r, 'ad_unlock', { min: 0, max: 1, int: true });
}
// Копейная башня (M1-09): радиус, отдых, урон и копий за бросок обязательны.
for (const r of T.buildings.filter((x) => x.id === 'spear_tower')) {
  num(r, 'radius', { min: 1 });
  num(r, 'pause_s', { min: 0.1 });
  num(r, 'damage', { min: 1 });
  num(r, 'shots', { min: 1, int: true });
}
// Воронка (M1-13)
for (const r of T.buildings.filter((x) => x.id === 'whirlpool')) {
  num(r, 'radius', { min: 1 });
  num(r, 'pull_speed', { min: 1 });
}
for (const r of T.locations) for (const b of r.new_buildings.split('|').filter(Boolean)) {
  if (!buildingIds.has(b)) err(`${where(r)}: new_buildings — постройки «${b}» нет`);
  else if (T.buildings.find((x) => x.id === b).intro_location !== r.id) err(`${where(r)}: «${b}» вводится не в этой локации`);
}

// ---------- cards ----------
const cardIds = unique(T.cards, (r) => r.id, 'data/cards.csv');
const SAILOR_STATS = ['net_radius', 'net_capacity', 'throw_range', 'pull', 'spear_damage'];
for (const r of T.cards) {
  oneOf(r, 'kind', ['raft', 'building', 'building_upgrade', 'sailor_upgrade']);
  needKey(r, 'name_key');
  needKey(r, 'desc_key');
  if (r.kind === 'building' && !buildingIds.has(r.target)) err(`${where(r)}: постройки «${r.target}» нет`);
  if (r.kind === 'building_upgrade') {
    if (!buildingIds.has(r.target)) err(`${where(r)}: постройки «${r.target}» нет`);
    else if (!T.buildings.some((b) => b.id === r.target && b[r.stat] !== '' && b[r.stat] !== undefined)) err(`${where(r)}: у «${r.target}» нет показателя «${r.stat}»`);
  }
  if (r.kind === 'sailor_upgrade') {
    if (r.target !== 'sailor') err(`${where(r)}: target улучшения моряка — sailor`);
    if (!SAILOR_STATS.includes(r.stat)) err(`${where(r)}: показателя моряка «${r.stat}» нет`);
  }
  if (r.kind.endsWith('upgrade') || r.kind === 'raft') {
    num(r, 'value');
    oneOf(r, 'mode', ['add', 'mul', 'set']);
  }
  if (r.kind.endsWith('upgrade')) num(r, 'max_per_location', { min: 1, int: true });
  num(r, 'min_level_gap', { min: 1, int: true, optional: true });
  if (r.requires && !/^(boss_visit_seen|spear_owned|level:\d+|has:[a-z_]+)$/.test(r.requires)) err(`${where(r)}: requires «${r.requires}» не из списка`);
  if (r.requires.startsWith('has:') && !buildingIds.has(r.requires.slice(4))) err(`${where(r)}: requires — постройки «${r.requires.slice(4)}» нет`);
  if (r.kind === 'building_upgrade' && r.requires !== `has:${r.target}`) err(`${where(r)}: улучшение постройки предлагается, только когда она стоит на плоту — requires has:${r.target}`);
}
for (const r of T.forced) {
  if (!locIds.has(r.location)) err(`${where(r)}: локации «${r.location}» нет`);
  if (!cardIds.has(r.card)) err(`${where(r)}: карточки «${r.card}» нет`);
  if (!/^(level:\d+|after:boss_visit)$/.test(r.trigger)) err(`${where(r)}: trigger «${r.trigger}» не из списка`);
}
for (const id of locIds) if (!T.forced.some((r) => r.location === id && r.trigger === 'level:2' && r.card === 'raft')) err(`data/forced_cards.csv: в «${id}» нет «Плота» на 2 уровне (окно 2 уровня — одна карточка)`);

// ---------- enemies, bosses, events ----------
const enemyIds = unique(T.enemies, (r) => r.id, 'data/enemies.csv');
for (const r of T.enemies) {
  if (!locIds.has(r.location)) err(`${where(r)}: локации «${r.location}» нет`);
  needKey(r, 'name_key');
  for (const c of ['speed', 'telegraph_s', 'surfaced_s', 'stun_s']) num(r, c, { min: 0, optional: true });
  num(r, 'damage', { min: 1 });
  num(r, 'attacks', { min: 1, int: true });
  if (!itemIds.has(r.loot_item)) err(`${where(r)}: добычи «${r.loot_item}» нет в items.csv`);
}
T.enemyHp.forEach((r, i) => {
  const from = num(r, 'from_level', { min: 1, int: true });
  const lo = num(r, 'hp_min', { min: 1, int: true });
  const hi = num(r, 'hp_max', { min: 1, int: true });
  if (i === 0 && from !== 1) err(`${where(r)}: первая строка — с 1 уровня`);
  if (i > 0 && from <= Number(T.enemyHp[i - 1].from_level)) err(`${where(r)}: from_level должен расти`);
  if (lo > hi) err(`${where(r)}: hp_min больше hp_max`);
});
const bossIds = unique(T.bosses, (r) => r.id, 'data/bosses.csv');
for (const r of T.bosses) {
  if (!locIds.has(r.location)) err(`${where(r)}: локации «${r.location}» нет`);
  needKey(r, 'name_key');
  num(r, 'final_hp', { min: 1, optional: true });
  for (const c of ['visit_speed', 'visit_attack_period_s', 'visit_damage', 'visit_duration_s', 'final_attack_period_s', 'final_damage', 'part_hp', 'parts', 'summon_count']) num(r, c, { min: 0, optional: true });
  if (r.behavior === 'pass_bottom_edge') {
    num(r, 'visit_speed', { min: 1 });
    num(r, 'visit_attack_period_s', { min: 0.1 });
    num(r, 'visit_damage', { min: 0 });
    if (r.chest_item === '') err(`${where(r)}: у босса с визитами нужен chest_item`);
  }
  if (r.behavior === 'crawl_dive') {
    num(r, 'final_hp', { min: 1 });
    num(r, 'final_damage', { min: 1 });
  }
  if (r.chest_item !== '' && !itemIds.has(r.chest_item)) err(`${where(r)}: сундука «${r.chest_item}» нет в items.csv`);
}
const eventIds = unique(T.events, (r) => r.id, 'data/events.csv');
for (const r of T.events) {
  if (!locIds.has(r.location)) err(`${where(r)}: локации «${r.location}» нет`);
  needKey(r, 'name_key');
  // Вожак (M1-16) приходит, пока событие идёт.
  if (num(r, 'duration_s', { min: 1 }) <= C.leader_after_s) err(`${where(r)}: duration_s не больше leader_after_s — вожак не успеет прийти`);
  for (const c of ['enemy_rate_mult', 'flow_mult', 'current_speed_mult']) num(r, c, { min: 0.1 });
  num(r, 'current_turn_deg', { min: -180, max: 180 });
  num(r, 'enemies_surface', { min: 0, max: 1, int: true });
}
for (const r of T.locations) {
  if (!enemyIds.has(r.enemy_id)) err(`${where(r)}: врага «${r.enemy_id}» нет`);
  if (!bossIds.has(r.boss_id)) err(`${where(r)}: босса «${r.boss_id}» нет`);
  if (!eventIds.has(r.event_id)) err(`${where(r)}: события «${r.event_id}» нет`);
  const finals = T.bosses.filter((b) => b.location === r.id && b.final_hp !== '').length;
  if (finals !== 1) err(`${where(r)}: строк bosses.csv с final_hp — ${finals}, нужна одна (финальный босс)`);
}

// ---------- ads ----------
unique(T.ads, (r) => r.place, 'data/ads.csv');
for (const r of T.ads) {
  oneOf(r, 'kind', ['rewarded', 'interstitial']);
  for (const c of ['first_after_s', 'cooldown_s', 'visible_s']) num(r, c, { min: 0, optional: true });
  if (r.kind === 'interstitial' && Number(r.cooldown_s) < 180) err(`${where(r)}: межстраничная не чаще раза в 3 минуты (cooldown_s ≥ 180)`);
}
// Воронка за рекламу (M1-14): флаг кампании один (campaign.whirlpoolUnlocked), поэтому ad_unlock = 1 — только у воронки.
for (const r of T.buildings) if (r.ad_unlock === '1' && r.id !== 'whirlpool') err(`${where(r)}: ad_unlock = 1 — только у воронки`);
const whirlpoolUnlock = T.ads.find((r) => r.place === 'whirlpool_unlock');
if (!whirlpoolUnlock || whirlpoolUnlock.kind !== 'rewarded') err('data/ads.csv: нет места whirlpool_unlock вида rewarded — воронки за рекламу');
const doubleChest = T.ads.find((r) => r.place === 'double_chest');
if (!doubleChest || doubleChest.kind !== 'rewarded') err('data/ads.csv: нет места double_chest вида rewarded — «Сундук ×2» (M1-17)');
const boostOffer = T.ads.find((r) => r.place === 'boost_offer');
if (!boostOffer) err('data/ads.csv: нет места boost_offer — кнопки буста за рекламу');
else for (const c of ['first_after_s', 'cooldown_s', 'visible_s']) if (!(Number(boostOffer[c]) > 0)) err(`${where(boostOffer)}: у boost_offer ${c} должен быть больше 0`);

const tables = Object.keys(T).length;
if (errors.length) {
  for (const e of errors) console.error(`data-check: ${e}`);
  console.error(`data-check: ошибок ${errors.length}`);
  process.exit(1);
}
console.log(`data-check: ok (${tables} таблиц, ${T.strings.length} строк перевода, ${T.items.length} предметов, ${T.cards.length} карточек)`);
