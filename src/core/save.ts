import type { Game, GameSnapshot } from './game';

/**
 * Запись игры (ARCHITECTURE §7): одна запись JSON с номером версии.
 * Старая версия переводится в новую шагами migrate, а не сбрасывается.
 */
export const SAVE_VERSION = 1;
export const SAVE_KEY = 'tide.save';

/** Незаконченная локация: снимок партии, сид и локация. */
export interface RunSave { locationId: string; seed: number; game: GameSnapshot }
export interface SaveFile {
  version: number;
  /** Весь опыт за всё время. */
  rating: number;
  /** Пройденные локации — с M2; открытая за рекламу воронка — с M1-14. */
  campaign: { passed: string[]; whirlpoolUnlocked: boolean };
  run: RunSave | null;
  /** Повтор пройденной локации — с M2. */
  replay: null;
}

/** Запись партии. Пока партия одна, рейтинг — её опыт. */
export function makeSave(game: Game, locationId: string, seed: number): SaveFile {
  return {
    version: SAVE_VERSION,
    rating: game.stats.xpGained,
    campaign: { passed: [], whirlpoolUnlocked: game.whirlpoolUnlocked },
    run: { locationId, seed, game: game.snapshot() },
    replay: null,
  };
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Запись из текста; пусто, не JSON, чужая или новее сборки → null. Ошибок не бросает. */
export function parseSave(text: string | null): SaveFile | null {
  if (!text) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isObj(raw)) return null;
  const v = raw.version;
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > SAVE_VERSION) return null;
  const s = migrate(raw, v);
  if (!('run' in s)) return null;
  const run = s.run;
  if (run !== null && !(isObj(run) && typeof run.locationId === 'string' && typeof run.seed === 'number' && isObj(run.game))) return null;
  return s as unknown as SaveFile;
}

/** Запись новее этой сборки: её не читать и не затирать (старая сборка из кеша). */
export function isNewerSave(text: string | null): boolean {
  if (!text) return false;
  try {
    const raw: unknown = JSON.parse(text);
    return isObj(raw) && typeof raw.version === 'number' && raw.version > SAVE_VERSION;
  } catch {
    return false;
  }
}

/** Шаги версий: from → from + 1, пока не SAVE_VERSION. */
function migrate(s: Obj, from: number): Obj {
  let out = s;
  for (let v = from; v < SAVE_VERSION; v++) {
    // Шаг 1 → 2 появится здесь вместе с версией 2.
    out = { ...out, version: v + 1 };
  }
  return out;
}
