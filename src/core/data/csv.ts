/**
 * Разбор CSV по тем же правилам, что `tools/data-check.mjs`: разделитель — запятая, поле в кавычках
 * может содержать запятые и переводы строк, `""` внутри кавычек — одна кавычка; CRLF и LF равны
 * (CRLF внутри кавычек становится LF); пустые строки пропускаются; BOM в начале текста — ошибка.
 */
export function parseCsv(text: string, file: string): string[][] {
  if (text.charCodeAt(0) === 0xfeff) throw new Error(`${file}: BOM в начале файла`);
  const rows: string[][] = [];
  let row: string[] = [];
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
