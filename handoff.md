# Expense Tracker — Session Handoff

**Last updated:** 2026-08-06
**Project:** Local-first expense tracker for PC web, native iOS, and free local relay

## Current implementation state

The repository now contains the implemented foundation and web/shared feature slices from `specs/001-local-expense-tracker/tasks.md`:

- Strict TypeScript monorepo tooling and a committed npm lockfile.
- Shared contracts, domain entities, exact minor-unit money/date/summary logic, SQLite schema/repository, import/categorization/privacy/conflict/sync primitives, and tests.
- Sanitized CSV/PDF fixtures, golden outputs, JSON schemas, reusable golden assertions, parser safety/accuracy tests, browser audit harnesses, and semantic design tokens with iOS emission.
- React/Vite web app with local wa-sqlite vaults, worker/in-process parsing, import review/commit, manual transactions, summaries/filters, categorization/rules, offline/privacy controls, multi-vault/demo flows, local sync/conflict review boundaries, and accessibility coverage.
- Node local relay with health/WebSocket transport, bounded namespaced mutation exchange, replay/conflict handling, and a tested localhost-only proof-based pairing/authorization foundation (18 relay tests).
- iOS 16 SwiftUI/XcodeGen source target with native navigation, manual entry/detail/delete, overview, settings/privacy surfaces, document-picker import review, cancellable CSV/PDF parsing, Keychain/SQLite persistence sources, and XCTest source coverage.
- `docs/dependency-matrix.md` and `docs/security-model.md` document the $0 architecture, dependency/license boundaries, and threat model.

## Validation completed

- `npm run typecheck`: passes for relay, web, and all TypeScript packages.
- Final current-tree repository gate: **41 test files / 197 tests passed**, full typecheck, lint, production build, all seven audit-script syntax checks, and `git diff --check` passed. Warnings are limited to Vite large-chunk notices, Node experimental SQLite, and Windows line-ending notices.
- Fresh full web release pass: `scripts/audit-browser.mjs` passed **22/22** against both dev (`5173`) and production preview (`4173`) with clean consoles; `audit-reload` passed on both; `audit-offline` **8/8**, `audit-vaults` **8/8**, `audit-backup` **5/5**, `audit-restart` passed, and the production service-worker audit passed online/offline navigation. Backup selection remains synthetic `DataTransfer` coverage, not native chooser E2E.
- Focused validation after the Phase 1–3 continuation: TypeScript typecheck, ESLint, domain/fixtures/parsing/web suites, and the added Node-environment PDF contract suite pass; final full-suite count is recorded after the last rerun.
- `npm run build`: web production build passes and emits the parser worker and wa-sqlite WASM assets.
- Final web-first release evidence: production-preview service-worker audit passes online activation/cache and offline navigation; the live backup audit passes 5/5 scenarios (encrypted download, unlock/preview, isolated copy, source preservation) using synthetic `DataTransfer` file injection. That file bridge is explicitly not native chooser E2E.
- Relay/contracts typechecks pass; the relay and pairing suites pass all 18 tests after bounded mutation exchange, replay-cache, conflict reporting, request limits, proof-based pairing, capability authorization, enrollment cleanup, and revocation fixes.
- Focused web/domain/relay tests pass after transactional import persistence, duplicate pending decisions, and accessibility semantics fixes.
- `npm run lint` passes with vendored skills, docs, specs, iOS, and scripts excluded from the TypeScript application lint scope.
- Swift/Xcode/xcodebuild/XcodeGen are unavailable on this Windows/MSYS machine, so the native target is source-reviewed but not compiled or XCTest-validated here.

## Important limitations (do not overclaim)

