import type { ISODate } from './dates';
import type { DocumentsData } from './documents';
import type { HistoryData } from './history';

/** A trip outside Canada. Departure and return are the days the border was crossed. */
export interface Trip {
  id: string;
  departure: ISODate;
  /** Missing = still outside Canada (ongoing trip). */
  return?: ISODate | null;
  destination?: string;
  purpose?: 'vacation' | 'family' | 'work' | 'study' | 'other';
  note?: string;
}

/**
 * Legal status held in Canada before becoming a permanent resident.
 * Time as a temporary resident or protected person earns half-day citizenship credit.
 */
export type PrePRStatusKind = 'worker' | 'student' | 'visitor' | 'protected' | 'other';

export interface StatusPeriod {
  id: string;
  kind: PrePRStatusKind;
  start: ISODate;
  /** Missing = until PR landing date. */
  end?: ISODate | null;
  note?: string;
}

export interface Profile {
  displayName?: string;
  /** Date of landing / becoming a permanent resident. Undefined = not a PR yet. */
  prDate?: ISODate;
  prCardExpiry?: ISODate;
  /** Date of first arrival in Canada (used to start the calendar). */
  firstEntry?: ISODate;
  /** Temporary statuses held before PR, for half-day citizenship credit. */
  statusPeriods: StatusPeriod[];
  /** Tax years filed in Canada (citizenship needs 3 of the 5 years). */
  taxYearsFiled: number[];
}

/** Program id from `PROGRAMS` in programs.ts (e.g. 'ee_cec', 'pnp_base', 'study_permit'). */
export type ApplicationKind = string;

export interface Milestone {
  key: string;
  date?: ISODate | null;
  note?: string;
}

export interface Application {
  id: string;
  kind: ApplicationKind;
  label?: string;
  /** Date IRCC received the application (or submission date). */
  submitted?: ISODate | null;
  milestones: Milestone[];
  /** Override for the expected total processing time in days. */
  expectedDays?: number | null;
  /** Visa office / processing centre (optional, for comparing timelines). */
  office?: string;
  /** Province/territory code for provincial nominee applications. */
  province?: string;
  /** ISO 3166 alpha-2 country applied from (temporary residence, child sponsorship). */
  country?: string;
  /** Free-text stream name, e.g. "OINP Human Capital Priorities". */
  stream?: string;
  archived?: boolean;
}

export interface Settings {
  /** UI language code from i18n/languages.ts (e.g. 'en', 'fr', 'zh-Hant', 'ar'). */
  language: string;
  theme: 'system' | 'light' | 'dark';
  /** IRCC counts the day you leave and the day you return as days in Canada. */
  boundaryDaysPresent: boolean;
  notifications: {
    enabled: boolean;
    citizenship: boolean;
    prCard: boolean;
    residency: boolean;
    tripReturn: boolean;
    documents?: boolean;
  };
  /** Base URL of the open-data mirror (IRCC times, community timelines). */
  dataUrl: string;
  /** Margin (days) the assistant recommends above the 1,095-day minimum. */
  citizenshipBuffer: number;
}

export interface AppData {
  version: 1;
  profile: Profile;
  trips: Trip[];
  applications: Application[];
  settings: Settings;
  /** Assistant chat history (local only). */
  chat?: { role: 'user' | 'assistant'; text: string; at: string }[];
  onboarded: boolean;
  /** Saved answers of the eligibility / CRS form. */
  eligibilityForm?: Record<string, unknown>;
  /** v0.3: personal history (addresses, activities) for forms. */
  history?: HistoryData;
  /** v0.3: documents & expiries. */
  documents?: DocumentsData;
  /** v0.4: other household members (the active person's data is in profile/trips). */
  household?: import('./people').Household;
  /** v0.4: Android FLAG_SECURE (block screenshots). */
  privacyScreen?: boolean;
  /** v0.4: compare history gaps by month (as IRCC forms do) instead of by day. */
  historyMonthly?: boolean;
  /** v0.3: app lock (PIN hash, never the PIN itself). */
  lock?: { pinHash: string; salt: string } | null;
}

export const DEFAULT_DATA_URL = 'https://harveyxiacn.github.io/PRTracker/data/';

export function emptyData(): AppData {
  return {
    version: 1,
    profile: { statusPeriods: [], taxYearsFiled: [] },
    trips: [],
    applications: [],
    settings: {
      language: 'en',
      theme: 'system',
      boundaryDaysPresent: true,
      notifications: { enabled: true, citizenship: true, prCard: true, residency: true, tripReturn: true },
      dataUrl: DEFAULT_DATA_URL,
      citizenshipBuffer: 10,
    },
    chat: [],
    onboarded: false,
  };
}

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
