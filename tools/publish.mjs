// Сборка по ссылке для телефона: `npm run publish` собирает игру и отправляет dist/ в открытый репозиторий tide-play
// (GitHub Pages). `npm run publish -- --dry-run` — всё, кроме git push. TIDE_PUBLISH_REMOTE заменяет адрес репозитория.
import { spawnSync } from 'node:child_process';
import { chmodSync, cpSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const OUT = join(ROOT, 'build', 'publish');
const REMOTE = process.env.TIDE_PUBLISH_REMOTE || 'https://github.com/nikitayaponov12345-stack/tide-play.git';
const PAGE = 'https://nikitayaponov12345-stack.github.io/tide-play/';
const DRY = process.argv.includes('--dry-run');

function fail(msg) {
  console.error(`publish: ${msg}`);
  process.exit(1);
}

/** Команда git с выводом в строку (без оболочки: аргументы не нужно экранировать); ненулевой код — выход с её выводом. */
function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8', ...opts });
  if (r.error || r.status !== 0) {
    fail(`${cmd} ${args.join(' ')} — код ${r.status}\n${r.stdout ?? ''}${r.stderr ?? ''}${r.error ?? ''}`);
  }
  return (r.stdout ?? '').trim();
}

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

/** Удалить папку; на Windows объекты git бывают только для чтения — снять атрибут и повторить. */
function removeDir(dir) {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    for (const p of walk(dir)) chmodSync(p, 0o666);
    rmSync(dir, { recursive: true, force: true });
  }
}

const pad = (n) => String(n).padStart(2, '0');
function stamp(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// 1. Метка сборки и версия.
const hash = run('git', ['rev-parse', '--short', 'HEAD']);
const dirty = run('git', ['status', '--porcelain']) !== '';
const label = hash + (dirty ? '+' : '');
const version = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;

// 2. Сборка с меткой; вывод — в консоль как есть. npm на Windows — npm.cmd, поэтому через оболочку.
// Через оболочку команда передаётся одной строкой: массив аргументов с shell Node считает устаревшим (DEP0190).
const win = process.platform === 'win32';
const build = spawnSync(win ? 'npm run build' : 'npm', win ? [] : ['run', 'build'], {
  cwd: ROOT,
  stdio: 'inherit',
  shell: win,
  env: { ...process.env, VITE_BUILD: label },
});
if (build.error || build.status !== 0) fail(`npm run build — код ${build.status}${build.error ? `\n${build.error}` : ''}`);

// 3. Страница живёт по адресу …/tide-play/: в index.html только относительные пути.
const html = readFileSync(join(DIST, 'index.html'), 'utf8');
const absolute = html.match(/(?:src|href)=["']\/(?!\/)[^"']*["']/g);
if (absolute) fail(`в dist/index.html абсолютные пути (${absolute.join(', ')}): нужен base: "./" в vite.config.ts`);

// 4. Чистая папка build/publish/ с содержимым dist/ и .nojekyll.
removeDir(OUT);
cpSync(DIST, OUT, { recursive: true });
writeFileSync(join(OUT, '.nojekyll'), '');
const files = walk(OUT).map((p) => relative(OUT, p));

// 5. Отдельный репозиторий из одного коммита; история tide-play заменяется целиком.
const git = (...args) => run('git', args, { cwd: OUT });
git('init', '-b', 'main');
git('add', '-A');
git('commit', '-m', `Прилив ${version} (${label}) ${stamp(new Date())}`);

// 6. Итог.
if (DRY) {
  console.log(`publish: Прилив ${version} (${label}), файлов ${files.length}, адрес ${REMOTE} — push не делался`);
} else {
  git('push', '--force', REMOTE, 'main');
  console.log(`publish: отправлено файлов ${files.length}`);
  console.log(`${PAGE}?v=${encodeURIComponent(label)}`);
  console.log('GitHub Pages обновляет страницу 1–2 минуты; в отладочной строке игры — метка сборки');
}
