import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PROGRAMS, TEMPLATES, TEMPLATE_FINAL } from './programs';

describe('program catalogue', () => {
  it('every template contains its final milestone, and ids are unique', () => {
    for (const [id, list] of Object.entries(TEMPLATES)) expect(list, id).toContain(TEMPLATE_FINAL[id as keyof typeof TEMPLATES]);
    expect(new Set(PROGRAMS.map((p) => p.id)).size).toBe(PROGRAMS.length);
  });
  it('the community intake validator knows every program id', () => {
    const src = readFileSync(join(__dirname, '../../scripts/build-community.mjs'), 'utf8');
    const kinds = /export const KINDS = \[([\s\S]*?)\];/.exec(src)![1].match(/'([a-z_]+)'/g)!.map((s) => s.slice(1, -1));
    expect(kinds.sort()).toEqual(PROGRAMS.map((p) => p.id).sort());
  });
});

describe('office allowlist', () => {
  it('matches the community intake validator', async () => {
    const { OFFICES } = await import('./programs');
    const src = readFileSync(join(__dirname, '../../scripts/build-community.mjs'), 'utf8');
    const list = /export const OFFICES = \[([\s\S]*?)\];/.exec(src)![1].match(/'([^']+)'/g)!.map((s) => s.slice(1, -1));
    expect(list).toEqual([...OFFICES]);
  });
});
