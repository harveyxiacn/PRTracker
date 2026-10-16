// CONTRACT (v0.6): application helper — data IRCC forms ask for, computed from the user's data.
// Owner: forms agent.
//
// Everything here is derived from PresenceModel so the numbers always match the rest of the app:
//  • citizenshipAbsences: every trip that touches the eligibility period [date − 5y, date − 1],
//    with the days outside Canada that fall inside the period (current boundary-day rule).
//  • presenceReport: the breakdown IRCC's physical presence calculator shows (pre-PR periods at ½,
//    PR period, absences); its totals equal PresenceModel.citizenshipAt(date) exactly.
//  • cardRenewalCheck: residency obligation (IRPA s.28) at the signing date + the 9-month window.
import { addMonths, fromDay, isISODate, toDay, todayISO, type ISODate } from './dates';
import { CITIZENSHIP_REQUIRED, PresenceModel, RESIDENCY_REQUIRED } from './presence';
import type { AppData, Trip } from './types';

export interface AbsenceRow {
  from: ISODate; // departure date
  to: ISODate; // return date (or today for an ongoing trip)
  days: number; // full days outside Canada under the current counting rule
  destination: string;
  reason: string; // i18n-free text: trip purpose label in English (forms are in EN/FR) or note
}

/** English purpose labels used on forms and exports. */
export const PURPOSE_LABEL_EN: Record<NonNullable<Trip['purpose']>, string> = {
  vacation: 'Vacation',
  family: 'Family',
  work: 'Work',
  study: 'Study',
  other: 'Other',
};

/** IRCC: apply to renew the PR card when it expires in less than 9 months (or has expired). */
export const CARD_RENEWAL_MONTHS = 9;

const okEnd = (d: unknown) => d === null || d === undefined || d === '' || isISODate(d);

function modelFor(data: AppData, today: ISODate): PresenceModel {
  return new PresenceModel({
    profile: data.profile,
    trips: data.trips,
    today,
    boundaryDaysPresent: data.settings.boundaryDaysPresent,
  });
}

function reasonOf(t: Trip): string {
  const label = t.purpose ? PURPOSE_LABEL_EN[t.purpose] ?? '' : '';
  const note = (t.note ?? '').trim();
  if (label && note) return `${label}: ${note}`;
  return label || note;
}

/**
 * Absences in the citizenship eligibility period ending the day before `applicationDate`.
 * A trip is listed when any of its days (departure..return) falls inside the period; `days`
 * counts only the days outside Canada inside the period. An ongoing trip runs to `today`.
 * `today` (optional, defaults to the device date) only matters for ongoing trips.
 */
export function citizenshipAbsences(data: AppData, applicationDate: ISODate, today: ISODate = todayISO()): AbsenceRow[] {
  const boundary = data.settings.boundaryDaysPresent;
  const ws = toDay(addMonths(applicationDate, -60));
  const we = toDay(applicationDate) - 1;
  const rows: AbsenceRow[] = [];
  const trips = data.trips
    .filter((t) => isISODate(t.departure) && okEnd(t.return))
    .sort((a, b) => a.departure.localeCompare(b.departure));
  for (const t of trips) {
    const ongoing = !isISODate(t.return);
    const dep = toDay(t.departure);
    const end = ongoing ? Math.max(toDay(today), dep) : toDay(t.return as ISODate);
    if (end < dep) continue; // reversed dates: flagged elsewhere, not a valid absence
    if (end < ws || dep > we) continue; // no day of the trip in the period
    // Days outside Canada: (dep, end) exclusive in boundary mode; [dep, end] in strict mode.
    // An ongoing trip is assumed to end tomorrow, as in PresenceModel: away through today in
    // boundary mode, through tomorrow in strict mode.
    const first = boundary ? dep + 1 : dep;
    const last = ongoing ? (boundary ? end : end + 1) : boundary ? end - 1 : end;
    const days = Math.max(0, Math.min(last, we) - Math.max(first, ws) + 1);
    rows.push({ from: t.departure, to: fromDay(end), days, destination: (t.destination ?? '').trim(), reason: reasonOf(t) });
  }
  return rows;
}

export interface PresenceReport {
  applicationDate: ISODate;
  windowStart: ISODate;
  windowEnd: ISODate;
  /** Periods before PR with temporary status / protected person (each day = ½). */
  prePrPeriods: { from: ISODate; to: ISODate; daysPresent: number; kind: string }[];
  prPeriodStart: ISODate | null;
  prDaysPresent: number;
  prePrDaysPresent: number;
  prePrCredit: number;
  absences: AbsenceRow[];
  totalAbsenceDays: number;
  credited: number;
  required: number;
  eligible: boolean;
}