- The web import commit is wired to the domain transaction/repository boundary. Fresh Chrome now opens the vault and loads the bundled PDF.js worker without runtime/network errors. The real `TD_Bank_Realistic_Mock.pdf` was parsed through the browser app's exact `parseFileInProcess` path into 19 recognized rows using coordinate-aware extraction. Headless CDP's `DOM.setFileInputFiles` does not expose the selected file through `input.files` reliably, so that automation limitation is not treated as a full chooser/UI E2E assertion.
- The relay is development scaffolding, not a production security boundary: the tested localhost pairing/authorization foundation is not LAN-ready. TLS/certificate setup, durable vault/device registry, snapshot signing/bootstrap, key storage/rotation, accepting-device unwrap confirmation, client-side projection application, reconnect/retry controls, and full phone-away sync remain open. The web sync page only reviews opaque local conflict records and records encrypted decisions; it does not claim that a financial projection changed or that another device received the mutation.
- iOS now includes source-level Keychain and encrypted SQLite adapters plus a native pending/import flow; these remain uncompiled and therefore not runtime-validated until Xcode is available.
- Native iOS document picking, cancellable CSV/PDF parsing, review decisions, and local commit behavior are implemented in source and XCTest targets; native parity is not runtime-tested on this machine.
- iOS export/clear-local-data controls are labeled surfaces awaiting the production encrypted vault I/O implementation.
- The web worker has progress/error behavior; PDF contract coverage runs in a Node-environment web test because PDF.js cannot be exercised reliably under jsdom. Browser PDF.js worker loading and the real TD parser path are verified in Chrome; headless CDP file injection reports `input.files` unreliably, so the backup audit's synthetic selection is not native chooser proof. A file-capable E2E harness is still required for native chooser coverage.
- XcodeGen project generation and iOS 16 destination validation must be run on macOS with Xcode before any native release claim.

## Task traceability

The task checklist in `tasks.md` is reconciled through the current US7/US6 checkpoints: completed lines are checked, while platform-gated, production-sync, and cross-cutting release tasks remain explicitly open. TypeScript behavior is validated locally; native iOS sources and XCTest targets remain uncompiled on this Windows host. Native runtime validation, production encrypted mutation-log wiring across clients, LAN TLS/WSS, durable relay state, bootstrap, and full phone-away sync remain deployment/platform gates rather than claims.

## Next priorities

1. Continue US6 production sync/security: HTTPS/WSS LAN transport, durable pairing/device registry, accepting-device unwrap confirmation, snapshot/bootstrap, durable iOS queue, exactly-once exchange, client projection application, relay reconnect/retry/device controls, and full phone-away sync. The web-only local conflict review/status boundary—including declared-field/basic-type validation for manual/merged payloads and read-only failed-mutation details—is implemented and tested; the relay is not a production LAN security boundary.
2. On macOS, generate/build `apps/ios/project.yml`, run iOS 16 XCTest, and validate Keychain/SQLite restart, native privacy/demo parity, native purge, and bundled-fixture behavior.
3. Complete remaining US5 boundaries: domain recovery/clear lifecycle expansion, native persistent privacy deletion, and shared/native encrypted vault-I/O parity.
4. Complete file-capable browser backup restore automation and native export/import/demo/privacy parity. The new `scripts/audit-vaults.mjs` live-audits private/demo creation, switching, isolation, and privacy-control presence, while `scripts/audit-backup.mjs` now covers the product flow with synthetic file injection; neither claims native chooser parity.
5. Finish Phase 10 accessibility/security/traceability/manual responsive review and final cross-platform release gates.

## Work completed this session (2026-08-06, web-first US6/US7 continuation)

- Added `/sync` with local pending/conflict counts, polling, opaque conflict metadata, four encrypted decision paths, manual/merged JSON syntax validation, explicit local-only projection/relay limitations, and accessible action groups.
- Added sync integration coverage plus sync axe coverage; the web-only focused gate for the final slice passes 3 files / 12 tests, and the current complete repository gate is recorded above at 41 files / 197 tests.
- Added `scripts/audit-vaults.mjs`, a fresh-profile CDP audit covering private/demo vault creation, semantic vault labeling, two-way switching, demo-only records, cross-vault isolation, privacy-control presence, and clean console: 8/8 scenarios pass.
- Added `scripts/audit-backup.mjs` for encrypted download, synthetic file selection, password unlock, preview, isolated copy/remapping, source preservation, and clean-console evidence: 5/5 scenarios pass. The synthetic file bridge is documented as not native chooser E2E.
- Hardened `/sync` manual and keep-both payload validation for declared-field presence, basic types, dates, currencies, enums, delete timestamps, and merged local/remote objects; resolution uses the selected conflict snapshot. Added read-only failed-mutation details without implying retry or delivery.
- Added a bounded, centralized-cleanup watchdog to the production-only service-worker audit; production preview evidence passes online activation/cache and offline navigation.
- Reconciled T065/T066/T080/T081 annotations to distinguish completed web evidence from open iOS, native file-capable browser E2E, relay, projection-application, and cross-client requirements. iOS remains intentionally deferred.
- Web validation in this continuation: focused web typecheck and 3 files/12 tests pass after the final sync hardening; the final full repository gate now passes 41 files/197 tests, all typechecks, lint, build, audit-script syntax checks, and diff check. The subsequent fresh dev/production browser release pass is recorded in Validation completed above. Existing warnings are non-failing Vite large-chunk, Node experimental SQLite, and Windows line-ending notices.

