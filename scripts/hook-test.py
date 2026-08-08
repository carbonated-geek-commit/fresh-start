#!/usr/bin/env python3
"""Smoke-test the PreToolUse hooks.

    python scripts/hook-test.py

The hooks are the only thing standing between an agent and the protected
paths, so a silently broken hook is worse than no hook — it looks like
protection. Run this after touching either one.

Written in Python rather than shell for two reasons learned the hard way:

  * Payloads are JSON. Building them with shell quoting produced a test with a
    raw newline inside a JSON string, which is invalid JSON — the hook then
    failed closed on the *payload* and the test reported a hook bug that did
    not exist. `json.dumps` cannot make that mistake.
  * On Windows, git-bash's `$PWD` (`/c/Users/...`) is read by native Python as
    a path relative to the drive root, so every path check reports "outside the
    project". `os.getcwd()` gives the native form.
"""
import json
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HOOKS = os.path.join(ROOT, ".claude", "hooks")

failures = []


def run(hook, payload):
    result = subprocess.run(
        [sys.executable, os.path.join(HOOKS, hook)],
        input=json.dumps(payload),
        capture_output=True,
        text=True,
        env={**os.environ, "CLAUDE_PROJECT_DIR": ROOT},
    )
    return result.returncode


def check(want, hook, payload, description):
    got = run(hook, payload)
    if got == want:
        print("  ok    [%d] %s" % (got, description))
    else:
        print("  FAIL  want %d got %d — %s" % (want, got, description))
        failures.append(description)


def write(path):
    return {"tool_name": "Write", "tool_input": {"file_path": os.path.join(ROOT, path)}}


def bash(command):
    return {"tool_name": "Bash", "tool_input": {"command": command}}


print("== path-protection.py ==")
check(2, "path-protection.py", write("CLAUDE.md"), "CLAUDE.md is protected")
check(2, "path-protection.py", write("thesis.md"), "thesis.md is protected")
check(2, "path-protection.py", write("specs/01-habit-engine.md"), "specs/** is protected")
check(2, "path-protection.py", write(".claude/hooks"), "ancestor of a protected path")
check(0, "path-protection.py", write("src/x.ts"), "ordinary source is writable")
check(0, "path-protection.py", write("specs-draft/proposal.md"), "specs-draft is writable")

print("== bash-guard.py — catastrophic ==")
check(2, "bash-guard.py", bash("rm -rf /"), "rm -rf /")
check(2, "bash-guard.py", bash("rm -rf ~"), "rm -rf ~")
check(2, "bash-guard.py", bash("rm -rf *"), "rm -rf *")
check(2, "bash-guard.py", bash("rm -rf ."), "rm -rf . (the whole repo)")
check(2, "bash-guard.py", bash("rm -rf .git"), "rm -rf .git")
check(2, "bash-guard.py", bash('rm -rf "$OUT"'), "unexpanded variable")
check(2, "bash-guard.py", bash("cd /tmp && rm -rf /"), "catastrophic inside a compound")

print("== bash-guard.py — protected paths via shell ==")
check(2, "bash-guard.py", bash("rm specs/01-habit-engine.md"), "rm a protected spec")
check(2, "bash-guard.py", bash("echo x > CLAUDE.md"), "truncate via redirect")
check(2, "bash-guard.py", bash("mv thesis.md /tmp/x"), "mv a protected file away")
check(2, "bash-guard.py", bash("rm -rf .claude/hooks"), "delete the hooks directory")
check(2, "bash-guard.py", bash("rm -rf specs"), "delete the specs directory")

print("== bash-guard.py — false positives that would get the guard disabled ==")
# The first version hard-blocked anything shlex could not split, which refused
# every heredoc. That is the failure mode that gets a guard switched off, and
# it happened within minutes of installing it.
HEREDOC = (
    'git commit -m "msg" && python - <<\'EOF\'\n'
    'print("quotes, > redirects and rm -rf all appear in here as data")\n'
    "EOF"
)
check(0, "bash-guard.py", bash(HEREDOC), "heredoc body is data, not commands")
check(0, "bash-guard.py", bash('python -c "import os; print(1>2)"'), "inline script with >")
check(0, "bash-guard.py", bash('grep -n "rm -rf" README.md'), "the words rm -rf in a quoted arg")
check(0, "bash-guard.py", bash("awk '{print $1}' file.txt"), "awk program with braces")

print("== bash-guard.py — must stay allowed ==")
check(0, "bash-guard.py", bash("npm run verify"), "an ordinary command")
check(0, "bash-guard.py", bash("rm -f scratch.json"), "rm a scratch file")
check(0, "bash-guard.py", bash("rm -rf node_modules"), "rm node_modules")
check(0, "bash-guard.py", bash("rm -rf specs-draft/old.md"), "specs-draft is not specs")
check(0, "bash-guard.py", bash("git add -A"), "git add")

print()
if failures:
    print("%d check(s) FAILED — the hooks are not protecting what they claim" % len(failures))
    sys.exit(1)

print("all %d hook checks passed" % (len(failures) + 26))
print()
print("Not covered here: refusing to delete a build directory while a dev server")
print("is listening depends on a live port, so it is not deterministic in a test")
print("run. To see it, start the dev server and run:")
print('  python scripts/hook-test.py --live')

if "--live" in sys.argv:
    print()
    print("== live build-directory check ==")
    code = run("bash-guard.py", bash("rm -rf .next"))
    if code == 2:
        print("  ok    [2] rm -rf .next refused while the dev server is up")
    else:
        print("  --    [0] no dev server listening, so the delete is allowed")
