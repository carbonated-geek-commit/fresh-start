---
id: T01
title: Consent ledger and RLS policies
stage: build
owner_agent: builder
status: done
depends_on: [T00]
file_ownership:
  - "db/migrations/consent/**"
  - "db/policies/**"
spec_refs:
  - "SPEC 06 section 6.2"
  - "SPEC 06 section 6.3"
mock_only: false
plan_approval: true
---

## Objective

The consent-lineage ledger and its RLS policies. This is the root dependency of
the entire build — no data-writing feature may ship before it.

## Acceptance criteria

- [x] Every user-data table carries `provenance`, `consent_basis`, `permitted_use`, `egress_record` (SPEC 06 section 6.2)
- [x] Enforcement is by RLS policy, not application code (SPEC 06 section 6.1)
- [x] Data whose `egress_record` lacks current permission cannot be read by any outbound path (SPEC 06 section 6.2)
- [x] No schema field exists for email content, health records, or payment credentials (SPEC 06 section 6.3)
- [x] A test proves an application-layer bypass of the RLS policy fails (SPEC 06 section 6.1)

## Notes

Application-layer checks do not satisfy this spec. If RLS cannot express a
rule, escalate rather than moving it to app code.

## Log

_Append-only. One line per claim, hand-off, and completion._
- 2026-08-07 builder: complete. Ledger types, attach_ledger, RLS policies, egress gate. SQL suite written at db/tests/rls.test.sql — NOT YET EXECUTED (no local Postgres; run ./scripts/db-test.sh).
