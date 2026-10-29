# Calculation rules

Every number in the app comes from the pure functions in `src/domain/`. Each rule below
says where it is implemented and which tests cover it. These are **planning estimates**:
IRCC decides, and its official
[physical presence calculator](https://eservices.cic.gc.ca/rescalc/resCalcStartNew.do) is the reference.

## Counting days (`presence.ts`)

- All maths uses **whole calendar days** (UTC day numbers) to avoid time-zone and DST errors.
- A trip has a departure day (left Canada) and a return day (back in Canada).
- **Default (IRCC practice):** the departure day and the return day both count as days **in**
  Canada. A trip from Mar 1 to Mar 10 is **8 days** outside. A same-day trip is 0 days.
- **Strict mode** (Settings): both border days count as outside (Mar 1–10 = 10 days).
- An **ongoing trip** (no return date) counts as outside up to and including today; projections
  assume you return tomorrow.
- **Future trips** are “planned”: they are included in projections (eligibility dates, reminders).

## Citizenship: physical presence (`citizenshipAt`, `citizenshipEligibleDate`)

Citizenship Act s.5(1)(c):

- At least **1,095 days** physically present in the **5 years immediately before** the application date.
- Each day in Canada **as a PR** = 1 day.
- Each day in Canada **before PR** as an authorised temporary resident (worker, student, visitor,
  temporary resident permit holder, maintained status) or as a protected person = **½ day**,
  capped at **365 credited days** (730 real days) (s.5(1.001)).
- Protected-person time counts only **from the date of the positive decision** (claim or PRRA
  approved). Time waiting for a decision on a refugee claim does not count. The app can't tell
  these apart, so Settings labels the "other" kind *Other authorized temporary resident status*
  and shows hints for the protected and other kinds; users enter only qualifying periods.
- Days with no legal status, or before your first status period, earn nothing.
- Window used: `[applicationDate − 5 years, applicationDate − 1 day]` (conservative: the
  application day itself is not counted).
- You must be a PR on the application date.
- **Earliest date** = the first date on or after today when credited days ≥ 1,095, given the
  trips you’ve logged (including planned ones) and assuming you are in Canada otherwise.
- **Safe date** = the same calculation with 1,095 + *safety margin* (Settings, default 10 days).

Other requirements are shown as reminders, not computed: tax filing for 3 of the 5 years,
language proof (CLB 4+) and the knowledge test for ages 18–54, and no prohibitions.

Because only days are checked, the app never says "eligible to apply". Results read
"meets the physical presence requirement (estimate)", and Home's citizenship card, Maple's
citizenship and explain answers and the Application helper (screen and print report) show
`common.citExclusions`: time in prison, on parole or probation (Citizenship Act s.21) and time as
a refugee claimant before becoming a protected person do not count; taxes, language and the
knowledge test are also required. Citizenship reminders say "you may meet / may be able to apply".

## PR residency obligation (`residencyAt`)

IRPA s.28: **730 days** in Canada in every 5-year period.

- **PR for 5 years or more:** count PR days present in `[date − 5 years, date − 1]`; compliant if ≥ 730.
- **PR for under 5 years:** compliant if `days present so far + days remaining until the 5th
  anniversary ≥ 730` (you can still reach 730 by the anniversary).
- **“If I leave tomorrow”:** simulate being away from tomorrow (departure day counts as present
  by default) and find the first day `F` the obligation would fail. Compliance on a day depends on
  presence up to the day before, so:
  - default mode (return day counts as present): *must return by* = `F − 1`;
  - strict mode (return day counts as outside): *must return by* = `F − 2`.

  *Max absence* = days outside if you return on that date (default `(leave, return)` exclusive,
  strict `[leave, return]` inclusive). When you are already abroad, the same calculation runs
  from today and *max absence* is the number of days until *must return by*.
- **Regain date** (if non-compliant): the first future date compliance holds again if you stay.
- Verified by brute force in `presence.test.ts`, in **both** modes (leaving tomorrow, new PR,
  already abroad): returning on *must-return-by* stays compliant every day for 400 days
  afterwards, and returning one day later fails.

Only days in Canada are counted. Days abroad that IRPA s.28(2)(a)(ii)–(iv) treats as days in
Canada (accompanying a Canadian-citizen spouse, common-law partner or parent; employed full time
by a Canadian business or the federal/provincial public service; accompanying a PR spouse or
parent who is so employed) are **not** modelled, so the result errs on the cautious side. The
Home residency card, Maple's residency answer, the "at risk" tip and the reminder say so and link
to [IRPA s.28](https://laws-lois.justice.gc.ca/eng/acts/i-2.5/section-28.html); H&C
considerations (s.28(2)(c)) can also overcome a breach.

## PR card (`insights.ts`)

- IRCC returns a renewal application if the card is still valid for **more than nine months
  (270 days)** ([Guide 5445](https://www.canada.ca/en/immigration-refugees-citizenship/services/application/application-forms-guides/guide-5445-applying-permanent-resident-card-card-first-application-replacement-renewal-change-gender-identifier.html),
  [IMM 5444](https://www.canada.ca/en/immigration-refugees-citizenship/services/application/application-forms-guides/imm5444.html)).
  `renewalOpens = expiry − 270 days` (`PR_CARD_RENEWAL_DAYS` in `presence.ts`, the single constant
  used by `insights.ts`, `forms.ts` (`cardRenewalOpens`, `cardRenewalCheck`), `documents.ts`
  (PR card warning) and Maple). Nine calendar months would be 273–276 days, too early.
- Reminders: renewal window opens, 90 days and 30 days before expiry.
- An expired card does not end PR status, but you need a valid card or a PR Travel Document
  to board a flight to Canada (the assistant warns when a planned trip spans the expiry date).

## Reminders (`insights.ts`, `notify/notifications.ts`)

| Reminder | When |
|---|---|
| Citizenship eligible | on the earliest date, and 30 days before |
| PR card renewal window | expiry − 270 days |
| PR card expiry | 90 and 30 days before |
| Must return (while abroad) | 60, 30 and 7 days before *must return by* |
| Residency at risk | immediately when non-compliant |
| Confirm return | on a logged trip’s return date |

Native apps schedule these as OS notifications at 09:00 local time. The web build shows them
in-app and uses the Notification API when a reminder falls due while the app is open.

## Express Entry CRS (`crs.ts`)

Implements IRCC’s published CRS grid: core/human capital (age, education, first and second
official language, Canadian work), spouse factors, skill transferability (max 100) and
additional points (PNP 600, Canadian education 15/30, French 25/50, sibling 15).
**Arranged-employment points are not counted** (removed 2025-03-25).
Language tests: IELTS General → CLB table, CELPIP level = CLB, or direct CLB/NCLC input.

Program minimums (`checkPrograms`):

- **CEC**: 12 months of skilled (TEER 0–3) Canadian work in the last 3 years; CLB 7 (TEER 0/1) or CLB 5 (TEER 2/3).
- **FSW**: 1 year continuous skilled work in 10 years; CLB 7; Canadian credential or ECA; ≥ 67/100 on the selection grid; proof of funds (unless exempt).
- **FST**: 2 years of trades work in 5 years; CLB 5 speaking/listening and CLB 4 reading/writing; job offer or certificate of qualification.

## Application predictions (`timeline.ts`)

Priority of sources for the expected total processing time:

1. Your own override (days).
2. **Community** median when there are ≥ 5 similar records (same type; submitted within ±3 months if there are ≥ 5 such records, otherwise any month). Also shows the p25–p75 range and per-milestone medians (≥ 3 records).
3. **IRCC** published processing time from the daily mirror. *As of October 2026 IRCC’s public
   JSON only includes the PR card (and some citizenship sub-types); Express Entry, PNP, spousal and
   citizenship-grant times are not in it, so those fall through to step 4 until community data exists.*
4. **Fallback** service standards: Express Entry 6 months, spousal 12 months, citizenship 12 months, PR card ~2 months.

Progress % = elapsed / expected (capped at 99% until the final milestone is logged).

## Maple planners (`src/assistant/query.ts`)

- **Travel budget for a target date T**: `credited(T) − 1,095`, capped at the days left between tomorrow (or T − 5 years, if later) and T − 1. Every remaining day before T is a PR day worth exactly one credited day, so a trip of `budget` full days still leaves 1,095 on T, and one more day falls short. A test checks both sides. The “safe” figure subtracts your safety margin.
- **Best time for an N-day trip**: compares the eligibility date with and without a trip that starts tomorrow. A trip that starts on or after the eligibility date, once you have applied, doesn’t delay citizenship, because presence is counted up to the application date. It also checks the 730-day rule from the departure until a year after the return, and whether the PR card expires during the trip.
- **Explain**: the window `[date − 5y, date − 1]`, PR days present, pre-PR days and their ½ credit, and trips and days away in the window.

## Program-specific predictions

Each program has an offline estimate (IRCC service standards where they exist: Express Entry, the Atlantic Immigration Program and the EE-linked PNP 6 months, spousal 12 months, citizenship 12 months). Other estimates are labelled approximate and can be overridden per application. Study, work, visitor, super visa and child-sponsorship times come from IRCC’s per-country series for the country you apply from. Community predictions narrow to your province (PNP) or country when there are at least 5 matching records.

## Program status (verified 2026-10-16)

| Program | Status | Source |
|---|---|---|
| Parents and grandparents (`pgp`) | **Paused**: no new interest-to-sponsor forms or invitations until further notice; existing applications processed | [PGP page](https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/family-sponsorship/sponsor-parents-grandparents.html), [MI89](https://www.canada.ca/en/immigration-refugees-citizenship/corporate/mandate/policies-operational-instructions-agreements/ministerial-instructions/other-goals/mi89.html) |
| Home Care Worker Immigration Pilots (`caregiver`) | **Closed**: no new applications until 2030-03-30 (MI86/87/88/91, in force 2026-03-31) | [Caregivers page](https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/caregivers.html), [MI86-88](https://www.canada.ca/en/immigration-refugees-citizenship/corporate/mandate/policies-operational-instructions-agreements/ministerial-instructions/other-goals/mi86-87-88.html) |
| Start-up Visa (`startup`) | **Closed** to new applications since 2026-06-30 (2025 commitment-certificate holders only until then); a replacement pilot is planned | [Start-up Visa page](https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/start-visa.html) |
| Quebec Experience Program (`qc_peq`) | **Changing**: temporarily reopened 2026-07-02 to 2028-07-02 for people eligible on 2025-11-19; intake periods only | [Quebec MIFI](https://www.quebec.ca/immigration/permanente/travailleurs-qualifies/programme-experience-quebecoise/conditions-selection) |
| Quebec skilled workers (`qc_skilled`) | Open: PRTQ replaced by the PSTQ | [quebec.ca](https://www.quebec.ca/en/immigration/permanent/skilled-workers) |
| Atlantic Immigration Program (`aip`) | **Changing**: provinces limit endorsements (NB paused new employer designations through 2026) | [GNB notices](https://www.gnb.ca/en/topic/family-home-community/immigration/important-notices.html) |
| Non-Express Entry PNP (`pnp_base`) | Open; IRCC application is online through the PR Portal (paper only as an accommodation) | [IRCC](https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/provincial-nominees/non-express-entry/apply.html) |

The badge can only be *paused*, *closed* or *changing*; the description (`prog.desc.*`) carries the detail.

## Express Entry draw categories (`draws.ts`)

`OCCUPATION_CATEGORIES` lists the 2026 categories from IRCC's
[category-based selection page](https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/express-entry/rounds-invitations/category-based-selection.html)
(2026-06-22): healthcare & social services, STEM, trades, education, transport, physicians,
senior managers and researchers (the last three need Canadian work experience) and skilled
military recruits; French is detected from the draw name. *Agriculture & agri-food* is a past
category: old draws are still classified, but it is no longer offered as a choice.

## Documents (`domain/documents.ts`)

| Document | Valid until | Warning starts |
|---|---|---|
| Language test (IELTS/CELPIP/PTE/TEF/TCF) | test date + 2 years (must be < 2 years old for the Express Entry profile and the PR application) | 3 months before |
| ECA | issue date + 5 years | 3 months before |
| Immigration medical exam | exam date + 12 months | 3 months before |
| Biometrics | + 10 years, **temporary residence only** (most PR applicants give them every time) | 3 months before |
| Passport | printed expiry | 6 months before |
| Work/study permit, visitor record | printed expiry (apply to extend before it expires to keep maintained status) | 4 months before |
| Visitor visa (TRV), COPR | printed expiry | 2 months before |
| PR card | printed expiry | when the renewal window opens (expiry − 270 days) |
| Police certificate | no fixed IRCC validity; IRCC may ask for a newer one | — |

Reminders: at the warning date and 30 days before expiry (only dates on or after today).

## Personal history (`domain/history.ts`)

- PR (IMM 5669 Schedule A): from the most recent of *today − 10 years* and the *18th birthday*, to today.
- Citizenship: the 5 years before today.
- A gap is any uncovered day inside the window. Entries cover both end dates; an open entry runs to today. Address overlaps of 2+ days are flagged; 1 day is a normal moving day.

## Limitations

- Time abroad that IRCC may count toward the residency obligation (IRPA s.28(2)(a)(ii)–(iv):
  accompanying a Canadian-citizen spouse, partner or parent, or working full time for a Canadian
  business or public service) is not modelled; the app says so next to the result.
- Days in prison, on probation or on parole (Citizenship Act s.21), and time as a refugee claimant,
  which do not count for citizenship, are not modelled; the app shows an exclusions note instead.
- Tax filing is not checked against the 5-year window (only a reminder); language level is not
  converted from TEF/TCF/PTE Core (enter the CLB/NCLC level).
- The boundary-day rule is confirmed for citizenship (IRCC operational bulletin); for the
  residency obligation the app applies the same rule (not separately confirmed by a primary source).
- IRCC data mapping relies on the field names in IRCC’s JSON. Check the mirror log in the
  *Refresh open data* workflow when IRCC changes its format.
