---
id: T19
title: Data access layer and service seam
stage: build
owner_agent: builder
status: done
depends_on: [T01, T03]
file_ownership:
  - "src/data/**"
  - "src/services/**"
spec_refs:
  - "SPEC 06 section 6.1"
  - "ADR-002"
mock_only: false
plan_approval: true
---

## Objective

One persistence seam and one orchestration layer, so the N5 and N7 gates are
applied in a single place rather than at every feature's call site.

## Acceptance criteria

- [x] A `Store` interface with a memory and a Supabase implementation (ADR-002)
- [x] The Supabase implementation performs no ownership checks; RLS enforces (SPEC 06 section 6.1)
- [x] Every commitment write passes `assertStakeable` first (ADR-002, N7)
- [x] Every settlement requires a caller-supplied user-action instant (ADR-002, N5)
- [x] SPEC 07 events are emitted alongside the state change, not batched later (SPEC 07 section 7.2)
- [x] The app runs with no credentials configured (ADR-002)

## Notes

Not in the original DAG. See ADR-002 for why the DAG's per-feature ownership
would have scattered the invariant gates.

## Log

_Append-only. One line per claim, hand-off, and completion._
- 2026-08-07 builder: claimed. ADR-002 written first; new ownership globs recorded here.
- 2026-08-07 builder: complete. Memory + Supabase stores, service layer, gates centralised.
