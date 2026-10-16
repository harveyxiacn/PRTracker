import { describe, expect, it } from 'vitest';
import type { TrendsData } from '../data/trends';
import { isActiveApplication, processingChanges, relevantSeries } from './ptAlerts';
import type { Application, ApplicationKind } from './types';

let id = 0;
const app = (kind: ApplicationKind, patch: Partial<Application> = {}): Application => ({ id: `a${++id}`, kind, submitted: '2026-05-01', milestones: [], ...patch });
const P = (date: string, days: number) => ({ date, days });

const APPS: Application[] = [
  app('pr_card'),
  app('work_permit', { country: 'in' }), // per-country series, code normalised
  app('study_ext', { archived: true }), // archived → ignored
  app('visitor_visa', { country: 'PH', milestones: [{ key: 'decision', date: '2026-06-01' }] }), // finished → ignored
  app('child'), // country series but no country → nothing
  app('ee_cec'), // no IRCC series in the history
  app('pgwp'), // → work_ext
  app('owp_spouse'), // → work_ext again (deduplicated)
];

const TRENDS: TrendsData = {
  updated: '2026-10-10',
  series: {
    pr_card: [P('2026-08-01', 38), P('2026-09-01', 38), P('2026-09-20', 45), P('2026-10-01', 45)],
    'work:IN': [P('2026-07-01', 120), P('2026-08-01', 150)],
    work_ext: [P('2026-09-01', 200), P('2026-09-18', 210), P('2026-10-05', 190)],
    study_ext: [P('2026-09-01', 60), P('2026-10-01', 90)],
    'visitor-outside-canada:PH': [P('2026-09-01', 20), P('2026-10-01', 30)],
  },
};

describe('relevantSeries', () => {
  it('maps active applications to series keys, deduplicated, in order', () => {
    expect(relevantSeries(APPS)).toEqual(['pr_card', 'work:IN', 'work_ext']);
  });
  it('is empty without applications', () => {
    expect(relevantSeries([])).toEqual([]);
  });
  it('treats an application as finished only when the final milestone has a date', () => {
    expect(isActiveApplication(app('pr_card', { milestones: [{ key: 'aor', date: '2026-05-10' }] }))).toBe(true);
    expect(isActiveApplication(app('pr_card', { milestones: [{ key: 'card_received', date: '2026-07-10' }] }))).toBe(false);
  });
});

describe('processingChanges', () => {
  it('returns the latest real change per relevant series after the date, newest first', () => {
    expect(processingChanges(TRENDS, APPS, '2026-09-16')).toEqual([
      { series: 'work_ext', from: 210, to: 190, date: '2026-10-05' }, // latest of two changes
      { series: 'pr_card', from: 38, to: 45, date: '2026-09-20' }, // 2026-10-01 is a refresh, not a change
    ]);
  });
  it('only counts changes strictly after sinceDate', () => {
    expect(processingChanges(TRENDS, APPS, '2026-09-20')).toEqual([{ series: 'work_ext', from: 210, to: 190, date: '2026-10-05' }]);
    expect(processingChanges(TRENDS, APPS, '2026-10-05')).toEqual([]);
  });
  it('ignores series that are missing, unchanged or have a single point', () => {
    const t: TrendsData = { updated: 'x', series: { pr_card: [P('2026-10-01', 38)], work_ext: [P('2026-09-01', 120), P('2026-10-01', 120)] } };
    expect(processingChanges(t, APPS, '2026-01-01')).toEqual([]);
    expect(processingChanges({ updated: 'x', series: {} }, APPS, '2026-01-01')).toEqual([]);
  });
  it('compares with the previous point even when that point is before sinceDate', () => {
    const t: TrendsData = { updated: 'x', series: { pr_card: [P('2026-01-01', 60), P('2026-10-01', 40)] } };
    expect(processingChanges(t, [app('pr_card')], '2026-09-30')).toEqual([{ series: 'pr_card', from: 60, to: 40, date: '2026-10-01' }]);
  });
});
