# Changelog

All notable changes to this project are documented here. Format: [Keep a Changelog](https://keepachangelog.com), versions: SemVer.

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
