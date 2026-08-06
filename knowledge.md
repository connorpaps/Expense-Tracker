# Project knowledge

## Project

- PDF import browser bug fixed 2026-08-05: the persistent "This file could not be imported." error was NOT a parser issue. `App.tsx`'s bootstrap effect closed the module-singleton wa-sqlite store when React StrictMode ran the effect twice in dev, so all later DB queries (e.g. import `listCategories`) failed with SQLITE_MISUSE and the uncoded error rendered as the generic card. Fixed by not closing the singleton store on the cancelled effect pass; verified end-to-end in headless Chrome (19-row review table + commit, 19 transactions in SQLite) via `scripts/repro-import.mjs`.
- PDF investigation 2026-08-05: the original vault/PDF.js browser failures are fixed. Fresh Chrome loads the vault and worker; the real TD mock parses through the browser app's exact in-process path as 19 `pdf_text_table` rows. Headless CDP file-input automation remains unable to expose `input.files` reliably, so do not call that a full native chooser E2E test.

- Expense Tracker is a local-first personal finance web and native iOS application based on the `parse-and-track-spending` reference project.
- Planned clients: React + TypeScript + Vite PC web app; native SwiftUI iOS app with iOS 16 minimum; free Node-based local relay/companion.
- Core behavior: manual expenses, CSV/PDF import and review, categorization, correction-driven personal rules, weekly/monthly/custom summaries, encrypted local vaults, offline operation, and foreground phone-away/PC-later synchronization.
- Current implementation state: foundation plus US1–US5 web/shared slices, US7 web/demo/isolation slices, and a web-only US6 local sync/conflict-review boundary alongside the partial relay pairing/conflict foundation are implemented under `apps/`, `packages/`, `scripts/`, and `docs/`; native iOS source exists but cannot be compiled on this Windows/MSYS machine.
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
- The relay now has a tested localhost-only challenge/proof pairing and socket-bound authorization foundation with capability checks and authority-only revocation. It is not a LAN security boundary: HTTPS/WSS, durable device/token/revocation persistence, accepting-device unwrap confirmation, snapshot signing/bootstrap, client projection application, reconnect/retry/device controls, and complete client sync remain future US6 work. The web `/sync` page records local opaque decisions only.

## Commands

- Install: `npm install` (committed `package-lock.json`, lockfile version 3)
- Development: `npm run dev:web` or `npm run dev:relay`
- Test: `npm test`; focused `npm run test:web`, `npm run test:relay`, `npm run test:fixtures`
- Browser PDF investigation: start `npm run dev:web`, open `http://localhost:5174/#/import`, hard refresh, inspect Chrome console/network; expected WASM response is `application/wasm` with bytes `00 61 73 6d`.
- Typecheck: `npm run typecheck`
- Lint: `npm run lint` (the configured ESLint scope excludes vendored skills, docs, specs, iOS, and scripts; current lint passes)
- Build: `npm run build` (web production build passes; relay has no separate build script)
- Memory hook setup: `bash scripts/setup-memory-hooks.sh`
- Validation: `bash -n .githooks/post-commit scripts/setup-memory-hooks.sh scripts/machine-sync.sh`; `bash scripts/machine-sync.sh`
- Session closeout: `git status --short --branch`; update `handoff.md` and this file

## Implemented slices

