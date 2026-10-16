// Device biometrics (Face ID / Touch ID / Android BiometricPrompt) to unlock the app instead of
// typing the PIN. The PIN stays the fallback and the only way to set up the lock.
// Uses @aparajita/capacitor-biometric-auth ^9 (Capacitor 7). Unavailable on web: the plugin's web
// implementation is a simulator, so we never load it there (the import below is dynamic and
// only runs on a native platform).
import { Capacitor } from '@capacitor/core';

export interface BiometricInfo {
  available: boolean;
  kind: 'face' | 'fingerprint' | 'iris' | 'none';
}

export interface BiometricPromptText {
  /** Shown by iOS under "Face ID" and as the Android prompt description. */
  reason: string;
  /** Cancel button label (Android, and iOS Touch ID). */
  cancelTitle?: string;
  /** Android prompt title. */
  title?: string;
}

const UNAVAILABLE: BiometricInfo = { available: false, kind: 'none' };

type Plugin = typeof import('@aparajita/capacitor-biometric-auth');

let pluginPromise: Promise<Plugin | null> | null = null;
function loadPlugin(): Promise<Plugin | null> {
  if (!Capacitor.isNativePlatform()) return Promise.resolve(null);
  pluginPromise ??= import('@aparajita/capacitor-biometric-auth').catch((err) => {
    console.warn('biometric plugin', err);
    pluginPromise = null;
    return null;
  });
  return pluginPromise;
}

/** Test hook: forget the cached plugin module. */
export function resetBiometricCache() {
  pluginPromise = null;
}

/** Maps the plugin's BiometryType enum to our coarse kind. Unknown values count as 'none'. */
export function biometryKind(type: unknown, enumObj: Record<string, unknown> | undefined): BiometricInfo['kind'] {
  if (type === undefined || type === null || !enumObj) return 'none';
  if (type === enumObj.faceId || type === enumObj.faceAuthentication) return 'face';
  if (type === enumObj.touchId || type === enumObj.fingerprintAuthentication) return 'fingerprint';
  if (type === enumObj.irisAuthentication) return 'iris';
  return 'none';
}

export async function biometricInfo(): Promise<BiometricInfo> {
  try {
    const mod = await loadPlugin();
    if (!mod?.BiometricAuth) return UNAVAILABLE;
    const res = await mod.BiometricAuth.checkBiometry();
    if (!res?.isAvailable) return UNAVAILABLE;
    const enumObj = mod.BiometryType as unknown as Record<string, unknown>;
    // Android may report several sensors; prefer the primary type, then the first known one.
    let kind = biometryKind(res.biometryType, enumObj);
    if (kind === 'none' && Array.isArray(res.biometryTypes)) {
      kind = res.biometryTypes.map((x) => biometryKind(x, enumObj)).find((k) => k !== 'none') ?? 'none';
    }
    // Available but of an unknown kind (e.g. a new sensor type): still usable, show generic text.
    return { available: true, kind: kind === 'none' ? 'fingerprint' : kind };
  } catch (err) {
    console.warn('biometric check', err);
    return UNAVAILABLE;
  }
}

/** Resolves true only on a successful biometric check; false on cancel/failure/unavailable. */
export async function authenticateBiometric(reason: string | BiometricPromptText): Promise<boolean> {
  const text: BiometricPromptText = typeof reason === 'string' ? { reason } : reason;
  try {
    const mod = await loadPlugin();
    if (!mod?.BiometricAuth) return false;
    const res = await mod.BiometricAuth.checkBiometry();
    if (!res?.isAvailable) return false;
    await mod.BiometricAuth.authenticate({
      reason: text.reason,
      cancelTitle: text.cancelTitle,
      // The PIN is our fallback; never offer the device passcode instead of it.
      allowDeviceCredential: false,
      // Empty string hides the "Enter Password" fallback button on iOS.
      iosFallbackTitle: '',
      androidTitle: text.title,
      androidConfirmationRequired: false,
    });
    return true;
  } catch {
    // BiometryError: user cancel, lockout, no match, system cancel… all mean "use the PIN".
    return false;
  }
}
