---
id: T09
title: Goal translator and size classifier
stage: build
owner_agent: builder
status: done
depends_on: [T02]
file_ownership:
  - "src/goals/**"
spec_refs:
  - "SPEC 03 section 3.1"
  - "SPEC 03 section 3.2"
  - "SPEC 03 section 3.3"
mock_only: false
plan_approval: true
---

## Objective

Decomposes a free-text goal into sized behaviors, separates outcomes, and
proposes the smallest viable rung.

## Acceptance criteria

- [x] Output validates against the SPEC 03 section 3.3 JSON schema; invalid output retries once then errors (SPEC 03 section 3.3)
- [x] Stake creation rejects any habit classified `x_large` at the persistence boundary (SPEC 03 section 3.2)
- [x] An outcome is stored as `motivating_outcome`, never staked, never scored (SPEC 03 section 3.2)
- [x] `recommended_start` favors the smallest viable rung (SPEC 03 section 3.3)
- [x] The translator never receives email content, health records, or partner data (SPEC 03 section 3.3)
- [x] The translator proposes only; it never auto-creates a commitment (SPEC 03 section 3.3)

## Notes

The worked example in SPEC 03 section 3.2 is a required test case. N7 is
enforced by validation, not by a UI hint.

## Log

_Append-only. One line per claim, hand-off, and completion._
- 2026-08-07 builder: complete. Deterministic classifier guards the stake; LLM provider is optional and receives goal text only. SPEC 03 s3.2 worked example is a passing test.
