import { describe, expect, it } from 'vitest';
import { crossChecks } from './crossChecks';
import type { DocItem } from './documents';
import type { Insights } from './insights';
import { emptyData, type AppData, type Application, type Trip } from './types';

const TODAY = '2026-10-16';

function ins(eligible = false): Insights {
  return { today: TODAY, citizenship: eligible ? { eligible: true } : undefined } as unknown as Insights;
}

function mk(p: { docs?: DocItem[]; apps?: Application[]; trips?: Trip[]; prDate?: string; card?: string; tax?: number[] }): AppData {
  const d = emptyData();
  return {
    ...d,
    profile: { ...d.profile, prDate: p.prDate, prCardExpiry: p.card, taxYearsFiled: p.tax ?? [] },
    trips: p.trips ?? [],
    applications: p.apps ?? [],
    documents: { items: p.docs ?? [], checklist: {} },
  };
}

const ee = (submitted?: string): Application => ({ id: 'a1', kind: 'ee_cec', submitted, milestones: [] });
const keys = (d: AppData, i = ins()) => crossChecks(d, i).map((c) => c.key);

describe('language test vs Express Entry', () => {
  it('warns when it expires within 60 days and the application is not submitted', () => {
    // issued 2024-11-20 → valid to 2026-11-20 = 35 days after 2026-10-16
    const r = crossChecks(mk({ docs: [{ id: 'l', kind: 'language_test', issued: '2024-11-20' }], apps: [ee()] }), ins());
    expect(r).toEqual([{ key: 'xc.langSoon', severity: 'warn', vars: { date: '2026-11-20', days: 35 } }]);
  });
  it('critical when already expired and not submitted', () => {
    const r = crossChecks(mk({ docs: [{ id: 'l', kind: 'language_test', issued: '2024-10-01' }], apps: [ee()] }), ins());
    expect(r).toEqual([{ key: 'xc.langExpired', severity: 'critical', vars: { date: '2026-10-01' } }]);
  });
  it('critical when it expired before the submission date', () => {
    const r = crossChecks(mk({ docs: [{ id: 'l', kind: 'language_test', issued: '2023-01-10' }], apps: [ee('2025-02-01')] }), ins());
    expect(r).toEqual([{ key: 'xc.langAtSubmission', severity: 'critical', vars: { date: '2025-01-10', submitted: '2025-02-01' } }]);
  });
  it('quiet when valid long enough, valid at submission, or no EE application', () => {
    expect(keys(mk({ docs: [{ id: 'l', kind: 'language_test', issued: '2025-06-01' }], apps: [ee()] }))).toEqual([]);
    expect(keys(mk({ docs: [{ id: 'l', kind: 'language_test', issued: '2023-01-10' }], apps: [ee('2024-12-01')] }))).toEqual([]);
    expect(keys(mk({ docs: [{ id: 'l', kind: 'language_test', issued: '2024-11-20' }] }))).toEqual([]);
    expect(keys(mk({ docs: [{ id: 'l', kind: 'language_test', issued: '2024-11-20' }], apps: [{ ...ee(), kind: 'spousal' }] }))).toEqual([]);
  });
});

describe('passport vs planned trips', () => {
  const trip: Trip = { id: 't', departure: '2027-01-10', return: '2027-01-31' };
  const pp = (expires: string, holder?: string): DocItem => ({ id: 'p', kind: 'passport', expires, holder });
  it('critical when it expires before return + 30 days (2027-03-02)', () => {
    expect(crossChecks(mk({ docs: [pp('2027-02-20')], trips: [trip] }), ins())).toEqual([
      { key: 'xc.passportTrip', severity: 'critical', vars: { date: '2027-02-20', departure: '2027-01-10', return: '2027-01-31' } },
    ]);
    expect(keys(mk({ docs: [pp('2027-03-02')], trips: [trip] }))).toEqual(['xc.passportTrip']);
  });
  it('warns when it expires within 6 months of departure (before 2027-07-10)', () => {
    expect(crossChecks(mk({ docs: [pp('2027-03-03')], trips: [trip] }), ins())).toEqual([
      { key: 'xc.passportSixMonths', severity: 'warn', vars: { date: '2027-03-03', departure: '2027-01-10' } },
    ]);
  });
  it('quiet with 6+ months left, for past trips, or for someone else’s passport', () => {
    expect(keys(mk({ docs: [pp('2027-07-10')], trips: [trip] }))).toEqual([]);
    expect(keys(mk({ docs: [pp('2026-11-01')], trips: [{ id: 'x', departure: '2026-01-01', return: '2026-01-10' }] }))).toEqual([]);
    expect(keys(mk({ docs: [pp('2027-02-20', 'spouse')], trips: [trip] }))).toEqual([]);
    // a second, newer passport covers the trip
    expect(keys(mk({ docs: [pp('2027-02-20'), { ...pp('2035-01-01'), id: 'p2' }], trips: [trip] }))).toEqual([]);
  });
});

