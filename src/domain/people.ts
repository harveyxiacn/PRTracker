// CONTRACT (v0.4): household — track several people (e.g. you and your spouse). The ACTIVE
// person's data stays in AppData.profile/trips (so every existing screen works unchanged);
// other people are stored in AppData.household.others and swapped in on switch.
// Owner: household agent. Keep exported names and signatures.
//
// Rules:
//  • `household` undefined = exactly one person, id `SELF_ID`, named from profile.displayName
//    (or `DEFAULT_PERSON_NAME`, which the UI translates).
//  • Every function is pure and returns a new AppData; nothing is ever dropped on a switch:
//    the previously active profile/trips object goes into `others` unchanged (same reference),
//    so switching A → B → A gives back identical profile/trips.
//  • Applications, documents, history and settings stay shared by the whole household.
import { isISODate, type ISODate } from './dates';
import { computeInsights, type Reminder } from './insights';
import { uid, type AppData, type Profile, type Trip } from './types';

export interface Person {
  id: string;
  name: string;
  profile: Profile;
  trips: Trip[];
}

export interface Household {
  activeId: string;
  activeName: string;
  others: Person[];
}

export interface PersonSummary {
  id: string;
  name: string;
  active: boolean;
  isPr: boolean;
  citizenshipDate: ISODate | null;
  credited: number;
  residencyOk: boolean | null;
  prCardExpiry?: ISODate;
  abroad: boolean;
}

/** Id of the only person when there is no household yet. */
export const SELF_ID = 'self';
/** Name used when nobody has been named; the UI shows `t('ppl.me')` instead. */
export const DEFAULT_PERSON_NAME = 'Me';
export const MAX_NAME_LENGTH = 40;

const cleanName = (name: string) => name.trim().replace(/\s+/g, ' ').slice(0, MAX_NAME_LENGTH);

/** The household, created on the fly (not stored) for a single user. */
function ensureHousehold(data: AppData): Household {
  return data.household ?? { activeId: SELF_ID, activeName: cleanName(data.profile.displayName ?? '') || DEFAULT_PERSON_NAME, others: [] };
}

/** Active person first, then the others in stored order. */
export function listPeople(data: AppData): { id: string; name: string; active: boolean }[] {
  const h = ensureHousehold(data);
  return [{ id: h.activeId, name: h.activeName, active: true }, ...h.others.map((p) => ({ id: p.id, name: p.name, active: false }))];
}

export function peopleCount(data: AppData): number {
  return 1 + (data.household?.others.length ?? 0);
}

/** Every person with their own profile/trips (active one taken from data.profile/trips). */
export function allPeople(data: AppData): (Person & { active: boolean })[] {
  const h = ensureHousehold(data);
  return [
    { id: h.activeId, name: h.activeName, profile: data.profile, trips: data.trips, active: true },
    ...h.others.map((p) => ({ ...p, active: false })),
  ];
}

/** Swap the active person's profile/trips with person `id`. No-op if already active. */
export function switchPerson(data: AppData, id: string): AppData {
  const h = data.household;
  if (!h || id === h.activeId) return data;
  const idx = h.others.findIndex((p) => p.id === id);
  if (idx < 0) return data;
  const target = h.others[idx];
  const previous: Person = { id: h.activeId, name: h.activeName, profile: data.profile, trips: data.trips };
  const others = h.others.slice();
  others[idx] = previous;
  return {
    ...data,
    profile: target.profile,
    trips: target.trips,
    household: { activeId: target.id, activeName: target.name, others },
  };
}

/** Adds a person with an empty profile and no trips; the active person does not change. */
export function addPerson(data: AppData, name: string): AppData {
  const n = cleanName(name);
  if (!n) return data;
  const h = ensureHousehold(data);
  const person: Person = { id: uid(), name: n, profile: { statusPeriods: [], taxYearsFiled: [] }, trips: [] };
  return { ...data, household: { ...h, others: [...h.others, person] } };
}

/** Cannot remove the last remaining person; removing the active one activates another. */
export function removePerson(data: AppData, id: string): AppData {
  const h = data.household;
  if (!h || h.others.length === 0) return data; // last remaining person
  if (id === h.activeId) {
    const next = h.others[0];
    return {
      ...data,
      profile: next.profile,
      trips: next.trips,
      household: { activeId: next.id, activeName: next.name, others: h.others.slice(1) },
    };
  }
  if (!h.others.some((p) => p.id === id)) return data;
  return { ...data, household: { ...h, others: h.others.filter((p) => p.id !== id) } };
}

