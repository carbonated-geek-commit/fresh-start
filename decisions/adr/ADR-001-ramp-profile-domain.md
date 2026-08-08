# ADR-001 — Ramp profile domain is validated by computation, not by range

**Status:** accepted
**Date:** 2026-08-07
**Spec anchor:** SPEC 02 sections 2.2, 2.3
**Invariants touched:** N3, N4 (this ADR strengthens both; it weakens neither)

## Context

SPEC 02 section 2.3 states that properties P1-P7 hold across
`N` in 3..60, `T` in 100..1000000, `R` in 0.01..0.20.

Measured against the section 2.2 algorithm, they do not. Sampling that
parameter space (928 combinations across the declared ranges):

- **680 violate P2** (`value` strictly increasing)
- **461 violate P3** (`value[i] > 0`)

The cause is structural, not a rounding artifact. Section 2.2 computes

    base_minor = round(T * R)
    step_exact = (T - N * base_minor) / (N * (N - 1) / 2)

When `N * base_minor >= T`, `step_exact` is zero or negative and the ramp is
flat or **descending**. Worked example inside the declared ranges,
`N=6, T=1000, R=0.20`:

    200, 187, 173, 160, 147, 133      (descending)

A descending ramp inverts the entire design intent — value would be highest
where willpower is strongest — and a sufficiently negative `step_exact`
produces negative day values, which is an N3 hazard (a user could be zeroed
after earning).

`N * R < 1` is a necessary condition but not a sufficient one. Requiring
`step_exact >= 1` removes most failures but not all: the final element absorbs
the accumulated rounding remainder (section 2.2), so it can collide with its
predecessor. `N=9, T=100, R=0.05` has `step_exact = 1.53` and still ends
`... 14, 16, 16` — P2 fails on the last pair.

Validity is also **not monotone in `T`**. For `N=12, R=0.01` the profile is
valid at `T=110` and invalid at `T=111`. There is therefore no closed-form
precondition on `(T, N, R)` that is both correct and simple enough to trust.

## Decision

The section 2.2 algorithm is implemented **exactly as specified and is not
modified.** The fixture in `specs/fixtures/ramp-golden.json` remains
authoritative and reproduces bit-exactly.

A profile's admissibility is decided by **computing the ramp and asserting
P1-P3 on the actual output**, not by testing its parameters against a range.

- `buildRamp(profile)` computes per section 2.2, then verifies P1, P2, P3 on
  the result. On failure it throws `RampDomainError` and returns no value.
- `isAdmissibleProfile(profile)` is the total, non-throwing predicate used at
  the commitment-creation boundary and by the UI.
- No commitment may be created on an inadmissible profile. This is validation
  at the persistence boundary, in the same manner SPEC 03 section 3.2 rejects
  `x_large`.

Property tests assert P1-P7 over the admissible subspace, and separately
assert that every inadmissible profile is **rejected** rather than silently
producing a bad ramp. The declared section 2.3 ranges are retained as the
*generator* range; admissibility partitions them.

`N=60` is reachable only at `R <= 0.016`; the default `R = 0.05` admits
`N <= 19`. The UI therefore derives selectable streak targets from
`isAdmissibleProfile` against the user's chosen target rather than offering
3..60 unconditionally.

## Consequences

- No caller can obtain a flat, descending, or negative ramp. P2 and P3 hold by
  construction for every ramp that exists at runtime.
- Some parameter combinations SPEC 02 section 2.3 implies are legal are
  refused. This is a deliberate narrowing, and it is the conservative
  direction: it can only prevent a bad payout, never cause one.
- Cost is O(N) with `N <= 60` on a path already computing the ramp. Negligible.

## Escalation note for the human

This ADR resolves an ambiguity in a promoted spec, which CLAUDE.md section 3
places inside Chief's authority. It is recorded here rather than escalated
because it makes no invariant false and narrows rather than widens behaviour.

**However, SPEC 02 section 2.3 as written is factually incorrect** and only a
human commit may promote a correction. A proposed amendment is filed at
`specs-draft/02-ramp-payout-section-2.3-amendment.md`.
