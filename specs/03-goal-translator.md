# SPEC 03 — Goal Translator and Habit Sizing

## 3.1 Size classes

| Class | Duration | Stakeable |
|---|---|---|
| `small` | 0–15 min | yes |
| `medium` | 15–30 min | yes |
| `large` | over 30 min | yes |
| `x_large` | an **outcome**, not a behavior | **never** |

## 3.2 The behavior/outcome rule (N7)

**A user may only stake on a behavior they control, never on an outcome.**

A *behavior* is an action the user performs. An *outcome* is a result that
depends on factors outside the user's control — physiology, other people, time,
chance.

Stake creation **rejects** any habit classified `x_large`. This is a hard
validation at the persistence boundary, not a UI hint.

Worked example — input: *"Go to the gym every morning 5:30–6:30 and increase my
PR by 50% by end of month."*

| Decomposed | Class | Stakeable |
|---|---|---|
| Wake at 5:00 | `small` | yes |
| At gym by 5:30 | `small` | yes |
| Work out 1 hour | `large` | yes |
| Increase PR 50% in 30 days | `x_large` (outcome) | **no** |

Outcomes remain visible to the user as the stated "why". They are stored on the
habit as `motivating_outcome` (free text, never staked, never scored).

## 3.3 Translator contract

**Input:** free-text user goal.
**Output:** strict JSON. No prose, no markdown fences.

    {
      "motivating_outcome": string | null,
      "behaviors": [
        { "label": string,
          "size_class": "small" | "medium" | "large" | "x_large",
          "est_minutes": int | null,
          "rationale": string }
      ],
      "recommended_start": [ string ]      // labels, smallest viable rung first
    }

Requirements:

- The translator **proposes**; the user chooses. Never auto-create a commitment.
- `recommended_start` favors the smallest viable rung. In the worked example it
  is `["Wake at 5:00", "At gym by 5:30"]` — the hour workout is deferred until
  the smaller rungs hold.
- Output is validated against the schema before use. Invalid output is retried
  once, then surfaced as an error. Never partially applied.
- The translator receives the user's goal text only. It never receives email
  content, health records, or partner data (N8, N10).

## 3.4 Habit load indicator

Displayed as the user adds concurrent commitments.

| Count | Level |
|---|---|
| 1–2 | green |
| 3 | yellow |
| 4 | orange |
| 5 | red |

Maximum 5. The indicator **warns; it never blocks.**

Launch copy is an honest heuristic, not a prediction — e.g. *"Most people find
three or more hard to hold at once."* Once SPEC 07 data exists, the thresholds
are re-derived from real completion rates and the copy may state the observed
rate.

## 3.5 Size staircase

When a habit has held for a full window, the app **proposes** the next rung up
(`small` -> `medium` -> `large`) for the same underlying goal. Proposal only;
the user chooses.
