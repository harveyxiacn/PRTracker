import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MILESTONES } from '../domain/timeline';
import { en } from './en';
import { zh } from './zh';

const PREFIXES = ['app', 'nav', 'common', 'onb', 'home', 'tip', 'rem', 'cal', 'trips', 'tl', 'ms', 'pred', 'as', 'elig', 'edu', 'lang', 'com', 'set', 'status'];
const KEY_RE = new RegExp(`'((?:${PREFIXES.join('|')})\\.[A-Za-z0-9_.]+)'`, 'g');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return sourceFiles(p);
    return /\.(ts|tsx)$/.test(f) && !/\.test\.ts$/.test(f) && !p.includes('i18n') ? [p] : [];
  });
}

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');

describe('i18n', () => {
  it('zh has exactly the same keys as en', () => {
    expect(Object.keys(zh).filter((k) => !(k in en))).toEqual([]);
    expect(Object.keys(en).filter((k) => !(k in zh))).toEqual([]);
  });

  it('translations keep the same placeholders', () => {
    const bad = Object.keys(en).filter((k) => k in zh && placeholders(en[k]) !== placeholders(zh[k]));
    expect(bad).toEqual([]);
  });

  it('every key referenced in the source exists', () => {
    const used = new Set<string>();
    for (const f of sourceFiles(join(__dirname, '..'))) {
      for (const m of readFileSync(f, 'utf8').matchAll(KEY_RE)) if (!m[1].endsWith('.')) used.add(m[1]);
    }
    // dynamic keys
    for (const list of Object.values(MILESTONES)) list.forEach((k) => used.add(`ms.${k}`));
    for (const k of ['override', 'community', 'ircc', 'fallback']) used.add(`pred.source.${k}`);
    for (const k of ['pr_in', 'tr_in', 'none_in', 'out', 'out_planned', 'travel', 'future']) used.add(`cal.kind.${k}`);
    const missing = [...used].filter((k) => !(k in en) && !/\.(json|ts|tsx|png|svg|yml)$/.test(k));
    expect(missing).toEqual([]);
  });
});
