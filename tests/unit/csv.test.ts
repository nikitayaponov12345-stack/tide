import { describe, expect, it } from 'vitest';
import { parseCsv } from '../../src/core/data/csv';

describe('parseCsv', () => {
  it('простая таблица 2×3', () => {
    expect(parseCsv('a,b,c\n1,2,3\n', 't.csv')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ]);
  });

  it('поле в кавычках с запятой', () => {
    expect(parseCsv('a,"b, c",d', 't.csv')).toEqual([['a', 'b, c', 'd']]);
  });

  it('"" внутри кавычек — одна кавычка', () => {
    expect(parseCsv('a,"say ""hi""",d', 't.csv')).toEqual([['a', 'say "hi"', 'd']]);
  });

  it('CRLF даёт те же строки, что LF (и внутри кавычек)', () => {
    const lf = 'a,b\n1,"x\ny"\n2,3\n';
    expect(parseCsv(lf.replace(/\n/g, '\r\n'), 't.csv')).toEqual(parseCsv(lf, 't.csv'));
    expect(parseCsv(lf, 't.csv')[1]).toEqual(['1', 'x\ny']);
  });

  it('пустые строки и перевод строки в конце пропускаются', () => {
    expect(parseCsv('a,b\n\n1,2\n\n', 't.csv')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('BOM в начале — ошибка с именем файла', () => {
    expect(() => parseCsv('﻿a,b\n', 'data/x.csv')).toThrow('data/x.csv: BOM в начале файла');
  });
});
