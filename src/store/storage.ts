// Local-only persistence. Native apps use Capacitor Preferences (SharedPreferences /
// UserDefaults); the web build uses IndexedDB. Nothing is ever sent to a server.
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { clear, createStore, del, get, keys, set, type UseStore } from 'idb-keyval';
import { DEFAULT_DATA_URL, emptyData, uid, type AppData } from '../domain/types';
import { DOC_KINDS } from '../domain/documents';
import { ACTIVITY_KINDS } from '../domain/history';
import { sanitizeHousehold } from '../domain/people';
import { isISODate } from '../domain/dates';
import { LANGUAGES } from '../i18n/languages';
import { isEncryptedBackup } from '../security/crypto';

const KEY = 'prtracker.data.v1';

// The web build has its own IndexedDB database instead of idb-keyval's shared default
// ("keyval-store"): other pages on the same github.io origin use that one too. Created lazily
// because createStore opens the database immediately (and tests have no IndexedDB).
let store: UseStore | undefined;
const prStore = () => (store ??= createStore('pr-tracker', 'kv'));
const MIGRATED = 'prtracker.storeMigrated';

/** One-time move of this app's keys from the shared default store (data saved before v0.8). */
async function migrateDefaultStore(): Promise<void> {
  if (await get(MIGRATED, prStore())) return;
  try {
    for (const k of await keys()) {
      if (typeof k !== 'string' || !k.startsWith('prtracker.')) continue;
      const v = await get(k);
      if ((await get(k, prStore())) === undefined) await set(k, v, prStore());
      await del(k);
    }
  } catch {
    /* no old store */
  }
  await set(MIGRATED, true, prStore());
}

export async function loadData(): Promise<AppData> {
  try {
    let raw: string | null | undefined;
    if (Capacitor.isNativePlatform()) raw = (await Preferences.get({ key: KEY })).value;
    else {
      await migrateDefaultStore().catch(() => undefined);
      raw = (await get<string>(KEY, prStore())) ?? localStorageGet();
    }
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
    await set(key, raw, prStore());
  } catch {
    localStorageSet(raw, key);
  }
}

export async function saveData(data: AppData): Promise<void> {
  await saveRaw(KEY, JSON.stringify(data));
}

/**
 * Delete everything this app stored on the device: data, corrupt-data copies, reminder
 * bookkeeping, lock attempt counters, every scheduled OS notification and export files left
 * in the cache. On the web only this app's own IndexedDB store is cleared.
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
    await import('../platform').then((m) => m.removeCachedExports()).catch(() => undefined);
  } else {
    await clear(prStore()).catch(() => del(KEY, prStore()).catch(() => undefined));
    // Leftovers in the shared default store (if the one-time move never ran): only our keys.
    try {
      for (const k of await keys()) if (typeof k === 'string' && k.startsWith('prtracker.')) await del(k);
    } catch {
      /* no default store */
    }
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

/**
 * Open-data mirror URLs the app will fetch from: https, or plain http only for a local
 * development server. Empty means "bundled data only, no network". Anything else
 * (javascript:, data:, garbage) is rejected.
 */
export function isSafeDataUrl(v: unknown): v is string {
  if (v === '') return true;
  if (typeof v !== 'string' || v.length > 500) return false;
  try {
    const u = new URL(v);
    return u.protocol === 'https:' || (u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1'));
  } catch {
    return false;
  }
}

const LANG_CODES = new Set(LANGUAGES.map((l) => l.code));
const THEMES = ['system', 'light', 'dark'] as const;
const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);

