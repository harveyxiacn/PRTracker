// Calendar-date helpers. All rules work on whole days, so dates are ISO strings
// ("YYYY-MM-DD") and arithmetic uses UTC day numbers to avoid DST/timezone drift.

export type ISODate = string;

const MS_PER_DAY = 86_400_000;
const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isISODate(s: unknown): s is ISODate {
  if (typeof s !== 'string') return false;
  const m = ISO_RE.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

/** Day number: days since 1970-01-01 (UTC). */
export function toDay(iso: ISODate): number {
  const m = ISO_RE.exec(iso);
  if (!m) throw new Error(`Invalid date: ${iso}`);
  return Math.floor(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / MS_PER_DAY);
}

export function fromDay(day: number): ISODate {
  const d = new Date(day * MS_PER_DAY);
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
  const da = String(d.getUTCDate()).padStart(2, '0');
  return `${String(y).padStart(4, '0')}-${mo}-${da}`;
}

/** Today's date in the device's local timezone. */
export function todayISO(now: Date = new Date()): ISODate {
  const y = now.getFullYear();
  const mo = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${mo}-${d}`;
}

export function addDays(iso: ISODate, n: number): ISODate {
  return fromDay(toDay(iso) + n);
}

export function diffDays(a: ISODate, b: ISODate): number {
  return toDay(a) - toDay(b);
}

/**
 * Add calendar years/months, clamping to the end of the month
 * (2024-02-29 + 1 year -> 2025-02-28).
 */
export function addMonths(iso: ISODate, months: number): ISODate {
  const m = ISO_RE.exec(iso);
  if (!m) throw new Error(`Invalid date: ${iso}`);
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1 + months;
  const targetY = y + Math.floor(mo / 12);
  const targetM = ((mo % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetY, targetM + 1, 0)).getUTCDate();
  const d = Math.min(Number(m[3]), lastDay);
  return fromDay(Math.floor(Date.UTC(targetY, targetM, d) / MS_PER_DAY));
}

export function addYears(iso: ISODate, years: number): ISODate {
  return addMonths(iso, years * 12);
}

export function minDate(...ds: (ISODate | null | undefined)[]): ISODate | undefined {
  const v = ds.filter((d): d is ISODate => !!d);
  return v.length ? v.reduce((a, b) => (a < b ? a : b)) : undefined;
}

export function maxDate(...ds: (ISODate | null | undefined)[]): ISODate | undefined {
  const v = ds.filter((d): d is ISODate => !!d);
  return v.length ? v.reduce((a, b) => (a > b ? a : b)) : undefined;
}

export function yearOf(iso: ISODate): number {
  return Number(iso.slice(0, 4));
}

/** Monday=0 … Sunday=6 */
export function weekdayMon0(iso: ISODate): number {
  return (new Date(toDay(iso) * MS_PER_DAY).getUTCDay() + 6) % 7;
}

export function daysInYear(y: number): number {
  return toDay(`${y + 1}-01-01`) - toDay(`${y}-01-01`);
}
