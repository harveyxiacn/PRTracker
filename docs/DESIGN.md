# Product design

## Who it’s for

1. **Future PRs** (workers and students in Canada, or applicants abroad) checking whether they
   can apply and how long the process takes.
2. **New PRs** counting toward citizenship (and banking pre-PR half-days).
3. **Established PRs** who travel and must protect their 730-day residency obligation and renew their PR card.

## Principles

- **Private by default.** No account and no server. The data a user enters is the most sensitive
  part of an immigration file (travel history, status), so it stays on the device. See PRIVACY.md.
- **Answer the real question.** Show dates people can act on, not only raw counts: *“You can
  apply on 2029-01-10”*, *“Be back by 2027-03-02”*.
- **Show the rule.** Each number can be explained (RULES.md and the assistant’s *rules* answer). Disclaimers are short and kept in one place.
- **Works offline.** Every calculation is local; open data is bundled with a fallback.
- **Bilingual.** English and Simplified Chinese from day one, auto-detected from the system language.

## Information architecture

Bottom tabs (thumb reach, 5 max): **Home · Calendar · Trips · Timeline · Maple**.
Secondary pages (from Home and the header): **Eligibility · Community · Settings**.
Routing is hash-based (`#/timeline/<id>`) so the browser and Android back buttons work.

| Screen | Purpose | Key components |
|---|---|---|
| Onboarding | 3 steps: value & privacy → status (PR date, card expiry, pre-PR periods) → trips (CSV import) | restore-from-backup shortcut |
| Home | Today at a glance | abroad banner with *I’m back*, proactive tips, citizenship ring, residency bar, PR-card status, 53-week heat strip, application progress, upcoming reminders, quick actions |
| Calendar | “Hot-spot” calendar | year view (12 mini months) / month view, tap-a-day details, legend, per-year table |
| Trips | Log and fix travel | add/edit sheet with live *impact on citizenship date*, *leaving today*, overlap warnings, CSV import/export |
| Timeline | Track applications | milestone templates per stream, prediction card (median + p25–p75), community histogram with “you are here”, search-online links, anonymous sharing |
| Maple | Assistant | chat, suggestion chips, action buttons (*Log this trip*, *Open calendar*) |
| Eligibility | Am I eligible for PR? | CRS estimate and breakdown, recent draws compared with your score, CEC/FSW/FST checks with reasons |
| Community | Other people’s data | IRCC vs community processing times (median, IQR), full IRCC list, how sharing works |
| Settings | Profile & data | status periods, tax years, language, theme, counting rule, safety margin, reminders, backup/restore/wipe, data source |

## Visual design

- **Style:** calm, card-based, mobile-first; system font stack (with PingFang/YaHei for Chinese);
  44 px minimum touch targets; one accent (maple red `#c8102e`) used sparingly for primary
  actions and the user’s own mark.
- **Tokens:** all colours are CSS custom properties on `:root`, with a dark theme selected
  separately (not inverted) for both the OS setting and the in-app toggle.
- **Data colours** (validated colour-blind-safe categorical slots: blue / orange / aqua):
  - aqua `#1baf7a`: in Canada as PR (full credit)
  - blue `#2a78d6`: in Canada before PR (½ credit)
  - orange `#eb6834`: outside Canada; planned trips use orange **stripes**
  - travel day: aqua with an orange ring (counts as in Canada)
  - neutral grey: no status or not counted
  Identity is never colour-only: every cell has an accessible label and a tap-to-read detail line, and the year table repeats the numbers.
- **Status colours** (good/warn/critical) always come with an icon and a label.
- **Motion:** short sheet slide-up; disabled under `prefers-reduced-motion`.

## Maple: the on-device smart assistant

**Why rule-based and not a cloud LLM?** The questions are about the user’s own travel history,
which shouldn’t leave the device, and the answers must be *exactly* right, which a model can’t
guarantee. Maple is a small intent engine on top of the same rules engine the UI uses.

**Pipeline** (`src/assistant/`):

1. **Normalise:** lower-case, Chinese numerals → digits (`三个月` → `3个月`, `二〇二七` → `2027`).
2. **Extract entities:** dates (ISO, `June 1`, `1 June 2027`, `3月1日`, `today/明天/next month`),
   durations (`2 weeks`, `两个月`, `半年`) and years.
3. **Match intent** (ordered rules, EN + 中文 keywords): log return · log departure · days outside
   in a year · what-if trip · residency · PR card · citizenship · application status · CRS ·
   rules · privacy · summary · fallback.
4. **Compute** with the domain engine (e.g. *what-if* builds a second model with the hypothetical
   trip and compares eligibility dates and residency compliance day by day).
5. **Reply** with localised text plus **actions**: buttons that log or close a trip, open a
   screen, or ask a follow-up question. Maple never changes data without a tap.

**Proactive tips** on Home come from the same module (`proactiveTips`): missing PR date or card
expiry, overlapping trips, residency risk, must-return-soon, renewal window open, eligible soon,
and last year’s taxes not marked as filed.

Example questions:
- “What if I travel from 2027-06-01 to 2027-08-15?” / “如果我出国三个月会怎样？”
- “I’m back today” / “我回来了” (closes the ongoing trip)
- “How many days was I outside in 2025?”
- “When should I renew my PR card?” / “枫叶卡什么时候续？”
- “When will my COPR come?” (uses Timeline predictions)

## Community timelines (“search online to see other people’s timeline”)

Two complementary paths, both privacy-preserving:

1. **Open dataset**: anonymised records (`kind`, `submittedMonth`, day counts per milestone,
   optional office) contributed via a pre-filled GitHub issue form, reviewed, then merged by a
   workflow into `public/data/community.json`. The app downloads this file; predictions use it
   when there are ≥ 5 similar records.
2. **Search online**: buttons open Reddit or Google with a generic query
   (stream + month, e.g. *“CEC AOR timeline March 2026”*) in the system browser. No user
   data goes into the query beyond those two facts.

IRCC’s published processing times are mirrored daily (`scripts/fetch-ircc.mjs`) as the baseline.

## Future ideas

- Encrypted export (passphrase) and optional biometric app lock.
- Home-screen widgets (days to citizenship).
- Import from CBSA travel-history PDFs.
- Spouse/partner profiles for family planning.
- More languages (French, Punjabi, Hindi, Tagalog, Spanish).
