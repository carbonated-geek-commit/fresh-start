---
id: T10
title: Partner invite and roles
stage: build
owner_agent: builder
status: done
depends_on: [T02, T07]
file_ownership:
  - "src/partners/**"
spec_refs:
  - "SPEC 04 section 4.1"
  - "SPEC 04 section 4.2"
  - "SPEC 04 section 4.3"
mock_only: false
plan_approval: true
---

## Objective

Partner invitation, witness and referee roles, and the non-opted-in invitee
data model.

## Acceptance criteria

- [x] A non-opted-in invitee email is a column on the inviter's profile; no person record is created (SPEC 04 section 4.2)
- [x] No marketing or promotional send path exists for a non-opted-in address (SPEC 04 section 4.2)
- [x] Unlinking removes the address from the inviter's profile (SPEC 04 section 4.2)
- [x] A referee flag is advisory: it does not alter accrual, settlement, or value (SPEC 04 section 4.1)
- [x] Notifications contain only inviter display name, habit label, and completion event (SPEC 04 section 4.3)

## Notes

Dispute adjudication, appeal, and non-response policy are deferred. Do not
build them.

## Log

_Append-only. One line per claim, hand-off, and completion._
- 2026-08-07 builder: complete. Module, schema, RLS and the fixed notification payload built and tested. The invite surface sits in T20.
