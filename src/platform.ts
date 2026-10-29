// Thin wrappers for things that differ between the web build and the native apps.
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

export const isNative = () => Capacitor.isNativePlatform();

/**
 * True while a system picker / share sheet we opened is in front of the app. The app lock
 * uses it so that choosing a backup file doesn't re-lock and lose the screen's state.
 */
let externalDepth = 0;
export const inExternalActivity = () => externalDepth > 0;
/** Run a call that briefly leaves the app (share sheet, picker, biometric prompt) without locking it. */
export async function external<T>(fn: () => Promise<T>): Promise<T> {
  externalDepth++;
  try {
    return await fn();
  } finally {
    // Leave a short grace period: the "visible" event can arrive just after the promise.
    setTimeout(() => (externalDepth = Math.max(0, externalDepth - 1)), 1500);
  }
}

export async function openExternal(url: string) {
  if (isNative()) await Browser.open({ url });
  else window.open(url, '_blank', 'noopener,noreferrer');
}

/** Every file the app writes for sharing starts with this, so leftovers can be found and removed. */
export const EXPORT_PREFIX = 'pr-tracker-';

/** Save a text file: share sheet on native, download on web. */
export async function saveTextFile(name: string, text: string, mime = 'application/json') {
  if (isNative()) {
    const path = name.startsWith(EXPORT_PREFIX) ? name : EXPORT_PREFIX + name;
    const res = await Filesystem.writeFile({ path, data: text, directory: Directory.Cache, encoding: Encoding.UTF8 });
    try {
      await external(() => Share.share({ title: name, url: res.uri, dialogTitle: name }));
    } finally {
      // The receiving app has its copy once the share sheet closes; a backup must not stay in the cache.
      await Filesystem.deleteFile({ path, directory: Directory.Cache }).catch(() => undefined);
    }
    return;
  }
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function pickTextFile(accept: string): Promise<string | null> {
  return external(() => pickTextFileInner(accept));
}

function pickTextFileInner(accept: string): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => {
      const f = input.files?.[0];
      if (!f) return resolve(null);
      f.text().then(resolve, () => resolve(null));
    };
    input.click();
  });
}

/** Delete export files left in the native cache (e.g. if the app was killed while sharing). */
export async function removeCachedExports(): Promise<void> {
  if (!isNative()) return;
  try {
    const { files } = await Filesystem.readdir({ path: '', directory: Directory.Cache });
    for (const f of files) {
      if (f.type === 'file' && f.name.startsWith(EXPORT_PREFIX)) await Filesystem.deleteFile({ path: f.name, directory: Directory.Cache }).catch(() => undefined);
    }
  } catch {
    /* cache unreadable or empty */
  }
}
