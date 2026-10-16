# Store launch kit (v1.0)

Everything needed to publish on Google Play and the App Store, except the parts that need the
owner's accounts. Status: **prepared, waiting for accounts.**

## 1. What the owner must do
| Step | Google Play | App Store |
|---|---|---|
| Account | Google Play Console ($25 one-time) | Apple Developer Program ($99/year) |
| Signing | Create the upload keystore (docs/RELEASING.md) and add the 4 GitHub secrets; enrol in Play App Signing | Create an App ID `io.github.harveyxiacn.prtracker`, distribution certificate and provisioning profile (or let Xcode manage them) |
| Build | Tag `vX.Y.Z` → the Release workflow attaches a signed `.aab` | On a Mac: `npm ci && npm run build && npx cap sync ios`, then Xcode → Product → Archive → Distribute (TestFlight) |
| Listing | Paste the texts below; upload screenshots | Same |
| Review | Content rating questionnaire, Data safety form (answers below) | App Privacy "nutrition label" (answers below), export compliance: uses only standard encryption (HTTPS, WebCrypto) → exempt |

## 2. Listing texts
**App name:** PR Tracker — Canada PR & Citizenship Days
**Short description (80):** Count days for Canadian citizenship & PR. Private: your data stays on your phone.
**Full description:**
> PR Tracker helps permanent residents and applicants plan their path in Canada — privately.
> • Citizenship countdown with the 1,095-day rule and half-day credit before PR
> • PR residency obligation (730 days), "must return by" dates and travel what-ifs
> • Hot-spot calendar of every day in and outside Canada
> • 32 programs: Express Entry, every PNP, Quebec, family sponsorship, permits — with timelines and predictions from IRCC data and community timelines
> • Documents & expiries, personal history for IMM 5669, CRS score and improvement planner
> • Maple, an on-device assistant in 19 languages
> • Household: track your spouse too; Android home-screen widget
> No account. No ads. No tracking. Everything stays on your device; optional encrypted backups.
> Not legal advice — always confirm with IRCC.

**Category:** Productivity (alt.: Travel & Local) · **Content rating:** Everyone · **Contact:** GitHub issues URL · **Privacy policy URL:** https://harveyxiacn.github.io/PRTracker/privacy.html

## 3. Google Play — Data safety answers
- Does the app collect or share any of the required user data types? **No.** (All data is stored on device only; the app downloads public data but sends none.)
- Is data encrypted in transit? **Yes** (HTTPS for public-data downloads).
- Can users request data deletion? **Yes** — Settings → Delete all data (data never leaves the device).
- Ads: **No.** Target audience: 18+ (adults managing immigration).

## 4. App Store — App Privacy
- **Data Not Collected.** No tracking. Required-reason APIs: UserDefaults (via Capacitor Preferences) — reason `CA92.1` (access info from the same app); add `PrivacyInfo.xcprivacy` to the App target in Xcode (template in `store/PrivacyInfo.xcprivacy`).
- `NSFaceIDUsageDescription` is set in Info.plist (biometric unlock).

## 5. Screenshots
Use the Visual QA workflow artifact (`screenshots/`, 390×844 @2x = 780×1688; Play requires 16:9–9:16 ≥ 1080 px on the short side for promo — upscale or capture on a device). Recommended set: Home, Calendar, Trips what-if (Maple), Timeline with curve, Documents, Household — in English plus each launch language.

## 6. Pre-launch checklist
- [ ] Signed release build installs and upgrades over the previous release
- [ ] Phone test pass (docs/TESTING.md) on Android 10+ and iOS 17+
- [ ] Independent security review of `src/security/*` and native code
- [ ] Content review of rules/FAQ by a licensed consultant (RCIC)
- [ ] Data schema frozen (`AppData.version` migration test for every older backup in `tests/fixtures/`)
