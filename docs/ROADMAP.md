# Roadmap

PR Tracker ships in small, tested versions. Each version keeps the same principles: **local-only data, no
accounts, facts verified against IRCC, every language complete.** Dates are targets, not promises. Priorities
follow user feedback (open an issue).

Legend: ✅ released · 🚧 in progress · 🗓️ planned · 💡 exploring

---

## ✅ v0.1 — Core tracker (2026-10-16)
- Citizenship physical presence (1,095 days, ½-day pre-PR credit up to 365) and earliest/safe dates
- PR residency obligation (730 days), "must return by", regain date; PR card renewal window (9 months)
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

## 🚧 v0.4 — Household, widgets & quality (in progress)
- **Household:** track a spouse or family member's days; "apply together from" date
- **Android home-screen widget** (citizenship countdown, residency, PR card) and **block screenshots** option
- **Processing-time trends** charts from daily IRCC snapshots
- **Reddit timelines (opt-in):** weekly ingestion via the official API once the maintainer adds API keys
- **Demo mode** ("try with sample data") and **visual QA**: automated phone-size screenshots of every
  screen in 4 languages (incl. RTL) on each pull request
- History gaps by **month** (as IRCC forms ask), optional

## 🗓️ v0.5 — iOS & accessibility
- iOS native polish: WidgetKit widget, Face ID / Touch ID unlock, TestFlight build pipeline
  (needs an Apple Developer account)
- Fingerprint / face unlock on Android (BiometricPrompt)
- Accessibility audit from the visual-QA run: screen-reader labels, contrast, large text, reduced motion
- Native-speaker translation review programme; new languages: বাংলা, தமிழ், ગુજરાતી, Русский, Українська
- Performance budget in CI (main bundle < 400 KB, first paint on low-end Android)

## 🗓️ v0.6 — Application helper
- Export **citizenship "absences from Canada"** table and **IMM 5669** history in form order
- **CBSA travel-history import** (paste the text of your CBSA/ATIP response) with matching to logged trips
- Presence calculator report in the same layout as IRCC's calculator, ready to compare
- PR card renewal helper: residency obligation at the signing date, document checklist, photo specs
- Smarter reminders: "your language test expires before your likely ITA" style cross-checks

## 🗓️ v0.7 — Community 2.0
- Predictions by office and stream with "% of people finished by day N" curves
- Alerts when IRCC processing times change for your application type or country
- Moderation tools for the open dataset (spam/duplicate detection, review queue)
- Optional data partnership with forums (only with permission; no scraping)

## 💡 v0.8 — Serverless sync
- End-to-end encrypted transfer between your devices (QR code / file), still with no backend
- Household sharing between two phones via encrypted files

## 🗓️ v1.0 — Store launch
- Google Play and App Store releases with release signing, privacy labels and store listings
- Independent security review; content review with a licensed immigration consultant (RCIC)
- Stable data schema with guaranteed migrations and long-term backup compatibility

## Out of scope (for now)
- Any server that stores personal data, analytics, ads or tracking
- Legal advice or filing applications on the user's behalf
- Immigration systems other than Canada's
