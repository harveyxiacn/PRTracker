import { describe, expect, it } from 'vitest';
import { absencesToCsv, cardRenewalCheck, cardRenewalOpens, citizenshipAbsences, presenceReport, type AbsenceRow } from './forms';
import { PresenceModel } from './presence';
import { emptyData, type AppData, type Profile, type StatusPeriod, type Trip } from './types';

const TODAY = '2026-01-01';

function make(profile: Partial<Profile>, trips: Trip[], boundary = true): AppData {
  const d = emptyData();
  return {
    ...d,
    profile: { ...d.profile, ...profile },
    trips,
    settings: { ...d.settings, boundaryDaysPresent: boundary },
  };
}

const sp = (id: string, kind: StatusPeriod['kind'], start: string, end?: string | null): StatusPeriod => ({ id, kind, start, end });

/** Report totals must equal the engine used everywhere else in the app. */
function expectMatchesModel(data: AppData, applicationDate: string, today = TODAY) {
  const r = presenceReport(data, applicationDate, today);
  const c = new PresenceModel({ profile: data.profile, trips: data.trips, today, boundaryDaysPresent: data.settings.boundaryDaysPresent }).citizenshipAt(applicationDate);
  expect(r.credited).toBe(c.credited);
  expect(r.prDaysPresent).toBe(c.prDays);
  expect(r.prePrDaysPresent).toBe(c.prePrDays);
  expect(r.prePrCredit).toBe(c.prePrCredit);
  expect(r.eligible).toBe(c.eligible);
  expect(r.windowStart).toBe(c.windowStart);
  expect(r.windowEnd).toBe(c.windowEnd);
  expect(r.prePrPeriods.reduce((s, p) => s + p.daysPresent, 0)).toBe(c.prePrDays);
  return r;
}

// Scenario A: PR since 2020, application 2026-01-01 → window 2021-01-01 … 2025-12-31 (1,826 days, 2024 is leap).
const tripsA: Trip[] = [
  { id: 'old', departure: '2019-05-01', return: '2019-05-10' }, // before the window
  { id: 'start', departure: '2020-12-25', return: '2021-01-05', destination: 'Mexico' }, // crosses window start
  { id: 'mid', departure: '2023-03-01', return: '2023-03-10', destination: 'Paris, France', purpose: 'vacation', note: 'Wedding' },
  { id: 'day', departure: '2024-06-01', return: '2024-06-01', destination: 'Seattle, USA', purpose: 'other' }, // same-day trip
  { id: 'end', departure: '2025-12-30', return: '2026-01-10', purpose: 'family' }, // crosses window end
];

