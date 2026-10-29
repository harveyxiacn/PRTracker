// Local reminders. Native: scheduled OS notifications via Capacitor LocalNotifications
// (no push server, nothing leaves the device). Web: shown in-app; the browser
// Notification API is used for reminders that fall due while the app is open.
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import type { Reminder } from '../domain/insights';
import type { Settings } from '../domain/types';

type Translate = (key: string, vars?: Record<string, string | number>) => string;

/** Stable 31-bit numeric id per reminder id (LocalNotifications needs ints). */
export function notificationId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (Math.imul(31, h) + id.charCodeAt(i)) | 0;
  return Math.abs(h) % 2_000_000_000;
}

export function enabledReminders(reminders: Reminder[], s: Settings): Reminder[] {
  if (!s.notifications.enabled) return [];
  return reminders.filter((r) => s.notifications[r.category] !== false);
}

export async function requestPermission(): Promise<boolean> {
  if (Capacitor.isNativePlatform()) {
    const p = await LocalNotifications.requestPermissions();
    return p.display === 'granted';
  }
  if (typeof Notification === 'undefined') return false;
  if (Notification.permission === 'granted') return true;
  return (await Notification.requestPermission()) === 'granted';
}

/**
 * Title and body shown for a reminder. With `generic` (an app lock is set) the text carries no
 * numbers, names or status, because notifications are visible on the device lock screen.
 */
export function notificationText(r: Reminder, t: Translate, generic = false): { title: string; body: string } {
  if (generic) return { title: t('app.name'), body: t('sec.notifGeneric') };
  return { title: t(r.title, r.vars), body: t(r.body, r.vars) };
}

/** Replace all scheduled reminders with the current set. `generic` hides the reminder details. */
export async function syncNotifications(reminders: Reminder[], settings: Settings, t: Translate, generic = false): Promise<number> {
  const list = enabledReminders(reminders, settings).slice(0, 60);
  if (!Capacitor.isNativePlatform()) {
    showDueWebNotifications(list, t, generic);
    return list.length;
  }
  const perm = await LocalNotifications.checkPermissions();
  if (perm.display !== 'granted') return 0;
  const pending = await LocalNotifications.getPending();
  if (pending.notifications.length) await LocalNotifications.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) });
  const now = Date.now();
  const at = (r: Reminder) => {
    const [y, m, d] = r.date.split('-').map(Number);
    return new Date(y, m - 1, d, 9, 0, 0);
  };
  // A 09:00 slot that has already passed today would fire immediately on every re-sync.
  const upcoming = list.filter((r) => at(r).getTime() > now);
  if (!upcoming.length) return 0;
  await LocalNotifications.schedule({
    notifications: upcoming.map((r) => {
      return {
        id: notificationId(r.id),
        ...notificationText(r, t, generic),
        schedule: { at: at(r), allowWhileIdle: true },
        extra: { reminderId: r.id },
      };
    }),
  });
  return upcoming.length;
}

const SHOWN_KEY = 'prtracker.shownReminders';

function showDueWebNotifications(list: Reminder[], t: Translate, generic: boolean) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  const today = new Date();
  const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  let shown: string[] = [];
  try {
    shown = JSON.parse(localStorage.getItem(SHOWN_KEY) ?? '[]');
  } catch {
    shown = [];
  }
  for (const r of list) {
    const key = `${r.id}@${r.date}`;
    if (r.date === iso && !shown.includes(key)) {
      try {
        const { title, body } = notificationText(r, t, generic);
        new Notification(title, { body, icon: 'icon-192.png' });
      } catch {
        /* some mobile browsers only allow service-worker notifications */
      }
      shown.push(key);
    }
  }
  try {
    localStorage.setItem(SHOWN_KEY, JSON.stringify(shown.slice(-100)));
  } catch {
    /* ignore */
  }
}
