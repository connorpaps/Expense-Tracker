# Tasks: Local Expense Tracker

**Input**: Design documents from `/specs/001-local-expense-tracker/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/api.md`, `contracts/design-system.md`, and `quickstart.md`

**Tests**: Test tasks are included because the specification and constitution require automated coverage for parser behavior, persistence, synchronization, accessibility, security, and performance.

**Architecture constraint**: The required path is a $0 local-first setup. The PC runs the local web app and optional relay/companion; the iOS app owns a local encrypted vault and durable pending mutation queue. No hosted database, hosted sync tier, paid API, cloud credential, App Store publication, or TestFlight is required.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish the multi-app workspace, free toolchain, shared fixtures, and platform targets.

- [X] T001 Create the repository workspace monorepo structure from `specs/001-local-expense-tracker/plan.md` in `package.json`, `apps/web/`, `apps/relay/`, `apps/ios/`, `packages/`, and `tests/`.
- [X] T002 [P] Initialize the React/TypeScript/Vite web workspace in `apps/web/package.json`, `apps/web/tsconfig.json`, `apps/web/vite.config.ts`, and `apps/web/src/main.tsx`.
- [X] T003 [P] Initialize the Node.js/TypeScript local relay workspace in `apps/relay/package.json`, `apps/relay/tsconfig.json`, and `apps/relay/src/main.ts` without adding a hosted-service dependency.
- [X] T004 [P] Create the native SwiftUI iOS 16 project and test target under `apps/ios/ExpenseTracker/` and `apps/ios/ExpenseTrackerTests/`, with iOS 16 as the deployment floor.
- [X] T005 [P] Create shared fixture, contract, and design-token directories under `packages/fixtures/`, `packages/contracts/`, and `packages/design-tokens/` with versioned README files.
- [X] T006 Configure repository-wide formatting, linting, strict TypeScript checking, unit-test commands, fixture-test commands, and build scripts in the root `package.json` and tool configuration files.
- [X] T007 Select and pin the browser SQLite/WASM store, iOS 16 SQLite wrapper, browser/iOS cryptography adapters, and local transport libraries in `package.json`, `apps/ios/ExpenseTracker/Package.swift` or the Xcode package configuration, and `docs/dependency-matrix.md`; verify licenses, free local use, browser support, and iOS 16 compatibility, and reject any dependency that requires a paid account or hosted tier.
- [X] T008 [P] Create the initial semantic web/iOS design-token source files and token tests in `packages/design-tokens/src/` and `packages/design-tokens/tests/` from `contracts/design-system.md`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Implement the shared domain, local vault boundaries, cryptographic interfaces, fixture contracts, and test harnesses required before any user story.

**CRITICAL**: No user story implementation begins until this phase is complete and its checkpoint passes.

