# Testing

## Automated (runs in CI on every push)

| Suite | Covers |
|---|---|
| `src/domain/presence.test.ts` | day counting, boundary days, ongoing/planned trips, citizenship credit & half-day cap, eligibility date, residency obligation (brute-force verified must-return dates in default and strict mode, new PR vs 5+ years, while abroad, regain date), trip validation |
| `src/domain/insights.test.ts` | PR card 270-day window and states, reminder generation, citizenship projection |
| `src/domain/crs.test.ts` | CRS tables (single and with spouse), transferability, French/PNP/sibling, IELTS→CLB, CEC/FSW checks, FSW grid |
| `src/assistant/assistant.test.ts` | date/duration parsing (EN/中文), intents, what-if impact, log return, disclaimer and citizenship exclusions on rule/date answers, 270-day PR card window |
| `src/store/csv.test.ts` | CSV round-trip, error rows, data migration |
| `src/i18n/i18n.test.ts` | key parity and placeholders for all 18 locales, every referenced key exists |
| `src/domain/forms.test.ts` | absences cut to the 5-year window (both counting rules, ongoing trips), report totals equal `PresenceModel`, pre-PR cap and overlaps, PR card renewal window |
| `src/domain/cbsa.test.ts`, `crossChecks.test.ts` | three CBSA report formats, ±1-day matching, proposals; every cross-check with a positive and a negative case |
| `src/domain/curves.test.ts`, `ptAlerts.test.ts` | curve points and nearest-rank percentiles, scope fallback, minimum sample; processing-time change detection; moderation report |
| `src/security/share.test.ts`, `biometric.test.ts` | encrypted person files (round trip, wrong passphrase, tampering, sanitising), biometric plugin mapping and failures |
| `src/store/backup-compat.test.ts` | v0.1 and v0.3 backups still restore |
| `tests/visual/*.spec.ts` (visual.yml) | screenshots of 10 screens in 4 languages + dark mode; axe WCAG 2.1 AA audit (fails on serious/critical) |
| `scripts/check-bundle.mjs` (ci.yml) | first-load JS ≤ 140 kB gzip, other chunks ≤ 120 kB |

Run: `npm test`. Typecheck: `npm run typecheck`.

Visual and end-to-end suite locally: `npm run build`, then `npm run test:visual` (starts its own
preview on port 4173). If that port is taken, set `PW_PORT`, or point `PW_BASE_URL` at a preview you
started yourself. On Windows, `powershell -File scripts/visual-local.ps1 [playwright args]` does that for
you (port `PW_PORT`, default 4391) and stops only the server it started. Screenshots land in `screenshots/`.

## On-phone checklist (manual)

Use made-up data. Before you start, install the APK (see RELEASING.md) or open the web app.

**Onboarding & storage**
- [ ] First launch shows onboarding in the phone’s language (中文 if the system is Chinese).
- [ ] Enter a PR date ~2 years ago and a card expiry ~8 months from now → Home shows the citizenship ring, residency bar and *Renew now* for the card.
- [ ] Kill and reopen the app → data is still there.

**Trips & calendar**
- [ ] Add a past trip (e.g. 10 days) → Trips shows 8 days away (boundary rule). Calendar shows orange days with ringed travel days.
- [ ] Add a future trip → striped “planned” days; Trip editor shows the impact on the citizenship date.
- [ ] *Leaving today* → Home shows the abroad banner; tap *I’m back* → trip closes.
- [ ] Overlapping trips show a warning on Trips and a tip on Home.
- [ ] Export CSV, delete a trip, import the CSV → trip comes back (duplicates skipped).
- [ ] Delete a trip → no dialog; tap *Undo* in the toast → the trip is back in its place.
- [ ] Open *Add trip*, drag the sheet's handle down a little → it springs back; drag further or flick → it closes. The form itself still scrolls.
- [ ] With the keyboard open in a sheet, *Save* stays visible above it.
- [ ] Turn on the system's *Reduce motion* → sheets and screens no longer slide (they fade), everything still works.
- [ ] Calendar: swipe left/right on the months → next/previous month or year; vertical scrolling still works; *Today* comes back to this month. Tap a day → *Add trip* opens with that departure date; on a trip day → *Edit trip*.
- [ ] Timeline: open an application → prediction and milestones first; the next step is highlighted; *Application details* unfolds the fields. Delete → *Undo* brings it back.
- [ ] Settings: tap a chip in the index → that section scrolls under the top bar; switches toggle with a tap and with the keyboard (Space).
- [ ] With a PIN set, kill and reopen the app → the lock screen appears (briefly blank first), nothing behind it is visible.

**Reminders**
- [ ] Settings → *Allow notifications* → permission prompt → “N reminders scheduled”.
- [ ] (Android) Set the card expiry so the renewal window opens tomorrow → a notification arrives at 09:00.

**Timeline & community**
- [ ] Track an Express Entry application with a submission date 3 months ago → progress ~50%, expected date shown.
- [ ] Add milestone dates → “day N” labels; predicted dates appear when community data exists.
- [ ] *Search online* opens the browser; *Review & share* opens a pre-filled GitHub issue (don’t submit test data).

