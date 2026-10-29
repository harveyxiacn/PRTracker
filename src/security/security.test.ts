import { describe, expect, it } from 'vitest';
import type { Reminder } from '../domain/insights';
import type { Trip } from '../domain/types';
import { base64ToBytes, bytesToBase64, decryptText, encryptText, isEncryptedBackup } from './crypto';
import { buildIcsAt, escapeText, foldLine, remindersToEvents, tripsToEvents } from './ics';
import { hashPin, timingSafeEqual, verifyPin } from './pin';

const t = (k: string, v?: Record<string, string | number>) => (v ? `${k}|${Object.entries(v).map(([a, b]) => `${a}=${b}`).join('|')}` : k);
const octets = (s: string) => new TextEncoder().encode(s).length;
const NOW = new Date(Date.UTC(2026, 9, 16, 12, 34, 56));

describe('crypto', () => {
  it('base64 helpers round-trip large buffers', () => {
    const b = new Uint8Array(300_000).map((_, i) => (i * 31) % 256);
    expect(base64ToBytes(bytesToBase64(b))).toEqual(b);
    expect(bytesToBase64(new Uint8Array([104, 105]))).toBe('aGk=');
    expect(() => base64ToBytes('a$==')).toThrow('bad-format');
  });

  it('round-trips Unicode text', async () => {
    const s = '{"note":"Toronto → 北京 🍁 مرحبا, ñ"}';
    const enc = await encryptText(s, 'correct horse');
    expect(isEncryptedBackup(enc)).toBe(true);
    expect(enc).not.toContain('Toronto');
    const o = JSON.parse(enc);
    expect(o.kdf.iterations).toBe(600_000);
    expect(base64ToBytes(o.kdf.salt).length).toBe(16);
    expect(base64ToBytes(o.cipher.iv).length).toBe(12);
    expect(await decryptText(enc, 'correct horse')).toBe(s);
  });

  it('round-trips a 2 MB string', async () => {
    const s = 'x🍁é'.repeat(350_000); // > 2 MB of UTF-8
    expect(octets(s)).toBeGreaterThan(2_000_000);
    const enc = await encryptText(s, 'long-passphrase');
    expect(await decryptText(enc, 'long-passphrase')).toBe(s);
  }, 30_000);

  it('uses a fresh salt and IV each time', async () => {
    const a = JSON.parse(await encryptText('same', 'passphrase'));
    const b = JSON.parse(await encryptText('same', 'passphrase'));
    expect(a.kdf.salt).not.toBe(b.kdf.salt);
    expect(a.cipher.iv).not.toBe(b.cipher.iv);
  });

  it('wrong passphrase throws bad-passphrase', async () => {
    const enc = await encryptText('secret', 'passphrase-1');
    await expect(decryptText(enc, 'passphrase-2')).rejects.toThrow('bad-passphrase');
  });

  it('tampered ciphertext throws', async () => {
    const enc = await encryptText('secret data here', 'passphrase-1');
    const o = JSON.parse(enc);
    const ct = base64ToBytes(o.data);
    ct[0] ^= 1;
    o.data = bytesToBase64(ct);
    await expect(decryptText(JSON.stringify(o), 'passphrase-1')).rejects.toThrow('bad-passphrase');
  });

  it('malformed input throws bad-format', async () => {
    await expect(decryptText('not json', 'x')).rejects.toThrow('bad-format');
    await expect(decryptText('{"app":"pr-tracker","data":{}}', 'x')).rejects.toThrow('bad-format');
    const o = JSON.parse(await encryptText('a', 'passphrase'));
    await expect(decryptText(JSON.stringify({ ...o, data: '!!!' }), 'passphrase')).rejects.toThrow('bad-format');
    await expect(decryptText(JSON.stringify({ ...o, cipher: { name: 'AES-GCM', iv: 'AAAA' } }), 'passphrase')).rejects.toThrow('bad-format');
  });

  it('isEncryptedBackup checks the shape', async () => {
    expect(isEncryptedBackup(await encryptText('a', 'passphrase'))).toBe(true);
    expect(isEncryptedBackup('{"app":"pr-tracker","exportedAt":"x","data":{}}')).toBe(false);
    expect(isEncryptedBackup('{"app":"pr-tracker","format":"enc-v1"}')).toBe(false);
    expect(isEncryptedBackup('garbage')).toBe(false);
    expect(isEncryptedBackup('null')).toBe(false);
  });
});

describe('pin', () => {
  it('hashes and verifies', async () => {
    const lock = await hashPin('1234');
    expect(lock.pinHash).not.toContain('1234');
    expect(base64ToBytes(lock.salt).length).toBe(16);
    expect(await verifyPin('1234', lock)).toBe(true);
    expect(await verifyPin('1235', lock)).toBe(false);
    expect(await verifyPin('12345', lock)).toBe(false);
    expect(await verifyPin('1234', { pinHash: 'bogus', salt: lock.salt })).toBe(false);
  });

  it('two hashes of the same PIN differ (salt), same salt is deterministic', async () => {
    const a = await hashPin('87654321');
    const b = await hashPin('87654321');
    expect(a.salt).not.toBe(b.salt);
    expect(a.pinHash).not.toBe(b.pinHash);
    expect((await hashPin('87654321', a.salt)).pinHash).toBe(a.pinHash);
  });

  it('rejects PINs that are not 4–8 digits', async () => {
    await expect(hashPin('123')).rejects.toThrow('bad-pin');
    await expect(hashPin('123456789')).rejects.toThrow('bad-pin');
    await expect(hashPin('12a4')).rejects.toThrow('bad-pin');
    await expect(hashPin('١٢٣٤')).rejects.toThrow('bad-pin'); // non-ASCII digits
  });

  it('timingSafeEqual', () => {
    expect(timingSafeEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2]))).toBe(true);
    expect(timingSafeEqual(new Uint8Array([1, 2]), new Uint8Array([1, 3]))).toBe(false);
    expect(timingSafeEqual(new Uint8Array([1]), new Uint8Array([1, 2]))).toBe(false);
  });
});