/**
 * The same breakdown IRCC's physical presence calculator produces, for printing/comparison.
 * `today` (optional) is used for ongoing/planned trips, as everywhere else in the app.
 */
export function presenceReport(data: AppData, applicationDate: ISODate, today: ISODate = todayISO()): PresenceReport {
  const model = modelFor(data, today);
  const c = model.citizenshipAt(applicationDate);
  const ws = toDay(c.windowStart);
  const we = toDay(c.windowEnd);
  const prDay = model.prDay;

  // Pre-PR periods clipped to the window (and to the day before PR). Each present day is counted
  // once, even if two periods overlap, so the sum equals the model's pre-PR days.
  const counted = new Set<number>();
  const prePrPeriods: PresenceReport['prePrPeriods'] = [];
  const periods = data.profile.statusPeriods
    .filter((sp) => isISODate(sp.start) && okEnd(sp.end))
    .sort((a, b) => a.start.localeCompare(b.start));
  for (const sp of periods) {
    let e = isISODate(sp.end) ? toDay(sp.end) : we;
    if (prDay !== null) e = Math.min(e, prDay - 1);
    const s = Math.max(toDay(sp.start), ws);
    e = Math.min(e, we);
    if (e < s) continue;
    let present = 0;
    for (let d = s; d <= e; d++) {
      if (counted.has(d)) continue;
      const iso = fromDay(d);
      if (model.dayStatus(iso) === 'tr' && !model.isAbsent(iso)) {
        counted.add(d);
        present++;
      }
    }
    prePrPeriods.push({ from: fromDay(s), to: fromDay(e), daysPresent: present, kind: sp.kind });
  }

  const prPeriodStart = prDay !== null && prDay <= we ? fromDay(Math.max(prDay, ws)) : null;
  const absences = citizenshipAbsences(data, applicationDate, today);
  return {
    applicationDate,
    windowStart: c.windowStart,
    windowEnd: c.windowEnd,
    prePrPeriods,
    prPeriodStart,
    prDaysPresent: c.prDays,
    prePrDaysPresent: c.prePrDays,
    prePrCredit: c.prePrCredit,
    absences,
    // From the model, so overlapping trips are not counted twice.
    totalAbsenceDays: model.absentBetween(c.windowStart, c.windowEnd),
    credited: c.credited,
    required: CITIZENSHIP_REQUIRED,
    eligible: c.eligible,
  };
}

export interface CardRenewalCheck {
  signDate: ISODate;
  windowStart: ISODate;
  presentDays: number;
  required: number;
  compliant: boolean;
  /** Days still needed in Canada before `signDate` for compliance (0 if compliant). */
  shortfall: number;
  cardExpiry?: ISODate;
  canApplyNow: boolean; // card expires within 9 months (or expired)
}

/**
 * Residency obligation at the signing date (PresenceModel.residencyAt: 730 PR days in the
 * 5 years before, or — PR for under 5 years — still able to reach 730 by the 5th anniversary).
 */
export function cardRenewalCheck(data: AppData, signDate: ISODate, today: ISODate = todayISO()): CardRenewalCheck {
  const model = modelFor(data, today);
  const r = model.residencyAt(signDate);
  const expiry = isISODate(data.profile.prCardExpiry) ? data.profile.prCardExpiry : undefined;
  const canApplyNow = !!expiry && signDate >= addMonths(expiry, -CARD_RENEWAL_MONTHS);
  if (!r) {
    return {
      signDate,
      windowStart: addMonths(signDate, -60),
      presentDays: 0,
      required: RESIDENCY_REQUIRED,
      compliant: false,
      shortfall: RESIDENCY_REQUIRED,
      cardExpiry: expiry,
      canApplyNow,
    };
  }
  return {
    signDate,
    windowStart: r.windowStart,
    presentDays: r.present,
    required: r.required,
    compliant: r.compliant,
    shortfall: r.compliant ? 0 : Math.max(0, r.shortfall),
    cardExpiry: expiry,
    canApplyNow,
  };
}

function csvCell(v: string): string {
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export const ABSENCE_CSV_HEADERS = ['From', 'To', 'Number of days', 'Destination', 'Reason'];

/** RFC-4180 CSV of absences with English headers matching the citizenship form. */
export function absencesToCsv(rows: AbsenceRow[]): string {
  const lines = [ABSENCE_CSV_HEADERS, ...rows.map((r) => [r.from, r.to, String(r.days), r.destination, r.reason])];
  return lines.map((l) => l.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
