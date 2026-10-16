import { en } from './en';
import { zh } from './zh';

export type Lang = 'en' | 'zh';
export const dictionaries: Record<Lang, Record<string, string>> = { en, zh };

export function makeT(lang: Lang) {
  const dict = dictionaries[lang];
  return (key: string, vars?: Record<string, string | number>): string => {
    let s = dict[key] ?? en[key] ?? key;
    if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
    return s;
  };
}

export function detectLang(): Lang {
  if (typeof navigator !== 'undefined' && /^zh/i.test(navigator.language)) return 'zh';
  return 'en';
}

/** Format an ISO date for display. */
export function fmtDate(iso: string | null | undefined, lang: Lang, opts: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric' }): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  try {
    return new Intl.DateTimeFormat(lang === 'zh' ? 'zh-CN' : 'en-CA', { ...opts, timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)));
  } catch {
    return iso;
  }
}

export function fmtNum(n: number, lang: Lang): string {
  return new Intl.NumberFormat(lang === 'zh' ? 'zh-CN' : 'en-CA').format(n);
}
