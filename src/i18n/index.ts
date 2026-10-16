import { en } from './en';
import { registerLexicon, registerLocale, type Lexicon } from '../assistant/lexicon';
import { languageInfo, matchLanguage, type Lang } from './languages';

export type { Lang };
export { LANGUAGES, languageInfo } from './languages';

export interface LocaleModule {
  strings: Record<string, string>;
  lexicon?: Lexicon;
}

// Every non-English locale is a separate chunk, loaded only when selected.
const loaders = import.meta.glob<{ default: LocaleModule }>('./locales/*.ts');

const cache = new Map<string, Record<string, string>>([['en', en]]);

/** Load a language's strings (and register its assistant lexicon). Falls back to English. */
export async function loadLanguage(code: string): Promise<Record<string, string>> {
  if (cache.has(code)) return cache.get(code)!;
  const load = loaders[`./locales/${code}.ts`];
  if (!load) return en;
  const mod = (await load()).default;
  cache.set(code, mod.strings);
  if (mod.lexicon) registerLexicon(code, mod.lexicon);
  registerLocale(languageInfo(code).intl);
  return mod.strings;
}

export function makeT(dict: Record<string, string>) {
  return (key: string, vars?: Record<string, string | number>): string => {
    let s = dict[key] ?? en[key] ?? key;
    if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
    return s;
  };
}

export function detectLang(): Lang {
  if (typeof navigator === 'undefined') return 'en';
  return matchLanguage(navigator.languages?.length ? navigator.languages : [navigator.language]);
}

/** Format an ISO date for display. */
export function fmtDate(iso: string | null | undefined, lang: Lang, opts: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric' }): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  try {
    return new Intl.DateTimeFormat(languageInfo(lang).intl, { ...opts, timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)));
  } catch {
    return iso;
  }
}

export function fmtNum(n: number, lang: Lang): string {
  try {
    return new Intl.NumberFormat(languageInfo(lang).intl).format(n);
  } catch {
    return String(n);
  }
}
