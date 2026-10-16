import { describe, expect, it } from 'vitest';
import { addDays } from '../domain/dates';
import { PresenceModel } from '../domain/presence';
import type { Profile, Trip } from '../domain/types';
import { daysOutsideLastMonths, explainCitizenship, filterTrips, planTrip, travelBudget, tripStats } from './query';

const TODAY = '2026-10-16';
const profile: Profile = { prDate: '2024-01-01', statusPeriods: [], taxYearsFiled: [] };
const trips: Trip[] = [
  { id: '1', departure: '2024-07-01', return: '2024-07-31', destination: 'Shanghai, China' },
  { id: '2', departure: '2025-02-10', return: '2025-02-20', destination: 'Mexico' },
  { id: '3', departure: '2025-12-20', return: '2026-01-05', destination: 'Beijing, China' },
  { id: '4', departure: '2027-03-01', return: '2027-03-15', destination: 'Japan' },
];

describe('trip queries', () => {
  it('computes stats, filters by place and finds the next planned trip', () => {
    const s = tripStats(trips, TODAY);
    expect(s.count).toBe(3);
    expect(s.longest).toMatchObject({ days: 29, trip: { id: '1' } });
    expect(s.shortest).toMatchObject({ days: 9, trip: { id: '2' } });
    expect(s.last?.id).toBe('3');
    expect(s.next?.id).toBe('4');
    expect(s.totalDays).toBe(29 + 9 + 15);
    expect(filterTrips(trips, { place: 'china' }, TODAY).map((t) => t.id)).toEqual(['3', '1']);
    expect(tripStats(filterTrips(trips, { place: 'china' }, TODAY), TODAY).topPlace).toMatchObject({ count: 1 });
  });

  it('counts days outside in the last 12 months', () => {
    const m = new PresenceModel({ profile, trips, today: TODAY });
    // Trip 3: Dec 21 – Jan 4 = 15 days, inside the window.
    expect(daysOutsideLastMonths(m, TODAY, 12)).toBe(15);
  });
});

describe('planner', () => {
  it('travel budget is exact: a trip of `budget` days keeps the target, one more day breaks it', () => {
    const input = { profile, trips: trips.slice(0, 3), today: TODAY };
    const m = new PresenceModel(input);
    const target = '2028-06-01';
    const b = travelBudget(m, target);
    expect(b.budget).toBeGreaterThan(0);
    const dep = '2027-01-10';
    const ok = new PresenceModel({ ...input, trips: [...input.trips, { id: 'x', departure: dep, return: addDays(dep, b.budget + 1) }] });
    const bad = new PresenceModel({ ...input, trips: [...input.trips, { id: 'x', departure: dep, return: addDays(dep, b.budget + 2) }] });
    expect(ok.citizenshipAt(target).credited).toBeGreaterThanOrEqual(1095);
    expect(bad.citizenshipAt(target).credited).toBeLessThan(1095);
  });

  it('reports when a target date is too early', () => {
    const m = new PresenceModel({ profile, trips: trips.slice(0, 3), today: TODAY });
    const b = travelBudget(m, '2026-12-01');
    expect(b.creditedAtTarget).toBeLessThan(1095);
    expect(b.budget).toBe(0);
    expect(b.earliest).not.toBeNull();
  });

  it('plans a trip: delay if leaving now, none after the eligibility date', () => {
    const p = planTrip({ profile, trips: trips.slice(0, 3), today: TODAY }, 60);
    expect(p.eligibleNow).not.toBeNull();
    expect(p.eligibleIfNow! > p.eligibleNow!).toBe(true);
    expect(p.noDelayFrom).toBe(p.eligibleNow);
    expect(p.residencyOkNow).toBe(true);
  });

  it('explains the citizenship count', () => {
    const m = new PresenceModel({ profile, trips: trips.slice(0, 3), today: TODAY });
    const e = explainCitizenship(m, trips.slice(0, 3), TODAY);
    expect(e.tripsInWindow).toBe(3);
    expect(e.daysAwayInWindow).toBe(29 + 9 + 15);
    expect(e.prDays + e.daysAwayInWindow).toBe(1019);
  });
});