- Shared contracts/domain/design tokens/fixtures/parsing: TypeScript source, security lifecycle contracts, reusable golden assertions, and tests are present and green.
- Web: Vite shell, serialized wa-sqlite adapter with explicit WASM URL/VFS module wiring, worker/in-process parser, bundled PDF.js worker, coordinate-aware PDF table reconstruction, import review UI, safe transactional domain persistence boundary, duplicate rows default to pending, web contract/a11y tests, US2 manual transaction CRUD with encrypted mutation writes and integration coverage, US4 category/rule management, US5 password-encrypted versioned vault export/import plus clear-local-data controls, and US7 multi-vault switching/demo isolation/safe copy import; browser-bound sync/device records are intentionally excluded from portable backups.
- Relay: `apps/relay/src/main.ts`, `relay-server.ts`, deterministic clock/envelope/local transport test helpers, bounded namespaced replay/mutation exchange store with cached replay responses, and a localhost-only challenge/proof pairing authority with socket-bound capability authorization/revocation. Relay plus pairing tests pass 18 tests; HTTPS/WSS and durable device registry remain open.
- Web sync boundary: `apps/web/src/features/sync/SyncPage.tsx` provides local pending/conflict counts, opaque candidate review, local encrypted resolution mutations, polling, and explicit no-projection/no-relay claims. `scripts/audit-vaults.mjs` live-audits web vault/demo lifecycle and isolation.
- iOS: `apps/ios/project.yml`, SwiftUI app/features/design tokens/domain, restart-capable Keychain/encrypted SQLite source adapters, native manual transaction CRUD with reconstructable pending source-record queue wiring, native cancellable CSV/PDF import/review, durable pending-ID compatibility persistence, and XCTest fixture/persistence/import/manual-entry sources. Encrypted append-only mutation-envelope integration remains US6 work; Xcode/xcodebuild/XcodeGen are unavailable on this machine, so no native build result exists yet.
- Docs: dependency matrix and security model describe actual versus future boundaries.

## Validation facts

- Full audit history 2026-08-05 (report: `aug5-report.md`): the original US1 audit passed 21 scenarios with a clean console, and later US3–US7 slices added dashboard, transactions, categorization, privacy/offline, multi-vault/demo, and relay/domain coverage. The pre-final-hardening repository gate passed **40 test files / 189 tests**; the final gate for the current tree is recorded below. Existing live web smoke confirms HTTP 200 on port 5173; the relay is not currently running because secure startup requires vault-scoped enrollment configuration.
- Historical baseline: the original post-PDF-fix full Vitest run was 20 files / 122 tests; this is retained only as history, not the current total.
- Historical focused baseline: the post-PDF-fix focused run was 12 files / 78 tests across domain/web/relay; current focused and full totals are recorded in `handoff.md` and the latest validation notes.
- Web `npm run build` passed and produced parser-worker and wa-sqlite WASM assets.
- ESLint passes for the configured first-party TypeScript scope; vendored skills/docs/specs/iOS/scripts remain intentionally excluded.
- Final current-tree repository validation passes **41 test files / 197 tests**, full typecheck, lint, web production build, audit-script syntax checks, and `git diff --check`. The pre-final-hardening baseline was 40 files / 189 tests. This continuation additionally passes focused web typecheck, existing Chrome import audit 22/22 clean, reload persistence PASS, vault lifecycle audit 8/8 clean, backup audit 5/5 with synthetic file injection, and production-preview service-worker online/offline navigation. The fresh release pass verified HTTP 200 on ports 5173 and 4173, plus audit-browser 22/22 on both environments, reload persistence on both, offline 8/8, vault 8/8, backup 5/5, and process-restart persistence. Current web smoke returns HTTP 200 on port 5173. Existing warnings are the Vitest workspace deprecation, Node experimental SQLite notice, and Vite chunk-size notices.

