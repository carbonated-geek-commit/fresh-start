---
id: T20
title: Web and mobile-web surface
stage: build
owner_agent: builder
status: done
depends_on: [T02, T05, T06, T07, T09, T16, T18]
file_ownership:
  - "src/app/**"
  - "src/ui/**"
  - "public/**"
spec_refs:
  - "ADR-002"
  - "SPEC 03 section 3.4"
  - "SPEC 05 section 5.4"
  - "SPEC 07 section 7.4"
mock_only: false
plan_approval: false
---

## Objective

The mobile-first web surface. Native is deferred (ADR-002); nothing here is
required for the engine to run.

## Acceptance criteria

- [x] Mobile-first, installable, 44px touch targets, light and dark (ADR-002)
- [x] The translator proposes and the user chooses; outcomes are shown but have no stake control (SPEC 03 section 3.3)
- [x] The load indicator warns and never blocks (SPEC 03 section 3.4)
- [x] The recovery treatment leads the card on a return day (SPEC 05 section 5.4)
- [x] Settlement has no timer, no countdown, and no default (N5)
- [x] Personal insights are a user-facing tab, not an internal tool (SPEC 07 section 7.4)
- [x] Streak-target options are derived from ramp admissibility (ADR-001)

## Notes

A missed day is rendered muted, never red. SPEC 05 section 5.5 forbids implying
a missed day destroys progress, and colour is the loudest thing on the screen.

## Log

_Append-only. One line per claim, hand-off, and completion._
- 2026-08-07 builder: claimed under ADR-002.
- 2026-08-07 builder: complete. Flow driven end to end in a browser; N7 rejection verified on the SPEC 03 worked example.
