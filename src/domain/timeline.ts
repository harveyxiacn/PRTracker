// Application timelines: milestone templates per application type and progress prediction
// from IRCC processing times plus (optional) anonymised community timelines.

import { addDays, diffDays, type ISODate } from './dates';
import type { Application, ApplicationKind } from './types';

export const MILESTONES: Record<ApplicationKind, string[]> = {
  ee_cec: ['profile', 'ita', 'submitted', 'aor', 'biometrics_request', 'biometrics', 'medical', 'eligibility', 'background', 'ppr', 'copr', 'landed'],
  ee_fsw: ['profile', 'ita', 'submitted', 'aor', 'biometrics_request', 'biometrics', 'medical', 'eligibility', 'background', 'ppr', 'copr', 'landed'],
  ee_fst: ['profile', 'ita', 'submitted', 'aor', 'biometrics_request', 'biometrics', 'medical', 'eligibility', 'background', 'ppr', 'copr', 'landed'],
  pnp_ee: ['nomination', 'profile', 'ita', 'submitted', 'aor', 'biometrics', 'medical', 'eligibility', 'background', 'ppr', 'copr', 'landed'],
  pnp_base: ['nomination', 'submitted', 'aor', 'biometrics', 'medical', 'eligibility', 'background', 'ppr', 'copr', 'landed'],
  spousal: ['submitted', 'aor', 'sponsor_approved', 'biometrics', 'medical', 'eligibility', 'background', 'ppr', 'copr', 'landed'],
  citizenship: ['submitted', 'aor', 'test_invite', 'test', 'interview', 'oath_invite', 'oath'],
  pr_card: ['submitted', 'aor', 'card_mailed', 'card_received'],
  other: ['submitted', 'aor', 'decision'],
};

/** The milestone that marks completion for each application type. */
export const FINAL_MILESTONE: Record<ApplicationKind, string> = {
  ee_cec: 'copr', ee_fsw: 'copr', ee_fst: 'copr', pnp_ee: 'copr', pnp_base: 'copr', spousal: 'copr',
  citizenship: 'oath', pr_card: 'card_received', other: 'decision',
};

/**
 * Built-in fallback processing times (days), from IRCC service standards:
 * Express Entry 6 months, spousal sponsorship 12 months, citizenship grant 12 months,
 * PR card ~ 2 months. Replaced by the latest IRCC figures when the data mirror is reachable.
 */
export const FALLBACK_DAYS: Record<ApplicationKind, number> = {
  ee_cec: 183, ee_fsw: 183, ee_fst: 183, pnp_ee: 183, pnp_base: 365, spousal: 365,
  citizenship: 365, pr_card: 60, other: 180,
};

export interface CommunityRecord {
  /** Anonymised: application kind and month granularity only. */
  kind: ApplicationKind;
  submittedMonth: string; // YYYY-MM
  /** Days from submission to each milestone reached. */
  days: Record<string, number>;
  office?: string;
}

export interface Prediction {
  expectedDays: number;
  source: 'override' | 'community' | 'ircc' | 'fallback';
  /** Percentile range for completion date (when community data exists). */
  p25?: ISODate;
  p50: ISODate;
  p75?: ISODate;
  elapsed: number;
  percent: number; // 0..100 of expected time elapsed
  sampleSize?: number;
  /** Predicted dates for milestones not yet reached (from community medians). */
  next: { key: string; date: ISODate; sample: number }[];
}

export function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return NaN;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return Math.round(sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo));
}

/** Records comparable to `app`: same kind, submitted within ±`windowMonths` months. */
export function similarRecords(app: Application, records: CommunityRecord[], windowMonths = 3): CommunityRecord[] {
  const kindMatch = records.filter((r) => r.kind === app.kind);
  if (!app.submitted) return kindMatch;
  const [y, m] = app.submitted.split('-').map(Number);
  const target = y * 12 + m;
  const near = kindMatch.filter((r) => {
    const [ry, rm] = r.submittedMonth.split('-').map(Number);
    return Math.abs(ry * 12 + rm - target) <= windowMonths;
  });
  return near.length >= 5 ? near : kindMatch;
}

export function predict(
  app: Application,
  today: ISODate,
  irccDays: Partial<Record<ApplicationKind, number>>,
  records: CommunityRecord[] = [],
): Prediction | null {
  if (!app.submitted) return null;
  const final = FINAL_MILESTONE[app.kind];
  const sim = similarRecords(app, records);
  const finals = sim.map((r) => r.days[final]).filter((d): d is number => typeof d === 'number' && d >= 0).sort((a, b) => a - b);

  let expectedDays: number;
  let source: Prediction['source'];
  let p25: ISODate | undefined;
  let p75: ISODate | undefined;
  if (app.expectedDays && app.expectedDays > 0) {
    expectedDays = app.expectedDays;
    source = 'override';
  } else if (finals.length >= 5) {
    expectedDays = percentile(finals, 0.5);
    source = 'community';
    p25 = addDays(app.submitted, percentile(finals, 0.25));
    p75 = addDays(app.submitted, percentile(finals, 0.75));
  } else if (irccDays[app.kind]) {
    expectedDays = irccDays[app.kind]!;
    source = 'ircc';
  } else {
    expectedDays = FALLBACK_DAYS[app.kind];
    source = 'fallback';
  }
  const elapsed = Math.max(0, diffDays(today, app.submitted));
  const reached = new Set(app.milestones.filter((m) => m.date).map((m) => m.key));
  const next: Prediction['next'] = [];
  for (const key of MILESTONES[app.kind]) {
    if (reached.has(key) || key === 'submitted') continue;
    const ds = sim.map((r) => r.days[key]).filter((d): d is number => typeof d === 'number' && d >= 0).sort((a, b) => a - b);
    if (ds.length >= 3) next.push({ key, date: addDays(app.submitted, percentile(ds, 0.5)), sample: ds.length });
  }
  const done = reached.has(final);
  return {
    expectedDays,
    source,
    p25,
    p50: addDays(app.submitted, expectedDays),
    p75,
    elapsed,
    percent: done ? 100 : Math.min(99, Math.round((elapsed / expectedDays) * 100)),
    sampleSize: finals.length || undefined,
    next,
  };
}

/** Build an anonymised record from the user's application (month precision only). */
export function toCommunityRecord(app: Application): CommunityRecord | null {
  if (!app.submitted) return null;
  const days: Record<string, number> = {};
  for (const m of app.milestones) {
    if (!m.date || m.key === 'submitted') continue;
    const d = diffDays(m.date, app.submitted);
    if (d >= 0) days[m.key] = d; // milestones before submission (profile, ITA…) aren't shared
  }
  return { kind: app.kind, submittedMonth: app.submitted.slice(0, 7), days, office: app.office || undefined };
}

/** Parse IRCC-style strings ("6 months", "38 days", "16 weeks") into days. */
export function parseDuration(s: string): number | null {
  const m = /([\d.]+)\s*(day|week|month|year)s?/i.exec(s);
  if (!m) return null;
  const n = Number(m[1]);
  const unit = m[2].toLowerCase();
  const mult = unit === 'day' ? 1 : unit === 'week' ? 7 : unit === 'month' ? 30.44 : 365.25;
  return Math.round(n * mult);
}
