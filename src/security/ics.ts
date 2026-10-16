// iCalendar (RFC 5545) export so reminders and trips can be added to Google/Apple calendars.
import { addDays, diffDays, isISODate } from '../domain/dates';
import type { Reminder } from '../domain/insights';
import type { Trip } from '../domain/types';

export type IcsEvent = {
  uid: string;
  date: string;
  endDate?: string;
  title: string;
  description?: string;
  /** Add a DISPLAY alarm at 09:00 local on the start day. */
  alarm?: boolean;
};
type Translate = (k: string, v?: Record<string, string | number>) => string;

export const ICS_PRODID = '-//PR Tracker//EN';
const CRLF = '\r\n';

/** Escape TEXT values (RFC 5545 §3.3.11): backslash, semicolon, comma, newline. */
export function escapeText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r\n|\r|\n/g, '\\n');
}

const utf8Len = (cp: number) => (cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4);

/** Fold a content line to at most 75 octets per physical line without splitting a UTF-8 sequence (§3.1). */
export function foldLine(line: string): string {
  const out: string[] = [];
  let cur = '';
  let octets = 0;
  let limit = 75;
  for (const ch of line) {
    const n = utf8Len(ch.codePointAt(0)!);
    if (octets + n > limit) {
      out.push(cur);
      cur = '';
      octets = 0;
      limit = 74; // continuation lines start with one space
    }
    cur += ch;
    octets += n;
  }
  out.push(cur);
  return out.join(CRLF + ' ');
}

const icsDate = (iso: string) => iso.replace(/-/g, '');
export function icsStamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}
const safeUid = (u: string) => u.replace(/[\r\n]/g, '');

/** Same as buildIcs with an explicit DTSTAMP time (for deterministic tests). */
export function buildIcsAt(events: IcsEvent[], now: Date, prodId: string = ICS_PRODID): string {
  const stamp = icsStamp(now);
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', `PRODID:${prodId}`, 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  for (const e of events) {
    if (!isISODate(e.date)) continue;
    const last = e.endDate && isISODate(e.endDate) && e.endDate >= e.date ? e.endDate : e.date;
    lines.push(
      'BEGIN:VEVENT',
      `UID:${safeUid(e.uid)}@pr-tracker`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${icsDate(e.date)}`,
      `DTEND;VALUE=DATE:${icsDate(addDays(last, 1))}`,
      `SUMMARY:${escapeText(e.title)}`,
    );
    if (e.description) lines.push(`DESCRIPTION:${escapeText(e.description)}`);
    lines.push('TRANSP:TRANSPARENT');
    if (e.alarm) lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${escapeText(e.title)}`, 'TRIGGER;RELATED=START:PT9H', 'END:VALARM');
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join(CRLF) + CRLF;
}

/** RFC 5545 VCALENDAR with all-day VEVENTs (stable UIDs, CRLF line endings, folded lines, escaped text). */
export function buildIcs(events: IcsEvent[], prodId?: string): string {
  return buildIcsAt(events, new Date(), prodId);
}

/** Helpers mapping app data to events; `t` translates i18n keys. */
export function remindersToEvents(reminders: Reminder[], t: Translate): IcsEvent[] {
  return reminders.map((r) => ({ uid: `rem-${r.id}`, date: r.date, title: t(r.title, r.vars), description: t(r.body, r.vars), alarm: true }));
}

export function tripsToEvents(trips: Trip[], today: string, t: Translate): IcsEvent[] {
  return trips
    .filter((tr) => isISODate(tr.departure))
    .map((tr) => {
      const ongoing = !isISODate(tr.return);
      const end = ongoing ? (today > tr.departure ? today : tr.departure) : (tr.return as string);
      const last = end >= tr.departure ? end : tr.departure;
      const days = diffDays(last, tr.departure) + 1;
      const dest = tr.destination?.trim() || t('sec.icsAbroad');
      return {
        uid: `trip-${tr.id}`,
        date: tr.departure,
        endDate: last,
        title: t('sec.icsTripTitle', { dest }),
        description: ongoing
          ? t('sec.icsTripOngoing', { from: tr.departure, today: last, days })
          : t('sec.icsTripDesc', { from: tr.departure, to: last, days }),
      };
    });
}
