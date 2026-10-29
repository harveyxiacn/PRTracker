# 2026-10-16: RCIC rules and content review fixes

Two pre-launch reviews were done in the role of an RCIC: one on rules and calculations, one on content accuracy. Their sources were primary: canada.ca, Justice Laws and quebec.ca. Every critical, high and medium item is fixed, along with the small low items.

## Decisions
| Decision | Why |
|---|---|
| **PR card window = expiry − 270 days** (`PR_CARD_RENEWAL_DAYS`) | IMM 5444 and Guide 5445 return renewals for cards valid "more than nine (9) months (270 days)". Nine calendar months is 273 to 276 days, so the old date could be up to 6 days too early. This replaces the 2026-10-16 decision "PR card renewal at 9 months". |
| **Strict-mode must-return-by = F − 2** | In strict mode the return day is itself an absence. A brute-force test showed that returning on the old date broke compliance. Default mode (F − 1) was already correct. |
| **"Meets physical presence (estimate)", not "eligible"** | The app checks only days. Citizenship Act s.21 excludes prison, parole and probation, and time as a refugee claimant doesn't count. Taxes, language and the test are separate requirements. |
| **Days abroad that may count are explained, not modelled** | IRPA s.28(2)(a)(ii)–(iv) credits need facts the app doesn't collect (a spouse's citizenship, the employer). A note and a link avoid false alarms without overstating compliance. |
| **Program badges: PGP paused; caregiver pilots and Start-up Visa closed; AIP changing** | Current IRCC pages and Ministerial Instructions (MI86–89, 91). |

## Not done (follow-ups)
- TEF/TCF/PTE Core → CLB converter, the FST eligible-trade (NOC group) check, and counting filed tax years against the 5-year window.
- A "days to exclude" field for citizenship (prison, parole, probation).
- An RCIC should confirm the boundary-day rule for the residency obligation and the 10-year biometrics reuse public policy for PR.
