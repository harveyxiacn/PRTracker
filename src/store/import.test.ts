// Backup import must never take device-specific settings from the file, and must not let a
// crafted backup inject unknown values (language, URLs, malformed chat entries).
import { describe, expect, it } from 'vitest';
import { DEFAULT_DATA_URL, emptyData, type AppData } from '../domain/types';
import { encryptText } from '../security/crypto';
import { BackupImportError, exportJson, importJson, isSafeDataUrl, migrate, sanitizeSettings } from './storage';

const backup = (data: Record<string, unknown>) => JSON.stringify({ app: 'pr-tracker', exportedAt: '2026-01-01T00:00:00Z', data });

const device = (): AppData => ({
  ...emptyData(),
  settings: { ...emptyData().settings, dataUrl: 'https://mirror.example.org/data/' },
  privacyScreen: true,
  lock: { pinHash: 'h', salt: 's' },
});

describe('importJson keeps this device’s settings', () => {
  const evil = backup({
    settings: { language: 'fr', dataUrl: 'https://attacker.example/', theme: 'dark' },
    privacyScreen: false,
    lock: { pinHash: 'x', salt: 'y' },
    trips: [],
  });

  it('keeps dataUrl, privacyScreen and lock from the device', () => {
    const d = importJson(evil, device());
    expect(d.settings.dataUrl).toBe('https://mirror.example.org/data/');
    expect(d.privacyScreen).toBe(true);
    expect(d.lock).toEqual({ pinHash: 'h', salt: 's' });
    // Ordinary preferences still come from the backup.
    expect(d.settings.language).toBe('fr');
    expect(d.settings.theme).toBe('dark');
  });

  it('without a device, resets them instead of trusting the file', () => {
    const d = importJson(evil);
    expect(d.settings.dataUrl).toBe(DEFAULT_DATA_URL);
    expect(d.privacyScreen).toBeUndefined();
    expect(d.lock).toBeNull();
  });
});

describe('sanitizeSettings', () => {
  it('rejects unknown languages (the code is written into exported HTML)', () => {
    expect(sanitizeSettings({ language: 'en"><script>alert(1)</script>' }).language).toBe('en');
    expect(sanitizeSettings({ language: 'zh-Hant' }).language).toBe('zh-Hant');
  });
  it('resets wrong types and drops unknown keys', () => {
    const s = sanitizeSettings({ theme: 'neon', boundaryDaysPresent: 'yes', citizenshipBuffer: -5, notifications: { enabled: 'no', residency: false }, extra: 1 });
    expect(s.theme).toBe('system');
    expect(s.boundaryDaysPresent).toBe(true);
    expect(s.citizenshipBuffer).toBe(10);
    expect(s.notifications.enabled).toBe(true);
    expect(s.notifications.residency).toBe(false);
    expect('extra' in s).toBe(false);
  });
  it('only accepts https data URLs (http only for a local dev server)', () => {
    expect(isSafeDataUrl('https://example.org/data/')).toBe(true);
    expect(isSafeDataUrl('http://localhost:5173/data/')).toBe(true);
    expect(isSafeDataUrl('http://example.org/data/')).toBe(false);
    expect(isSafeDataUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeDataUrl(42)).toBe(false);
    // Empty = bundled data only (offline), a supported choice.
    expect(isSafeDataUrl('')).toBe(true);
    expect(sanitizeSettings({ dataUrl: '' }).dataUrl).toBe('');
    expect(sanitizeSettings({ dataUrl: 'data:text/plain,hi' }).dataUrl).toBe(DEFAULT_DATA_URL);
  });
});

describe('chat history', () => {
  it('drops malformed entries instead of crashing the Assistant screen', () => {
    const d = migrate({
      chat: [
        { role: 'user', text: 'hi', at: '2026-01-01T00:00:00Z' },
        { role: 'user', text: { evil: true }, at: '2026-01-01T00:00:00Z' },
        { role: 'system', text: 'x', at: 'y' },
        null,
        'text',
        { role: 'assistant', text: 'hello', at: '2026-01-01T00:00:01Z', extra: 1 },
      ],
    });
    expect(d.chat).toEqual([
      { role: 'user', text: 'hi', at: '2026-01-01T00:00:00Z' },
      { role: 'assistant', text: 'hello', at: '2026-01-01T00:00:01Z' },
    ]);
  });
  it('treats a non-array chat as empty', () => {
    expect(migrate({ chat: { 0: 'x' } }).chat).toEqual([]);
  });
});

describe('importJson refuses what it cannot read', () => {
  const code = (fn: () => unknown) => {
    try {
      fn();
    } catch (e) {
      return e instanceof BackupImportError ? e.code : 'other';
    }
    return 'none';
  };
  it('rejects an encrypted backup instead of restoring it as empty data', async () => {
    const enc = await encryptText(exportJson({ ...emptyData(), onboarded: true }), 'correct horse battery');
    expect(code(() => importJson(enc, device()))).toBe('encrypted');
  });
  it('rejects a backup whose data is not an object', () => {
    expect(code(() => importJson(JSON.stringify({ app: 'pr-tracker', data: 'abc' })))).toBe('invalid');
    expect(code(() => importJson('[]'))).toBe('invalid');
    expect(code(() => importJson('null'))).toBe('invalid');
  });
  it('still reads its own plain export', () => {
    const d = importJson(exportJson({ ...emptyData(), trips: [{ id: 't', departure: '2025-01-01', return: null }] }), device());
    expect(d.trips).toHaveLength(1);
  });
});
