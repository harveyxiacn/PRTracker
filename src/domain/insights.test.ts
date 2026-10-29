import { describe, expect, it } from 'vitest';
import { computeInsights } from './insights';
import { emptyData } from './types';

describe('insights', () => {
  it('computes PR card renewal window 270 days before expiry and reminders', () => {
    const d = emptyData();
    d.profile.prDate = '2022-03-15';
    d.profile.prCardExpiry = '2027-03-15';
    d.trips = [{ id: 't', departure: '2026-12-20', return: '2027-01-05', destination: 'Paris' }];
    const i = computeInsights(d, '2026-01-01');
    // IMM 5444: renewals are returned while the card is valid for more than 270 days.
    expect(i.prCard).toMatchObject({ renewalOpens: '2026-06-18', state: 'ok' });
    expect(i.reminders.find((r) => r.id === 'card-renew')!.date).toBe('2026-06-18');
    expect(i.citizenship!.eligibleDate).toBe('2026-01-01');
    expect(i.citizenship!.daysUntilEligible).toBe(0);
    expect(i.citizenship!.eligible).toBe(true);
    const ids = i.reminders.map((r) => r.id);
    expect(ids).toContain('card-renew');
    expect(ids).toContain('trip-t');
    expect(ids).not.toContain('cit-eligible');
    expect(computeInsights(d, '2026-07-01').prCard!.state).toBe('renew_now');
    // Nine calendar months before expiry (2026-06-15) is 273 days out: too early.
    expect(computeInsights(d, '2026-06-15').prCard!.state).toBe('ok');
    expect(computeInsights(d, '2026-06-17').prCard!.state).toBe('ok');
    expect(computeInsights(d, '2026-06-18').prCard!.state).toBe('renew_now');
    expect(computeInsights(d, '2027-04-01').prCard!.state).toBe('expired');
  });

  it('projects citizenship date and reminder for a new PR', () => {
    const d = emptyData();
    d.profile.prDate = '2026-01-01';
    const i = computeInsights(d, '2026-10-16');
    expect(i.citizenship!.eligibleDate).toBe('2028-12-31');
    expect(i.citizenship!.safeDate).toBe('2029-01-10');
    expect(i.reminders.find((r) => r.id === 'cit-eligible')!.date).toBe('2028-12-31');
    expect(i.residency!.compliant).toBe(true);
  });
});
