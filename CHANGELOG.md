# Changelog

All notable changes to this project are documented here. Format: [Keep a Changelog](https://keepachangelog.com), versions: SemVer.

## [0.8.0] - 2026-10-16

One release covering roadmap milestones v0.5 to v0.8.

### Added
- **Biometric unlock (v0.5):** Face ID, Touch ID or fingerprint instead of typing the PIN, on Android and iOS. The PIN always remains as the fallback, and nothing biometric is stored by the app.
- **Accessibility (v0.5):**
  - Sheets trap focus, return it to the opener and close with Escape (nested sheets handled).
  - A skip-to-content link, translated close labels and visible focus rings everywhere.
  - Touch targets at least 44px, WCAG AA contrast for small text and calendar day numbers, and forced-colours support.
  - An automated axe audit (WCAG 2.1 AA) of 10 screens in English and Arabic runs with visual QA.
- **Performance budget in CI (v0.5):** the build fails if the first-load bundle grows past 140 kB gzip (it is 137 kB).
- **Five new languages (v0.5):** বাংলা, தமிழ், ગુજરાતી, Русский, Українська, all complete, with Maple keywords (19 languages in total). Maple also reads Bengali, Gujarati and Tamil digits.
- **Application helper (v0.6), a new screen:**
  - The citizenship **absences from Canada** list for any application date, with days counted the way IRCC counts them. Exports to CSV.
  - A printable **physical-presence report**: periods before and after PR, credited days and absences, to compare with IRCC's calculator.
  - A **PR card renewal check**: the residency obligation on the day you sign, whether you are in the 9-month renewal window, and links to the official forms.
- **CBSA travel-history import (v0.6):** paste the text of your CBSA Travel History Report. The app finds the entry and exit dates (many formats, English and French), matches them to your trips within a day, and lets you add the ones you missed. The pasted text is never saved.
- **Smart cross-checks (v0.6) on Home**, for example:
  - a language test expiring before your Express Entry submission;
  - a passport or PR card expiring during a planned trip;
  - a medical exam or work permit running out while your PR application is in progress;
  - tax years missing for citizenship.
- **Community 2.0 (v0.7):**
  - "**N% of similar applicants had finished by day X**" curves on each application. They use the same office if there's enough data, otherwise the province, country or program.
  - **Processing-time alerts** on Home when IRCC's published time changes for your application type or country.
  - A read-only moderation report for the open dataset (duplicates, outliers, impossible milestone order).
  - The intake workflow now comments on rejected submissions.
- **Encrypted person sharing (v0.8):** send one household member's dates and trips to another phone as a passphrase-encrypted `.prperson` file (AES-256-GCM, PBKDF2 600,000 iterations). Still no server. The file name never contains a name.
- **Maple:** new answers for "export my absences", "print my presence report", "check my trips against CBSA" and "what percent of people like me have finished by now?".
- **Store launch kit (v1.0 prep):** privacy policy page, store listing text, data-safety answers, an iOS privacy manifest (docs/STORE.md) and backup-compatibility tests for v0.1 and v0.3 backups.

### Changed
- Light theme: secondary text is darker. Dark theme: the accent is slightly deeper so white text on buttons passes contrast.

## [0.4.0] - 2026-10-16

### Added
- **Household:**
  - Track a spouse or family member. Each person has their own PR date, card, pre-PR status and trips.
  - A switcher in the top bar, a household card with an "apply together from" date, reminders for every member, and a Maple answer for "when can we apply together?".
- **Android home-screen widget:**
  - Shows the citizenship countdown, residency status and PR card (or the date you've been abroad since).
  - Built from a small, already-localised snapshot; no names or free text.
- **Block screenshots and app previews** (Android FLAG_SECURE), applied on cold start.
- **Processing-time trends:**
  - The daily IRCC mirror now keeps history (`ircc-history.json`).
  - Community shows step charts with a "+N days vs 90 days ago" figure, keyboard navigation and a table view.
- **Reddit timelines (opt-in):** weekly ingestion through Reddit's official API once the maintainer adds API keys (see docs/REDDIT.md). Only anonymised facts are stored; no ids, usernames or text.
- **Demo mode:** "Try with sample data" (`?demo=1`). Nothing is saved, and no notifications or widget updates are made.
- **Visual QA:** a Playwright workflow that screenshots 10 screens in 4 languages (incl. RTL) plus dark mode and checks for overflow, raw keys and console errors.
- **History:** an option to check gaps by month, as IRCC forms ask.
- **Roadmap:** docs/ROADMAP.md and a table in the README.

### Fixed
- Icons without an explicit size stretched to the full card width. Visual QA caught it.
- Calendar month and weekday names now follow the UI language.
- The Maple greeting is rebuilt once the language loads.

## [0.3.0] - 2026-10-16

### Added
- **Documents & expiries:**
  - Track passports, permits, language tests, ECA, medicals, police certificates and biometrics, with IRCC validity rules (language 2 years, ECA 5 years, medical 12 months, biometrics 10 years for temporary residence).
  - Expiry reminders, a document checklist for each program, and a "what documents do I need" answer in Maple.
  - Only metadata is stored, never document numbers.
- **Personal history:**
  - Addresses and activities for IMM 5669 (past 10 years or since age 18) and citizenship (5 years).
  - Gap and overlap detection, one-tap "fill this gap", CSV and copyable-table export.
- **CRS improvement planner:** ranked score improvements (language, French, work, education, spouse, PNP…), plan combination, and comparison with recent draws.
- **Security:**
  - Passphrase-encrypted backups (PBKDF2-SHA-256 600k + AES-256-GCM).
  - Optional PIN app lock with back-off; the screen is hidden in the app switcher and re-locks after 30 s in the background.
  - Calendar export (.ics) of reminders and trips.
- **Maple:** documents, checklist, history-gap and CRS-improvement intents in all 14 languages.

### Changed
- Screens and the Maple engine load on demand. Languages are no longer precached (precache went from 1.25 MB to about 0.55 MB).
- Canada added to the country list.

### Fixed (QA review)
- Backups no longer contain the PIN hash, and restoring a backup keeps this device's lock.
- "Delete all data" now also cancels scheduled notifications and removes leftover keys.
- Calendar export escapes semicolons correctly.
- No duplicate PR-card reminders; documents added close to expiry still get a reminder; checklists are removed with their application.
- Checklist facts: CEC has no tax documents; PGWP needs a language test (since 2024-11-01); citizenship tax filing is declared and police certificates are needed only in some cases; super visa insurance wording updated.
- Maple routing: generic "expired"/"documents"/"points" questions keep going to the right answers.

## [0.2.0] - 2026-10-16

For applicants worldwide: every major pathway, 14 languages and a smarter Maple.

### Added
- **Program catalogue (32 programs)** with program-specific steps:
  - Express Entry, plus PNP for every province (expression of interest → invitation → nomination, EE and paper-based)
  - Quebec (Arrima/PSTQ → CSQ, PEQ), AIP, rural and francophone community pilots, caregivers, Start-up Visa
  - Spousal (inland/outland), dependent child, parents and grandparents
  - Protected persons, H&C
  - Study, work and visitor permits, PGWP, spousal open work permit, PRTD
  - Paused or changing programs carry a status badge.
- **Per-country IRCC processing times** for study, work, visitor and super visa applications and for child sponsorship (daily mirror keeps IRCC's per-country series).
- **Paste a timeline**: an on-device parser for Reddit, CanadaVisa, Facebook and WeChat posts. It handles AOR/BIL/PPR/FD/P1/P2/eCOPR/passport steps, "Stream:" lines, DD/MM vs MM/DD per post, 2-digit and missing years, and visa office and country. You review it before applying or sharing. A CanadaVisa search button is added.
- **Eligibility**: your CRS against the latest draw in each category you qualify for (CEC, FSW, PNP, French, healthcare, STEM, trades…), plus an explorer of all programs with "Track".
- **Maple v2**:
  - Queries over your trips; a travel budget for a target application date (exact); best time for an N-day trip; "why is my date…" breakdowns.
  - 18 FAQ answers with official sources and a 32-term glossary of forum jargon.
  - Follow-up memory ("and 3 months?").
  - Keywords for every language, with Arabic, Persian, Devanagari and Gurmukhi digits supported.
- **14 languages**: English, Français, 简体中文, 繁體中文, Español, Português, हिन्दी, ਪੰਜਾਬੀ, Tagalog, Tiếng Việt, 한국어, العربية, فارسی, اردو. They are lazy-loaded, use RTL layout where needed and per-script fonts, and take country and month names from `Intl`.

### Fixed (independent review)
- Travel budget now accounts for already-planned trips; date ranges without a year stay in order; "March 2028" means the month; strict counting mode in what-ifs.
- Intent routing (glossary only for "what is X", questions not logged as returns, FAQ before explanations); FAQ scoring and context.
- Parser: "LABEL - date" lines, base-stream PNP posts, spelled-out program names, citizenship posts that mention landing.
- Language switching no longer mirrors untranslated screens and reschedules notifications in the new language; unknown program ids no longer crash.
- Community records: office names are restricted to a known list (no free text), duplicates are dropped, and sharing is blocked while any date is uncertain. The IRCC mirror has timeouts and retries and keeps the last good data.
- FAQ corrections: PR applicants must give biometrics every time; police certificates cover the last 10 years (an officer may ask for any time since age 18).

## [0.1.0] - 2026-10-16

First public build.

### Added
- Citizenship physical-presence engine (1,095 days, ½-day pre-PR credit capped at 365), earliest and “safe” application dates.
- PR residency obligation (730 days), maximum absence / must-return-by dates, regain date.
- PR card renewal window (9 months before expiry) and expiry tracking.
- Trips: past/ongoing/planned, back-dating, overlap checks, CSV import/export, live impact preview.
- Hot-spot calendar: year and month heat maps, per-year totals, 53-week strip on Home.
- Application timelines for Express Entry (CEC/FSW/FST), PNP, spousal, citizenship and PR card, with predictions from IRCC data and community timelines.
- Community dataset with anonymous, reviewed sharing through GitHub issues; daily IRCC processing-time and Express Entry draw mirror.
- CRS estimator and CEC/FSW/FST eligibility checks.
- Maple: on-device bilingual assistant with what-if trip simulation and trip logging.
- Local reminders (Capacitor LocalNotifications on Android/iOS; in-app on web).
- English and Simplified Chinese; light/dark themes; installable PWA; JSON backup/restore.
- CI (tests, web build, Android APK), release, Pages, data-refresh, community-intake and iOS build workflows.

### Fixed (pre-release review)
- Trip editor no longer loses focus while typing; numeric fields accept partial input.
- Edits are saved even if the app is closed immediately; corrupted storage is preserved, not overwritten.
- Ongoing trip length, nested trip overlaps, pre-arrival years in the calendar table, “abroad now” for trips with a known return date.
- Assistant intent and Chinese date/duration parsing fixes.
- Open-data responses are validated; workflows redeploy Pages after data updates.
