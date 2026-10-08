import constants from '../data/constants.csv?raw';
import levels from '../data/levels.csv?raw';
import locations from '../data/locations.csv?raw';
import items from '../data/items.csv?raw';
import sailor from '../data/sailor.csv?raw';
import buildings from '../data/buildings.csv?raw';
import cards from '../data/cards.csv?raw';
import forcedCards from '../data/forced_cards.csv?raw';
import enemies from '../data/enemies.csv?raw';
import enemyHp from '../data/enemy_hp.csv?raw';
import bosses from '../data/bosses.csv?raw';
import events from '../data/events.csv?raw';
import ads from '../data/ads.csv?raw';
import strings from '../translations/strings.csv?raw';
import { loadTables, type RawTables, type Tables } from './core/data/tables';

/** Текст таблиц как есть: Vite встраивает его в сборку, сетевых запросов нет. Тесты портят его копию для проверки ошибок. */
export const RAW: Readonly<RawTables> = { constants, levels, locations, items, sailor, buildings, cards, forcedCards, enemies, enemyHp, bosses, events, ads, strings };

export const DATA: Tables = loadTables(RAW);
