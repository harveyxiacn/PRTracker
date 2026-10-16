import { describe, expect, it } from 'vitest';
import {
  OPEN_END,
  coverage,
  emptyHistory,
  findGaps,
  findOverlaps,
  historySummary,
  historyToCsv,
  historyToText,
  historyWindow,
  windowDays,
  type HistoryData,
} from './history';

const TODAY = '2026-10-16';
const W = { from: '2020-01-01', to: '2020-12-31' }; // 366 days (leap year)

describe('historyWindow', () => {
  it('PR without birth date: 10 years back', () => {
    expect(historyWindow('pr', TODAY)).toEqual({ from: '2016-10-16', to: TODAY });
  });
  it('PR when 18th birthday is older than 10 years: 10 years back', () => {
    expect(historyWindow('pr', TODAY, '1990-01-01')).toEqual({ from: '2016-10-16', to: TODAY });
  });
  it('PR for someone younger than 28: since 18th birthday', () => {
    expect(historyWindow('pr', TODAY, '2000-03-15')).toEqual({ from: '2018-03-15', to: TODAY });
  });
  it('PR 18th birthday of a leap-day baby clamps to Feb 28', () => {
    expect(historyWindow('pr', TODAY, '2004-02-29')).toEqual({ from: '2022-02-28', to: TODAY });
  });
  it('PR for a minor collapses to today', () => {
    expect(historyWindow('pr', TODAY, '2010-01-01')).toEqual({ from: TODAY, to: TODAY });
  });
  it('ignores an invalid birth date', () => {
    expect(historyWindow('pr', TODAY, '2000-13-01').from).toBe('2016-10-16');
  });
  it('citizenship: 5 years, birth date irrelevant', () => {
    expect(historyWindow('citizenship', TODAY, '2000-03-15')).toEqual({ from: '2021-10-16', to: TODAY });
  });
  it('windowDays is inclusive', () => {
    expect(windowDays(W)).toBe(366);
  });
});

describe('findGaps', () => {
  it('no gaps when covered (entry starting before the window, open-ended entry after)', () => {
    expect(findGaps('addresses', [{ from: '2019-06-01', to: '2020-06-30' }, { from: '2020-07-01', to: null }], W)).toEqual([]);
  });
  it('gap at the start', () => {
    expect(findGaps('addresses', [{ from: '2020-03-01' }], W)).toEqual([{ list: 'addresses', from: '2020-01-01', to: '2020-02-29', days: 60 }]);
  });
  it('gap in the middle', () => {
    const g = findGaps('activities', [{ from: '2019-01-01', to: '2020-05-31' }, { from: '2020-06-10', to: null }], W);
    expect(g).toEqual([{ list: 'activities', from: '2020-06-01', to: '2020-06-09', days: 9 }]);
  });
  it('gap at the end when nothing is current', () => {
    expect(findGaps('addresses', [{ from: '2020-01-01', to: '2020-11-30' }], W)).toEqual([{ list: 'addresses', from: '2020-12-01', to: '2020-12-31', days: 31 }]);
  });
  it('open-ended entry runs to the window end, even if sorted before a closed one', () => {
    expect(findGaps('addresses', [{ from: '2020-03-01', to: '2020-04-01' }, { from: '2020-01-01', to: null }], W)).toEqual([]);
  });
  it('adjacent entries leave no gap', () => {
    expect(findGaps('addresses', [{ from: '2020-01-01', to: '2020-05-31' }, { from: '2020-06-01' }], W)).toEqual([]);
  });
  it('same-day hand-over is not a gap', () => {
    expect(findGaps('addresses', [{ from: '2020-01-01', to: '2020-05-31' }, { from: '2020-05-31' }], W)).toEqual([]);
  });
  it('a one-day hole is a gap', () => {
    expect(findGaps('addresses', [{ from: '2020-01-01', to: '2020-05-30' }, { from: '2020-06-01' }], W)).toEqual([{ list: 'addresses', from: '2020-05-31', to: '2020-05-31', days: 1 }]);
  });
  it('nested entries do not reset coverage', () => {
    expect(findGaps('addresses', [{ from: '2020-01-01', to: '2020-12-31' }, { from: '2020-02-01', to: '2020-03-01' }], W)).toEqual([]);
  });
  it('empty list: the whole window is one gap; invalid rows are ignored', () => {
    expect(findGaps('addresses', [{ from: '' }, { from: '2020-05-01', to: '2020-04-01' }], W)).toEqual([{ list: 'addresses', from: '2020-01-01', to: '2020-12-31', days: 366 }]);
  });
  it('entries entirely outside the window are ignored', () => {
    expect(findGaps('addresses', [{ from: '2018-01-01', to: '2019-12-31' }, { from: '2021-01-01' }], W)).toHaveLength(1);
  });
});

