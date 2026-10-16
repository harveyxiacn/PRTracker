import { describe, expect, it } from 'vitest';
import { appendPoint, appendSnapshot, changeSince, mostCommon, niceTicks, snapshotValues, validateTrends } from './trendsCore';

const P = (date: string, days: number) => ({ date, days });

describe('appendPoint', () => {
  it('starts a series', () => {
    expect(appendPoint([], '2026-01-01', 38)).toEqual([P('2026-01-01', 38)]);
  });

  it('appends only when the value changed', () => {
    const s = [P('2026-01-01', 38)];
    expect(appendPoint(s, '2026-01-02', 38)).toEqual(s);
    expect(appendPoint(s, '2026-01-02', 41)).toEqual([P('2026-01-01', 38), P('2026-01-02', 41)]);
  });

  it('refreshes an unchanged value after 30 days', () => {
    const s = [P('2026-01-01', 38)];
    expect(appendPoint(s, '2026-01-30', 38)).toHaveLength(1); // 29 days
    expect(appendPoint(s, '2026-01-31', 38)).toEqual([P('2026-01-01', 38), P('2026-01-31', 38)]); // 30 days
  });

  it('replaces the value on a same-day re-run and ignores older dates', () => {
    const s = [P('2026-01-01', 38), P('2026-02-01', 40)];
    expect(appendPoint(s, '2026-02-01', 45)).toEqual([P('2026-01-01', 38), P('2026-02-01', 45)]);
    expect(appendPoint(s, '2026-01-15', 99)).toEqual(s);
  });

  it('does not mutate its input and caps the series, dropping the oldest', () => {
    const s = [P('2026-01-01', 1), P('2026-01-02', 2), P('2026-01-03', 3)];
    const out = appendPoint(s, '2026-01-04', 4, 3);
    expect(out).toEqual([P('2026-01-02', 2), P('2026-01-03', 3), P('2026-01-04', 4)]);
    expect(s).toHaveLength(3);
  });

  it('keeps at most 400 points by default', () => {
    let s: { date: string; days: number }[] = [];
    for (let i = 0; i < 450; i++) s = appendPoint(s, new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10), i % 2 ? 10 : 20);
    expect(s).toHaveLength(400);
    expect(s[0].date).toBe('2026-02-20'); // day index 50
  });
});

describe('appendSnapshot', () => {
  const ircc = {
    times: { work_ext: 118, pr_card: 38, bad: -1, frac: 1.5 },
    byCountry: { supervisa: { PH: 200 }, study: { IN: 60, xx: 3 } },
  };

  it('creates a series per time key and per country, in sorted key order', () => {
    const h = appendSnapshot(undefined, ircc, '2026-10-16', '2026-10-16T12:00:00.000Z');
    expect(h.updated).toBe('2026-10-16T12:00:00.000Z');
    expect(Object.keys(h.series)).toEqual(['pr_card', 'study:IN', 'supervisa:PH', 'work_ext']);
    expect(h.series['study:IN']).toEqual([P('2026-10-16', 60)]);
  });

  it('keeps series missing from today\'s snapshot and only adds changed values', () => {
    const h1 = appendSnapshot(undefined, ircc, '2026-10-16', 'a');
    const h2 = appendSnapshot(h1, { times: { pr_card: 40, work_ext: 118 } }, '2026-10-17', 'b');
    expect(h2.series.pr_card).toEqual([P('2026-10-16', 38), P('2026-10-17', 40)]);
    expect(h2.series.work_ext).toEqual([P('2026-10-16', 118)]);
    expect(h2.series['supervisa:PH']).toEqual([P('2026-10-16', 200)]);
  });

  it('flattens only valid values', () => {
    expect(snapshotValues({ times: { a_b: 5, zero: 0, txt: '5' as unknown as number }, byCountry: { study: { IN: 7, IND: 8 } } })).toEqual({ a_b: 5, 'study:IN': 7 });
  });

  it('rejects an invalid date', () => {
    expect(() => appendSnapshot(undefined, ircc, '2026-02-30', 'x')).toThrow();
  });
});

describe('validateTrends', () => {
  it('rejects documents of the wrong shape', () => {
    for (const v of [null, 5, 'x', [], {}, { updated: 1, series: {} }, { updated: 'x', series: [] }, { updated: 'x' }]) expect(validateTrends(v)).toBeUndefined();
  });

  it('drops series with bad keys, bad points or unordered dates and keeps the rest', () => {
    const v = validateTrends({
      updated: 'u',
      series: {
        pr_card: [P('2026-01-01', 38), P('2026-02-01', 40)],
        'visitor-outside-canada:PH': [P('2026-01-01', 30)],
        'Bad Key': [P('2026-01-01', 38)],
        'study:india': [P('2026-01-01', 38)],
        work_ext: [P('2026-02-30', 38)],
        study_ext: [P('2026-02-01', 38), P('2026-01-01', 40)],
        visitor_ext: [P('2026-01-01', -1)],
        x_frac: [P('2026-01-01', 1.5)],
        x_dup: [P('2026-01-01', 1), P('2026-01-01', 2)],
        x_obj: 'nope',
      },
    });
    expect(v).toEqual({ updated: 'u', series: { pr_card: [P('2026-01-01', 38), P('2026-02-01', 40)], 'visitor-outside-canada:PH': [P('2026-01-01', 30)] } });
  });

  it('strips unknown point fields', () => {
    expect(validateTrends({ updated: 'u', series: { pr_card: [{ date: '2026-01-01', days: 3, x: 1 }] } })!.series.pr_card).toEqual([P('2026-01-01', 3)]);
  });
});

describe('changeSince (90 days)', () => {
  it('compares with the value in effect 90 days before the latest point', () => {
    // 2026-06-01 minus 90 days = 2026-03-03; the value then was the 2026-03-01 point (50).
    const c = changeSince([P('2026-01-01', 40), P('2026-03-01', 50), P('2026-06-01', 62)]);
    expect(c).toEqual({ latest: P('2026-06-01', 62), reference: P('2026-03-01', 50), referenceDate: '2026-03-03', change: 12, partial: false });
  });

  it('counts a point exactly 90 days earlier', () => {
    expect(changeSince([P('2026-03-03', 70), P('2026-06-01', 62)])!.change).toBe(-8);
  });

  it('falls back to the first point when history is shorter', () => {
    expect(changeSince([P('2026-05-01', 40), P('2026-06-01', 35)])).toEqual({ latest: P('2026-06-01', 35), reference: P('2026-05-01', 40), referenceDate: '2026-05-01', change: -5, partial: true });
  });

  it('needs two points', () => {
    expect(changeSince([])).toBeUndefined();
    expect(changeSince([P('2026-05-01', 40)])).toBeUndefined();
  });
});

describe('helpers', () => {
  it('mostCommon picks the most frequent value', () => {
    expect(mostCommon(['PH', undefined, 'IN', 'IN', null])).toBe('IN');
    expect(mostCommon(['PH', 'IN'])).toBe('PH');
    expect(mostCommon([undefined])).toBeUndefined();
  });

  it('niceTicks covers the range with round steps', () => {
    expect(niceTicks(38, 62, 4)).toEqual([30, 40, 50, 60, 70]);
    expect(niceTicks(38, 38, 4)).toEqual([34, 36, 38, 40, 42]);
  });
});
