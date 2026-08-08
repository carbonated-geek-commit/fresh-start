---
id: T18
title: Recovery day experience
stage: build
owner_agent: builder
status: done
depends_on: [T05, T08]
file_ownership:
  - "src/engine/recovery/**"
spec_refs:
  - "SPEC 05 section 5.4"
  - "SPEC 07 section 7.2"
mock_only: false
plan_approval: false
---

## Objective

The day after a miss, treated as the most supported moment in the product.

## Acceptance criteria

- [x] A completion immediately following a miss is acknowledged as a return, not a reset (SPEC 05 section 5.4)
- [x] Copy never frames it as failure, restart-from-scratch, or lost progress (SPEC 05 section 5.4)
- [x] A `recovery` event is emitted with `days_since_miss` (SPEC 07 section 7.2)

## Notes

Position still economically resets per SPEC 01 section 1.3. The acknowledgment
is emotional, not economic. This is the highest-leverage moment in the product.

## Log

_Append-only. One line per claim, hand-off, and completion._
- 2026-08-07 builder: complete. Recovery is a first-class transition, leads the UI on a return day, and emits its own event.
