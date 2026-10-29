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
- **Global.** Applicants come from everywhere: 14 languages (auto-detected from the OS, lazy-loaded), RTL layout, country names and month names from the platform’s `Intl` data, and every major pathway to PR in the program catalogue.

## Information architecture

Bottom tabs (thumb reach, 5 max): **Home · Calendar · Trips · Timeline · Maple**.
Secondary pages (from Home and the header): **Eligibility · Community · Settings**.
Routing is hash-based (`#/timeline/<id>`) so the browser and Android back buttons work.

| Screen | Purpose | Key components |
|---|---|---|
| Onboarding | 3 steps: value & privacy → status (PR date, card expiry, pre-PR periods) → trips (CSV import) | restore-from-backup shortcut |
| Home | Today at a glance | abroad banner with *I’m back*, critical alerts, citizenship ring (hero), residency bar, PR-card status, quick-action row, other alerts (2 + *Show more*), household, application progress, 53-week heat strip, upcoming reminders |
| Calendar | “Hot-spot” calendar | in-card toolbar (Year/Month, arrows, *Today*), swipe to page, year view (12 mini months, tap a month to open it) / month view, selected-day detail with *Add/Edit trip*, legend, per-year table |
| Trips | Log and fix travel | add/edit sheet with live *impact on citizenship date*, *leaving today*, overlap warnings, CSV import/export |
| Timeline | Track applications | list (archived folded); detail: summary → prediction (median + p25–p75) → milestones with the next step highlighted → finish curve → community histogram, search links, anonymous sharing → folded *Application details* → archive / delete with undo |
| Maple | Assistant | chat, suggestion chips, action buttons (*Log this trip*, *Open calendar*) |
| Eligibility | Am I eligible for PR? | CRS estimate and breakdown, recent draws compared with your score, CEC/FSW/FST checks with reasons |
| Community | Other people’s data | IRCC vs community processing times (median, IQR), full IRCC list, how sharing works |
| Settings | Profile & data | sticky section index; status periods, tax years; preferences (language, theme, counting rule, safety margin); reminders (switches); household; security & privacy screen; data (export, *Advanced* data source); sharing; *Danger zone* (wipe); about |

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
- **Hierarchy (v0.9):** each screen answers its question first. Explanations that matter but are
  read once (“what isn’t counted”, legal exceptions, CSV columns) live behind a *How this is
  counted*–style disclosure instead of being printed on every visit.
- **Destructive actions:** prefer doing it at once with *Undo* in the toast over a confirm dialog
  (trips). Keep confirms only where undo is impossible (wiping all data, replacing data from a backup).
- **Motion** (tokens in `styles.css`: `--ease-out`, `--ease-in`, `--ease-spring`, `--dur-press` 120 ms,
  `--dur-in` 220 ms, `--dur-sheet` 300 ms, `--dur-out` 180 ms). Motion explains a change of place or
  state and never delays a task:
  - sheets slide up from the bottom (dialogs scale/fade on ≥ 640 px), exit faster than they enter, and
    can be dragged down by the handle; the close button, Escape and the backdrop are the equivalents;
  - screens fade in (opacity only, so fixed children such as the Maple composer are never re-anchored);
  - first-show emphasis on numbers: the citizenship ring sweeps, progress bars grow;
  - press feedback (scale 0.97) on everything tappable; hover tints only under `(hover: hover)`;
  - business state never waits for an animation: data changes first, presentation follows, and a
    sheet that is unmounted by its parent (e.g. after Save) simply disappears.
  - `prefers-reduced-motion`: no travel or scaling; feedback remains as short cross-fades.

## Program catalogue (`src/domain/programs.ts`)

One table drives everything program-specific: category, milestone template, final milestone,
offline processing estimate, whether it needs a province (PNP) or a country (IRCC publishes
study/work/visitor times by country), and the official IRCC link. Templates:

| Template | Steps |
|---|---|
| Express Entry | profile → ITA → submitted → AOR → BIL → biometrics → medical → eligibility → background → PPR → passport sent/returned → P1 → P2 → COPR → landed |
| PNP (EE / base) | (profile or expression of interest) → provincial invitation → provincial application → nomination → (ITA) → federal steps |
| Quebec | expression of interest → Arrima invitation → CSQ application → CSQ issued → federal steps |
| Endorsed pilots (AIP, RCIP, FCIP) | job offer → endorsement / community recommendation → federal steps |
| Family | submitted → AOR → sponsor approved → (open work permit, inland) → … → COPR |
| Parents & grandparents | interest form → invitation → submitted → … |
| Temporary residence | submitted → BIL → biometrics → medical → decision → passport request → permit issued |
| Citizenship / PR card / PRTD | as before |

