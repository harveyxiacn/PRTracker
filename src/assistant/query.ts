// Maple's "database" layer: structured queries over the user's own trips and
// goal-seeking planners built on the presence engine. Pure functions, unit-tested.
import { addDays, addMonths, diffDays, toDay, type ISODate } from '../domain/dates';
import { CITIZENSHIP_REQUIRED, PresenceModel, tripLength, withExtraTrip, type PresenceInput } from '../domain/presence';
import type { Trip } from '../domain/types';

export interface TripFilter {
  /** Case-insensitive substring of the destination. */
  place?: string;
  from?: ISODate;
  to?: ISODate;
}

/** Trips overlapping [from, to] and matching the place, newest first. */
export function filterTrips(trips: Trip[], f: TripFilter, today: ISODate): Trip[] {
  const place = f.place?.toLowerCase();
  return trips
    .filter((t) => !place || (t.destination ?? '').toLowerCase().includes(place))
    .filter((t) => !f.from || (t.return ?? today) >= f.from)
    .filter((t) => !f.to || t.departure <= f.to)
    .sort((a, b) => b.departure.localeCompare(a.departure));
}

export interface TripStats {
  count: number;
  totalDays: number;
  longest?: { trip: Trip; days: number };
  shortest?: { trip: Trip; days: number };
  last?: Trip;
  next?: Trip;
  topPlace?: { place: string; count: number; days: number };
}

export function tripStats(trips: Trip[], today: ISODate, boundaryDaysPresent = true): TripStats {
  const len = (t: Trip) => tripLength(t, today, boundaryDaysPresent);
  const past = trips.filter((t) => t.departure <= today);
  const future = trips.filter((t) => t.departure > today).sort((a, b) => a.departure.localeCompare(b.departure));
  let longest: TripStats['longest'];
  let shortest: TripStats['shortest'];
  const byPlace = new Map<string, { count: number; days: number; label: string }>();
  for (const t of past) {
    const d = len(t);
    if (!longest || d > longest.days) longest = { trip: t, days: d };
    if (!shortest || d < shortest.days) shortest = { trip: t, days: d };
    const label = t.destination?.trim();
    if (label) {
      const k = label.toLowerCase();
      const cur = byPlace.get(k) ?? { count: 0, days: 0, label };
      byPlace.set(k, { count: cur.count + 1, days: cur.days + d, label: cur.label });
    }
  }
  const top = [...byPlace.values()].sort((a, b) => b.count - a.count || b.days - a.days)[0];
  return {
    count: past.length,
    totalDays: past.reduce((s, t) => s + len(t), 0),
    longest,
    shortest,
    last: [...past].sort((a, b) => b.departure.localeCompare(a.departure))[0],
    next: future[0],
    topPlace: top ? { place: top.label, count: top.count, days: top.days } : undefined,
  };
}

/** Days outside Canada in the last `months` months (up to today). */
export function daysOutsideLastMonths(model: PresenceModel, today: ISODate, months: number): number {
  return model.absentBetween(addMonths(today, -months), today);
}

export interface TravelBudget {
  target: ISODate;
  /** Credited citizenship days on the target date with only the trips already logged. */
  creditedAtTarget: number;
  /** Extra days you can still spend outside Canada before `target` and still have 1,095. */
  budget: number;
  /** Earliest possible date if the target is not reachable. */
  earliest: ISODate | null;
}

/**
 * Goal-seeking: "I want to apply for citizenship on/before T — how many more days can I travel?"
 * Every future day before T is a PR day, so each extra day abroad costs exactly one credited day.
 * Verified against a simulated trip of `budget` days (see query.test.ts).
 */
export function travelBudget(model: PresenceModel, target: ISODate, required = CITIZENSHIP_REQUIRED): TravelBudget {
  const credited = model.citizenshipAt(target).credited;
  const earliest = model.citizenshipEligibleDate(required);
  // Only days from tomorrow (and inside T's 5-year window) up to the day before T matter,
  // minus days already planned abroad; with boundary days counting as present, a trip's
  // departure day is spent in Canada, so one more day is needed than days away.
  const first = [addDays(model.input.today, 1), addMonths(target, -60)].sort()[1];
  const span = Math.max(0, diffDays(target, first));
  const free = span > 0 ? span - model.absentBetween(first, addDays(target, -1)) : 0;
  const room = Math.max(0, free - (model.input.boundaryDaysPresent ?? true ? 1 : 0));
  return { target, creditedAtTarget: credited, budget: Math.max(0, Math.min(room, credited - required)), earliest };
}

export interface TripPlan {
  days: number;
  /** Eligibility date with no new trip. */
  eligibleNow: ISODate | null;
  /** Eligibility date if leaving tomorrow for `days` days. */
  eligibleIfNow: ISODate | null;
  /** Leaving on or after this date (after applying) does not delay citizenship. */
  noDelayFrom: ISODate | null;
  /** Residency obligation stays met if leaving tomorrow. */
  residencyOkNow: boolean;
  /** PR card expires during a trip starting tomorrow. */
  cardExpiresDuring: boolean;
}

/** Return date for a trip of `days` full days away starting on `leave` under the counting rule. */
export function returnFor(leave: ISODate, days: number, boundaryDaysPresent = true): ISODate {
  return addDays(leave, boundaryDaysPresent ? days + 1 : Math.max(0, days - 1));
}

/** "When is the best time for an N-day trip?" */
export function planTrip(input: PresenceInput, days: number, prCardExpiry?: ISODate): TripPlan {
  const base = new PresenceModel(input);
  const leave = addDays(input.today, 1);
  const ret = returnFor(leave, days, input.boundaryDaysPresent ?? true);
  const withTrip = withExtraTrip(input, leave, ret);
  const eligibleNow = base.citizenshipEligibleDate();
  let residencyOkNow = true;
  if (base.prDay !== null) {
    for (let d = leave; d <= addDays(ret, 365); d = addDays(d, 1)) {
      if (!withTrip.residencyAt(d)?.compliant) {
        residencyOkNow = false;
        break;
      }
    }
  }
  return {
    days,
    eligibleNow,
    eligibleIfNow: withTrip.citizenshipEligibleDate(),
    noDelayFrom: eligibleNow,
    residencyOkNow,
    cardExpiresDuring: !!prCardExpiry && prCardExpiry >= leave && prCardExpiry <= ret,
  };
}

export interface Explanation {
  asOf: ISODate;
  windowStart: ISODate;
  windowEnd: ISODate;
  prDays: number;
  prePrDays: number;
  prePrCredit: number;
  credited: number;
  tripsInWindow: number;
  daysAwayInWindow: number;
}

/** Break down the citizenship count on a date. */
export function explainCitizenship(model: PresenceModel, trips: Trip[], asOf: ISODate): Explanation {
  const c = model.citizenshipAt(asOf);
  const inWin = filterTrips(trips, { from: c.windowStart, to: c.windowEnd }, model.input.today);
  return {
    asOf,
    windowStart: c.windowStart,
    windowEnd: c.windowEnd,
    prDays: c.prDays,
    prePrDays: c.prePrDays,
    prePrCredit: Math.floor(c.prePrCredit),
    credited: c.credited,
    tripsInWindow: inWin.length,
    daysAwayInWindow: model.absentBetween(c.windowStart, c.windowEnd),
  };
}

export const daysBetween = (a: ISODate, b: ISODate) => toDay(b) - toDay(a);
