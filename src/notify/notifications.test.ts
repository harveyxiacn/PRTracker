// Reminder notifications are visible on the lock screen: with an app lock they must not reveal
// status, numbers or household names.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  schedule: vi.fn(async (_o: { notifications: { title: string; body: string }[] }) => undefined),
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true, getPlatform: () => 'android' },
}));
vi.mock('@capacitor/local-notifications', () => ({
  LocalNotifications: {
    checkPermissions: async () => ({ display: 'granted' }),
    getPending: async () => ({ notifications: [] }),
    cancel: async () => undefined,
    schedule: m.schedule,
  },
}));

import { notificationText, syncNotifications } from './notifications';
import { emptyData } from '../domain/types';
import type { Reminder } from '../domain/insights';

const t = (k: string, v?: Record<string, string | number>) => (k === 'app.name' ? 'PR Tracker' : k === 'sec.notifGeneric' ? 'GENERIC' : `${k}${v ? JSON.stringify(v) : ''}`);

const reminder: Reminder = {
  id: 'res-short',
  date: '2999-01-01',
  title: 'ppl.remTitle',
  body: 'rem.residencyBody',
  vars: { name: 'Sam', days: 42 },
  category: 'residency',
  severity: 'critical',
};

describe('notification text', () => {
  it('shows details without an app lock', () => {
    const n = notificationText(reminder, t);
    expect(n.title).toContain('Sam');
    expect(n.body).toContain('42');
  });
  it('is generic with an app lock: no names, numbers or status', () => {
    const n = notificationText(reminder, t, true);
    expect(n).toEqual({ title: 'PR Tracker', body: 'GENERIC' });
  });
});

describe('syncNotifications', () => {
  beforeEach(() => m.schedule.mockClear());
  it('schedules generic text when asked to', async () => {
    await syncNotifications([reminder], emptyData().settings, t, true);
    const sent = m.schedule.mock.calls[0][0].notifications[0];
    expect(sent.title).toBe('PR Tracker');
    expect(sent.body).toBe('GENERIC');
    expect(JSON.stringify(sent)).not.toContain('Sam');
  });
  it('schedules the full text otherwise', async () => {
    await syncNotifications([reminder], emptyData().settings, t);
    expect(m.schedule.mock.calls[0][0].notifications[0].title).toContain('Sam');
  });
});
