---
id: T14
title: Health domain playbook
stage: build
owner_agent: builder
status: done
depends_on: [T06, T08]
file_ownership:
  - "src/domains/health/**"
spec_refs:
  - "SPEC 08 section 8.2"
  - "SPEC 08 section 8.3"
  - "SPEC 08 section 8.4"
mock_only: false
plan_approval: false
---

## Objective

The first domain playbook, expressed as data.

## Acceptance criteria

- [x] The playbook is data matching the SPEC 08 section 8.2 shape; no engine change is required (SPEC 08 section 8.2)
- [x] Rituals follow the order reclaim, set rules, lock the habit (SPEC 08 section 8.3)
- [x] Each ritual is a loggable session (SPEC 08 section 8.3)
- [x] Starter habits are `small` and require no connected device (SPEC 08 section 8.4)
- [x] Ritual copy satisfies SPEC 05 section 5.5 (SPEC 08 section 8.4)

## Notes

If adding this domain requires an engine change, the abstraction is wrong —
escalate.

## Log

_Append-only. One line per claim, hand-off, and completion._
- 2026-08-07 builder: complete, PENDING SIGN-OFF. Playbook content is the fleet's proposal against SPEC 08 s8.4; open question Q13 is still OPEN and this content is what it blocks.