## Historical work snapshots

The dated sections below preserve per-phase implementation notes and validation counts as historical snapshots. The prior aggregate validation was **40 test files / 189 tests**; the current tree is validated at **41 test files / 197 tests** above.

## Work completed this session (2026-08-05, continued — US3 summaries, dashboard, and filters)

- Added expenses-only and explicit-currency semantics to the shared summary engine, with tests for mixed-currency isolation, credits/refunds, category totals, empty periods, and period boundaries.
- Completed the web overview dashboard path: weekly/monthly/custom ranges, exact spend/credit/net/count cards, category bars, recent activity, mixed-currency warning, empty-period actions, and accessible period controls.
- Added US3 web integration and accessibility tests, plus a 10,000-transaction summary/filter performance benchmark.
- Updated iOS overview to filter summaries and recent activity by week/month/custom range, added custom date controls, and added category filtering to the iOS transaction list. Source-level XCTest coverage was added; Xcode execution remains unavailable on this Windows host.
- Validation: full typecheck, all 28 Vitest files / 146 tests, lint, and build pass. Existing warnings are the Vitest workspace deprecation, Node experimental SQLite, and Vite chunk-size notices. iOS source remains uncompiled because Xcode is unavailable on this Windows host.

## Work completed this session (2026-08-05, continued — US2 manual expense entry)

- Closed US2 behavior tasks T038, T040, T041, and T044: the web transaction feature has dedicated integration coverage for validation, create, edit, delete confirmation, and local-save feedback; shared validation and repository writes reject zero-value amounts.
- T039 remains open because requested SwiftUI UI/Dynamic Type execution is unavailable on this Windows host. T042 is source-complete but runtime-unvalidated. T043 remains open: web uses the transactional encrypted mutation boundary, while iOS only persists non-sensitive pending metadata; encrypted mutation-envelope storage belongs in US6.
- Validation: full typecheck, lint, build, and Vitest pass (25 files / 140 tests). Existing warnings are Vite chunk-size notices, the Vitest workspace deprecation, and Node experimental SQLite. iOS source remains uncompiled because Xcode is unavailable.

## Work completed this session (2026-08-05, continued — US6 conflict detection/resolution boundary)

- Added field-aware concurrent conflict coverage for amount, date, merchant, category, deletes, and categorization-rule updates, with exact overlap linkage and conservative `'*'` handling when field metadata is unknown.
- Added opaque conflict resolution records for keep-local, keep-remote, manual encrypted values, and keep-both encrypted merged values; retries are idempotent, different retry choices are rejected, and failed mutation-log appends roll back the conflict status.
- Kept client-side projection application, conflict-review UI, authenticated relay pairing/authorization, and iOS runtime validation explicitly open.
- Validation: contracts/domain typechecks pass; 2 domain files / 15 sync tests pass, with only existing Vitest workspace and Node SQLite experimental warnings.

## Work completed this session (2026-08-05, continued — US6 pairing/authorization localhost checkpoint)

- Replaced the unsafe client-controlled pairing draft with a server-generated challenge/proof flow: P-256 SPKI public-key validation, proof-of-possession for both peers, wrapped-key confirmation signature, distinct device tokens, exact socket binding, capability checks, authority-only enrollment/revocation, one-time vault-scoped enrollment reservation, expiry/close cleanup, and fail-closed protected sync/bootstrap/revocation messages.
- Secure relay mode is localhost-only until HTTPS/WSS certificate setup exists; the production entry point requires a vault-scoped enrollment secret and validated TTLs. Legacy opaque transport tests use an explicit test-only insecure mode; it rejects pairing instead of acknowledging it.
- Added `apps/relay/tests/pairing.test.ts` for challenge/proof, distinct tokens, unauthorized access, capability-gated exchange, wrong-vault/invalid-proof rejection, enrollment reservation cleanup, and revocation invalidation.
- Validation: contracts/relay typechecks pass; relay and pairing suites pass **18 tests**. Durable device registry/revocation persistence, TLS/WSS, accepting-device unwrap confirmation, full bootstrap storage/resume/signature validation, and iOS integration remain open.

