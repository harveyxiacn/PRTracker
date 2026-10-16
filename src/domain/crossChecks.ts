// Smart cross-checks between documents, applications, trips and dates.
// Returns tips the lead shows on Home (same shape as assistant/tips.ts proactiveTips).
// Each check runs only when the data it needs is present. Dates in `vars` are ISO; the UI
// formats them. i18n keys: `xc.<id>` (src/i18n/parts/cbsa.ts).
//
// Rules used:
//  • Language results must be < 2 years old when the Express Entry application is submitted
//    (documents.ts VALIDITY_MONTHS.language_test).
//  • Passport: valid through the whole trip (+30 days margin); many countries ask for 6 months
//    of validity on arrival.
//  • PR card: needed to board a flight back to Canada; otherwise a PR Travel Document (PRTD).
//  • Medical exam: generally valid 12 months.
//  • Permits: apply to extend before expiry (maintained status); BOWP for some PR applicants.
//  • Citizenship: tax filing for 3 of the 5 years before applying.
import { addDays, addMonths, addYears, diffDays, type ISODate } from './dates';
import { effectiveExpiry, type DocItem, type DocKind } from './documents';
import type { Insights } from './insights';
import { program, type ProgramCategory } from './programs';
import type { AppData, Application, Trip } from './types';

export interface CrossCheck {
  key: string; // i18n key `xc.<id>`
  vars?: Record<string, string | number>;
  severity: 'info' | 'warn' | 'critical';
}

/** Program categories that lead to permanent residence. */
const PR_CATEGORIES: ProgramCategory[] = ['express_entry', 'pnp', 'quebec', 'pilots', 'family', 'humanitarian'];

const isMine = (d: DocItem) => !d.holder || d.holder.trim().toLowerCase() === 'me';

/** Latest effective expiry among the user's own documents of these kinds. */
function latestExpiry(items: DocItem[], kinds: DocKind[]): ISODate | undefined {
  let best: ISODate | undefined;
  for (const d of items) {
    if (!kinds.includes(d.kind) || !isMine(d)) continue;
    const e = effectiveExpiry(d);
    if (e && (!best || e > best)) best = e;
  }
  return best;
}

function milestoneDate(a: Application, key: string): ISODate | undefined {
  return a.milestones.find((m) => m.key === key && m.date)?.date ?? undefined;
}

/** Date the application was submitted (field, else the 'submitted' milestone). */
export function submittedDate(a: Application): ISODate | undefined {
  return a.submitted || milestoneDate(a, 'submitted');
}

function isLanded(a: Application, today: ISODate): boolean {
  const l = milestoneDate(a, 'landed');
  return !!l && l <= today;
}

const isEe = (a: Application) => a.kind.startsWith('ee_') || a.kind === 'pnp_ee';

const ORDER = { critical: 0, warn: 1, info: 2 } as const;

export function crossChecks(data: AppData, insights: Insights): CrossCheck[] {
  const today = insights.today;
  const out: CrossCheck[] = [];
  const docs = data.documents?.items ?? [];
  const apps = data.applications.filter((a) => !a.archived);
  const isPr = !!data.profile.prDate && data.profile.prDate <= today;
  const prInProgress = !isPr && apps.some((a) => PR_CATEGORIES.includes(program(a.kind).category) && !isLanded(a, today));

  // 1. Language test vs Express Entry application.
  const lang = latestExpiry(docs, ['language_test']);
  const eeApps = apps.filter((a) => isEe(a) && !isLanded(a, today));
  if (lang && eeApps.length) {
    const submittedLate = eeApps
      .map((a) => submittedDate(a))
      .find((s): s is ISODate => !!s && lang < s);
    const pending = eeApps.some((a) => !submittedDate(a));
    if (submittedLate) out.push({ key: 'xc.langAtSubmission', severity: 'critical', vars: { date: lang, submitted: submittedLate } });
    else if (pending && lang < today) out.push({ key: 'xc.langExpired', severity: 'critical', vars: { date: lang } });
    else if (pending && diffDays(lang, today) <= 60) out.push({ key: 'xc.langSoon', severity: 'warn', vars: { date: lang, days: diffDays(lang, today) } });
  }

  // 2. Passport vs planned trips (first trip with a problem; critical beats warn).
  const passport = latestExpiry(docs, ['passport']);
  const planned = data.trips
    .filter((t) => t.departure > today)
    .sort((a, b) => a.departure.localeCompare(b.departure));
  if (passport && planned.length) {
    const end = (t: Trip) => t.return || t.departure;
    const crit = planned.find((t) => passport <= addDays(end(t), 30));
    const warn = planned.find((t) => passport < addMonths(t.departure, 6));
    if (crit) out.push({ key: 'xc.passportTrip', severity: 'critical', vars: { date: passport, departure: crit.departure, return: end(crit) } });
    else if (warn) out.push({ key: 'xc.passportSixMonths', severity: 'warn', vars: { date: passport, departure: warn.departure } });
  }

  // 3. PR card vs trips not yet over: the card must be valid on the day you fly back.
  // The later of the profile date and a (possibly renewed) card in Documents. An ongoing trip has no
  // return date yet, so it counts once the card has expired while you are away.
  const card = [data.profile.prCardExpiry, latestExpiry(docs, ['pr_card_copy'])].filter((d): d is string => !!d).sort().pop();
  if (data.profile.prDate && card) {
    const t = data.trips
      .filter((x) => x.departure <= today || !!x.return)
      .filter((x) => (x.return ? x.return >= today && x.return > card : card < today))
      .sort((a, b) => a.departure.localeCompare(b.departure))[0];
    if (t) out.push({ key: 'xc.prCardTrip', severity: 'critical', vars: { date: card, departure: t.departure, return: t.return || '…' } });
  }

  // 4. Medical exam older than 12 months while a PR application is in progress.
  const medical = latestExpiry(docs, ['medical']);
  if (prInProgress && medical && medical < today) out.push({ key: 'xc.medicalOld', severity: 'warn', vars: { date: medical } });

  // 5. Work/study permit expiring within 4 months while a PR application is in progress.
  const permit = latestExpiry(docs, ['work_permit', 'study_permit']);
  if (prInProgress && permit && permit >= today && permit <= addMonths(today, 4))
    out.push({ key: 'xc.permitPr', severity: 'warn', vars: { date: permit, days: diffDays(permit, today) } });

  // 6. Eligible for citizenship but no citizenship application tracked.
  if (insights.citizenship?.eligible && !data.applications.some((a) => a.kind === 'citizenship'))
    out.push({ key: 'xc.citNoApp', severity: 'info' });

  // 7. PR for 3+ years and fewer than 3 tax years filed in the last 5 calendar years.
  if (isPr && addYears(data.profile.prDate!, 3) <= today) {
    const to = Number(today.slice(0, 4)) - 1;
    const from = to - 4;
    const n = new Set(data.profile.taxYearsFiled.filter((y) => y >= from && y <= to)).size;
    if (n < 3) out.push({ key: 'xc.taxYears', severity: 'info', vars: { n, from, to } });
  }

  return out.sort((a, b) => ORDER[a.severity] - ORDER[b.severity]);
}
