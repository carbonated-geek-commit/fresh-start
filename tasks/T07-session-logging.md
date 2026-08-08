---
id: T07
title: Session logging
stage: build
owner_agent: builder
status: done
depends_on: [T05]
file_ownership:
  - "src/logging/**"
spec_refs:
  - "SPEC 05 section 5.1"
  - "SPEC 05 section 5.2"
mock_only: false
plan_approval: false
---

## Objective

Honest self-report logging with separate performed-date and logged-at
timestamps.

## Acceptance criteria

- [x] `for_date` and `logged_at` are stored separately and never conflated (SPEC 05 section 5.1)
- [x] A previous-calendar-day log is accepted at full value and never penalized (SPEC 05 section 5.2)
- [x] Logging further back than one day is rejected (SPEC 05 section 5.2)
- [x] No verification, proof upload, or device check exists in any path (SPEC 05 section 5.1)

## Notes

Late logging is honest behavior. Never penalize it; nudge toward same-day
logging instead.

## Log

_Append-only. One line per claim, hand-off, and completion._
- 2026-08-07 builder: complete. Honest-late path accepts yesterday at full value with a nudge, never a penalty.
