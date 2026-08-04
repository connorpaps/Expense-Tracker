#!/usr/bin/env bash
# Enable committed git hooks for the AI memory system. Idempotent.
set -euo pipefail

cd "$(dirname "$0")/.."

git config core.hooksPath .githooks

MISSING=()
for f in AGENTS.md knowledge.md handoff.md .githooks/post-commit scripts/setup-memory-hooks.sh scripts/memory-watcher.mjs scripts/machine-sync.sh docs/activity-log.md; do
  [ -f "$f" ] || MISSING+=("$f")
done

echo "core.hooksPath = $(git config core.hooksPath)"
if [ ${#MISSING[@]} -gt 0 ]; then
  echo "Missing memory files: ${MISSING[*]}"
  exit 1
fi

echo "All memory files present."
echo "Auto-memory hook will append every commit to docs/activity-log.md."
echo "Optional watcher: node scripts/memory-watcher.mjs"
