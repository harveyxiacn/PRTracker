// Trip CSV import/export. Accepts columns departure,return[,destination,note] in any order
// (header required). Dates must be YYYY-MM-DD; a blank return means still abroad.
import { isISODate } from '../domain/dates';
import { uid, type Trip } from '../domain/types';

export function tripsToCsv(trips: Trip[]): string {
  const esc = (s = '') => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const rows = [...trips]
    .sort((a, b) => a.departure.localeCompare(b.departure))
    .map((t) => [t.departure, t.return ?? '', esc(t.destination), esc(t.purpose), esc(t.note)].join(','));
  return ['departure,return,destination,purpose,note', ...rows].join('\n') + '\n';
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') {
      out.push(cur);
      cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

export function csvToTrips(text: string): { trips: Trip[]; errors: number[] } {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return { trips: [], errors: [] };
  const header = splitCsvLine(lines[0]).map((h) => h.toLowerCase());
  const col = (names: string[]) => header.findIndex((h) => names.includes(h));
  const iDep = col(['departure', 'depart', 'left', 'from', 'exit']);
  const iRet = col(['return', 'returned', 'back', 'to', 'entry']);
  const iDest = col(['destination', 'country', 'place']);
  const iPurpose = col(['purpose', 'reason']);
  const iNote = col(['note', 'notes', 'comment']);
  const trips: Trip[] = [];
  const errors: number[] = [];
  lines.slice(1).forEach((line, n) => {
    const c = splitCsvLine(line);
    const dep = c[iDep];
    const ret = iRet >= 0 ? c[iRet] : '';
    if (!isISODate(dep) || (ret && !isISODate(ret))) {
      errors.push(n + 2);
      return;
    }
    const purpose = iPurpose >= 0 ? (c[iPurpose] as Trip['purpose']) : undefined;
    trips.push({
      id: uid(),
      departure: dep,
      return: ret || null,
      destination: iDest >= 0 ? c[iDest] || undefined : undefined,
      purpose: purpose && ['vacation', 'family', 'work', 'study', 'other'].includes(purpose) ? purpose : undefined,
      note: iNote >= 0 ? c[iNote] || undefined : undefined,
    });
  });
  return { trips, errors };
}
