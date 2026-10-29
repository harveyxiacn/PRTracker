import { describe, expect, it } from 'vitest';
import { addDays, addYears, toDay } from './dates';
import { PresenceModel, tripLength, validateTrips } from './presence';
import type { Profile, Trip } from './types';

const profile = (p: Partial<Profile>): Profile => ({ statusPeriods: [], taxYearsFiled: [], ...p });

describe('dates', () => {
  it('clamps leap days when adding years', () => {
    expect(addYears('2024-02-29', 1)).toBe('2025-02-28');
    expect(addYears('2024-02-29', 4)).toBe('2028-02-29');
    expect(addDays('2024-12-31', 1)).toBe('2025-01-01');
  });
});

describe('trips', () => {
  it('counts departure and return days as in Canada', () => {
    const t: Trip = { id: 'a', departure: '2025-03-01', return: '2025-03-10' };
    expect(tripLength(t, '2026-01-01')).toBe(8);
    expect(tripLength(t, '2026-01-01', false)).toBe(10);
    const m = new PresenceModel({ profile: profile({ prDate: '2020-01-01' }), trips: [t], today: '2026-01-01' });
    expect(m.dayKind('2025-03-01')).toBe('travel');
    expect(m.dayKind('2025-03-02')).toBe('out');
    expect(m.dayKind('2025-03-09')).toBe('out');
    expect(m.dayKind('2025-03-10')).toBe('travel');
    expect(m.absentBetween('2025-01-01', '2025-12-31')).toBe(8);
  });

  it('treats a same-day trip as zero days away', () => {
    const t: Trip = { id: 'a', departure: '2025-03-01', return: '2025-03-01' };
    expect(tripLength(t, '2026-01-01')).toBe(0);
  });

  it('flags overlapping and reversed trips', () => {
    const issues = validateTrips(
      [
        { id: 'a', departure: '2025-01-01', return: '2025-01-10' },
        { id: 'b', departure: '2025-01-05', return: '2025-01-20' },
        { id: 'c', departure: '2025-02-10', return: '2025-02-01' },
        { id: 'd', departure: '2025-01-20', return: '2025-01-25' },
      ],
      '2026-01-01',
    );
    expect(issues.map((i) => `${i.tripId}:${i.kind}`).sort()).toEqual(['b:overlap', 'c:return_before_departure']);
  });

  it('marks an ongoing trip absent through today and future planned trips separately', () => {
    const m = new PresenceModel({
      profile: profile({ prDate: '2020-01-01' }),
      trips: [
        { id: 'a', departure: '2026-01-01' },
        { id: 'b', departure: '2026-03-01', return: '2026-03-05' },
      ],
      today: '2026-01-10',
    });
    expect(m.dayKind('2026-01-10')).toBe('out');
    expect(m.dayKind('2026-01-11')).toBe('future');
    expect(m.dayKind('2026-03-03')).toBe('out_planned');
  });
});

describe('citizenship', () => {
  it('gives full credit for 5 years in Canada as a PR', () => {
    const m = new PresenceModel({ profile: profile({ prDate: '2020-01-01' }), trips: [], today: '2026-10-16' });
    const c = m.citizenshipAt('2026-10-16');
    expect(c.windowStart).toBe('2021-10-16');
    expect(c.windowEnd).toBe('2026-10-15');
    expect(c.credited).toBe(1826);
    expect(c.eligible).toBe(true);
  });

  it('adds half-day pre-PR credit capped at 365', () => {
    const m = new PresenceModel({
      profile: profile({
        prDate: '2024-01-01',
        statusPeriods: [{ id: 's', kind: 'worker', start: '2022-01-01' }],
      }),
      trips: [],
      today: '2024-01-01',
    });
    const c = m.citizenshipAt('2024-01-01');
    expect(c.prePrDays).toBe(730);
    expect(c.prePrCredit).toBe(365);
    expect(c.prDays).toBe(0);
    expect(m.citizenshipEligibleDate()).toBe('2025-12-31');
  });

  it('pushes the eligibility date out by the days of a planned trip', () => {
    const base = { profile: profile({ prDate: '2024-01-01' }), today: '2024-06-01' };
    const a = new PresenceModel({ ...base, trips: [] }).citizenshipEligibleDate()!;
    const b = new PresenceModel({ ...base, trips: [{ id: 't', departure: '2025-01-01', return: '2025-01-31' }] }).citizenshipEligibleDate()!;
    expect(a).toBe(addDays('2024-01-01', 1095));
    expect(toDay(b) - toDay(a)).toBe(29);
  });

  it('is not eligible before becoming PR', () => {
    const m = new PresenceModel({ profile: profile({}), trips: [], today: '2026-01-01' });
    expect(m.citizenshipEligibleDate()).toBeNull();
    expect(m.residencyAt()).toBeNull();
  });
});

