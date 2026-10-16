// Tiny bilingual (English / 中文) parser for dates and durations in assistant questions.
import { addDays, addMonths, isISODate, type ISODate } from '../domain/dates';
import { activeLocales, lexRelative, lexUnits } from './lexicon';

/** Arabic-Indic, Persian, Devanagari, Gurmukhi and full-width digits -> ASCII. */
export function normalizeDigits(s: string): string {
  return s.replace(/[\u0660-\u0669\u06f0-\u06f9\u0966-\u096f\u0a66-\u0a6f\uff10-\uff19]/g, (c) => {
    const code = c.charCodeAt(0);
    for (const base of [0x0660, 0x06f0, 0x0966, 0x0a66, 0xff10]) if (code >= base && code <= base + 9) return String(code - base);
    return c;
  });
}

const escapeRe = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Month names (long and short) for the active UI locales, lower-cased -> month number. */
function localeMonths(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const loc of activeLocales()) {
    for (const style of ['long', 'short'] as const) {
      try {
        const f = new Intl.DateTimeFormat(loc, { month: style, timeZone: 'UTC' });
        for (let m = 1; m <= 12; m++) {
          const name = f.format(new Date(Date.UTC(2001, m - 1, 15))).toLowerCase().replace(/\.$/, '');
          if (name && !/^\d+$/.test(name) && name.length >= 3) out[name] = m;
        }
      } catch {
        /* unsupported locale */
      }
    }
  }
  return out;
}

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6,
  jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11,
  november: 11, dec: 12, december: 12,
};

const CN_DIGITS: Record<string, number> = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 兩: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };

/** Convert simple Chinese numerals (一 … 九十九) to Arabic digits inside a string. */
export function normalizeChineseNumbers(s: string): string {
  return s.replace(/[零〇一二两兩三四五六七八九十]+/g, (m) => {
    if (!m.includes('十')) {
      // e.g. 二〇二七 -> 2027 (digit by digit); single digits too
      return m.split('').map((c) => CN_DIGITS[c] ?? '').join('');
    }
    const [tens, ones] = m.split('十');
    const t = tens === '' ? 1 : CN_DIGITS[tens] ?? 0;
    const o = ones === '' || ones === undefined ? 0 : CN_DIGITS[ones] ?? 0;
    return String(t * 10 + o);
  });
}

const pad = (n: number) => String(n).padStart(2, '0');

function mk(y: number, m: number, d: number): ISODate | null {
  const iso = `${y}-${pad(m)}-${pad(d)}`;
  return isISODate(iso) ? iso : null;
}

export type Prefer = 'future' | 'past';

/** If no year is given, pick the next occurrence on/after today (or the latest on/before it). */
function withYear(m: number, d: number, today: ISODate, year: number | undefined, prefer: Prefer): ISODate | null {
  if (year) return mk(year, m, d);
  const y = Number(today.slice(0, 4));
  const cand = mk(y, m, d);
  if (prefer === 'past') return cand && cand <= today ? cand : mk(y - 1, m, d);
  if (cand && cand >= today) return cand;
  return mk(y + 1, m, d);
}

export interface FoundDate {
  date: ISODate;
  index: number;
  /** False when the year was inferred ("June 1"). */
  explicitYear: boolean;
}