- [X] T009 Define shared TypeScript domain entities and enums for `LocalVault`, `PairedDevice`, `Transaction`, `StatementImport`, `ImportRowReview`, `Category`, `CategorizationRule`, `MutationLogEntry`, `ConflictRecord`, and `DemoDataset` in `packages/domain/src/entities/`.
- [X] T010 [P] Implement exact minor-unit money arithmetic, currency validation, locale-aware date handling, period boundaries, and summary primitives in `packages/domain/src/money/`, `packages/domain/src/periods/`, and `packages/domain/src/summaries/`.
- [X] T011 Write schema/scoping/tombstone/index boundary tests first, then implement the local vault schema, migrations, vault scoping, tombstones, indexes, and transaction constraints in `packages/domain/src/storage/`, `packages/contracts/src/storage/`, and `packages/domain/tests/storage.test.ts`.
- [X] T012 Write lock/reopen, key-version, wrapped-key, recovery, key-rotation, and signature-verification tests first, then implement platform-neutral vault encryption, key-version, wrapped-device-key, recovery-export, and authenticated snapshot-signing interfaces in `packages/contracts/src/security/` using an explicitly documented interoperable design (AES-256-GCM payload encryption, HKDF-SHA-256 key derivation, authenticated P-256 ECDH device wrapping, and P-256 ECDSA snapshot signatures unless compatibility tests require an approved equivalent); document browser threat-model limits, iOS CryptoKit/Keychain expectations, key rotation, signing-key storage/rotation, and recovery behavior in `docs/security-model.md` and `packages/domain/tests/security.test.ts`.
- [X] T013 Write mutation-idempotency, retry, durable-queue, tombstone, conflict, and compaction-checkpoint tests first, then implement the append-only mutation-log model, Lamport/vector-clock metadata, idempotency index, retry states, durable offline queue states, exactly-once application guard, and compaction checkpoint rules in `packages/domain/src/sync/` and `packages/domain/tests/sync-log.test.ts`.
- [X] T014 [P] Define versioned JSON schemas for shared parser, normalized transaction, summary, mutation, snapshot, error, and conflict fixtures in `packages/contracts/src/` and `packages/fixtures/schemas/`.
- [X] T015 [P] Implement shared import, pairing, snapshot-bootstrap, mutation-exchange, conflict, and UI-state contract types in `packages/contracts/src/api/` and `packages/contracts/src/sync/` from `contracts/api.md`.
- [X] T016 [P] Implement stable error codes, safe user-facing messages, retryability, and entity/field/row references in `packages/contracts/src/errors/`.
- [X] T017 Implement a local SQLite-compatible web vault adapter with migrations and vault isolation in `apps/web/src/local/`.
- [X] T018 Implement the iOS 16 SQLite/local-vault adapter with Keychain-backed key access in `apps/ios/ExpenseTracker/Persistence/` and `apps/ios/ExpenseTracker/Domain/`.
- [X] T019 [P] Build the shared TypeScript fixture runner and golden-output assertions for vault schema/scoping, encryption lock/reopen boundaries, key-version handling, mutation idempotency, tombstones, compaction checkpoints, and financial outputs in `packages/fixtures/tests/` and `packages/domain/tests/`.
- [X] T020 [P] Build the Swift XCTest fixture loader and normalized-output assertions in `apps/ios/ExpenseTrackerTests/Fixtures/`.
- [X] T021 Create sanitized CSV, text-PDF, malformed-input, duplicate, conflict, phone-away, and 10,000-transaction fixtures in `packages/fixtures/statements/`, `packages/fixtures/expected/`, and `packages/fixtures/sync/`.
- [X] T022 [P] Create web accessibility, browser integration, and performance-test harness configuration in `apps/web/tests/`.
- [X] T023 [P] Create relay integration-test harness, deterministic clock utilities, AES-GCM/ECDH encrypted-envelope helpers, replay/idempotency assertions, and test-only local transport in `apps/relay/tests/`.
- [X] T024 Create iOS accessibility, persistence, CryptoKit/Keychain lock-reopen, key-rotation, sync, and iOS 16 destination test configuration in `apps/ios/ExpenseTrackerTests/`.

**Checkpoint**: Shared domain contracts, vault schema, crypto interfaces, fixtures, and test harnesses are available to all user-story phases; no hosted backend is required.

---

## Phase 3: User Story 1 - Import and review a bank statement (Priority: P1) 🎯 MVP

**Goal**: Import CSV and text-based PDF statements on web and iOS, normalize rows, explain diagnostics and category suggestions, and commit only after review.

**Independent Test**: Upload one supported CSV and one supported text-PDF fixture from web and iOS, verify matching normalized rows and diagnostics, review duplicate/category states, commit accepted rows, and confirm excluded or unresolved rows are not silently saved.

### Tests for User Story 1

- [X] T025 [P] [US1] Add web contract tests for CSV/PDF import states, normalized rows, diagnostics, duplicate candidates, and commit decisions in `apps/web/tests/import-contract.test.ts` and `apps/web/tests/pdf-contract.test.ts`.
- [X] T026 [P] [US1] Add iOS XCTest coverage for shared CSV/PDF fixture parity, parser limits, cancellation, and unsupported-file states in `apps/ios/ExpenseTrackerTests/Import/ImportContractTests.swift` and `apps/ios/ExpenseTrackerTests/Import/NativeImportTests.swift`.
- [X] T027 [P] [US1] Add parser accuracy and malformed-input fixtures asserting the 95% valid-row extraction target in `packages/parsing/tests/accuracy.test.ts`.

### Implementation for User Story 1

