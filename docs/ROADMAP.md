# Roadmap

PR Tracker ships in small, tested versions. Each version keeps the same principles: **local-only data, no
accounts, facts verified against IRCC, every language complete.** Dates are targets, not promises. Priorities
follow user feedback (open an issue).

Legend: ✅ released · 🚧 in progress · 🗓️ planned · 💡 exploring

---

## ✅ v0.1 — Core tracker (2026-10-16)
- Citizenship physical presence (1,095 days, ½-day pre-PR credit up to 365) and earliest/safe dates
- PR residency obligation (730 days), "must return by", regain date; PR card renewal window (expiry − 270 days)
- Trips (past, ongoing, planned), hot-spot calendar, application timelines with predictions
- CRS estimator + CEC/FSW/FST checks; Maple on-device assistant (EN/中文); local reminders
- Android APK via CI, PWA on GitHub Pages, daily IRCC data mirror, community timeline intake

## ✅ v0.2 — For applicants worldwide (2026-10-16)
- 32-program catalogue: Express Entry, PNP for every province (EOI → nomination), Quebec, AIP/RCIP/FCIP,
  caregivers, Start-up Visa, family, humanitarian, study/work/visitor permits, PGWP, PRTD
- IRCC per-country processing times; program status badges (paused/changing)
- "Paste a timeline" parser for Reddit/CanadaVisa/WeChat posts; CanadaVisa search
- Eligibility: CRS vs latest draw per category; program explorer
- Maple v2: data queries, travel budget to a target date, best trip timing, explanations, FAQ + glossary
- 14 languages incl. RTL (العربية, فارسی, اردو)

## ✅ v0.3 — Paperwork & privacy (2026-10-16)
- Documents & expiries (validity rules, reminders, per-program checklists)
- Personal history for IMM 5669 / citizenship with gap detection and export
- CRS improvement planner
- Encrypted backups, PIN app lock, calendar (.ics) export
- Code-splitting and lighter offline cache

## ✅ v0.4 — Household, widgets & quality (2026-10-16)
- **Household:** track a spouse or family member's days; "apply together from" date
- **Android home-screen widget** (citizenship countdown, residency, PR card) and **block screenshots** option
- **Processing-time trends** charts from daily IRCC snapshots
- **Reddit timelines (opt-in):** weekly ingestion via the official API once the maintainer adds API keys
- **Demo mode** ("try with sample data") and **visual QA**: automated phone-size screenshots of every
  screen in 4 languages (incl. RTL) on each pull request
- History gaps by **month** (as IRCC forms ask), optional

## ✅ v0.5 — Accessibility, biometrics & languages (released in 0.8.0, 2026-10-16)
- ✅ Face ID / Touch ID / fingerprint unlock (PIN stays as the fallback)
- ✅ Accessibility: focus-trapped sheets, skip link, 44px touch targets, WCAG AA contrast, forced colours,
  automated axe audit (WCAG 2.1 AA) in visual QA
- ✅ Performance budget in CI (first-load JS ≤ 140 kB gzip)
- ✅ New languages: বাংলা, தமிழ், ગુજરાતી, Русский, Українська (19 in total)
- ⛔ iOS WidgetKit widget and TestFlight pipeline: blocked until an Apple Developer account is available
- 🗓️ Native-speaker translation review programme (volunteers welcome: open an issue)

## ✅ v0.6 — Application helper (released in 0.8.0)
- ✅ Citizenship **absences from Canada** list for any application date, CSV export
- ✅ Printable physical-presence report to compare with IRCC's calculator
- ✅ **CBSA travel-history import** (paste the report text) with matching to logged trips
- ✅ PR card renewal check: residency obligation on the signing date, 270-day window, document links
- ✅ Smart cross-checks: language test / passport / PR card / medical / permit expiring at the wrong time
- 🗓️ Photo specifications helper for PR card and citizenship photos

## ✅ v0.7 — Community 2.0 (released in 0.8.0)
- ✅ "% of similar applicants finished by day N" curves (office → province → country → program)
- ✅ Alerts when IRCC processing times change for your application type or country
- ✅ Moderation report for the open dataset (duplicates, outliers, impossible order); intake explains rejections
- 💡 Optional data partnership with forums (only with permission; no scraping)

## ✅ v0.8 — Serverless sharing (released in 0.8.0)
- ✅ Send one household member's dates and trips to another phone as a passphrase-encrypted file
- ✅ Moving everything to a new phone: the encrypted backup (since v0.3)
- 💡 QR-code transfer between devices

## 🚧 v1.0 — Store launch
- ✅ UI/UX pass (2026-10-29): Home hierarchy, undo instead of confirm, draggable sheets with sticky actions, motion system with a reduced-motion variant
- ✅ Launch kit: privacy policy page, store listing text, data-safety answers, iOS privacy manifest (docs/STORE.md)
- ✅ Backup compatibility tests for every earlier backup format
- ⛔ Google Play and App Store releases with release signing (need the owner's Play Console and Apple Developer accounts)
- Independent security review; content review with a licensed immigration consultant (RCIC)
- Stable data schema with guaranteed migrations and long-term backup compatibility

## Out of scope (for now)
- Any server that stores personal data, analytics, ads or tracking
- Legal advice or filing applications on the user's behalf
- Immigration systems other than Canada's
