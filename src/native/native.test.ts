import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  native: false,
  platform: 'web',
  setWidgetSnapshot: vi.fn(async (_o: { json: string }) => undefined),
  setSecure: vi.fn(async (_o: { enabled: boolean }) => undefined),
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => m.native, getPlatform: () => m.platform },
  registerPlugin: () => ({ setWidgetSnapshot: m.setWidgetSnapshot, setSecure: m.setSecure, isSupported: vi.fn() }),
}));

import { privacyScreenSupported, setPrivacyScreen } from './privacy';
import { clip, normalizeSnapshot, resetWidgetCache, serializeSnapshot, updateWidgetSnapshot, type WidgetSnapshot } from './widget';

const snap = (over: Partial<WidgetSnapshot> = {}): WidgetSnapshot => ({
  updated: '2026-10-16T10:00:00.000Z',
  title: 'PR Tracker',
  lines: [
    { label: 'Citizenship', value: '412 days left', tone: 'good' },
    { label: 'Residency', value: 'On track', tone: 'good' },
    { label: 'PR card', value: 'Expires 2028-03-01', tone: 'warn' },
  ],
  ...over,
});

function setPlatform(p: 'web' | 'ios' | 'android') {
  m.native = p !== 'web';
  m.platform = p;
}

beforeEach(() => {
  setPlatform('web');
  resetWidgetCache();
  m.setWidgetSnapshot.mockClear();
  m.setSecure.mockClear();
});

describe('widget snapshot serialisation', () => {
  it('clip collapses whitespace and truncates with an ellipsis', () => {
    expect(clip('  a   b ', 10)).toBe('a b');
    expect(clip('abcdef', 6)).toBe('abcdef');
    expect(clip('abcdefg', 6)).toBe('abcde…');
    expect(clip(undefined, 5)).toBe('');
    // Counts code points, so emoji are not split in half.
    expect(clip('🍁🍁🍁🍁', 3)).toBe('🍁🍁…');
  });

  it('keeps at most 3 lines and drops empty ones', () => {
    const s = snap({
      lines: [
        { label: '', value: ' ' },
        { label: 'A', value: '1' },
        { label: 'B', value: '2' },
        { label: 'C', value: '3' },
        { label: 'D', value: '4' },
      ],
    });
    expect(normalizeSnapshot(s).lines.map((l) => l.label)).toEqual(['A', 'B', 'C']);
  });

  it('drops unknown tones and truncates long strings', () => {
    const s = snap({
      title: 'x'.repeat(60),
      lines: [{ label: 'L'.repeat(50), value: 'V'.repeat(30), tone: 'nope' as 'good' }],
    });
    const n = normalizeSnapshot(s);
    expect(n.title).toHaveLength(40);
    expect(n.lines[0].label).toHaveLength(32);
    expect(n.lines[0].value).toHaveLength(24);
    expect(n.lines[0].tone).toBeUndefined();
  });

  it('serialises to the JSON shape the Android widget reads', () => {
    const parsed = JSON.parse(serializeSnapshot(snap({ route: 'home' })));
    expect(parsed).toEqual({
      updated: '2026-10-16T10:00:00.000Z',
      title: 'PR Tracker',
      lines: [
        { label: 'Citizenship', value: '412 days left', tone: 'good' },
        { label: 'Residency', value: 'On track', tone: 'good' },
        { label: 'PR card', value: 'Expires 2028-03-01', tone: 'warn' },
      ],
      route: 'home',
    });
    expect('route' in JSON.parse(serializeSnapshot(snap()))).toBe(false);
  });
});

describe('platform behaviour', () => {
  it('does nothing on web and iOS', async () => {
    for (const p of ['web', 'ios'] as const) {
      setPlatform(p);
      await expect(updateWidgetSnapshot(snap())).resolves.toBeUndefined();
      await expect(setPrivacyScreen(true)).resolves.toBeUndefined();
      expect(privacyScreenSupported()).toBe(false);
    }
    expect(m.setWidgetSnapshot).not.toHaveBeenCalled();
    expect(m.setSecure).not.toHaveBeenCalled();
  });

  it('calls the plugin on Android and skips identical snapshots', async () => {
    setPlatform('android');
    expect(privacyScreenSupported()).toBe(true);
    await updateWidgetSnapshot(snap());
    await updateWidgetSnapshot(snap({ updated: '2026-10-17T10:00:00.000Z' }));
    expect(m.setWidgetSnapshot).toHaveBeenCalledTimes(1);
    expect(JSON.parse(m.setWidgetSnapshot.mock.calls[0][0].json).lines).toHaveLength(3);
    await updateWidgetSnapshot(snap({ lines: [] }));
    expect(m.setWidgetSnapshot).toHaveBeenCalledTimes(2);

    await setPrivacyScreen(true);
    expect(m.setSecure).toHaveBeenCalledWith({ enabled: true });
  });

  it('swallows native errors and retries the same snapshot next time', async () => {
    setPlatform('android');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    m.setWidgetSnapshot.mockRejectedValueOnce(new Error('boom'));
    await expect(updateWidgetSnapshot(snap())).resolves.toBeUndefined();
    await updateWidgetSnapshot(snap());
    expect(m.setWidgetSnapshot).toHaveBeenCalledTimes(2);
    m.setSecure.mockRejectedValueOnce(new Error('no activity'));
    await expect(setPrivacyScreen(false)).resolves.toBeUndefined();
    warn.mockRestore();
  });
});