- [X] T028 [P] [US1] Implement CSV column detection, quoted-field handling, date/sign normalization, and row diagnostics in `packages/parsing/src/csv/`.
- [X] T029 [P] [US1] Implement text-PDF extraction, page/text limits, column reconstruction, cancellation, and unsupported encrypted/image-only states in `packages/parsing/src/pdf/`.
- [X] T030 [US1] Implement shared merchant normalization, amount/currency normalization, bank-profile adapters, source preservation, and diagnostic mapping in `packages/parsing/src/normalization/`.
- [X] T031 [US1] Implement duplicate fingerprints and candidate matching within an import and against the active vault in `packages/domain/src/imports/duplicates.ts`.
- [X] T032 [US1] Implement the web worker parser pipeline, progress reporting, cancellation, and import-session state in `apps/web/src/workers/` and `apps/web/src/features/imports/`.
- [X] T033 [US1] Build the web import review table with row diagnostics, category provenance, confidence, duplicate decisions, edit/exclude controls, and accessible loading/error states in `apps/web/src/features/imports/`.
- [X] T034 [US1] Implement cancellable iOS background parsing and the native import-review flow using the shared normalized contract in `apps/ios/ExpenseTracker/Features/Imports/` and `apps/ios/ExpenseTracker/Domain/`.
- [X] T035 [US1] Implement explicit import commit, exclusion, cancellation, source-retention, and mutation-log behavior in `packages/domain/src/imports/commit.ts` and the web/iOS adapters. Encrypted mutation-log append is conditional on a real ciphertext envelope; no plaintext placeholder is written.
- [X] T036 [US1] Add supported-bank fixture profiles for American Express, Apple Card, Chase, Capital One, and US Bank examples in `packages/parsing/src/profiles/` and `packages/fixtures/statements/`.
- [X] T037 [US1] Add import-review responsive, keyboard, VoiceOver, Dynamic Type, and parser-progress UI validation in `apps/web/tests/accessibility.test.tsx`, `apps/web/tests/harness.ts`, and `apps/ios/ExpenseTrackerTests/Import/ImportAccessibilityTests.swift`.

**Checkpoint**: US1 works independently on web and iOS with identical normalized output and no silent row loss.

---

## Phase 4: User Story 2 - Add and edit an expense manually (Priority: P1)

**Goal**: Let users create, view, edit, validate, and delete manual expenses on either client while preserving local mutation semantics.

**Independent Test**: Create a valid expense on web and iOS, verify required-field validation, edit amount/date/merchant/category/note, delete only after confirmation, and confirm history and summaries reflect each change.

### Tests for User Story 2

- [ ] T038 [P] [US2] Add web integration tests for manual creation, validation, editing, deletion confirmation, and local-save feedback in `apps/web/tests/integration/manual-entry.test.ts`.
- [ ] T039 [P] [US2] Add iOS XCTest/UI tests for manual entry, validation, edit, delete confirmation, Dynamic Type, and local-save feedback in `apps/ios/ExpenseTrackerTests/Features/ManualEntryTests.swift`.

### Implementation for User Story 2

- [ ] T040 [P] [US2] Implement transaction validation and mutation creation for required date, merchant, amount, category, currency, and optional note fields in `packages/domain/src/transactions/`.
- [ ] T041 [US2] Build the web manual-entry form, transaction detail/edit view, delete confirmation, and saved-local feedback in `apps/web/src/features/transactions/`.
- [ ] T042 [US2] Build the native iOS manual-entry sheet, transaction detail/edit view, delete confirmation, and saved-local feedback in `apps/ios/ExpenseTracker/Features/ManualEntry/` and `apps/ios/ExpenseTracker/Features/Transactions/`.
- [ ] T043 [US2] Connect web and iOS transaction forms to their local vault adapters and append-only mutation log in `apps/web/src/local/` and `apps/ios/ExpenseTracker/Persistence/`.
- [ ] T044 [US2] Add shared validation/error fixtures and ensure invalid manual mutations never enter the durable queue in `packages/domain/tests/transactions.test.ts`.

**Checkpoint**: US2 provides complete manual entry and editing independently of imports, summaries, or synchronization.

---

## Phase 5: User Story 3 - Understand spending over time (Priority: P1)

**Goal**: Provide correct weekly, monthly, custom-range, category, and search summaries on web and iOS.

