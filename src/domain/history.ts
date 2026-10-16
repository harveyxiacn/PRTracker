// CONTRACT (v0.3): Personal history module — addresses and activities with gap detection,
// for IRCC forms (IMM 5669 Schedule A: past 10 years or since age 18, whichever is most
// recent, no gaps allowed; citizenship: the 5 years before applying).
// Implementation owner: history agent. Keep every exported name and signature below.
import { addDays, addYears, diffDays, isISODate, maxDate, minDate, type ISODate } from './dates';
import { countryName } from './countries';

export type ActivityKind = 'work' | 'self_employed' | 'study' | 'unemployed' | 'homemaker' | 'retired' | 'travel' | 'other';

export interface AddressEntry {
  id: string;
  from: ISODate;
  /** null/undefined = current address. */
  to?: ISODate | null;
  street?: string;
  city: string;
  region?: string;
  postal?: string;
  /** ISO 3166-1 alpha-2. */
  country: string;
}

export interface ActivityEntry {
  id: string;
  from: ISODate;
  to?: ISODate | null;
  kind: ActivityKind;
  /** Job title, program of study, or short description. */
  title?: string;
  /** Employer / school. */
  organization?: string;
  city?: string;
  country?: string;
  note?: string;
}

export interface HistoryData {
  addresses: AddressEntry[];
  activities: ActivityEntry[];
  /** Used to compute "since age 18". */
  birthDate?: ISODate;
}

export type HistoryPurpose = 'pr' | 'citizenship';

export interface HistoryWindow {
  from: ISODate;
  to: ISODate;
}

export interface Gap {
  list: 'addresses' | 'activities';
  from: ISODate;
  to: ISODate;
  days: number;
}

export interface Overlap {
  list: 'addresses' | 'activities';
  aId: string;
  bId: string;
  from: ISODate;
  to: ISODate;
}

export function emptyHistory(): HistoryData {
  return { addresses: [], activities: [] };
}

/** Sentinel end used for open-ended ranges when no window end is known (e.g. overlaps of two current addresses). */
export const OPEN_END: ISODate = '9999-12-31';

/** PR: the most recent of 10 years or since 18th birthday; citizenship: 5 years. Ends today. */
export function historyWindow(purpose: HistoryPurpose, today: ISODate, birthDate?: ISODate): HistoryWindow {
  if (purpose === 'citizenship') return { from: addYears(today, -5), to: today };
  const tenYears = addYears(today, -10);
  const adult = birthDate && isISODate(birthDate) ? addYears(birthDate, 18) : undefined;
  // Under 18 today: nothing to declare yet; collapse the window to today.
  const from = minDate(maxDate(tenYears, adult)!, today)!;
  return { from, to: today };
}

/** Number of days in a window, inclusive (≥ 1). */
export function windowDays(w: HistoryWindow): number {
  return Math.max(1, diffDays(w.to, w.from) + 1);
}

type Span = { from: ISODate; to?: ISODate | null };

function validSpan(e: Span): boolean {
  return isISODate(e.from) && (e.to == null || (isISODate(e.to) && e.to >= e.from));
}

/** Uncovered day ranges inside the window (open-ended entries run to the window end). */
export function findGaps(list: 'addresses' | 'activities', entries: Span[], w: HistoryWindow): Gap[] {
  const spans = entries
    .filter(validSpan)
    .map((e) => ({ from: maxDate(e.from, w.from)!, to: minDate(e.to ?? w.to, w.to)! }))
    .filter((s) => s.from <= s.to)
    .sort((a, b) => a.from.localeCompare(b.from));
  const gaps: Gap[] = [];
  const push = (from: ISODate, to: ISODate) => {
    if (from <= to) gaps.push({ list, from, to, days: diffDays(to, from) + 1 });
  };
  let cursor = w.from; // first day not yet known to be covered
  for (const s of spans) {
    if (s.from > cursor) push(cursor, addDays(s.from, -1));
    if (s.to >= cursor) cursor = addDays(s.to, 1);
  }
  push(cursor, w.to);
  return gaps;
}

/** Share of the window covered by entries (0–1). */
export function coverage(gaps: Gap[], w: HistoryWindow): number {
  const total = windowDays(w);
  const missing = gaps.reduce((s, g) => s + g.days, 0);
  return Math.max(0, Math.min(1, (total - missing) / total));
}