describe('citizenshipAbsences', () => {
  it('clips trips to the window (boundary days count as in Canada)', () => {
    const rows = citizenshipAbsences(make({ prDate: '2020-01-01' }, tripsA), '2026-01-01', TODAY);
    expect(rows).toEqual([
      // absent 2020-12-26 … 2021-01-04; inside the window 2021-01-01 … 01-04 = 4
      { from: '2020-12-25', to: '2021-01-05', days: 4, destination: 'Mexico', reason: '' },
      { from: '2023-03-01', to: '2023-03-10', days: 8, destination: 'Paris, France', reason: 'Vacation: Wedding' },
      { from: '2024-06-01', to: '2024-06-01', days: 0, destination: 'Seattle, USA', reason: 'Other' },
      // absent 2025-12-31 … 2026-01-09; inside the window only 2025-12-31
      { from: '2025-12-30', to: '2026-01-10', days: 1, destination: '', reason: 'Family' },
    ]);
  });

  it('strict mode counts both border days as outside', () => {
    const rows = citizenshipAbsences(make({ prDate: '2020-01-01' }, tripsA, false), '2026-01-01', TODAY);
    // 2021-01-01…01-05 = 5; Mar 1–10 = 10; same-day = 1; 2025-12-30…12-31 = 2
    expect(rows.map((r) => r.days)).toEqual([5, 10, 1, 2]);
  });

  it('lists trips that only touch the window edges', () => {
    const trips: Trip[] = [
      { id: 'a', departure: '2020-12-20', return: '2021-01-01' }, // returns on the window's first day
      { id: 'b', departure: '2025-12-31', return: '2026-01-05' }, // leaves on the window's last day
      { id: 'c', departure: '2026-01-01', return: '2026-01-05' }, // leaves on the application day: outside
    ];
    expect(citizenshipAbsences(make({ prDate: '2020-01-01' }, trips), '2026-01-01', TODAY).map((r) => [r.from, r.days])).toEqual([
      ['2020-12-20', 0],
      ['2025-12-31', 0],
    ]);
    expect(citizenshipAbsences(make({ prDate: '2020-01-01' }, trips, false), '2026-01-01', TODAY).map((r) => [r.from, r.days])).toEqual([
      ['2020-12-20', 1],
      ['2025-12-31', 1],
    ]);
  });

  it('runs an ongoing trip to today', () => {
    const trips: Trip[] = [{ id: 'o', departure: '2025-11-01', return: null, destination: 'Tokyo, Japan', purpose: 'work' }];
    const [row] = citizenshipAbsences(make({ prDate: '2020-01-01' }, trips), '2026-01-01', '2025-11-20');
    // away 2025-11-02 … 2025-11-20
    expect(row).toEqual({ from: '2025-11-01', to: '2025-11-20', days: 19, destination: 'Tokyo, Japan', reason: 'Work' });
    const [strict] = citizenshipAbsences(make({ prDate: '2020-01-01' }, trips, false), '2026-01-01', '2025-11-20');
    expect(strict.days).toBe(21); // 11-01 … 11-21: like the model, assumes the return is tomorrow
  });

  it('counts overlapping trips once in the total', () => {
    const trips: Trip[] = [
      { id: 'a', departure: '2024-03-01', return: '2024-03-11' },
      { id: 'b', departure: '2024-03-05', return: '2024-03-15' },
    ];
    const r = presenceReport(make({ prDate: '2020-01-01' }, trips), '2026-01-01', '2025-11-20');
    expect(r.absences.map((x) => x.days)).toEqual([9, 9]);
    expect(r.totalAbsenceDays).toBe(13); // 03-02 … 03-14
  });

  it('skips malformed and reversed trips', () => {
    const trips: Trip[] = [
      { id: 'x', departure: '', return: '2023-01-01' },
      { id: 'y', departure: '2023-02-10', return: '2023-02-01' },
    ];
    expect(citizenshipAbsences(make({ prDate: '2020-01-01' }, trips), '2026-01-01', TODAY)).toEqual([]);
  });
});

