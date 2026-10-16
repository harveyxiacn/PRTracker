import { describe, expect, it } from 'vitest';
import { findDates, parseCbsaText, reconcile, type CbsaEvent } from './cbsa';
import type { Trip } from './types';

// Format A: table copied from the PDF (one entry per row, port names, ISO-like dates).
const FORMAT_A = `CANADA BORDER SERVICES AGENCY
Traveller History Report
Date of birth: 1990-05-04
Report generated 2026-09-30
Date of Entry      Port of Entry
2023/03/14         0813 - VANCOUVER INT'L AIRPORT
2023/03/14         0813 - VANCOUVER INT'L AIRPORT
2024/07/02         Peace Arch
2025-01-05         YYZ   Air`;

// Format B: DD-MMM-YYYY with explicit entry/exit keywords and section headings.
const FORMAT_B = `ENTRIES
14-MAR-2023  Entry  Port: YVR
02-JUL-2024  Entry  Port: Peace Arch
EXITS
01-MAR-2023  Exit   Port: YVR
25-JUN-2024  Departed by land  Port: Blaine
20-DEC-2024  Exit  Port: YYZ`;

// Format C: long dates written out, mixed order, a two-date row and noise lines.
const FORMAT_C = `Page 1 of 2
Departure: December 20, 2024 (YYZ)
Arrival: January 5, 2025 at Toronto Pearson
Departed 2025-06-01 Returned 2025-06-10 YUL
Some unrelated text without a date`;

describe('findDates', () => {
  it('reads ISO, slashes, DD-MMM-YYYY, long names, French and unambiguous dd/mm', () => {
    const d = (s: string) => findDates(s).map((h) => h.date);
    expect(d('2023-03-14')).toEqual(['2023-03-14']);
    expect(d('2023/3/4')).toEqual(['2023-03-04']);
    expect(d('14-MAR-2023')).toEqual(['2023-03-14']);
    expect(d('14 March 2023')).toEqual(['2023-03-14']);
    expect(d('March 14, 2023')).toEqual(['2023-03-14']);
    expect(d('Sept. 3, 2022')).toEqual(['2022-09-03']);
    expect(d('3 juillet 2022')).toEqual(['2022-07-03']);
    expect(d('25/12/2023')).toEqual(['2023-12-25']);
    expect(d('12/25/2023')).toEqual(['2023-12-25']);
    expect(d('03/04/2023')).toEqual([]); // ambiguous: skipped
    expect(d('2023-02-30')).toEqual([]); // invalid
  });
});

describe('parseCbsaText', () => {
  it('format A: entries list, defaults to entry, dedupes same-day, skips birth/report dates', () => {
    const ev = parseCbsaText(FORMAT_A);
    expect(ev.map((e) => [e.date, e.kind, e.place])).toEqual([
      ['2023-03-14', 'entry', "VANCOUVER INT'L AIRPORT"],
      ['2024-07-02', 'entry', 'Peace Arch'],
      ['2025-01-05', 'entry', 'YYZ'],
    ]);
    expect(ev[0].source.length).toBeLessThanOrEqual(120);
  });

  it('format B: section headings and keywords classify entries and exits', () => {
    const ev = parseCbsaText(FORMAT_B);
    expect(ev.map((e) => [e.date, e.kind, e.place])).toEqual([
      ['2023-03-01', 'exit', 'YVR'],
      ['2023-03-14', 'entry', 'YVR'],
      ['2024-06-25', 'exit', 'Blaine'],
      ['2024-07-02', 'entry', 'Peace Arch'],
      ['2024-12-20', 'exit', 'YYZ'],
    ]);
  });

  it('format C: long dates, keyword before the date, two dates on one row', () => {
    const ev = parseCbsaText(FORMAT_C);
    expect(ev.map((e) => [e.date, e.kind, e.place])).toEqual([
      ['2024-12-20', 'exit', 'YYZ'],
      ['2025-01-05', 'entry', 'Pearson'],
      ['2025-06-01', 'exit', undefined],
      ['2025-06-10', 'entry', 'YUL'],
    ]);
  });

  it('returns nothing for empty or date-free text', () => {
    expect(parseCbsaText('')).toEqual([]);
    expect(parseCbsaText('hello\nworld')).toEqual([]);
  });
});

describe('reconcile', () => {
  const ev = (date: string, kind: 'entry' | 'exit', place?: string): CbsaEvent => ({ date, kind, place, source: date });
  const trips: Trip[] = [
    { id: 't1', departure: '2023-03-01', return: '2023-03-13' }, // entry 03-14 is 1 day later → match
    { id: 't2', departure: '2024-01-10', return: '2024-01-20' }, // no entry → tripsWithoutEntry
    { id: 't3', departure: '2026-05-01', return: '2026-05-10' }, // after the report → ignored
    { id: 't4', departure: '2024-02-01', return: null }, // ongoing → ignored
  ];

  it('matches ±1 day, proposes trips, lists trips without entry', () => {
    const events = [
      ev('2023-03-01', 'exit'), // matches t1 departure (consumed)
      ev('2023-03-14', 'entry', 'YVR'), // t1 return 03-13 (1 day)
      ev('2024-06-25', 'exit'), // free exit → departure of the 07-02 proposal
      ev('2024-07-02', 'entry', 'Peace Arch'),
      ev('2025-01-05', 'entry', 'YYZ'), // no free exit between 2024-07-02 and 2025-01-05 → null
    ];
    const r = reconcile(events, trips);
    expect(r.matched).toEqual([{ event: events[1], tripId: 't1' }]);
    expect(r.unmatchedEntries.map((e) => e.date)).toEqual(['2024-07-02', '2025-01-05']);
    expect(r.proposals).toEqual([
      { departure: '2024-06-25', return: '2024-07-02', place: 'Peace Arch' },
      { departure: null, return: '2025-01-05', place: 'YYZ' },
    ]);
    expect(r.tripsWithoutEntry).toEqual(['t2']);
  });

  it('a two-day gap does not match; one entry matches one trip only (closest first)', () => {
    const r = reconcile([ev('2023-03-15', 'entry')], trips);
    expect(r.matched).toEqual([]);
    const r2 = reconcile([ev('2023-03-12', 'entry'), ev('2023-03-13', 'entry')], trips);
    expect(r2.matched.map((m) => m.event.date)).toEqual(['2023-03-13']);
    expect(r2.unmatchedEntries.map((m) => m.date)).toEqual(['2023-03-12']);
  });

  it('does not flag trips when the report has only exits', () => {
    const trips: Trip[] = [{ id: 't', departure: '2023-02-01', return: '2023-02-10' }];
    const r = reconcile([ev('2023-01-01', 'exit'), ev('2023-03-01', 'exit')], trips);
    expect(r.tripsWithoutEntry).toEqual([]);
  });

  it('does not take an exit from before the previous entry', () => {
    const r = reconcile([ev('2022-01-01', 'exit'), ev('2022-01-10', 'entry'), ev('2022-05-01', 'entry')], []);
    expect(r.proposals).toEqual([
      { departure: '2022-01-01', return: '2022-01-10' },
      { departure: null, return: '2022-05-01' },
    ]);
    expect(r.tripsWithoutEntry).toEqual([]);
  });

  it('no events → nothing to report', () => {
    expect(reconcile([], trips)).toEqual({ matched: [], unmatchedEntries: [], tripsWithoutEntry: [], proposals: [] });
  });
});