describe('ics', () => {
  const ev = { uid: 'a1', date: '2026-03-10', title: 'Hello' };

  it('uses CRLF everywhere and the calendar header', () => {
    const s = buildIcsAt([ev], NOW);
    expect(s.endsWith('\r\n')).toBe(true);
    expect(s.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
    const lines = s.split('\r\n');
    expect(lines.slice(0, 5)).toEqual(['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//PR Tracker//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH']);
    expect(lines).toContain('DTSTAMP:20261016T123456Z');
    expect(lines).toContain('END:VCALENDAR');
  });

  it('all-day DTEND is exclusive', () => {
    const one = buildIcsAt([ev], NOW).split('\r\n');
    expect(one).toContain('DTSTART;VALUE=DATE:20260310');
    expect(one).toContain('DTEND;VALUE=DATE:20260311');
    const span = buildIcsAt([{ ...ev, date: '2024-02-27', endDate: '2024-02-29' }], NOW).split('\r\n');
    expect(span).toContain('DTEND;VALUE=DATE:20240301'); // leap day + 1
    const yearEnd = buildIcsAt([{ ...ev, date: '2025-12-31' }], NOW).split('\r\n');
    expect(yearEnd).toContain('DTEND;VALUE=DATE:20260101');
  });

  it('stable UID', () => {
    const a = buildIcsAt([ev], NOW);
    const b = buildIcsAt([ev], new Date(0));
    expect(a).toContain('UID:a1@pr-tracker\r\n');
    expect(a.match(/UID:.*/)![0]).toBe(b.match(/UID:.*/)![0]);
  });

  it('escapes text', () => {
    // Each of \ ; , is preceded by one literal backslash; newlines become the two characters \n.
    expect(escapeText('a\\b;c,d\ne\r\nf')).toBe(String.raw`a\\b\;c\,d\ne\nf`);
    const s = buildIcsAt([{ ...ev, title: 'Tax, PR; card', description: 'line1\nline2' }], NOW);
    expect(s).toContain(String.raw`SUMMARY:Tax\, PR\; card` + '\r\n');
    expect(s).toContain('DESCRIPTION:line1\\nline2\r\n');
  });

  it('folds long Unicode lines at 75 octets without splitting characters', () => {
    const title = '公民申请提醒🍁'.repeat(12); // 3-byte CJK + 4-byte emoji
    const s = buildIcsAt([{ ...ev, title }], NOW);
    const physical = s.split('\r\n');
    for (const l of physical) expect(octets(l)).toBeLessThanOrEqual(75);
    expect(physical.some((l) => l.startsWith(' '))).toBe(true);
    expect(s).not.toContain('�');
    // Unfolding (remove CRLF + one space) restores the logical line.
    expect(s.replace(/\r\n /g, '')).toContain(`SUMMARY:${title}\r\n`);
    expect(foldLine('x'.repeat(75))).toBe('x'.repeat(75));
    expect(foldLine('x'.repeat(76))).toBe('x'.repeat(75) + '\r\n x');
    expect(foldLine('x'.repeat(74) + 'é')).toBe('x'.repeat(74) + '\r\n é'); // é is 2 octets
  });

  it('reminders become events with a 09:00 alarm', () => {
    const r: Reminder = { id: 'cit-1', date: '2026-11-02', title: 'rem.citTitle', body: 'rem.citBody', vars: { days: 5 }, category: 'citizenship', severity: 'info' };
    const evs = remindersToEvents([r], t);
    expect(evs[0]).toMatchObject({ uid: 'rem-cit-1', date: '2026-11-02', title: 'rem.citTitle|days=5', description: 'rem.citBody|days=5' });
    const s = buildIcsAt(evs, NOW);
    expect(s).toContain('UID:rem-cit-1@pr-tracker\r\n');
    expect(s).toContain('BEGIN:VALARM\r\nACTION:DISPLAY\r\nDESCRIPTION:rem.citTitle|days=5\r\nTRIGGER;RELATED=START:PT9H\r\nEND:VALARM\r\n');
  });

  it('trips: one event per trip, ongoing runs to today', () => {
    const trips: Trip[] = [
      { id: 'x', departure: '2026-01-10', return: '2026-01-20', destination: 'Japan' },
      { id: 'y', departure: '2026-10-01', return: null },
      { id: 'bad', departure: 'nope' },
    ];
    const evs = tripsToEvents(trips, '2026-10-16', t);
    expect(evs).toHaveLength(2);
    expect(evs[0]).toMatchObject({ uid: 'trip-x', date: '2026-01-10', endDate: '2026-01-20', title: 'sec.icsTripTitle|dest=Japan' });
    expect(evs[0].description).toContain('days=11');
    expect(evs[1]).toMatchObject({ uid: 'trip-y', date: '2026-10-01', endDate: '2026-10-16', title: 'sec.icsTripTitle|dest=sec.icsAbroad' });
    expect(evs[1].description).toBe('sec.icsTripOngoing|from=2026-10-01|today=2026-10-16|days=16');
    const s = buildIcsAt(evs, NOW);
    expect(s).toContain('DTSTART;VALUE=DATE:20261001\r\nDTEND;VALUE=DATE:20261017\r\n');
    expect(s).not.toContain('VALARM');
  });
});
