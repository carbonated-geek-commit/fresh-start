# FreshStart — Thesis

**Read-only to the fleet. Overrides every other document.**

## Intent

One habit engine, many life domains, serving a single job: helping a person at a
life-reset moment build habits that hold.

Data cleanup and rules advice are **rituals inside a domain playbook**, never
standalone products.

**Governing principle:** the user is the ultimate arbiter. Warn along the way,
then let them choose.

**Success principle:** credit the behavior the user controlled, not the outcome
they did not.

## Red lines (invariants N1–N11)

Defined in `CLAUDE.md` section 5. Any task, spec, or ADR that would make one of
them false is a **thesis-level escalation to the human**. It is never a Chief
decision and never a config edit.

## Revenue

Subscription only. The product never keeps any portion of a user's stake.

## v1 scope

- **Points only.** No payment rails, no payment credentials, no charges.
- Settlement is a **non-custodial promise to fund**. Nothing is held; nothing
  moves without an explicit user action at settlement.
- Logging is **honest self-report**. No verification, no surveillance.

## Thesis gate

The gate emits `PASS` or `ESCALATE` only. It emits `PASS` only if the scope:

1. cites a section of a promoted spec in `specs/`,
2. makes no invariant N1–N11 false,
3. adds no integration outside the allowlist in `CLAUDE.md` section 4,
4. introduces no spend, and
5. does not stake a user on an outcome rather than a behavior (N7).

Otherwise it emits `ESCALATE`.
