#!/usr/bin/env bash
# Snapshot pipeline state for crash recovery.
set -euo pipefail
ROOT="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
OUT="$ROOT/decisions/checkpoints"
mkdir -p "$OUT"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FILE="$OUT/checkpoint-$STAMP.md"

{
  echo "# Checkpoint $STAMP"
  echo
  echo "## Branch"
  git -C "$ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "(none)"
  echo
  echo "## Recent commits"
  git -C "$ROOT" log --oneline -15 2>/dev/null || echo "(none)"
  echo
  echo "## Task states"
  for f in "$ROOT"/tasks/T*.md; do
    [ -e "$f" ] || continue
    id=$(basename "$f" .md)
    st=$(grep -m1 '^status:' "$f" | sed 's/status:[[:space:]]*//')
    echo "- $id: ${st:-unknown}"
  done
} > "$FILE"

cp "$FILE" "$OUT/latest.md"
ls -1t "$OUT"/checkpoint-*.md | tail -n +11 | xargs -r rm --
