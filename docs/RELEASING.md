# Releasing

## Versioning

SemVer in `package.json` → used by the web build (`__APP_VERSION__`) and by Android
(`versionName`, and `versionCode = major*10000 + minor*100 + patch`). Update iOS
`MARKETING_VERSION` in Xcode when shipping to the App Store.

## Cut a release

1. Update `CHANGELOG.md` (a section `## [x.y.z] - YYYY-MM-DD`).
2. Bump `"version"` in `package.json`, then commit.
3. `git tag vX.Y.Z && git push origin main --tags`
4. The **Release** workflow builds and attaches:
   - `pr-tracker-vX.Y.Z.apk` / `.aab`: release-signed, when the signing secrets are set
   - `pr-tracker-vX.Y.Z-test-build-debug.apk`: only when the signing secrets are **not** set.
     A debuggable test build (debug key, `adb run-as` can read its data, WebView debugging on),
     not for general use; the release notes say so.
   - `pr-tracker-vX.Y.Z-web.zip`: static web build

   The keystore secrets are only passed to the "Decode signing key" and Gradle steps, never to
   `npm ci`, tests or the web build, and the decoded keystore is deleted after the build.

## Android signing (optional, needed for Play Store and stable upgrades)

Create a keystore once and keep it safe; losing it means you cannot update the app:

```bash
keytool -genkeypair -v -keystore prtracker-release.jks -alias prtracker -keyalg RSA -keysize 4096 -validity 10000
base64 -w0 prtracker-release.jks > keystore.b64     # PowerShell: [Convert]::ToBase64String([IO.File]::ReadAllBytes("prtracker-release.jks"))
```

Add repository secrets (GitHub → Settings → Secrets and variables → Actions):
`ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`.

Never commit the keystore (`*.jks` is git-ignored).

## Installing on an Android phone

1. Download the APK from the release (or CI run artifacts).
2. Open it on the phone and allow *Install unknown apps* for your browser/files app.
3. Debug and release builds have the same app ID but different signatures. Uninstall one
   before installing the other; export a backup first.

## iOS

- **Quick:** use the web app (GitHub Pages) → Safari → Share → *Add to Home Screen*.
- **Native:** on a Mac: `npm ci && npm run build && npx cap sync ios && npx cap open ios`, set a
  signing team, then run on your iPhone. App Store/TestFlight needs an Apple Developer account.
- The **iOS build check** workflow compiles for the simulator on demand.

## Web (GitHub Pages)

Every push to `main` deploys the PWA and the open-data mirror. Enable it once: repository
Settings → Pages → Source: **GitHub Actions**. (Pages on a private repo needs a paid plan.)
