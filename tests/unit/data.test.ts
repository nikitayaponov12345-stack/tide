import { describe, expect, it } from 'vitest';
import { loadTables } from '../../src/core/data/tables';
import { DATA, RAW } from '../../src/data';

// Сторож таблиц (исключение TESTPLAN §1): числа вписаны, чтобы случайная правка data/*.csv была заметна.
describe('таблицы данных', () => {
  it('40 уровней, до 40-го — 16 241 опыта', () => {
    expect(DATA.levels).toHaveLength(40);
    const sum = DATA.levels.slice(1).reduce((s, l) => s + l.xpStep, 0);
    expect(sum).toBe(16241);
  });

  it('стоимость уровня, в том числе выше 40-го', () => {
    expect(DATA.levelStep(2, 1)).toBe(6);
    expect(DATA.levelStep(40, 2)).toBe(1600);
    expect(DATA.levelStep(41, 1)).toBe(820);
    expect(() => DATA.levelStep(1, 1)).toThrow();
  });

  it('поток по уровню, в том числе выше 40-го', () => {
    expect(DATA.flowPerS(1)).toBe(1);
    expect(DATA.flowPerS(10)).toBe(4.6);
    expect(DATA.flowPerS(21)).toBe(9);
    expect(DATA.flowPerS(41)).toBeCloseTo(9.05, 9);
    expect(DATA.flowPerS(200)).toBe(11);
  });

  it('предметы потока Лагуны и их доли', () => {
    const flow = DATA.flowItems('lagoon');
    expect(flow.map((i) => i.id)).toEqual(['branch', 'coconut', 'keg', 'rope', 'small_chest']);
    expect(flow.reduce((s, i) => s + i.share, 0)).toBe(100);
  });

  it('константы и строки перевода', () => {
    expect(() => DATA.num('nope')).toThrow('constants.csv: нет ключа nope');
    expect(DATA.num('card_weight_raft')).toBe(2.5);
    expect(DATA.text('loc.lagoon', 'ru')).toBe('Лагуна');
    expect(DATA.text('loc.lagoon', 'en')).toBe('Lagoon');
  });

  it('испорченный заголовок — ошибка с именем файла', () => {
    const levels = RAW.levels.replace('xp_step', 'xp');
    expect(() => loadTables({ ...RAW, levels })).toThrow('data/levels.csv: заголовок');
  });

  it('пустое обязательное число — ошибка с файлом, строкой и колонкой', () => {
    const lines = RAW.items.split(/\r?\n/);
    const cells = lines[2]!.split(',');
    cells[5] = ''; // weight второй строки данных
    lines[2] = cells.join(',');
    expect(() => loadTables({ ...RAW, items: lines.join('\n') })).toThrow('data/items.csv:3: weight');
  });
});
