# MEMORY_SETUP.md — AI Memory System Replication Kit

**Purpose:** A complete, self-contained guide for giving ANY brand-new project (zero setup) a cross-session AI memory system. An AI agent reading this file can replicate the entire system verbatim — all files, rules, processes, and hooks.

**How to use this file:**
- **For an AI agent:** Read this file and create/apply everything below. The file contents in the code blocks are the exact files to write. The Bootstrap section makes the system self-installing on new machines.
- **For a human:** Copy this file into a new project, then paste its contents into your AI assistant (or say *"set up the memory system from MEMORY_SETUP.md"*).

> ## ⚡ INSTRUCTIONS FOR THE AI AGENT EXECUTING THIS FILE
> **Execute the entire setup now, end-to-end, without stopping to ask the user anything.**
> 1. Follow **§4 Quick start** in order: create every file described in §5 and §6 verbatim, then enable the hooks.
> 2. Where you find placeholders like `<PROJECT_DESCRIPTION>` or `<TYPE_CHECK_COMMAND>`: **do not ask the user.** Infer them from the project's existing files (`package.json`, `README`, `pyproject.toml`, etc.) if present. If the project is empty or the answer is unknown, substitute sensible generic defaults (e.g. package manager `npm`, commands `npm test` / `npm run build`) and leave a `<!-- TODO: fill in -->` comment. The memory system works regardless; these fields are informational.
> 3. Do **not** create `AGENTS.md`/`knowledge.md`/`handoff.md` from the *project's* old copies — always use the templates in this file.
> 4. After creating files, run `bash scripts/setup-memory-hooks.sh` to enable the hook.
> 5. Run the **§8 Verification checklist** yourself, including the test commit, and report the results.
> 6. When done, add the memory files to git (`git add -A && git commit -m "Add AI memory system"`) so the system is versioned.
>
> If you are reading this file as part of a session that already has the memory system running (files exist, hook enabled), **skip setup** and just proceed with the user's request — the bootstrap rule in §7 already keeps everything active.

---

## 1. What you're building (architecture)

A four-layer memory system that works across Freebuff (reads `knowledge.md` first) and Cursor/other tools (read `AGENTS.md`):

| Layer | Type | Input required | Records |
|---|---|---|---|
| **Protocol** (`knowledge.md` + `AGENTS.md`) | Agent instructions | None (auto-read each session) | The *why*: decisions, gotchas, lessons, session history |
| **Lessons** (`docs/lessons-learned.md`) | Structured log | Auto-captured by hook + agent writes during work | Mistakes, errors, gotchas, things to avoid, fixes |
| **Git hook** (`.githooks/post-commit`) | Mechanical | None (fires on every commit) | The *what*: date, message, changed files + lesson placeholders for fix/error commits |
| **Watcher** (`scripts/memory-watcher.mjs`, optional) | Mechanical | None (while running) | Raw per-save events (local only) |

