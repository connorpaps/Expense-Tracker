# Project knowledge

## Project

- Expense Tracker: a local-first personal finance web and native iOS application based on the `parse-and-track-spending` reference project.
- Planned clients: React + TypeScript + Vite PC web app; native SwiftUI iOS app with iOS 16 minimum; free Node-based local relay/companion.
- Core behavior: manual expenses, CSV/PDF import and review, categorization, correction-driven personal rules, weekly/monthly/custom summaries, encrypted local vaults, offline operation, and foreground phone-away/PC-later synchronization.
- Current implementation state: specification, plan, research, data model, contracts, quickstart, checklist, and 96 implementation tasks exist under `specs/001-local-expense-tracker/`; application source code has not been implemented yet.
- Repository state: Git is initialized on `main`, `origin` points to `https://github.com/connorpaps/Expense-Tracker.git`, the remote starter README history was merged cleanly, and the initial project/memory commit is `7b4c70d` pending push.

## Architecture and constraints

- Required path is $0 in software/service fees; Supabase, PowerSync, hosted databases, hosted synchronization, paid APIs, App Store publication, and TestFlight are not required.
- The PC runs the local web app and optional relay. iOS can create expenses away from the PC, retain them in a durable encrypted pending queue across restarts, and later batch-sync them exactly once when iOS and the PC/relay reconnect in the foreground.
- Local vaults are isolated. Synchronization uses explicit pairing, encrypted envelopes, device-specific wrapped vault keys, key versions, authenticated snapshots, an append-only mutation log, Lamport/vector clocks, tombstones, and visible conflict review.
- CSV and text-based PDF parsing happens locally on web and iOS. Browser/iOS normalized fixture parity is required. OCR is deferred.
- iOS 16 and iPhone X compatibility are release constraints. SwiftData and iOS 17-only APIs cannot be core prerequisites.
- Never commit secrets, `.env` files, private keys, credentials, or personal financial statements.

## Commands

- Install: `<!-- TODO: fill in after implementation package manifests exist -->`
- Development: `<!-- TODO: fill in after implementation package manifests exist -->`
- Test: `<!-- TODO: fill in after implementation package manifests exist -->`
- Typecheck/lint: `<!-- TODO: fill in after implementation package manifests exist -->`
- Build: `<!-- TODO: fill in after implementation package manifests exist -->`
- Memory hook setup: `bash scripts/setup-memory-hooks.sh` (verified)
- Validation: `bash -n .githooks/post-commit scripts/setup-memory-hooks.sh scripts/machine-sync.sh`; `bash scripts/machine-sync.sh`; `git check-ignore -v docs/activity-watch.log docs/.last-machine`
- Machine synchronization: `bash scripts/machine-sync.sh`
- Optional file watcher: `node scripts/memory-watcher.mjs`

## Speckit artifacts and next step

- Feature specification: `specs/001-local-expense-tracker/spec.md`
- Implementation plan: `specs/001-local-expense-tracker/plan.md`
- Research decisions: `specs/001-local-expense-tracker/research.md`
- Data model: `specs/001-local-expense-tracker/data-model.md`
- Contracts: `specs/001-local-expense-tracker/contracts/`
- Quickstart: `specs/001-local-expense-tracker/quickstart.md`
- Tasks: `specs/001-local-expense-tracker/tasks.md`
- Temporary cost report: `cost-report.md`
- Next product step: `/speckit.implement`, beginning with T001 and the Phase 1/2 checkpoints.

## Session protocol (AI memory system)

This repository uses git-tracked files as cross-session AI memory. **Freebuff reads this file (`knowledge.md`) automatically at the start of every session**; Cursor reads `AGENTS.md` instead. Follow this ritual every session:

- **Bootstrap check:** Verify the memory system is active — run `git config core.hooksPath`. If it is not `.githooks`, run `bash scripts/setup-memory-hooks.sh` before doing anything else. If memory files are missing but `MEMORY_SETUP.md` exists, replicate them from `MEMORY_SETUP.md`.
- **Machine sync check:** Run `bash scripts/machine-sync.sh` — detects machine swaps, re-enables hooks here, fixes old `master` clones, and pulls the latest memory files when the working tree is clean.
- **Session start:** Read `handoff.md` first, then this file, then check `git status --short`, `git log --oneline -10`, and the tail of `docs/activity-log.md`.
- **During work:** Log non-obvious decisions, new commands, and gotchas into this file as they are discovered. **After completing a substantial change, append a brief `Work completed` note to `handoff.md` immediately.**
- **Session end:** Append a date-stamped `Work completed` section to `handoff.md` describing changes, reasons, and validation. Update this file with new rules/commands/architecture facts. Keep both files lean.
- **Wrap-up signals:** If the user signals the session is ending, update `handoff.md` and this file even if not explicitly asked.
- **Update `AGENTS.md` only when a rule must also bind other tools; this file is the single source of truth.**

**Automatic memory:** `.githooks/post-commit` appends every commit to `docs/activity-log.md`; `node scripts/memory-watcher.mjs` optionally logs file saves to ignored `docs/activity-watch.log`. These mechanical records complement the explanatory notes maintained by the agent.