/** Find all dates mentioned in the text, in order of appearance. */
export function findDates(input: string, today: ISODate, prefer: Prefer = 'future'): FoundDate[] {
  const text = normalizeChineseNumbers(normalizeDigits(input.toLowerCase()));
  const found: FoundDate[] = [];
  const push = (date: ISODate | null, index: number, explicitYear = true) => {
    if (date && !found.some((f) => f.index === index)) found.push({ date, index, explicitYear });
  };
  let m: RegExpExecArray | null;

  const iso = /(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/g;
  while ((m = iso.exec(text))) push(mk(+m[1], +m[2], +m[3]), m.index);

  const cn = /(?:(\d{4})\s*年\s*)?(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]?/g;
  while ((m = cn.exec(text))) push(withYear(+m[2], +m[3], today, m[1] ? +m[1] : undefined, prefer), m.index, !!m[1]);

  // Korean "2027년 3월 5일" / "3월 5일", Vietnamese "5 tháng 3 năm 2027" / "ngày 5 tháng 3".
  const ko = /(?:(\d{4})\s*년\s*)?(\d{1,2})\s*월\s*(\d{1,2})\s*일/g;
  while ((m = ko.exec(text))) push(withYear(+m[2], +m[3], today, m[1] ? +m[1] : undefined, prefer), m.index, !!m[1]);
  const vi = /(?:ngày\s*)?(\d{1,2})\s*tháng\s*(\d{1,2})(?:\s*(?:năm|,)?\s*(\d{4}))?/g;
  while ((m = vi.exec(text))) push(withYear(+m[2], +m[1], today, m[3] ? +m[3] : undefined, prefer), m.index, !!m[3]);

  const allMonths: Record<string, number> = { ...localeMonths(), ...MONTHS };
  const monthNames = Object.keys(allMonths).sort((a, b) => b.length - a.length).map(escapeRe).join('|');
  // "March 2028" -> the 1st of that month.
  const my = new RegExp(`(?<![\\p{L}])(${monthNames})\\.?,?\\s+(\\d{4})(?!\\d)`, 'gu');
  while ((m = my.exec(text))) push(mk(+m[2], allMonths[m[1]], 1), m.index);
  const md = new RegExp(`(?<![\\p{L}])(${monthNames})\\.?\\s+(\\d{1,2})(?!\\d)(?:st|nd|rd|th)?(?:,?\\s*(\\d{4}))?`, 'gu');
  while ((m = md.exec(text))) push(withYear(allMonths[m[1]], +m[2], today, m[3] ? +m[3] : undefined, prefer), m.index, !!m[3]);
  // "5 March 2027", "5 de marzo de 2027", "5 mars 2027"
  const dm = new RegExp(`(?<![\\d])(\\d{1,2})(?:st|nd|rd|th|er|º)?\\.?\\s+(?:de\\s+)?(${monthNames})\\.?(?:,?\\s*(?:de\\s+)?(\\d{4}))?`, 'gu');
  while ((m = dm.exec(text))) push(withYear(allMonths[m[2]], +m[1], today, m[3] ? +m[3] : undefined, prefer), m.index, !!m[3]);

  const lr = lexRelative();
  const alt = (base: string, extra: string[]) => new RegExp([base, ...extra.map(escapeRe)].join('|'), 'g');
  const rel: [RegExp, number | 'nextMonth'][] = [
    [alt('\\btoday\\b|今天', lr.today), 0],
    [alt('\\btomorrow\\b|明天', lr.tomorrow), 1],
    [alt('\\byesterday\\b|昨天', lr.yesterday), -1],
    [/\bnext week\b|下周|下週|下星期|下禮拜/g, 7],
    [alt('\\bnext month\\b|下个月', lr.nextMonth), 'nextMonth'],
  ];
  for (const [re, off] of rel) {
    while ((m = re.exec(text))) {
      push(off === 'nextMonth' ? addMonths(today, 1).slice(0, 8) + '01' : addDays(today, off), m.index);
    }
  }
  found.sort((a, b) => a.index - b.index);
  // Ranges: a later date without a year comes after the earlier one
  // ("Oct 1 to Oct 30" -> same year; "Dec 20 to Jan 10" -> January of the next year).
  for (let i = 1; i < found.length; i++) {
    const f = found[i];
    for (let guard = 0; !f.explicitYear && f.date < found[i - 1].date && guard < 3; guard++) f.date = addMonths(f.date, 12);
  }
  return found;
}

/** Duration in days, e.g. "3 months", "2 weeks", "45 days", "两个月", "10天", "半年". */
/** Remove date expressions so their digits ("3月5日", "2027-03-01") aren't read as durations. */
function stripDates(text: string): string {
  return text
    .replace(/\d{4}[-/.]\d{1,2}[-/.]\d{1,2}/g, ' ')
    .replace(/(?:\d{4}\s*年\s*)?\d{1,2}\s*月\s*\d{1,2}\s*[日号]?/g, ' ')
    .replace(/\d{4}\s*年/g, ' ');
}

export function findDuration(input: string): number | null {
  const text = stripDates(normalizeChineseNumbers(normalizeDigits(input.toLowerCase())));
  // Units from other languages' lexicons ("3 meses", "2 semaines", "3개월"…).
  const lu = lexUnits();
  for (const [unit, mult] of [['month', 30.44], ['week', 7], ['year', 365.25], ['day', 1]] as const) {
    if (!lu[unit].length) continue;
    // A Latin unit must end the word, so "5 de mayo" is not "5 d(ays)" (CJK units may be followed by text).
    const re = new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*(?:${lu[unit].map(escapeRe).join('|')})(?![\\p{Script=Latin}])`, 'u');
    const lm = re.exec(text);
    if (lm) return Math.round(Number(lm[1].replace(',', '.')) * mult);
  }
  // (Chinese numerals are already digits here: 一年半 -> 1年半.)
  if (/1\s*年半|year and a half|1\.5 years/.test(text)) return 548;
  if (/半年|half a year|six months/.test(text)) return 182;
  if (/半个月|半個月|two weeks|a fortnight/.test(text)) return 14;
  if (/一年|\b(a|one) year\b/.test(text) && !/\d\s*(years?|年)/.test(text)) return 365;
  if (/\b(a|one) month\b|一个月|一個月/.test(text)) return 30;
  if (/\b(a|one) week\b|一周|一週|一个星期|一個星期/.test(text)) return 7;
  const m = /(\d+(?:\.\d+)?)\s*(?:more\s+|other\s+)?(days?\b|天|日|weeks?\b|wks?\b|周|星期|个?礼拜|months?\b|mos?\b|个月|月|years?\b|yrs?\b|年)/.exec(text);
  if (!m) return null;
  const n = Number(m[1]);
  const u = m[2];
  if (/^(day|天|日)/.test(u)) return Math.round(n);
  if (/^(week|wk|周|星期|礼拜|个礼拜)/.test(u)) return Math.round(n * 7);
  if (/^(month|mo|个月|月)/.test(u)) return Math.round(n * 30.44);
  return Math.round(n * 365.25);
}

export function findYear(input: string): number | null {
  const m = /\b(20\d{2})\b|(20\d{2})\s*[年년]/.exec(normalizeDigits(input));
  return m ? Number(m[1] ?? m[2]) : null;
}
