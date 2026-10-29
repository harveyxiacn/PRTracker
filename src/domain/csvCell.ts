// One CSV cell for every export (trips, history, absences). RFC 4180 quoting plus protection
// against formula injection: spreadsheet apps run a cell that starts with = + - @ (or a tab /
// carriage return before one) as a formula, e.g. =HYPERLINK(...) in a note from a shared file.

/** A plain number such as "-12" or "3.5" is data, not a formula, and stays as it is. */
const NUMBER = /^[+-]?\d+(\.\d+)?$/;
const FORMULA_START = /^[=+\-@\t\r]/;

/** Prefix a formula-like value with a single quote so spreadsheets show it as text. */
export function neutralizeFormula(v: string): string {
  return FORMULA_START.test(v) && !NUMBER.test(v) ? `'${v}` : v;
}

/** Escape one value for a CSV line. */
export function csvCell(v: string | number | null | undefined): string {
  const s = neutralizeFormula(v == null ? '' : String(v));
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Undo neutralizeFormula when reading our own CSV back in. */
export function restoreFormula(v: string): string {
  return /^'[=+\-@\t\r]/.test(v) ? v.slice(1) : v;
}
