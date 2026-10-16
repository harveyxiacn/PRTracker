// Android privacy screen: FLAG_SECURE blocks screenshots, screen recording and the preview
// in the recent-apps switcher. No-op on web/iOS. The native side remembers the last value and
// re-applies it at startup, before the web app loads.
import { isAndroidNative, PrTrackerNative } from './widget';

export async function setPrivacyScreen(enabled: boolean): Promise<void> {
  if (!isAndroidNative()) return;
  try {
    await PrTrackerNative.setSecure({ enabled: !!enabled });
  } catch (e) {
    console.warn('Privacy screen update failed', e);
  }
}

export function privacyScreenSupported(): boolean {
  return isAndroidNative();
}
