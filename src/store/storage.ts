// Local-only persistence. Native apps use Capacitor Preferences (SharedPreferences /
// UserDefaults); the web build uses IndexedDB. Nothing is ever sent to a server.
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { clear, del, get, set } from 'idb-keyval';
import { emptyData, uid, type AppData } from '../domain/types';
import { DOC_KINDS } from '../domain/documents';
import { ACTIVITY_KINDS } from '../domain/history';
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

/**
 * Delete everything this app stored on the device: data, corrupt-data copies, reminder
 * bookkeeping, lock attempt counters, and every scheduled OS notification.
 */
export async function wipeData(): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    await Preferences.clear();
    try {
      const { LocalNotifications } = await import('@capacitor/local-notifications');
      const pending = await LocalNotifications.getPending();
      if (pending.notifications.length) await LocalNotifications.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) });
    } catch {
      /* notifications unavailable */
    }
  } else {
    await clear().catch(() => del(KEY).catch(() => undefined));
  }
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith('prtracker.')) localStorage.removeItem(k);
  } catch {
    /* ignore */
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
    history: d.history
      ? {
          ...d.history,
          addresses: arr<NonNullable<AppData['history']>['addresses'][number]>(d.history.addresses).filter((a) => a && isISODate(a.from)).map((a) => ({ ...a, id: typeof a.id === 'string' && a.id ? a.id : uid(), to: isoOrNull(a.to) })),
          activities: arr<NonNullable<AppData['history']>['activities'][number]>(d.history.activities)
            .filter((a) => a && isISODate(a.from) && (ACTIVITY_KINDS as string[]).includes(a.kind))
            .map((a) => ({ ...a, id: typeof a.id === 'string' && a.id ? a.id : uid(), to: isoOrNull(a.to) })),
          birthDate: isoOrUndef(d.history.birthDate),
        }
      : undefined,
    documents: d.documents
      ? {
          items: arr<NonNullable<AppData['documents']>['items'][number]>(d.documents.items)
            .filter((i) => i && (DOC_KINDS as string[]).includes(i.kind))
            .map((i) => ({ ...i, id: typeof i.id === 'string' && i.id ? i.id : uid(), issued: isoOrNull(i.issued), expires: isoOrNull(i.expires) })),
          checklist: d.documents.checklist && typeof d.documents.checklist === 'object' ? d.documents.checklist : {},
        }
      : undefined,
    lock: d.lock && typeof d.lock.pinHash === 'string' && typeof d.lock.salt === 'string' ? d.lock : null,
    onboarded: !!d.onboarded,
  };
}

/** Export file contents (JSON backup). */
/** Backup contents. The app-lock hash is device-specific and never exported (it could be brute-forced). */
export function exportJson(data: AppData): string {
  return JSON.stringify({ app: 'pr-tracker', exportedAt: new Date().toISOString(), data: { ...data, lock: null } }, null, 2);
}

/** Parse a backup. Any lock in the file is ignored; callers keep this device's lock. */
export function importJson(text: string): AppData {
  const parsed = JSON.parse(text);
  const data = parsed && parsed.app === 'pr-tracker' ? parsed.data : parsed;
  return { ...migrate(data), lock: null };
}