## Work completed this session (2026-08-05, continued — US7 vault isolation and demo/copy flows)

- Added domain-level vault isolation regressions proving wrong-vault reads return no record, wrong-vault updates/deletes do not affect the source vault, and cross-vault category references are rejected.
- Added web backup-boundary coverage proving paired-device and mutation-log records remain local while the portable snapshot excludes them.
- Reconciled US7 traceability: T085 is checked for the implemented web demo mode; T082/T083/T084/T086/T087 remain open where relay, browser-level, native, or cross-client coverage is still missing.
- Focused validation: domain/web typechecks pass; 18 domain tests and 9 web tests pass. The repository still intentionally does not claim authenticated relay security or native runtime completion.

- Added multi-vault browser lifecycle with active-vault selection persisted locally, strict vault-scoped session refresh, private-vault creation, clearly labeled demo-vault creation, seeded demo transactions, and a visible DEMO badge.
- Added safe backup copy import: verified exports can be copied into a new isolated vault with remapped vault/category/import/transaction/rule IDs; existing/source vaults remain untouched and demo metadata is not mislabeled as personal data.
- Added switch-error recovery, session bridge refresh, accessible vault controls, and styling for the vault selector/demo indicator.
- Added `vault-isolation.test.ts`, `vault-session.test.ts`, and `settings-contract.test.tsx` covering isolation, demo seeding, import-as-new preservation, session fallback, and labeled controls.
- Validation at this historical US7 checkpoint: full typecheck, full Vitest (23 files / 131 tests), lint, build, and live Chrome audit (22/22, clean console) passed. Existing browser audit did not yet exercise switching/copy-import interactively; direct Node/session tests covered those paths.

## Work completed this session (2026-08-05, continued — US6 opaque mutation exchange foundation)

- Extended the shared sync contract with upload-bearing exchange requests and explicit response metadata for replay status, conflicting duplicate IDs, and rejected oversized-batch IDs.
- Implemented a bounded per-vault opaque mutation store with global FIFO retention, known-clock filtering, deterministic Lamport ordering, page-size limits, vault scoping, and defensive upload limits.
- Made exchange batches idempotent: replayed batches return the cached original response and do not append changed retry contents. Semantically equivalent envelopes use canonical comparison; conflicting duplicate IDs retain the original envelope and are reported.
- Added relay WebSocket coverage for upload/filter/checkpoint behavior, replay stability, vault isolation, conflict reporting, canonical duplicate detection, oversized-batch accounting, FIFO eviction, plus the existing health/keepalive/clock/envelope tests.
- Validation: this historical opaque-exchange checkpoint passed **38 Vitest files / 182 tests**; it is retained as history. The historical pre-final-hardening 2026-08-06 checkpoint passed **40 test files / 189 tests**, full typecheck, lint, build, all audit-script syntax checks, and `git diff --check`. The current 41-file/197-test result is recorded at the top of this handoff. Existing non-failing warnings are the Vitest workspace deprecation, Node experimental SQLite notice, and Vite chunk-size notices.
- Explicit boundary: no authenticated pairing, peer authorization, signatures, TLS/certificate handling, durable relay storage, snapshot/bootstrap transfer, iOS client exchange, or client-side mutation application is claimed by this slice.

## Work completed this session (2026-08-05, continued — US5 web privacy lifecycle)

