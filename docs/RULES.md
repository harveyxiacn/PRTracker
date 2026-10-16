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
- Each day in Canada **before PR** as a temporary resident (worker, student, visitor) or a
  protected person = **½ day**, capped at **365 credited days** (730 real days).
- Days with no legal status, or before your first status period, earn nothing.
- Window used: `[applicationDate − 5 years, applicationDate − 1 day]` (conservative: the
  application day itself is not counted).
- You must be a PR on the application date.
- **Earliest date** = the first date on or after today when credited days ≥ 1,095, given the
  trips you’ve logged (including planned ones) and assuming you are in Canada otherwise.
- **Safe date** = the same calculation with 1,095 + *safety margin* (Settings, default 10 days).

Other requirements are shown as reminders, not computed: tax filing for 3 of the 5 years,
language proof (CLB 4+) and the knowledge test for ages 18–54, and no prohibitions.

## PR residency obligation (`residencyAt`)

IRPA s.28: **730 days** in Canada in every 5-year period.

- **PR for 5 years or more:** count PR days present in `[date − 5 years, date − 1]`; compliant if ≥ 730.
- **PR for under 5 years:** compliant if `days present so far + days remaining until the 5th
  anniversary ≥ 730` (you can still reach 730 by the anniversary).
- **“If I leave tomorrow”:** simulate being away from tomorrow (departure day counts as present)
  and find the first day the obligation would fail. *Must return by* = the day before that;
  *max absence* = full days outside. When you are already abroad, the same calculation runs
  from today.
- **Regain date** (if non-compliant): the first future date compliance holds again if you stay.
- Verified by brute force in `presence.test.ts`: returning on *must-return-by* stays compliant
  every day for a year afterwards, and returning one day later fails.

Only days in Canada (time as a PR accompanying a Canadian-citizen spouse abroad, etc., is **not** modelled; see *Limitations*).

## PR card (`insights.ts`)

- IRCC accepts renewals when the card **expires in less than 9 months**.
  `renewalOpens = expiry − 9 months`.
- Reminders: renewal window opens, 90 days and 30 days before expiry.
- An expired card does not end PR status, but you need a valid card or a PR Travel Document
  to board a flight to Canada (the assistant warns when a planned trip spans the expiry date).

## Reminders (`insights.ts`, `notify/notifications.ts`)

| Reminder | When |
|---|---|
| Citizenship eligible | on the earliest date, and 30 days before |
| PR card renewal window | expiry − 9 months |
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

## Limitations

- Time abroad that IRCC may count toward the residency obligation (accompanying a Canadian
  citizen spouse, or working full-time for a Canadian business) is not modelled.
- Days in prison, on probation or on parole, which do not count for citizenship, are not modelled.
- IRCC data mapping relies on the field names in IRCC’s JSON. Check the mirror log in the
  *Refresh open data* workflow when IRCC changes its format.
