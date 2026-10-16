// Backups exported by every released version must keep importing. Never delete a fixture;
// add one for each new version that changes the data shape.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { computeInsights } from '../domain/insights';
import { importJson } from './storage';

const load = (f: string) => importJson(readFileSync(join(__dirname, 'fixtures', f), 'utf8'));

describe('backup compatibility', () => {
  it('v0.1 backup imports with defaults for later fields', () => {
    const d = load('backup-v0.1.json');
    expect(d.profile.prDate).toBe('2023-05-01');
    expect(d.trips).toHaveLength(2);
    expect(d.trips[1].return).toBeNull();
    expect(d.applications[0].kind).toBe('spousal');
    expect(d.settings.language).toBe('zh');
    expect(d.settings.notifications.tripReturn).toBe(false);
    expect(d.documents).toBeUndefined();
    expect(d.household).toBeUndefined();
    expect(d.lock).toBeNull();
    expect(computeInsights(d, '2026-10-16').citizenship).toBeDefined();
  });
  it('v0.3 backup keeps documents, history and checklist; never imports a lock', () => {
    const d = load('backup-v0.3.json');
    expect(d.documents?.items.map((i) => i.kind)).toEqual(['passport', 'language_test']);
    expect(d.documents?.checklist.c1.passport).toBe(true);
    expect(d.history?.addresses[1].to).toBeNull();
    expect(d.history?.birthDate).toBe('1990-04-04');
    expect(d.settings.boundaryDaysPresent).toBe(false);
    expect(d.settings.notifications.documents).toBe(false);
    expect(d.lock).toBeNull();
  });
});
