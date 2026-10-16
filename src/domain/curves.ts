// CONTRACT (v0.7): community processing curves — "% of similar applicants finished by day N"
// (empirical CDF), by program and optionally office/province/country. Owner: community-2 agent.
//
// How the sample is chosen
// - Same application kind, and the record must contain the kind's final milestone
//   (FINAL_MILESTONE: copr, decision, oath, card_received…). Records without it are EXCLUDED:
//   we cannot tell "still waiting" from "never reported", so they are left out rather than
//   guessed. This makes the curve lean optimistic (slow files are still open and missing), which
//   the UI says in plain words.
// - Scope, narrowest first: office → province → country → whole program. The first scope with at
//   least `minN` finished records wins (default CURVE_MIN_N = 8). With fewer than `minN` finished
//   records for the whole program there is no curve (null) — a handful of timelines is anecdote.
//
// How the numbers are read
// - The curve is a step function: pct(day) = share of the sample finished on or before `day`.
// - p50/p80/p90 are the inverse of that step function: the first day by which at least that share
//   had finished (nearest-rank, no interpolation), so "p80 = 120" and "80% had finished by day
//   120" always agree.
import type { Application } from './types';
import { FINAL_MILESTONE, type CommunityRecord } from './timeline';
import { knownOffice } from './programs';

export interface CurvePoint {
  day: number;
  pct: number; // 0..100 finished by this day
}
export interface FinishCurve {
  n: number;
  points: CurvePoint[]; // monotone, starts at (0,0)
  p50?: number;
  p80?: number;
  p90?: number;
  /** Which filter produced the sample: 'office' | 'province' | 'country' | 'program'. */
  scope: 'office' | 'province' | 'country' | 'program';
}

export type CurveScope = FinishCurve['scope'];

/** Minimum finished records for a scope to be used. */
export const CURVE_MIN_N = 8;

export interface CurveSample {
  scope: CurveScope;
  /** Days from submission to the final milestone, ascending. */
  days: number[];
  /** Same-kind records in this scope left out because they lack the final milestone. */
  excluded: number;
}

const finalDays = (r: CommunityRecord, final: string): number | undefined => {
  const d = r.days?.[final];
  return typeof d === 'number' && Number.isFinite(d) && d >= 0 ? d : undefined;
};

/** The sample behind `finishCurve` (exported for the UI and moderation tooling). */
export function curveSample(app: Application, records: CommunityRecord[], minN = CURVE_MIN_N): CurveSample | null {
  const final = FINAL_MILESTONE[app.kind] ?? 'decision';
  const sameKind = records.filter((r) => r && r.kind === app.kind);
  const office = knownOffice(app.office);
  const province = app.province?.toUpperCase();
  const country = app.country?.toUpperCase();
  const scopes: [CurveScope, ((r: CommunityRecord) => boolean) | null][] = [
    ['office', office ? (r) => r.office === office : null],
    ['province', province ? (r) => r.province === province : null],
    ['country', country ? (r) => r.country === country : null],
    ['program', () => true],
  ];
  for (const [scope, pred] of scopes) {
    if (!pred) continue;
    const inScope = sameKind.filter(pred);
    const days = inScope.map((r) => finalDays(r, final)).filter((d): d is number => d !== undefined).sort((a, b) => a - b);
    if (days.length >= Math.max(1, minN)) return { scope, days, excluded: inScope.length - days.length };
  }
  return null;
}

/** Nearest-rank quantile of an ascending list: first value with at least `q` of the sample ≤ it. */
export function nearestRank(sorted: number[], q: number): number | undefined {
  if (!sorted.length) return undefined;
  const rank = Math.min(sorted.length, Math.max(1, Math.ceil(q * sorted.length - 1e-9)));
  return sorted[rank - 1];
}

/** Empirical CDF of ascending finish days: (0,0) then one point per distinct day. */
export function curveFromDays(sorted: number[], scope: CurveScope): FinishCurve {
  const n = sorted.length;
  const points: CurvePoint[] = [{ day: 0, pct: 0 }];
  for (let i = 0; i < n; i++) {
    if (i + 1 < n && sorted[i + 1] === sorted[i]) continue; // last index of each distinct day
    points.push({ day: sorted[i], pct: ((i + 1) / n) * 100 });
  }
  return { n, points, p50: nearestRank(sorted, 0.5), p80: nearestRank(sorted, 0.8), p90: nearestRank(sorted, 0.9), scope };
}

/** Pick the narrowest scope with ≥ minN records, falling back to the whole program. */
export function finishCurve(app: Application, records: CommunityRecord[], minN: number = CURVE_MIN_N): FinishCurve | null {
  const s = curveSample(app, records, minN);
  return s ? curveFromDays(s.days, s.scope) : null;
}

/** Share (0..100) of similar applicants already finished at `elapsedDays`. */
export function finishedShare(curve: FinishCurve, elapsedDays: number): number {
  // Step-wise: the value of the last point at or before `elapsedDays` (no interpolation between days).
  let pct = 0;
  for (const p of curve.points) {
    if (p.day <= elapsedDays) pct = p.pct;
    else break;
  }
  return pct;
}
