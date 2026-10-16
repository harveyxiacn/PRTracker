import { describe, expect, it } from 'vitest';
import { csvToTrips, tripsToCsv } from './csv';
import { migrate } from './storage';

describe('csv', () => {
  it('round-trips trips with quoted fields', () => {
    const csv = tripsToCsv([{ id: '1', departure: '2025-01-02', return: '2025-01-09', destination: 'Tokyo, JP', note: 'say "hi"' }]);
    const { trips, errors } = csvToTrips(csv);
    expect(errors).toEqual([]);
    expect(trips[0]).toMatchObject({ departure: '2025-01-02', return: '2025-01-09', destination: 'Tokyo, JP', note: 'say "hi"' });
  });
  it('reports bad rows by line number', () => {
    const { trips, errors } = csvToTrips('departure,return\n2025-01-01,2025-01-05\n01/02/2025,\n2025-03-01,\n');
    expect(trips.length).toBe(2);
    expect(trips[1].return).toBeNull();
    expect(errors).toEqual([3]);
  });
});

describe('migrate', () => {
  it('fills defaults and drops malformed trips', () => {
    const d = migrate({ trips: [{ id: 'a', departure: 'bad' }, { id: 'b', departure: '2025-01-01' }], settings: { language: 'zh' } });
    expect(d.trips.length).toBe(1);
    expect(d.settings.language).toBe('zh');
    expect(d.settings.notifications.enabled).toBe(true);
    expect(d.profile.statusPeriods).toEqual([]);
  });
});

describe('csv multiline', () => {
  it('keeps newlines inside quoted notes', () => {
    const csv = tripsToCsv([{ id: '1', departure: '2025-01-02', return: '2025-01-09', note: 'line 1\nline 2' }]);
    const { trips, errors } = csvToTrips(csv);
    expect(errors).toEqual([]);
    expect(trips[0].note).toBe('line 1\nline 2');
  });
});

describe('migrate nested data', () => {
  it('repairs malformed imports instead of crashing later', () => {
    const d = migrate({
      profile: { statusPeriods: null, prCardExpiry: 'soon' },
      trips: [{ id: 'a', departure: '2025-01-01', return: '' }],
      applications: [{ id: 'x', kind: 'ee_cec', submitted: 'bad' }],
    });
    expect(d.profile.statusPeriods).toEqual([]);
    expect(d.profile.prCardExpiry).toBeUndefined();
    expect(d.trips[0].return).toBeNull();
    expect(d.applications[0]).toMatchObject({ submitted: null, milestones: [] });
  });
});
