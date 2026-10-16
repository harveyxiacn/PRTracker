import { describe, expect, it } from 'vitest';
import { migrate } from '../store/storage';
import { addMonths, diffDays } from './dates';
import { demoData } from './demo';
import { documentStatus } from './documents';
import { historySummary } from './history';
import { computeInsights } from './insights';
import { validateTrips } from './presence';

const TODAY = '2026-10-16';

describe('demoData', () => {
  const d = demoData(TODAY);

  it('is onboarded, English by default and honours the language argument', () => {
    expect(d.onboarded).toBe(true);
    expect(d.settings.language).toBe('en');
    expect(d.settings.notifications.enabled).toBe(true);
    expect(demoData(TODAY, 'ar').settings.language).toBe('ar');
    expect(d.profile.displayName).toBe('Alex Demo');
  });

  it('places key dates relative to today', () => {
    // PR 28 months ago (≈2.3 years), work permit for the 2 years before.
    expect(d.profile.prDate).toBe('2024-06-16');
    expect(d.profile.statusPeriods[0]).toMatchObject({ kind: 'worker', start: '2022-06-16' });
    expect(d.profile.prCardExpiry).toBe('2027-05-16');
    // A different "today" shifts everything by the same amount.
    const later = demoData('2027-01-16');
    expect(later.profile.prDate).toBe(addMonths('2027-01-16', -28));
    expect(later.trips[0].departure).toBe(addMonths('2027-01-16', -34));
    expect(later.trips[0].destination).toBe(d.trips[0].destination);
  });

  it('has 8 past trips within 3 years, one planned trip, and no overlaps', () => {
    const past = d.trips.filter((t) => t.departure <= TODAY);
    const future = d.trips.filter((t) => t.departure > TODAY);
    expect(past).toHaveLength(8);
    expect(future).toHaveLength(1);
    for (const t of past) expect(t.departure >= addMonths(TODAY, -36) && (t.return ?? '') < TODAY).toBe(true);
    expect(validateTrips(d.trips, TODAY)).toEqual([]);
    expect(new Set(d.trips.map((t) => t.id)).size).toBe(d.trips.length);
  });

  it('has a pending citizenship application and a completed Express Entry one', () => {
    const cit = d.applications.find((a) => a.kind === 'citizenship')!;
    expect(cit.submitted).toBeNull();
    const ee = d.applications.find((a) => a.kind === 'ee_cec')!;
    const landed = ee.milestones.find((m) => m.key === 'landed')!.date!;
    expect(landed).toBe(d.profile.prDate);
    const months = diffDays(landed, ee.submitted!) / 30.4;
    expect(months).toBeGreaterThan(5.5);
    expect(months).toBeLessThan(6.5);
    // Milestones are in chronological order.
    const dates = ee.milestones.map((m) => m.date!);
    expect([...dates].sort()).toEqual(dates);
  });

  it('documents: passport and IELTS are "soon", ECA is fine', () => {
    const status = (id: string) => documentStatus(d.documents!.items.find((i) => i.id === id)!, TODAY);
    expect(status('demo-doc-passport')).toBe('soon');
    expect(status('demo-doc-ielts')).toBe('soon');
    expect(status('demo-doc-eca')).toBe('ok');
  });

  it('history: one 2-month address gap and complete activities over 10 years', () => {
    const s = historySummary(d.history!, 'pr', TODAY);
    expect(s.addressGaps).toHaveLength(1);
    expect(s.addressGaps[0].days).toBeGreaterThanOrEqual(59);
    expect(s.addressGaps[0].days).toBeLessThanOrEqual(62);
    expect(s.activityGaps).toEqual([]);
  });

  it('has a spouse in the household with PR 1 year ago and two trips', () => {
    expect(d.household!.activeName).toBe('Alex Demo');
    const sam = d.household!.others[0];
    expect(sam.name).toBe('Sam Demo');
    expect(sam.profile.prDate).toBe('2025-10-16');
    expect(sam.trips).toHaveLength(2);
    expect(validateTrips(sam.trips, TODAY)).toEqual([]);
  });

  it('survives migrate() unchanged', () => {
    const m = migrate(JSON.parse(JSON.stringify(d)));
    expect(m.profile).toEqual(d.profile);
    expect(m.trips).toEqual(d.trips);
    expect(m.applications).toEqual(d.applications);
    expect(m.documents).toEqual(d.documents);
    expect(m.history).toEqual(d.history);
    expect(m.household).toEqual(d.household);
    expect(m.settings).toEqual(d.settings);
    expect(m.eligibilityForm).toEqual(d.eligibilityForm);
    expect(m.onboarded).toBe(true);
  });

  it('yields citizenship, residency and an open PR-card renewal window', () => {
    const i = computeInsights(d, TODAY);
    expect(i.isPr).toBe(true);
    // ≈ 712 PR days + 356 half-credited work-permit days ≈ 1,068: eligible in about a month.
    expect(i.citizenship).toBeDefined();
    expect(i.citizenship!.credited).toBeGreaterThan(1000);
    expect(i.citizenship!.eligible).toBe(false);
    expect(i.citizenship!.daysUntilEligible).toBeGreaterThan(0);
    expect(i.citizenship!.daysUntilEligible).toBeLessThan(90);
    expect(i.residency).toBeDefined();
    expect(i.residency!.compliant).toBe(true);
    expect(i.prCard!.state).toBe('renew_now');
    expect(i.tripIssues).toEqual([]);
    expect(i.ongoingTrip).toBeUndefined();
  });
});
