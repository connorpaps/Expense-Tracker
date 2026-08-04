#!/usr/bin/env bash
# Session-start machine synchronization. Never clobbers a dirty working tree.
set -uo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
MARKER="$ROOT/docs/.last-machine"
HOSTNAME_VALUE="$(hostname 2>/dev/null || echo unknown)"
BRANCH="$(git branch --show-current 2>/dev/null || echo '')"

echo "=== Machine sync check ==="

if [ "$BRANCH" = "master" ] && git ls-remote --heads origin main >/dev/null 2>&1; then
  git branch -m master main 2>/dev/null || true
  git branch --set-upstream-to=origin/main main 2>/dev/null || true
  BRANCH="main"
fi
[ -z "$BRANCH" ] && BRANCH="main"

PREV=""
[ -f "$MARKER" ] && PREV="$(cat "$MARKER" 2>/dev/null || true)"
if [ -n "$PREV" ] && [ "$PREV" != "$HOSTNAME_VALUE" ]; then
  echo "Machine change detected: '$PREV' -> '$HOSTNAME_VALUE'"
  bash "$ROOT/scripts/setup-memory-hooks.sh" >/dev/null 2>&1 || echo "Memory bootstrap skipped; inspect scripts."
fi
mkdir -p "$(dirname "$MARKER")"
echo "$HOSTNAME_VALUE" > "$MARKER"

git fetch origin --quiet 2>/dev/null || echo "Warning: could not fetch origin (offline or not configured)."
BEHIND="$(git rev-list --count HEAD..origin/"$BRANCH" 2>/dev/null || echo 0)"
DIRTY="$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')"
if [ "${BEHIND:-0}" -gt 0 ] 2>/dev/null; then
  if [ "$DIRTY" = "0" ]; then
    git pull --ff-only origin "$BRANCH" 2>&1 || echo "Pull failed; resolve manually."
  else
    echo "Local is behind origin/$BRANCH but working tree is dirty; not pulling."
  fi
else
  echo "Up to date with origin/$BRANCH."
fi

echo "=== Machine sync check done ==="