- Added password-encrypted, versioned `.etvault` web backups using PBKDF2-HMAC-SHA-256 + AES-GCM, with shared KDF metadata, SHA-256 checksum verification, schema-version gating, strict table/column/vault/reference validation, and transactional replacement.
- Excluded browser-bound mutation ciphertext/device pairing records from portable backups and made that limitation visible; Settings shows pending synchronization changes and requires explicit acknowledgement before export/restore can discard them.
- Replaced the Settings placeholder with accessible in-page masked password/confirmation dialogs, backup preview, explicit replace-all-vaults confirmation, reload-safe clear-local-data, and destructive deletion copy.
- Added `apps/web/tests/privacy-lifecycle.test.ts` covering encrypted round trip, wrong password, checksum/schema rejection, transactional replacement safety, and clear-close behavior.
- Extended `scripts/audit-browser.mjs` with a live Settings privacy-controls assertion.
- Validation: full typecheck passed; full Vitest passed (21 files / 128 tests); lint passed; web build passed (existing chunk-size warnings only); live Chrome audit passed 21/21 with zero console/network issues. This is the web portion of US5; offline/restart integration, iOS privacy tests, service-worker option, and domain privacy package tasks remain open.

## Work completed this session (2026-08-05, continued — memory system wrap-up)

- Verified `MEMORY_SETUP.md` is a complete, current replication kit for brand-new projects: all 12 files inventoried; templates for AGENTS.md/knowledge.md/handoff.md/docs-lessons-learned.md updated with the lessons-capture protocol; setup-script and post-commit templates verified byte-identical to the real files (HOOK PARITY: OK, SETUP PARITY: OK); added an "Performance & parallelism" section (hook = millisecond post-commit appends, watcher = debounced background process, machine-sync only at session start, files kept <200 lines).
- Final validation: `bash -n` + `node --check` on all hooks/scripts pass; `setup-memory-hooks.sh` reports all 9 memory files present; `machine-sync.sh` up to date with origin/main.
- Session wrapped up and pushed to GitHub (see git log).

## Work completed this session (2026-08-05, continued — memory system upgrade: automatic lessons capture)

- Upgraded the in-place memory system so mistakes/errors/gotchas/fixes are captured AUTOMATICALLY (user request — avoid another hour-long debug like the PDF bug):
  - New `docs/lessons-learned.md`: structured log (Symptom / Root cause / Fix / Avoid in future / Status), seeded with the real lessons from this project (StrictMode DB-close PDF bug, audit assertion mismatches, bash `&` cwd quirk, browser-use fallback, PDF cold start, stray listeners).
  - `.githooks/post-commit` now auto-appends an "(auto-captured, needs enrichment)" placeholder entry for every commit whose message matches fix/bug/error/regression/etc., with loop guards. Verified end-to-end in a scratch git repo (init commit → no entry; fix commit → placeholder created).
  - `knowledge.md` (auto-read every session) gained a "Lessons & gotchas" section + a mandatory immediate lesson-capture ritual in the session protocol; `AGENTS.md` mirrors it; `setup-memory-hooks.sh` now verifies the lessons file; `MEMORY_SETUP.md` documents the new file, hook, protocol, and checklist.
- Validation: `bash -n` on hook + setup script, setup script reports all memory files present, scratch-repo hook test passes, lessons file is git-tracked (not ignored).

## Work completed this session (2026-08-05, continued — full app audit)

- Ran a full app audit per user request before starting the next spec story. Static validation all green: typecheck, ESLint, 20 test files/122 tests, and the web production build (chunk-size warnings only).
- Added live-browser audit tooling using the established CDP technique: `scripts/audit-browser.mjs` (21-scenario E2E over US1 flows) and `scripts/audit-reload.mjs` (vault/data persistence across reload). Both pass 21/21 and PASS respectively against the dev server AND the production build (`vite preview`), with a clean console throughout. Relay live smoke: `/health` JSON ok, 404 on unknown paths, WebSocket `pong` round-trip ok.
- Findings written to `aug5-report.md`: everything in scope (T001–T037 / US1) works; Overview/Transactions/Settings are spec-correct static shells whose copy becomes misleading once imports exist (US3/US5 not yet implemented) — recommended as the next implementation priority alongside US2 manual entry.
- Cleanup: killed stray relay (8712) and preview (4199) listeners left by earlier ad-hoc test commands.

## Work completed this session (2026-08-05, continued — PDF upload fix)

