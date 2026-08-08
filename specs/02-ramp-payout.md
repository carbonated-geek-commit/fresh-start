# SPEC 02 — Ramp and Payout

**Highest blast radius in the codebase. This determines value owed to a user.**

## 2.1 Hard constraints

- All arithmetic in **integer minor units**. Floating point is prohibited in
  any code path that produces a stored or displayed value.
- The ramp is a **pure function**. No I/O, no database, no clock, no
  randomness. All inputs are arguments.
- Intermediate division uses an exact rational type (e.g. Python `Fraction`,
  a decimal type, or scaled-integer arithmetic). Never a binary float.

## 2.2 Algorithm

Given `target_minor` (T), `streak_target` (N), `base_ratio` (R, default `0.05`):

    base_minor  = round(T * R)
    triangular  = N * (N - 1) / 2
    step_exact  = (T - N * base_minor) / triangular        # exact rational

    for i in 0 .. N-2:
        value[i] = round(base_minor + step_exact * i)

    value[N-1] = T - sum(value[0 .. N-2])                  # absorbs remainder

`ramp_value(position)` returns `value[position]` for `position` in `0..N-1`, and
`0` for `position >= N`.

Rounding is half-up. The final element absorbs all accumulated rounding
remainder so the sum is exact.

## 2.3 Invariants (assert as property tests)

A profile `(T, N, R)` is **admissible** if and only if the ramp computed from
it by section 2.2 satisfies P1, P2, and P3. Admissibility is decided by
computing the ramp, not by testing the parameters. It is not expressible as a
range: validity is not monotone in `T`.

| ID | Property | Scope |
|---|---|---|
| P1 | `sum(value) == target_minor` exactly | admissible profiles |
| P2 | `value` is strictly increasing | admissible profiles |
| P3 | `value[i] > 0` for all i | admissible profiles |
| P4 | `ramp_value(p) >= 0` for all p including out of range | admissible profiles |
| P5 | Accrued value never decreases as sessions are added (N3) | admissible profiles |
| P6 | Accrued value never exceeds `target_minor` (SPEC 01 section 1.4) | admissible profiles |
| P7 | Deterministic: same inputs, same output, always | all profiles |
| **P8** | **An inadmissible profile is rejected and yields no ramp** | **all profiles** |

Generator ranges for property testing remain `N` in 3..60, `T` in
100..1000000, `R` in 0.01..0.20. Admissibility partitions that space; P1-P6
are asserted on the admissible side and P8 on the inadmissible side.

**A commitment may not be created on an inadmissible profile.** This is a hard
validation at the persistence boundary, in the same manner as SPEC 03
section 3.2.

*History: the original section declared P1-P7 across the full generator range.
Measured, 680 of 928 sampled combinations violated P2 and 461 violated P3 —
`N=6, T=1000, R=0.20` produces a descending ramp. Corrected per ADR-001,
promoted 2026-08-07.*

## 2.4 Golden fixtures

`specs/fixtures/ramp-golden.json` is the pinned expected output. Tests load it
and compare exactly. **These values are authoritative — if an implementation
disagrees, the implementation is wrong.**

Default profile, T=10000 (100.00), N=12:

    500, 561, 621, 682, 742, 803, 864, 924, 985, 1045, 1106, 1167     sum 10000

Doubled profile, T=20000 (200.00), N=12:

    1000, 1121, 1242, 1364, 1485, 1606, 1727, 1848, 1970, 2091, 2212, 2334
    sum 20000

## 2.5 The structural floor

Nothing is ever confiscated. A missed day costs future value, never earned
value: the calendar runs out rather than a penalty being applied.

The floor this produces is real but **shallower than a clean-chain
requirement**. Because accrual is the sum of per-session values (SPEC 01
section 1.4) rather than a function of the longest run, a pattern with short
but frequent runs can reach the target inside a long window.

Reference cases at the default profile (T=10000, N=12, window 30), all of which
must be covered by explicit tests:

| Pattern | Longest run | Accrued |
|---|---|---|
| True alternating (1 on / 1 off) | 1 | 7,500 — 75% of target |
| 2 on / 1 off | 2 | 10,000 — full target |
| 3 on / 1 off | 3 | 10,000 — full target |

**Reaching `streak_target` is therefore not what earns the target value.** It
unlocks the double (SPEC 01 section 1.6) and nothing else. Copy must not imply
that an unbroken run is required to be paid in full.

Deepening the floor would be an economics change and belongs in the thesis
conversation. Two shapes were considered and neither is adopted: gating the
final tranche of value on reaching `streak_target`, or scaling `window_days`
against `streak_target` so a k-on-1-off pattern cannot fit enough pairs to
clear the target.

*History: the original section claimed an inconsistent pattern "cannot reach
the target within the window" and called that the entire enforcement
mechanism. True alternating is the only inconsistent pattern that falls short;
a two-day maximum run reaches the full target. Corrected per Q16, promoted
2026-08-07. No code changed — the implementation always followed SPEC 01
section 1.4 correctly.*

## 2.6 Display

Minor units convert to display only at the presentation boundary. No stored
value is ever a decimal.
