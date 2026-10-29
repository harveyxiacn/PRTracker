// Physical-presence engine: turns profile + trips into a per-day model and answers
// the questions IRCC asks:
//  • Citizenship (Citizenship Act s.5(1)(c)): 1,095 days of physical presence in the
//    5 years before applying. Days as a PR count fully; days as a temporary resident
//    or protected person before PR count as half a day, up to 365 credited days.
//  • PR residency obligation (IRPA s.28): 730 days in Canada in every 5-year period
//    (or, if PR for less than 5 years, being able to reach 730 by the 5th anniversary).
// IRCC counts the day you leave and the day you come back as days in Canada.

import { addDays, addYears, fromDay, isISODate, maxDate, minDate, toDay, type ISODate } from './dates';
import type { Profile, Trip } from './types';

export const CITIZENSHIP_REQUIRED = 1095;
export const CITIZENSHIP_PRE_PR_CAP = 365;
export const RESIDENCY_REQUIRED = 730;
/**
 * PR card renewal window: IRCC returns a renewal application if the card is still valid for
 * more than 270 days (Guide 5445 / IMM 5444: "nine (9) months (270 days)"). The window opens on
 * expiry − 270 days. Used by insights, forms, documents and Maple.
 */
export const PR_CARD_RENEWAL_DAYS = 270;

export type DayStatus = 'none' | 'tr' | 'pr';

export type DayKind =
  | 'pr_in' // in Canada as PR (full credit)
  | 'tr_in' // in Canada before PR with temporary status (half credit)
  | 'none_in' // in Canada with no tracked status, or before first entry
  | 'out' // outside Canada (past / today)
  | 'out_planned' // outside Canada (future planned trip)
  | 'travel' // departure or return day (counts as in Canada)
  | 'future'; // future day assumed in Canada

export interface PresenceInput {
  profile: Profile;
  trips: Trip[];
  today: ISODate;
  boundaryDaysPresent?: boolean;
}

export interface TripIssue {
  tripId: string;
  kind: 'return_before_departure' | 'overlap' | 'ongoing_in_future' | 'multiple_ongoing';
  otherId?: string;
}

export function validateTrips(trips: Trip[], today: ISODate): TripIssue[] {
  const issues: TripIssue[] = [];
  const sorted = [...trips].sort((a, b) => a.departure.localeCompare(b.departure));
  let ongoing = 0;
  for (const t of sorted) {
    if (t.return && t.return < t.departure) issues.push({ tripId: t.id, kind: 'return_before_departure' });
    if (!t.return) {
      ongoing++;
      if (t.departure > today) issues.push({ tripId: t.id, kind: 'ongoing_in_future' });
      if (ongoing > 1) issues.push({ tripId: t.id, kind: 'multiple_ongoing' });
    }
  }
  // Track the latest return so far, so a trip nested inside a long earlier one is caught.
  let latest: Trip | undefined;
  for (const cur of sorted) {
    if (latest) {
      const end = latest.return ?? '9999-12-31';
      // Returning and leaving again on the same day is fine; anything earlier overlaps.
      if (cur.departure < end) issues.push({ tripId: cur.id, kind: 'overlap', otherId: latest.id });
    }
    if (!latest || (cur.return ?? '9999-12-31') > (latest.return ?? '9999-12-31')) latest = cur;
  }
  return issues;
}

export interface CitizenshipResult {
  /** Credited days for an application signed on `asOf`. */
  credited: number;
  prDays: number;
  prePrDays: number;
  prePrCredit: number;
  windowStart: ISODate;
  windowEnd: ISODate;
  eligible: boolean;
  remaining: number;
}

export interface ResidencyResult {
  present: number;
  required: number;
  windowStart: ISODate;
  /** PR for less than 5 years: the 5th anniversary; else undefined. */
  anniversary?: ISODate;
  compliant: boolean;
  /** Days you could stay outside Canada starting tomorrow and stay compliant. */
  maxAbsence: number;
  /** Last day you must be back in Canada if leaving tomorrow. */
  mustReturnBy?: ISODate;
  /** If not compliant: first date compliance is regained by staying in Canada. */
  regainDate?: ISODate;
  shortfall: number;
}

