---
id: T05
title: Streak state machine
stage: build
owner_agent: builder
status: done
depends_on: [T04]
file_ownership:
  - "src/engine/streak/**"
spec_refs:
  - "SPEC 01 section 1.3"
  - "SPEC 01 section 1.4"
  - "SPEC 01 section 1.8"
mock_only: false
plan_approval: true
---

## Objective

Position tracking, grace days, window ceiling, and accrual.

## Acceptance criteria

- [x] Streak mode resets `position` to 0 on a missed day unless a grace day is available (SPEC 01 section 1.3)
- [x] A grace day holds `position` without incrementing, is consumed once, and does not replenish (SPEC 01 section 1.3)
- [x] Consistency mode increments `position` on every completion regardless of gaps (SPEC 01 section 1.3)
- [x] Accrual is monotonic and never decreases (SPEC 01 section 1.4)
- [x] Accrual is capped at `stake_target_minor`; later sessions add zero but are recorded (SPEC 01 section 1.4)
- [x] `abandoned` requires an explicit user action; inactivity never abandons (SPEC 01 section 1.8)

## Notes

Time is passed in, never read from a clock inside the engine.

## Log

_Append-only. One line per claim, hand-off, and completion._
- 2026-08-07 builder: complete. Grace day, window ceiling, accrual cap; alternating floor test yields exactly 7500.
