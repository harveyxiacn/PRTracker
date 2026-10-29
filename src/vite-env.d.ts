/// <reference types="vite/client" />
declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  /** "1" in the GitHub release build: enables in-app updates (Android). */
  readonly VITE_OTA?: string;
}