**Independent Test**: Load the multi-period fixture, select weekly/monthly/custom ranges and filters, and verify totals, credits, net activity, category breakdowns, counts, and visible records against golden calculations.

### Tests for User Story 3

- [ ] T045 [P] [US3] Add summary-engine unit tests for weekly, monthly, custom-range, currency, credits/refunds, transfers, empty periods, and category totals in `packages/domain/tests/summaries.test.ts`.
- [ ] T046 [P] [US3] Add web dashboard/filter integration and accessibility tests in `apps/web/tests/integration/dashboard.test.ts` and `apps/web/tests/accessibility/dashboard.test.ts`.
- [ ] T047 [P] [US3] Add iOS overview/filter XCTest coverage for iOS 16 layouts and summary parity in `apps/ios/ExpenseTrackerTests/Features/OverviewTests.swift`.

### Implementation for User Story 3

- [ ] T048 [US3] Implement indexed summary queries, period selection, exact arithmetic, and recalculable category breakdowns in `packages/domain/src/summaries/` and local adapters.
- [ ] T049 [US3] Build the web overview dashboard with total spend, credits, net activity, counts, category visualization, empty states, and accessible data alternatives in `apps/web/src/features/dashboard/`.
- [ ] T050 [US3] Build the native iOS overview with summary cards, trend/category views, empty states, Dynamic Type, and VoiceOver labels in `apps/ios/ExpenseTracker/Features/Overview/`.
- [ ] T051 [US3] Implement transaction search, date/category filters, sorting, filter reset, and synchronized filter semantics in `apps/web/src/features/transactions/`, `apps/ios/ExpenseTracker/Features/Transactions/`, and `packages/domain/src/queries/`.
- [ ] T052 [US3] Benchmark 10,000-transaction period/filter queries and add measured performance assertions in `packages/domain/tests/performance.test.ts` and `apps/web/tests/performance/summary-performance.test.ts`.

**Checkpoint**: US3 provides independently verifiable financial summaries and filters without requiring sync or hosted services.

---

## Phase 6: User Story 4 - Correct categories and improve future categorization (Priority: P1)

**Goal**: Apply explainable defaults, learn from explicit corrections, and let users manage personal rules.

**Independent Test**: Import a merchant with an incorrect suggestion, correct and optionally save a personal rule, import the merchant again, and verify the learned category/provenance or review state for conflicting context.

### Tests for User Story 4

- [ ] T053 [P] [US4] Add categorization precedence, confidence, correction-history, conflict-context, and 90% learned-rule fixture tests in `packages/domain/tests/categorization.test.ts`.
- [ ] T054 [P] [US4] Add web category-correction and rule-management integration/accessibility tests in `apps/web/tests/integration/categorization.test.ts`.
- [ ] T055 [P] [US4] Add iOS category-correction and rule-management XCTest coverage in `apps/ios/ExpenseTrackerTests/Features/CategorizationTests.swift`.

### Implementation for User Story 4

- [ ] T056 [US4] Implement deterministic default keyword/pattern rules, merchant normalization matching, specificity precedence, and explainable confidence in `packages/domain/src/categorization/`.
- [ ] T057 [US4] Implement personal merchant/pattern rules, evidence counts, explicit save/disable/remove behavior, and correction history in `packages/domain/src/categorization/personal-rules.ts`.
- [ ] T058 [US4] Add category provenance and review explanations to import rows, transaction details, and summary records in `packages/contracts/src/categorization/` and client features.
- [ ] T059 [US4] Build web category correction controls, personalization settings, rule editing, undo, and accessible feedback in `apps/web/src/features/categorization/` and `apps/web/src/features/settings/`.
- [ ] T060 [US4] Build native iOS category correction controls, personalization settings, rule editing, undo, and native feedback in `apps/ios/ExpenseTracker/Features/Categorization/` and `apps/ios/ExpenseTracker/Features/Settings/`.

**Checkpoint**: US4 learns only from explicit user-confirmed behavior and keeps conflicting context reviewable.

---

## Phase 7: User Story 5 - Use the app privately while offline (Priority: P1)

**Goal**: Keep the web experience usable offline, explain privacy/storage behavior, and provide safe export, import, clearing, and retention controls.