describe('presenceReport', () => {
  it('PR-only, boundary mode: 1,826 − 13 = 1,813 credited', () => {
    const r = expectMatchesModel(make({ prDate: '2020-01-01' }, tripsA), '2026-01-01');
    expect(r.windowStart).toBe('2021-01-01');
    expect(r.windowEnd).toBe('2025-12-31');
    expect(r.prPeriodStart).toBe('2021-01-01');
    expect(r.totalAbsenceDays).toBe(13);
    expect(r.prDaysPresent).toBe(1813);
    expect(r.credited).toBe(1813);
    expect(r.required).toBe(1095);
    expect(r.eligible).toBe(true);
    expect(r.prePrPeriods).toEqual([]);
  });

  it('PR-only, strict mode: 1,826 − 18 = 1,808 credited', () => {
    const r = expectMatchesModel(make({ prDate: '2020-01-01' }, tripsA, false), '2026-01-01');
    expect(r.totalAbsenceDays).toBe(18);
    expect(r.credited).toBe(1808);
  });

  it('caps pre-PR credit at 365 days', () => {
    // Worker since 2019 (clipped to 2021-01-01), PR 2024-01-01. Pre-PR 2021-01-01 … 2023-12-31 = 1,095 days,
    // minus a 10-day trip = 1,085 → ½ = 542.5 → capped at 365. PR 2024-01-01 … 2025-12-31 = 731.
    const data = make({ prDate: '2024-01-01', statusPeriods: [sp('w', 'worker', '2019-01-01')] }, [{ id: 't', departure: '2022-06-01', return: '2022-06-12' }]);
    const r = expectMatchesModel(data, '2026-01-01');
    expect(r.prePrPeriods).toEqual([{ from: '2021-01-01', to: '2023-12-31', daysPresent: 1085, kind: 'worker' }]);
    expect(r.prePrDaysPresent).toBe(1085);
    expect(r.prePrCredit).toBe(365);
    expect(r.prDaysPresent).toBe(731);
    expect(r.prPeriodStart).toBe('2024-01-01');
    expect(r.credited).toBe(1096);
    expect(r.eligible).toBe(true);
    expectMatchesModel({ ...data, settings: { ...data.settings, boundaryDaysPresent: false } }, '2026-01-01');
  });

  it('half-day credit across several (overlapping) periods, counted once', () => {
    // student 2021-06-01…12-31 = 214 days − 3 (trip Aug 1–5) = 211; visitor overlaps Dec–Jan: only Jan 2022 new (31);
    // worker 2022-02-01…06-30 new = 150. Pre-PR 392 → 196. PR 2022-07-01…2025-12-31 = 184 + 365 + 366 + 365 = 1,280.
    const data = make(
      {
        prDate: '2022-07-01',
        statusPeriods: [sp('w', 'worker', '2022-01-01'), sp('s', 'student', '2021-06-01', '2021-12-31'), sp('v', 'visitor', '2021-12-01', '2022-01-31')],
      },
      [{ id: 't', departure: '2021-08-01', return: '2021-08-05' }],
    );
    const r = expectMatchesModel(data, '2026-01-01');
    expect(r.prePrPeriods).toEqual([
      { from: '2021-06-01', to: '2021-12-31', daysPresent: 211, kind: 'student' },
      { from: '2021-12-01', to: '2022-01-31', daysPresent: 31, kind: 'visitor' },
      { from: '2022-01-01', to: '2022-06-30', daysPresent: 150, kind: 'worker' },
    ]);
    expect(r.prePrCredit).toBe(196);
    expect(r.prDaysPresent).toBe(1280);
    expect(r.credited).toBe(1476);
  });

  it('floors a half day and matches the model in strict mode and with an ongoing trip', () => {
    const data = make({ prDate: '2022-07-01', statusPeriods: [sp('s', 'student', '2021-06-01')] }, [
      { id: 'o', departure: '2025-11-01', return: null },
    ]);
    // student 2021-06-01 … 2022-06-30 = 395 days → 197.5
    const r = expectMatchesModel(data, '2026-01-01', '2025-11-20');
    expect(r.prePrCredit).toBe(197.5);
    expect(r.prDaysPresent).toBe(1280 - 19);
    expect(r.credited).toBe(1458); // floor(1261 + 197.5)
    expectMatchesModel({ ...data, settings: { ...data.settings, boundaryDaysPresent: false } }, '2026-01-01', '2025-11-20');
    expectMatchesModel(data, '2027-03-15', '2025-11-20');
  });

  it('is not eligible before PR, and has no PR period', () => {
    const data = make({ prDate: '2027-01-01', statusPeriods: [sp('w', 'worker', '2020-01-01')] }, []);
    const r = expectMatchesModel(data, '2026-01-01');
    expect(r.prPeriodStart).toBeNull();
    expect(r.eligible).toBe(false);
    expect(r.prePrCredit).toBe(365);
    const none = expectMatchesModel(make({}, []), '2026-01-01');
    expect(none.credited).toBe(0);
  });
});

