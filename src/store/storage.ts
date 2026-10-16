// Local-only persistence. Native apps use Capacitor Preferences (SharedPreferences /
// UserDefaults); the web build uses IndexedDB. Nothing is ever sent to a server.
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { del, get, set } from 'idb-keyval';
import { emptyData, type AppData } from '../domain/types';
import { isISODate } from '../domain/dates';

const KEY = 'prtracker.data.v1';

export async function loadData(): Promise<AppData> {
  try {
    let raw: string | null | undefined;
    if (Capacitor.isNativePlatform()) raw = (await Preferences.get({ key: KEY })).value;
    else raw = (await get<string>(KEY)) ?? localStorageGet();
    if (!raw) return emptyData();
    try {
      return migrate(JSON.parse(raw));
    } catch (e) {
      // Keep the unreadable copy so it can be recovered instead of being overwritten.
      console.error('Stored data unreadable, kept a copy', e);
      await saveRaw(`${KEY}.corrupt.${Date.now()}`, raw).catch(() => undefined);
      return emptyData();
    }
  } catch (e) {
    console.error('Failed to load data', e);
    return emptyData();
  }
}

async function saveRaw(key: string, raw: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    await Preferences.set({ key, value: raw });
    return;
  }
  try {
    await set(key, raw);
  } catch {
    localStorageSet(raw, key);
  }
}

export async function saveData(data: AppData): Promise<void> {
  await saveRaw(KEY, JSON.stringify(data));
}

export async function wipeData(): Promise<void> {
  if (Capacitor.isNativePlatform()) await Preferences.remove({ key: KEY });
  else {
    await del(KEY).catch(() => undefined);
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
  }
}

function localStorageGet(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}
function localStorageSet(v: string, key = KEY) {
  try {
    localStorage.setItem(key, v);
  } catch {
    /* ignore */
  }
}

const isoOrUndef = (v: unknown) => (isISODate(v) ? v : undefined);
const isoOrNull = (v: unknown) => (isISODate(v) ? v : null);
const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

/** Fill defaults for fields added after the data was saved, and drop or repair malformed rows. */
export function migrate(input: unknown): AppData {
  const base = emptyData();
  if (!input || typeof input !== 'object') return base;
  const d = input as Partial<AppData>;
  const p = (d.profile ?? {}) as Partial<AppData['profile']>;
  return {
    ...base,
    ...d,
    version: 1,
    profile: {
      ...base.profile,
      ...p,
      prDate: isoOrUndef(p.prDate),
      prCardExpiry: isoOrUndef(p.prCardExpiry),
      firstEntry: isoOrUndef(p.firstEntry),
      statusPeriods: arr<AppData['profile']['statusPeriods'][number]>(p.statusPeriods)
        .filter((s) => s && isISODate(s.start))
        .map((s) => ({ ...s, end: isoOrNull(s.end) })),
      taxYearsFiled: arr<number>(p.taxYearsFiled).filter((y) => Number.isInteger(y)),
    },
    settings: {
      ...base.settings,
      ...(d.settings ?? {}),
      notifications: { ...base.settings.notifications, ...(d.settings?.notifications ?? {}) },
    },
    trips: arr<AppData['trips'][number]>(d.trips)
      .filter((t) => t && typeof t.id === 'string' && isISODate(t.departure))
      .map((t) => ({ ...t, return: isoOrNull(t.return) })),
    applications: arr<AppData['applications'][number]>(d.applications)
      .filter((a) => a && typeof a.id === 'string' && typeof a.kind === 'string')
      .map((a) => ({
        ...a,
        submitted: isoOrNull(a.submitted),
        milestones: arr<AppData['applications'][number]['milestones'][number]>(a.milestones).filter((m) => m && typeof m.key === 'string' && isISODate(m.date)),
      })),
    chat: arr<NonNullable<AppData['chat']>[number]>(d.chat).slice(-200),
    onboarded: !!d.onboarded,
  };
}

/** Export file contents (JSON backup). */
export function exportJson(data: AppData): string {
  return JSON.stringify({ app: 'pr-tracker', exportedAt: new Date().toISOString(), data }, null, 2);
}

export function importJson(text: string): AppData {
  const parsed = JSON.parse(text);
  const data = parsed && parsed.app === 'pr-tracker' ? parsed.data : parsed;
  return migrate(data);
}
