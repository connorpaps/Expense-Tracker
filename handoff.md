# Expense Tracker — Session Handoff

**Last updated:** 2026-08-05
**Project:** Local-first expense tracker for PC web, native iOS, and free local relay

## Current implementation state

The repository now contains the first implementation slice from `specs/001-local-expense-tracker/tasks.md`:

- Strict TypeScript monorepo tooling and a committed npm lockfile.
- Shared contracts, domain entities, exact minor-unit money/date/summary logic, SQLite schema/repository, import/categorization/sync primitives, and tests.
- Sanitized CSV/PDF fixtures, golden outputs, JSON schemas, reusable golden assertions, parser safety/accuracy tests, web harnesses, and semantic design tokens with iOS emission.
- React/Vite web app shell, local wa-sqlite adapter, worker/in-process parser pipeline, import review UI, transactional import commit path, duplicate-review blocking, and accessibility tests.
- Node local relay scaffold with health endpoint, WebSocket loopback, namespaced bounded replay store, deterministic clock/envelope helpers, and 10 relay tests.
- iOS 16 SwiftUI/XcodeGen target with native tab/navigation surfaces, manual entry/detail/delete UI, overview, settings/privacy status, native document-picker import review, cancellable CSV/PDF parser, Keychain/SQLite persistence sources, and XCTest fixture/persistence/import coverage.
- `docs/dependency-matrix.md` and `docs/security-model.md` document the $0 architecture, dependency/license boundaries, and threat model.

## Validation completed

- `npm run typecheck`: passes for relay, web, and all TypeScript packages.
- Focused validation after the Phase 1–3 continuation: TypeScript typecheck, ESLint, domain/fixtures/parsing/web suites, and the added Node-environment PDF contract suite pass; final full-suite count is recorded after the last rerun.
- `npm run build`: web production build passes and emits the parser worker and wa-sqlite WASM assets.
- Relay typecheck and all 10 relay tests pass after the BufferSource and replay-store fixes.
- Focused web/domain/relay tests pass after transactional import persistence, duplicate pending decisions, and accessibility semantics fixes.
- `npm run lint` passes with vendored skills, docs, specs, iOS, and scripts excluded from the TypeScript application lint scope.
- Swift/Xcode/xcodebuild/XcodeGen are unavailable on this Windows/MSYS machine, so the native target is source-reviewed but not compiled or XCTest-validated here.

## Important limitations (do not overclaim)

- The web import commit is wired to the domain transaction/repository boundary. Fresh Chrome now opens the vault and loads the bundled PDF.js worker without runtime/network errors. The real `TD_Bank_Realistic_Mock.pdf` was parsed through the browser app's exact `parseFileInProcess` path into 19 recognized rows using coordinate-aware extraction. Headless CDP's `DOM.setFileInputFiles` does not expose the selected file through `input.files` reliably, so that automation limitation is not treated as a full chooser/UI E2E assertion.
- The relay is development scaffolding, not a production security boundary: full authenticated pairing, TLS/certificate setup, vault/device authorization, snapshot signing, key storage/rotation, and complete mutation exchange remain US6 work.
- iOS now includes source-level Keychain and encrypted SQLite adapters plus a native pending/import flow; these remain uncompiled and therefore not runtime-validated until Xcode is available.
- Native iOS document picking, cancellable CSV/PDF parsing, review decisions, and local commit behavior are implemented in source and XCTest targets; native parity is not runtime-tested on this machine.
- iOS export/clear-local-data controls are labeled surfaces awaiting the production encrypted vault I/O implementation.
- The web worker has progress/error behavior; PDF contract coverage runs in a Node-environment web test because PDF.js cannot be exercised reliably under jsdom. Browser PDF.js worker loading and the real TD parser path are verified in Chrome; a real browser chooser/UI regression should still be added when a file-upload-capable E2E harness is available.
- XcodeGen project generation and iOS 16 destination validation must be run on macOS with Xcode before any native release claim.

## Task traceability

Phase 1–3 task lines T001–T037 are checked in `tasks.md`. TypeScript behavior is validated locally; native iOS sources and XCTest targets are complete enough for macOS validation but remain uncompiled on this Windows host. Native runtime validation, real bundled-fixture execution, and production encrypted mutation-log wiring remain explicitly platform/deployment gates rather than claimed here.

## Next priorities

1. On macOS, generate/build `apps/ios/project.yml`, run iOS 16 XCTest, and validate Keychain/SQLite restart and bundled-fixture parity behavior.
2. Finish browser vault bootstrap/category seeding and add a real browser-runtime DB-backed web import commit integration test.
3. Add encrypted mutation-envelope creation to the native import adapter before enabling native mutation-log sync.
4. Implement authenticated relay pairing, secure transport, snapshot/bootstrap, durable iOS queue, and conflict review before claiming phone-away/PC-later sync.
5. Add US2 manual-entry web persistence tests, US3 dashboard/query integration, US4 personal rules, and US5 encrypted export/clear-local-data lifecycle.

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

## Session protocol

At session start: read this file and `knowledge.md`, run `git config core.hooksPath`, `bash scripts/machine-sync.sh`, `git status --short`, and the latest activity log tail.

After substantial work: append a concise Work completed note here and update `knowledge.md`. Never commit secrets, private keys, credentials, `.env` files, or personal statements.