- Root-caused the persistent "This file could not be imported." error in the browser upload flow. The parser was never the problem: a headless-Chrome CDP reproduction (`scripts/repro-import.mjs`) showed the TD PDF parsing to 19 rows, then `listCategories` failing with `SQLiteError: bad parameter or other API misuse`.
- Cause: `App.tsx`'s vault-bootstrap effect called `store.db.close()` when its effect pass was cancelled. In development React StrictMode runs the effect twice against the SAME module-singleton store from `openVaultStore()`, so the first pass closed the live wa-sqlite handle that the second pass then published to `window.__vaultStore`. Every later query (import's `listCategories`/`listTransactions`) failed, producing an uncoded error and the generic import error card.
- Fix: the cancelled effect pass no longer closes the singleton store (the store is owned by the app session, not the effect). Also added `console.error` for the raw import failure so future browser failures are diagnosable from the console.
- Verified end-to-end in real headless Chrome via `scripts/repro-import.mjs`: fresh-profile vault bootstrap (10 categories), `TD_Bank_Realistic_Mock.pdf` upload → 19-row review table, commit → "Import saved", and 19 transactions present in SQLite. Web typecheck, 6 web test files/18 tests, and 3 fixture/parsing files/26 tests pass.

## Work completed this session (2026-08-05)

- Reassessed the PDF strategy against `pdf-report.md`; retained PDF.js text extraction and added coordinate-aware table reconstruction instead of introducing OCR/vision dependencies.
- Configured the supported PDF.js 5.x worker URL for Vite and removed the unsupported `disableWorker` setting. Fixed wa-sqlite statement finalization and serialized first-run category seeding.
- Added TD-style positioned PDF fixture coverage, debit/credit sign handling, table-evidence guards, original merchant preservation, and Buffer normalization for Node PDF.js loopback compatibility.
- Verified the real TD mock PDF in Node and in the browser app parser: 19 rows recognized, `pdf_text_table`, no warnings/errors. Full validation: 20 test files/122 tests, all workspace typechecks, and web production build pass.


- Investigated the user-reported PDF upload behavior: the UI entered parsing but produced no review rows or transactions.
- Identified and fixed the wa-sqlite IndexedDB VFS constructor/module wiring and explicit WASM URL loading; verified the resolved WASM asset returns `application/wasm` and the WebAssembly magic bytes.
- Added concurrent vault-bootstrap deduplication and a clearer local-storage failure screen. Web typecheck, 5 web test files/13 tests, and web build pass.
- Remaining issue: perform a fresh Chrome upload regression with a known text-based PDF fixture and inspect worker/PDF.js errors if parsing still stalls.
- Session closeout: temporary Vite server cleanup was attempted; a stale local listener may remain on ports 5173/5174 and should be checked before the next dev run.

## Work completed this session (2026-08-04)

- Continued the interrupted implementation from the foundation checkpoint.
- Added the relay server/test harness, iOS 16 SwiftUI scaffold and XCTest source, dependency/security docs, and web import accessibility/contract coverage.
- Corrected reviewer findings: transactional local import persistence boundary, duplicate-review blocking, safe AppError handling, in-flight commit guarding, namespaced bounded relay replay tracking, iOS 16 empty-state fallback, and removal of unsafe plaintext mutation placeholders.
- Final JavaScript validation passed: typecheck, 18 Vitest files/114 tests, ESLint, and web build before closeout. The browser was manually tested at `http://localhost:5174/#/import`; vault bootstrap initially failed on WASM delivery, source fixes were applied, but the user still observed parsing not completing, so do not claim PDF E2E success.

## Work completed this session (2026-08-05, continued — US4 categorization and personalization)

- Implemented deterministic, boundary-aware default rules and personal-rule precedence with explainable category provenance, explicit equal-precedence conflict review, evidence-based confidence, and active-category filtering.
- Added durable correction-history records, learned merchant-rule creation/strengthening, category-correction persistence in the atomic import commit, accurate mutation changed-field metadata, and portable-backup schema support.
- Added web import category correction with active-category choices, provenance feedback, remembered-merchant control, Settings rule management/undo, and accessible integration/axe coverage.
- Added correction-history export validation, legacy-backup compatibility with an empty history table, and new-vault reference remapping coverage for categories, transactions, and correction history.
- Added iOS source-level category correction/rule metadata and XCTest scaffolding, but native compilation/UI execution is unavailable on this Windows host; encrypted durable native rule mutations remain part of the later US6 boundary.
- Explicitly left T058 partial: summary records still do not expose category provenance. T055 and T060 remain open until macOS/Xcode validation and native persistence work are available.
- Final validation after closeout fixes: workspace typecheck passed; full Vitest passed (31 files / 155 tests); lint and production build passed; the live Chrome audit passed 22/22 with a clean console. Native validation remains unavailable because this Windows host has no Swift/Xcode toolchain.

