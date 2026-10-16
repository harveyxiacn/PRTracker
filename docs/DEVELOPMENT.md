# Development guide

## Prerequisites

- Node.js 22+ (CI uses 22; 24 works too) and npm
- Android: Android Studio (JDK 21 bundled) with Android SDK 35
- iOS: macOS with Xcode 16+ and CocoaPods

## Everyday commands

```bash
npm ci                 # install exact dependencies
npm run dev            # Vite dev server (web) with hot reload
npm test               # Vitest unit tests (run once)
npm run test:watch     # tests in watch mode
npm run typecheck      # TypeScript, no emit
npm run build          # production web build into dist/
npm run icons          # regenerate PWA + native icons/splash from public/icon.svg
npm run data:ircc      # refresh public/data from IRCC (needs network)
npm run data:community # rebuild public/data/community.json from community/records.jsonl
```

### Native apps

```bash
npm run build && npx cap sync       # copy web build + plugins into android/ and ios/
npx cap open android                # Android Studio → Run on a device/emulator
npx cap open ios                    # Xcode → select a team → Run
```

Live reload on a phone: `npx cap run android -l --external` (phone and computer on the same network).

## Project layout

See [ARCHITECTURE.md](ARCHITECTURE.md). In short: rules live in `src/domain` (pure, tested),
UI lives in `src/screens`, and the assistant lives in `src/assistant`.

## Conventions

- Dates are ISO `YYYY-MM-DD` strings everywhere; use helpers from `src/domain/dates.ts`.
- Any rule change must come with a test in `src/domain/*.test.ts` and an update to `docs/RULES.md`.
- UI strings go through `t('key')`. Add the key to **both** `src/i18n/en.ts` and `src/i18n/zh.ts`;
  `i18n.test.ts` fails on a missing key or a placeholder mismatch.
- Colours come from CSS tokens in `src/styles.css`; don't hard-code hex values in components.
- Keep `AppData` backward compatible: add optional fields and default them in `migrate()`.

## Adding a language

1. Add an entry to `LANGUAGES` in `src/i18n/languages.ts` (code, native name, `dir`, Intl locale).
2. Create `src/i18n/locales/<code>.ts` exporting `{ strings, lexicon }` (see an existing locale): every key of `en.ts`, the same `{placeholders}`, and a Maple lexicon (intent keywords, units, relative days, query words, FAQ keywords).
3. `npm test`: `i18n.test.ts` fails on missing or extra keys and on placeholder mismatches.
4. If the script needs a font, add a `:root[lang=…]` rule in `styles.css`; for RTL set `dir: 'rtl'`.

## Adding a program

Add it to `PROGRAMS` in `src/domain/programs.ts` (reuse a template or add one), add `app.kind.<id>` and `prog.desc.<id>` to every locale, add the id to `KINDS` in `scripts/build-community.mjs` (a test checks this), and give it a search phrase in `SEARCH_TERMS` (Timeline.tsx).

## Adding an assistant intent

Add an entry to `handlers` in `src/assistant/engine.ts` (`id`, `match`, `run`). Order matters:
the first match wins. Add an example to `assistant.test.ts`.

## Working from the Oracle control host (maintainer notes)

This repository was bootstrapped by an AI agent running on a separate control host that edits
files on the Windows workstation through a bridge. Tests and builds run on the workstation
(`npm test`, `npm run build`); Android APKs are built by GitHub Actions because the bridge
account has no Android SDK. You can build locally from Android Studio as usual.
