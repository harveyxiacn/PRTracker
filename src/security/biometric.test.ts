import { beforeEach, describe, expect, it, vi } from 'vitest';

// Same numbering as the plugin's BiometryType enum.
const BiometryType = { none: 0, touchId: 1, faceId: 2, fingerprintAuthentication: 3, faceAuthentication: 4, irisAuthentication: 5 } as const;

const m = vi.hoisted(() => ({
  native: false,
  check: vi.fn(),
  authenticate: vi.fn(),
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => m.native, getPlatform: () => (m.native ? 'ios' : 'web') },
}));

vi.mock('@aparajita/capacitor-biometric-auth', () => ({
  BiometryType: { none: 0, touchId: 1, faceId: 2, fingerprintAuthentication: 3, faceAuthentication: 4, irisAuthentication: 5 },
  BiometricAuth: { checkBiometry: m.check, authenticate: m.authenticate },
}));

import { authenticateBiometric, biometricInfo, biometryKind, resetBiometricCache } from './biometric';

const avail = (biometryType: number, extra: Record<string, unknown> = {}) => ({ isAvailable: true, biometryType, biometryTypes: [biometryType], ...extra });

beforeEach(() => {
  m.native = true;
  m.check.mockReset();
  m.authenticate.mockReset();
  resetBiometricCache();
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

describe('biometryKind', () => {
  it('maps every plugin enum value', () => {
    expect(biometryKind(BiometryType.faceId, BiometryType)).toBe('face');
    expect(biometryKind(BiometryType.faceAuthentication, BiometryType)).toBe('face');
    expect(biometryKind(BiometryType.touchId, BiometryType)).toBe('fingerprint');
    expect(biometryKind(BiometryType.fingerprintAuthentication, BiometryType)).toBe('fingerprint');
    expect(biometryKind(BiometryType.irisAuthentication, BiometryType)).toBe('iris');
    expect(biometryKind(BiometryType.none, BiometryType)).toBe('none');
    expect(biometryKind(99, BiometryType)).toBe('none');
    expect(biometryKind(undefined, BiometryType)).toBe('none');
    expect(biometryKind(2, undefined)).toBe('none');
  });
});

describe('biometricInfo', () => {
  it('is unavailable on web without touching the plugin', async () => {
    m.native = false;
    expect(await biometricInfo()).toEqual({ available: false, kind: 'none' });
    expect(m.check).not.toHaveBeenCalled();
  });

  it('reports Face ID on iOS', async () => {
    m.check.mockResolvedValue(avail(BiometryType.faceId));
    expect(await biometricInfo()).toEqual({ available: true, kind: 'face' });
  });

  it('reports an Android fingerprint sensor', async () => {
    m.check.mockResolvedValue(avail(BiometryType.fingerprintAuthentication));
    expect(await biometricInfo()).toEqual({ available: true, kind: 'fingerprint' });
  });

  it('reports iris', async () => {
    m.check.mockResolvedValue(avail(BiometryType.irisAuthentication));
    expect(await biometricInfo()).toEqual({ available: true, kind: 'iris' });
  });

  it('falls back to the list of types when the primary is none', async () => {
    m.check.mockResolvedValue({ isAvailable: true, biometryType: BiometryType.none, biometryTypes: [BiometryType.none, BiometryType.faceAuthentication] });
    expect(await biometricInfo()).toEqual({ available: true, kind: 'face' });
  });

  it('treats an unknown sensor type that is available as generic (fingerprint wording)', async () => {
    m.check.mockResolvedValue({ isAvailable: true, biometryType: 42 });
    expect(await biometricInfo()).toEqual({ available: true, kind: 'fingerprint' });
  });

  it('is unavailable when not enrolled', async () => {
    m.check.mockResolvedValue({ isAvailable: false, biometryType: BiometryType.faceId, reason: 'not enrolled' });
    expect(await biometricInfo()).toEqual({ available: false, kind: 'none' });
  });

  it('is unavailable when the plugin throws or returns nothing', async () => {
    m.check.mockRejectedValueOnce(new Error('plugin not implemented'));
    expect(await biometricInfo()).toEqual({ available: false, kind: 'none' });
    m.check.mockResolvedValueOnce(undefined);
    expect(await biometricInfo()).toEqual({ available: false, kind: 'none' });
  });
});

describe('authenticateBiometric', () => {
  it('returns false on web', async () => {
    m.native = false;
    expect(await authenticateBiometric('Unlock')).toBe(false);
    expect(m.authenticate).not.toHaveBeenCalled();
  });

  it('returns true on success and never allows the device passcode', async () => {
    m.check.mockResolvedValue(avail(BiometryType.faceId));
    m.authenticate.mockResolvedValue(undefined);
    expect(await authenticateBiometric({ reason: 'Unlock PR Tracker', cancelTitle: 'Use PIN', title: 'PR Tracker' })).toBe(true);
    expect(m.authenticate).toHaveBeenCalledTimes(1);
    const opts = m.authenticate.mock.calls[0][0];
    expect(opts).toMatchObject({ reason: 'Unlock PR Tracker', cancelTitle: 'Use PIN', androidTitle: 'PR Tracker', allowDeviceCredential: false, iosFallbackTitle: '' });
  });

  it('accepts a plain reason string', async () => {
    m.check.mockResolvedValue(avail(BiometryType.touchId));
    m.authenticate.mockResolvedValue(undefined);
    expect(await authenticateBiometric('Unlock')).toBe(true);
    expect(m.authenticate.mock.calls[0][0].reason).toBe('Unlock');
  });

  it('returns false on cancel / failure', async () => {
    m.check.mockResolvedValue(avail(BiometryType.faceId));
    m.authenticate.mockRejectedValue(Object.assign(new Error('User cancelled'), { code: 'userCancel' }));
    expect(await authenticateBiometric('Unlock')).toBe(false);
  });

  it('returns false without prompting when biometrics became unavailable', async () => {
    m.check.mockResolvedValue({ isAvailable: false, biometryType: BiometryType.none });
    expect(await authenticateBiometric('Unlock')).toBe(false);
    expect(m.authenticate).not.toHaveBeenCalled();
  });

  it('returns false when checkBiometry throws', async () => {
    m.check.mockRejectedValue(new Error('boom'));
    expect(await authenticateBiometric('Unlock')).toBe(false);
  });
});