**Independent Test**: Disable networking after initial setup, perform core web actions, restart the app, inspect privacy information, export/import a vault, and clear local data with explicit confirmation.

### Tests for User Story 5

- [ ] T061 [P] [US5] Add web offline/restart integration tests for manual entry, editing, summaries, category correction, pending status, and no-network operation in `apps/web/tests/integration/offline.test.ts`.
- [ ] T062 [P] [US5] Add vault encryption, locked/reopened, clear-local-data, recovery-export, and retained-source lifecycle tests in `packages/domain/tests/privacy-lifecycle.test.ts`.
- [ ] T063 [P] [US5] Add iOS local persistence, Keychain key protection, offline mutation, and privacy-settings XCTest coverage in `apps/ios/ExpenseTrackerTests/Privacy/PrivacyLifecycleTests.swift`.

### Implementation for User Story 5

- [ ] T064 [US5] Implement web offline bootstrap, local status detection, pending mutation indicators, and resilient local reads/writes in `apps/web/src/app/`, `apps/web/src/local/`, and `apps/web/src/features/sync/`.
- [ ] T065 [US5] Implement privacy/settings surfaces explaining local vaults, relay synchronization, statement retention, export/import, deletion, and the absence of a required cloud account in `apps/web/src/features/settings/` and `apps/ios/ExpenseTracker/Features/Settings/`.
- [ ] T066 [US5] Implement encrypted versioned vault export/import with preview, checksum/version validation, merge confirmation, and recoverable failure states in `packages/domain/src/vault-io/`.
- [ ] T067 [US5] Implement explicit clear-local-data, vault deletion, statement-original retention/deletion, learned-rule retention, and tombstone behavior in `packages/domain/src/privacy/`.
- [ ] T068 [US5] Add web service-worker/static-shell behavior only as an optional local usability enhancement; ensure core functionality never depends on hosted assets or a service worker in `apps/web/public/` and `apps/web/src/`.

**Checkpoint**: US5 works entirely locally and communicates clearly when data is saved locally but not synchronized.

---

## Phase 8: User Story 6 - Continue on iPhone and keep data synchronized (Priority: P2)

**Goal**: Pair iOS with the PC web app/relay, queue expenses while away, and synchronize the backlog exactly once when both return to a foreground connected session.

**Independent Test**: Pair an iPhone X-class iOS 16 device with the PC, disconnect the phone from the PC network, create two expenses, force-close/reopen iOS, reconnect to the PC network, open iOS and the PC web app/relay in the foreground, drain the batch, and verify each expense appears exactly once on the PC with updated summaries.

### Tests for User Story 6

- [ ] T069 [P] [US6] Add pairing contract tests for short-lived codes, device confirmation, public-key exchange, wrapped vault keys, revocation, and replay rejection in `apps/relay/tests/pairing/pairing-contract.test.ts`.
- [ ] T070 [P] [US6] Add encrypted snapshot/bootstrap contract tests for manifest validation, chunk resume, checksum/version validation, explicit merge preview, and failure recovery in `apps/relay/tests/sync/bootstrap-contract.test.ts`.
- [ ] T071 [P] [US6] Add offline queue/restart/idempotent batch tests for phone-away/PC-later behavior in `apps/relay/tests/sync/phone-away.test.ts`, `apps/web/tests/integration/phone-away.test.ts`, and `apps/ios/ExpenseTrackerTests/Sync/PhoneAwayTests.swift`.
- [ ] T072 [P] [US6] Add concurrent mutation/conflict tests for amount, date, merchant, category, deletes, rule updates, and safe retry behavior in `packages/domain/tests/sync-conflicts.test.ts`.
- [ ] T073 [P] [US6] Add iOS Local Network permission, foreground reconnect, disconnected-state, and pending-count UI tests in `apps/ios/ExpenseTrackerTests/Sync/SyncStatusTests.swift`.

### Implementation for User Story 6