/** Brute force: is a PR compliant on every day from `from` to `to` with these trips? */
function compliantThrough(p: Profile, trips: Trip[], today: string, from: string, to: string, boundaryDaysPresent = true): boolean {
  const m = new PresenceModel({ profile: p, trips, today, boundaryDaysPresent });
  for (let d = toDay(from); d <= toDay(to); d++) {
    const iso = addDays('1970-01-01', d);
    if (!m.residencyAt(iso)!.compliant) return false;
  }
  return true;
}

describe('residency obligation', () => {
  it('long-time PR: mustReturnBy is the last safe return date', () => {
    const p = profile({ prDate: '2015-01-01' });
    const trips: Trip[] = [{ id: 'x', departure: '2023-01-01', return: '2023-12-31' }];
    const today = '2026-10-16';
    const r = new PresenceModel({ profile: p, trips, today }).residencyAt()!;
    expect(r.compliant).toBe(true);
    expect(r.present).toBe(1826 - 363);
    const leave = addDays(today, 1);
    const end = addDays(r.mustReturnBy!, 400);
    expect(compliantThrough(p, [...trips, { id: 'y', departure: leave, return: r.mustReturnBy! }], today, leave, end)).toBe(true);
    expect(compliantThrough(p, [...trips, { id: 'y', departure: leave, return: addDays(r.mustReturnBy!, 1) }], today, leave, end)).toBe(false);
    expect(r.maxAbsence).toBe(toDay(r.mustReturnBy!) - toDay(leave) - 1);
  });

  it('new PR: can be away until only enough days remain before the 5th anniversary', () => {
    const p = profile({ prDate: '2025-01-01' });
    const today = '2025-01-10';
    const r = new PresenceModel({ profile: p, trips: [], today }).residencyAt()!;
    expect(r.anniversary).toBe('2030-01-01');
    expect(r.compliant).toBe(true);
    const leave = addDays(today, 1);
    const end = '2030-03-01';
    expect(compliantThrough(p, [{ id: 'y', departure: leave, return: r.mustReturnBy! }], today, leave, end)).toBe(true);
    expect(compliantThrough(p, [{ id: 'y', departure: leave, return: addDays(r.mustReturnBy!, 1) }], today, leave, end)).toBe(false);
  });

  it('reports a shortfall and a regain date when non-compliant', () => {
    const p = profile({ prDate: '2015-01-01' });
    const trips: Trip[] = [{ id: 'x', departure: '2022-01-01', return: '2026-06-01' }];
    const r = new PresenceModel({ profile: p, trips, today: '2026-10-16' }).residencyAt()!;
    expect(r.compliant).toBe(false);
    expect(r.shortfall).toBeGreaterThan(0);
    expect(new PresenceModel({ profile: p, trips, today: '2026-10-16' }).residencyAt(r.regainDate)!.compliant).toBe(true);
    expect(new PresenceModel({ profile: p, trips, today: '2026-10-16' }).residencyAt(addDays(r.regainDate!, -1))!.compliant).toBe(false);
  });
});

describe('residency while abroad', () => {
  it('mustReturnBy for an ongoing trip is the last safe return day', () => {
    const p = profile({ prDate: '2015-01-01' });
    const before: Trip[] = [{ id: 'x', departure: '2022-06-01', return: '2024-01-01' }];
    const dep = '2026-09-01';
    const today = '2026-10-16';
    const m = new PresenceModel({ profile: p, trips: [...before, { id: 'o', departure: dep }], today });
    const r = m.residencyAt(undefined, { abroadNow: true })!;
    expect(r.compliant).toBe(true);
    const end = addDays(r.mustReturnBy!, 400);
    expect(compliantThrough(p, [...before, { id: 'o', departure: dep, return: r.mustReturnBy! }], today, today, end)).toBe(true);
    expect(compliantThrough(p, [...before, { id: 'o', departure: dep, return: addDays(r.mustReturnBy!, 1) }], today, today, end)).toBe(false);
    expect(r.maxAbsence).toBe(toDay(r.mustReturnBy!) - toDay(today));
  });
});

