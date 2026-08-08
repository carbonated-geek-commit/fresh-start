# Proposed addition — SPEC 01 section 1.9

**Proposed by:** build fleet, 2026-08-07. Awaiting human promotion.
**Rationale:** ADR-003. Blueprint v0.4 section 4.5 names a month-end artifact
that no promoted spec section covers.

## Add section 1.9

## 1.9 The month-end artifact

When a window reaches `awaiting_settlement` or `settled`, the commitment has a
**record**: a persistent, user-facing summary of what the user actually did.

The record contains:

- the habit label and the window it covered,
- days completed, and the value earned,
- the day-by-day shape of the window,
- the number of returns after a missed day (SPEC 05 section 5.4),
- the motivating outcome, if one was stated (SPEC 03 section 3.2).

Constraints:

- **The record is not publicly addressable.** It is served behind the same
  session and RLS as every other surface. There is no share endpoint, no signed
  public link, and no unauthenticated route. A public URL carrying a user's
  completion record is an outbound path for behavioural data and is forbidden
  by N9.
- The record is designed for the user to capture and share themselves —
  print-friendly and screenshot-friendly — so the sharing decision and the
  sharing channel stay with the user.
- Copy credits the behaviour the user controlled, not the outcome they did not
  (thesis, success principle). A record is produced whether or not the target
  was reached, and a shortfall is never framed as a failure (SPEC 05
  section 5.5).
