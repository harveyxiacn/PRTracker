import { describe, expect, it } from 'vitest';
import { curveFromDays, curveSample, finishCurve, finishedShare, nearestRank } from './curves';
import { FINAL_MILESTONE, type CommunityRecord } from './timeline';
import type { Application } from './types';

const app = (patch: Partial<Application> = {}): Application => ({ id: 'a', kind: 'ee_cec', submitted: '2026-01-10', milestones: [], ...patch });
const rec = (copr: number | undefined, patch: Partial<CommunityRecord> = {}): CommunityRecord => ({
  kind: 'ee_cec',
  submittedMonth: '2025-06',
  days: copr === undefined ? { aor: 10 } : { aor: 10, copr },
  ...patch,
});

// 10 finished CEC files + 2 still waiting (no copr).
const TEN = [300, 100, 120, 150, 120, 160, 180, 200, 210, 240];
const CEC = [...TEN.map((d) => rec(d)), rec(undefined), rec(undefined)];

describe('finishCurve', () => {
  it('builds the empirical CDF from finished records only', () => {
    const c = finishCurve(app(), CEC)!;
    expect(c.scope).toBe('program');
    expect(c.n).toBe(10); // the two records without copr are excluded
    // sorted: 100 120 120 150 160 180 200 210 240 300 → 10% per record, ties merged
    expect(c.points).toEqual([
      { day: 0, pct: 0 },
      { day: 100, pct: 10 },
      { day: 120, pct: 30 },
      { day: 150, pct: 40 },
      { day: 160, pct: 50 },
      { day: 180, pct: 60 },
      { day: 200, pct: 70 },
      { day: 210, pct: 80 },
      { day: 240, pct: 90 },
      { day: 300, pct: 100 },
    ]);
    // nearest rank: p50 = 5th value, p80 = 8th, p90 = 9th
    expect([c.p50, c.p80, c.p90]).toEqual([160, 210, 240]);
  });

  it('reports how many same-kind records were excluded', () => {
    expect(curveSample(app(), CEC)).toMatchObject({ scope: 'program', excluded: 2 });
  });

  it('needs at least minN finished records (default 8)', () => {
    const seven = TEN.slice(0, 7).map((d) => rec(d));
    expect(finishCurve(app(), seven)).toBeNull();
    expect(finishCurve(app(), [...seven, rec(undefined), rec(undefined)])).toBeNull(); // unfinished don't count
    expect(finishCurve(app(), seven, 5)?.n).toBe(7);
    expect(finishCurve(app(), [])).toBeNull();
  });

  it('ignores other kinds and uses the kind’s own final milestone', () => {
    const cards: CommunityRecord[] = [10, 20, 30, 40, 50, 60, 70, 80].map((d) => ({ kind: 'pr_card', submittedMonth: '2026-01', days: { aor: 5, card_received: d } }));
    const c = finishCurve(app({ kind: 'pr_card' }), [...cards, ...CEC])!;
    expect(c.n).toBe(8);
    // n=8: p50 = 4th (40), p80 = ceil(6.4) = 7th (70), p90 = ceil(7.2) = 8th (80)
    expect([c.p50, c.p80, c.p90]).toEqual([40, 70, 80]);
    expect(finishCurve(app({ kind: 'citizenship' }), [...cards, ...CEC])).toBeNull();
  });

  it('picks the narrowest scope with enough records: office → province → country → program', () => {
    const ottawa = [50, 60, 70, 80, 90, 100, 110, 120].map((d) => rec(d, { office: 'Ottawa', country: 'IN' }));
    const india = [1, 2, 3, 4, 5, 6, 7].map((d) => rec(d, { country: 'IN' }));
    const all = [...ottawa, ...india, ...CEC];
    // free-text office is matched to the allowlist ("ottawa " → Ottawa)
    expect(finishCurve(app({ office: 'ottawa ', country: 'in' }), all)).toMatchObject({ scope: 'office', n: 8, p50: 80 });
    // 7 Ottawa records → falls to country IN (7 + 7 = 14)
    expect(finishCurve(app({ office: 'Ottawa', country: 'IN' }), all.slice(1))).toMatchObject({ scope: 'country', n: 14 });
    // unknown office is ignored, no country → program (8 + 7 + 10)
    expect(finishCurve(app({ office: 'Somewhere' }), all)).toMatchObject({ scope: 'program', n: 25 });
    const on = [30, 40, 50, 60, 70, 80, 90, 100].map((d) => rec(d, { kind: 'pnp_ee', province: 'ON' }));
    const bc = [10, 20].map((d) => rec(d, { kind: 'pnp_ee', province: 'BC' }));
    expect(finishCurve(app({ kind: 'pnp_ee', province: 'ON' }), [...on, ...bc])).toMatchObject({ scope: 'province', n: 8 });
    expect(finishCurve(app({ kind: 'pnp_ee', province: 'BC' }), [...on, ...bc])).toMatchObject({ scope: 'program', n: 10 });
  });

  it('keeps a vertical step for applications finished on day 0', () => {
    const c = curveFromDays([0, 0, 10, 20], 'program');
    expect(c.points).toEqual([{ day: 0, pct: 0 }, { day: 0, pct: 50 }, { day: 10, pct: 75 }, { day: 20, pct: 100 }]);
    expect(finishedShare(c, 0)).toBe(50);
  });
});

