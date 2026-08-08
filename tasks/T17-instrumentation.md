---
id: T17
title: Event instrumentation
stage: build
owner_agent: builder
status: done
depends_on: [T01]
file_ownership:
  - "src/analytics/events/**"
spec_refs:
  - "SPEC 07 section 7.2"
  - "SPEC 07 section 7.5"
mock_only: false
plan_approval: true
---

## Objective

The structured event stream. Built in Phase A because it cannot be backfilled —
without it, the product's central claim is untestable.

## Acceptance criteria

- [x] All events in SPEC 07 section 7.2 are emitted with the listed payload fields (SPEC 07 section 7.2)
- [x] Month-2 continuation at reduced stake is computable from the event stream alone (SPEC 07 section 7.1)
- [x] Recovery rate after first miss is computable from the event stream alone (SPEC 07 section 7.3)
- [x] Events carry no free-text user content beyond enumerated fields (SPEC 07 section 7.5)
- [x] Events are governed by the consent ledger like all other data (SPEC 07 section 7.5)
- [x] No event is transmitted to any third party (SPEC 07 section 7.5)

## Notes

Phase A. Sequential with T00 and T01. Every configuration choice must be
captured at `commitment_created` time or the analyses in section 7.3 are
impossible later.

## Log

_Append-only. One line per claim, hand-off, and completion._
- 2026-08-07 builder: complete. Ten events, strict schemas, and the s7.3 analyses computed from the stream alone.
