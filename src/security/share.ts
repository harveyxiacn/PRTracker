// CONTRACT (v0.8): serverless sharing — move a household member between phones, or send your own
// profile to a partner's phone, as an end-to-end encrypted file (reuses crypto.ts). No server.
// Owner: sync agent.
//
// The file is the same envelope as an encrypted backup (`encryptText`), wrapping a JSON
// `SharedPerson`. It never contains documents, applications, history, chat, settings or the lock.
// Anything read from a file is untrusted: it is validated and reduced to the known fields.
import { isISODate } from '../domain/dates';
import { DEFAULT_PERSON_NAME, MAX_NAME_LENGTH, SELF_ID, sanitizeProfile, sanitizeTrips, type Household, type Person } from '../domain/people';
import { uid, type AppData, type PrePRStatusKind, type Profile, type StatusPeriod, type Trip } from '../domain/types';
import { decryptText, encryptText } from './crypto';

export interface SharedPerson {
  format: 'pr-tracker-person-v1';
  name: string;
  profile: AppData['profile'];
  trips: AppData['trips'];
  exportedAt: string;
}

export const PERSON_FORMAT = 'pr-tracker-person-v1';
export const PERSON_FILE_EXT = '.prperson';
export const MIN_SHARE_PASSPHRASE = 8;
/** Caps so a crafted file cannot bloat storage or freeze the UI. */
export const MAX_SHARED_TRIPS = 5_000;
export const MAX_STATUS_PERIODS = 200;
export const MAX_TAX_YEARS = 100;
export const MAX_NOTE_LENGTH = 500;
export const MAX_DEST_LENGTH = 100;
/** Encrypted files larger than this are rejected before decrypting (5,000 trips is ~1.5 MB). */
export const MAX_FILE_CHARS = 8_000_000;

const PURPOSES: NonNullable<Trip['purpose']>[] = ['vacation', 'family', 'work', 'study', 'other'];
const STATUS_KINDS: PrePRStatusKind[] = ['worker', 'student', 'visitor', 'protected', 'other'];

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const cleanName = (name: string) => name.trim().replace(/\s+/g, ' ').slice(0, MAX_NAME_LENGTH);
const sameName = (a: string, b: string) => cleanName(a).toLocaleLowerCase() === cleanName(b).toLocaleLowerCase();
const optText = (v: unknown, max: number): string | undefined => {
  if (typeof v !== 'string') return undefined;
  const s = v.trim().slice(0, max);
  return s || undefined;
};

/** Whitelists the profile fields (people.ts sanitizer first, then drop unknown keys and cap lists). */
export function sanitizeSharedProfile(input: unknown): Profile {
  const p = sanitizeProfile(input);
  const periods: StatusPeriod[] = [];
  for (const s of p.statusPeriods) {
    if (periods.length >= MAX_STATUS_PERIODS) break;
    const kind = STATUS_KINDS.includes(s.kind) ? s.kind : 'other';
    const end = s.end && s.end >= s.start ? s.end : null;
    const note = optText(s.note, MAX_NOTE_LENGTH);
    periods.push({ id: typeof s.id === 'string' && s.id ? s.id.slice(0, 64) : uid(), kind, start: s.start, end, ...(note ? { note } : {}) });
  }
  const years = [...new Set(p.taxYearsFiled.filter((y) => y >= 1900 && y <= 2200))].sort((a, b) => a - b).slice(0, MAX_TAX_YEARS);
  const out: Profile = { statusPeriods: periods, taxYearsFiled: years };
  const displayName = optText(p.displayName, MAX_NAME_LENGTH);
  if (displayName) out.displayName = displayName;
  if (p.prDate) out.prDate = p.prDate;
  if (p.prCardExpiry) out.prCardExpiry = p.prCardExpiry;
  if (p.firstEntry) out.firstEntry = p.firstEntry;
  return out;
}

/** Whitelists trip fields, drops trips that end before they start, de-duplicates ids, caps the count. */
export function sanitizeSharedTrips(input: unknown): Trip[] {
  const raw = Array.isArray(input) ? input.slice(0, MAX_SHARED_TRIPS * 2) : [];
  const seen = new Set<string>();
  const out: Trip[] = [];
  for (const t of sanitizeTrips(raw)) {
    if (out.length >= MAX_SHARED_TRIPS) break;
    if (t.return && t.return < t.departure) continue;
    let id = t.id.slice(0, 64);
    if (!id || seen.has(id)) id = uid();
    seen.add(id);
    const trip: Trip = { id, departure: t.departure, return: t.return ?? null };
    const destination = optText(t.destination, MAX_DEST_LENGTH);
    if (destination) trip.destination = destination;
    if (t.purpose && PURPOSES.includes(t.purpose)) trip.purpose = t.purpose;
    const note = optText(t.note, MAX_NOTE_LENGTH);
    if (note) trip.note = note;
    out.push(trip);
  }
  return out;
}