- [ ] T074 [US6] Implement local relay discovery, authenticated secure endpoint setup, Local Network permission guidance, pairing-code lifecycle, and device registry in `apps/relay/src/pairing/`, `apps/relay/src/transport/`, and `apps/ios/ExpenseTracker/Networking/`.
- [ ] T075 [US6] Implement device public-key exchange, device-specific wrapped vault-key delivery, P-256 ECDSA signing-key storage and rotation, key-version rotation, revocation, and protected private-key storage adapters in `apps/relay/src/pairing/`, `apps/web/src/local/security/`, and `apps/ios/ExpenseTracker/Networking/Security/`.
- [ ] T076 [US6] Implement authenticated versioned snapshot creation with P-256 ECDSA signing and verification, encrypted chunk transport, resumable bootstrap, explicit merge preview, and post-checkpoint mutation catch-up in `apps/relay/src/vault-io/`, `apps/web/src/features/sync/`, and `apps/ios/ExpenseTracker/Features/Sync/`; reject unsigned, invalid, stale, or wrong-vault snapshots.
- [ ] T077 [US6] Implement the relay's encrypted append/exchange batch protocol, known-clock queries, batch IDs, replay rejection, retry/backoff, and opaque-envelope storage in `apps/relay/src/mutation-log/` and `apps/relay/src/transport/`.
- [ ] T078 [US6] Implement the iOS durable pending mutation queue, restart recovery, pending count/oldest timestamp, foreground reconnect, batch upload, and `saved_local`/`pending_sync`/`synced`/`disconnected` states in `apps/ios/ExpenseTracker/Features/Sync/` and `apps/ios/ExpenseTracker/Persistence/`.
- [ ] T079 [US6] Implement PC web mutation ingestion, idempotent application, derived-summary refresh, acknowledgement, and exactly-once transaction history updates in `apps/web/src/features/sync/`, `apps/web/src/local/`, and `packages/domain/src/sync/`.
- [ ] T080 [US6] Implement field-aware conflict detection, conflict candidate encryption, conflict review UI, keep-local/keep-remote/manual/keep-both resolution, and resolution mutations in `packages/domain/src/sync/`, `apps/web/src/features/sync/`, and `apps/ios/ExpenseTracker/Features/Sync/`.
- [ ] T081 [US6] Add synchronized status surfaces, reconnect actions, pending backlog details, failed retry controls, forget-device flow, clear-local-data flow, and plain-language remote-sync limitation messaging in `apps/web/src/features/sync/`, `apps/ios/ExpenseTracker/Features/Sync/`, and `apps/ios/ExpenseTracker/Features/Settings/`.

**Checkpoint**: US6 proves the requested phone-away/PC-later flow without a hosted service, including restart persistence, foreground reconnect, encrypted batch exchange, exactly-once application, and visible conflicts.

---

## Phase 9: User Story 7 - Share the product without sharing private finances (Priority: P3)

**Goal**: Support clearly separated personal/demo vaults and safe explicit export/import for a friend without exposing the original vault.

**Independent Test**: Create two vaults, verify strict data/rule/settings isolation, enable demo data, export one vault, and import it only through explicit user confirmation.

### Tests for User Story 7

- [ ] T082 [P] [US7] Add two-vault isolation and unauthorized-envelope rejection tests in `packages/domain/tests/vault-isolation.test.ts` and `apps/relay/tests/pairing/vault-isolation.test.ts`.
- [ ] T083 [P] [US7] Add demo-mode labeling, sample-data separation, export/import, and deletion-scope tests in `apps/web/tests/integration/demo-privacy.test.ts` and `apps/ios/ExpenseTrackerTests/Privacy/DemoPrivacyTests.swift`.

### Implementation for User Story 7

- [ ] T084 [US7] Implement vault switching/creation labels, demo-mode boundaries, and prevention of cross-vault queries in `packages/domain/src/vaults/` and both local adapters.
- [ ] T085 [US7] Build clearly labeled web demo mode with sanitized sample data, truthful metrics, and no access to personal vault records in `apps/web/src/features/demo/`.
- [ ] T086 [US7] Build explicit friend export/import flow with encrypted backup selection, preview, merge/copy confirmation, and source-vault protection in `apps/web/src/features/settings/` and `apps/ios/ExpenseTracker/Features/Settings/`.
- [ ] T087 [US7] Implement deletion/export explanations for statements, transactions, rules, vaults, and retained mutation metadata in both clients and `packages/domain/src/privacy/`.

**Checkpoint**: US7 demonstrates the product safely without exposing or mixing private financial records.

---

## Phase 10: Polish & Cross-Cutting Concerns