describe('PR card vs trips', () => {
  const trip: Trip = { id: 't', departure: '2027-01-10', return: '2027-01-31' };
  it('critical when the card expires before the return', () => {
    expect(crossChecks(mk({ prDate: '2022-01-01', tax: [2023, 2024, 2025], card: '2027-01-20', trips: [trip] }), ins())).toEqual([
      { key: 'xc.prCardTrip', severity: 'critical', vars: { date: '2027-01-20', departure: '2027-01-10', return: '2027-01-31' } },
    ]);
  });
  it('quiet when valid on the return day or the trip ends before expiry', () => {
    expect(keys(mk({ prDate: '2022-01-01', tax: [2023, 2024, 2025], card: '2027-01-31', trips: [trip] }))).toEqual([]);
    expect(keys(mk({ prDate: '2022-01-01', tax: [2023, 2024, 2025], card: '2027-01-20', trips: [{ id: 'x', departure: '2026-12-01', return: '2026-12-20' }] }))).toEqual([]);
  });

  it('critical when abroad now (no return date) and the card has expired', () => {
    const away: Trip = { id: 'o', departure: '2026-09-01', return: null };
    expect(crossChecks(mk({ prDate: '2022-01-01', tax: [2023, 2024, 2025], card: '2026-10-01', trips: [away] }), ins())).toEqual([
      { key: 'xc.prCardTrip', severity: 'critical', vars: { date: '2026-10-01', departure: '2026-09-01', return: '…' } },
    ]);
    expect(keys(mk({ prDate: '2022-01-01', tax: [2023, 2024, 2025], card: '2027-10-01', trips: [away] }))).toEqual([]);
  });

  it('uses a renewed card from Documents when it is later than the profile date', () => {
    const renewed: DocItem = { id: 'c', kind: 'pr_card_copy', expires: '2031-01-01' };
    expect(keys(mk({ prDate: '2022-01-01', tax: [2023, 2024, 2025], card: '2027-01-20', trips: [trip], docs: [renewed] }))).toEqual([]);
  });
});

describe('PR application in progress', () => {
  const med = (issued: string): DocItem => ({ id: 'm', kind: 'medical', issued });
  it('medical exam older than 12 months → warn', () => {
    // 2025-09-01 + 12 months = 2026-09-01 < today
    expect(crossChecks(mk({ docs: [med('2025-09-01')], apps: [ee('2026-01-01')] }), ins())).toEqual([
      { key: 'xc.medicalOld', severity: 'warn', vars: { date: '2026-09-01' } },
    ]);
  });
  it('medical: quiet when recent, landed, or already a PR', () => {
    expect(keys(mk({ docs: [med('2025-11-01')], apps: [ee('2026-01-01')] }))).toEqual([]);
    expect(keys(mk({ docs: [med('2025-09-01')], apps: [{ ...ee('2026-01-01'), milestones: [{ key: 'landed', date: '2026-10-01' }] }] }))).toEqual([]);
    expect(keys(mk({ docs: [med('2025-09-01')], apps: [ee('2026-01-01')], prDate: '2026-10-01' }))).toEqual([]);
  });
  it('permit expiring within 4 months → warn', () => {
    // 2026-10-16 → 2027-01-10 = 15 + 30 + 31 + 10 = 86 days
    expect(crossChecks(mk({ docs: [{ id: 'w', kind: 'work_permit', expires: '2027-01-10' }], apps: [ee('2026-05-01')] }), ins())).toEqual([
      { key: 'xc.permitPr', severity: 'warn', vars: { date: '2027-01-10', days: 86 } },
    ]);
  });
  it('permit: quiet after 4 months (2027-02-16), when expired, or with no PR application', () => {
    expect(keys(mk({ docs: [{ id: 'w', kind: 'work_permit', expires: '2027-02-17' }], apps: [ee('2026-05-01')] }))).toEqual([]);
    expect(keys(mk({ docs: [{ id: 'w', kind: 'study_permit', expires: '2026-10-01' }], apps: [ee('2026-05-01')] }))).toEqual([]);
    expect(keys(mk({ docs: [{ id: 'w', kind: 'work_permit', expires: '2027-01-10' }], apps: [{ id: 'x', kind: 'work_ext', milestones: [] }] }))).toEqual([]);
  });
});

describe('citizenship and tax', () => {
  it('eligible without a citizenship application → info', () => {
    expect(crossChecks(mk({ prDate: '2020-01-01', tax: [2021, 2022, 2023] }), ins(true))).toEqual([{ key: 'xc.citNoApp', severity: 'info' }]);
    expect(keys(mk({ prDate: '2020-01-01', tax: [2021, 2022, 2023], apps: [{ id: 'c', kind: 'citizenship', milestones: [] }] }), ins(true))).toEqual([]);
    expect(keys(mk({ prDate: '2020-01-01', tax: [2021, 2022, 2023] }), ins(false))).toEqual([]);
  });
  it('PR 3+ years with < 3 tax years in 2021–2025 → info', () => {
    expect(crossChecks(mk({ prDate: '2023-01-01', tax: [2020, 2023, 2024] }), ins())).toEqual([
      { key: 'xc.taxYears', severity: 'info', vars: { n: 2, from: 2021, to: 2025 } },
    ]);
    expect(keys(mk({ prDate: '2023-01-01', tax: [2023, 2024, 2025] }))).toEqual([]);
    expect(keys(mk({ prDate: '2023-10-17', tax: [] }))).toEqual([]); // 3rd anniversary is tomorrow
  });
});

it('sorts critical first and returns nothing for empty data', () => {
  const d = mk({ prDate: '2022-01-01', card: '2027-01-20', tax: [], trips: [{ id: 't', departure: '2027-01-10', return: '2027-01-31' }] });
  expect(keys(d, ins(true))).toEqual(['xc.prCardTrip', 'xc.citNoApp', 'xc.taxYears']);
  expect(crossChecks(emptyData(), ins())).toEqual([]);
});