/** Settings from storage or a backup, field by field: unknown keys are dropped, bad values reset. */
export function sanitizeSettings(input: unknown): AppData['settings'] {
  const base = emptyData().settings;
  const s = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const n = (s.notifications && typeof s.notifications === 'object' ? s.notifications : {}) as Record<string, unknown>;
  const bn = base.notifications;
  const buffer = s.citizenshipBuffer;
  return {
    language: typeof s.language === 'string' && LANG_CODES.has(s.language) ? s.language : base.language,
    theme: (THEMES as readonly unknown[]).includes(s.theme) ? (s.theme as AppData['settings']['theme']) : base.theme,
    boundaryDaysPresent: bool(s.boundaryDaysPresent, base.boundaryDaysPresent),
    notifications: {
      enabled: bool(n.enabled, bn.enabled),
      citizenship: bool(n.citizenship, bn.citizenship),
      prCard: bool(n.prCard, bn.prCard),
      residency: bool(n.residency, bn.residency),
      tripReturn: bool(n.tripReturn, bn.tripReturn),
      ...(typeof n.documents === 'boolean' ? { documents: n.documents } : {}),
    },
    dataUrl: isSafeDataUrl(s.dataUrl) ? s.dataUrl : DEFAULT_DATA_URL,
    citizenshipBuffer: typeof buffer === 'number' && Number.isFinite(buffer) && buffer >= 0 && buffer <= 3650 ? Math.round(buffer) : base.citizenshipBuffer,
  };
}

type ChatEntry = NonNullable<AppData['chat']>[number];
/** Assistant history: keep well-formed entries only (a bad one would crash the chat screen). */
function sanitizeChat(v: unknown): ChatEntry[] {
  return arr<ChatEntry>(v)
    .filter((m) => m && typeof m === 'object' && (m.role === 'user' || m.role === 'assistant') && typeof m.text === 'string' && typeof m.at === 'string')
    .slice(-200)
    .map((m) => ({ role: m.role, text: m.text.slice(0, 20_000), at: m.at.slice(0, 40) }));
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
    settings: sanitizeSettings(d.settings),
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
    chat: sanitizeChat(d.chat),
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
    household: sanitizeHousehold(d.household),
    lock: d.lock && typeof d.lock.pinHash === 'string' && typeof d.lock.salt === 'string' ? d.lock : null,
    privacyScreen: typeof d.privacyScreen === 'boolean' ? d.privacyScreen : undefined,
    ptSeen: typeof d.ptSeen === 'string' && isISODate(d.ptSeen) ? d.ptSeen : undefined,
    onboarded: !!d.onboarded,
  };
}

/** Export file contents (JSON backup). */
/** Backup contents. The app-lock hash is device-specific and never exported (it could be brute-forced). */
export function exportJson(data: AppData): string {
  return JSON.stringify({ app: 'pr-tracker', exportedAt: new Date().toISOString(), data: { ...data, lock: null } }, null, 2);
}

/** Why importJson refused a file: 'encrypted' needs the passphrase first, 'invalid' is not a backup. */
export class BackupImportError extends Error {
  readonly code: 'encrypted' | 'invalid';
  constructor(code: 'encrypted' | 'invalid') {
    super(code);
    this.code = code;
    this.name = 'BackupImportError';
  }
}

/**
 * Parse a backup. Device-specific settings never come from the file: the app lock, the
 * screenshot block and the open-data URL are kept from `device` (this device's current data),
 * or reset when there is none. A shared "template" backup can't redirect where the app fetches
 * from or switch off the privacy screen.
 */
export function importJson(text: string, device?: AppData): AppData {
  // An encrypted backup must be decrypted first; read as plain JSON it would look like an empty one.
  if (isEncryptedBackup(text)) throw new BackupImportError('encrypted');
  const parsed = JSON.parse(text);
  const data = parsed && parsed.app === 'pr-tracker' ? parsed.data : parsed;
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new BackupImportError('invalid');
  const d = migrate(data);
  return {
    ...d,
    settings: { ...d.settings, dataUrl: device && isSafeDataUrl(device.settings.dataUrl) ? device.settings.dataUrl : DEFAULT_DATA_URL },
    privacyScreen: device?.privacyScreen,
    lock: device?.lock ?? null,
  };
}
