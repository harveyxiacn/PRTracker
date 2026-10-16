// Derived dashboard facts and reminder schedule, shared by the Home screen,
// local notifications and the smart assistant.

import { addDays, addMonths, diffDays, todayISO, type ISODate } from './dates';
import {
  CITIZENSHIP_REQUIRED,
  PresenceModel,
  validateTrips,
  type CitizenshipResult,
  type ResidencyResult,
  type TripIssue,
} from './presence';
import type { AppData, Trip } from './types';

/** IRCC: apply to renew when the card expires in less than 9 months. */
export const PR_CARD_RENEWAL_MONTHS = 9;

export interface Insights {
  today: ISODate;
  model: PresenceModel;
  isPr: boolean;
  ongoingTrip?: Trip;
  citizenship?: CitizenshipResult & {
    eligibleDate: ISODate | null;
    safeDate: ISODate | null; // with buffer
    daysUntilEligible: number | null;
  };
  residency?: ResidencyResult;
  prCard?: {
    expiry: ISODate;
    daysUntilExpiry: number;
    renewalOpens: ISODate;
    daysUntilRenewal: number;
    state: 'ok' | 'renew_now' | 'expired';
  };
  tripIssues: TripIssue[];
  reminders: Reminder[];
}

export interface Reminder {
  id: string;
  /** Day to notify (09:00 local). */
  date: ISODate;
  /** i18n keys */
  title: string;
  body: string;
  vars: Record<string, string | number>;
  category: 'citizenship' | 'prCard' | 'residency' | 'tripReturn';
  severity: 'info' | 'warn' | 'critical';
}

export function computeInsights(data: AppData, today: ISODate = todayISO()): Insights {
  const { profile, trips, settings } = data;
  const model = new PresenceModel({ profile, trips, today, boundaryDaysPresent: settings.boundaryDaysPresent });
  const isPr = !!profile.prDate && profile.prDate <= today;
  // Abroad now: left on/before today and not back yet (no return, or a return after today).
  const ongoingTrip = trips.find((t) => t.departure <= today && (!t.return || t.return > today));
  const reminders: Reminder[] = [];
  const out: Insights = { today, model, isPr, ongoingTrip, tripIssues: validateTrips(trips, today), reminders };

  if (profile.prDate) {
    const c = model.citizenshipAt(today);
    const eligibleDate = model.citizenshipEligibleDate();
    const safeDate = model.citizenshipEligibleDate(CITIZENSHIP_REQUIRED + Math.max(0, settings.citizenshipBuffer));
    out.citizenship = {
      ...c,
      eligibleDate,
      safeDate,
      daysUntilEligible: eligibleDate ? Math.max(0, diffDays(eligibleDate, today)) : null,
    };
    // Remind on the eligibility day itself too, but not on every later day.
    const becameEligibleToday = c.credited >= CITIZENSHIP_REQUIRED && model.citizenshipAt(addDays(today, -1)).credited < CITIZENSHIP_REQUIRED;
    if (eligibleDate && eligibleDate >= today && (c.credited < CITIZENSHIP_REQUIRED || becameEligibleToday)) {
      reminders.push({
        id: 'cit-eligible', date: eligibleDate, category: 'citizenship', severity: 'info',
        title: 'rem.citEligible.title', body: 'rem.citEligible.body', vars: { date: eligibleDate },
      });
      const pre = addDays(eligibleDate, -30);
      if (pre > today)
        reminders.push({
          id: 'cit-eligible-30', date: pre, category: 'citizenship', severity: 'info',
          title: 'rem.citSoon.title', body: 'rem.citSoon.body', vars: { date: eligibleDate, days: 30 },
        });
    }

    const residency = model.residencyAt(undefined, { abroadNow: !!ongoingTrip }) ?? undefined;
    out.residency = residency;
    if (residency && ongoingTrip && residency.mustReturnBy) {
      for (const lead of [60, 30, 7]) {
        const d = addDays(residency.mustReturnBy, -lead);
        if (d >= today)
          reminders.push({
            id: `res-return-${lead}`, date: d, category: 'residency', severity: lead <= 7 ? 'critical' : 'warn',
            title: 'rem.resReturn.title', body: 'rem.resReturn.body', vars: { date: residency.mustReturnBy, days: lead },
          });
      }
    }
    if (residency && !residency.compliant)
      reminders.push({
        id: 'res-noncompliant', date: addDays(today, 1), category: 'residency', severity: 'critical',
        title: 'rem.resRisk.title', body: 'rem.resRisk.body', vars: { days: residency.shortfall },
      });
  }

  if (profile.prCardExpiry) {
    const expiry = profile.prCardExpiry;
    const renewalOpens = addMonths(expiry, -PR_CARD_RENEWAL_MONTHS);
    const daysUntilExpiry = diffDays(expiry, today);
    const daysUntilRenewal = diffDays(renewalOpens, today);
    out.prCard = {
      expiry,
      daysUntilExpiry,
      renewalOpens,
      daysUntilRenewal,
      state: daysUntilExpiry < 0 ? 'expired' : daysUntilRenewal <= 0 ? 'renew_now' : 'ok',
    };
    if (renewalOpens >= today)
      reminders.push({
        id: 'card-renew', date: renewalOpens, category: 'prCard', severity: 'warn',
        title: 'rem.cardRenew.title', body: 'rem.cardRenew.body', vars: { date: expiry },
      });
    for (const lead of [90, 30]) {
      const d = addDays(expiry, -lead);
      if (d >= today)
        reminders.push({
          id: `card-expiry-${lead}`, date: d, category: 'prCard', severity: lead <= 30 ? 'critical' : 'warn',
          title: 'rem.cardExpiry.title', body: 'rem.cardExpiry.body', vars: { date: expiry, days: lead },
        });
    }
  }

  for (const t of trips) {
    if (t.return && t.return >= today) {
      reminders.push({
        id: `trip-${t.id}`, date: t.return, category: 'tripReturn', severity: 'info',
        title: 'rem.tripReturn.title', body: 'rem.tripReturn.body', vars: { date: t.return, place: t.destination ?? '' },
      });
    }
  }
  reminders.sort((a, b) => a.date.localeCompare(b.date));
  return out;
}
