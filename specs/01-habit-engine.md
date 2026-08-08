# SPEC 01 — Habit Engine

## 1.1 Domain model

    User -> Habit -> Commitment -> Window -> Session

- **Habit** — a repeatable *behavior*. Carries a `size_class` (SPEC 03).
- **Commitment** — a habit plus a mode, a stake, and a window.
- **Window** — a bounded period. Default 30 days. Set at commitment creation and
  immutable thereafter.
- **Session** — one logged completion inside a window.

## 1.2 Commitment fields

| Field | Type | Default | Notes |
|---|---|---|---|
| `mode` | `streak` \| `consistency` | `streak` | 1.3 |
| `streak_target` | int | `12` | User-configurable. Minimum 3. |
| `window_days` | int | `30` | Immutable after creation |
| `stake_target_minor` | int | `10000` | Integer minor units. v1 = points. |
| `grace_days` | int | `0` | `streak` mode only. Allowed values 0 or 1. |
| `success_destination` | enum | `user` | SPEC 04 |
| `shortfall_destination` | enum | `user` | SPEC 04. Chosen at creation, changeable until settlement. |

`stake_target_minor` and `streak_target` together drive the ramp (SPEC 02).

## 1.3 Modes

**Streak mode.** `position` = index within the *current consecutive run*.

- A completed day increments `position` by 1.
- A missed day resets `position` to 0, unless a grace day is available.
- A grace day, when available, absorbs exactly one missed day: `position` is
  **held**, not incremented. It is consumed and does not replenish within the
  window.

**Consistency mode.** `position` = cumulative count of completed sessions in the
window. Gaps do not reset it.

This is the only behavioral difference between the modes. Both use the same
ramp from SPEC 02.

## 1.4 Accrual

    session_value = ramp_value(position)          # SPEC 02
    accrued_minor = min(sum(session_values), stake_target_minor)

Accrual is monotonic and never decreases (N3). It is capped at
`stake_target_minor`; sessions logged after the cap add zero value but are still
recorded (SPEC 05).

## 1.5 Settlement

At window end the commitment enters `awaiting_settlement`. It resolves **only**
on an explicit user action (N5). There is no timer, default, or scheduled job
that resolves a commitment.

| Condition | Result |
|---|---|
| `accrued == stake_target_minor` | Full value returns to `success_destination` |
| `accrued < stake_target_minor` | User selects destination for the shortfall at settlement |

The user may change the shortfall destination at any point up to settlement,
including declining to route it anywhere but back to themselves.

**v1:** points only. No money moves. The settlement interface is implemented;
the rail behind it is a stub (SPEC 04 section 4.4).

## 1.6 Double

Reaching `streak_target` unlocks an optional double: a **new commitment** with
`stake_target_minor` doubled, running in the remaining days of the window. It
is never a modification of the existing commitment, and it is always opt-in.

## 1.7 Multi-habit

A user may hold up to **5** concurrent commitments. See SPEC 03 section 3.4 for
the load indicator.

## 1.8 State machine

    draft -> active -> awaiting_settlement -> settled
                   \-> abandoned (user action only)

`abandoned` requires an explicit user action. Inactivity never abandons a
commitment.

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

*Added per ADR-003 from blueprint v0.4 section 4.5, promoted 2026-08-07.*

