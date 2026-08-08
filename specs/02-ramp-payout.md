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

| ID | Property |
|---|---|
| P1 | `sum(value) == target_minor` exactly, for every valid (T, N, R) |
| P2 | `value` is strictly increasing |
| P3 | `value[i] > 0` for all i |
| P4 | `ramp_value(p) >= 0` for all p including out of range |
| P5 | Accrued value never decreases as sessions are added (N3) |
| P6 | Accrued value never exceeds `target_minor` (SPEC 01 section 1.4) |
| P7 | Function is deterministic: same inputs, same output, always |

Valid ranges for property testing: `N` in 3..60, `T` in 100..1000000, `R` in
0.01..0.20.

## 2.4 Golden fixtures

`specs/fixtures/ramp-golden.json` is the pinned expected output. Tests load it
and compare exactly. **These values are authoritative — if an implementation
disagrees, the implementation is wrong.**

Default profile, T=10000 (100.00), N=12:

    500, 561, 621, 682, 742, 803, 864, 924, 985, 1045, 1106, 1167     sum 10000

Doubled profile, T=20000 (200.00), N=12:

    1000, 1121, 1242, 1364, 1485, 1606, 1727, 1848, 1970, 2091, 2212, 2334
    sum 20000

## 2.5 Structural floor

Because a broken chain resets `position` to 0 in streak mode, an inconsistent
pattern cannot reach the target within the window. This is the entire
enforcement mechanism: **nothing is ever confiscated; the calendar simply runs
out.**

Reference case for tests — true alternating (one on, one off) over a 30-day
window at the default profile: every session is `position` 0, giving 15 sessions
at 500 = **7500 minor units, exactly 75% of target.** This case must be
covered by an explicit test.

## 2.6 Display

Minor units convert to display only at the presentation boundary. No stored
value is ever a decimal.