export interface YearStats {
  year: number;
  inCanada: number;
  outside: number;
  trips: number;
}

/**
 * Per-day model. Index i corresponds to day number `start + i`.
 * Arrays run from the earliest relevant date to today + ~6 years so projections are O(1).
 */
export class PresenceModel {
  readonly start: number;
  readonly end: number;
  readonly today: number;
  readonly prDay: number | null;
  /** First day the user could have been in Canada (first entry / status / PR), if known. */
  readonly firstPresentDay: number | null;
  private absent: Uint8Array;
  private boundary: Uint8Array;
  private status: Uint8Array; // 0 none, 1 tr, 2 pr
  private prefPr: Int32Array; // prefix sums of present PR days
  private prefTr: Int32Array; // prefix sums of present pre-PR status days
  private prefOut: Int32Array;
  private readonly boundaryPresent: boolean;

  constructor(readonly input: PresenceInput) {
    const { profile, trips, today } = sanitize(input);
    const boundaryPresent = input.boundaryDaysPresent ?? true;
    this.boundaryPresent = boundaryPresent;
    this.today = toDay(today);
    this.prDay = profile.prDate ? toDay(profile.prDate) : null;
    const fp = minDate(profile.firstEntry, profile.prDate, ...profile.statusPeriods.map((s) => s.start));
    this.firstPresentDay = fp ? toDay(fp) : null;
    const earliest = minDate(
      profile.firstEntry,
      profile.prDate,
      ...profile.statusPeriods.map((s) => s.start),
      ...trips.map((t) => t.departure),
      addYears(today, -6),
    )!;
    this.start = toDay(earliest);
    const latestTrip = maxDate(...trips.map((t) => t.return ?? t.departure));
    this.end = Math.max(toDay(addYears(today, 7)), latestTrip ? toDay(latestTrip) + 1 : 0);
    const n = this.end - this.start + 1;
    this.absent = new Uint8Array(n);
    this.boundary = new Uint8Array(n);
    this.status = new Uint8Array(n);

    // Status per day.
    for (const sp of profile.statusPeriods) {
      const s = Math.max(toDay(sp.start), this.start);
      let e = sp.end ? toDay(sp.end) : this.end;
      if (this.prDay !== null) e = Math.min(e, this.prDay - 1);
      for (let d = s; d <= Math.min(e, this.end); d++) this.status[d - this.start] = 1;
    }
    if (this.prDay !== null) {
      for (let d = Math.max(this.prDay, this.start); d <= this.end; d++) this.status[d - this.start] = 2;
    }

    // Absence per day.
    for (const t of trips) {
      const dep = toDay(t.departure);
      let ret: number;
      if (t.return) ret = toDay(t.return);
      else ret = Math.max(this.today + 1, dep + 1); // ongoing: assume back tomorrow
      if (ret < dep) continue;
      const first = boundaryPresent ? dep + 1 : dep;
      const last = boundaryPresent ? ret - 1 : ret;
      for (let d = Math.max(first, this.start); d <= Math.min(last, this.end); d++) this.absent[d - this.start] = 1;
      if (boundaryPresent) {
        if (dep >= this.start && dep <= this.end && !this.absent[dep - this.start]) this.boundary[dep - this.start] = 1;
        if (t.return && ret >= this.start && ret <= this.end && !this.absent[ret - this.start]) this.boundary[ret - this.start] = 1;
      }
    }

    this.prefPr = new Int32Array(n + 1);
    this.prefTr = new Int32Array(n + 1);
    this.prefOut = new Int32Array(n + 1);
    for (let i = 0; i < n; i++) {
      const present = this.absent[i] ? 0 : 1;
      this.prefPr[i + 1] = this.prefPr[i] + (present && this.status[i] === 2 ? 1 : 0);
      this.prefTr[i + 1] = this.prefTr[i] + (present && this.status[i] === 1 ? 1 : 0);
      this.prefOut[i + 1] = this.prefOut[i] + this.absent[i];
    }
  }

  private idx(day: number): number {
    return Math.min(Math.max(day - this.start, 0), this.end - this.start + 1);
  }

  /** Sum over [fromDay, toDay] inclusive. */
  private sum(pref: Int32Array, from: number, to: number): number {
    if (to < from) return 0;
    return pref[this.idx(to + 1)] - pref[this.idx(from)];
  }

