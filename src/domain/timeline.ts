// Application timelines: milestone templates per application type and progress prediction
// from IRCC processing times plus (optional) anonymised community timelines.

import { addDays, diffDays, type ISODate } from './dates';
import type { Application, ApplicationKind } from './types';
import { PROGRAMS, TEMPLATES, TEMPLATE_FINAL, knownOffice, program, type IrccCountrySeries } from './programs';

/** Milestones per program id (derived from the program catalogue). */
export const MILESTONES: Record<string, string[]> = Object.fromEntries(PROGRAMS.map((p) => [p.id, TEMPLATES[p.template]]));

/** The milestone that marks completion for each program id. */
export const FINAL_MILESTONE: Record<string, string> = Object.fromEntries(PROGRAMS.map((p) => [p.id, TEMPLATE_FINAL[p.template]]));

/** Offline processing-time estimates (days) per program id. */
export const FALLBACK_DAYS: Record<string, number> = Object.fromEntries(PROGRAMS.map((p) => [p.id, p.fallbackDays]));

/** Live IRCC processing times, as normalised by scripts/fetch-ircc.mjs. */
export interface IrccTimes {
  /** By program id or IRCC time key (e.g. pr_card, work_ext). */
  times?: Record<string, number>;
  /** Series -> ISO country -> days. */
  byCountry?: Partial<Record<IrccCountrySeries, Record<string, number>>>;
}

/** IRCC's published time for this application, if any. */
export function irccDaysFor(app: Application, ircc: IrccTimes): number | undefined {
  const p = program(app.kind);
  if (p.countrySeries && app.country) {
    const d = ircc.byCountry?.[p.countrySeries]?.[app.country.toUpperCase()];
    if (d) return d;
  }
  return ircc.times?.[p.irccTimeKey ?? p.id] ?? ircc.times?.[p.id];
}

export interface CommunityRecord {
  /** Anonymised: application kind and month granularity only. */
  kind: ApplicationKind;
  submittedMonth: string; // YYYY-MM
  /** Days from submission to each milestone reached. */
  days: Record<string, number>;
  office?: string;
  /** Province code (PNP) or country code (temporary residence) when shared. */
  province?: string;
  country?: string;
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

/** Records comparable to `app`: same kind (and province/country when there are enough),
 * submitted within ±`windowMonths` months. */
export function similarRecords(app: Application, records: CommunityRecord[], windowMonths = 3): CommunityRecord[] {
  let kindMatch = records.filter((r) => r.kind === app.kind);
  const narrow = (pred: (r: CommunityRecord) => boolean) => {
    const sub = kindMatch.filter(pred);
    if (sub.length >= 5) kindMatch = sub;
  };
  if (app.province) narrow((r) => r.province === app.province);
  if (app.country) narrow((r) => r.country === app.country);
  if (!app.submitted) return kindMatch;
  const [y, m] = app.submitted.split('-').map(Number);
  const target = y * 12 + m;
  const near = kindMatch.filter((r) => {
    const [ry, rm] = r.submittedMonth.split('-').map(Number);
    return Math.abs(ry * 12 + rm - target) <= windowMonths;
  });
  return near.length >= 5 ? near : kindMatch;
}

export function predict(app: Application, today: ISODate, ircc: IrccTimes, records: CommunityRecord[] = []): Prediction | null {
  if (!app.submitted) return null;
  const final = FINAL_MILESTONE[app.kind] ?? 'decision';
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
  } else if (irccDaysFor(app, ircc)) {
    expectedDays = irccDaysFor(app, ircc)!;
    source = 'ircc';
  } else {
    expectedDays = program(app.kind).fallbackDays;
    source = 'fallback';
  }
  const elapsed = Math.max(0, diffDays(today, app.submitted));
  const reached = new Set(app.milestones.filter((m) => m.date).map((m) => m.key));
  const next: Prediction['next'] = [];
  for (const key of MILESTONES[app.kind] ?? MILESTONES.other) {
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
  const rec: CommunityRecord = { kind: app.kind, submittedMonth: app.submitted.slice(0, 7), days };
  const office = knownOffice(app.office);
  if (office) rec.office = office; // only known IRCC office names are shared
  if (app.province) rec.province = app.province;
  if (app.country) rec.country = app.country.toUpperCase();
  return rec;
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