## Work completed this session (2026-08-05, continued — US5 local/offline status)

- Added an app-shell `LocalStatus` indicator that reports browser connectivity, vault-scoped mutation-log changes not synchronized, and the explicit “sync not connected” boundary without implying a relay is active.
- Added safe polling with cancellation/cleanup and accessible live status updates; local writes remain usable while offline because the browser vault is local-first.
- Added `apps/web/tests/integration/offline.test.tsx` covering local status, unsynchronized-change counts, and online/offline browser transitions.
- Marked US5 traceability honestly: T065/T066 web portions are complete; T061/T064 are partial because full offline/restart flow coverage and resilient sync integration remain open. T062/T063/T067/T068 remain open.
- Focused validation: web typecheck passed and 4/4 focused web tests passed. Full repository validation and browser audit follow this slice. Native validation remains unavailable on this Windows host.

## Work completed this session (2026-08-05, continued — US5 local privacy operations)

- Added vault-scoped domain privacy operations for deleting retained statement originals, deleting one imported statement’s normalized records, and irreversibly purging one vault locally.
- Imported-record deletion tombstones transactions, clears retained payloads, removes import-review/provenance rows, and preserves learned personal rules. Web Settings supplies encrypted mutation payloads so the local mutation log can carry deletion intent; authenticated remote propagation remains US6.
- Added explicit two-step active-vault deletion acknowledgement and retention controls in web Settings.
- Added domain lifecycle coverage for original retention, versioned deletion tombstones, import metadata cleanup, learned-rule preservation, transaction-mutation rollback, vault-purge rollback, and cross-vault isolation.
- Corrected original-payload deletion to increment the transaction version alongside the mutation’s pre-update `baseVersion`.
- Validation at this historical US5 privacy checkpoint: full typecheck, lint, build, and **33 Vitest files / 162 tests** passed; live Chrome audit **22/22** with clean console/network capture. Native iOS validation remained unavailable on this Windows host.
- US5 still open: full offline/restart integration, native privacy/XCTest execution, shared/domain vault-I/O parity, complete browser backup/restore/clear E2E, and optional static-shell/service-worker work.

## Work completed this session (2026-08-05, continued — US5 offline checkpoint)

- Expanded `apps/web/tests/integration/offline.test.tsx` to cover offline manual entry, edit/category correction, pending status, summary rendering, correction-history persistence, and React remount persistence. At that historical checkpoint, the suite passed 3 tests and the full repository gate passed 35 files / 169 tests.
- Added and validated real-browser coverage: `scripts/audit-offline.mjs` proves local writes/reads and correction while network-disabled; `scripts/audit-restart.mjs` proves the same profile survives separate Chrome processes; `scripts/audit-service-worker.mjs` proves production-preview worker registration, static-shell caching, and offline navigation.
- Implemented the optional production-only static shell in `apps/web/public/sw.js` and registration fallback in `apps/web/src/main.tsx`; it never caches vault/JSON data and the app does not depend on the worker.
- US5 checklist reconciliation: T061, T064, T067, and T068 are checked. T062 remains open for full domain recovery/lock-clear lifecycle coverage. T063 and T065 remain open because iOS is uncompiled here and native clear currently targets the in-memory store/metadata rather than the complete SQLite/Keychain vault. T066 remains open because shared vault-I/O supplies validation/types and web backup behavior, but not complete native/shared encrypted restore parity.
- Focused validation: web typecheck and 3 US5 files / 9 tests pass. Final repository validation and code review remain the next gate. Xcode/xcodebuild/XcodeGen are unavailable on this Windows host.

## Session protocol

At session start: read this file and `knowledge.md`, run `git config core.hooksPath`, `bash scripts/machine-sync.sh`, `git status --short`, and the latest activity log tail.

After substantial work: append a concise Work completed note here and update `knowledge.md`. Never commit secrets, private keys, credentials, `.env` files, or personal statements.
