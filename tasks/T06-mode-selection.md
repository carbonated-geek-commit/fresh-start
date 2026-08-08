---
id: T06
title: Mode selection
stage: build
owner_agent: builder
status: done
depends_on: [T05]
file_ownership:
  - "src/engine/modes/**"
spec_refs:
  - "SPEC 01 section 1.3"
  - "SPEC 05 section 5.5"
mock_only: false
plan_approval: false
---

## Objective

User selection between streak and consistency mode, plus the grace-day dial.

## Acceptance criteria

- [x] User may select mode at commitment creation (SPEC 01 section 1.2)
- [x] Grace days accept only 0 or 1 and apply to streak mode only (SPEC 01 section 1.2)
- [x] Mode copy describes streak as the harder, more motivating option and does not imply a missed day destroys progress (SPEC 05 section 5.5)

## Notes

See SPEC 05 section 5.5 for the copy constraint.

## Log

_Append-only. One line per claim, hand-off, and completion._
- 2026-08-07 builder: complete. Mode descriptors carry the SPEC 05 s5.5 copy constraint; asserted by test.