describe('residency in strict mode (departure and return days count as outside)', () => {
  it('long-time PR, no trips: returning on mustReturnBy stays compliant, a day later does not', () => {
    // RCIC review v1 M2: strict mode used to report one day too late (2029-10-17 here).
    const p = profile({ prDate: '2020-01-01' });
    const today = '2026-10-16';
    const r = new PresenceModel({ profile: p, trips: [], today, boundaryDaysPresent: false }).residencyAt()!;
    expect(r.compliant).toBe(true);
    expect(r.mustReturnBy).toBe('2029-10-16');
    const leave = addDays(today, 1);
    const end = addDays(r.mustReturnBy!, 400);
    expect(compliantThrough(p, [{ id: 'y', departure: leave, return: r.mustReturnBy! }], today, leave, end, false)).toBe(true);
    expect(compliantThrough(p, [{ id: 'y', departure: leave, return: addDays(r.mustReturnBy!, 1) }], today, leave, end, false)).toBe(false);
    // Strict mode: leave and return days are both outside Canada.
    expect(r.maxAbsence).toBe(toDay(r.mustReturnBy!) - toDay(leave) + 1);
  });

  it('long-time PR with an earlier trip', () => {
    const p = profile({ prDate: '2015-01-01' });
    const trips: Trip[] = [{ id: 'x', departure: '2023-01-01', return: '2023-12-31' }];
    const today = '2026-10-16';
    const r = new PresenceModel({ profile: p, trips, today, boundaryDaysPresent: false }).residencyAt()!;
    expect(r.compliant).toBe(true);
    const leave = addDays(today, 1);
    const end = addDays(r.mustReturnBy!, 400);
    expect(compliantThrough(p, [...trips, { id: 'y', departure: leave, return: r.mustReturnBy! }], today, leave, end, false)).toBe(true);
    expect(compliantThrough(p, [...trips, { id: 'y', departure: leave, return: addDays(r.mustReturnBy!, 1) }], today, leave, end, false)).toBe(false);
  });

  it('new PR: last safe return day before the 5th anniversary', () => {
    const p = profile({ prDate: '2025-01-01' });
    const today = '2025-01-10';
    const r = new PresenceModel({ profile: p, trips: [], today, boundaryDaysPresent: false }).residencyAt()!;
    expect(r.compliant).toBe(true);
    const leave = addDays(today, 1);
    const end = '2030-03-01';
    expect(compliantThrough(p, [{ id: 'y', departure: leave, return: r.mustReturnBy! }], today, leave, end, false)).toBe(true);
    expect(compliantThrough(p, [{ id: 'y', departure: leave, return: addDays(r.mustReturnBy!, 1) }], today, leave, end, false)).toBe(false);
  });

  it('abroad now: mustReturnBy is the last safe return day', () => {
    const p = profile({ prDate: '2015-01-01' });
    const before: Trip[] = [{ id: 'x', departure: '2022-06-01', return: '2024-01-01' }];
    const dep = '2026-09-01';
    const today = '2026-10-16';
    const m = new PresenceModel({ profile: p, trips: [...before, { id: 'o', departure: dep }], today, boundaryDaysPresent: false });
    const r = m.residencyAt(undefined, { abroadNow: true })!;
    expect(r.compliant).toBe(true);
    const end = addDays(r.mustReturnBy!, 400);
    expect(compliantThrough(p, [...before, { id: 'o', departure: dep, return: r.mustReturnBy! }], today, today, end, false)).toBe(true);
    expect(compliantThrough(p, [...before, { id: 'o', departure: dep, return: addDays(r.mustReturnBy!, 1) }], today, today, end, false)).toBe(false);
    expect(r.maxAbsence).toBe(toDay(r.mustReturnBy!) - toDay(today));
  });
});

describe('review regressions', () => {
  it('counts an ongoing trip as away through today', () => {
    expect(tripLength({ id: 'o', departure: '2026-03-01' }, '2026-03-10')).toBe(9);
    const m = new PresenceModel({ profile: profile({ prDate: '2020-01-01' }), trips: [{ id: 'o', departure: '2026-03-01' }], today: '2026-03-10' });
    expect(m.absentBetween('2026-03-01', '2026-03-10')).toBe(9);
  });

  it('flags a trip nested inside a long earlier trip', () => {
    const issues = validateTrips(
      [
        { id: 'long', departure: '2025-01-01', return: '2025-06-01' },
        { id: 'short', departure: '2025-01-10', return: '2025-01-20' },
        { id: 'nested', departure: '2025-03-01', return: '2025-03-05' },
      ],
      '2026-01-01',
    );
    expect(issues.filter((i) => i.kind === 'overlap').map((i) => i.tripId).sort()).toEqual(['nested', 'short']);
  });

  it('does not count years before arrival as in Canada', () => {
    const m = new PresenceModel({ profile: profile({ prDate: '2024-01-01' }), trips: [], today: '2026-10-16' });
    expect(m.yearStats(2021, []).inCanada).toBe(0);
    expect(m.yearStats(2024, []).inCanada).toBe(366);
  });
});