  isAbsent(iso: ISODate): boolean {
    const d = toDay(iso);
    if (d < this.start || d > this.end) return false;
    return this.absent[d - this.start] === 1;
  }

  dayKind(iso: ISODate): DayKind {
    const d = toDay(iso);
    if (d < this.start || d > this.end) return d > this.today ? 'future' : 'none_in';
    const i = d - this.start;
    if (this.absent[i]) return d > this.today ? 'out_planned' : 'out';
    if (this.boundary[i]) return 'travel';
    if (d > this.today) return 'future';
    if (this.status[i] === 2) return 'pr_in';
    if (this.status[i] === 1) return 'tr_in';
    return 'none_in';
  }

  dayStatus(iso: ISODate): DayStatus {
    const d = toDay(iso);
    if (d < this.start || d > this.end) return 'none';
    return (['none', 'tr', 'pr'] as const)[this.status[d - this.start]];
  }

  /** Citizenship credit for an application signed on `asOf` (window = 5 years before it). */
  citizenshipAt(asOf: ISODate): CitizenshipResult {
    const a = toDay(asOf);
    const ws = toDay(addYears(asOf, -5));
    const we = a - 1;
    const prDays = this.sum(this.prefPr, ws, we);
    const prePrDays = this.sum(this.prefTr, ws, we);
    const prePrCredit = Math.min(CITIZENSHIP_PRE_PR_CAP, prePrDays / 2);
    const credited = Math.floor(prDays + prePrCredit);
    const isPr = this.prDay !== null && a >= this.prDay;
    return {
      credited,
      prDays,
      prePrDays,
      prePrCredit,
      windowStart: fromDay(ws),
      windowEnd: fromDay(we),
      eligible: isPr && credited >= CITIZENSHIP_REQUIRED,
      remaining: Math.max(0, CITIZENSHIP_REQUIRED - credited),
    };
  }

  /**
   * Earliest application date (>= today) with at least `required` credited days,
   * assuming you are in Canada except for trips already logged (including future ones).
   */
  citizenshipEligibleDate(required = CITIZENSHIP_REQUIRED): ISODate | null {
    if (this.prDay === null) return null;
    const from = Math.max(this.today, this.prDay);
    for (let a = from; a <= this.end; a++) {
      const iso = fromDay(a);
      if (this.citizenshipAt(iso).credited >= required) return iso;
    }
    return null;
  }

  /**
   * Residency obligation status on `asOf` (default today).
   * `maxAbsence`/`mustReturnBy` answer: "if I leave tomorrow, how long can I stay away?"
   */
  residencyAt(asOf?: ISODate, opts: { abroadNow?: boolean } = {}): ResidencyResult | null {
    if (this.prDay === null) return null;
    const prDay = this.prDay;
    const t = asOf ? toDay(asOf) : this.today;
    const anniv = toDay(addYears(fromDay(prDay), 5));
    const windowStartFor = (day: number) => Math.max(prDay, toDay(addYears(fromDay(day), -5)));
    // PR days present in the 5-year window before `day`, counting only days up to `limit`.
    const presentAt = (day: number, limit: number) => this.sum(this.prefPr, windowStartFor(day), Math.min(day - 1, limit));
    // Before the 5th anniversary you comply if you can still reach 730 by staying from `day` on.
    const okAt = (day: number, limit: number) => {
      const p = presentAt(day, limit);
      return day < anniv ? p + (anniv - day) >= RESIDENCY_REQUIRED : p >= RESIDENCY_REQUIRED;
    };

    const present = presentAt(t, t - 1);
    const compliant = okAt(t, t - 1);

    let maxAbsence = 0;
    let mustReturnBy: ISODate | undefined;
    if (compliant) {
      // Leave tomorrow (L). The departure day counts as present when boundary days count.
      // When already abroad, today and onwards are away until the return day.
      const leave = opts.abroadNow ? t - 1 : t + 1;
      const lastPresent = opts.abroadNow ? t - 1 : this.boundaryPresent ? leave : t;
      let fail = -1;
      for (let d = Math.max(leave, t) + 1; d <= t + 5 * 366 + 2; d++) {
        if (!okAt(d, lastPresent)) {
          fail = d;
          break;
        }
      }
      if (fail > 0) {
        // Compliance on day d depends on presence up to d-1. Default mode: the return day counts
        // as present, so being back on fail-1 keeps you compliant. Strict mode: the return day is
        // itself absent, so you must be back one day earlier (fail-2).
        const ret = this.boundaryPresent ? fail - 1 : fail - 2;
        mustReturnBy = fromDay(ret);
        // Abroad now: days left until the return date. Leaving tomorrow: days outside Canada,
        // (leave, ret) exclusive by default and [leave, ret] inclusive in strict mode.
        maxAbsence = Math.max(0, opts.abroadNow ? ret - t : this.boundaryPresent ? ret - leave - 1 : ret - leave + 1);
      }
    }

    let regainDate: ISODate | undefined;
    if (!compliant) {
      for (let d = t + 1; d <= this.end; d++) {
        if (this.sum(this.prefPr, windowStartFor(d), d - 1) >= RESIDENCY_REQUIRED) {
          regainDate = fromDay(d);
          break;
        }
      }
    }
    return {
      present,
      required: RESIDENCY_REQUIRED,
      windowStart: fromDay(windowStartFor(t)),
      anniversary: t < anniv ? fromDay(anniv) : undefined,
      compliant,
      maxAbsence,
      mustReturnBy,
      regainDate,
      shortfall: compliant ? 0 : t < anniv ? RESIDENCY_REQUIRED - present - (anniv - t) : RESIDENCY_REQUIRED - present,
    };
  }

