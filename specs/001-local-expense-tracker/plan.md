# Implementation Plan: Local Expense Tracker

**Branch**: `001-local-expense-tracker` | **Date**: 2026-08-04 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/001-local-expense-tracker/spec.md`

## Summary

Build a polished, local-first expense tracker with a React/TypeScript web client and a native SwiftUI iOS client supporting iOS 16 and newer. Both clients share a normalized financial domain and synchronize local vaults through a free local-network or user-controlled relay using an append-only mutation log. The web client handles CSV and text-extractable PDF imports in a worker-backed review pipeline; both clients support manual entry, summaries, category corrections, learned personal rules, offline edits, and visible sync/conflict states. No paid hosted service, cloud credential, or App Store membership is required for core operation.

The implementation should feel visually distinctive without sacrificing financial clarity: an expressive but restrained web operate-mode design system, native iOS HIG surfaces, accessible data visualizations, and purposeful motion. The first release excludes live bank connections, shared household ledgers, investment tracking, tax preparation, and a standalone desktop GUI.

## Technical Context

**Language/Version**: TypeScript 5.x / Node.js LTS for web, parsing, shared domain, and sync tooling; Swift 5.7+ compatible with an iOS 16 deployment target

**Primary Dependencies**: React, Vite, SQLite-compatible local storage, a permissively licensed append-only sync/mutation-log implementation, a free local-network transport such as HTTPS/WebSocket with platform discovery or a user-controlled relay, Papa Parse or equivalent CSV parser, PDF.js or equivalent text-PDF extraction, SwiftUI, XCTest, browser end-to-end test tooling, and installed Impeccable/design/iOS skills. Every dependency MUST be free to install and use for this project; no paid SDK, hosted sync tier, or cloud credential may be required.

**Storage**: Local SQLite-backed stores on web, iOS, and future desktop; optional encrypted vault export files; no hosted database is required. The selected local-network relay may temporarily hold encrypted mutation envelopes but MUST NOT be the only copy of financial data.

**Testing**: Shared TypeScript unit and fixture tests; web integration, accessibility, and browser tests; Swift XCTest for iOS domain/persistence/sync adapters; local vault-isolation and relay authorization tests; two-client offline/conflict integration tests; performance fixtures and profiling

**Target Platform**: Local web app in current evergreen desktop/mobile browsers; native iOS app with minimum iOS 16.0 for iPhone X and newer supported iPhones; local relay process for synchronization

**Project Type**: Multi-app monorepo: local-first web application, native mobile application, shared domain/parsing/contracts packages, a free local relay/sync companion, and optional static hosting configuration

**Performance Goals**: Local UI feedback observable within 100 ms; progress/status within 200 ms for longer operations; summary/filter updates under 1 second for 10,000 transactions; typical import/review/commit under 3 minutes; sync visibility within 60 seconds for 95% of foreground, connected attempts

**Constraints**: Offline-capable local reads/writes; no silent financial data loss; CSV/PDF parsing must preserve row diagnostics; iOS 16 compatibility; strict vault isolation; encrypted peer transport; no paid cloud credentials or hosted sync dependency; WCAG AA web target; VoiceOver, Dynamic Type, Dark Mode, safe areas, and 44pt targets on iOS; statement originals private and preferably ephemeral

**Scale/Scope**: Initial portfolio-quality release for separate individual local vaults and friends; curated support for the reference project's bank formats; at least 10,000 local transactions in performance fixtures; 7 prioritized user journeys; future desktop GUI deliberately deferred

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle / gate | Status | Evidence in plan |
|---|---|---|
| I. Code Quality and Maintainability | PASS | Explicit monorepo boundaries, shared domain contracts, adapter pipeline, no unrelated desktop GUI, complexity rationale documented in research. |
| II. Testing Standards (NON-NEGOTIABLE) | PASS | Layered tests cover parser fixtures, error/boundary cases, vault isolation, pairing authorization, sync conflicts, web accessibility, iOS compatibility, and performance. |
| III. Consistent and Accessible User Experience | PASS | Shared product vocabulary and semantic states; native iOS HIG contract; web keyboard/contrast/reduced-motion contract; design-system artifact. |
| IV. Measurable Performance | PASS | Numeric latency, dataset, import, sync, and feedback targets are carried into Technical Context and quickstart. |
| Performance Standards | PASS | Worker-backed parsing, local indexed queries, incremental result handling, and visible progress for long work. |
| Development Workflow and Quality Gates | PASS | Quickstart defines runnable validation matrix; tasks must add tests with behavior changes and review design/privacy/performance gates. |

No constitution violations require an exception.

## Architecture

```text
              ┌──────────────────────────────┐
              │ Optional free static hosting │
              │ or local Vite server         │
              └──────────────┬───────────────┘
                             │
               ┌─────────────▼─────────────┐
               │ Local vault / free relay  │
               │ append-only mutation log  │
               │ encrypted envelopes       │
               └─────────────┬─────────────┘
                             │ local network / user-controlled relay
                 ┌───────────┴───────────┐
                 │                       │
       ┌─────────▼─────────┐   ┌─────────▼─────────┐
       │ Web client        │   │ Native iOS        │
       │ React/TypeScript  │   │ SwiftUI           │
       │ local SQLite      │   │ local SQLite      │
       │ parser worker     │   │ iOS 16+           │
       └───────────────────┘   └───────────────────┘
