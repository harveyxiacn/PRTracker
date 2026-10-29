// CONTRACT (v0.4): realistic sample data for "Try with sample data" and visual QA screenshots.
// Owner: visual-QA agent. Keep the exported signature.
// Everything is fictional ("Alex Demo", "Sam Demo", example organisations) and every date is
// relative to `today`, so screenshots always show the same situation. Ids are fixed strings
// (no uid()) so the rendered output is deterministic.
import { addDays, addMonths, addYears, yearOf, type ISODate } from './dates';
import type { DocumentsData } from './documents';
import type { HistoryData } from './history';
import type { Household, Person } from './people';
import { DEFAULT_DATA_URL, type AppData, type Application, type Profile, type Trip } from './types';

/** Trip `days` long (departure and return inclusive) leaving `monthsFromToday` months from today. */
function trip(id: string, today: ISODate, monthsFromToday: number, days: number, destination: string, purpose: Trip['purpose']): Trip {
  const departure = addMonths(today, monthsFromToday);
  return { id, departure, return: addDays(departure, days - 1), destination, purpose };
}

/** A believable household relative to `today` (PR ~2 years, trips, applications, documents, history). Never real people. */
export function demoData(today: ISODate, language?: string): AppData {
  // ---- Key dates --------------------------------------------------------------------------
  const prDate = addMonths(today, -28); // landed ≈ 2.3 years ago
  const workerStart = addMonths(prDate, -24); // 2 years on a work permit before PR
  const prCardExpiry = addMonths(today, 7); // renewal window (expiry − 270 days) is open
  const y = yearOf(today);

  const profile: Profile = {
    displayName: 'Alex Demo',
    prDate,
    prCardExpiry,
    firstEntry: workerStart,
    statusPeriods: [{ id: 'demo-sp-1', kind: 'worker', start: workerStart, end: null, note: 'Post-graduation work permit' }],
    taxYearsFiled: [y - 4, y - 3, y - 2, y - 1],
  };

  // ---- Trips: 8 past trips over the last 3 years + 1 planned --------------------------------
  // Long family visits keep citizenship ≈ 1 month away, so Home shows a live countdown.
  const trips: Trip[] = [
    trip('demo-trip-1', today, -34, 14, 'Manila, Philippines', 'family'),
    trip('demo-trip-2', today, -30, 9, 'Mexico City, Mexico', 'vacation'),
    trip('demo-trip-3', today, -26, 35, 'Delhi, India', 'family'),
    trip('demo-trip-4', today, -21, 5, 'Seattle, United States', 'work'),
    trip('demo-trip-5', today, -17, 30, 'Shanghai, China', 'vacation'),
    trip('demo-trip-6', today, -11, 12, 'Mexico City, Mexico', 'vacation'),
    trip('demo-trip-7', today, -7, 42, 'Manila, Philippines', 'family'),
    trip('demo-trip-8', today, -3, 28, 'Delhi, India', 'family'),
    trip('demo-trip-9', today, 2, 10, 'Shanghai, China', 'vacation'),
  ];

  // ---- Applications ---------------------------------------------------------------------------
  // Express Entry (CEC): ≈ 6 months from submission to landing.
  const sub = addDays(prDate, -185);
  const ms = (key: string, offset: number) => ({ key, date: addDays(sub, offset) });
  const ee: Application = {
    id: 'demo-app-ee',
    kind: 'ee_cec',
    submitted: sub,
    office: 'Ottawa',
    milestones: [
      ms('profile', -95),
      ms('ita', -52),
      ms('submitted', 0),
      ms('aor', 1),
      ms('biometrics_request', 3),
      ms('biometrics', 11),
      ms('medical', 24),
      ms('eligibility', 98),
      ms('background', 142),
      ms('ppr', 158),
      ms('portal1', 160),
      ms('portal2', 171),
      ms('copr', 178),
      { key: 'landed', date: prDate },
    ],
  };
  const citizenship: Application = {
    id: 'demo-app-cit',
    kind: 'citizenship',
    submitted: null,
    milestones: [],
  };

  // ---- Documents (metadata only, never numbers) ------------------------------------------------
  const passportExpiry = addMonths(today, 5); // within the 6-month passport lead time → 'soon'
  const documents: DocumentsData = {
    items: [
      { id: 'demo-doc-passport', kind: 'passport', holder: 'me', issued: addYears(passportExpiry, -10), expires: passportExpiry, country: 'PH' },
      // Language results are valid 2 years; taken 21 months ago → expires in ≈3 months ('soon').
      { id: 'demo-doc-ielts', kind: 'language_test', label: 'IELTS General', holder: 'me', issued: addDays(addMonths(today, -21), -10), expires: null },
      { id: 'demo-doc-eca', kind: 'eca', label: 'WES', holder: 'me', issued: addMonths(today, -40), expires: null },
      { id: 'demo-doc-prcard', kind: 'pr_card_copy', holder: 'me', issued: addDays(prDate, 30), expires: prCardExpiry },
    ],
    checklist: { 'demo-app-cit': { passport: true, photos: true, pr_card_copy: true, travel_history: true } },
  };

  // ---- History: 10+ years of addresses (one deliberate 2-month gap) and activities --------------
  const firstMoveOut = addMonths(today, -74);
  const gapEnd = addMonths(firstMoveOut, 2); // nothing recorded for 2 months after firstMoveOut
  const moveWithinCanada = addMonths(today, -18);
  const history: HistoryData = {
    birthDate: addDays(addYears(today, -33), -47),
    addresses: [
      { id: 'demo-addr-1', from: addMonths(today, -126), to: firstMoveOut, city: 'Quezon City', region: 'Metro Manila', country: 'PH' },
      { id: 'demo-addr-2', from: addDays(gapEnd, 1), to: addDays(workerStart, -1), city: 'Makati', region: 'Metro Manila', country: 'PH' },
      { id: 'demo-addr-3', from: workerStart, to: moveWithinCanada, street: '100 Example Street, Apt 1203', city: 'Toronto', region: 'ON', postal: 'M5V 0A1', country: 'CA' },
      { id: 'demo-addr-4', from: addDays(moveWithinCanada, 1), to: null, street: '25 Sample Crescent', city: 'Mississauga', region: 'ON', postal: 'L5B 0A1', country: 'CA' },
    ],
    activities: [
      { id: 'demo-act-1', from: addMonths(today, -134), to: addMonths(today, -122), kind: 'study', title: 'MSc Computer Science', organization: 'Example University', city: 'Quezon City', country: 'PH' },
      { id: 'demo-act-2', from: addDays(addMonths(today, -122), 1), to: addDays(workerStart, -1), kind: 'work', title: 'Software developer', organization: 'Example Tech Inc.', city: 'Makati', country: 'PH' },
      { id: 'demo-act-3', from: workerStart, to: null, kind: 'work', title: 'Senior software developer', organization: 'Maple Example Ltd.', city: 'Toronto', country: 'CA' },
    ],
  };

  // ---- Eligibility / CRS form (a typical CEC profile) ---------------------------------------------
  const eligibilityForm: Record<string, unknown> = {
    tab: 'crs',
    drawCats: ['stem'],
    age: 31,
    hasSpouse: true,
    education: 'master',
    testKind: 'ielts',
    lang1: { listening: 8, reading: 7.5, writing: 7, speaking: 7 },
    hasLang2: false,
    canadianWorkYears: 2,
    foreignWorkYears: 3,
    spouseEducation: 'bachelor',
    spouseLang: { listening: 7, reading: 7, writing: 6, speaking: 7 },
    spouseCanadianWork: 1,
    teer: 1,
    cdnSkilledMonths: 24,
    skilledMonths10y: 60,
    eca: true,
  };

  // ---- Household: spouse with their own profile and trips -----------------------------------------
  const samPr = addYears(today, -1);
  const samEntry = addMonths(today, -30);
  const sam: Person = {
    id: 'demo-person-sam',
    name: 'Sam Demo',
    profile: {
      displayName: 'Sam Demo',
      prDate: samPr,
      prCardExpiry: addYears(samPr, 5),
      firstEntry: samEntry,
      statusPeriods: [{ id: 'demo-sam-sp-1', kind: 'worker', start: samEntry, end: null, note: 'Spousal open work permit' }],
      taxYearsFiled: [y - 2, y - 1],
    },
    trips: [
      { id: 'demo-sam-trip-1', departure: trips[5].departure, return: trips[5].return, destination: 'Mexico City, Mexico', purpose: 'vacation' },
      { id: 'demo-sam-trip-2', departure: trips[6].departure, return: trips[6].return, destination: 'Manila, Philippines', purpose: 'family' },
    ],
  };
  const household: Household = { activeId: 'demo-person-alex', activeName: 'Alex Demo', others: [sam] };

  return {
    version: 1,
    profile,
    trips,
    applications: [citizenship, ee],
    settings: {
      language: language ?? 'en',
      theme: 'system',
      boundaryDaysPresent: true,
      notifications: { enabled: true, citizenship: true, prCard: true, residency: true, tripReturn: true, documents: true },
      dataUrl: DEFAULT_DATA_URL,
      citizenshipBuffer: 10,
    },
    chat: [],
    onboarded: true,
    eligibilityForm,
    history,
    documents,
    household,
    lock: null,
  };
}
