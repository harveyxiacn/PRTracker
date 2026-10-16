// Pure helpers for the IRCC processing-time history (public/data/ircc-history.json).
// Shared by the app (validation, change computation) and scripts/ircc-history.mjs (append),
// so this file must stay self-contained: no runtime imports and only erasable TypeScript
// syntax, because Node runs it directly with type stripping.
import type { TrendPoint, TrendsData } from './trends';

/** Append a new point when the value is unchanged but the last point is this old (days). */
export const REFRESH_DAYS = 30;
/** Points kept per series (oldest dropped first). */
export const MAX_POINTS = 400;
/** Plausible processing time range in days. */
export const MAX_DAYS = 3650;

/** "pr_card", "work_ext", "study:IN", "visitor-outside-canada:PH". */
const SERIES_KEY_RE = /^[a-z][a-z0-9_-]{1,40}(?::[A-Z]{2})?$/;
const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Calendar day number (UTC) of a valid ISO date, or NaN. */
export function dayNumber(iso: string): number {
  const m = ISO_RE.exec(iso);
  if (!m) return NaN;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = Date.UTC(y, mo - 1, d);
  const dt = new Date(t);
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return NaN;
  return Math.floor(t / 86_400_000);
}

function isoFromDay(day: number): string {
  return new Date(day * 86_400_000).toISOString().slice(0, 10);
}

export function isSeriesKey(k: string): boolean {
  return SERIES_KEY_RE.test(k);
}

function validDays(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= MAX_DAYS;
}

/** The subset of ircc.json the history needs. */
export interface IrccSnapshot {
  times?: Record<string, unknown>;
  byCountry?: Record<string, Record<string, unknown> | undefined>;
}

/** Flatten an ircc.json snapshot into series key -> days ("pr_card", "study:IN"…). */
export function snapshotValues(ircc: IrccSnapshot): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(ircc.times ?? {})) {
    if (isSeriesKey(k) && !k.includes(':') && validDays(v) && v > 0) out[k] = v;
  }
  for (const [series, map] of Object.entries(ircc.byCountry ?? {})) {
    if (!map || typeof map !== 'object') continue;
    for (const [cc, v] of Object.entries(map)) {
      const key = `${series}:${cc}`;
      if (/^[A-Z]{2}$/.test(cc) && isSeriesKey(key) && validDays(v) && v > 0) out[key] = v;
    }
  }
  return out;
}

/**
 * Add one value to a series. A point is appended when the series is empty, the value changed,
 * or the last point is at least REFRESH_DAYS old; a same-day re-run replaces the day's value.
 * Returns a new array (never mutates) capped at `max` points.
 */
export function appendPoint(points: readonly TrendPoint[], date: string, days: number, max = MAX_POINTS): TrendPoint[] {
  const out = points.slice();
  const last = out[out.length - 1];
  if (last && dayNumber(date) < dayNumber(last.date)) return out; // never write into the past
  if (last && last.date === date) {
    if (last.days !== days) out[out.length - 1] = { date, days };
  } else if (!last || last.days !== days || dayNumber(date) - dayNumber(last.date) >= REFRESH_DAYS) {
    out.push({ date, days });
  }
  return out.length > max ? out.slice(out.length - max) : out;
}

/** Merge today's snapshot into the history. Series missing today are kept unchanged. */
export function appendSnapshot(history: TrendsData | undefined, ircc: IrccSnapshot, date: string, updated: string, max = MAX_POINTS): TrendsData {
  if (Number.isNaN(dayNumber(date))) throw new Error(`Invalid snapshot date: ${date}`);
  const series: Record<string, TrendPoint[]> = { ...(history?.series ?? {}) };
  for (const [key, days] of Object.entries(snapshotValues(ircc))) series[key] = appendPoint(series[key] ?? [], date, days, max);
  return { updated, series: sortedSeries(series) };
}

/** Deterministic key order so the committed file diffs cleanly. */
export function sortedSeries(series: Record<string, TrendPoint[]>): Record<string, TrendPoint[]> {
  const out: Record<string, TrendPoint[]> = {};
  for (const k of Object.keys(series).sort()) out[k] = series[k].map((p) => ({ date: p.date, days: p.days }));
  return out;
}

/**
 * Strict shape check (the data URL is user-configurable). A malformed document is rejected;
 * a series with a bad key, a bad point or dates not strictly increasing is dropped.
 */
export function validateTrends(v: unknown): TrendsData | undefined {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined;
  const o = v as { updated?: unknown; series?: unknown };
  if (typeof o.updated !== 'string') return undefined;
  if (!o.series || typeof o.series !== 'object' || Array.isArray(o.series)) return undefined;
  const series: Record<string, TrendPoint[]> = {};
  for (const [k, pts] of Object.entries(o.series as Record<string, unknown>)) {
    if (!isSeriesKey(k) || !Array.isArray(pts) || pts.length > MAX_POINTS * 2) continue;
    const clean: TrendPoint[] = [];
    let ok = true;
    let prev = -Infinity;
    for (const p of pts) {
      const date = (p as TrendPoint | null)?.date;
      const days = (p as TrendPoint | null)?.days;
      const dn = typeof date === 'string' ? dayNumber(date) : NaN;
      if (!p || typeof p !== 'object' || Number.isNaN(dn) || !validDays(days) || dn <= prev) {
        ok = false;
        break;
      }
      prev = dn;
      clean.push({ date: date as string, days });
    }
    if (ok) series[k] = clean;
  }
  return { updated: o.updated, series };
}

export interface TrendChange {
  latest: TrendPoint;
  /** The value in effect on the reference date (or the first point if history is shorter). */
  reference: TrendPoint;
  /** Reference date: latest date minus `windowDays`, or the first point's date when `partial`. */
  referenceDate: string;
  change: number;
  /** History doesn't reach back `windowDays`; the change is since the first point. */
  partial: boolean;
}

/**
 * Change of the latest value vs `windowDays` before it. The series is a step function (a point
 * is stored only when the value changes), so the reference is the last point on or before
 * that date. Undefined with fewer than 2 points.
 */
export function changeSince(points: readonly TrendPoint[], windowDays = 90): TrendChange | undefined {
  if (points.length < 2) return undefined;
  const latest = points[points.length - 1];
  const refDay = dayNumber(latest.date) - windowDays;
  let reference: TrendPoint | undefined;
  for (const p of points) if (dayNumber(p.date) <= refDay) reference = p;
  if (reference) return { latest, reference, referenceDate: isoFromDay(refDay), change: latest.days - reference.days, partial: false };
  const first = points[0];
  return { latest, reference: first, referenceDate: first.date, change: latest.days - first.days, partial: true };
}

/** Most common value (ties: first seen), e.g. the user's usual country. */
export function mostCommon(values: readonly (string | undefined | null)[]): string | undefined {
  const counts = new Map<string, number>();
  let best: string | undefined;
  for (const v of values) {
    if (!v) continue;
    const n = (counts.get(v) ?? 0) + 1;
    counts.set(v, n);
    if (!best || n > (counts.get(best) ?? 0)) best = v;
  }
  return best;
}

/** "Nice" axis ticks covering [min, max] (about `count` intervals). */
export function niceTicks(min: number, max: number, count = 4): number[] {
  if (!(max > min)) {
    const pad = Math.max(1, Math.abs(min) * 0.1);
    return niceTicks(min - pad, max + pad, count);
  }
  const raw = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let t = lo; t <= hi + step / 2; t += step) ticks.push(Math.round(t * 1e6) / 1e6);
  return ticks;
}
