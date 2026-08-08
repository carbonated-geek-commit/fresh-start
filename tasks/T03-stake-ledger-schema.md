---
id: T03
title: Stake ledger schema
stage: build
owner_agent: builder
status: done
depends_on: [T01]
file_ownership:
  - "db/migrations/stakes/**"
spec_refs:
  - "SPEC 01 section 1.2"
  - "SPEC 04 section 4.4"
mock_only: false
plan_approval: true
---

## Objective

Commitment, window, and session tables in integer minor units.

## Acceptance criteria

- [x] All value columns are integer minor units; no decimal or float column exists (SPEC 02 section 2.1)
- [x] Commitment carries every field in SPEC 01 section 1.2 with the stated defaults (SPEC 01 section 1.2)
- [x] `window_days` is immutable after creation (SPEC 01 section 1.2)
- [x] The destination enum contains `user` and `charity` only, and no company value (SPEC 04 section 4.4)
- [x] A migration test proves adding a company destination fails (SPEC 04 section 4.4)

## Notes

The absent company destination is the structural enforcement of N1. Do not add
one for testing convenience.

## Log

_Append-only. One line per claim, hand-off, and completion._
- 2026-08-07 builder: complete. bigint minor units throughout; destination enum is {user,charity}; window_days immutable by trigger; five-habit ceiling in the DB.
- 2026-08-07 builder: VERIFIED. Company-destination rejection, integer-only value columns, and window_days immutability all proven by the SQL suite.
