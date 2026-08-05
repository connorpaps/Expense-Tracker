#!/usr/bin/env bash
# Enable committed git hooks for the AI memory system. Idempotent — safe to re-run.
# Run from anywhere: bash scripts/setup-memory-hooks.sh
set -euo pipefail

cd "$(dirname "$0")/.."

# 1. Point git at the committed hooks directory
git config core.hooksPath .githooks

# 2. Verify the required memory files exist (so the agent knows what to replicate)
MISSING=()
for f in AGENTS.md knowledge.md handoff.md docs/lessons-learned.md .githooks/post-commit scripts/setup-memory-hooks.sh scripts/memory-watcher.mjs scripts/machine-sync.sh docs/activity-log.md; do
  [ -f "$f" ] || MISSING+=("$f")
done

echo "✅ core.hooksPath = $(git config core.hooksPath)"

if [ ${#MISSING[@]} -gt 0 ]; then
  echo "⚠️  Missing memory files: ${MISSING[*]}"
  echo "   Replicate them from MEMORY_SETUP.md (or ask the AI agent to do it)."
  exit 1
fi

echo "✅ All memory files present."
echo "Auto-memory hook will now append every commit to docs/activity-log.md."
echo ""
echo "Optional: start the file-save watcher with:"
echo "  node scripts/memory-watcher.mjs"
