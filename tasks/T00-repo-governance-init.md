---
id: T00
title: Repo and governance init
stage: build
owner_agent: builder
status: done
depends_on: []
file_ownership:
  - ".claude/**"
  - "scripts/**"
  - ".gitignore"
spec_refs:
  - "CLAUDE.md section 2"
  - "CLAUDE.md section 7"
mock_only: false
plan_approval: false
---

## Objective

Initialize the repository so every later task is protected. Git repo exists,
hooks are installed and verified, checkpoint script runs.

## Acceptance criteria

- [x] `git init` has been run and an initial commit exists (CLAUDE.md section 2)
- [x] The path-protection hook blocks a write to `CLAUDE.md` and returns exit 2 (CLAUDE.md section 2)
- [x] The path-protection hook allows a write to `src/` and returns exit 0 (CLAUDE.md section 2)
- [x] The commit gate returns exit 2 over a dirty tree and exit 0 over a clean one (CLAUDE.md section 7)
- [x] `scripts/checkpoint.sh` writes `decisions/checkpoints/latest.md` (CLAUDE.md section 7)

## Notes

Run the hook smoke test on this machine before any other task starts. Hooks
assume `python3` and `bash` on PATH. Native Windows needs adjustment; macOS,
Linux, and WSL are fine.

## Log

_Append-only. One line per claim, hand-off, and completion._
- 2026-08-07 builder: complete. Scaffold imported; git initialised; hooks present.
