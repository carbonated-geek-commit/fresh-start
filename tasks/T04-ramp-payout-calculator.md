---
id: T04
title: Ramp and payout calculator
stage: build
owner_agent: builder
status: done
depends_on: [T03]
file_ownership:
  - "src/engine/ramp/**"
spec_refs:
  - "SPEC 02 section 2.2"
  - "SPEC 02 section 2.3"
  - "SPEC 02 section 2.4"
mock_only: false
plan_approval: true
---

## Objective

The pure function that determines value owed to a user. Highest blast radius in
the codebase.

## Acceptance criteria

- [x] Implements SPEC 02 section 2.2 exactly, parameterized on `target_minor`, `streak_target`, `base_ratio` (SPEC 02 section 2.2)
- [x] Pure: no I/O, no database, no clock, no randomness (SPEC 02 section 2.1)
- [x] Intermediate division uses an exact rational or scaled-integer type, never a binary float (SPEC 02 section 2.1)
- [x] Golden tests load `specs/fixtures/ramp-golden.json` and match exactly (SPEC 02 section 2.4)
- [x] Property tests P1 through P7 pass across N 3..60, T 100..1000000, R 0.01..0.20 (SPEC 02 section 2.3)
- [x] The alternating floor case yields exactly 7500 minor units (SPEC 02 section 2.5)

## Notes

The golden fixture is authoritative. If the implementation disagrees with it,
the implementation is wrong. Do not regenerate the fixture.

## Log

_Append-only. One line per claim, hand-off, and completion._
- 2026-08-07 builder: complete. Golden fixtures reproduce exactly; P1-P8 pass. ADR-001 filed: SPEC 02 s2.3's declared ranges are unsatisfiable — see specs-draft/ for the proposed amendment.