**Purpose**: Apply the design system, accessibility, performance, security, documentation, and clean-machine validation gates across all completed stories.

- [ ] T088 [P] Apply the semantic design-token contract, typography, spacing, visual hierarchy, category color semantics, responsive breakpoints, empty/loading/error states, and reduced-motion behavior across `apps/web/src/styles/`, `apps/web/src/components/`, and `packages/design-tokens/`.
- [ ] T089 [P] Apply native iOS HIG, Dynamic Type, VoiceOver, Dark Mode, safe areas, touch targets, haptics, and iOS 16 availability fallbacks across `apps/ios/ExpenseTracker/DesignSystem/` and feature views.
- [ ] T090 [P] Run web keyboard-navigation, focus, WCAG AA contrast, screen-reader, responsive, and automated accessibility checks in `apps/web/tests/accessibility/`.
- [ ] T091 [P] Run parser accuracy, summary, mutation-log, pairing, encryption-boundary, phone-away, conflict, and 10,000-transaction performance suites; record results in `docs/validation/`.
- [ ] T092 [P] Review browser/iOS threat-model disclosures, secure transport, key lifecycle, revocation limits, retained data, recovery warnings, and no-hosted-service claims in `docs/security-model.md` and client privacy screens.
- [ ] T093 Update `specs/001-local-expense-tracker/quickstart.md`, root setup documentation, relay startup instructions, iOS free-sideload instructions, and known same-network/foreground-sync limitations in `docs/quickstart.md`.
- [ ] T094 Run the complete clean-machine $0 rehearsal: PC web startup, local relay startup, vault creation, iOS free sideload, pairing, iOS expense creation while away, app restart, PC-network return, foreground reconnect, exactly-once batch sync, import parity, and conflict review; record results in `docs/validation/clean-machine.md`.
- [ ] T095 Run final lint, typecheck, unit tests, fixture tests, browser tests, accessibility tests, relay integration tests, and iOS 16 XCTest/build validation; resolve all failures before implementation handoff.
- [ ] T096 Review task completion against `specs/001-local-expense-tracker/spec.md`, `plan.md`, `contracts/api.md`, `contracts/design-system.md`, and the constitution; update `docs/validation/traceability.md` with FR/SC-to-test mappings.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No feature dependencies; T001 establishes the workspace and T002–T008 can proceed in parallel where their files do not overlap.
- **Foundational (Phase 2)**: Depends on T001–T008; blocks all user-story work. T009–T024 establish domain, storage, crypto boundaries, fixtures, and test harnesses.
- **User Story phases**: Depend on the Phase 2 checkpoint. The P1 stories can proceed in parallel after their shared prerequisites, but each story's own checkpoint must pass before relying on it elsewhere.
- **Polish (Phase 10)**: Depends on all desired stories; T094–T096 are final release gates.

### User Story Dependencies

- **US1 Import (P1)**: Starts after Phase 2; provides import records and normalized transactions used by US3 and US4.
- **US2 Manual Entry (P1)**: Starts after Phase 2; can proceed independently and provides the simplest transaction path for US3 and US6.
- **US3 Summaries (P1)**: Starts after Phase 2, but requires transaction persistence from US1 or US2 for realistic end-to-end validation; summary engine tasks can begin immediately.
- **US4 Categorization (P1)**: Starts after Phase 2; integrates with US1 import review and US2 transaction editing.
- **US5 Offline Privacy (P1)**: Starts after Phase 2; requires the local vault interfaces and integrates with US2 and US3.
- **US6 Sync (P2)**: Starts after Phase 2; requires local transaction/mutation behavior from US2 and local vault/security interfaces. Its phone-away/PC-later acceptance test depends on the US2 local manual-entry path.
- **US7 Demo/Isolation (P3)**: Starts after Phase 2; relies on vault/export interfaces from US5 and can be completed after the core P1/P2 flows.

### Within Each User Story

- Tests are created before implementation where practical and must verify observable behavior.
- Domain models/contracts precede adapters and UI.
- Local persistence precedes synchronization and derived projections.
- Core implementation precedes integration and accessibility polish.
- A story checkpoint must pass before calling it independently complete.

### Parallel Opportunities