```

### Boundaries

- **Shared domain**: monetary arithmetic, date periods, category/rule precedence, duplicate fingerprints, validation, and summary semantics are defined by language-neutral JSON fixtures and contract schemas. The web implementation uses TypeScript packages; the iOS implementation uses Swift value types validated against the same fixtures so financial behavior cannot drift silently.
- **Web app**: import file selection, worker-backed CSV/PDF parsing, review table, dashboard, history, manual entry, privacy/settings, demo mode, and sync status.
- **Local sync mapping**: local writes append stable mutation envelopes to the vault's durable pending mutation log; the iOS client can create and retain expenses while away from the PC; when the user later opens the iOS app and PC web app/relay in a foreground connected session, paired clients exchange missing mutations over encrypted local-network transport or a user-controlled relay; each client applies mutations idempotently to its local SQLite store; unresolved field conflicts create `ConflictRecord` entries; retries remain pending with backoff. The logical contracts remain transport-neutral and require no hosted provider.
- **iOS app**: native overview, transaction list/detail/edit, manual entry sheet, CSV/PDF import and review, sync/conflict status, settings/privacy, and native iOS feedback. The iOS importer uses the same language-neutral parser fixtures and normalized contract as the web importer; it MUST preserve the iOS 16 experience and may share parser behavior through a generated contract/fixture suite rather than assuming TypeScript can run natively.
- **Local relay**: a free, user-controlled companion process MAY provide encrypted peer discovery, mutation exchange, vault backup, and optional LAN access. It MUST be runnable locally without a paid account and MUST NOT be the only durable copy of financial data.
- **Optional hosting**: a static web host may publish the demo shell only. Hosted databases, hosted sync, paid APIs, and cloud credentials are optional enhancements and are not part of the required architecture.
- **Design system**: semantic tokens and content vocabulary for both clients; platform-specific components remain native.

## Project Structure

### Documentation (this feature)

```text
specs/001-local-expense-tracker/
├── plan.md              # This plan
├── research.md          # Architecture decisions and alternatives
├── data-model.md        # Entities, relationships, validation, state
├── quickstart.md        # Runnable validation scenarios
└── contracts/
    ├── api.md           # Sync/import/conflict/error contracts
    └── design-system.md # Cross-platform visual and interaction contract
