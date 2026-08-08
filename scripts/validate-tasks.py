#!/usr/bin/env python3
"""Validate the task DAG: acyclic, no concurrent file_ownership overlap,
every acceptance criterion cites a spec or ADR.

Run before starting the fleet and after any planner run.
"""
import glob
import itertools
import re
import sys

TASK_GLOB = "tasks/T[0-9][0-9]-*.md"   # never tasks/T*.md - excludes TASK_SCHEMA.md


def load():
    tasks = {}
    for f in sorted(glob.glob(TASK_GLOB)):
        text = open(f).read()
        fm = text.split("---")[1]
        tid = re.search(r"^id:\s*(\S+)", fm, re.M).group(1)
        raw = re.search(r"^depends_on:\s*\[(.*?)\]", fm, re.M).group(1)
        dep = [d.strip() for d in raw.split(",") if d.strip()]
        fo_block = fm.split("file_ownership:")[1].split("spec_refs:")[0]
        fo = re.findall(r'^\s+-\s+"(.+?)"', fo_block, re.M)
        body = text.split("---", 2)[2]
        crit = [l for l in body.splitlines() if l.startswith("- [ ]")]
        uncited = [c for c in crit
                   if "SPEC" not in c and "CLAUDE.md" not in c and "ADR" not in c]
        tasks[tid] = {"file": f, "dep": dep, "fo": fo,
                      "crit": len(crit), "uncited": uncited}
    return tasks


def ancestors(tid, tasks):
    seen, stack = set(), list(tasks[tid]["dep"])
    while stack:
        n = stack.pop()
        if n in seen or n not in tasks:
            continue
        seen.add(n)
        stack.extend(tasks[n]["dep"])
    return seen


def main():
    tasks = load()
    errs = []

    for tid, t in tasks.items():
        for d in t["dep"]:
            if d not in tasks:
                errs.append("%s: depends on unknown task %s" % (tid, d))
        for c in t["uncited"]:
            errs.append("%s: acceptance criterion cites no spec or ADR -> %s"
                        % (tid, c.strip()))
        if t["crit"] == 0:
            errs.append("%s: no acceptance criteria" % tid)

    # cycles
    for tid in tasks:
        if tid in ancestors(tid, tasks):
            errs.append("%s: dependency cycle" % tid)

    # concurrency: no ownership overlap between tasks with no dependency path
    if not any("cycle" in e for e in errs):
        for a, b in itertools.combinations(sorted(tasks), 2):
            if b in ancestors(a, tasks) or a in ancestors(b, tasks):
                continue
            overlap = set(tasks[a]["fo"]) & set(tasks[b]["fo"])
            if overlap:
                errs.append("%s / %s may run concurrently and share ownership: %s"
                            % (a, b, sorted(overlap)))

    # depth, iteratively
    depth, pending = {}, dict((k, list(v["dep"])) for k, v in tasks.items())
    while pending:
        ready = [k for k, d in pending.items() if all(x in depth for x in d)]
        if not ready:
            break
        for k in ready:
            depth[k] = 0 if not pending[k] else 1 + max(depth[x] for x in pending[k])
            del pending[k]

    print("tasks: %d   acceptance criteria: %d"
          % (len(tasks), sum(t["crit"] for t in tasks.values())))
    for tid in sorted(tasks, key=lambda x: (depth.get(x, 99), x)):
        print("  L%-2s %-5s <- %s"
              % (depth.get(tid, "?"), tid, tasks[tid]["dep"] or "(root)"))

    if errs:
        print("\nVALIDATION: FAIL")
        for e in errs:
            print("  ! " + e)
        return 1
    print("\nVALIDATION: PASS")
    print("  DAG acyclic; no concurrent ownership overlap; all criteria cited.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