  /** Days outside Canada (absent) in [from, to]. */
  absentBetween(from: ISODate, to: ISODate): number {
    return this.sum(this.prefOut, toDay(from), toDay(to));
  }

  yearStats(year: number, trips: Trip[]): YearStats {
    let from = `${year}-01-01`;
    if (this.firstPresentDay !== null && toDay(from) < this.firstPresentDay) from = fromDay(this.firstPresentDay);
    const to0 = `${year}-12-31`;
    const to = to0 > fromDay(this.today) ? fromDay(this.today) : to0;
    const total = to < from ? 0 : toDay(to) - toDay(from) + 1;
    const outside = to < from ? 0 : this.absentBetween(from, to);
    return {
      year,
      inCanada: total - outside,
      outside,
      trips: trips.filter((t) => t.departure.slice(0, 4) === String(year)).length,
    };
  }

  get firstDay(): ISODate {
    return fromDay(this.start);
  }
}

/** Drop half-filled rows (e.g. a status period whose start date is still empty). */
function sanitize(input: PresenceInput): PresenceInput {
  const ok = (d: unknown) => d === null || d === undefined || d === '' || isISODate(d);
  const p = input.profile;
  return {
    ...input,
    profile: {
      ...p,
      prDate: isISODate(p.prDate) ? p.prDate : undefined,
      firstEntry: isISODate(p.firstEntry) ? p.firstEntry : undefined,
      statusPeriods: p.statusPeriods.filter((sp) => isISODate(sp.start) && ok(sp.end)).map((sp) => ({ ...sp, end: sp.end || null })),
    },
    trips: input.trips.filter((t) => isISODate(t.departure) && ok(t.return)).map((t) => ({ ...t, return: t.return || null })),
  };
}

/** What-if: same inputs plus a hypothetical trip. */
export function withExtraTrip(input: PresenceInput, departure: ISODate, ret: ISODate): PresenceModel {
  return new PresenceModel({
    ...input,
    trips: [...input.trips, { id: '__whatif__', departure, return: ret }],
  });
}

export function tripLength(t: Trip, today: ISODate, boundaryDaysPresent = true): number {
  if (!isISODate(t.departure)) return 0;
  const ongoing = !isISODate(t.return);
  const end = ongoing ? today : (t.return as ISODate);
  const span = toDay(end) - toDay(t.departure);
  if (span < 0) return 0;
  // An ongoing trip counts as away through today (the return day hasn't happened yet).
  if (ongoing) return boundaryDaysPresent ? span : span + 1;
  return boundaryDaysPresent ? Math.max(0, span - 1) : span + 1;
}

export { addDays };
