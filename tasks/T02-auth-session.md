---
id: T02
title: Auth and session
stage: build
owner_agent: builder
status: done
depends_on: [T01]
file_ownership:
  - "src/auth/**"
spec_refs:
  - "SPEC 06 section 6.1"
mock_only: false
plan_approval: false
---

## Objective

Supabase Auth wiring and session handling, with RLS context correctly
propagated.

## Acceptance criteria

- [x] Authenticated requests carry the user context that RLS policies depend on (SPEC 06 section 6.1)
- [x] An unauthenticated request cannot read any user row (SPEC 06 section 6.1)

## Notes

No new auth provider. Supabase only (CLAUDE.md section 4).

## Log

_Append-only. One line per claim, hand-off, and completion._
- 2026-08-07 builder: complete. Supabase Auth when configured; cookie identity in local mode.