describe('findOverlaps', () => {
  it('a 1-day moving-day overlap is normal', () => {
    expect(findOverlaps('addresses', [{ id: 'a', from: '2020-01-01', to: '2020-05-31' }, { id: 'b', from: '2020-05-31', to: null }])).toEqual([]);
  });
  it('a 2-day overlap is flagged (order independent)', () => {
    const o = findOverlaps('addresses', [{ id: 'b', from: '2020-05-31', to: null }, { id: 'a', from: '2020-01-01', to: '2020-06-01' }]);
    expect(o).toEqual([{ list: 'addresses', aId: 'a', bId: 'b', from: '2020-05-31', to: '2020-06-01' }]);
  });
  it('two current addresses overlap open-endedly', () => {
    const o = findOverlaps('addresses', [{ id: 'a', from: '2020-01-01' }, { id: 'b', from: '2021-01-01', to: null }]);
    expect(o).toEqual([{ list: 'addresses', aId: 'a', bId: 'b', from: '2021-01-01', to: OPEN_END }]);
  });
  it('disjoint entries do not overlap', () => {
    expect(findOverlaps('addresses', [{ id: 'a', from: '2020-01-01', to: '2020-01-31' }, { id: 'b', from: '2020-03-01', to: '2020-03-31' }])).toEqual([]);
  });
});

const sample: HistoryData = {
  addresses: [
    { id: 'old', from: '2015-01-10', to: '2016-08-31', city: 'Lyon', country: 'FR' },
    { id: 'paris', from: '2016-09-01', to: '2020-02-14', street: '12 "Rue" Main, Apt 3', city: 'Paris', postal: '75001', country: 'FR' },
    { id: 'to', from: '2020-02-15', to: null, street: '1 Bay St', city: 'Toronto', region: 'ON', postal: 'M5J 2N8', country: 'CA' },
  ],
  activities: [
    { id: 'w', from: '2020-03-01', to: null, kind: 'work', title: 'Engineer', organization: 'Acme, Inc.', city: 'Toronto', country: 'CA', note: 'line1\nline2' },
    { id: 'u', from: '2020-02-15', to: '2020-02-29', kind: 'unemployed' },
  ],
};

describe('historyToCsv', () => {
  const w = historyWindow('pr', TODAY);
  it('addresses: newest first, filtered to the window, RFC-4180 quoting', () => {
    expect(historyToCsv(sample, w, 'addresses')).toBe(
      'From,To,Street,City,Province/State,Postal code,Country\r\n' +
        '2020-02,Present,1 Bay St,Toronto,ON,M5J 2N8,Canada\r\n' +
        '2016-09,2020-02,"12 ""Rue"" Main, Apt 3",Paris,,75001,France\r\n',
    );
  });
  it('activities: English labels, quoted commas and newlines', () => {
    expect(historyToCsv(sample, w, 'activities')).toBe(
      'From,To,Activity,Title/Program,Employer/School,City,Country,Note\r\n' +
        '2020-03,Present,Employed,Engineer,"Acme, Inc.",Toronto,Canada,"line1\nline2"\r\n' +
        '2020-02,2020-02,Unemployed,,,,,\r\n',
    );
  });
  it('a row ending on the window start is still included', () => {
    const d: HistoryData = { addresses: [{ id: 'x', from: '2010-01-01', to: '2016-10-16', city: 'A', country: 'FR' }], activities: [] };
    expect(historyToCsv(d, w, 'addresses').split('\r\n')).toHaveLength(3);
  });
  it('plain-text table is tab separated without line breaks inside cells', () => {
    const lines = historyToText(sample, w, 'activities').split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[1]).toBe('2020-03\tPresent\tEmployed\tEngineer\tAcme, Inc.\tToronto\tCanada\tline1 line2');
  });
});

describe('historySummary', () => {
  it('computes coverage for both lists', () => {
    const d: HistoryData = {
      addresses: [{ id: 'a', from: '2021-10-16', to: null, city: 'X', country: 'CA' }],
      activities: [{ id: 'b', from: '2024-01-01', to: null, kind: 'study' }],
    };
    const s = historySummary(d, 'citizenship', TODAY);
    expect(s.window).toEqual({ from: '2021-10-16', to: TODAY });
    expect(s.addressGaps).toEqual([]);
    expect(s.addressCoverage).toBe(1);
    // 2021-10-16..2023-12-31 = 77 + 365 + 365 = 807 days uncovered of 1827.
    expect(s.activityGaps).toEqual([{ list: 'activities', from: '2021-10-16', to: '2023-12-31', days: 807 }]);
    expect(s.activityCoverage).toBeCloseTo(1020 / 1827, 10);
  });
  it('empty history has zero coverage', () => {
    const s = historySummary(emptyHistory(), 'pr', TODAY);
    expect(s.addressCoverage).toBe(0);
    expect(s.activityCoverage).toBe(0);
    expect(coverage(s.addressGaps, s.window)).toBe(0);
  });
});
