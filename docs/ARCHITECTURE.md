# Architecture

```
┌──────────────────────────── device ─────────────────────────────┐
│  React UI (src/screens, src/components)                          │
│     │  useApp(): data, insights, t(), open data, routing         │
│  AppContext (src/store) ── storage.ts ── IndexedDB | Preferences │
│     │                                                            │
│  Domain (pure TS, src/domain)       Assistant (src/assistant)    │
│   dates · presence · insights       parse · engine (intents)     │
│   crs · timeline                                                 │
│     │                                                            │
│  notify/ ── Capacitor LocalNotifications | Web Notification      │
│  data/remote.ts ── fetch (read-only) ─────────────┐              │
└───────────────────────────────────────────────────┼──────────────┘
                                                    ▼
           GitHub Pages: /data/ircc.json, draws.json, community.json
                    ▲ daily workflow (scripts/fetch-ircc.mjs)
                    ▲ issue intake workflow (scripts/build-community.mjs)
```

## Layers

| Path | Responsibility | Notes |
|---|---|---|
| `src/domain/dates.ts` | ISO dates ↔ UTC day numbers, month/year maths with clamping | no `Date` maths with time zones anywhere else |
| `src/domain/presence.ts` | `PresenceModel`: per-day arrays (absent, status, travel day) with prefix sums for O(1) window queries; citizenship, residency, year stats, what-if | the core of correctness; heavily tested |
| `src/domain/insights.ts` | Derived dashboard facts + reminder list | shared by Home, notifications, assistant |
| `src/domain/crs.ts` | CRS score, language conversion, program checks | |
| `src/domain/programs.ts` | Program catalogue: category, milestone template, fallback time, province/country needs, IRCC link | add a program here + i18n `app.kind.*`/`prog.desc.*` |
| `src/domain/timeline.ts` | Predictions (community → IRCC per-country/general → fallback), anonymised community record | |
| `src/domain/pasteParser.ts` | Forum-post timeline parser | |
| `src/domain/draws.ts` | Express Entry draw categories, your standing per category | |
| `src/domain/countries.ts` | ISO country codes; names via `Intl.DisplayNames` | |
| `src/domain/documents.ts` | Document validity rules, statuses, reminders, per-program checklists | metadata only |
| `src/domain/history.ts` | Address/activity history windows, gaps, overlaps, CSV/text export | IMM 5669, citizenship |
| `src/domain/crsPlanner.ts`, `crsForm.ts` | CRS improvement suggestions; mapping of the saved calculator form to `CrsInput` | |
| `src/security/` | `crypto.ts` (encrypted backups), `pin.ts` (app-lock hash), `ics.ts` (calendar export) | WebCrypto only |
| `src/domain/people.ts` | Household: swap-based multi-person (active person's data stays in `profile`/`trips`), summaries, joint date, reminders, sanitising | every screen works unchanged |
| `src/native/` | `widget.ts` (Android widget snapshot), `privacy.ts` (FLAG_SECURE) → local Capacitor plugin `PrTrackerNative` (`android/.../PrTrackerNativePlugin.java`), widget `PrTrackerWidget.java` | no-ops on web/iOS |
| `src/data/trends*.ts`, `src/screens/Trends.tsx` | Processing-time history loader, pure helpers, step chart | |
| `src/data/redditCore.ts`, `scripts/fetch-reddit.ts` | Opt-in Reddit ingestion (official API, hashed dedupe) | inactive without secrets |
| `src/domain/demo.ts` | Sample data for demo mode and visual QA | |
| `src/domain/forms.ts`, `src/screens/Forms.tsx` | Application helper: citizenship absences, presence report (totals come from `PresenceModel`), PR card renewal check, print view | route `forms` |
| `src/domain/cbsa.ts`, `src/screens/CbsaImport.tsx` | CBSA Travel History Report parser (format-agnostic) and ±1-day reconciliation with trips | pasted text is never stored |
| `src/domain/crossChecks.ts` | Document/trip/application cross-checks, merged with proactive tips on Home | same shape as tips |
| `src/domain/curves.ts`, `ptAlerts.ts`, `src/screens/Curves.tsx` | Finish curves (empirical CDF, nearest-rank percentiles, scope fallback) and processing-time change alerts | Curves is lazy-loaded on Home |
| `src/security/share.ts`, `src/screens/Share.tsx` | Encrypted `.prperson` export/import of one household member | reuses `crypto.ts` |
| `src/security/biometric.ts` | Face ID / fingerprint via `@aparajita/capacitor-biometric-auth`; web returns unavailable | PIN is always the fallback |
| `src/assistant/` | Maple: `parse` (dates/durations, any digits), `engine` (ordered intents + memory), `query` (data queries & planners), `kb` (FAQ & glossary), `lexicon` (per-language keywords) | returns text + actions + memory, never mutates data |
| `src/store/` | `AppContext` (state, routing, toasts, theme, notification sync), storage adapters, CSV | debounced saves (250 ms) |
| `src/notify/` | Schedules/cancels local notifications | stable numeric IDs from reminder IDs |
| `src/data/remote.ts` | Loads open data from the configured URL, falls back to the bundled copy | `credentials: omit`, `no-referrer` |
| `src/i18n/` | `en.ts` (source, bundled), `locales/<code>.ts` (one lazy chunk per language: strings + Maple lexicon), `languages.ts` (registry: native name, `dir`, Intl locale) | parity, placeholders and referenced keys enforced by tests |
| `src/screens/` | One file per screen | |
| `android/`, `ios/` | Capacitor native shells | generated, with small committed patches (signing, backup off, notification icon) |
| `scripts/` | Data mirror, community builder and moderation report, icon generator, bundle budget (`check-bundle.mjs`) | run in CI or by hand |

## Data model (`src/domain/types.ts`)

```ts
AppData {
  version: 1
  profile: { prDate?, prCardExpiry?, firstEntry?, statusPeriods[{kind,start,end?}], taxYearsFiled[] }
  trips: [{ id, departure, return?|null, destination?, purpose?, note? }]
  applications: [{ id, kind, label?, submitted?, milestones[{key,date}], expectedDays?, office?, archived? }]
  settings: { language, theme, boundaryDaysPresent, notifications{…}, dataUrl, citizenshipBuffer }
  chat?: [...]
  eligibilityForm?: {...}
  onboarded: boolean
}
```

Stored as one JSON document under `prtracker.data.v1`. `migrate()` fills defaults for fields
added later and drops malformed rows, so old backups keep importing.

## Code splitting

Home, Calendar and Trips (and Onboarding) are in the main bundle. Every other screen, the Maple
engine and knowledge base, and each language are lazy chunks. The PWA precaches the app shell and
screens but not language chunks, which are cached at runtime the first time they load
(`vite.config.ts` → `globIgnores` + `runtimeCaching`).

## Performance

`PresenceModel` spans from the earliest relevant date to today + 7 years (~5k–10k days). Building
it is a few typed-array passes; every window query is two prefix-sum lookups. Scanning for the
earliest eligibility date is linear over ≤ 2.5k candidate days. Everything recomputes in a few ms on each edit.

## CI/CD (`.github/workflows`)

| Workflow | Trigger | Does |
|---|---|---|
| `ci.yml` | push to main, PRs | typecheck, unit tests, web build, **bundle budget**, **Android debug APK** artifact |
| `release.yml` | tag `v*` | tests, build, signed APK/AAB if secrets exist, debug APK, web zip → GitHub Release |
| `pages.yml` | push to main | deploys the PWA and `/data` to GitHub Pages |
| `data.yml` | daily cron | mirrors IRCC processing times and EE draws, rebuilds community data, commits if changed |
| `community-intake.yml` | issue labeled `timeline-approved` | validates and appends the record, closes the issue; on rejection comments the reason and removes the label |
| `ios.yml` | manual | builds the iOS app for the simulator (unsigned) |
| `visual.yml` | PRs, manual | Playwright screenshots of every screen in en/zh/ar/hi (+ dark mode) with overflow / raw-key / console checks; artifact `screenshots` |
| `reddit.yml` | weekly, manual | opt-in Reddit ingestion (skips without secrets), rebuilds community data, redeploys Pages |
