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

### Q13 — Health playbook ritual content  **ANSWERED 2026-08-07**
The concrete reclaim, rules, and starter-habit content for SPEC 08 section 8.4.

**Answer:** signed off by the human as shipped. The content in
`src/domains/health/playbook.ts` — the three rituals, the five starter habits,
and the N10 honesty box — is now the promoted content, not a proposal. T14 is
unblocked.

**Status:** ANSWERED.

### Q14 — Should the month-end artifact ever be link-shareable?
Blueprint v0.4 section 4.5 calls the artifact "the natural referral surface".
Built as an owner-only page (ADR-003) because a public URL carrying a
completion record is an outbound path for behavioural data, which N9 forbids.

Making it link-shareable is possible — a signed, expiring, opt-in link with a
reduced payload would be the shape — but it is an N9 amendment and therefore a
thesis-level conversation, not a feature decision.

**Answer (2026-08-07, human deferred to build judgement):** **no.** The
artifact stays owner-only, permanently, and this is now settled rather than
pending.

The reasoning is that the alternative is not a smaller version of the same
feature — it is a different product promise. FreshStart's pitch is that
behavioural data never leaves without the user moving it. A signed, expiring,
reduced-payload link would still be an unauthenticated URL that returns a
person's completion record to anyone holding it, and the moment one exists the
honest version of the privacy copy becomes "your data does not leave, except
when it does". Losing the frictionless referral loop is the cheaper side of
that trade, and the print/screenshot path already gets the user to the same
place through a channel they chose.

Revisit only as a deliberate N9 amendment at thesis level.

**Status:** ANSWERED.

### Q15 — What transport delivers the two daily nudges?
SPEC 05 section 5.3 requires two nudges per commitment per day and calls them
core scaffolding rather than a preference. The scheduler is built and tested as
a pure function; nothing sends. v1 surfaces them in-app only (ADR-002).

Web push needs a VAPID key pair, which is a credential and therefore a human
decision under CLAUDE.md section 4. Email would need a sending domain.

**Answer (2026-08-07, human deferred to build judgement):** **contentless web
push**, built behind env-supplied VAPID keys.

Web push is the only transport that reaches a mobile-web user with no app
store and no email domain, and CLAUDE.md section 4 already approves a push
service. The keys stay a human decision: with `VAPID_PUBLIC_KEY` /
`VAPID_PRIVATE_KEY` unset the app runs exactly as before, in-app only.

**The payload carries nothing.** The push is a tickle; the service worker wakes,
fetches the cue from this server with the user's session, and builds the
notification locally. Web push payloads are encrypted end to end, so carrying
the habit label would not technically leak it to the push service — but the
push endpoint is still a third party on an outbound path, and N9 is about
whether such a path exists at all, not about how well it is encrypted. A
contentless tickle means there is no behavioural data in transit to reason
about.

**Status:** ANSWERED.

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

**Answer (2026-08-07, human aligned):** the finding and the recommendation are
both accepted. **The spec text is corrected; the economics are unchanged.**
SPEC 02 section 2.5 has been promoted with the real numbers and now states
explicitly that reaching `streak_target` unlocks the double and nothing else.
No code changed — the implementation always followed SPEC 01 section 1.4
correctly.

Deepening the floor remains available as a future thesis-level change; the two
candidate shapes are recorded in section 2.5.

**Status:** ANSWERED.

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
