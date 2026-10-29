// CBSA travel-history import: entries to Canada from a CBSA "Travel History Report" (requested
// free of charge under the Privacy Act through the ATIP online request service), plus exits where
// available, pasted as text and reconciled with logged trips. Parsed locally; the raw text is
// never stored.
//
// Facts (CBSA, verified 2026-10-16,
// https://www.cbsa-asfc.gc.ca/agency-agence/reports-rapports/pia-efvp/atip-aiprp/thr-rav-eng.html):
//  • The report lists entries, exits or both; each record has the date and the port of entry location.
//  • Kept 15 years. Exit data only when asked for: land exits to the US (foreign nationals from
//    2013-06-30, everyone from 2019-07-11), commercial air exits from 2020-06-25.
//  • So older trips, and trips by private boat/plane, may have entries without exits.
import { diffDays, isISODate, type ISODate } from './dates';
import type { Trip } from './types';

export interface CbsaEvent {
  date: ISODate;
  kind: 'entry' | 'exit';
  /** Port of entry / mode, if present (e.g. "YVR", "Peace Arch"). */
  place?: string;
  source: string; // original line (trimmed, max 120 chars) for review
}

export interface Reconciliation {
  /** Entries matched to a logged trip's return date (±1 day). */
  matched: { event: CbsaEvent; tripId: string }[];
  /** Entries with no logged trip returning that day: suggest a trip ending here. */
  unmatchedEntries: CbsaEvent[];
  /** Logged returns with no CBSA entry within ±1 day (CBSA may lack some land crossings). */
  tripsWithoutEntry: string[];
  /** Proposed trips built from exit→entry pairs or entry-only (departure unknown → null). */
  proposals: { departure: ISODate | null; return: ISODate; place?: string }[];
}

/** Where the user requests the report (CBSA "Travel history report" page). */
export const CBSA_HISTORY_URL = 'https://www.cbsa-asfc.gc.ca/agency-agence/reports-rapports/pia-efvp/atip-aiprp/thr-rav-eng.html';

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
  // French abbreviations (the report may come in French)
  janv: 1, fevr: 2, 'févr': 2, mars: 3, avr: 4, mai: 5, juin: 6, juil: 7, aout: 8, 'août': 8, 'déc': 12,
};

function monthNum(word: string): number | undefined {
  const w = word.toLowerCase().replace(/\.$/, '');
  if (MONTHS[w]) return MONTHS[w];
  // Full names: january, february, ..., septembre, décembre
  for (const len of [4, 3]) {
    const p = w.slice(0, len);
    if (w.length > len && MONTHS[p]) return MONTHS[p];
  }
  return undefined;
}

