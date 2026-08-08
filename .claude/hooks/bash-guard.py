#!/usr/bin/env python3
"""PreToolUse hook: guard destructive shell commands.

`path-protection.py` covers Edit/Write/MultiEdit/NotebookEdit. It does not
cover Bash, so `rm specs/01-habit-engine.md` or `echo x > CLAUDE.md` walks
straight past it. This closes that hole and adds two rules that only apply to
shell.

Exit 0 = allow. Exit 2 = block, stderr is returned to the agent.

Three tiers, in order of severity:

  1. CATASTROPHIC — recursive deletes that can take out the machine, the home
     directory, the repository, or its git history. Always blocked.
  2. PROTECTED PATHS — the CLAUDE.md section 2 list, enforced against shell
     verbs (rm, mv, truncate, redirects) rather than only against write tools.
  3. IN-USE BUILD DIRECTORY — deleting a build output directory while a dev
     server is serving from it. This is a real mistake that happened on
     2026-08-08: `rm -rf .next` under a running `next dev` broke the app with
     ENOENT until the server was restarted.

FAILURE POLICY, and the reasoning behind it.

A payload that cannot be parsed at all is blocked — that is a broken caller,
not a real command.

A *command* that cannot be tokenised is NOT blocked outright. The first version
of this hook did exactly that, and within minutes it refused a routine
`git commit` carrying a heredoc, because heredoc bodies contain quotes that
`shlex` cannot balance. That is the failure mode that gets a guard switched
off, and a switched-off guard protects nothing. Heredoc bodies are now stripped
before analysis, and an untokenisable remainder is scanned by regex for the
catastrophic shapes only.

Tier 3 fails OPEN: if the liveness probe errors, allow. A probe that broke
every legitimate `rm -rf dist` would cost more than the mistake it prevents.
"""
import json
import os
import re
import shlex
import socket
import sys
from fnmatch import fnmatch

# --- Tier 2: mirrors PROTECTED in path-protection.py. Keep the two in sync. ---
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

# --- Tier 3: build output that a dev server serves from. ---
BUILD_DIRS = {".next", "dist", "build", "out", ".turbo", ".svelte-kit", ".nuxt", ".parcel-cache"}
FALLBACK_PORTS = [3000, 3001, 4321, 5173, 5174, 8080, 8000]

DESTRUCTIVE_VERBS = {"rm", "rmdir", "unlink", "shred", "truncate", "mv"}


def block(title, msg):
    sys.stderr.write("%s\n%s\n" % (title, msg))
    sys.exit(2)


def project_root():
    return os.path.abspath(os.environ.get("CLAUDE_PROJECT_DIR") or os.getcwd())


def relative(path, root):
    """Path relative to the project root, or None if it escapes."""
    try:
        rel = os.path.relpath(os.path.abspath(os.path.join(root, path)), root)
    except Exception:
        return None
    return rel.replace(os.sep, "/")


HEREDOC = re.compile(r"<<-?\s*'?\"?(\w+)'?\"?\n.*?\n\s*\1\b", re.DOTALL)


def strip_heredocs(command):
    """Remove heredoc bodies before analysis.

    A heredoc body is data, not commands — it routinely contains quotes,
    redirects and semicolons that mean nothing to the shell. Feeding it to the
    tokeniser produces garbage segments and, worse, false positives on `>` and
    `rm` that appear inside a Python or SQL payload.
    """
    return HEREDOC.sub("<<HEREDOC_BODY_REMOVED", command)


def split_commands(command):
    """Split a compound shell line into individual commands.

    Deliberately crude. It over-splits rather than under-splits, because a
    missed segment is a missed guard.
    """
    return [seg for seg in re.split(r"&&|\|\||[;\n|]", command) if seg.strip()]


