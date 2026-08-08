#!/usr/bin/env python3
"""TaskCompleted hook: refuse to close a task over a dirty git tree.

Exit 0 = allow completion. Exit 2 = block with instruction.
A crash may then cost at most the last uncommitted increment.
"""
import os
import subprocess
import sys


def main():
    root = os.environ.get("CLAUDE_PROJECT_DIR") or os.getcwd()

    inside = subprocess.run(
        ["git", "rev-parse", "--is-inside-work-tree"],
        cwd=root, capture_output=True, text=True,
    )
    if inside.returncode != 0:
        # No git repo: skip politely rather than blocking all work.
        sys.stderr.write("commit-gate: no git repository; skipping.\n")
        sys.exit(0)

    status = subprocess.run(
        ["git", "status", "--porcelain"],
        cwd=root, capture_output=True, text=True,
    )
    if status.returncode != 0:
        sys.stderr.write("commit-gate: git status failed; failing closed.\n")
        sys.exit(2)

    dirty = status.stdout.strip()
    if dirty:
        sys.stderr.write(
            "TASK NOT CLOSED - uncommitted changes present.\n\n"
            "%s\n\n"
            "Commit your work before marking this task complete:\n"
            "  git add -A && git commit -m \"<task-id>: <what changed>\"\n\n"
            "This gate exists so a crash costs at most one increment.\n" % dirty
        )
        sys.exit(2)

    subprocess.run(
        ["bash", os.path.join(root, "scripts", "checkpoint.sh")],
        cwd=root, capture_output=True, text=True,
    )
    sys.exit(0)


if __name__ == "__main__":
    main()
