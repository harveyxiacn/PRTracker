// Android home-screen widget snapshot. The app writes a small precomputed snapshot (with
// already-localised labels); the native widget (PrTrackerWidget.java) only displays it.
// No-op on web/iOS. Never put names, document numbers or free text in a snapshot: the
// widget is visible on the home screen.
import { Capacitor, registerPlugin } from '@capacitor/core';

export interface WidgetSnapshot {
  updated: string; // ISO timestamp
  title: string; // e.g. "PR Tracker"
  lines: { label: string; value: string; tone?: 'good' | 'warn' | 'critical' }[]; // max 3
  /** Deep link route opened when tapping the widget, e.g. "home". */
  route?: string;
}

/** Native bridge for the local Android plugin registered in MainActivity. */
export interface PrTrackerNativePlugin {
  setWidgetSnapshot(opts: { json: string }): Promise<void>;
  setSecure(opts: { enabled: boolean }): Promise<void>;
  isSupported(): Promise<{ widget: boolean; secure: boolean }>;
}

export const PrTrackerNative = registerPlugin<PrTrackerNativePlugin>('PrTrackerNative');

/** True only inside the Android app, where the local plugin exists. */
export const isAndroidNative = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';

export const MAX_WIDGET_LINES = 3;
const MAX_TITLE = 40;
const MAX_LABEL = 32;
const MAX_VALUE = 24;
const TONES = new Set(['good', 'warn', 'critical']);

/** Collapse whitespace and cut to `max` characters (code points), ending with an ellipsis. */
export function clip(s: unknown, max: number): string {
  const text = String(s ?? '').replace(/\s+/g, ' ').trim();
  const chars = Array.from(text);
  return chars.length <= max ? text : chars.slice(0, max - 1).join('').trimEnd() + '…';
}

/** Normalise a snapshot to what the widget can show: max 3 lines, short strings, known tones. */
export function normalizeSnapshot(s: WidgetSnapshot): WidgetSnapshot {
  const lines = (s.lines ?? [])
    .filter((l) => l && (String(l.label ?? '').trim() || String(l.value ?? '').trim()))
    .slice(0, MAX_WIDGET_LINES)
    .map((l) => {
      const line: WidgetSnapshot['lines'][number] = { label: clip(l.label, MAX_LABEL), value: clip(l.value, MAX_VALUE) };
      if (l.tone && TONES.has(l.tone)) line.tone = l.tone;
      return line;
    });
  const out: WidgetSnapshot = { updated: String(s.updated ?? ''), title: clip(s.title, MAX_TITLE), lines };
  if (s.route) out.route = clip(s.route, 64);
  return out;
}

/** JSON string handed to the native side (stored in the private "prtracker_widget" prefs). */
export function serializeSnapshot(s: WidgetSnapshot): string {
  return JSON.stringify(normalizeSnapshot(s));
}

// Skip identical writes so callers can update on every insights change. `updated` is ignored
// for this comparison, otherwise every call would look different.
let lastKey: string | null = null;

/** Test hook: forget the last snapshot sent. */
export function resetWidgetCache() {
  lastKey = null;
}

export async function updateWidgetSnapshot(s: WidgetSnapshot): Promise<void> {
  if (!isAndroidNative()) return;
  const json = serializeSnapshot(s);
  const key = JSON.stringify({ ...normalizeSnapshot(s), updated: '' });
  if (key === lastKey) return;
  try {
    await PrTrackerNative.setWidgetSnapshot({ json });
    lastKey = key;
  } catch (e) {
    // The widget is a convenience; never break the app over it.
    console.warn('Widget update failed', e);
  }
}