# Conservative last-resort scan, used only when tokenising fails.
DANGEROUS_SHAPES = [
    (re.compile(r"\brm\s+(-[a-zA-Z]*\s+)*-?[a-zA-Z]*[rR][a-zA-Z]*\s+/\s*(\*|$)"), "rm -rf /"),
    (re.compile(r"\brm\s+(-\S+\s+)*~\s*/?\s*(\*|$)"), "rm -rf ~"),
    (re.compile(r"\brm\s+(-\S+\s+)*\$\{?\w+"), "rm with an unexpanded variable"),
    (re.compile(r"\brm\s+(-\S+\s+)*[^\s;|&]*\.git(\s|/|$)"), "rm targeting .git"),
]


def tokenise(segment):
    """Tokens for `segment`, or None if it cannot be parsed.

    Returning None rather than blocking is deliberate. The first version of
    this hook hard-blocked anything `shlex` could not split, which meant every
    command carrying an embedded script — a heredoc, an inline `python -c`, an
    awk program — was refused. A guard that blocks ordinary work is a guard
    that gets switched off, and a switched-off guard protects nothing.

    Unparseable segments still get the regex scan below, so the catastrophic
    shapes are caught either way.
    """
    try:
        return shlex.split(segment, posix=True)
    except ValueError:
        for pattern, label in DANGEROUS_SHAPES:
            if pattern.search(segment):
                block(
                    "DESTRUCTIVE COMMAND BLOCKED",
                    "This command could not be parsed, and it contains what looks "
                    "like %s:\n  %s\n\nRewrite it as a simpler command so its "
                    "targets can be checked." % (label, segment.strip()),
                )
        return None


# --------------------------------------------------------------------------
# Tier 1 — catastrophic
# --------------------------------------------------------------------------

CATASTROPHIC_TARGETS = {"/", "/*", "~", "~/", "~/*", ".", "./", "..", "../", "*"}


def check_catastrophic(tokens, segment, root):
    if not tokens:
        return
    verb = os.path.basename(tokens[0])
    if verb not in DESTRUCTIVE_VERBS:
        return

    flags = [t for t in tokens[1:] if t.startswith("-")]
    targets = [t for t in tokens[1:] if not t.startswith("-")]
    recursive = any(("r" in f.lower() or "R" in f) for f in flags)

    for target in targets:
        # An unexpanded variable could be empty at runtime, turning
        # `rm -rf "$DIR"/` into `rm -rf /`. We cannot know its value here.
        if "$" in target and recursive:
            block(
                "DESTRUCTIVE COMMAND BLOCKED",
                "Recursive delete with an unexpanded variable:\n"
                "  %s\n\n"
                "If the variable is empty this deletes the wrong tree. Expand it "
                "to a literal path first, or guard it with `[ -n \"$VAR\" ]`."
                % segment.strip(),
            )

        stripped = target.rstrip("/") or "/"
        if target in CATASTROPHIC_TARGETS or stripped in ("/", os.path.expanduser("~").rstrip("/")):
            block(
                "DESTRUCTIVE COMMAND BLOCKED",
                "Refusing to run %s against %r:\n  %s\n\n"
                "Name an explicit subdirectory." % (verb, target, segment.strip()),
            )

        rel = relative(target, root)
        if rel is None:
            continue

        if rel == "." and recursive:
            block(
                "DESTRUCTIVE COMMAND BLOCKED",
                "This deletes the entire repository:\n  %s" % segment.strip(),
            )

        if rel == ".git" or rel.startswith(".git/"):
            block(
                "DESTRUCTIVE COMMAND BLOCKED",
                "Refusing to touch git history:\n  %s\n\n"
                "Every commit here is the only copy of some of this work."
                % segment.strip(),
            )


# --------------------------------------------------------------------------
# Tier 2 — protected paths, via shell
# --------------------------------------------------------------------------


def protected_match(rel):
    rel = rel.rstrip("/")
    for pattern in PROTECTED:
        if rel == pattern or fnmatch(rel, pattern):
            return pattern
        # Deleting a directory removes everything under it, so a target that is
        # an ANCESTOR of a protected path is just as destructive as the path
        # itself. `rm -rf .claude/hooks` matches neither `.claude/hooks/*` nor
        # `.claude/hooks/**` by glob, but it removes both.
        prefix = pattern.split("*", 1)[0].rstrip("/")
        if prefix and (rel == prefix or prefix.startswith(rel + "/")):
            return pattern
    return None


