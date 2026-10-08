// Размер сборки: сумма файлов dist/ как есть и в сжатом виде (gzip). Запускается в конце `npm run build`.
// Бюджет стартовой загрузки — 3 МБ сжатых данных; превышение завершает сборку с ошибкой.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { gzipSync } from 'node:zlib';

const DIST = 'dist';
const BUDGET_GZ = 3 * 1024 * 1024;

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const kb = (n) => (n / 1024).toFixed(1).padStart(8) + ' КБ';
const rows = walk(DIST).map((p) => {
  const buf = readFileSync(p);
  return { file: relative(DIST, p).replaceAll('\\', '/'), raw: buf.length, gz: gzipSync(buf, { level: 9 }).length };
});
rows.sort((a, b) => b.gz - a.gz);
let raw = 0;
let gz = 0;
for (const r of rows) {
  raw += r.raw;
  gz += r.gz;
  console.log(`${kb(r.raw)} ${kb(r.gz)}  ${r.file}`);
}
console.log(`итого: ${(raw / 1048576).toFixed(2)} МБ, сжато ${(gz / 1048576).toFixed(2)} МБ (бюджет ${BUDGET_GZ / 1048576} МБ)`);
if (gz > BUDGET_GZ) {
  console.error('size-report: сжатая сборка больше бюджета');
  process.exit(1);
}
