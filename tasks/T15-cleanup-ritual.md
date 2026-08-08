---
id: T15
title: Cleanup ritual request logger
stage: build
owner_agent: builder
status: done
depends_on: [T01]
file_ownership:
  - "src/cleanup/**"
spec_refs:
  - "SPEC 06 section 6.4"
  - "SPEC 06 section 6.5"
mock_only: true
plan_approval: false
---

## Objective

The rules advisor recipe store and the mocked broker-suppression request log.

## Acceptance criteria

- [x] The rules advisor stores only the recommended recipe and whether it was applied (SPEC 06 section 6.4)
- [x] No inbox read path exists anywhere in the implementation (SPEC 06 section 6.4)
- [x] Broker requests are logged as intended and not sent; no broker credential exists (SPEC 06 section 6.5)
- [x] User-facing framing is suppression and control, never deletion (SPEC 06 section 6.5)
- [x] Applying a recipe is a loggable habit session (SPEC 06 section 6.4)

## Notes

mock_only for the outbound send. N8 is enforced by the absence of an inbox read
path.

## Log

_Append-only. One line per claim, hand-off, and completion._
- 2026-08-07 builder: complete. Recipes are generators only; assertCleanupCopy enforces N11 at generation time.
