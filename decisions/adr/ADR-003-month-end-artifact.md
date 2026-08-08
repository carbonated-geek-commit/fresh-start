# ADR-003 — The month-end artifact, and why it is not shareable by URL

**Status:** accepted
**Date:** 2026-08-07
**Spec anchor:** none — blueprint v0.4 section 4.5. See "Escalation note".
**Invariants touched:** N9 (this ADR keeps it true against a feature that would
naturally break it), N11

## Context

Blueprint v0.4 section 4.5 asks for a month-end artifact: *"Produce something
that persists — a record of what they actually did. The fresh start, made
visible. This is what a user shows someone, and it's the natural referral
surface without bolting on virality."*

**It is not in `specs/`.** Sections 01–08 cover the engine, the ramp, the
translator, partners and settlement, logging and nudges, the data spine,
instrumentation, and domains. The artifact appears in the blueprint the specs
were derived from, and did not survive into them. CLAUDE.md section 10 says an
acceptance criterion that cannot cite a spec section or an ADR is scope
invention — so this ADR is the citation, and a proposed SPEC 01 amendment is
filed at `specs-draft/01-habit-engine-section-1.9-month-end-artifact.md`.

The interesting part is the second half of the blueprint sentence. "What a
user shows someone" and "the natural referral surface" both point at a public,
linkable page. That is exactly the shape N9 forbids: *"Behavioral data is
pushed outward by default. No outbound path, no credential — structural."* A
public URL carrying a user's completion record is an outbound path for
behavioural data, and one that would be indexed.

## Decision

Build the artifact. **Do not make it a public URL.**

- It lives at `/record/[commitmentId]`, behind the same session and RLS as
  every other surface. Only the owner can load it.
- It is designed to be **screenshotted or printed** — a fixed-aspect card with
  print styles — so the user can show it to whoever they like, by their own
  action, through a channel they chose.
- There is no share endpoint, no signed public link, no OG image renderer, and
  no unauthenticated route. Adding one is a thesis-level conversation, not a
  feature.

This satisfies "what a user shows someone" while leaving the sharing decision,
and the sharing channel, entirely with the user. It gives up the frictionless
referral loop the blueprint gestures at. That trade is the point: the product's
pitch is that behavioural data never leaves without the user moving it, and a
referral surface that works by publishing their record would contradict the
pitch more than it would grow the product.

Copy on the artifact is subject to SPEC 05 section 5.5 and N11 like every other
surface, and it credits the behaviour rather than the outcome (thesis, success
principle) — a user who fell short still gets a record of the days they did.

## Consequences

- The artifact exists and persists, per the blueprint.
- N9 stays structurally true: there is still no unauthenticated route that
  returns behavioural data.
- Referral is manual. If the human wants a link-shareable version, that is a
  deliberate N9 amendment and belongs in the thesis conversation, not here.

## Escalation note for the human

**This is the one place I built something with no spec line behind it.** The
blueprint asked for it, `specs/` does not mention it, and I judged that
dropping a named blueprint deliverable silently was worse than building it with
the citation recorded. If you disagree, the feature is one directory
(`src/app/record/**`) and reverts cleanly.

The N9 tension is the part worth your attention — the blueprint's "natural
referral surface" and the invariant genuinely pull in opposite directions, and
I resolved it toward the invariant.
