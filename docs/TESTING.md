# Testing

## Automated (runs in CI on every push)

| Suite | Covers |
|---|---|
| `src/domain/presence.test.ts` | day counting, boundary days, ongoing/planned trips, citizenship credit & half-day cap, eligibility date, residency obligation (brute-force verified must-return dates, new PR vs 5+ years, while abroad, regain date), trip validation |
| `src/domain/insights.test.ts` | PR card 9-month window and states, reminder generation, citizenship projection |
| `src/domain/crs.test.ts` | CRS tables (single and with spouse), transferability, French/PNP/sibling, IELTS→CLB, CEC/FSW checks, FSW grid |
| `src/assistant/assistant.test.ts` | date/duration parsing (EN/中文), intents, what-if impact, log return |
| `src/store/csv.test.ts` | CSV round-trip, error rows, data migration |
| `src/i18n/i18n.test.ts` | en/zh key parity, placeholders, every referenced key exists |

Run: `npm test`. Typecheck: `npm run typecheck`.

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

**Settings & privacy**
- [ ] Switch language and theme (light/dark/system).
- [ ] Export backup → Delete all data → onboarding → *Restore from a backup file* → everything is back.
- [ ] Airplane mode: the app still opens and calculates; Community shows *Offline copy*.

Please report issues with the **Bug report** template, using made-up dates.
