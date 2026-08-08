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

### Q14 — Should the month-end artifact ever be link-shareable?
Blueprint v0.4 section 4.5 calls the artifact "the natural referral surface".
Built as an owner-only page (ADR-003) because a public URL carrying a
completion record is an outbound path for behavioural data, which N9 forbids.

Making it link-shareable is possible — a signed, expiring, opt-in link with a
reduced payload would be the shape — but it is an N9 amendment and therefore a
thesis-level conversation, not a feature decision.

**Status:** OPEN — not blocking. The artifact ships owner-only.

### Q15 — What transport delivers the two daily nudges?
SPEC 05 section 5.3 requires two nudges per commitment per day and calls them
core scaffolding rather than a preference. The scheduler is built and tested as
a pure function; nothing sends. v1 surfaces them in-app only (ADR-002).

Web push needs a VAPID key pair, which is a credential and therefore a human
decision under CLAUDE.md section 4. Email would need a sending domain.

**Status:** OPEN — the app works without it, but the nudges are not doing their
job until something delivers them off-surface.

### Q16 — The structural floor is much shallower than SPEC 02 section 2.5 claims
Section 2.5 says "an inconsistent pattern cannot reach the target within the
window" and calls that "the entire enforcement mechanism". Measured at the
default profile, only *true alternating* falls short (7,500). A **2-on-1-off**
pattern — longest run of two days — reaches the full 10,000, the same as a
clean twelve-day run.

The implementation is correct: SPEC 01 section 1.4 defines accrual as
`min(sum(session_values), target)` and that is exactly what it does. Section
2.5's claim about the consequence is what is wrong.

Consequence: within a 30-day window the ramp rewards volume more than
consecutiveness, and reaching `streak_target` buys only the optional double,
not the value. That may be fine — 20 of 30 days is real change — but it should
be chosen rather than assumed.

Correction filed at `specs-draft/02-ramp-payout-section-2.5-correction.md`.
Pinned by tests in `tests/streak.test.ts`.

**Status:** OPEN — not blocking, and no code change is warranted without a
decision. Deepening the floor is an economics change (thesis-level).

### Q17 — The SQL data-spine suite  **RESOLVED 2026-08-07**
`db/tests/rls.test.sql` now runs green: **19 assertions against real
PostgreSQL 18.4**, including the two that could never be checked from
TypeScript — that an application-layer bypass of RLS returns nothing, and that
the outbound role can read only rows carrying a live, unrevoked egress grant.

Docker Desktop would not start on the build machine (processes up, WSL backend
stopped), so `scripts/db-test.mjs` was added as a Docker-free path: it runs a
genuine embedded PostgreSQL binary rather than simulating one. A simulated RLS
test would be worse than none — it would report green on enforcement that does
not exist. `scripts/db-test.sh` remains the Docker path for CI.

Run with `npm run test:db`.

**Status:** ANSWERED.