describe('finishedShare', () => {
  const c = finishCurve(app(), CEC)!;
  it('is a step function (no interpolation between days)', () => {
    expect(finishedShare(c, -5)).toBe(0);
    expect(finishedShare(c, 0)).toBe(0);
    expect(finishedShare(c, 99)).toBe(0);
    expect(finishedShare(c, 100)).toBe(10);
    expect(finishedShare(c, 119)).toBe(10);
    expect(finishedShare(c, 120)).toBe(30);
    expect(finishedShare(c, 155)).toBe(40);
    expect(finishedShare(c, 299)).toBe(90);
    expect(finishedShare(c, 1000)).toBe(100);
  });
  it('agrees with the percentiles', () => {
    expect(finishedShare(c, c.p50!)).toBeGreaterThanOrEqual(50);
    expect(finishedShare(c, c.p50! - 1)).toBeLessThan(50);
    expect(finishedShare(c, c.p90!)).toBeGreaterThanOrEqual(90);
  });
});

describe('nearestRank', () => {
  it('handles edges', () => {
    expect(nearestRank([], 0.5)).toBeUndefined();
    expect(nearestRank([7], 0.9)).toBe(7);
    expect(nearestRank([1, 2, 3], 0)).toBe(1);
    expect(nearestRank([1, 2, 3], 1)).toBe(3);
  });
});

// scripts/moderate-community.mjs is plain JS; load it by URL so TypeScript treats it as untyped.
const moderation = () => import(/* @vite-ignore */ new URL('../../scripts/moderate-community.mjs', import.meta.url).href);
const line = (n: number, r: object | string) => ({ where: `community/records.jsonl:${n}`, text: typeof r === 'string' ? r : JSON.stringify(r) });

describe('moderate-community.mjs', () => {
  it('uses the same final milestone per kind as the app', async () => {
    const { FINAL_BY_KIND } = await moderation();
    expect(FINAL_BY_KIND).toEqual(FINAL_MILESTONE);
  });

  it('flags invalid lines, duplicates, outliers and order violations', async () => {
    const { moderate } = await moderation();
    const base = [100, 110, 120, 130, 140, 150, 160, 170, 180, 190].map((d, i) => line(i + 1, { kind: 'ee_cec', submittedMonth: '2025-01', days: { aor: 10 + i, copr: d } }));
    const lines = [
      ...base,
      line(11, { kind: 'ee_cec', submittedMonth: '2025-03', days: { aor: 5, copr: 400 } }), // p99 of the others = 190; 400 > 285
      line(12, { kind: 'ee_cec', submittedMonth: '2025-04', days: { aor: 1, copr: 3 } }), // under 5 days
      line(13, { kind: 'ee_cec', submittedMonth: '2025-05', days: { aor: 50, copr: 60, ppr: 70 } }), // ppr after copr
      line(14, { kind: 'ee_cec', submittedMonth: '2025-01', days: { aor: 10, copr: 100 } }), // exact duplicate of line 1
      line(15, { kind: 'ee_cec', submittedMonth: '2025-01', days: { aor: 20, copr: 191 } }), // line 10 is aor 19, copr 190: within ±1 day
      line(16, '{bad'),
      line(17, { kind: 'nope', submittedMonth: '2025-01', days: {} }),
    ];
    const { total, valid, findings } = moderate(lines);
    expect([total, valid]).toEqual([17, 14]);
    const got = findings.map((f: { where: string; type: string }) => `${f.type}@${f.where.split(':')[1]}`).sort();
    expect(got).toEqual(['duplicate@14', 'duplicate@15', 'invalid@16', 'invalid@17', 'order@13', 'outlier@11', 'outlier@12'].sort());
    // the slowest ordinary record (190) is not an outlier
    expect(findings.some((f: { where: string; type: string }) => f.type === 'outlier' && f.where.endsWith(':10'))).toBe(false);
  });
});