describe('cardRenewalCheck', () => {
  it('PR for 5+ years: 730 days in the 5 years before signing', () => {
    // window 2021-01-01 … 2025-12-31 (1,826 days); away 2021-01-11 … 2024-01-12 = 355 + 365 + 365 + 12 = 1,097
    const fail = cardRenewalCheck(make({ prDate: '2018-01-01' }, [{ id: 't', departure: '2021-01-10', return: '2024-01-13' }]), '2026-01-01', TODAY);
    expect(fail.windowStart).toBe('2021-01-01');
    expect(fail.presentDays).toBe(729);
    expect(fail.compliant).toBe(false);
    expect(fail.shortfall).toBe(1);
    // Back 12 days earlier: away 1,085 → 741 present.
    const ok = cardRenewalCheck(make({ prDate: '2018-01-01' }, [{ id: 't', departure: '2021-01-10', return: '2024-01-01' }]), '2026-01-01', TODAY);
    expect(ok.presentDays).toBe(741);
    expect(ok.compliant).toBe(true);
    expect(ok.shortfall).toBe(0);
  });

  it('PR for under 5 years: can still reach 730 by the 5th anniversary', () => {
    // PR 2024-01-01; away 2024-02-02 … 2025-11-30 (334 + 334 = 668) → present 731 − 668 = 63.
    // 63 + days left to 2029-01-01 (1,096) ≥ 730 → compliant.
    const r = cardRenewalCheck(make({ prDate: '2024-01-01' }, [{ id: 't', departure: '2024-02-01', return: '2025-12-01' }]), '2026-01-01', TODAY);
    expect(r.windowStart).toBe('2024-01-01');
    expect(r.presentDays).toBe(63);
    expect(r.compliant).toBe(true);
    expect(r.shortfall).toBe(0);
    // Signing 2028-06-01 after being away 2024-01-06 … 2028-04-30: present 5 + 31 = 36; 214 days to the anniversary.
    const late = cardRenewalCheck(make({ prDate: '2024-01-01' }, [{ id: 't', departure: '2024-01-05', return: '2028-05-01' }]), '2028-06-01', TODAY);
    expect(late.presentDays).toBe(36);
    expect(late.compliant).toBe(false);
    expect(late.shortfall).toBe(730 - 36 - 214);
  });

  it('opens the renewal window 270 days before expiry', () => {
    const data = make({ prDate: '2018-01-01', prCardExpiry: '2026-09-01' }, []);
    // 2026-09-01 − 270 days = 2025-12-05 (nine calendar months, 2025-12-01, would be 274 days).
    expect(cardRenewalOpens('2026-09-01')).toBe('2025-12-05');
    expect(cardRenewalCheck(data, '2025-12-05', TODAY).canApplyNow).toBe(true);
    expect(cardRenewalCheck(data, '2025-12-04', TODAY).canApplyNow).toBe(false);
    expect(cardRenewalCheck(data, '2025-12-01', TODAY).canApplyNow).toBe(false);
    expect(cardRenewalCheck(data, '2027-01-01', TODAY).canApplyNow).toBe(true); // expired
    expect(cardRenewalCheck(data, '2025-12-01', TODAY).cardExpiry).toBe('2026-09-01');
    expect(cardRenewalCheck(make({ prDate: '2018-01-01' }, []), TODAY, TODAY).canApplyNow).toBe(false);
  });

  it('not a PR yet', () => {
    const r = cardRenewalCheck(make({}, []), TODAY, TODAY);
    expect(r.compliant).toBe(false);
    expect(r.shortfall).toBe(730);
    expect(r.windowStart).toBe('2021-01-01');
  });
});

describe('absencesToCsv', () => {
  it('writes RFC-4180 with the form headers', () => {
    const rows: AbsenceRow[] = [
      { from: '2023-03-01', to: '2023-03-10', days: 8, destination: 'Paris, France', reason: 'Vacation: "big" wedding' },
      { from: '2024-06-01', to: '2024-06-01', days: 0, destination: 'Seattle', reason: 'Other: line1\nline2' },
    ];
    expect(absencesToCsv(rows)).toBe(
      'From,To,Number of days,Destination,Reason\r\n' +
        '2023-03-01,2023-03-10,8,"Paris, France","Vacation: ""big"" wedding"\r\n' +
        '2024-06-01,2024-06-01,0,Seattle,"Other: line1\nline2"\r\n',
    );
    expect(absencesToCsv([])).toBe('From,To,Number of days,Destination,Reason\r\n');
  });
});
