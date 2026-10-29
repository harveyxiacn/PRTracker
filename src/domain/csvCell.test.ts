// CSV exports must not hand spreadsheet apps a formula (CSV/formula injection).
import { describe, expect, it } from 'vitest';
import { csvCell, neutralizeFormula, restoreFormula } from './csvCell';
import { absencesToCsv } from './forms';
import { historyToCsv, historyWindow, type HistoryData } from './history';
import { csvToTrips, tripsToCsv } from '../store/csv';

describe('csvCell', () => {
  it('prefixes formula-like text with a single quote', () => {
    for (const v of ['=1+1', '+SUM(A1)', '-2+3', '@cmd', '\t=x', '\r=x', '=HYPERLINK("http://x","y")']) {
      expect(neutralizeFormula(v)).toBe(`'${v}`);
    }
  });
  it('leaves plain numbers, dates and ordinary text alone', () => {
    for (const v of ['-12', '+3', '4.5', '-0.25', '2025-01-02', 'Tokyo', 'a=b', '']) expect(neutralizeFormula(v)).toBe(v);
    expect(csvCell(-7)).toBe('-7');
    expect(csvCell(null)).toBe('');
  });
  it('quotes after neutralising, including \\r', () => {
    expect(csvCell('=1,2')).toBe(`"'=1,2"`);
    expect(csvCell('a\rb')).toBe('"a\rb"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
  });
  it('restoreFormula undoes the prefix only', () => {
    expect(restoreFormula("'=1+1")).toBe('=1+1');
    expect(restoreFormula("'quoted")).toBe("'quoted");
  });
});

describe('exports are neutralised', () => {
  it('trips CSV, and it still round-trips', () => {
    const csv = tripsToCsv([{ id: '1', departure: '2025-01-02', return: '2025-01-09', destination: '=HYPERLINK("http://evil","x")', note: '@SUM(1)' }]);
    expect(csv).toContain(`"'=HYPERLINK(""http://evil"",""x"")"`);
    expect(csv).toContain(`'@SUM(1)`);
    const { trips } = csvToTrips(csv);
    expect(trips[0].destination).toBe('=HYPERLINK("http://evil","x")');
    expect(trips[0].note).toBe('@SUM(1)');
  });
  it('absences CSV keeps numbers and neutralises text', () => {
    const csv = absencesToCsv([{ from: '2023-03-01', to: '2023-03-10', days: 8, destination: '+cmd', reason: '-1+1' }]);
    expect(csv.split('\r\n')[1]).toBe("2023-03-01,2023-03-10,8,'+cmd,'-1+1");
  });
  it('history CSV', () => {
    const d: HistoryData = { addresses: [{ id: 'a', from: '2020-02-15', to: null, street: '=cmd|"/c calc"!A1', city: 'Toronto', country: 'CA' }], activities: [] };
    const csv = historyToCsv(d, historyWindow('pr', '2026-10-16'), 'addresses');
    expect(csv).toContain(`"'=cmd|""/c calc""!A1"`);
  });
});
