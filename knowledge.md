# Project knowledge

## Project

- PDF import browser bug fixed 2026-08-05: the persistent "This file could not be imported." error was NOT a parser issue. `App.tsx`'s bootstrap effect closed the module-singleton wa-sqlite store when React StrictMode ran the effect twice in dev, so all later DB queries (e.g. import `listCategories`) failed with SQLITE_MISUSE and the uncoded error rendered as the generic card. Fixed by not closing the singleton store on the cancelled effect pass; verified end-to-end in headless Chrome (19-row review table + commit, 19 transactions in SQLite) via `scripts/repro-import.mjs`.
- PDF investigation 2026-08-05: the original vault/PDF.js browser failures are fixed. Fresh Chrome loads the vault and worker; the real TD mock parses through the browser app's exact in-process path as 19 `pdf_text_table` rows. Headless CDP file-input automation remains unable to expose `input.files` reliably, so do not call that a full native chooser E2E test.

- Expense Tracker is a local-first personal finance web and native iOS application based on the `parse-and-track-spending` reference project.
- Planned clients: React + TypeScript + Vite PC web app; native SwiftUI iOS app with iOS 16 minimum; free Node-based local relay/companion.
- Core behavior: manual expenses, CSV/PDF import and review, categorization, correction-driven personal rules, weekly/monthly/custom summaries, encrypted local vaults, offline operation, and foreground phone-away/PC-later synchronization.
- Current implementation state: first foundation/web/relay/import slice is implemented under `apps/`, `packages/`, and `docs/`; native iOS source scaffold exists but cannot be compiled on this Windows/MSYS machine.
- Never commit secrets, `.env` files, private keys, credentials, or personal financial statements.

## Lessons & gotchas (auto-read — never repeat these)

