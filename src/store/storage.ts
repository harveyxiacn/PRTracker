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
    return migrate(JSON.parse(raw));
  } catch (e) {
    console.error('Failed to load data', e);
    return emptyData();
  }
}

export async function saveData(data: AppData): Promise<void> {
  const raw = JSON.stringify(data);
  if (Capacitor.isNativePlatform()) {
    await Preferences.set({ key: KEY, value: raw });
    return;
  }
  try {
    await set(KEY, raw);
  } catch {
    localStorageSet(raw);
  }
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
function localStorageSet(v: string) {
  try {
    localStorage.setItem(KEY, v);
  } catch {
    /* ignore */
  }
}

/** Fill defaults for fields added after the data was saved, and drop malformed rows. */
export function migrate(input: unknown): AppData {
  const base = emptyData();
  if (!input || typeof input !== 'object') return base;
  const d = input as Partial<AppData>;
  return {
    ...base,
    ...d,
    version: 1,
    profile: { ...base.profile, ...(d.profile ?? {}) },
    settings: {
      ...base.settings,
      ...(d.settings ?? {}),
      notifications: { ...base.settings.notifications, ...(d.settings?.notifications ?? {}) },
    },
    trips: Array.isArray(d.trips) ? d.trips.filter((t) => t && isISODate(t.departure)) : [],
    applications: Array.isArray(d.applications) ? d.applications.filter((a) => a && a.kind) : [],
    chat: Array.isArray(d.chat) ? d.chat.slice(-200) : [],
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
