# AGENTS.md

Instructions for AI coding agents working in this repository. Read `knowledge.md` as the canonical project memory file; keep this file limited to rules that must bind Cursor, Copilot, Codex, Windsurf, and other AGENTS.md-compatible tools.

## Project

Expense Tracker is a local-first personal finance application planned as a React/TypeScript/Vite PC web app, a native SwiftUI iOS 16 app, and a free local relay/companion. It imports CSV and text-based PDF statements, categorizes transactions, learns from corrections, calculates summaries, and supports encrypted offline phone-away/PC-later synchronization without a required hosted service.

## Memory protocol — follow every session

This repository uses git-tracked files as cross-session AI memory. The goal is to avoid re-explaining the project between sessions.

### At session start

1. Read `handoff.md` first for the last session's work and prioritized next steps.
2. Read `knowledge.md` for commands, architecture, constraints, and gotchas.
3. Read `docs/lessons-learned.md` — auto-captured "needs enrichment" entries there are homework to expand with root cause + avoid-in-future.
4. Check `git status --short`, `git log --oneline -10`, and the tail of `docs/activity-log.md`.
5. After each substantial change, append a brief `Work completed` note to `handoff.md` immediately.

### During work — lesson capture is mandatory and immediate

Whenever you fix an error, make a mistake, discover a gotcha, or find a project issue, append a structured entry to `docs/lessons-learned.md` **right away** (Symptom / Root cause / Fix / Avoid in future / Status). Never wait for session end — a forgotten lesson is a future hour-long debug. The `.githooks/post-commit` hook auto-appends placeholder entries for fix/error commits as a safety net.

### At session end or task completion

1. Append a date-stamped `Work completed` section to `handoff.md` describing what changed, why, and validation.
2. Update `knowledge.md` with new commands, architecture facts, constraints, or gotchas.
3. Review `docs/lessons-learned.md`: expand auto-captured placeholder entries and remove their "needs enrichment" markers.
4. Keep the memory files lean and prune stale material.

### Wrap-up signals

If the user says `wrap up`, `done for today`, `that's all`, or `update the handoff`, update `handoff.md` and `knowledge.md` even if not explicitly asked.

### Bootstrap check

At session start, run `git config core.hooksPath`. If it is not `.githooks`, run `bash scripts/setup-memory-hooks.sh`. If memory files are missing while `MEMORY_SETUP.md` exists, replicate them from that guide.

### Machine sync check

At session start, run `bash scripts/machine-sync.sh`. It detects machine changes, re-enables hooks, and pulls memory updates only when the working tree is clean.

## Non-negotiable rules

- Never commit `.env`, tokens, private keys, credentials, personal bank statements, or other secrets.
- Use the selected package manager and commands recorded in `knowledge.md` once implementation manifests exist.
- Run the relevant typecheck, tests, lint, accessibility, and performance checks before declaring implementation complete.
- Never hand-edit generated/build output directories.
- Preserve the strict $0-required architecture: no required hosted database, hosted sync tier, paid API, App Store publication, or TestFlight.
- Preserve iOS 16 compatibility and the phone-away/PC-later foreground reconnect workflow.
- Ask before changing the data model, security assumptions, or required external services.

## Reference files

- `knowledge.md` — canonical project knowledge, gotchas, and session protocol
- `handoff.md` — session log and prioritized next steps
- `docs/lessons-learned.md` — structured lessons/errors/gotchas log (auto-captured + agent-written)
- `docs/activity-log.md` — automatic commit log
- `.githooks/post-commit` — automatic activity-log + lessons-capture hook
- `scripts/setup-memory-hooks.sh` — per-machine hook setup
- `scripts/machine-sync.sh` — session-start machine synchronization
- `MEMORY_SETUP.md` — memory-system replication reference
