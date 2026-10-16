# 🍁 PR Tracker

**Privacy-first companion for anyone on the road to Canadian permanent residence, from anywhere
in the world.** Track any IRCC application (Express Entry, provincial nominee programs, Quebec,
pilots, family sponsorship, study/work permits, citizenship), count your days in Canada, see
exactly when you can apply for citizenship, and keep your PR status safe while travelling.
It runs on **Android, iOS and the web** in **14 languages**, and **your data never leaves your device**.

| | |
|---|---|
| 🧮 **Citizenship countdown** | 1,095-day physical-presence rule, ½-day credit for time before PR (capped at 365), projected eligibility date with a safety margin |
| 🛡️ **PR residency obligation** | 730 days in every 5-year window; “how long can I stay away?” and “must return by” dates |
| 🪪 **PR card** | Renewal window (9 months before expiry) and expiry reminders |
| 🗓️ **Hot-spot calendar** | Year and month heat maps of every day in and outside Canada, plus per-year totals |
| ✈️ **Trips** | Log past, ongoing and planned trips (back-dating supported), CSV import/export, overlap checks |
| ⏱️ **Application timelines** | 30+ programs, each with its own steps: Express Entry, PNP for each province (expression of interest → nomination → federal), Quebec (Arrima → CSQ), AIP, rural/francophone pilots, caregivers, Start-up Visa, spousal (inland/outland), child, parents & grandparents, protected persons, H&C, study/work/visitor permits, PGWP, PRTD, PR card, citizenship. Predictions use IRCC’s published times (per country for permits) plus anonymised community timelines |
| 📋 **Paste a timeline** | Paste any forum post (Reddit, CanadaVisa, Facebook, WeChat); the on-device parser extracts the program, milestones (AOR, BIL, PPR, P1/P2, eCOPR…), visa office and country, for you to review |
| 🎯 **Eligibility** | CRS estimator (2025 rules, no job-offer points), CEC/FSW/FST checks, your score against the latest draw in each category you qualify for (French, healthcare, STEM, trades…), and an explorer of every program |
| 🍁 **Maple assistant** | On-device, multilingual, rule-based. Asks about your own data (“longest trip?”, “days outside in the last 12 months?”), plans (“apply by June 2028 — how many days can I still travel?”, “best time for a 3-week trip?”), what-ifs with follow-ups (“and 3 months?”), “why is my date…”, FAQ answers with official sources, and a glossary of forum jargon (AOR, BIL, GU, P1/P2…) |
| 🗂️ **Documents & expiries** | Passport, permits, language tests (valid 2 years), ECA (5 years), medical (12 months), police certificates, biometrics. Expiry reminders and a document checklist for each program; only metadata is stored, never document numbers |
| 🧾 **Personal history** | Addresses and activities for IMM 5669 (past 10 years or since age 18) and citizenship (5 years), with gap and overlap detection and a form-ready CSV/table export |
| 📈 **CRS improvement planner** | Ranks the changes that would raise your score (language, French, work, education, spouse, PNP), combines your chosen plan, and compares it with recent draws |
| 🔒 **Security** | Passphrase-encrypted backups (AES-256-GCM), an optional PIN app lock, and calendar export (.ics) of reminders and trips |
| 🔔 **Local reminders** | Scheduled on the phone, so no push server is needed |
| 🌐 **14 languages** | English, Français, 简体中文, 繁體中文, Español, Português, हिन्दी, ਪੰਜਾਬੀ, Tagalog, Tiếng Việt, 한국어, العربية, فارسی, اردو. Right-to-left layout for Arabic, Persian and Urdu; languages load on demand |
| 🌓 Light/dark theme, offline PWA | |

> ⚠️ Estimates for planning only, not legal advice. Always confirm with IRCC’s official tools.

## Get it

- **Android**: download the APK from [Releases](../../releases) (or the `pr-tracker-debug-apk` artifact of the latest CI run) and install it.
- **Web / iPhone**: open the web app (GitHub Pages) and use *Add to Home Screen*.
- **iOS native**: build from source with Xcode (see [docs/RELEASING.md](docs/RELEASING.md)).

## Privacy in one paragraph

No account, no analytics, no backend. Everything you enter is stored on the device
(IndexedDB on the web; SharedPreferences/UserDefaults in the apps), and Android cloud
backup is turned off. The app only *downloads* public open data (IRCC processing
times and anonymised community timelines) from this repository’s GitHub Pages. Sharing
your own timeline is opt-in and done through a GitHub issue that you review first.
Details: [docs/PRIVACY.md](docs/PRIVACY.md).

## Roadmap

| Version | Theme | Status |
|---|---|---|
| v0.1 | Core tracker: citizenship & residency days, trips, calendar, timelines, Maple | ✅ |
| v0.2 | Worldwide: 32 programs, per-country times, paste-a-timeline, 14 languages | ✅ |
| v0.3 | Paperwork & privacy: documents, personal history, CRS planner, encryption, PIN lock | ✅ |
| v0.4 | Household, Android widget, screenshot blocking, processing trends, Reddit (opt-in), demo + visual QA | 🚧 |
| v0.5 | iOS & accessibility: WidgetKit, biometric unlock, a11y audit, more languages | 🗓️ |
| v0.6 | Application helper: citizenship absences table, CBSA history import, PR card renewal helper | 🗓️ |
| v0.7 | Community 2.0: office/stream curves, processing-time alerts, moderation | 🗓️ |
| v0.8 | Serverless encrypted sync between devices and household members | 💡 |
| v1.0 | Play Store & App Store launch, security and consultant review | 🗓️ |

Details: [docs/ROADMAP.md](docs/ROADMAP.md).

## Documentation

| Doc | What’s inside |
|---|---|
| [docs/DESIGN.md](docs/DESIGN.md) | Product design: goals, screens, UX decisions, colour system, the Maple assistant |
| [docs/RULES.md](docs/RULES.md) | Exactly how every number is calculated, with IRCC sources |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Code structure, data model, open-data pipeline, CI/CD |
| [docs/PRIVACY.md](docs/PRIVACY.md) | Data handling and threat model |
| [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) | Set up, run, test, add a language or a rule |
| [docs/RELEASING.md](docs/RELEASING.md) | Versioning, signing, Android/iOS/web releases |
| [docs/TESTING.md](docs/TESTING.md) | Automated tests and the on-phone test checklist |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Version-by-version roadmap |
| [docs/devlog/](docs/devlog/) | Development log |
| [CHANGELOG.md](CHANGELOG.md) | Release notes |

## Quick start (developers)

```bash
npm ci
npm run dev        # web app at http://localhost:5173
npm test           # unit tests (rules engine, assistant, i18n, CSV)
npm run build && npx cap sync   # then open android/ in Android Studio or ios/ in Xcode
```

## Tech

React 19 + TypeScript + Vite, Capacitor 7 (Android/iOS), vite-plugin-pwa, Vitest.
There is no server: GitHub Actions handles CI, releases, Pages hosting and a daily IRCC data mirror.

## License

MIT, see [LICENSE](LICENSE). Community timeline data is published under CC0.
