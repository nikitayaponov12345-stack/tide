/** Ключ записи настроек — отдельно от записи партии (SAVE_KEY). */
export const SETTINGS_KEY = 'tide.settings';

export type Lang = 'ru' | 'en';
/** Настройки игрока: язык, выбранный в окне паузы; нет — язык площадки. */
export interface Settings {
  lang?: Lang;
}

/** Настройки из текста записи. Пусто, не JSON, не объект, неизвестный язык → {}. Ошибок не бросает. */
export function parseSettings(text: string | null): Settings {
  if (!text) return {};
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    return {};
  }
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return {};
  const lang = (v as { lang?: unknown }).lang;
  return lang === 'ru' || lang === 'en' ? { lang } : {};
}
