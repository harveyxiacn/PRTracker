# 🍁 PR Tracker

**Privacy-first tracker for Canadian permanent residents.** Count your days in Canada, see
exactly when you can apply for citizenship, keep your PR status safe while travelling, and
follow your IRCC application against real timelines. It runs on **Android, iOS and the web**,
and **your data never leaves your device**.

| | |
|---|---|
| 🧮 **Citizenship countdown** | 1,095-day physical-presence rule, ½-day credit for time before PR (capped at 365), projected eligibility date with a safety margin |
| 🛡️ **PR residency obligation** | 730 days in every 5-year window; “how long can I stay away?” and “must return by” dates |
| 🪪 **PR card** | Renewal window (9 months before expiry) and expiry reminders |
| 🗓️ **Hot-spot calendar** | Year and month heat maps of every day in and outside Canada, plus per-year totals |
| ✈️ **Trips** | Log past, ongoing and planned trips (back-dating supported), CSV import/export, overlap checks |
| ⏱️ **Application timelines** | Milestones for Express Entry, PNP, spousal, citizenship and PR card; predictions from IRCC processing times and anonymised community timelines |
| 🎯 **Eligibility** | CRS estimator (2025 rules, no job-offer points) and CEC / FSW / FST minimum checks; recent draws |
| 🍁 **Maple assistant** | On-device bilingual (EN/中文) assistant: “What if I travel 2 months from June 1?”, “I’m back today”, “How many days was I out in 2025?” |
| 🔔 **Local reminders** | Scheduled on the phone, so no push server is needed |
| 🌐 **English & 简体中文**, light/dark theme, offline PWA | |

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
