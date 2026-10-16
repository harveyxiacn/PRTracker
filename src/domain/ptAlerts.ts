// CONTRACT (v0.7): alerts when IRCC's published processing time changes for something the user
// tracks (their applications' programs/countries). Owner: community-2 agent.
//
// Series keys follow public/data/ircc-history.json (src/data/trendsCore.ts → snapshotValues):
// a program's `irccTimeKey` ("pr_card", "work_ext"…) or `<countrySeries>:<COUNTRY>`
// ("work:IN", "visitor-outside-canada:PH") for programs IRCC publishes per country.
import type { TrendsData } from '../data/trends';
import { program } from './programs';
import { FINAL_MILESTONE } from './timeline';
import type { Application } from './types';

export interface PtChange {
  series: string; // e.g. "pr_card", "work:IN"
  from: number;
  to: number;
  date: string; // date of the new value
}

/** Not archived and the final milestone not reached yet. */
export function isActiveApplication(app: Application): boolean {
  if (app.archived) return false;
  const final = FINAL_MILESTONE[app.kind] ?? 'decision';
  return !app.milestones.some((m) => m.key === final && !!m.date);
}

/** The trend series key for one application, if IRCC publishes one. */
export function seriesFor(app: Application): string | undefined {
  const p = program(app.kind);
  const cc = app.country?.trim().toUpperCase();
  if (p.countrySeries && cc && /^[A-Z]{2}$/.test(cc)) return `${p.countrySeries}:${cc}`;
  return p.irccTimeKey;
}

/** Series keys relevant to the user's active applications. */
export function relevantSeries(apps: Application[]): string[] {
  const out: string[] = [];
  for (const a of apps) {
    if (!isActiveApplication(a)) continue;
    const key = seriesFor(a);
    if (key && !out.includes(key)) out.push(key);
  }
  return out;
}

/** Changes in relevant series after `sinceDate` (latest change per series). */
export function processingChanges(trends: TrendsData, apps: Application[], sinceDate: string): PtChange[] {
  const out: PtChange[] = [];
  for (const series of relevantSeries(apps)) {
    const pts = trends.series[series] ?? [];
    // Walk back from the newest point; refresh points (same value re-recorded) are not changes.
    for (let i = pts.length - 1; i >= 1 && pts[i].date > sinceDate; i--) {
      if (pts[i].days !== pts[i - 1].days) {
        out.push({ series, from: pts[i - 1].days, to: pts[i].days, date: pts[i].date });
        break;
      }
    }
  }
  // Newest first; ties keep the order of the user's applications (stable sort).
  return out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}