**Maple**
- [ ] “When can I apply for citizenship?” and “我什么时候可以入籍” both answer with a date.
- [ ] “What if I travel for 2 months?” shows the eligibility shift and a *Save as planned trip* button.
- [ ] “I left on <date> and came back <date>” offers *Log this trip*.

**v0.2: programs, paste, languages**
- [ ] Track a *PNP (paper-based)* application, pick Ontario → the steps start with expression of interest / provincial invitation; the CanadaVisa and Reddit search buttons include “OINP”.
- [ ] Track a *Study permit*, choose your country → the prediction says “Based on IRCC published processing time · <country>”.
- [ ] Timeline → *From text* → paste a real “finally PR” post → check the review table (uncertain dates flagged) → *Use for my application*.
- [ ] Eligibility → *All programs* → *Track* any program. CRS tab: tick an occupation category; the “your score vs. draws” table updates.
- [ ] Maple: “What is GU?”, “my longest trip”, “I want to apply by <date>, how many days can I travel?”, “What if I travel for 2 months?” then “and 3 months?”, “why?”.
- [ ] Switch to العربية / فارسی / اردو → the layout mirrors; calendars and charts still run left-to-right; back arrows point the right way.
- [ ] Switch to हिन्दी, ਪੰਜਾਬੀ, 한국어, 繁體中文 → text renders (no boxes); dates and country names appear in that language.

**v0.3: documents, history, CRS planner, security**
- [ ] Documents: add a passport expiring in 5 months → “expiring soon” + reminder; an IELTS with only the test date → “valid until” is +2 years.
- [ ] Documents checklist: pick your application, tick items, leave and come back → still ticked.
- [ ] History: add two addresses with a 2-month hole → 1 gap; “Fill this gap” pre-fills the dates; export CSV opens in Excel with accents intact.
- [ ] CRS planner (Eligibility → CRS): tick two improvements → combined score and draw comparison update.
- [ ] Settings → Security: set a PIN → background the app >30 s → PIN pad appears; 5 wrong PINs → back-off timer.
- [ ] Encrypted backup: export with a passphrase → wipe → restore with the passphrase; a wrong passphrase is refused.
- [ ] Export reminders (.ics) → import into Google/Apple Calendar → events at the right dates with a 9:00 alert.
- [ ] Maple: “When does my passport expire?”, “Any gaps in my address history?”, “How can I raise my CRS?”.

**v0.4: household, widget, trends, demo**
- [ ] Settings → Household → add “Sam” → the top-bar switcher appears. Switch → Home, Calendar and Trips show Sam’s data. Switch back → your data is unchanged.
- [ ] The Home household card shows both people and “Apply together from …”. Ask Maple: “When can we apply together?”.
- [ ] Android: long-press the home screen → Widgets → PR Tracker → it shows citizenship days, residency and PR card, and updates after you log a trip.
- [ ] Android: Settings → “Block screenshots and app previews” → screenshots are blocked and the recent-apps preview is blank, still after a restart.
- [ ] Community → Processing-time trends: pick a series and a country. The chart appears after a few days of data.
- [ ] Onboarding → “Try with sample data” → the banner shows, and changes aren’t saved after “Exit demo”.
- [ ] History → “Check gaps by month” switches to a month-level comparison.
- [ ] CI: Actions → Visual QA → download the `screenshots` artifact and skim every language.

**v0.5–v0.8: biometrics, application helper, CBSA, community 2.0, sharing**
- [ ] Settings → Security: set a PIN, tick *Unlock with Face ID / fingerprint* → lock the app → the system prompt appears; cancel it → the PIN pad still works.
- [ ] TalkBack/VoiceOver: open *Add trip* → focus moves into the sheet and back to the button when it closes.
- [ ] Home → *Application helper* → pick an application date → absences list and credited days; *Export CSV* opens in a spreadsheet; *Print report* shows a black-on-white report.
- [ ] PR card renewal check: pick a signing date → days present out of 730 and whether you can apply now.
- [ ] Trips → *Import CBSA report* → paste a made-up report (dates + “Entry YVR”) → matched / missing entries; *Add trip* fills in the trip.
- [ ] Documents: add an IELTS taken 23 months ago and an Express Entry application not yet submitted → Home warns that the test expires soon.
- [ ] Timeline → open an application with a submission date → the “% finished by day N” card (needs ≥ 8 shared timelines).
- [ ] Settings → *Share between phones* → *Send a person* → passphrase → share the `.prperson` file → on the second phone *Receive a person* → the person appears.
- [ ] Switch to বাংলা, தமிழ், ગુજરાતી, Русский, Українська → text renders, no English left on Home.
- [ ] Maple: “export my absences”, “check my trips against CBSA”, “what percent of people finished by now?”.

**Settings & privacy**
- [ ] Switch language and theme (light/dark/system).
- [ ] Export backup → Delete all data → onboarding → *Restore from a backup file* → everything is back.
- [ ] Airplane mode: the app still opens and calculates; Community shows *Offline copy*.

Please report issues with the **Bug report** template, using made-up dates.
