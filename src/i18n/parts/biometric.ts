// Strings for biometric unlock (src/security/biometric.ts, Settings › App lock and the lock screen),
// plus the app-wide accessibility strings added in v0.5 (skip link, dialog close button).
export const biometricEn: Record<string, string> = {
  // Settings › App lock
  'bio.toggle': 'Unlock with Face ID / fingerprint',
  'bio.toggleHint': 'Your PIN still works and is needed if biometrics fail or change.',
  'bio.enabled': 'Biometric unlock turned on',
  'bio.disabled': 'Biometric unlock turned off',

  // Lock screen and the system prompt
  'bio.use': 'Use Face ID / fingerprint',
  'bio.reason': 'Unlock PR Tracker',
  'bio.title': 'PR Tracker',
  'bio.cancel': 'Use PIN',
};

export const a11yEn: Record<string, string> = {
  'a11y.skip': 'Skip to content',
  'a11y.close': 'Close',
};