All memory files are git-tracked (except the watcher's local log), so memory travels with the repo and syncs across machines.

### Full inventory: everything this setup creates and installs

For the user's reference and for the executing AI's understanding — here is the complete picture of what running this file produces.

**📁 Files created (12 total):**

| File | Purpose |
|---|---|
| `AGENTS.md` | Cross-tool agent instructions; auto-read by Cursor, Copilot, Codex, Windsurf. Session protocol + bootstrap check + rules |
| `knowledge.md` | Canonical knowledge file; **auto-read by Freebuff every session**. Commands, architecture, constraints + session protocol |
| `handoff.md` | Session log: work completed, validation, next steps, end-of-session checklist |
| `.githooks/post-commit` | Git hook that auto-appends every commit (date, message, files) to `docs/activity-log.md` |
| `scripts/setup-memory-hooks.sh` | Idempotent, self-verifying hook enabler (`git config core.hooksPath .githooks`) |
| `scripts/memory-watcher.mjs` | Optional dependency-free Node watcher; logs every file save to a local log |
| `scripts/machine-sync.sh` | Session-start machine-swap check: detects machine change, enables hooks, pulls latest when safe |
| `docs/activity-log.md` | Auto-generated commit history (tracked — travels with the repo) |
| `docs/lessons-learned.md` | Structured mistakes/errors/gotchas/fixes log — **auto-captured** from fix/error commits by the hook AND written immediately by the agent during work (Symptom / Root cause / Fix / Avoid in future / Status) |
| `.gitattributes` | Forces LF line endings on scripts so hooks survive Windows checkouts |
| `.gitignore` | Adds `docs/activity-watch.log` (watcher's local log) and `docs/.last-machine` (local machine marker) |
| `.cursor/rules/` | Path-scoped rules template that Cursor auto-attaches when editing matching files |

**⚙️ Processes & configurations enabled:**
- Git hooks activated — `core.hooksPath` set to `.githooks` so the commit hook runs on every commit
- A first (test) commit is made, which **proves the hook fires** and seeds the activity log
- All memory files are committed to git — versioned and synced across machines
- **Machine-swap detection** — a `docs/.last-machine` hostname marker + the `machine-sync.sh` check, so switching machines auto-syncs memory with zero input

**🧠 Behaviors installed — what the AI now does automatically:**
- **Session start:** reads `handoff.md` (picks up where the last session left off) → reads `knowledge.md` (commands/architecture/constraints/gotchas) → reads `docs/lessons-learned.md` (expands any auto-captured "needs enrichment" entries) → checks `git status`, recent `git log`, and the tail of `docs/activity-log.md` → runs the **bootstrap check** and self-installs the hook if this is a new machine
- **During work:** logs non-obvious decisions/commands/gotchas into `knowledge.md` as discovered; **appends a structured entry to `docs/lessons-learned.md` IMMEDIATELY whenever an error is fixed, a mistake is made, or a gotcha is found** (Symptom / Root cause / Fix / Avoid in future / Status — never wait for session end); appends a "Work completed" note to `handoff.md` immediately after each substantial change
- **Session end:** appends a date-stamped "Work completed" section to `handoff.md`; updates `knowledge.md` with new rules; **reviews `docs/lessons-learned.md` and expands any auto-captured "needs enrichment" placeholder entries** (root cause + avoid-in-future, then removes the marker); responds to wrap-up signals ("wrap up", "done for today", "that's all") **even if not explicitly asked**
- **Automatic (zero input):** every commit logged to `docs/activity-log.md` by the hook; every file save logged to `docs/activity-watch.log` while the watcher runs

**🧪 Verification performed automatically:** the executing agent runs the §8 checklist itself — hooks path correct, all 12 files present, `.gitattributes` in place, watcher log gitignored, test commit fires the hook (activity-log entry + lessons placeholder for a `fix` commit), session protocol present in both protocol files — and reports the results.

### ⚡ Performance & parallelism (why it never slows you down)

- **The git hook is milliseconds and non-blocking.** It runs only in git's `post-commit` phase — after your commit is already complete — and does pure local text appends (no network, no dependencies, no locks). It never runs while you are editing or testing, so it can't interfere with real work.
- **The watcher runs in parallel as a separate background process.** `memory-watcher.mjs` is fully independent of your editors, builds, and tests; it debounces per-file (1.5 s), ignores `node_modules`/`docs`/`.git`, and appends at most one line per saved file. Zero interference.
- **`machine-sync.sh` runs only at session start**, does one lightweight `git fetch`, and only pulls when the working tree is clean. It never runs during work.
- **Writes are simple `>>` appends** — no databases, no transaction locks, trivially safe alongside parallel tooling.
- **Reads stay fast because the files stay lean** (< ~200 lines each): prune stale entries at session end, and the lessons log only grows when there are lessons (fix/error commits), so it stays small by design.
- **Session-start cost is a few file reads** (`handoff.md`, `knowledge.md`, `docs/lessons-learned.md`, `git status`, `git log`, activity-log tail) — milliseconds, all local.

---

## 2. Prerequisites

- `git`
- `node` (only needed for the optional file watcher)
- An AI agent that reads `knowledge.md` and/or `AGENTS.md` (Freebuff, Cursor, Copilot, Codex, etc.)

---

## 3. Bootstrap (do this first — on EVERY new machine)

The memory plumbing is committed to the repo, but the git hook must be enabled **once per machine** (it's a local git config). The agent auto-detects this via the protocol rules in §7 — but the one-time manual command is:

```bash
bash scripts/setup-memory-hooks.sh
```

This is **idempotent** — safe to re-run any time. It:
1. Sets `git config core.hooksPath .githooks`
2. Verifies all required memory files exist (warns if any are missing so the agent can replicate them)
3. Confirms the auto-log hook is active

If the memory files don't exist yet (brand-new repo), the setup script will report them missing — the AI should then create them using §5 below.

---

## 4. Quick start (TL;DR for an agent)

1. If `AGENTS.md`, `knowledge.md`, `handoff.md`, or `docs/lessons-learned.md` are missing, create them using §5.
2. If `.githooks/post-commit`, `scripts/`, and `.gitattributes` are missing, create them using §6.
3. If `.cursor/rules/` doesn't exist and the user uses Cursor, optionally create the rules in §6.4.
4. Confirm `docs/activity-log.md` and `docs/lessons-learned.md` exist (create if missing) and that `docs/activity-watch.log` is gitignored (§6.5).
5. Verify `git config core.hooksPath` is `.githooks`; if not, run `bash scripts/setup-memory-hooks.sh`. (Run setup **after** creating files — it exits with a warning if files are missing.)
6. Done — the system self-maintains from here. On future sessions/machines, the bootstrap rule in §7 handles hook enablement automatically.

---

## 5. Core memory files

### 5.1 `AGENTS.md` (repo root)

Read automatically by Cursor and other AGENTS.md-compatible tools. **Keep `knowledge.md` as the single source of truth** — mirror essentials here only.

````markdown
# AGENTS.md

Instructions for AI coding agents working in this repository. Read by Cursor and other AGENTS.md-compatible tools (GitHub Copilot, Codex, Windsurf, etc.). Freebuff reads `knowledge.md` first — **keep `knowledge.md` as the single source of truth** and only mirror essentials here.

## Project

<!-- ONE-PARAGRAPH DESCRIPTION OF THE PROJECT. -->
<PROJECT_DESCRIPTION>

## Memory protocol — follow every session

This repo uses git-tracked files as its cross-session AI memory. The goal: no re-explaining the project, ever.

### At session start

1. Read `handoff.md` — the last session's work and the prioritized next steps.
2. Read `knowledge.md` — commands, architecture, constraints, gotchas.
3. Read `docs/lessons-learned.md` — auto-captured "needs enrichment" entries there are homework to expand with root cause + avoid-in-future.
4. Check `git status --short`, `git log --oneline -10`, and the tail of `docs/activity-log.md` (auto-log of every commit) for recent context.
5. **After completing a substantial change, append a brief "Work completed" note to `handoff.md` immediately** — do not wait for session end.

### During work — lesson capture is mandatory and immediate

Whenever you fix an error, make a mistake, discover a gotcha, or find a project issue, append a structured entry to `docs/lessons-learned.md` **right away** (Symptom / Root cause / Fix / Avoid in future / Status). Never wait for session end — a forgotten lesson is a future hour-long debug. The `.githooks/post-commit` hook auto-appends placeholder entries for fix/error commits as a safety net.

### At session end (or when a task completes)

1. Append a date-stamped **"Work completed"** section to `handoff.md` — what changed, why, and what validation ran.
2. Update `knowledge.md` with any new commands, architecture facts, constraints, or gotchas learned.
3. Review `docs/lessons-learned.md`: expand auto-captured placeholder entries and remove their "needs enrichment" markers.
4. Keep the memory files lean (< ~200 lines). Prune stale entries instead of accumulating.

### Wrap-up signals

If the user signals the session is ending (e.g. "wrap up", "done for today", "that's all", "update the handoff"), update `handoff.md` and `knowledge.md` **even if not explicitly asked** — do not wait to be told.

### Bootstrap check (auto-setup on new machines)

At session start, verify the memory system is active: run `git config core.hooksPath`. If it does **not** return `.githooks`, run `bash scripts/setup-memory-hooks.sh` before doing anything else. If memory files are missing but `MEMORY_SETUP.md` exists, replicate them from `MEMORY_SETUP.md`.

### Machine sync check (auto-catch machine swaps)

At session start, run `bash scripts/machine-sync.sh`. It detects a machine change (via `docs/.last-machine`), re-enables hooks on this machine, fixes old `master` clones, and pulls the latest memory files from `origin` — but only when the working tree is clean (it never clobbers uncommitted work). This means the user can start working immediately even after switching machines; no manual `git pull` needed.

## Non-negotiable rules

<!-- PROJECT-SPECIFIC RULES. Examples to adapt: -->
- **Never commit `.env` or any secrets.**
- Use `<PACKAGE_MANAGER>` (`<PACKAGE_MANAGER> <version>`), not `<OTHER_PACKAGE_MANAGER>`.
- Run `<TYPE_CHECK_COMMAND>` and `<TEST_COMMAND>` before declaring work complete.
- Never hand-edit generated/build output directories.
- Ask before installing packages or changing the database schema.

## Reference files

- `knowledge.md` — canonical project knowledge (commands, architecture, constraints)
- `handoff.md` — session log / prioritized next steps
- `docs/activity-log.md` — auto-generated commit log (written by `.githooks/post-commit`, no input needed)
- `docs/activity-watch.log` — raw per-save events (gitignored; only exists if `node scripts/memory-watcher.mjs` is running)
- `.githooks/post-commit` + `scripts/setup-memory-hooks.sh` — automatic memory plumbing
- `MEMORY_SETUP.md` — replication kit (reference only, not part of the running memory system)
- `.cursor/rules/` — path-scoped rules that Cursor auto-attaches when editing matching files
````

### 5.2 `knowledge.md` (repo root)

Read automatically by Freebuff at the start of every session. This is the **canonical** knowledge file. Replace the project/commands/architecture sections with your project's real details; keep the Session protocol section verbatim.

````markdown
# Project knowledge

## Project
- <ONE-LINE DESCRIPTION>
- <KEY ARCHITECTURE FACTS>
- <DIRECTORY OWNERSHIP FACTS>

## Session protocol (AI memory system)

This repo uses git-tracked files as its cross-session AI memory. **Freebuff reads this file (`knowledge.md`) automatically at the start of every session**; Cursor reads `AGENTS.md` instead. Follow this ritual every session:

- **Bootstrap check:** Verify the memory system is active — run `git config core.hooksPath`. If it is not `.githooks`, run `bash scripts/setup-memory-hooks.sh` before doing anything else. If memory files are missing but `MEMORY_SETUP.md` exists, replicate them from `MEMORY_SETUP.md`.
- **Machine sync check:** Run `bash scripts/machine-sync.sh` — detects machine swaps (via `docs/.last-machine`), re-enables hooks here, fixes old `master` clones, and pulls the latest memory files when the working tree is clean.
- **Session start:** Read `handoff.md` first (last session's work + next steps), then this file, then `docs/lessons-learned.md` (expanding any auto-captured "needs enrichment" entries), then check `git status --short`, `git log --oneline -10`, and the tail of `docs/activity-log.md` (auto-log of every commit).
- **During work:** Log non-obvious decisions, new commands, and gotchas into this file as they are discovered. **After fixing an error, making a mistake, or finding a gotcha, append a structured entry to `docs/lessons-learned.md` immediately** (Symptom / Root cause / Fix / Avoid in future / Status) — the post-commit hook auto-captures fix/error commits as placeholders, but the agent must not rely on that alone. **After completing a substantial change, append a brief "Work completed" note to `handoff.md` immediately — do not wait for session end.**
- **Session end:** Append a date-stamped "Work completed" section to `handoff.md` (what changed, why, validation run). Update this file with any new rules/commands/architecture facts. **Review `docs/lessons-learned.md` and expand any auto-captured placeholder entries** (root cause + avoid-in-future, then remove the marker). Keep the memory files lean (< ~200 lines); prune stale content.
- **Wrap-up signals:** If the user says the session is ending (e.g. "wrap up", "done for today", "that's all", "update the handoff"), update `handoff.md` + this file **even if not explicitly asked** — do not wait to be told.
- Update `AGENTS.md` only when a rule must also bind Cursor/other tools — this file stays the single source of truth.

**Automatic memory (no input needed):** a git `post-commit` hook (`.githooks/post-commit`) appends every commit to `docs/activity-log.md` and auto-captures fix/error commits into `docs/lessons-learned.md`; `node scripts/memory-watcher.mjs` (optional) logs every file save to `docs/activity-watch.log` (gitignored). These are mechanical records — the agent still owns writing the *why* into `handoff.md`/this file.

## Commands
- Install: `<INSTALL_COMMAND>`
- Development: `<DEV_COMMAND>`
- Test: `<TEST_COMMAND>`
- Typecheck/lint: `<TYPE_CHECK_COMMAND>` / `<LINT_COMMAND>`
- Build: `<BUILD_COMMAND>`

## Architecture and behavior
- <ARCHITECTURE BULLETS>

## Constraints and gotchas
- <CONSTRAINTS BULLETS>
````

### 5.3 `handoff.md` (repo root)

The session log. Create with this structure; the agent maintains it each session.

````markdown
# <PROJECT_NAME> — Session Handoff

**Last updated:** <DATE>
**Project:** <ONE-LINE DESCRIPTION>

## Read this first

<2-3 SENTENCE PROJECT OVERVIEW + KEY OPERATIONAL FACTS>

## Work completed this session (<DATE>)

<!-- The agent appends a numbered entry per session:

### 1. <TITLE>
- What changed, why, and what validation ran.
-->

## Current repository state

- <IMPORTANT FILES AND RESPONSIBILITIES>

## Validation completed this session

- <TYPE CHECK> — passes
- <TESTS> — passes

## Prioritized next steps

1. <NEXT STEP>

## Session handoff checklist

- Read `knowledge.md`, `docs/lessons-learned.md`, and this file
- Expand any auto-captured "needs enrichment" lessons entries
- `git pull` if on a different machine than last session
- Check `git status --short`
- Run `<TYPE_CHECK_COMMAND>` and `<TEST_COMMAND>` before changing behavior
- **Push when done:** `git add -A && git commit -m "..." && git push`
````

### 5.4 `docs/lessons-learned.md` (repo root → `docs/`)

The structured mistakes/errors/gotchas/fixes log. Auto-captured by the post-commit hook for fix/error commits, and written immediately by the agent during work (never at session end). Replicate with this shape:

````markdown
# Lessons Learned & Error Log

**Purpose:** A permanent, structured record of mistakes, errors, gotchas, project issues, and fixes. The goal: never repeat a lesson.

## How this file stays up to date (automatic)
1. **Git hook safety net:** `.githooks/post-commit` auto-appends an "(auto-captured, needs enrichment)" placeholder for every commit whose message mentions fix/bug/error/regression/etc.
2. **Agent ritual (mandatory, immediate):** the session protocol in `knowledge.md`/`AGENTS.md` requires appending a full entry immediately whenever an error is fixed, a mistake is made, or a gotcha is discovered.
3. **Session-end sweep:** the agent expands auto-captured placeholders with root cause + "avoid in future" and removes the enrichment marker.

## Entry format
- **Symptom:** what went wrong or the error observed
- **Root cause:** why it happened
- **Fix:** what was changed to resolve it
- **Avoid in future:** the actionable rule to prevent recurrence
- **Status:** `fixed` | `workaround` | `open`

---

## <DATE> — <short title> (example seeded lesson)
- **Symptom:** ...
- **Root cause:** ...
- **Fix:** ...
- **Avoid in future:** ...
- **Status:** fixed
````

---

## 6. Automatic memory plumbing

### 6.1 `.githooks/post-commit`

The zero-input mechanical layer: appends every commit to `docs/activity-log.md`, AND auto-captures fix/error commits into `docs/lessons-learned.md` as placeholder entries the agent enriches with root cause + "avoid in future" at session start/end.

````bash
#!/usr/bin/env bash
# Auto-memory hook: after every commit, appends a dated entry (hash, message,
# changed files) to docs/activity-log.md, AND auto-captures fix/error commits
# into docs/lessons-learned.md as placeholder entries the agent enriches with
# root cause + "avoid in future" at session start/end.
#
# Requires: git config core.hooksPath .githooks  (scripts/setup-memory-hooks.sh)
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
LOG="$ROOT/docs/activity-log.md"
LESSONS="$ROOT/docs/lessons-learned.md"
mkdir -p "$(dirname "$LOG")"

# Skip if the only changed file is a memory log itself (avoids feedback loops).
# --root includes the initial commit's files; -m --first-parent handles merges.
CHANGED="$(git diff-tree --root -m --first-parent --no-commit-id --name-only -r HEAD)"
if [ "$CHANGED" = "docs/activity-log.md" ] || [ "$CHANGED" = "docs/lessons-learned.md" ]; then
  exit 0
fi

HASH="$(git rev-parse --short HEAD)"
MSG="$(git log -1 --pretty=%s)"
DATE="$(date '+%Y-%m-%d %H:%M')"

{
  echo ""
  echo "## $DATE — \`$HASH\`"
  echo "**$MSG**"
  echo ""
  echo "$CHANGED" | sed 's/^/  - /'
} >> "$LOG"

# Lesson auto-capture: flag commits that look like fixes/errors so the agent
# (or a human) enriches them later. The pattern is fixed, so the commit message
# is safe as grep input.
if echo "$MSG" | grep -qiE '\b(fix(es|ed|ing)?|bug(s|fix(es)?)?|error|regression|hotfix(es)?|workaround|rollback|revert)\b'; then
  if [ ! -f "$LESSONS" ]; then
    {
      echo "# Lessons Learned & Error Log"
      echo ""
      echo "Structured record of mistakes, errors, gotchas, and fixes. Entries"
      echo "are auto-captured from fix/error commits and written by the agent."
      echo ""
      echo "## Entry format"
      echo "- **Symptom:** what went wrong"
      echo "- **Root cause:** why it happened"
      echo "- **Fix:** what was changed"
      echo "- **Avoid in future:** the rule to prevent recurrence"
      echo "- **Status:** fixed | workaround | open"
      echo ""
    } > "$LESSONS"
  fi
  {
    echo ""
    echo "## $DATE — \`$HASH\` (auto-captured, needs enrichment)"
    echo "**$MSG**"
    echo ""
    echo "  - Files:"
    echo "$CHANGED" | sed 's/^/    - /'
    echo "  - TODO (agent): expand with Symptom / Root cause / Fix / Avoid in future, then remove the '(auto-captured, needs enrichment)' marker."
  } >> "$LESSONS"
fi
````

### 6.2 `scripts/setup-memory-hooks.sh`

One-time per-machine enable. **Idempotent** — safe to re-run. Verifies the memory files exist so a fresh machine can self-heal.

````bash
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
````

### 6.3 `scripts/memory-watcher.mjs` (optional but recommended)

Dependency-free Node watcher that logs every file save to `docs/activity-watch.log`.

````javascript
#!/usr/bin/env node
/**
 * Auto-memory file watcher (zero input, local-only).
 *
 * Watches the project for file changes and appends a timestamped entry to
 * docs/activity-watch.log (gitignored). This is a raw, mechanical record of
 * every file save — useful as a fallback when no commit has been made yet.
 *
 * Usage:  node scripts/memory-watcher.mjs
 * Stop:   Ctrl+C
 */
import { watch } from 'node:fs'
import { appendFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative, resolve } from 'node:path'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const LOG = join(ROOT, 'docs', 'activity-watch.log')
const IGNORED_DIRS = new Set([
  '.git',
  'node_modules',
  'out',
  'release',
  '.vite',
  'coverage',
  '.playwright-cli',
  'docs', // our own log lives here; avoid feedback loops
])
const DEBOUNCE_MS = 1500
const pending = new Map()

mkdirSync(dirname(LOG), { recursive: true })

function write(entry) {
  try {
    appendFileSync(LOG, `${entry}\n`)
  } catch (err) {
    console.error(`[memory-watcher] write failed: ${err.message}`)
  }
}

function isIgnored(rel) {
  if (!rel) return true
  const top = rel.split(/[\\/]/)[0]
  if (IGNORED_DIRS.has(top)) return true
  if (rel.endsWith('activity-watch.log')) return true
  return false
}

function handleChange(eventType, filename) {
  if (!filename) return
  const rel = relative(ROOT, filename).replaceAll('\\', '/')
  if (isIgnored(rel)) return

  // Debounce per path so burst saves collapse into one entry
  const key = rel
  if (pending.has(key)) clearTimeout(pending.get(key))
  pending.set(
    key,
    setTimeout(() => {
      pending.delete(key)
      write(`[${new Date().toISOString()}] ${eventType}: ${rel}`)
    }, DEBOUNCE_MS),
  )
}

let watcher
try {
  watcher = watch(ROOT, { recursive: true }, handleChange)
} catch (err) {
  console.error(`[memory-watcher] recursive watch failed on this platform: ${err.message}`)
  console.error('Fallback: watch src/, tests/, and shared/ individually.')
  watcher = ['src', 'tests', 'shared', 'public'].map((d) =>
    watch(join(ROOT, d), { recursive: true }, handleChange),
  )
}

console.log(`[memory-watcher] watching ${ROOT}`)
console.log(`[memory-watcher] logging to ${LOG}`)
console.log('[memory-watcher] Ctrl+C to stop')

process.on('SIGINT', () => {
  for (const p of pending.values()) clearTimeout(p)
  if (Array.isArray(watcher)) watcher.forEach((w) => w.close())
  else watcher.close()
  process.exit(0)
})
````

### 6.4 `.cursor/rules/` (optional — for Cursor users)

Path-scoped rules Cursor auto-attaches when editing matching files. Create one `.mdc` file per source directory convention you care about:

````markdown
---
description: Conventions for <AREA> code
globs: <AREA>/**
alwaysApply: false
---
- <CONVENTION 1>
- <CONVENTION 2>
````

### 6.5 `.gitignore` additions

Append the watcher's local log (the commit log stays tracked):

````gitignore
# Auto-memory local watcher log (raw per-save events; the commit log is tracked)
docs/activity-watch.log
````

### 6.6 `.gitattributes` (CRITICAL on Windows)

Without this, a Windows checkout with `core.autocrlf=true` converts shell scripts to CRLF, and the shebang (`#!/usr/bin/env bash`) breaks — killing the hook on fresh clones. Add at repo root:

````gitattributes
# Force LF line endings on shell scripts — CRLF breaks the shebang in git hooks
# and bash scripts on Windows checkouts (core.autocrlf=true would convert them).
*.sh text eol=lf
.githooks/* text eol=lf
scripts/*.mjs text eol=lf
````

### 6.8 `scripts/machine-sync.sh`

Session-start machine-swap check. Detect a machine change, re-enable hooks, fix old `master` clones, and pull the latest memory files — but only when the working tree is clean.

````bash
#!/usr/bin/env bash
# Machine-switch sync check — run at session start by the memory protocol.
#
# What it does (all safe, all idempotent):
#   1. Fixes old clones still on `master` (repo now uses `main`).
#   2. Detects a machine change via docs/.last-machine (hostname marker) and,
#      when changed, re-runs the memory bootstrap so hooks are enabled here.
#   3. Fetches origin and fast-forwards to the latest memory files — but ONLY
#      when the working tree is clean, so it never clobbers uncommitted work.
#
# Exits 0 always — this is a session-start convenience, never a failure gate.
set -uo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
MARKER="$ROOT/docs/.last-machine"
HOSTNAME="$(hostname 2>/dev/null || echo unknown)"
BRANCH="$(git branch --show-current 2>/dev/null || echo '')"

echo "=== Machine sync check ==="

# 1. Old-clone fix: local branch still named master, remote has main
if [ "$BRANCH" = "master" ] && git ls-remote --heads origin main >/dev/null 2>&1; then
  echo "→ Detected old 'master' clone — repo now uses 'main'. Renaming..."
  git branch -m master main 2>/dev/null
  git branch --set-upstream-to=origin/main main 2>/dev/null || true
  BRANCH="main"
fi
[ -z "$BRANCH" ] && BRANCH="main"

# 2. Machine change detection → re-enable memory hooks on this machine
PREV=""
[ -f "$MARKER" ] && PREV="$(cat "$MARKER" 2>/dev/null || true)"
if [ -n "$PREV" ] && [ "$PREV" != "$HOSTNAME" ]; then
  echo "→ Machine change detected: '$PREV' → '$HOSTNAME'"
  echo "→ Re-running memory bootstrap to enable hooks here..."
  bash "$ROOT/scripts/setup-memory-hooks.sh" >/dev/null 2>&1 || echo "  (bootstrap skipped — check scripts exist)"
fi
mkdir -p "$(dirname "$MARKER")"
echo "$HOSTNAME" > "$MARKER"

# 3. Fetch + pull latest when safe
git fetch origin --quiet 2>/dev/null || echo "→ Warning: could not fetch from origin (offline?)."
BEHIND="$(git rev-list --count HEAD..origin/"$BRANCH" 2>/dev/null || echo 0)"
DIRTY="$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')"

if [ "${BEHIND:-0}" -gt 0 ] 2>/dev/null; then
  if [ "$DIRTY" = "0" ]; then
    echo "→ Local is $BEHIND commit(s) behind origin/$BRANCH. Pulling latest..."
    git pull --ff-only origin "$BRANCH" 2>&1 || echo "→ Pull failed — resolve manually."
  else
    echo "→ Local is $BEHIND commit(s) behind, but working tree is dirty — NOT auto-pulling."
    echo "  Commit or stash first, then run: git pull"
  fi
else
  echo "→ Up to date with origin/$BRANCH."
fi

echo "=== Machine sync check done ==="
````

### 6.7 `docs/activity-log.md` (auto-generated)

Create with this header — the hook appends entries below it:

````markdown
# Activity Log (auto-generated)

This file is appended automatically by the git `post-commit` hook (`.githooks/post-commit`)
after **every commit** — no input needed. It records the date, commit message, and changed
files so future sessions can see what changed without being told.

Raw per-save events (if the watcher is running) go to `docs/activity-watch.log` (gitignored).
````

---

## 7. The automatic bootstrap rule (self-setup on new machines)

The two protocol files (`knowledge.md` and `AGENTS.md`) each contain this rule:

> **Bootstrap check:** At session start, run `git config core.hooksPath`. If it does not return `.githooks`, run `bash scripts/setup-memory-hooks.sh` before doing anything else. If memory files are missing but `MEMORY_SETUP.md` exists, replicate them from `MEMORY_SETUP.md`.

**Why this achieves zero-input setup:** Freebuff auto-reads `knowledge.md` at the start of every session; Cursor auto-reads `AGENTS.md`. So on ANY machine, the first session after `git clone`/`git pull` automatically: (1) detects the hook is not enabled, (2) runs the setup script, (3) verifies the memory files, and (4) if files are missing (brand-new repo), replicates them from this file. The user never has to remember to configure anything.

---

## 8. Verification checklist

**The AI agent executing this file runs this checklist itself and reports results — do not hand it to the user.** After setup, confirm all of these:

- [ ] `.gitattributes` exists with `*.sh text eol=lf` and `.githooks/* text eol=lf` (Windows safety)
- [ ] `git config core.hooksPath` returns `.githooks`
- [ ] `AGENTS.md`, `knowledge.md`, `handoff.md` exist at repo root
- [ ] `.githooks/post-commit` exists and `scripts/setup-memory-hooks.sh` ran clean
- [ ] `scripts/machine-sync.sh` exists and runs clean (`bash scripts/machine-sync.sh`)
- [ ] `docs/activity-log.md` exists with the header
- [ ] `docs/lessons-learned.md` exists with the entry format and at least one seeded lesson
- [ ] `docs/activity-watch.log` is gitignored (`git check-ignore docs/activity-watch.log`)
- [ ] Make a `fix(...)` test commit → `docs/lessons-learned.md` gains an `(auto-captured, needs enrichment)` entry (and `docs/activity-log.md` gains the commit)
- [ ] `docs/.last-machine` is gitignored (`git check-ignore docs/.last-machine`)
- [ ] Make a test commit → `docs/activity-log.md` gains an entry with the files changed
- [ ] (Optional) `node scripts/memory-watcher.mjs` logs a save event
- [ ] Session protocol present in both `knowledge.md` and `AGENTS.md`

---

## 9. Customization guide

| Section | What to change per project |
|---|---|
| `AGENTS.md` → Project | One-paragraph project description |
| `AGENTS.md` → Non-negotiable rules | Package manager, test/typecheck commands, secrets policy |
| `knowledge.md` → Project / Commands / Architecture / Constraints | Your project's real facts |
| `handoff.md` | Project name, overview |
| `.cursor/rules/*.mdc` | Globs + conventions per source area |
| Watcher `IGNORED_DIRS` | Add your build/output dirs |

Everything else — the session protocol, the git hook, the setup script, the machine-sync check, the activity log — is **copy-paste identical** across projects.