```

### Source Code (repository root)

```text
apps/
├── web/
│   ├── src/
│   │   ├── app/                 # routes, providers, global shell
│   │   ├── components/          # shared web UI and accessible data views
│   │   ├── features/
│   │   │   ├── dashboard/
│   │   │   ├── transactions/
│   │   │   ├── imports/
│   │   │   ├── categorization/
│   │   │   ├── sync/
│   │   │   └── settings/
│   │   ├── workers/             # parser/classification worker entrypoints
│   │   ├── local/               # SQLite/local vault adapters
│   │   └── styles/              # semantic web tokens and theme
│   ├── public/
│   └── tests/
│       ├── integration/
│       ├── e2e/
│       └── accessibility/
├── ios/
│   ├── ExpenseTracker/
│   │   ├── App/
│   │   ├── Features/
│   │   │   ├── Overview/
│   │   │   ├── Transactions/
│   │   │   ├── ManualEntry/
│   │   │   ├── Sync/
│   │   │   └── Settings/
│   │   ├── Domain/
│   │   ├── Persistence/
│   │   ├── Networking/
│   │   └── DesignSystem/
│   └── ExpenseTrackerTests/
│       ├── Domain/
│       ├── Persistence/
│       ├── Sync/
│       └── Features/
└── relay/
    ├── src/
    │   ├── pairing/
    │   ├── transport/
    │   ├── mutation-log/
    │   └── vault-io/
    ├── config/
    └── tests/
        ├── pairing/
        ├── sync/
        └── fixtures/

packages/
├── domain/
│   ├── src/entities/
│   ├── src/money/
│   ├── src/periods/
│   ├── src/summaries/
│   ├── src/categorization/
│   └── tests/
├── parsing/
│   ├── src/csv/
│   ├── src/pdf/
│   ├── src/normalization/
│   ├── src/diagnostics/
│   └── tests/
├── contracts/
│   ├── src/api/
│   ├── src/sync/
│   └── tests/
├── fixtures/
│   ├── statements/csv/
│   ├── statements/pdf/
│   ├── expected/
│   └── demo/
└── design-tokens/
    ├── src/web/
    ├── src/ios/
    └── tests/