function iso(y: number, m: number, d: number): ISODate | undefined {
  const s = `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  return isISODate(s) ? s : undefined;
}

const MON = '([A-Za-zÀ-ÿ]{3,10})\\.?';
// Order matters: earlier alternatives win at the same position.
const DATE_RE = new RegExp(
  [
    '\\b(\\d{4})[-/.](\\d{1,2})[-/.](\\d{1,2})\\b', // 1-3: 2023-03-14, 2023/03/14
    `\\b(\\d{1,2})[- ]${MON}[- ,]+(\\d{4})\\b`, // 4-6: 14-MAR-2023, 14 March 2023
    `\\b${MON} (\\d{1,2}),? (\\d{4})\\b`, // 7-9: March 14, 2023
    '\\b(\\d{1,2})/(\\d{1,2})/(\\d{4})\\b', // 10-12: 14/03/2023 (only when unambiguous)
  ].join('|'),
  'g',
);

export interface DateHit { date: ISODate; index: number; end: number }

/** Every calendar date in a line, with its position. Ambiguous dd/mm vs mm/dd dates are skipped. */
export function findDates(line: string): DateHit[] {
  const hits: DateHit[] = [];
  DATE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = DATE_RE.exec(line))) {
    let date: ISODate | undefined;
    if (m[1]) date = iso(+m[1], +m[2], +m[3]);
    else if (m[4]) {
      const mo = monthNum(m[5]);
      if (mo) date = iso(+m[6], mo, +m[4]);
    } else if (m[7]) {
      const mo = monthNum(m[7]);
      if (mo) date = iso(+m[9], mo, +m[8]);
    } else if (m[10]) {
      const a = +m[10], b = +m[11];
      if (a > 12 && b <= 12) date = iso(+m[12], b, a);
      else if (b > 12 && a <= 12) date = iso(+m[12], a, b);
    }
    if (date) hits.push({ date, index: m.index, end: m.index + m[0].length });
  }
  return hits;
}

const EXIT_RE = /\b(exits?|exited|depart(ure|ed|s)?|left canada|outbound|sortie|départ)\b/i;
const ENTRY_RE = /\b(entry|entries|entr[ée]e?s?|arriv(al|ed|ée)|admitted|inbound|port of entry|point d'entr[ée]e|returned)\b/i;
// Header/identity lines whose dates are not crossings.
const SKIP_RE = /\b(birth|dob|naissance|printed|generated|request(ed)?|demande|report|rapport|page \d|issued|expir)/i;

const KNOWN_PORTS = [
  'Peace Arch', 'Pacific Highway', 'Douglas', 'Boundary Bay', 'Aldergrove', 'Huntingdon', 'Abbotsford', 'Osoyoos',
  'Coutts', 'Emerson', 'North Portal', 'Ambassador Bridge', 'Detroit-Windsor Tunnel', 'Windsor', 'Blue Water Bridge', 'Sarnia',
  'Peace Bridge', 'Fort Erie', 'Rainbow Bridge', 'Queenston', 'Lewiston', 'Niagara Falls', 'Thousand Islands', 'Lansdowne',
  'Prescott', 'Cornwall', 'Lacolle', 'St-Bernard-de-Lacolle', 'Stanstead', 'Saint-Armand', 'Philipsburg', 'St. Stephen',
  'Woodstock', 'Edmundston', 'Sault Ste. Marie', 'Fort Frances', 'Pearson', 'Trudeau',
];

function extractPlace(text: string): string | undefined {
  const port = /\b(?:port of entry|port|poe|location|point d'entr[ée]e|bureau)\s*[:\-–]\s*([^|;\t]+?)(?:\s{2,}|\s*[|;\t]|$)/i.exec(text);
  if (port) {
    const v = port[1].replace(/^[\d\s\-–]+/, '').trim();
    if (v) return clean(v);
  }
  const code = /\b(Y[A-Z]{2})\b/.exec(text);
  if (code) return code[1];
  const lower = text.toLowerCase();
  for (const p of KNOWN_PORTS) if (lower.includes(p.toLowerCase())) return p;
  const rest = text.replace(new RegExp(EXIT_RE.source, 'gi'), ' ').replace(new RegExp(ENTRY_RE.source, 'gi'), ' ').replace(/\b(air|land|marine|rail|highway mode)\b/gi, ' ');
  // Word lengths are bounded so a very long token can't make this quadratic.
  const named = /([a-zà-ÿ][\w'.-]{0,40}(?:\s+[a-zà-ÿ][\w'.-]{0,40}){0,3}\s+(?:int'?l|international|airport|bridge|crossing|tunnel|ferry)(?:\s+airport)?)\b/i.exec(rest);
  if (named) return clean(named[1]);
  return undefined;
}

/** Input caps for parseCbsaText (64 KB in total, 500 characters per line). */
export const MAX_CBSA_CHARS = 64 * 1024;
export const MAX_CBSA_LINE = 500;

function clean(s: string): string {
  return s.replace(/\s+/g, ' ').trim().slice(0, 40);
}

function classify(text: string): 'entry' | 'exit' | undefined {
  if (EXIT_RE.test(text)) return 'exit';
  if (ENTRY_RE.test(text)) return 'entry';
  return undefined;
}

/**
 * Parse pasted report text (PDF copy, table, CSV). One event per date found; a line with several
 * dates is split into segments. Lines are classified by keywords, else by the most recent section
 * heading ("Entries" / "Exits"), else as entries (the default report lists entries).
 * Same-day duplicates of the same kind are merged. Result is sorted by date.
 */
export function parseCbsaText(text: string): CbsaEvent[] {
  const out = new Map<string, CbsaEvent>();
  let section: 'entry' | 'exit' | undefined = undefined;
  // Bounded work on any paste: a real report line is well under 500 characters.
  for (const raw of text.slice(0, MAX_CBSA_CHARS).split(/\r?\n/)) {
    const line = raw.slice(0, MAX_CBSA_LINE).replace(/\s+$/, '');
    const trimmed = line.trim();
    if (!trimmed) continue;
    const hits = findDates(line);
    if (!hits.length) {
      // A heading that names exactly one kind switches the section (column headers name both).
      const ex = EXIT_RE.test(trimmed), en = ENTRY_RE.test(trimmed);
      if (ex !== en && trimmed.length <= 60) section = ex ? 'exit' : 'entry';
      continue;
    }
    if (SKIP_RE.test(trimmed)) continue;
    const source = trimmed.slice(0, 120);
    // Keywords may precede the date ("Departed 2023-03-01") or follow it ("2023-03-01 Exit").
    const before = classify(line.slice(0, hits[0].index)) !== undefined;
    hits.forEach((h, i) => {
      const next = i + 1 < hits.length ? hits[i + 1].index : line.length;
      const after = line.slice(h.end, next);
      const kindText = hits.length === 1 ? line : before ? line.slice(i ? hits[i - 1].end : 0, h.index) : after;
      const kind = classify(kindText) ?? section ?? 'entry';
      const place = extractPlace(after) ?? (hits.length === 1 ? extractPlace(line.slice(0, h.index)) : undefined);
      const key = `${h.date}|${kind}`;
      const prev = out.get(key);
      if (!prev) out.set(key, { date: h.date, kind, ...(place ? { place } : {}), source });
      else if (!prev.place && place) out.set(key, { ...prev, place });
    });
  }
  return [...out.values()].sort((a, b) => a.date.localeCompare(b.date) || (a.kind === 'exit' ? -1 : 1));
}

/** Greedy one-to-one matching of events to trip dates within ±1 day, closest first. */
function pairUp(events: CbsaEvent[], trips: Trip[], dateOf: (t: Trip) => ISODate | null | undefined): Map<CbsaEvent, string> {
  const pairs: { e: CbsaEvent; id: string; dist: number }[] = [];
  for (const e of events)
    for (const t of trips) {
      const d = dateOf(t);
      if (!d || !isISODate(d)) continue;
      const dist = Math.abs(diffDays(e.date, d));
      if (dist <= 1) pairs.push({ e, id: t.id, dist });
    }
  pairs.sort((a, b) => a.dist - b.dist || a.e.date.localeCompare(b.e.date));
  const byEvent = new Map<CbsaEvent, string>();
  const usedTrips = new Set<string>();
  for (const p of pairs) {
    if (byEvent.has(p.e) || usedTrips.has(p.id)) continue;
    byEvent.set(p.e, p.id);
    usedTrips.add(p.id);
  }
  return byEvent;
}

/**
 * Reconcile parsed events with logged trips.
 * - Entries ↔ trip returns, exits ↔ trip departures (±1 day, one-to-one).
 * - Each unmatched entry becomes a proposal; its departure is the latest unmatched exit on or
 *   before it and not before the previous entry, else null (user fills it in).
 * - Trips without entry: logged returns inside the report's date range with no entry ±1 day.
 */
export function reconcile(events: CbsaEvent[], trips: Trip[]): Reconciliation {
  const sorted = [...events].sort((a, b) => a.date.localeCompare(b.date));
  const entries = sorted.filter((e) => e.kind === 'entry');
  const exits = sorted.filter((e) => e.kind === 'exit');
  const entryMatch = pairUp(entries, trips, (t) => t.return);
  const exitMatch = pairUp(exits, trips, (t) => t.departure);

  const matched: Reconciliation['matched'] = [];
  const unmatchedEntries: CbsaEvent[] = [];
  for (const e of entries) {
    const id = entryMatch.get(e);
    if (id) matched.push({ event: e, tripId: id });
    else unmatchedEntries.push(e);
  }

  const freeExits = exits.filter((e) => !exitMatch.has(e));
  const usedExits = new Set<CbsaEvent>();
  const proposals: Reconciliation['proposals'] = [];
  for (const e of unmatchedEntries) {
    const idx = entries.indexOf(e);
    const prevEntry = idx > 0 ? entries[idx - 1].date : undefined;
    let dep: CbsaEvent | undefined;
    for (const x of freeExits) {
      if (usedExits.has(x) || x.date > e.date) continue;
      if (prevEntry && x.date < prevEntry) continue;
      if (!dep || x.date > dep.date) dep = x;
    }
    if (dep) usedExits.add(dep);
    proposals.push({ departure: dep?.date ?? null, return: e.date, ...(e.place ? { place: e.place } : {}) });
  }

  // Only meaningful when the report has entries (an exits-only paste would flag every trip).
  const tripsWithoutEntry: string[] = [];
  if (entries.length) {
    const first = sorted[0].date, last = sorted[sorted.length - 1].date;
    const matchedTrips = new Set(entryMatch.values());
    for (const t of trips) {
      if (!t.return || !isISODate(t.return) || matchedTrips.has(t.id)) continue;
      if (diffDays(t.return, first) < -1 || diffDays(t.return, last) > 1) continue;
      tripsWithoutEntry.push(t.id);
    }
  }
  return { matched, unmatchedEntries, tripsWithoutEntry, proposals };
}
