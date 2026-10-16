import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GLOSSARY, KB } from '../assistant/kb';
import { OCCUPATION_CATEGORIES } from '../domain/draws';
import { CATEGORY_ORDER, PROGRAMS, PROVINCES, TEMPLATES } from '../domain/programs';
import { ACTIVITY_KINDS } from '../domain/history';
import { en } from './en';
import { LANGUAGES, matchLanguage } from './languages';
import type { LocaleModule } from './index';

const PREFIXES = ['app', 'nav', 'common', 'onb', 'home', 'tip', 'rem', 'cal', 'trips', 'tl', 'ms', 'pred', 'as', 'elig', 'edu', 'lang', 'com', 'set', 'status', 'prog', 'prov', 'paste', 'draw', 'kb', 'gl', 'hist', 'doc', 'crsp', 'sec', 'demo', 'nat', 'ppl', 'trend'];
const KEY_RE = new RegExp(`'((?:${PREFIXES.join('|')})\\.[A-Za-z0-9_.]+)'`, 'g');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return sourceFiles(p);
    return /\.(ts|tsx)$/.test(f) && !/\.test\.ts$/.test(f) && !p.includes('i18n') ? [p] : [];
  });
}

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');

const localeDir = join(__dirname, 'locales');
const locales = readdirSync(localeDir).filter((f) => f.endsWith('.ts')).map((f) => f.replace(/\.ts$/, ''));

describe('i18n', () => {
  it('every language in the registry has a locale file (except English)', () => {
    expect(LANGUAGES.filter((l) => l.code !== 'en' && !locales.includes(l.code)).map((l) => l.code)).toEqual([]);
  });

  for (const code of locales) {
    it(`${code}: same keys and placeholders as English`, async () => {
      const mod = ((await import(`./locales/${code}.ts`)) as { default: LocaleModule }).default;
      const zh = mod.strings;
      expect(Object.keys(zh).filter((k) => !(k in en))).toEqual([]);
      expect(Object.keys(en).filter((k) => !(k in zh))).toEqual([]);
      expect(Object.keys(en).filter((k) => k in zh && placeholders(en[k]) !== placeholders(zh[k]))).toEqual([]);
    });
  }

  it('every key referenced in the source or generated from catalogues exists', () => {
    const used = new Set<string>();
    for (const f of sourceFiles(join(__dirname, '..'))) {
      for (const m of readFileSync(f, 'utf8').matchAll(KEY_RE)) if (!m[1].endsWith('.')) used.add(m[1]);
    }
    for (const list of Object.values(TEMPLATES)) list.forEach((k) => used.add(`ms.${k}`));
    for (const p of PROGRAMS) used.add(`app.kind.${p.id}`).add(`prog.desc.${p.id}`);
    CATEGORY_ORDER.forEach((c) => used.add(`prog.cat.${c}`));
    PROVINCES.forEach((c) => used.add(`prov.${c}`));
    [...OCCUPATION_CATEGORIES, 'general', 'cec', 'fsw', 'fst', 'pnp', 'french', 'other'].forEach((c) => used.add(`draw.${c}`));
    KB.forEach((e) => used.add(`kb.${e.id}`));
    GLOSSARY.forEach((g) => used.add(`gl.${g}`));
    ACTIVITY_KINDS.forEach((k) => used.add(`hist.kind.${k}`));
    for (const k of ['override', 'community', 'ircc', 'fallback']) used.add(`pred.source.${k}`);
    for (const k of ['pr_in', 'tr_in', 'none_in', 'out', 'out_planned', 'travel', 'future']) used.add(`cal.kind.${k}`);
    const missing = [...used].filter((k) => !(k in en) && !/\.(json|ts|tsx|png|svg|yml)$/.test(k));
    expect(missing).toEqual([]);
  });

  it('picks a language from OS preferences', () => {
    expect(matchLanguage(['zh-TW'])).toBe('zh-Hant');
    expect(matchLanguage(['zh-CN'])).toBe('zh');
    expect(matchLanguage(['fil-PH'])).toBe('tl');
    expect(matchLanguage(['de-DE', 'pa-IN'])).toBe('pa');
    expect(matchLanguage(['de-DE'])).toBe('en');
  });
});