- Setup: T002, T003, T004, T005, and T008 can run in parallel after T001.
- Foundation: T010, T014, T015, T016, T019, T020, T022, T023, and T024 can run in parallel after their required directories exist.
- P1 stories: initial test and domain tasks for US1–US5 can be staffed in parallel after the foundational checkpoint.
- US6: pairing, bootstrap contract tests, offline-queue tests, and conflict tests can be developed in parallel before their integrations converge.
- US7: isolation tests and demo-privacy tests can run in parallel with other story work once export/vault contracts are stable.
- Polish: T088–T092 can run in parallel; T093–T096 follow the integrated validation build.

---

## Parallel Example: Phone-Away / PC-Later Synchronization

```text
# After Phase 2, these can begin in parallel:
Task T069: Pairing contract tests in apps/relay/tests/pairing/pairing-contract.test.ts
Task T070: Snapshot bootstrap tests in apps/relay/tests/sync/bootstrap-contract.test.ts
Task T071: Phone-away queue/restart tests across relay/web/iOS
Task T072: Concurrent mutation/conflict tests in packages/domain/tests/sync-conflicts.test.ts

# Then implement the connected flow in dependency order:
Task T074: Local discovery and pairing transport
Task T075: Wrapped vault-key exchange and key lifecycle
Task T076: Encrypted snapshot bootstrap
Task T077: Relay batch mutation exchange
Task T078: iOS durable pending queue and reconnect
Task T079: PC idempotent mutation application and summary refresh
Task T080: Conflict detection and resolution
Task T081: Status and recovery UI
```

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup.
2. Complete Phase 2: Foundational checkpoint.
3. Complete Phase 3: User Story 1 import/review.
4. Stop and validate CSV/PDF fixtures, diagnostics, duplicate review, and commit behavior independently.
5. Demonstrate the local web import experience before expanding into manual entry, summaries, learning, privacy, and synchronization.

### Recommended usable personal milestone

After the MVP, implement US2 + US3 + US5 before US6. This produces a useful offline PC tracker with manual entry and accurate summaries before adding cross-device pairing.

### Incremental delivery

1. Setup + Foundation → runnable local shell, contracts, vault, and fixtures.
2. US1 → statement import/review MVP.
3. US2 → manual entry/edit/delete.
4. US3 → dashboard and time-based summaries.
5. US4 → correction-driven categorization.
6. US5 → offline privacy/export lifecycle.
7. US6 → iOS pairing and phone-away/PC-later synchronization.
8. US7 → safe demo/friend vault separation.
9. Polish → design, accessibility, security, performance, and clean-machine $0 validation.

### Parallel Team Strategy

With multiple developers:

1. Complete Phase 1 together and divide foundational tasks by package/platform.
2. Complete Phase 2 checkpoint together because domain, crypto, and contract compatibility are shared.
3. Assign one owner each to import, manual entry/summaries, categorization/privacy, and sync/iOS.
4. Integrate at story checkpoints and run the cross-client fixture and sync suites before Phase 10.

## Traceability Summary

- **US1 / FR-004–FR-010, FR-033**: T025–T037.
- **US2 / FR-003, FR-013, FR-018–FR-019, FR-028**: T038–T044.
- **US3 / FR-017–FR-018, SC-004**: T045–T052.
- **US4 / FR-011–FR-016, SC-005**: T053–T060.
- **US5 / FR-020, FR-022, FR-023A–FR-023B, FR-029–FR-032**: T061–T068.
- **US6 / FR-021, FR-021A, FR-022–FR-025, FR-027–FR-028, FR-036–FR-037, SC-007–SC-010, SC-014–SC-016**: T069–T081.
- **US7 / FR-002, FR-019, FR-030–FR-031, SC-011–SC-012**: T082–T087.
- **Cross-cutting / FR-001, FR-026, FR-034–FR-035, SC-001–SC-006, SC-009, SC-013**: T001–T008 and T088–T096.

## Notes

- Every implementation task uses the required checklist format: checkbox, sequential ID, optional `[P]`, required story label in user-story phases, and an explicit file path.
- No task assumes Supabase, PowerSync, hosted authentication, hosted storage, paid AI, paid parsing, App Store publication, or TestFlight.
- The optional static demo host cannot replace the PC local web app/relay required for the phone-away/PC-later workflow.