/** Overlapping address entries (activities may legitimately overlap, e.g. work + study).
 *  A one-day overlap (moving day) is normal and not reported. Two open-ended entries
 *  overlap up to OPEN_END. */
export function findOverlaps(list: 'addresses' | 'activities', entries: { id: string; from: ISODate; to?: ISODate | null }[]): Overlap[] {
  const v = entries.filter(validSpan).sort((a, b) => a.from.localeCompare(b.from) || a.id.localeCompare(b.id));
  const out: Overlap[] = [];
  for (let i = 0; i < v.length; i++) {
    for (let j = i + 1; j < v.length; j++) {
      const a = v[i];
      const b = v[j];
      const from = b.from; // sorted, so b starts no earlier than a
      const to = minDate(a.to ?? OPEN_END, b.to ?? OPEN_END)!;
      if (diffDays(to, from) + 1 >= 2) out.push({ list, aId: a.id, bId: b.id, from, to });
    }
  }
  return out;
}

/** English labels used in exports (IRCC forms are filled in English or French). */
export const ACTIVITY_LABEL_EN: Record<ActivityKind, string> = {
  work: 'Employed',
  self_employed: 'Self-employed',
  study: 'Student',
  unemployed: 'Unemployed',
  homemaker: 'Homemaker',
  retired: 'Retired',
  travel: 'Travelling',
  other: 'Other',
};

export const ACTIVITY_KINDS: ActivityKind[] = ['work', 'self_employed', 'study', 'unemployed', 'homemaker', 'retired', 'travel', 'other'];

const ym = (d: ISODate) => d.slice(0, 7);

/** Entries intersecting the window, newest first (current entries first among equal starts). */
export function entriesInWindow<T extends Span>(entries: T[], w: HistoryWindow): T[] {
  return entries
    .filter(validSpan)
    .filter((e) => e.from <= w.to && (e.to ?? OPEN_END) >= w.from)
    .sort((a, b) => b.from.localeCompare(a.from) || (b.to ?? OPEN_END).localeCompare(a.to ?? OPEN_END));
}

/** Header + rows (English) for the given list, as used by CSV and plain-text exports. */
export function historyRows(data: HistoryData, w: HistoryWindow, list: 'addresses' | 'activities'): string[][] {
  const country = (c?: string) => (c ? countryName(c, 'en') : '');
  if (list === 'addresses') {
    const rows = entriesInWindow(data.addresses, w).map((a) => [ym(a.from), a.to ? ym(a.to) : 'Present', a.street ?? '', a.city, a.region ?? '', a.postal ?? '', country(a.country)]);
    return [['From', 'To', 'Street', 'City', 'Province/State', 'Postal code', 'Country'], ...rows];
  }
  const rows = entriesInWindow(data.activities, w).map((a) => [
    ym(a.from), a.to ? ym(a.to) : 'Present', ACTIVITY_LABEL_EN[a.kind] ?? a.kind, a.title ?? '', a.organization ?? '', a.city ?? '', country(a.country), a.note ?? '',
  ]);
  return [['From', 'To', 'Activity', 'Title/Program', 'Employer/School', 'City', 'Country', 'Note'], ...rows];
}

function csvCell(v: string): string {
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** CSV (UTF-8) of entries inside the window, newest first, in the column order IRCC forms use. */
export function historyToCsv(data: HistoryData, w: HistoryWindow, list: 'addresses' | 'activities'): string {
  return historyRows(data, w, list).map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

/** Tab-separated plain text (pastes into spreadsheets and forms); tabs/newlines in cells become spaces. */
export function historyToText(data: HistoryData, w: HistoryWindow, list: 'addresses' | 'activities'): string {
  return historyRows(data, w, list).map((r) => r.map((c) => c.replace(/[\t\r\n]+/g, ' ')).join('\t')).join('\n');
}

export interface HistorySummary {
  window: HistoryWindow;
  addressGaps: Gap[];
  activityGaps: Gap[];
  addressCoverage: number;
  activityCoverage: number;
}

/** One-call summary for Home/Maple. */
export function historySummary(data: HistoryData, purpose: HistoryPurpose, today: ISODate): HistorySummary {
  const window = historyWindow(purpose, today, data.birthDate);
  const addressGaps = findGaps('addresses', data.addresses, window);
  const activityGaps = findGaps('activities', data.activities, window);
  return { window, addressGaps, activityGaps, addressCoverage: coverage(addressGaps, window), activityCoverage: coverage(activityGaps, window) };
}