def check_protected(tokens, segment, root):
    candidates = []

    if tokens:
        verb = os.path.basename(tokens[0])
        if verb in DESTRUCTIVE_VERBS:
            candidates += [t for t in tokens[1:] if not t.startswith("-")]

    # Redirects truncate. `> CLAUDE.md` destroys it just as thoroughly as rm.
    for match in re.finditer(r"(?<!\d)>>?\s*([^\s;|&]+)", segment):
        candidates.append(match.group(1).strip("\"'"))

    for target in candidates:
        rel = relative(target, root)
        if rel is None or rel.startswith("../"):
            continue
        pattern = protected_match(rel)
        if pattern:
            block(
                "PROTECTED PATH BLOCKED",
                "%s is protected by CLAUDE.md section 2 and cannot be modified "
                "or removed from the shell:\n  %s\n\n"
                "This rule is not only about the Edit and Write tools. To propose "
                "a change, write to specs-draft/ and report to the lead — only a "
                "human commit promotes it." % (rel, segment.strip()),
            )


# --------------------------------------------------------------------------
# Tier 3 — build directory in use
# --------------------------------------------------------------------------


def configured_ports(root):
    """Ports this project's dev servers actually use, from launch.json."""
    ports = []
    launch = os.path.join(root, ".claude", "launch.json")
    try:
        with open(launch, "r", encoding="utf-8") as handle:
            data = json.load(handle)
        for entry in data.get("configurations", []):
            port = entry.get("port")
            if isinstance(port, int):
                ports.append(port)
    except Exception:
        pass
    return ports or FALLBACK_PORTS


def something_listening(port):
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
            probe.settimeout(0.15)
            return probe.connect_ex(("127.0.0.1", port)) == 0
    except Exception:
        # Fails OPEN — see the module docstring.
        return False


def check_build_dir_in_use(tokens, segment, root):
    if not tokens:
        return
    if os.path.basename(tokens[0]) not in {"rm", "rmdir"}:
        return

    targets = [t for t in tokens[1:] if not t.startswith("-")]
    for target in targets:
        rel = relative(target, root)
        if rel is None:
            continue
        head = rel.split("/")[0]
        if head not in BUILD_DIRS:
            continue

        live = [p for p in configured_ports(root) if something_listening(p)]
        if live:
            block(
                "BUILD DIRECTORY IN USE",
                "Refusing to delete %s while a dev server is listening on port %s.\n"
                "  %s\n\n"
                "The running server reads from that directory; removing it under "
                "the process breaks the app with ENOENT until it is restarted.\n\n"
                "Stop the server first, then delete. If you are producing a "
                "production build alongside a running dev server, build into a "
                "separate directory instead of sharing this one."
                % (rel, ", ".join(str(p) for p in live), segment.strip()),
            )


# --------------------------------------------------------------------------


def main():
    try:
        raw = sys.stdin.read()
        payload = json.loads(raw) if raw.strip() else {}
    except Exception as exc:
        block("HOOK PAYLOAD UNREADABLE", "Cannot parse hook payload (%s). Failing closed." % exc)

    if payload.get("tool_name") != "Bash":
        sys.exit(0)

    command = (payload.get("tool_input") or {}).get("command", "")
    if not command.strip():
        sys.exit(0)

    root = project_root()

    for segment in split_commands(strip_heredocs(command)):
        tokens = tokenise(segment)
        if tokens is None:
            # Unparseable, but the regex scan in tokenise() already cleared it
            # of the catastrophic shapes. Path checks need real tokens.
            continue
        check_catastrophic(tokens, segment, root)
        check_protected(tokens, segment, root)
        check_build_dir_in_use(tokens, segment, root)

    sys.exit(0)


if __name__ == "__main__":
    main()
