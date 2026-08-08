# Task Schema (binding)

> **This file is the schema, not a task.** Tools and agents must enumerate tasks
> with the glob `tasks/T[0-9][0-9]-*.md`, never `tasks/T*.md`. The frontmatter
> below is an illustrative example and must not be parsed as a real task.

One file per task: `tasks/T<nn>-<slug>.md`. Frontmatter plus body.

```yaml
---
id: T00                      # EXAMPLE ONLY - this file is not a task
title: Short imperative title
stage: design | build | test | qa | validate | code-review | fix | publish
owner_agent: builder | tester | reviewer | planner
status: pending | in_progress | blocked | done
depends_on: [T01, T03]        # must form a DAG
file_ownership:               # globs; no overlap with concurrent tasks
  - "src/engine/ramp/**"
spec_refs:                    # every acceptance criterion cites one of these
  - "SPEC 02 section 2.2"
mock_only: false              # true if it touches a deferred integration
plan_approval: false          # true for money, consent, partner, settlement, translator
---
```

## Body sections (all required)

**## Objective** — one paragraph. What exists when this is done.

**## Acceptance criteria** — a checklist. **Every criterion cites a `spec_refs`
entry or an ADR.** A criterion that cannot cite one is scope invention: do not
write it, report it to the lead.

**## Notes** — constraints, gotchas, non-obvious context.

**## Log** — **append-only.** One line per claim, hand-off, and completion.
Never edit or delete an existing line. This is the curated record that survives
a crash.

## Rules

- `depends_on` must form a DAG. Shared contracts sit at the root.
- Concurrently-runnable tasks must not have overlapping `file_ownership`.
  Overlap forces a `depends_on` edge instead.
- A task is not `done` until its work is committed. The TaskCompleted hook
  enforces this.
