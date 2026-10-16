# Changelog

All notable changes to this project are documented here. Format: [Keep a Changelog](https://keepachangelog.com), versions: SemVer.

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
