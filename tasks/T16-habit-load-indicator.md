---
id: T16
title: Habit load indicator and size staircase
stage: build
owner_agent: builder
status: done
depends_on: [T09]
file_ownership:
  - "src/habits/load/**"
spec_refs:
  - "SPEC 03 section 3.4"
  - "SPEC 03 section 3.5"
mock_only: false
plan_approval: false
---

## Objective

The green-to-red load indicator and the next-rung proposal.

## Acceptance criteria

- [x] Levels follow SPEC 03 section 3.4: 1-2 green, 3 yellow, 4 orange, 5 red (SPEC 03 section 3.4)
- [x] Maximum 5 concurrent commitments (SPEC 01 section 1.7)
- [x] The indicator warns and never blocks (SPEC 03 section 3.4)
- [x] Launch copy is framed as a heuristic, not a prediction (SPEC 03 section 3.4)
- [x] A held habit triggers a next-rung proposal the user may decline (SPEC 03 section 3.5)

## Notes

Thresholds are re-derived from SPEC 07 data once it exists.

## Log

_Append-only. One line per claim, hand-off, and completion._
- 2026-08-07 builder: complete. Indicator warns and never blocks; staircase proposes only after a full window held.
