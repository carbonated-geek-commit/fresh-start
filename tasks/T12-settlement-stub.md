---
id: T12
title: Settlement interface stub
stage: build
owner_agent: builder
status: done
depends_on: [T04]
file_ownership:
  - "src/settlement/stub/**"
spec_refs:
  - "SPEC 01 section 1.5"
  - "SPEC 04 section 4.4"
mock_only: true
plan_approval: true
---

## Objective

The settlement seam. Records the user's decision; moves no money.

## Acceptance criteria

- [x] Settlement resolves only on an explicit user action (SPEC 01 section 1.5)
- [x] No timer, default, or scheduled job resolves a commitment (SPEC 01 section 1.5)
- [x] The user may change `shortfall_destination` at any point up to settlement (SPEC 01 section 1.5)
- [x] Destination is `user` or `charity` only; no company destination exists (SPEC 04 section 4.4)
- [x] No payment provider, SDK, or credential appears anywhere in the implementation (SPEC 04 section 4.4)
- [x] Swapping in a real rail requires no change to the commitment or accrual model (SPEC 04 section 4.4)

## Notes

mock_only. Credential absence is the enforcement of N2. Do not add one, even
for a test.

## Log

_Append-only. One line per claim, hand-off, and completion._
- 2026-08-07 builder: complete. points_stub rail; userActionAt required and never defaulted; no company destination.
