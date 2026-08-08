#!/usr/bin/env python3
"""PreToolUse hook: block writes to protected paths. Fails CLOSED.

Exit 0 = allow. Exit 2 = block, stderr is returned to the agent.
Any error, malformed payload, or unexpected condition blocks.
"""
import json
import os
import sys
from fnmatch import fnmatch

PROTECTED = [
    "thesis.md",
    "CLAUDE.md",
    "specs/*",
    "specs/**",
    "tasks/TASK_SCHEMA.md",
    ".claude/agents/*",
    ".claude/agents/**",
    ".claude/commands/*",
    ".claude/commands/**",
    ".claude/hooks/*",
    ".claude/hooks/**",
    ".claude/settings.json",
]

WRITE_TOOLS = {"Edit", "Write", "MultiEdit", "NotebookEdit"}


def block(msg):
    sys.stderr.write("PROTECTED PATH BLOCKED\n" + msg + "\n")
    sys.exit(2)


def main():
    try:
        raw = sys.stdin.read()
        payload = json.loads(raw) if raw.strip() else {}
    except Exception as exc:
        block("Cannot parse hook payload (%s). Failing closed." % exc)

    tool = payload.get("tool_name", "")
    if tool not in WRITE_TOOLS:
        sys.exit(0)

    tool_input = payload.get("tool_input") or {}
    path = (
        tool_input.get("file_path")
        or tool_input.get("path")
        or tool_input.get("notebook_path")
        or ""
    )
    if not path:
        block("Write tool %s with no resolvable path. Failing closed." % tool)

    root = os.environ.get("CLAUDE_PROJECT_DIR") or os.getcwd()
    try:
        rel = os.path.relpath(os.path.abspath(path), os.path.abspath(root))
    except Exception as exc:
        block("Cannot resolve %s relative to project root (%s)." % (path, exc))

    rel = rel.replace(os.sep, "/")

    if rel.startswith("../"):
        block(
            "Write outside the project root is not permitted: %s\n"
            "Work inside the repository." % rel
        )

    rel_clean = rel.rstrip("/")
    for pattern in PROTECTED:
        matched = rel_clean == pattern or fnmatch(rel_clean, pattern)
        if not matched:
            # A target that is an ANCESTOR of a protected path is just as
            # destructive as the path itself: `.claude/hooks` matches neither
            # `.claude/hooks/*` nor `.claude/hooks/**` by glob. Kept in sync
            # with the same rule in bash-guard.py.
            prefix = pattern.split("*", 1)[0].rstrip("/")
            matched = bool(prefix) and (
                rel_clean == prefix or prefix.startswith(rel_clean + "/")
            )
        if matched:
            block(
                "%s is protected by CLAUDE.md section 2 and cannot be edited by "
                "an agent.\n\n"
                "To propose a change: write your proposal to specs-draft/ and "
                "report to the lead. Only a human commit promotes it." % rel
            )

    sys.exit(0)


if __name__ == "__main__":
    main()