export function renamePerson(data: AppData, id: string, name: string): AppData {
  const n = cleanName(name);
  if (!n) return data;
  const h = ensureHousehold(data);
  if (id === h.activeId) return h.activeName === n && data.household ? data : { ...data, household: { ...h, activeName: n } };
  if (!h.others.some((p) => p.id === id)) return data;
  return { ...data, household: { ...h, others: h.others.map((p) => (p.id === id ? { ...p, name: n } : p)) } };
}

/** The data as if `person` were active (same settings/applications/documents). */
function asPerson(data: AppData, person: Pick<Person, 'profile' | 'trips'>): AppData {
  return { ...data, profile: person.profile, trips: person.trips };
}

/** Key dates for every person (uses computeInsights per person). */
export function householdSummary(data: AppData, today: ISODate): PersonSummary[] {
  return allPeople(data).map((p) => {
    const i = computeInsights(asPerson(data, p), today);
    return {
      id: p.id,
      name: p.name,
      active: p.active,
      isPr: i.isPr,
      citizenshipDate: i.citizenship?.eligibleDate ?? null,
      credited: i.citizenship?.credited ?? 0,
      residencyOk: i.residency ? i.residency.compliant : null,
      prCardExpiry: p.profile.prCardExpiry,
      abroad: !!i.ongoingTrip,
    };
  });
}

/**
 * Couples often apply for citizenship together: the later of the eligible dates of everyone
 * who has one. Null unless at least two people have an eligibility date.
 */
export function applyTogetherDate(summaries: PersonSummary[]): ISODate | null {
  const dates = summaries.map((s) => s.citizenshipDate).filter((d): d is ISODate => !!d);
  if (dates.length < 2) return null;
  return dates.reduce((a, b) => (b > a ? b : a));
}

/**
 * Reminders for the NON-active people (the active person's come from `insights.reminders`).
 * Ids are prefixed `ppl-<personId>-` so notification ids stay distinct; `vars.name` is added.
 * Document reminders are skipped (documents are shared and already in the active list).
 */
export function householdReminders(data: AppData, today: ISODate): Reminder[] {
  const h = data.household;
  if (!h) return [];
  return h.others.flatMap((p) =>
    computeInsights(asPerson(data, p), today)
      .reminders.filter((r) => r.category !== 'documents')
      .map((r) => ({ ...r, id: `ppl-${p.id}-${r.id}`, vars: { ...r.vars, name: p.name } })),
  );
}

// ---- storage validation (called by storage.migrate) ----

const isoOrUndef = (v: unknown) => (isISODate(v) ? v : undefined);
const isoOrNull = (v: unknown) => (isISODate(v) ? v : null);
const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Same repairs as migrate() applies to the main profile. */
export function sanitizeProfile(input: unknown): Profile {
  const p = (isObj(input) ? input : {}) as Partial<Profile>;
  return {
    ...p,
    prDate: isoOrUndef(p.prDate),
    prCardExpiry: isoOrUndef(p.prCardExpiry),
    firstEntry: isoOrUndef(p.firstEntry),
    statusPeriods: arr<Profile['statusPeriods'][number]>(p.statusPeriods)
      .filter((s) => isObj(s) && isISODate(s.start))
      .map((s) => ({ ...s, end: isoOrNull(s.end) })),
    taxYearsFiled: arr<number>(p.taxYearsFiled).filter((y) => Number.isInteger(y)),
  };
}

/** Same repairs as migrate() applies to the main trips. */
export function sanitizeTrips(input: unknown): Trip[] {
  return arr<Trip>(input)
    .filter((t) => isObj(t) && typeof t.id === 'string' && isISODate(t.departure))
    .map((t) => ({ ...t, return: isoOrNull(t.return) }));
}

/**
 * Validates a stored household. Returns undefined when absent or unusable. Malformed people are
 * dropped (people with valid data but a missing/duplicate id get a fresh id, so no trips are lost).
 */
export function sanitizeHousehold(h: unknown): Household | undefined {
  if (!isObj(h)) return undefined;
  const activeId = typeof h.activeId === 'string' && h.activeId ? h.activeId : SELF_ID;
  const activeName = (typeof h.activeName === 'string' && cleanName(h.activeName)) || DEFAULT_PERSON_NAME;
  const seen = new Set([activeId]);
  const others: Person[] = [];
  for (const raw of arr<unknown>(h.others)) {
    if (!isObj(raw) || !isObj(raw.profile)) continue;
    let id = typeof raw.id === 'string' && raw.id ? raw.id : uid();
    if (seen.has(id)) id = uid();
    seen.add(id);
    const name = (typeof raw.name === 'string' && cleanName(raw.name)) || DEFAULT_PERSON_NAME;
    others.push({ id, name, profile: sanitizeProfile(raw.profile), trips: sanitizeTrips(raw.trips) });
  }
  return { activeId, activeName, others };
}
