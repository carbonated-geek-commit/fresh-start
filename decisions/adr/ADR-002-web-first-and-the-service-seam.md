# ADR-002 — Web/mobile-web first, and the service seam the DAG did not name

**Status:** accepted
**Date:** 2026-08-07
**Spec anchor:** CLAUDE.md section 4 (approved integrations), SPEC 06 section 6.1
**Invariants touched:** none weakened; N5 and N7 are strengthened

## Context

Two things needed deciding before any surface could be built, and neither has a
spec line to anchor it — which is exactly what CLAUDE.md section 7 says
requires an ADR.

**1. Platform.** The human's instruction was explicit: *"Build first for
web/mobile web then we'll build for phone app. If the specs call for app first
then this overwrites the app requirements and makes this a web/mobile web first
with app as deferred."*

Checked against the specs: nothing calls for a native app. SPEC 05 section 5.3
requires two daily nudges and CLAUDE.md section 4 approves a "push/email
notification service", which is the only place a native assumption could have
hidden. Nothing else in `specs/` is platform-bound. So there was nothing to
overwrite — the instruction and the specs agree.

**2. A persistence seam.** The task DAG assigns `file_ownership` per feature
(`src/logging/**`, `src/partners/**`, …) and names no data-access module. Taken
literally, each feature would talk to Supabase directly. That would put the N7
stake gate and the N5 settlement gate at every call site that creates a
commitment or resolves a window, and an invariant enforced in *n* places is
enforced in the weakest of them.

## Decision

**Platform.** Next.js 15 (App Router) + React 19 + TypeScript, mobile-first,
installable as a PWA. Supabase for Postgres, Auth and RLS, per CLAUDE.md
section 4. Native applications are deferred; nothing in the codebase assumes
one, and the engine is plain TypeScript with no DOM dependency, so a native
client would consume the same modules.

Consequence for SPEC 05 section 5.3: the two daily nudges are **web push plus
in-app prompts** in v1. `src/nudges` computes *what* fires and *when* as a pure
function and returns a plan; it sends nothing. A native or email transport
attaches to the same plan without touching the scheduler.

**Two modules the DAG does not name are added**, with ownership recorded in
`tasks/T19-data-access-layer.md` and `tasks/T20-web-surface.md`:

- `src/data/**` — the `Store` interface plus a memory and a Supabase
  implementation. The Supabase implementation deliberately performs **no
  ownership checks**: SPEC 06 section 6.1 says RLS is the enforcement, and a
  TypeScript copy of the rule is a second, weaker one that can drift.
- `src/services/**` — the orchestration layer. Every gate lives here, once:
  `assertStakeable` before any commitment write, `acceptLog` before any session
  write, a caller-supplied `userActionAt` on every settlement, and SPEC 07
  event emission alongside each state change.

**A zero-credential development mode is the default.** With no environment
variables set, the app runs on the in-memory store and the deterministic goal
classifier. This is not a convenience: CLAUDE.md section 4 says a missing
credential is the enforcement mechanism, and a codebase that cannot start
without credentials makes that enforcement impossible to verify.

## Consequences

- N5 and N7 are enforced at one boundary each, not per surface. `grep -rn
  "assertStakeable\|settleCommitment" src` returns the complete set of gated
  paths.
- The web UI can be replaced or joined by a native client without touching the
  engine, the gates, or the schema.
- Two implementations of `Store` must stay behaviourally identical. The memory
  store therefore mirrors the RLS filters in TypeScript — not as enforcement,
  but so a bug cannot appear only in production.
- Nudges do not send in v1. The scheduler is complete and tested; the transport
  is the deferred half, and it is deferred visibly rather than stubbed
  silently.

## Escalation note for the human

Neither decision makes an invariant false, and no new integration was added
beyond the three CLAUDE.md section 4 already approves. Recorded here rather
than escalated on that basis.

The one thing worth your eye: **`src/data/**` and `src/services/**` are new
`file_ownership` globs that no original task claimed.** T19 and T20 record
them so the no-overlap rule in CLAUDE.md section 6 still holds.
