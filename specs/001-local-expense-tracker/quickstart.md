# Quickstart and Validation Guide: Local Expense Tracker

This guide defines the checks the implementation must make runnable. It intentionally avoids full implementation code and provider secrets.

## Planned project shape

```text
apps/
├── web/                 # React + TypeScript local-first web client
├── ios/                 # Native SwiftUI iOS 16 client
└── relay/               # Free local relay/pairing companion and mutation exchange
packages/
├── domain/              # Shared TypeScript value objects, summaries, categories, rules
├── parsing/             # CSV/PDF adapters, normalization, diagnostics
├── fixtures/            # Sanitized CSV/PDF fixtures and expected normalized rows
├── contracts/           # Sync/import/error contract types and generated mappings
└── design-tokens/       # Web tokens and cross-platform semantic references
specs/001-local-expense-tracker/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
└── contracts/
    ├── api.md
    └── design-system.md
```

## Prerequisites

- Node.js LTS and npm.
- Xcode version capable of building an iOS 16 deployment target.
- An iPhone X running iOS 16.7.9 or an iOS 16 simulator for the compatibility gate.
- A newer iPhone simulator or device for adaptive layout checks.
- A local relay/sync companion built from the repository, or direct local-network pairing mode.
- No cloud credentials, paid subscriptions, hosted database, or hosted sync tier.
- Sanitized statement fixtures only. Never commit personal bank statements or credentials.

## Local web validation

1. Install web dependencies and start the local app in development mode.
2. Launch with an empty local store and confirm the onboarding/empty state explains how to add or import data.
3. Add a manual expense and verify it remains available after refresh and a temporary network disconnect.
4. Import one curated CSV fixture and one text-extractable PDF fixture from the web client, then repeat the normalized review/commit flow from iOS and confirm parity.
5. Confirm the import review shows accepted rows, warnings, duplicate candidates, category suggestions, confidence/provenance, and commit/exclude controls.
6. Commit accepted rows and verify dashboard summaries for weekly, monthly, and custom ranges against fixture totals.
7. Correct a category, save a personal rule, import a matching later fixture, and verify the expected learned categorization behavior.
8. Create two test vaults and verify vault isolation through the UI, export/import boundaries, and direct local-store tests.
9. Run the phone-away/PC-later flow: pair the iOS app with the PC web app/relay, disconnect the iPhone from the PC network, create two expenses on iOS, force-close and reopen the iOS app, return the iPhone to the PC network, open iOS and the PC web app/relay in the foreground, and verify the pending batch drains, each expense appears exactly once on the PC, and summaries update.
10. Run keyboard-only and accessibility checks for import review, manual entry, category editing, filters, errors, and conflict resolution.
11. Run both light/dark themes and reduced-motion mode; capture desktop and narrow responsive screenshots for the design review.

## Native iOS validation

1. Build the iOS client with the minimum deployment target set to iOS 16.
2. Run the app on an iPhone X-class iOS 16 simulator/device.
3. Install locally through Xcode and a free Apple Account/Personal Team; record the periodic re-provisioning limitation.
4. Create or open a local vault and pair the device with the local web companion using a short-lived pairing code; confirm the device-specific wrapped vault key is accepted locally and a resumable encrypted snapshot bootstrap completes before mutation catch-up.
5. Add and edit a manual expense offline; confirm a visible pending-sync state.
6. Restore local-network connectivity and verify encrypted mutation exchange with the web client.
7. Open overview summaries, transaction history, CSV/PDF import and review, category correction, settings, and conflict review on the iPhone X-class target.
8. Test VoiceOver, Dynamic Type at the largest setting, Dark Mode, Increase Contrast, and touch targets.
9. Run the same smoke flow on a newer iPhone size without requiring iOS 17-only APIs.
10. Verify that forgetting a paired device, clearing local data, exporting/importing a vault, new-device snapshot bootstrap, failed sync, and deleted records preserve the documented local privacy behavior; verify retained source payloads and conflict candidates are encrypted at rest.

## Cross-client sync matrix

| Scenario | Web | iOS | Expected |
|---|---|---|---|
| Create online | Create transaction | Observe | Same stable transaction appears once |
| Phone away, PC later | Create expense while iOS is away; reopen iOS | Reconnect iOS and PC/relay in foreground | Durable batch drains; each expense appears exactly once on PC |
| Create offline | Create transaction | Reconnect | Pending mutation uploads and appears on web |
| Edit category online | Change category | Observe | Corrected category and provenance sync |
| Concurrent category edit | Change category A | Change category B offline | Conflict is visible; no silent loss |
| Delete record | Delete and confirm | Reconnect | Tombstone removes record on other client |
| Separate vaults | Vault A data | Vault B open/import | No cross-vault records, rules, files, or summaries |
| Pairing | Start code | Accept/reject code | Only explicitly paired devices exchange encrypted mutations |
| Import review | Upload/commit | Observe committed rows | iOS sees committed normalized transactions, not private raw file unless retained |
| iOS import | Observe committed rows | Upload/review/commit CSV or PDF | Web sees the same normalized rows and provenance |

## Performance validation

- Local manual edits provide observable feedback within 100 ms under normal conditions.
- Operations expected to take more than 200 ms show progress/status within 200 ms.
- A fixture of 10,000 transactions recalculates and filters summaries in under 1 second during normal local use.
- Typical statement import/review/commit completes in under 3 minutes for a user and does not block the interface.
- Parsing and categorization run off the web main interaction path; long iOS operations expose progress or status.
- Parser safety fixtures verify rejection at 10 MB, 60 pages, 5 MB extracted text, 50,000 rows, and the 30-second default budget, plus cancellation and preservation of local work.
- Web Core Web Vitals and iOS scrolling/performance checks are recorded for representative data sizes.
- A clean-machine $0 rehearsal verifies PC web startup, local relay startup, vault creation, free iOS sideload, pairing, iOS expense creation while away, app restart, later foreground reconnect to the PC, exactly-once backlog sync, and no cloud credentials.

## Test commands to establish during implementation

The plan should establish commands equivalent to:

```text
npm run lint
npm run typecheck
npm run test
npm run test:fixtures
npm run test:e2e
npm run test:a11y
npm run build
npm run relay:dev
xcodebuild test -scheme ExpenseTracker -destination <iOS-16-compatible-destination>
# Install locally from Xcode using a free Apple Account; App Store/TestFlight are not required.
```

Exact commands belong to the implementation plan/tasks after the project manifests and toolchains are created.
