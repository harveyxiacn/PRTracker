// Passphrase-encrypted backups (WebCrypto PBKDF2-SHA256 + AES-256-GCM).
// Everything runs on-device with the platform's WebCrypto; no dependencies.

export interface EncryptedBackup {
  app: 'pr-tracker';
  format: 'enc-v1';
  kdf: { name: 'PBKDF2'; hash: 'SHA-256'; iterations: number; salt: string /* base64 */ };
  cipher: { name: 'AES-GCM'; iv: string /* base64 */ };
  data: string; // base64 ciphertext of the UTF-8 plaintext JSON
}

/** OWASP 2023 recommendation for PBKDF2-HMAC-SHA256. Older backups store their own count. */
export const KDF_ITERATIONS = 600_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;
/** Upper bound accepted when decrypting, so a crafted file can't hang the device. */
const MAX_ITERATIONS = 2_000_000;
const B64_RE = /^[A-Za-z0-9+/]*={0,2}$/;

function subtle(): SubtleCrypto {
  const s = globalThis.crypto?.subtle;
  if (!s) throw new Error('no-webcrypto');
  return s;
}

export function randomBytes(n: number) {
  return globalThis.crypto.getRandomValues(new Uint8Array(n));
}

/** Base64 encode in chunks so multi-megabyte inputs never overflow the call stack. */
export function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += CHUNK) {
    parts.push(String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK))));
  }
  return btoa(parts.join(''));
}

/** Throws Error('bad-format') for anything that isn't valid base64. */
export function base64ToBytes(b64: string) {
  if (typeof b64 !== 'string' || b64.length % 4 !== 0 || !B64_RE.test(b64)) throw new Error('bad-format');
  let bin: string;
  try {
    bin = atob(b64);
  } catch {
    throw new Error('bad-format');
  }
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const utf8 = (s: string) => new Uint8Array(new TextEncoder().encode(s));

export async function pbkdf2Bits(secret: string, salt: Uint8Array<ArrayBuffer>, iterations: number, bits = 256): Promise<Uint8Array<ArrayBuffer>> {
  const base = await subtle().importKey('raw', utf8(secret), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await subtle().deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, base, bits));
}

async function aesKey(passphrase: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<CryptoKey> {
  const raw = await pbkdf2Bits(passphrase, salt, iterations, 256);
  return subtle().importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

function parseBackup(text: string): EncryptedBackup | null {
  let o: unknown;
  try {
    o = JSON.parse(text);
  } catch {
    return null;
  }
  if (!o || typeof o !== 'object') return null;
  const b = o as Partial<EncryptedBackup>;
  const k = b.kdf;
  const c = b.cipher;
  const ok =
    b.app === 'pr-tracker' &&
    b.format === 'enc-v1' &&
    !!k && typeof k === 'object' && k.name === 'PBKDF2' && k.hash === 'SHA-256' &&
    Number.isInteger(k.iterations) && k.iterations > 0 && typeof k.salt === 'string' &&
    !!c && typeof c === 'object' && c.name === 'AES-GCM' && typeof c.iv === 'string' &&
    typeof b.data === 'string';
  return ok ? (b as EncryptedBackup) : null;
}

export function isEncryptedBackup(text: string): boolean {
  return typeof text === 'string' && parseBackup(text) !== null;
}

export async function encryptText(plaintext: string, passphrase: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const iv = randomBytes(IV_BYTES);
  const key = await aesKey(passphrase, salt, KDF_ITERATIONS);
  const ct = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv }, key, utf8(plaintext)));
  const backup: EncryptedBackup = {
    app: 'pr-tracker',
    format: 'enc-v1',
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: KDF_ITERATIONS, salt: bytesToBase64(salt) },
    cipher: { name: 'AES-GCM', iv: bytesToBase64(iv) },
    data: bytesToBase64(ct),
  };
  return JSON.stringify(backup);
}

/** Throws Error('bad-passphrase') when authentication fails, Error('bad-format') for malformed input. */
export async function decryptText(backupJson: string, passphrase: string): Promise<string> {
  const b = parseBackup(backupJson);
  if (!b || b.kdf.iterations > MAX_ITERATIONS) throw new Error('bad-format');
  const salt = base64ToBytes(b.kdf.salt);
  const iv = base64ToBytes(b.cipher.iv);
  const ct = base64ToBytes(b.data);
  // 16-byte GCM tag is appended to the ciphertext.
  if (salt.length < 8 || iv.length !== IV_BYTES || ct.length < 16) throw new Error('bad-format');
  const key = await aesKey(passphrase, salt, b.kdf.iterations);
  let pt: ArrayBuffer;
  try {
    pt = await subtle().decrypt({ name: 'AES-GCM', iv }, key, ct);
  } catch {
    throw new Error('bad-passphrase');
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(pt);
  } catch {
    throw new Error('bad-format');
  }
}
