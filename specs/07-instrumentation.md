# SPEC 07 — Instrumentation

**Purpose:** the product's central claim is that it produces habits, not 30-day
compliance. That claim is only testable if configuration and outcome are logged
as structured events from the first release. This cannot be backfilled.

## 7.1 Primary metric

**Month-2 continuation at reduced or zero stake.**

If a user completes a window and continues logging in the next window at a
lower stake, the behavior held. If completions collapse when the stake drops,
the product bought compliance rather than a habit.

The event stream must make this computable without further instrumentation.

## 7.2 Required events

Every event carries `user_id`, `commitment_id` where applicable, and a server
timestamp.

| Event | Payload |
|---|---|
| `commitment_created` | mode, streak_target, window_days, stake_target_minor, stake_kind (`points`/`currency`), grace_days, size_class, habit_count_at_creation |
| `session_logged` | for_date, logged_at, completed, position_before, position_after, value_minor, is_late |
| `session_missed` | for_date, position_before, grace_consumed |
| `recovery` | days_since_miss (SPEC 05 section 5.4) |
| `settlement` | accrued_minor, target_minor, destination, user_action_at |
| `double_offered` / `double_accepted` | source_commitment_id |
| `partner_added` | role, opted_in (bool) |
| `translator_run` | behavior_count, size_class distribution, accepted_recommendation (bool) |
| `load_indicator_shown` | level, habit_count |

## 7.3 Derived analyses (must be answerable from 7.2 alone)

- Completion rate by mode, stake kind, partner presence, habit count, size class
- Day-of-first-miss distribution
- **Recovery rate after first miss** — the highest-leverage number in the
  product
- Points versus currency completion, once currency exists

## 7.4 Give the analysis back

The same analysis runs on a single user's own data and is shown to them, e.g.
*"You complete four times more often when you log before 9am."*

This is the primary justification for holding the data at all and must be
treated as a product feature, not an internal tool.

## 7.5 Constraints

- Events carry no free-text user content beyond enumerated fields.
- Events are subject to SPEC 06 like all other data.
- No event is transmitted to any third party (N9).