- **US5 browser privacy automation remains bounded but evidenced.** The live backup audit verifies encrypted download, password unlock/preview, isolated copy, source preservation, and clean console (5/5) through synthetic `DataTransfer` file injection. Headless CDP does not expose `input.files` reliably, so native chooser/file-capable E2E remains open; IndexedDB deletion is covered by defensive code and Node/browser-like lifecycle tests.
- **US7 browser switching automation:** `scripts/audit-vaults.mjs` now clicks through private/demo creation and two-way switching in a fresh Chrome profile, verifies 13 demo-only rows and zero private rows, and captures a clean console. File-capable browser backup restore and native parity remain open.
- **US2 iOS completion remains platform-gated.** Native manual CRUD source exists and pending metadata is restart-safe without storing financial payloads in UserDefaults, but SwiftUI UI/Dynamic Type execution and encrypted mutation-envelope persistence require the macOS/Xcode US6 work.
- **US3 iOS summary validation remains platform-gated.** The native overview now applies period ranges, invalid custom-range messaging, and transaction/category presentation filters in source, with XCTest source coverage; Xcode/iOS runtime validation is still unavailable on this Windows host.
- **US6 relay exchange is authenticated only in the tested localhost subset.** Mutation batches are bounded, vault-scoped, replay-idempotent, conflict-aware, and known-clock filtered; secure mode requires server-driven P-256 proof, socket-bound capability tokens, and authority/revocation checks. Do not use it for sensitive LAN sync: HTTPS/WSS, durable registry, accepting-device unwrap confirmation, snapshot/bootstrap, iOS queue integration, client projection application, reconnect/retry/device controls, and full phone-away acceptance remain open. Web `/sync` reviews opaque local conflicts, validates declared fields and basic types for manual/merged payloads, exposes read-only failed-mutation details, and records decisions, but does not apply projections or claim delivery.
- **US4 categorization closeout is web/shared-complete but not fully cross-client.** Default and personal rules, conflict review, correction history, import provenance, web correction/settings controls, backup compatibility, and remapping tests are implemented. Summary records still do not expose category provenance (T058 partial), and iOS category/rule UI plus durable encrypted rule mutations remain Xcode/US6-gated (T055/T060 open).
- **Latest US4 closeout validation:** workspace typecheck passed; full Vitest passed 31 files/155 tests; lint and production build passed; the live Chrome audit passed 22/22 with a clean console. The remapping regression ties copied references to source category names and copied transaction merchant identity rather than query order, and the remember control is disabled until an explicit category correction exists.
- **US5 offline/privacy closeout:** `apps/web/tests/integration/offline.test.tsx` now covers manual entry, editing, category correction, pending status, summary rendering, offline transitions, and remount persistence. `scripts/audit-offline.mjs` covers the same flow in real Chrome with network disabled; `scripts/audit-restart.mjs` verifies persistence across separate Chrome processes; `scripts/audit-service-worker.mjs` verifies the optional production static shell and offline navigation. T061, T064, and T068 are checked. T062 remains open for domain-level recovery/clear lifecycle coverage; T063/T065 remain source/platform-gated and native purge-incomplete; T066 remains open for full shared/native encrypted vault-I/O parity. T067 local privacy behavior remains checked, with authenticated remote tombstones deferred to US6.

- **US5 privacy operations:** `packages/domain/src/privacy/` now provides separate statement-original deletion, imported-record deletion, and local vault purge operations. Imported deletion preserves learned rules, removes invalid import-linked correction history, increments transaction versions, and can append encrypted delete tombstones; vault purge is intentionally local-only until US6 authenticated exchange exists.
- **Historical privacy validation:** `packages/domain/tests/privacy-lifecycle.test.ts` covers retention, versioned tombstones, rollback on mutation failure, rollback on vault-purge failure, and cross-vault isolation. At that earlier slice, repository validation was 33 Vitest files / 162 tests with typecheck/lint/build green and Chrome audit 22/22 clean.
- **US5 remaining boundaries:** T062 remains open for complete domain recovery/clear lifecycle coverage; T063/T065 remain source/platform-gated and native purge-incomplete; T066 remains open for full shared/native encrypted vault-I/O parity. T061, T064, and T068 are checked with web integration and live-browser evidence; T067 local domain/web behavior is implemented. Authenticated remote tombstone propagation belongs to US6.
- **Phase 10 web accessibility boundary:** automated axe checks now include import, dashboard, and local sync/conflict review surfaces. Manual keyboard/screen-reader/contrast/responsive review and native accessibility remain open under T090/T089.
- **Release evidence 2026-08-06:** production-preview service-worker audit passed activation/cache and offline navigation; the fresh browser release pass passed `audit-browser` 22/22 on dev and production, reload persistence on both, offline 8/8, vault 8/8, backup 5/5, and process-restart persistence. Backup file selection remains synthetic `DataTransfer` coverage only; the file-input limitation is a harness limitation, not native chooser proof.

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
