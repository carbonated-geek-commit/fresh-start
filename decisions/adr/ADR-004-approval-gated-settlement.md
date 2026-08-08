# ADR-004 — Settlement stays approval-gated when currency ships

**Status:** accepted
**Date:** 2026-08-08
**Spec anchor:** SPEC 01 section 1.5, SPEC 04 section 4.4, thesis (v1 scope)
**Invariants touched:** N5 (strengthened and made permanent), N2 (unchanged)
**Closes:** Q12, and blueprint v0.4 section 2

## Context

Blueprint section 2 raised one item at high importance, and it was the only
open risk in the document:

> Promise-to-fund with a settlement-day veto means no one ever has to pay... it
> means the money is no longer *at risk*, only *proposed*. Loss aversion needs
> the loss to be real to bite.

It offered three ways to keep the ethics and recover teeth: default-yes
settlement, declaration to a partner at stake time, or ship as-is and measure.
Its recommendation was **(3) now, (1) when dollars ship**.

Q12 asked the human to choose before the currency phase.

## Decision

**Explicit approval at settlement, permanently. Nothing is ever deducted until
the user approves that specific deduction.** Stripe is the intended processor.
The stake amount remains user-chosen.

The blueprint's recommended (1) — default-yes, charge unless declined — is
**not** adopted.

## What changes in the build

Nothing, and that is the point. The seam already has this shape:

- `settle(commitment_id, destination) -> SettlementResult` resolves only on an
  explicit user action (SPEC 04 section 4.4).
- `settlements.user_action_at` is `NOT NULL` with **no default**, so no
  scheduled job can manufacture a settlement (N5). Proven by the SQL suite.
- No timer, countdown, or default resolves the settlement surface.

Swapping the points stub for Stripe is a **rail change behind the seam**, not a
model change. That was the stub's stated design goal and this decision confirms
it was the right one.

**No payment credential enters this repository until the currency phase.**
Stripe is named here as a decision, not as an integration; N2 is untouched and
the enforcement remains credential absence (CLAUDE.md section 4).

N5 stops being a v1 property and becomes permanent: it previously held partly
because there was no rail to charge. It now holds because it is the model.

## Consequences, including the uncomfortable one

**The intervention is not the one the reference effect sizes came from.** The
blueprint is explicit that stickK's referee-doubles and stakes-triple figures
come from binding contracts where the card is charged automatically on failure.
An approval-gated deduction does not inherit those numbers. Anyone citing them
for this product is citing the wrong study.

That is a deliberate trade, not an oversight. The user remaining the ultimate
arbiter is a stated design principle in the thesis, and default-yes buys
behavioural leverage by making it slightly harder for someone who needs their
money to keep it. The trade is toward the principle.

**The honest position is "untested", not "weaker".** Promise-keeping and
self-image are real motivators, and the settlement moment is itself a decision
point with weight. Nobody knows the effect size, which is precisely why SPEC 07
exists. The number that settles it is section 7.1 — month-2 continuation at
reduced or zero stake — and it is computable from the event stream already
being written.

This ADR is the record so the currency phase does not silently inherit an
assumption. It should not be re-litigated without data from section 7.1.

## Related

- Q11 — subscription after a 60-day trial, price point open. Company revenue,
  entirely separate from the stake (N1). Also unbuilt, and blocked on the same
  payment phase.
