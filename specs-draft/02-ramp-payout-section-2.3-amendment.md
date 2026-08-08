# Proposed amendment — SPEC 02 section 2.3

**Proposed by:** build fleet, 2026-08-07. Awaiting human promotion.
**Rationale:** ADR-001. Section 2.3 as written declares properties over a
parameter space in which they are false.

## Replace section 2.3 with

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
| P6 | Accrued value never exceeds `target_minor` | admissible profiles |
| P7 | Deterministic: same inputs, same output, always | all profiles |
| **P8** | **An inadmissible profile is rejected and yields no ramp** | **all profiles** |

Generator ranges for property testing remain `N` in 3..60, `T` in
100..1000000, `R` in 0.01..0.20. Admissibility partitions that space; P1-P6
are asserted on the admissible side and P8 on the inadmissible side.

**A commitment may not be created on an inadmissible profile.** This is a hard
validation at the persistence boundary, in the same manner as SPEC 03
section 3.2.
