# Open Questions

The architect's interview agenda. One question at a time, in order. Answers are
recorded here and marked `ANSWERED` with a date. Spec amendments go to
`specs-draft/`, never to `specs/`.

## Resolved before build (recorded for context — do not re-ask)

| # | Question | Answer |
|---|---|---|
| 1 | Custody model | **Non-custody.** Promise to fund; nothing held. User may decline at settlement. |
| 2 | Real money in v1 | **No.** Points only. Payment processing is a later phase. |
| 3 | Consent ledger schema | Confirmed: four columns, RLS-enforced. |
| 4 | Streak length | **User-configurable**, recommended default 12. Hitting the streak unlocks the optional double. |
| 5 | Mode framing | Accepted; revisitable. |
| 6 | Referee dispute machinery | **Deferred.** Referee flag is advisory in v1. |
| 7 | Partner PII | Opt-in only. Non-opted invitee email is an attribute of the inviter's profile. |
| 8 | Multi-habit ceiling | **5**, with a green-to-red load indicator. Sizes: small 0-15, medium 15-30, large 30+. |
| 9 | First domain | Health. |
| 10 | Terminal mode | In-process. |

## OPEN

### Q11 — Pricing
Subscription price point and tier structure. Not blocking the build.

**Status:** OPEN

### Q12 — Settlement default at the currency phase
v1 is points, so nothing charges. When currency ships, does settlement default
to processing unless the user declines, or to not processing unless the user
confirms?

Context: a settlement-day veto means the stake is proposed rather than at risk,
which is a different intervention from the binding contracts the design's
reference effect sizes come from. SPEC 07 instrumentation is built to measure
this before the decision is needed.

**Status:** OPEN — not blocking v1.

### Q13 — Health playbook ritual content
The concrete reclaim, rules, and starter-habit content for SPEC 08 section 8.4.

**Status:** OPEN — blocks T14 only.
