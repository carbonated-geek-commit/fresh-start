# SPEC 08 — Domains and Playbooks

## 8.1 Structure

A **domain** groups habits and prescribes rituals. Domains do not have their own
engine — there is one habit engine (SPEC 01) and many domains.

Order: **Health** (v1), then Financial, then Family time.

## 8.2 Playbook shape

A playbook is data, not code:

    {
      "domain": "health",
      "rituals": [
        { "order": 1, "kind": "cleanup" | "rules" | "habit",
          "label": string, "size_class": string | null, "copy_key": string }
      ],
      "starter_habits": [ { "label": string, "size_class": string } ]
    }

Adding a domain must require no engine change. If it does, the abstraction is
wrong — escalate.

## 8.3 Ritual order

1. **Reclaim** — cleanup ritual (SPEC 06 section 6.5). This is the *first
   habit*: the ceremonial act of reclaiming ground before rebuilding.
2. **Set rules** — rules advisor recipe (SPEC 06 section 6.4).
3. **Lock the habit** — a staked commitment (SPEC 01).

Each ritual is a loggable session. Cleanup is not a separate product surface.

## 8.4 Health playbook (v1)

Starter habits must be `small` and require no connected device (v1 is honesty
box, N10). Ritual copy lives in the playbook data under `copy_key` and is
subject to SPEC 05 section 5.5.
