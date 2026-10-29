// In-app updates for the Android APK published on GitHub Releases ("OTA"). Only in the GitHub
// build (VITE_OTA=1): a store build updates through the store. The check reads public release
// metadata from the GitHub API; nothing about the user or their data is sent. The native
// plugin (AppUpdaterPlugin.java) downloads, verifies checksum and signature, and opens the
// system installer, where the user confirms.
import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { isAndroidNative } from './widget';

export const RELEASES_API = 'https://api.github.com/repos/harveyxiacn/PRTracker/releases/latest';
const DOWNLOAD_PREFIX = 'https://github.com/harveyxiacn/PRTracker/releases/download/';
/** The release-signed APK; the debug "test-build" APK is never offered. */
const APK_NAME = /^pr-tracker-v\d+\.\d+\.\d+\.apk$/;

export interface ReleaseInfo {
  version: string;
  notes: string;
  page: string;
  published: string;
  apk: { name: string; url: string; size: number; sha256?: string } | null;
}

export type Version = [number, number, number];

export function parseVersion(v: unknown): Version | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(String(v ?? '').trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** True when `candidate` is a strictly higher version than `current`. */
export function isNewer(candidate: string, current: string): boolean {
  const a = parseVersion(candidate);
  const b = parseVersion(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
}

/** Validates the GitHub "latest release" JSON; returns null for drafts, pre-releases or junk. */
export function parseRelease(json: unknown): ReleaseInfo | null {
  if (!json || typeof json !== 'object') return null;
  const r = json as Record<string, unknown>;
  if (r.draft || r.prerelease) return null;
  const v = parseVersion(r.tag_name);
  if (!v) return null;
  const assets = Array.isArray(r.assets) ? (r.assets as Record<string, unknown>[]) : [];
  const a = assets.find((x) => typeof x?.name === 'string' && APK_NAME.test(x.name as string));
  const url = typeof a?.browser_download_url === 'string' ? (a.browser_download_url as string) : '';
  const digest = typeof a?.digest === 'string' ? /^sha256:([0-9a-f]{64})$/i.exec(a.digest as string)?.[1] : undefined;
  return {
    version: v.join('.'),
    notes: typeof r.body === 'string' ? r.body.slice(0, 4000) : '',
    page: typeof r.html_url === 'string' ? r.html_url : '',
    published: typeof r.published_at === 'string' ? r.published_at.slice(0, 10) : '',
    apk: a && url.startsWith(DOWNLOAD_PREFIX) ? { name: a.name as string, url, size: Number(a.size) || 0, sha256: digest?.toLowerCase() } : null,
  };
}

export async function fetchLatestRelease(fetchImpl: typeof fetch = fetch): Promise<ReleaseInfo | null> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 15_000);
  try {
    const res = await fetchImpl(RELEASES_API, { headers: { Accept: 'application/vnd.github+json' }, signal: ctl.signal, cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return parseRelease(await res.json());
  } finally {
    clearTimeout(timer);
  }
}

export interface AppUpdaterPlugin {
  download(opts: { url: string; fileName: string; sha256?: string }): Promise<{ path: string }>;
  install(opts: { path: string }): Promise<{ status: 'started' | 'needs-permission' }>;
  addListener(event: 'progress', cb: (p: { received: number; total: number }) => void): Promise<PluginListenerHandle>;
}

export const AppUpdater = registerPlugin<AppUpdaterPlugin>('AppUpdater');

/** In-app updates exist only in the Android GitHub build. */
export const otaSupported = () => isAndroidNative() && import.meta.env.VITE_OTA === '1';

/** Native rejection code → i18n key. */
export function updateErrorKey(code: unknown): string {
  switch (code) {
    case 'checksum': return 'upd.errChecksum';
    case 'signature': return 'upd.errSignature';
    case 'test-build': return 'upd.errTestBuild';
    case 'not-newer': return 'upd.latest';
    default: return 'upd.errNetwork';
  }
}

// Device-level preferences (not part of backups: they belong to this install, not to the data).
const PREFS_KEY = 'prtracker.updates';
export interface UpdatePrefs { auto: boolean; lastCheck: number }
export function loadUpdatePrefs(): UpdatePrefs {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') as Partial<UpdatePrefs>;
    return { auto: p.auto !== false, lastCheck: Number(p.lastCheck) || 0 };
  } catch {
    return { auto: true, lastCheck: 0 };
  }
}
export function saveUpdatePrefs(p: UpdatePrefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {
    /* storage unavailable: the check simply runs again next time */
  }
}

/** Automatic check at most once a day. */
export const AUTO_CHECK_MS = 24 * 60 * 60 * 1000;