- **Never close/dispose a module-singleton resource from a cancelled React StrictMode effect pass.** The PDF import bug (2026-08-05, ~1 h to find) was exactly this: the cancelled bootstrap effect closed the shared wa-sqlite DB, so every later query failed with SQLITE_MISUSE and the UI showed a generic "This file could not be imported." card while all Node tests passed. Session-owned singletons are never disposed by effect cleanups.
- **Browser-only bugs are invisible to Node/jsdom tests.** Verify UI flows in a real browser: `scripts/audit-browser.mjs` (21 scenarios), `scripts/repro-import.mjs` (PDF), `scripts/audit-reload.mjs` (persistence). Diagnose from the real console via CDP before theorizing.
- **Never swallow raw errors** — `console.error` the original error before mapping to a safe user message, or the real cause stays hidden.
- **When an assertion fails, check whether the app or the assertion is wrong** before changing code (3 audit assertions failed because the test assumed behavior the app correctly didn't have).
- **Bash `cd x && cmd &` backgrounds the whole list** — use `(cd x && cmd & echo $! > pid)` or absolute paths in test commands.
- **First in-session PDF parse cold-starts the pdf.js worker** and can take > 30 s in fresh profiles; not a bug.
- **Full structured lessons log (auto-captured + agent-written): `docs/lessons-learned.md`.**

## Architecture and constraints

- Required path is $0 in software/service fees; no hosted database, hosted synchronization tier, paid API, App Store publication, or TestFlight is required.
- The PC runs the local web app and optional relay. iOS is intended to retain expenses in a durable encrypted pending queue across restarts and later batch-sync exactly once when iOS and the PC/relay reconnect in the foreground.
- Local vaults are isolated. Synchronization uses explicit pairing, encrypted envelopes, device-specific wrapped vault keys, key versions, authenticated snapshots, an append-only mutation log, Lamport/vector clocks, tombstones, and visible conflict review.
- CSV and text-based PDF parsing happens locally on web and is specified for iOS parity. Web PDF parsing now preserves PDF.js coordinates and reconstructs repeated debit/credit/balance tables; OCR remains deferred for genuinely image-only PDFs.
- iOS 16 and iPhone X compatibility are release constraints. SwiftData and iOS 17-only APIs cannot be core prerequisites.
- The current relay is only a local replay/transport scaffold. Authenticated pairing, TLS/certificate setup, production key storage, snapshot signing/bootstrap, and complete sync remain future US6 work.

## Commands

- Install: `npm install` (committed `package-lock.json`, lockfile version 3)
- Development: `npm run dev:web` or `npm run dev:relay`
- Test: `npm test`; focused `npm run test:web`, `npm run test:relay`, `npm run test:fixtures`
- Browser PDF investigation: start `npm run dev:web`, open `http://localhost:5174/#/import`, hard refresh, inspect Chrome console/network; expected WASM response is `application/wasm` with bytes `00 61 73 6d`.
- Typecheck: `npm run typecheck`
- Lint: `npm run lint` (currently includes vendored skill-script noise and must be narrowed before release gating)
- Build: `npm run build` (web production build passes; relay has no separate build script)
- Memory hook setup: `bash scripts/setup-memory-hooks.sh`
- Validation: `bash -n .githooks/post-commit scripts/setup-memory-hooks.sh scripts/machine-sync.sh`; `bash scripts/machine-sync.sh`
- Session closeout: `git status --short --branch`; update `handoff.md` and this file

## Implemented slices

- Shared contracts/domain/design tokens/fixtures/parsing: TypeScript source, security lifecycle contracts, reusable golden assertions, and tests are present and green.
- Web: Vite shell, wa-sqlite adapter with explicit WASM URL/VFS module wiring, worker/in-process parser, bundled PDF.js worker, coordinate-aware PDF table reconstruction, import review UI, safe transactional domain persistence boundary, duplicate rows default to pending, web contract/a11y tests; encrypted mutation-log commit remains pending the production vault-key adapter.
- Relay: `apps/relay/src/main.ts`, `relay-server.ts`, deterministic clock/envelope/local transport test helpers, bounded namespaced replay store, 10 passing tests.
- iOS: `apps/ios/project.yml`, SwiftUI app/features/design tokens/domain, restart-capable Keychain/encrypted SQLite source adapters, native cancellable CSV/PDF import/review, durable pending-ID persistence, and XCTest fixture/persistence/import sources. Xcode/xcodebuild/XcodeGen are unavailable on this machine, so no native build result exists yet.
- Docs: dependency matrix and security model describe actual versus future boundaries.

## Validation facts

- Full audit 2026-08-05 (report: `aug5-report.md`): typecheck/lint/122 tests/web build all pass. `scripts/audit-browser.mjs` = 21-scenario live Chrome E2E over US1 flows (vault bootstrap, nav, CSV import+exclude+commit, duplicate re-import+attention filter, PDF import 19 rows, empty/malformed error states) — passes on both dev server and `vite preview` production build with a clean console. `scripts/audit-reload.mjs` = vault/data survive a full page reload. Relay `/health` + WS `pong` verified live. Overview/Transactions/Settings pages are static shells (US3/US5 unimplemented); their empty-state copy is misleading after imports exist.
- Full Vitest run after final fixes: 20 files / 122 tests passed.
- Focused post-fix run: 12 files / 78 tests passed across domain/web/relay; all focused typechecks passed.
- Web `npm run build` passed and produced parser-worker and wa-sqlite WASM assets.
- ESLint passes for the configured first-party TypeScript scope; vendored skills/docs/specs/iOS/scripts remain intentionally excluded.
- Latest validation: full typecheck passed, 20 Vitest files/122 tests passed, web production build passed with the bundled `pdf.worker` asset, and the real TD mock parsed to 19 rows in Node and the browser app parser.

## Speckit artifacts

- Feature specification: `specs/001-local-expense-tracker/spec.md`
- Implementation plan: `specs/001-local-expense-tracker/plan.md`
- Research decisions: `specs/001-local-expense-tracker/research.md`
- Data model: `specs/001-local-expense-tracker/data-model.md`
- Contracts: `specs/001-local-expense-tracker/contracts/`
- Tasks: `specs/001-local-expense-tracker/tasks.md`
- Handoff: `handoff.md`

## Session protocol

Freebuff reads `knowledge.md` automatically. Cursor reads `AGENTS.md`.

**At session start:** read `handoff.md`, this file, and `docs/lessons-learned.md` (auto-captured "needs enrichment" entries are homework to expand). Then check hooks/machine sync/status/activity log.

**During work — lesson capture is MANDATORY and immediate:** whenever you fix an error, make a mistake, discover a gotcha, or find a project issue, append a structured entry to `docs/lessons-learned.md` (Symptom / Root cause / Fix / Avoid in future / Status) right away — never at session end. The `.githooks/post-commit` hook auto-appends placeholder entries for fix/error commits as a mechanical safety net.

**After substantial work:** append a concise Work completed note to `handoff.md`; update this file with new commands/architecture facts. Keep memory lean.

**At session end:** review `docs/lessons-learned.md`; expand any auto-captured placeholder entries with root cause + avoid-in-future, then remove their "needs enrichment" marker. Prune stale entries.
