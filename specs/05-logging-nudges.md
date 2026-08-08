# SPEC 05 — Logging, Nudges, and Recovery

## 5.1 Logging model

Honest self-report. **No verification, no surveillance, no proof upload.**

A session log records:

| Field | Notes |
|---|---|
| `commitment_id` | |
| `for_date` | the date the behavior was performed |
| `logged_at` | server timestamp of the log action |
| `completed` | boolean |
| `note` | optional, one line, user-supplied |

`for_date` and `logged_at` are stored separately and never conflated.

## 5.2 Honest late logging

A user may log the **previous calendar day** honestly. Late logs are:

- accepted at full value,
- **never penalized** in any way,
- flagged in the UI with a gentle nudge toward same-day logging.

Logging further back than one day is not permitted. Nudge the user to adjust
*when* they perform or log the behavior rather than penalizing timing.

**Rule:** always push toward honesty and accuracy; never penalize the honest.

## 5.3 Nudges

Two per commitment per day. These are **core scaffolding, not a preference** —
the cue is what triggers the behavior.

| Nudge | Default | Content |
|---|---|---|
| Morning cue | user-set, default 07:00 local | prompt to start the behavior |
| Evening check | user-set, default 20:00 local | prompt to log |

Times are user-configurable. The evening check is suppressed if the session is
already logged.

## 5.4 Recovery day (highest-leverage moment)

The day after a missed day is the **most supported moment in the product**.

When a user logs a completion immediately following a miss:

- The event is acknowledged as a **return**, not a reset.
- The acknowledgment is emotionally weighted even though `position` has
  economically reset to 0 (SPEC 01 section 1.3).
- Never framed as failure, restart-from-scratch, or lost progress.

A `recovery` event is emitted for SPEC 07.

## 5.5 Copy constraints

- Streak mode is described as the **harder, more motivating** option. Do not
  claim or imply that a missed day destroys progress — the design does not do
  that.
- Cleanup ritual language is **"freeze, suppress, take control."** Never
  "delete," "erase," or "wipe" (N11).
- Never state or imply that a user is pre-approved or pre-qualified for
  anything.
