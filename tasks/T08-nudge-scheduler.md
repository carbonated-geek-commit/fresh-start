---
id: T08
title: Nudge scheduler
stage: build
owner_agent: builder
status: done
depends_on: [T07]
file_ownership:
  - "src/nudges/**"
spec_refs:
  - "SPEC 05 section 5.3"
mock_only: false
plan_approval: false
---

## Objective

The two daily nudges. Core scaffolding, not a preference.

## Acceptance criteria

- [x] Morning cue and evening check fire per commitment per day at user-set times (SPEC 05 section 5.3)
- [x] Defaults are 07:00 and 20:00 local (SPEC 05 section 5.3)
- [x] The evening check is suppressed when the session is already logged (SPEC 05 section 5.3)

## Notes

The cue is what triggers the behavior. Do not make these opt-in.

## Log

_Append-only. One line per claim, hand-off, and completion._
- 2026-08-07 builder: complete. Pure scheduler; recovery replaces the morning cue rather than adding to it. Transport deferred per ADR-002 — nothing sends in v1.
