# Changelog

All notable changes to this project are documented here. Format: [Keep a Changelog](https://keepachangelog.com), versions: SemVer.

## [Unreleased]

## [0.10.0] - 2026-10-29

### Added
- **In-app updates (Android, GitHub build):** *Settings → App updates* checks GitHub for a newer release (automatically at most once a day, or on demand), shows what's new and the size, downloads the APK with a progress bar and opens the Android installer. The download must come from this repository's releases, match GitHub's SHA-256 and be signed with the same key as the installed app; otherwise it is deleted and not offered for install. Not included in store builds (docs/STORE.md).

### Fixed
- **Releases can be installed over the previous version.** Releases were signed with a different throw-away debug key each time, so Android refused to install a new version over the old one ("App not installed"). Releases are now signed with one permanent release key. Moving from a test build (0.9.0 and earlier) to this first release-signed build needs **one** uninstall: export a backup first and restore it after installing. From then on, updates install in place and keep your data.

## [0.9.0] - 2026-10-29

Fixes from the pre-launch RCIC reviews of the immigration rules and content (2026-10-16), and a
UI/UX pass on hierarchy, interaction and motion across Home, Trips, Calendar, Timeline and Settings (2026-10-29).

### Added
- **Undo instead of "Are you sure?"** Deleting a trip happens at once and the toast offers *Undo* (6 s), which puts the saved trip back.
- **Drag a sheet down to close it.** Only the handle (grabber and title row) drags, so forms still scroll; release past a quarter of the height or flick to dismiss, otherwise it springs back. The close button, Escape and the backdrop do the same.
- **Motion system:** shared easing and duration tokens. Sheets slide in and out (dialogs on wide screens scale and fade), the backdrop fades, screens fade in on arrival, the citizenship ring sweeps and progress bars grow on first show, Maple's new messages rise in, toasts slide in and fade out, and everything tappable has press feedback. Hover tints only apply to devices that can hover.
- **Reduced motion** now keeps the feedback and drops only the travel: things cross-fade instead of sliding, sheets close at once and the tab pill and bars just appear. Before, every animation and transition was removed.
- Tapping the active tab again scrolls back to the top. Lazily loaded screens show card-shaped placeholders instead of "…".
- **Calendar:** the Year/Month switch, arrows and a *Today* button sit in the calendar card; swipe sideways to change month or year (the arrows stay); the new page slides in from the side it came from. Tap a month name in the year view to open it. The selected day has a colour swatch and an *Add trip* (from that day) or *Edit trip* button.
- **Timeline:** an application opens on its summary, prediction and milestones; the next step to watch for is highlighted; the editable fields are in a folded *Application details* card once submitted. Deleting an application is instant with *Undo* (its document checklist comes back too). Archived applications are folded into *Archived (n)*.
- **Settings:** a sticky index of the sections at the top; on/off settings are switches; *Delete all data* moved into its own *Danger zone*; the data-source address is under *Advanced*. Household and security sit with the other preferences, sharing next to your data.
- `scripts/visual-local.ps1` runs the Playwright suite on Windows against its own preview server; `PW_PORT` / `PW_BASE_URL` let the suite use another port or an already running server.

### Changed
- **Home leads with the answer.** The citizenship card comes first (with a soft hero tint), then residency and the PR card; long explanations ("what isn't counted", the IRPA s.28 exceptions) are behind *How this is counted*. Critical alerts stay at the very top; other alerts show the two most important with *Show N more*. The six buttons at the bottom became a swipeable row of quick actions under the numbers (including the Application helper, which no longer has its own card). Household, applications, the year strip and reminders follow.
- **Sheets keep their main action reachable:** Save (full width) and Delete sit in a sticky footer above the home indicator.
- **Trips:** planned trips use an outlined icon, rows show a chevron, and CSV import/export and the CBSA import are one card (the CSV column help is folded).
- **Chrome:** the demo banner is a slim strip, the top bar gets a hairline and shadow once content scrolls under it, the tab bar is translucent and marks the active tab with a pill behind the icon.
- Toasts stay 4 s (was 2.6 s) so a sentence can be read.
- Onboarding and the lock screen load on demand (shown once / only with a PIN), so first-load JS went down to 135.5 kB gzip (budget 140 kB) even with the new interaction code. While the lock screen loads, the screen stays blank, so nothing behind the lock is drawn.

### Fixed
- A second toast was hidden early by the first toast's timer.

### Fixed
- **PR card renewal window is now expiry − 270 days**, not 9 calendar months (273–276 days), which could tell you to apply up to 6 days before IRCC accepts a renewal (Guide 5445 / IMM 5444). One constant (`PR_CARD_RENEWAL_DAYS`) drives Home, reminders, the Application helper, Documents and Maple.
- New end-to-end tests: undo after deleting a trip or an application, and the PIN lock after a reload.
- End-to-end tests read the app's own IndexedDB store (`pr-tracker`/`kv`, used since the storage change) and expect the reviewed wording; the two restore tests that were marked as known bugs now pass and assert the fixed behaviour.
- **Strict mode "must return by" was one day too late.** With departure and return days counted as outside, the return day itself is an absence, so the last safe return day is one day earlier. Default mode was already correct. Brute-force tests now cover strict mode too.

### Changed
- **Citizenship wording no longer reads like a guarantee.** "Eligible to apply now" is now "Meets physical presence (estimate)", and reminders say "you may meet / may be able to apply". Home's citizenship card, Maple's citizenship answer and the Application helper (screen and print report) show what isn't counted (prison, parole, probation, time as a refugee claimant) and what else is required (taxes, language, test).
- **Time before PR:** the "other" status is now *Other authorized temporary resident status (e.g. TRP, maintained status)*. Settings explains that protected-person time counts from the positive decision and that time waiting on a refugee claim doesn't count.
- **Residency obligation:** Home, Maple, the "at risk" tip and the reminder now say that some days abroad can count (accompanying a Canadian-citizen spouse, partner or parent; full-time work for a Canadian business or public service), with a link to IRPA s.28. The wording is softer: "by this count", "get advice".
- **Maple** ends answers that give eligibility dates, counts or rules with the planning-only disclaimer.
- **Program status:** parents and grandparents sponsorship is *paused*. The Home Care Worker pilots and the Start-up Visa are *closed*. PEQ (temporary reopening 2026–2028), PSTQ, non-Express Entry PNP (online PR Portal), the Atlantic Immigration Program (*changing*, provincial endorsement limits) and the spousal open work permit have updated descriptions.
- **Express Entry categories:** physicians, senior managers and researchers are labelled "with Canadian work experience", and "Military" is now "Skilled military recruits". Agriculture is a past category and is no longer offered.
- **Knowledge base and glossary:** updated answers for BOWP, biometrics ("most PR applicants"), medical validity, police certificates, status checks, PR card renewal, the half-day credit and the residency exceptions (including the Crown-servant exception for citizenship). Dead or weak source links are fixed (biometrics, medical, PR card, BOWP). Forum-only terms (PPR, GU, FD, PVO, SVO) are marked as such.

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