```

**Structure Decision**: Use a repository workspace monorepo separating the web app, native iOS app, sync/backend configuration, shared TypeScript domain/parsing/contracts, fixtures, and semantic design tokens. The separation prevents platform UI concerns from contaminating domain logic while keeping sync contracts and financial arithmetic consistent. A standalone desktop GUI is intentionally not added.

## Implementation phases

### Phase A: Foundation and domain invariants

- Establish monorepo tooling, TypeScript strictness, formatting/linting, test runners, and iOS project with iOS 16 deployment target.
- Create shared money/date/period/category/transaction value objects and summary calculations.
- Create versioned JSON fixtures and golden expected outputs before parser implementation. Each fixture contains source metadata, normalized rows, diagnostics, category suggestions, summary totals, and expected unsupported/error state; web tests and Swift XCTest consume the same fixture files.
- Establish semantic design tokens, typography, spacing, state colors, and web/iOS vocabulary.
- Create test data/demo mode with explicit sample labeling.

### Phase B: Web local-first core

- Build the web app shell, vault creation/open/import flow, onboarding/empty state, dashboard, transaction list, filters, manual entry, edit, delete confirmation, and accessible chart alternatives.
- Add local SQLite vault adapter, encrypted vault export/import, and offline status surface.
- Validate keyboard navigation, responsive layouts, dark mode, reduced motion, and performance on 10,000 transaction fixtures.

### Phase C: Import, review, categorization, and learning

- Build CSV and text-PDF parser adapters with web-worker execution on web and cancellable background parsing on iOS.
- Enforce parser limits: 10 MB file size, 60 PDF pages, 5 MB extracted text, 50,000 rows, and a 30-second default parse budget with cancellation. Reject password-protected or image-only PDFs in the first release with explicit remediation; do not silently fall back to incomplete data.
- Add normalized row diagnostics, source preservation, duplicate fingerprints, import preview, explicit commit/exclude/edit flows, and supported-bank fixtures.
- Add deterministic default rules, personal merchant rules, provenance/confidence explanations, correction history, and rule management.
- Run the same sanitized CSV/PDF fixtures and expected normalized outputs through web and iOS contract tests. OCR remains a later enhancement unless fixture evidence justifies it.

### Phase D: Free local pairing and synchronization

- Implement local vault creation, encrypted vault export/import, device pairing codes, authenticated public-key exchange, device-specific wrapped vault keys, resumable encrypted snapshot bootstrap for new devices, and explicit paired-device management without a hosted identity provider.
- Build the append-only mutation log with stable IDs, Lamport/vector clock metadata, idempotent application, tombstones, offline retry/backoff, and field-aware conflict detection.
- Add a free user-controlled local relay/companion process running alongside the PC web app for encrypted LAN mutation exchange and optional backup. Document browser-to-companion endpoint discovery, authenticated secure transport/certificate setup, iOS Local Network permission, foreground reconnect behavior, replay rejection, durable iOS offline queueing across restarts, backlog/batch exchange, and the fact that background sync is not required in the first release. The web app MUST also support direct local operation when the relay is unavailable.
- Implement conflict review UI, vault isolation tests, pairing rejection/rotation, corrupted-log recovery, and two-device sync tests.
- Document and test the threat model and key lifecycle: browser and iOS at-rest protections are stated with platform-specific limits; vault keys are generated locally, wrapped for authorized paired-device public keys, stored through platform-protected key storage, removed by clear-local-data, and recoverable only from an explicitly encrypted backup; key rotation retains historical versions until migration/retirement; encrypted peer transport protects sync in transit, pairing keys authorize devices, the authorized initiating client creates authenticated snapshots for new-device bootstrap, and the relay sees only opaque envelopes. No paid cloud provider or service-role key exists in the required architecture.
- Validate sign-out/forget-device behavior, clear-local-data, export/import, deletion propagation, phone-away/PC-later queue draining after iOS restart, idempotent batch replay, and the fact that no network or cloud credential is required for core flows.

### Phase E: Native iOS client

- Build native SwiftUI tab/navigation structure and iOS design system using iOS 16-compatible APIs; explicitly prohibit SwiftData as a core dependency and gate every newer API with an iOS 16 fallback.
- Add local vault storage, free Xcode/Apple Account sideloading workflow, pairing-code entry, sync adapter, overview summaries, transaction list/detail/edit, manual entry, CSV/PDF import and review, category correction, sync status, conflicts, privacy, and settings.
- Add iOS accessibility, Dynamic Type, Dark Mode, safe-area, touch-target, localization, and meaningful haptic validation.
- Run iOS 16 compatibility smoke tests on an iPhone X-class destination and newer-device adaptive layout checks. App Store, TestFlight, paid provisioning, and public distribution are explicitly not required.

### Phase F: Hardening, visual polish, and release validation

- Apply Impeccable operate-mode critique/audit/polish to web product surfaces using the concrete screen and token contract.
- Apply design-taste guidance to the demo/portfolio surface without turning financial operations into marketing UI.
- Apply iOS HIG, SwiftUI expert, accessibility, networking, localization, and performance skills to native review.
- Run parser accuracy, summary, vault isolation, pairing, mutation-log, sync, conflict, accessibility, iOS 16, 10,000-transaction, and visual regression checks.
- Verify the $0 setup from a clean machine: PC web app, local relay, vault creation, iOS sideload, pairing, iOS expense creation while away, later foreground reconnect to the PC, offline edits, and exactly-once sync must work without paid credentials.
- Verify the security disclosure, forget-device behavior, clear-local-data, export/import lifecycle, and statement-retention policy.
- Document local setup, optional static demo hosting, sanitized demo data, privacy behavior, known unsupported statement layouts, relay requirements, free iOS sideload limitations, and future desktop GUI boundaries.

## Complexity Tracking

No constitution violations require justification. The monorepo has three deployable concerns (web, iOS, and the optional local relay) plus shared packages because the specification explicitly requires two platforms, offline synchronization, shared financial semantics, and a $0-required setup. Hosted services are deliberately excluded from the required path to avoid unpredictable free-tier changes.
