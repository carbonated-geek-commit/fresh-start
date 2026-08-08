---
description: Cold-start recovery after a crash or resume. Reconciles tasks against git evidence and rebuilds the team.
---

Recovery is **rebuild, not resume**. `/resume` does not restore in-process
teammates; they no longer exist. Do not message them.

1. Read `decisions/checkpoints/latest.md`.
2. Reconcile every task file (`tasks/T[0-9][0-9]-*.md`, never `tasks/T*.md`)
   against git evidence:
   - `status: in_progress` with no commit -> set back to `pending`
   - `status: done` with no commit or checkpoint proof -> set back to `pending`
   - `status: done` with proof -> leave alone
3. Write a recovery report to `decisions/checkpoints/recovery-<timestamp>.md`
   listing every task whose status you changed and why.
4. Rebuild the DAG from `depends_on`.
5. **Spawn fresh teammates** (`builder`, `tester`, `reviewer`).
6. Resume at the first pending task whose dependencies are satisfied.

`tasks/*.md` in the repository is canonical. The native Claude Code task list is
a runtime projection — on any conflict, the repository wins.
