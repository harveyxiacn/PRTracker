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

## Android signing (required for upgrades and in-app updates)

Without the signing secrets, every release is signed with a **new throw-away debug key** (each
GitHub runner generates its own), so a release can never be installed over the previous one
("App not installed" / "package conflicts with an existing package") and in-app updates are off.
With the secrets, every release is signed with the same key: phones update in place, from the
APK or from *Settings → App updates*.

The key lives in `signing/` on the build PC (`prtracker-release.jks` + `keystore.properties` with
its passwords; the folder is git-ignored). **Back that folder up** (password manager or an offline
drive): losing it means installed copies can never be updated again. Create a keystore once:

```bash
keytool -genkeypair -v -keystore prtracker-release.jks -alias prtracker -keyalg RSA -keysize 4096 -validity 10000
base64 -w0 prtracker-release.jks > keystore.b64     # PowerShell: [Convert]::ToBase64String([IO.File]::ReadAllBytes("prtracker-release.jks"))
```

Add repository secrets (GitHub → Settings → Secrets and variables → Actions):
`ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`.

Never commit the keystore (`*.jks` and `signing/` are git-ignored). For Google Play, use this key as
the *upload key* with Play App Signing.

## In-app updates (OTA, Android GitHub build)

The release workflow builds the web app with `VITE_OTA=1` only when it signs the APK. The app then
reads `https://api.github.com/repos/harveyxiacn/PRTracker/releases/latest` (at most once a day if
*Check automatically* is on, or on *Check for updates*), and offers `pr-tracker-vX.Y.Z.apk` when its
version is higher. `AppUpdaterPlugin.java` downloads only from this repository's release URLs,
compares the SHA-256 with the `digest` GitHub publishes for the asset, refuses an APK whose package
name differs, whose version isn't higher or whose signing certificate differs from the installed
app's, and then opens the Android installer (the user confirms; Android asks once to allow
"install unknown apps" for PR Tracker). So: **always bump the version** and keep publishing the
signed `pr-tracker-vX.Y.Z.apk` asset name.

## Installing on an Android phone

1. Download the APK from the release (or CI run artifacts).
2. Open it on the phone and allow *Install unknown apps* for your browser/files app.
3. Debug and release builds have the same app ID but different signatures. Uninstall one
   before installing the other; export a backup first. This also applies once when moving from
   a test build (v0.9.0 and earlier, all debug-signed) to the first release-signed build. After
   that, updates install over the existing app and keep its data.

## iOS

- **Quick:** use the web app (GitHub Pages) → Safari → Share → *Add to Home Screen*.
- **Native:** on a Mac: `npm ci && npm run build && npx cap sync ios && npx cap open ios`, set a
  signing team, then run on your iPhone. App Store/TestFlight needs an Apple Developer account.
- The **iOS build check** workflow compiles for the simulator on demand.

## Web (GitHub Pages)

Every push to `main` deploys the PWA and the open-data mirror. Enable it once: repository
Settings → Pages → Source: **GitHub Actions**. (Pages on a private repo needs a paid plan.)