/** Strict validation of a decrypted payload; throws Error('bad-format'). */
export function sanitizeSharedPerson(input: unknown): SharedPerson {
  if (!isObj(input) || input.format !== PERSON_FORMAT || !isObj(input.profile) || !Array.isArray(input.trips)) {
    throw new Error('bad-format');
  }
  const name = (typeof input.name === 'string' && cleanName(input.name)) || DEFAULT_PERSON_NAME;
  const at = typeof input.exportedAt === 'string' ? input.exportedAt.slice(0, 40) : '';
  return {
    format: PERSON_FORMAT,
    name,
    profile: sanitizeSharedProfile(input.profile),
    trips: sanitizeSharedTrips(input.trips),
    exportedAt: at && !Number.isNaN(Date.parse(at)) ? at : '',
  };
}

/** The household as stored, or the implicit single-person one. */
function householdOf(data: AppData): Household {
  return data.household ?? { activeId: SELF_ID, activeName: cleanName(data.profile.displayName ?? '') || DEFAULT_PERSON_NAME, others: [] };
}

/** The plain (unencrypted) payload for one person; throws Error('not-found') for an unknown id. */
export function buildSharedPerson(data: AppData, personId: string, now: Date = new Date()): SharedPerson {
  const h = householdOf(data);
  let src: Pick<Person, 'name' | 'profile' | 'trips'> | undefined;
  if (personId === h.activeId) src = { name: h.activeName, profile: data.profile, trips: data.trips };
  else src = h.others.find((p) => p.id === personId);
  if (!src) throw new Error('not-found');
  const name = cleanName(src.name) || cleanName(src.profile.displayName ?? '') || DEFAULT_PERSON_NAME;
  return {
    format: PERSON_FORMAT,
    name,
    profile: sanitizeSharedProfile(src.profile),
    trips: sanitizeSharedTrips(src.trips),
    exportedAt: now.toISOString(),
  };
}

/** Encrypted file text for one person (active person or a household member by id). */
export async function exportPersonEncrypted(data: AppData, personId: string, passphrase: string): Promise<string> {
  if (typeof passphrase !== 'string' || passphrase.length < MIN_SHARE_PASSPHRASE) throw new Error('weak-passphrase');
  return encryptText(JSON.stringify(buildSharedPerson(data, personId)), passphrase);
}

/** Decrypt and validate; throws Error('bad-passphrase' | 'bad-format'). */
export async function readPersonFile(text: string, passphrase: string): Promise<SharedPerson> {
  if (typeof text !== 'string' || text.length > MAX_FILE_CHARS) throw new Error('bad-format');
  const plain = await decryptText(text, passphrase); // throws bad-passphrase / bad-format
  let o: unknown;
  try {
    o = JSON.parse(plain);
  } catch {
    throw new Error('bad-format');
  }
  return sanitizeSharedPerson(o);
}

/**
 * The existing person with the same name (case-insensitive), if any. The unnamed default ("Me")
 * never matches: both phones usually use it, and the sender's "Me" is not the receiver's.
 */
export function findSameName(data: AppData, name: string): { id: string; name: string; active: boolean } | null {
  if (sameName(name, DEFAULT_PERSON_NAME)) return null;
  const h = householdOf(data);
  if (sameName(h.activeName, name)) return { id: h.activeId, name: h.activeName, active: true };
  const p = h.others.find((o) => sameName(o.name, name));
  return p ? { id: p.id, name: p.name, active: false } : null;
}

/** "Sam", then "Sam (2)", "Sam (3)"… so added people stay distinguishable. */
function uniqueName(h: Household, name: string): string {
  const taken = (n: string) => sameName(h.activeName, n) || h.others.some((o) => sameName(o.name, n));
  if (!taken(name)) return name;
  for (let i = 2; i < 1000; i++) {
    const suffix = ` (${i})`;
    const n = name.slice(0, MAX_NAME_LENGTH - suffix.length).trimEnd() + suffix;
    if (!taken(n)) return n;
  }
  return name;
}

/** Add as a new household member, or replace the member with the same name if `replace`. */
export function importPerson(data: AppData, p: SharedPerson, opts?: { replace?: boolean; name?: string }): AppData {
  const rename = opts?.name && cleanName(opts.name);
  const person = sanitizeSharedPerson(rename ? { ...p, name: rename } : p);
  const h = householdOf(data);
  if (opts?.replace) {
    const match = findSameName(data, person.name);
    if (match?.active) return { ...data, profile: person.profile, trips: person.trips, household: h };
    if (match) {
      return {
        ...data,
        household: { ...h, others: h.others.map((o) => (o.id === match.id ? { ...o, profile: person.profile, trips: person.trips } : o)) },
      };
    }
  }
  const ids = new Set([h.activeId, ...h.others.map((o) => o.id)]);
  let id = uid();
  while (ids.has(id)) id = uid();
  const added: Person = { id, name: uniqueName(h, person.name), profile: person.profile, trips: person.trips };
  return { ...data, household: { ...h, others: [...h.others, added] } };
}

/** File name without the person's name, which would otherwise sit outside the encryption. */
export function shareFileName(_name: string, date: string): string {
  return `pr-tracker-person-${isISODate(date) ? date : 'export'}${PERSON_FILE_EXT}`;
}
