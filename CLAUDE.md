# FreshStart — Fleet Constitution

Binding on every agent. Read before acting.

## 1. Authority order

`thesis.md` -> `specs/` -> `decisions/adr/` -> `tasks/` -> `docs/design/`

Higher wins. On conflict, escalate rather than resolve downward.

## 2. Protected paths (hook-enforced, fail-closed)

    thesis.md
    CLAUDE.md
    specs/**
    tasks/TASK_SCHEMA.md
    .claude/agents/**
    .claude/commands/**
    .claude/hooks/**
    .claude/settings.json

No agent may write to these. `.claude/hooks/path-protection.py` blocks the
attempt at `PreToolUse` and fails closed on error. Agents propose changes by
writing to `specs-draft/`; only a human commit promotes them.

## 3. Escalation boundary

**Chief may decide alone (ADR required):**
- resolving ambiguity *within* a promoted spec
- sequencing, splitting, and assigning tasks
- choosing among alternates that a spec explicitly names
- running fix loops; accepting or rejecting stage output

**Chief must escalate to the human:**
- any gate `ESCALATE`
- any new integration, dependency, endpoint, credential, or spend
- anything that would make an invariant false
- any interpretive call with no spec line to anchor it

## 4. Approved integrations

**Build now:**
- **Supabase** — Postgres, Auth, Row-Level Security. RLS is where the consent
  ledger is *enforced*, not merely stored.
- **LLM API** — goal translator only. Never receives email content.
- **Push/email notification service** — the two daily nudges.

**Mock only — enforcement is credential absence. Do not add credentials:**
- Payment and settlement rails (N2)
- Data-broker outbound requests (N9)
- Health and movement connectors (N10)

Anything not on this list requires human approval. A missing credential is the
enforcement mechanism, not an oversight to be fixed.

## 5. Invariants — what must never be true

| # | Must never be true | Prevention | Detection |
|---|---|---|---|
| N1 | Revenue depends on a user failing | Payout destination enum contains no company value | Reviewer rejects any diff adding one |
| N2 | The product holds user balances | No payment rails or credentials exist in v1 | Reviewer flags any payment SDK, endpoint, or key |
| N3 | A user loses more than staked or is zeroed after earning | Payout is a pure function with an enforced floor | Property tests assert payout never negative and accrued value never decreases |
| N4 | Ramp or payout math is wrong | Integer minor units only; golden fixtures pinned in `specs/fixtures/` | Golden-file tests fail the build |
| N5 | Settlement processes without a live user choice | Settlement requires an explicit user action; no auto-resolve path | Reviewer checks for any scheduled or default settlement |
| N6 | A non-opted-in invitee becomes a person record or is marketed to | Invitee email is a column on the inviter's profile; no person row; no marketing send path | Schema review; reviewer greps for send paths |
| N7 | A user stakes on an outcome rather than a behavior | Stake creation rejects size class `x_large`; translator classifies before staking | Unit tests on classifier and stake validator |
| N8 | The app ingests email or inbox content | Rules advisor emits rule recipes only; no inbox read path exists | Reviewer flags any mail API or content field |
| N9 | Behavioral data is pushed outward by default | No outbound share path; no broker or creditor credential | Reviewer flags new external write targets |
| N10 | Health data is stored beyond a verification event | Health connectors are mock-only in v1 | Reviewer flags any health field in schema |
| N11 | Copy promises data deletion or erasure | Cleanup ritual language is "freeze, suppress, take control" | Reviewer reads user-facing strings |

If a task appears to require violating one of these, stop and escalate. That is
a thesis-level conversation, not a configuration change.

## 6. File ownership

Agent teams share one working tree. There is **no worktree isolation.**

- Every task declares `file_ownership` globs.
- Tasks that may run concurrently must not have overlapping globs. Overlap
  forces a `depends_on` edge instead.
- An agent that needs to touch a path outside its ownership **stops and
  messages the lead.** It does not edit and explain afterward.

## 7. ADR duty

Any interpretive call — resolving a spec ambiguity, choosing among named
alternates, re-scoping — requires an ADR in `decisions/adr/` **before**
dependent work proceeds. An implementation choice with no spec line and no ADR
is a review finding, not a judgment call.

## 8. Pipeline

    design -> build -> test -> qa -> validate -> code-review -> fix (loop) -> publish

- A task advances only when the current stage reports green to the lead.
- `fix` returns work to the stage that failed, not to the start.
- `publish` is PR-only. It is gated on: all stages green, validator pass, and
  **zero protected-path diffs.**

## 9. Reporting line

Workers report to Chief. Chief reports to the human. No worker contacts the
human directly.

## 10. Engineering standards

- **Money and points are integer minor units.** Never floating point. Cents for
  currency, whole units for points.
- Ramp and payout logic is a **pure function**: no I/O, no database, no clock.
  Time and state are passed in.
- Every acceptance criterion cites a `specs/` section or an ADR. A criterion
  that cannot cite one is scope invention — flag it to the lead.
- Tests accompany the code in the same task, not a later one.