## Paste-a-timeline parser (`src/domain/pasteParser.ts`)

Built and tested against real Reddit posts (CEC inland, CEC outland, generic Express Entry):
- Splits text into fragments (lines, `|`, `;`, `→`, bullets).
- A milestone needs a **label right next to a date** (“AOR: Feb 8, 2026”, “eCOPR 06/20/2026”). Story sentences (“I submitted my study permit on Oct 1, 2021…”) are ignored.
- **Program:** an explicit “Stream:/Program:/Application type:” line wins. Otherwise the first program mentioned wins. Temporary permits are excluded when PR-only milestones (ITA, PPR, P1/P2, eCOPR) are present. A generic “Express Entry” becomes CEC, flagged for review.
- **Dates:** ISO, `DD/MM/YYYY` vs `MM/DD/YYYY` (ambiguous ones flagged), English month names, Chinese `3月5日`. Year-less dates follow the previous milestone in time and never land in the future.
- Also extracts the visa office (“PVO: Ottawa”, “PVO/SVO: Vancouver, Sydney”), the country applied from (“Applied from Kenya” → KE) and the province (OINP → ON).
- Everything is shown in an editable review table before it is applied or shared.

Forums like CanadaVisa block automated access and Reddit requires its API, so the app links
out to searches and lets **people** paste what they read. Nothing is scraped.

## Maple: the on-device smart assistant

**Why rule-based and not a cloud LLM?** The questions are about the user’s own travel history,
which shouldn’t leave the device, and the answers must be *exactly* right, which a model can’t
guarantee. Maple is a small intent engine on top of the same rules engine the UI uses.

**v0.2 additions:**
- **Your data as a database** (`query.ts`): longest/shortest/last/next trip, trips to a place (matched by your destinations or any country name in your language), most-visited place, days outside in the last N months.
- **Planner:** `travelBudget(target)` answers “how many more days can I travel and still apply on T?”. It is exact, because every future day before T is a PR day worth one credit; a test checks that budget days pass and one more fails. `planTrip(N)` compares leaving now with leaving after you apply, and checks the 730-day rule and PR card expiry.
- **Explain:** breaks down the citizenship number: window, PR days, pre-PR days and credit, trips and days away.
- **Knowledge base** (`kb.ts`): 18 curated FAQ answers, each linked to its official source, plus a 32-term glossary of forum jargon. Retrieval scores keywords; no text is generated.
- **Memory:** follow-ups reuse the previous what-if or plan (“and 3 months?”, “what about May 1?”).
- **Multilingual:** each language ships a lexicon (intent keywords, duration units, relative days, query words, FAQ keywords). Month names come from `Intl`, and Arabic-Indic, Persian, Devanagari and Gurmukhi digits are normalised.

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

## v0.3 modules

| Module | Key decisions |
|---|---|
| **Documents & expiries** (`domain/documents.ts`) | Metadata only (kind, holder, issue/expiry dates, country), never document numbers. Validity rules from IRCC: language test 2 years, ECA 5 years, medical 12 months, biometrics 10 years (temporary residence only). Warning leads: passport 6 months, permits 4 months, tests 3 months. Checklists per program are deliberately conservative: an item is left out when unsure. |
| **Personal history** (`domain/history.ts`) | Built for IMM 5669 Schedule A (past 10 years or since 18th birthday, whichever is most recent, **no gaps**) and the citizenship 5-year history. Day-precise gap detection, address overlaps (1-day moving overlap allowed), and one-tap “fill this gap”. Export to CSV (with a BOM for Excel) and a copyable table. |
| **CRS planner** (`domain/crsPlanner.ts`) | 13 single-change kinds evaluated with the real CRS calculator; equivalent changes are merged; you can combine a plan and compare it with the latest draws. |
| **Security** (`security/`) | WebCrypto only: PBKDF2-SHA-256 (310k iterations) + AES-256-GCM for backups; PIN stored as a salted PBKDF2 hash with constant-time comparison and exponential back-off. The lock screen *replaces* the app (it isn't an overlay) and re-locks after 30 s in the background. RFC 5545 calendar export. |

Maple gained `documents`, `history` and `crs_plan` intents on top of these modules.

## Future ideas

- Encrypted export (passphrase) and optional biometric app lock.
- Home-screen widgets (days to citizenship).
- Import from CBSA travel-history PDFs.
- Spouse/partner profiles for family planning.
- More languages (French, Punjabi, Hindi, Tagalog, Spanish).
