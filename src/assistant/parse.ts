// Tiny bilingual (English / 中文) parser for dates and durations in assistant questions.
import { addDays, addMonths, isISODate, type ISODate } from '../domain/dates';

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6,
  jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11,
  november: 11, dec: 12, december: 12,
};

const CN_DIGITS: Record<string, number> = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };

/** Convert simple Chinese numerals (一 … 九十九) to Arabic digits inside a string. */
export function normalizeChineseNumbers(s: string): string {
  return s.replace(/[零〇一二两三四五六七八九十]+/g, (m) => {
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
}

/** Find all dates mentioned in the text, in order of appearance. */
export function findDates(input: string, today: ISODate, prefer: Prefer = 'future'): FoundDate[] {
  const text = normalizeChineseNumbers(input.toLowerCase());
  const found: FoundDate[] = [];
  const push = (date: ISODate | null, index: number) => {
    if (date && !found.some((f) => f.index === index)) found.push({ date, index });
  };
  let m: RegExpExecArray | null;

  const iso = /(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/g;
  while ((m = iso.exec(text))) push(mk(+m[1], +m[2], +m[3]), m.index);

  const cn = /(?:(\d{4})\s*年\s*)?(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]?/g;
  while ((m = cn.exec(text))) push(withYear(+m[2], +m[3], today, m[1] ? +m[1] : undefined, prefer), m.index);

  const monthNames = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join('|');
  const md = new RegExp(`\\b(${monthNames})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s*(\\d{4}))?`, 'g');
  while ((m = md.exec(text))) push(withYear(MONTHS[m[1]], +m[2], today, m[3] ? +m[3] : undefined, prefer), m.index);
  const dm = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${monthNames})\\.?(?:,?\\s*(\\d{4}))?`, 'g');
  while ((m = dm.exec(text))) push(withYear(MONTHS[m[2]], +m[1], today, m[3] ? +m[3] : undefined, prefer), m.index);

  const rel: [RegExp, number | 'nextMonth'][] = [
    [/\btoday\b|今天/g, 0],
    [/\btomorrow\b|明天/g, 1],
    [/\byesterday\b|昨天/g, -1],
    [/\bnext week\b|下周|下星期/g, 7],
    [/\bnext month\b|下个月/g, 'nextMonth'],
  ];
  for (const [re, off] of rel) {
    while ((m = re.exec(text))) {
      push(off === 'nextMonth' ? addMonths(today, 1).slice(0, 8) + '01' : addDays(today, off), m.index);
    }
  }
  return found.sort((a, b) => a.index - b.index);
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
  const text = stripDates(normalizeChineseNumbers(input.toLowerCase()));
  if (/半年|half a year|six months/.test(text)) return 182;
  if (/一年|a year\b|one year/.test(input.toLowerCase())) return 365;
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
  const m = /\b(20\d{2})\b|(20\d{2})\s*年/.exec(input);
  return m ? Number(m[1] ?? m[2]) : null;
}
