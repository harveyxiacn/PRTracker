// Optional app-lock PIN. Only a salted PBKDF2 hash is stored (AppData.lock).
import { base64ToBytes, bytesToBase64, pbkdf2Bits, randomBytes } from './crypto';

export const PIN_ITERATIONS = 100_000;
export const PIN_RE = /^\d{4,8}$/;

export function isValidPin(pin: string): boolean {
  return PIN_RE.test(pin);
}

/** Throws Error('bad-pin') unless the PIN is 4–8 ASCII digits. */
export async function hashPin(pin: string, saltB64?: string): Promise<{ pinHash: string; salt: string }> {
  if (!isValidPin(pin)) throw new Error('bad-pin');
  const salt = saltB64 ? base64ToBytes(saltB64) : randomBytes(16);
  const bits = await pbkdf2Bits(pin, salt, PIN_ITERATIONS, 256);
  return { pinHash: bytesToBase64(bits), salt: bytesToBase64(salt) };
}

/** Constant-time comparison of two byte arrays (length is not secret). */
export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function verifyPin(pin: string, lock: { pinHash: string; salt: string }): Promise<boolean> {
  if (!isValidPin(pin) || !lock || typeof lock.pinHash !== 'string' || typeof lock.salt !== 'string') return false;
  try {
    const { pinHash } = await hashPin(pin, lock.salt);
    return timingSafeEqual(base64ToBytes(pinHash), base64ToBytes(lock.pinHash));
  } catch {
    return false;
  }
}
