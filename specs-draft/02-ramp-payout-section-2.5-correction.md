# Proposed correction — SPEC 02 section 2.5

**Proposed by:** build fleet, 2026-08-07. Awaiting human promotion.
**Rationale:** Q16. Section 2.5's central claim is false for every pattern
looser than true alternating, which means the "entire enforcement mechanism"
enforces much less than the section says it does.

## The problem

Section 2.5 currently states:

> Because a broken chain resets `position` to 0 in streak mode, an inconsistent
> pattern cannot reach the target within the window. This is the entire
> enforcement mechanism: **nothing is ever confiscated; the calendar simply
> runs out.**

The reference case it gives — true alternating, 15 sessions all at position 0,
7500 of 10000 — is correct. But it is the *only* inconsistent pattern that
falls short. Measured at the default profile (T=10000, N=12, W=30):

| Pattern | Completed days | Longest run | Accrued |
|---|---|---|---|
| 1 on / 1 off | 15 | 1 | **7,500** |
| 2 on / 1 off | 20 | 2 | **10,000** (full) |
| 3 on / 1 off | 23 | 3 | 10,000 (full) |
| 4 on / 1 off | 24 | 4 | 10,000 (full) |

A user whose longest streak is **two days** earns exactly what a user who ran
all twelve in a row earns. The arithmetic is straightforward: a 2-on-1-off pair
is worth `value[0] + value[1]` = 500 + 561 = 1,061, and ten such pairs fit in a
30-day window, giving 10,610 — over the target before the cap applies.

This is not an implementation error. SPEC 01 section 1.4 defines
`accrued_minor = min(sum(session_values), stake_target_minor)`, and the
implementation follows it exactly. The defect is in section 2.5's claim about
what that formula implies.

## Why it matters

The design leans on the streak as the motivating mechanism, and the escalating
ramp as the thing that makes the last days worth most. If two-day runs pay the
same as twelve-day runs, then within a 30-day window the ramp mostly rewards
*volume* rather than *consecutiveness*, and reaching `streak_target` buys only
the optional double (SPEC 01 section 1.6) rather than the money.

That may be acceptable — 20 of 30 days is real behaviour change, and the
product's stance is that a missed day is not a failure. But it should be a
decision, not a side effect that section 2.5 says is impossible.

## Proposed replacement for section 2.5

## 2.5 The structural floor

Nothing is ever confiscated. A missed day costs future value, never earned
value: the calendar runs out rather than a penalty being applied.

The floor this produces is real but **shallower than a clean-chain
requirement**. Because accrual is the sum of per-session values (SPEC 01
section 1.4) rather than a function of the longest run, a pattern with short
but frequent runs can reach the target inside a long window.

Reference cases at the default profile (T=10000, N=12, W=30), all of which
must be covered by explicit tests:

| Pattern | Longest run | Accrued |
|---|---|---|
| True alternating (1 on / 1 off) | 1 | 7,500 — 75% of target |
| 2 on / 1 off | 2 | 10,000 — full target |

**Reaching `streak_target` is therefore not what earns the target value.** It
unlocks the double (SPEC 01 section 1.6) and nothing else. Copy must not imply
that an unbroken run is required to be paid in full.

If a deeper floor is wanted, it is an economics change and belongs in the
thesis conversation. Two shapes were considered and neither is adopted here:
gating the final tranche of value on reaching `streak_target`, or scaling
`window_days` against `streak_target` so that a k-on-1-off pattern cannot fit
enough pairs to clear the target.
