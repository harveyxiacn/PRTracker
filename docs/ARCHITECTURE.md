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
| `src/assistant/` | Maple: `parse` (dates/durations, any digits), `engine` (ordered intents + memory), `query` (data queries & planners), `kb` (FAQ & glossary), `lexicon` (per-language keywords) | returns text + actions + memory, never mutates data |
| `src/store/` | `AppContext` (state, routing, toasts, theme, notification sync), storage adapters, CSV | debounced saves (250 ms) |
| `src/notify/` | Schedules/cancels local notifications | stable numeric IDs from reminder IDs |
| `src/data/remote.ts` | Loads open data from the configured URL, falls back to the bundled copy | `credentials: omit`, `no-referrer` |
| `src/i18n/` | `en.ts` (source, bundled), `locales/<code>.ts` (one lazy chunk per language: strings + Maple lexicon), `languages.ts` (registry: native name, `dir`, Intl locale) | parity, placeholders and referenced keys enforced by tests |
| `src/screens/` | One file per screen | |
| `android/`, `ios/` | Capacitor native shells | generated, with small committed patches (signing, backup off, notification icon) |
| `scripts/` | Data mirror, community builder, icon generator | run in CI or by hand |

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

## Performance

`PresenceModel` spans from the earliest relevant date to today + 7 years (~5k–10k days). Building
it is a few typed-array passes; every window query is two prefix-sum lookups. Scanning for the
earliest eligibility date is linear over ≤ 2.5k candidate days. Everything recomputes in a few ms on each edit.

## CI/CD (`.github/workflows`)

| Workflow | Trigger | Does |
|---|---|---|
| `ci.yml` | push to main, PRs | typecheck, unit tests, web build, **Android debug APK** artifact |
| `release.yml` | tag `v*` | tests, build, signed APK/AAB if secrets exist, debug APK, web zip → GitHub Release |
| `pages.yml` | push to main | deploys the PWA and `/data` to GitHub Pages |
| `data.yml` | daily cron | mirrors IRCC processing times and EE draws, rebuilds community data, commits if changed |
| `community-intake.yml` | issue labeled `timeline-approved` | validates and appends the record, closes the issue |
| `ios.yml` | manual | builds the iOS app for the simulator (unsigned) |
