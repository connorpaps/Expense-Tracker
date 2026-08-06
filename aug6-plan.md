# Expense Tracker — August 6 Web-First Completion Plan

**Date:** 2026-08-06  
**Status:** Approved and implemented in web-first scope (2026-08-06)  
**Scope:** Finish the local-first web application first; defer iOS runtime work and production cross-device synchronization until the web release boundary is complete.

---

## 1. Purpose

This document compares the current repository state against `specs/001-local-expense-tracker/` and defines the remaining implementation plan.

The plan intentionally separates:

1. Work already complete and validated.
2. Remaining web work that should be finished first.
3. Web/relay synchronization work that can be developed before iOS.
4. iOS and macOS/Xcode-gated work that should be deferred.
5. Final release and traceability work.

The web-first implementation has been completed through the local relay exchange/projection boundary described below. Native iOS runtime work and production LAN sync remain explicitly deferred.

---

## 2. Current state summary

The repository is substantially implemented. The current handoff records:

- 41 test files and 197 tests passing.
- Full TypeScript typecheck passing.
- ESLint passing for the configured first-party TypeScript scope.
- Web production build passing.
- Browser audit passing 22/22 against development and production preview.
- Reload persistence audit passing.
- Offline audit passing 8/8.
- Vault lifecycle audit passing 8/8.
- Backup audit passing 5/5 with synthetic file injection.
- Process-restart persistence passing.
- Production service-worker audit passing online/offline navigation.
- Relay and pairing tests passing 18 tests.
- Native iOS source present but not compiled or XCTest-validated because this machine is Windows/MSYS without Xcode.

The web app already includes:

- Local wa-sqlite vaults.
- Private and demo vault creation/switching.
- CSV and text-based PDF import.
- Worker/in-process parsing with progress and cancellation behavior.
- Import review, diagnostics, duplicate decisions, category corrections, and commit.
- Manual transaction creation/edit/delete.
- Weekly, monthly, and custom summaries.
- Search, date/category filters, sorting, and reset.
- Category management and personal categorization rules.
- Offline local reads/writes and restart persistence.
- Encrypted versioned vault export/import.
- Statement-original deletion, imported-record deletion, vault deletion, and clear-local-data controls.
- Local pending mutation status.
- A local-only sync/conflict-review page.
- Demo data and vault isolation.
- Web accessibility and browser audit coverage.

The largest missing product area is real cross-client synchronization. The existing `/sync` page is intentionally a local review boundary and does not yet deliver or apply financial mutations between web, relay, and iOS.

---

## 3. Product boundary for the first web release

### Included in the web-first release

The first web release should provide a complete, useful, truthful local-first expense tracker with:

- Import and review.
- Manual entry and editing.
- Spending summaries and transaction history.
- Categorization and personal rules.
- Offline operation.
- Privacy and retention controls.
- Encrypted backup/export and isolated copy import.
- Private/demo vault separation.
- Local mutation status.
- Local conflict review with explicit non-delivery messaging.
- Responsive, accessible, visually coherent web UX.

### Explicitly not claimed by the web-first release

- Live iOS synchronization.
- Production LAN relay security.
- HTTPS/WSS relay transport.
- Durable cross-process device registry.
- Snapshot/bootstrap delivery to a new device.
- Remote mutation projection application.
- Exactly-once phone-away/PC-later synchronization.
- Native iOS runtime compatibility on iPhone X/iOS 16.

The UI and documentation must continue to state these limitations clearly rather than showing a false “synced” state.

---

## 4. Comparison against the specification

## 4.1 US1 — Import and review bank statements

### Current status

**Web/shared implementation: complete.**

Implemented and validated:

- CSV parsing.
- Text-based PDF extraction.
- Supported bank profiles for American Express, Apple Card, Chase, Capital One, and US Bank fixtures.
- Date, amount, sign, currency, and merchant normalization.
- Original-source preservation where supported.
- Row diagnostics and safe errors.
- Duplicate detection within an import and against the active vault.
- Category suggestion, confidence, and provenance.
- Reviewable accept/exclude decisions.
- Cancellation without commit.
- Transactional import commit.
- Progress/error states.
- Browser PDF.js worker loading.
- Real browser parsing of the TD mock through the app path into 19 recognized rows.

Completed task range:

- T025–T037, with native execution caveats documented separately.

### Remaining web concern

The remaining evidence limitation is native file chooser automation:

- Existing browser audits use synthetic `DataTransfer` file injection.
- Headless CDP does not reliably expose `input.files`.
- This is currently a harness limitation, not a known parser or product failure.

### Plan

Do not rewrite the parser. Preserve the current implementation and:

1. Keep the existing synthetic browser evidence.
2. Add file-capable browser automation only if a reliable harness is available.
3. Otherwise document the limitation in release validation.
4. Manually verify CSV and PDF selection in a normal browser before release.

---

## 4.2 US2 — Manual expenses

### Current status

**Web implementation: complete.**

The web app supports:

- Create.
- Required-field validation.
- Edit.
- Delete confirmation.
- Local encrypted mutation writes.
- Saved-local feedback.
- Summary/history refresh through local persistence.

Completed web tasks:

- T038.
- T040.
- T041.
- T044.

### Remaining

- T039: iOS UI/Dynamic Type XCTest execution.
- T043: iOS encrypted append-only mutation-log integration.

### Web plan

No feature rewrite is needed. Include manual-entry flows in the final web keyboard, responsive, and release checks.

---

## 4.3 US3 — Spending summaries and transaction history

### Current status

**Web implementation: complete.**

The web app supports:

- Weekly summaries.
- Monthly summaries.
- Custom date ranges.
- Total spend.
- Credits/refunds.
- Net activity.
- Transaction counts.
- Category breakdowns.
- Recent activity.
- Mixed-currency warning without implicit conversion.
- Search.
- Date filtering.
- Category filtering.
- Sorting.
- Filter reset.
- Empty states.
- 10,000-transaction performance coverage.

Completed web tasks:

- T045.
- T046.
- T048–T052.

Remaining:

- T047: iOS overview/filter XCTest execution.

### Plan

No major web summary feature is required. Verify the following during final QA:

- A committed import appears in history and summaries.
- Editing a transaction recalculates summaries.
- Deleting a transaction removes it from active summaries.
- Changing period and filters updates both summary and visible records.
- Mixed currencies remain explicit and are never silently converted.

---

## 4.4 US4 — Categorization and learning

### Current status

**Web/shared implementation: substantially complete.**

Implemented:

- Default rules.
- Merchant normalization.
- Personal merchant rules.
- Rule precedence.
- Confidence.
- Correction history.
- Category correction during import.
- Category correction in transaction history.
- Rule creation.
- Rule editing.
- Rule disabling.
- Rule removal.
- Undo.
- Backup compatibility.
- Provenance feedback.

Completed web/shared tasks:

- T053.
- T054.
- T056.
- T057.
- T059.

Remaining:

- T055: iOS categorization XCTest execution.
- T060: native iOS categorization UI and durable rule mutations.
- Cross-client completion of T058.

### T058 interpretation

The web/shared portion is implemented: summary category totals expose provenance/confidence/review metadata, and import/history surfaces expose category information. The remaining reason the task is unchecked is native parity.

### Web plan

Verify:

1. Explicit corrections immediately update the transaction and summary.
2. “Remember this merchant” creates or strengthens a personal rule only after explicit user action.
3. Personal rules affect later imports in the same vault.
4. Conflicting or low-confidence context remains reviewable.
5. Removing or disabling a rule does not rewrite already confirmed historical records.

No new categorization architecture is needed for the web-first milestone.

---

## 4.5 US5 — Offline privacy and vault management

### Current status

**Web implementation: substantially complete.**

Implemented:

- Offline local reads and writes.
- Offline manual entry.
- Offline transaction editing.
- Offline category correction.
- Remount persistence.
- Separate-process restart persistence.
- Local connectivity/status indicator.
- Pending local mutation count.
- Encrypted `.etvault` backups.
- Password-based export encryption.
- Checksum validation.
- Schema/version validation.
- Backup preview.
- Import-as-new-vault flow.
- Source-vault preservation.
- Statement-original deletion.
- Imported-record deletion.
- Local vault deletion.
- Clear-local-data controls.
- Learned-rule retention behavior.
- Optional production static shell/service worker.

Complete or effectively complete web tasks:

- T061.
- T064.
- T067.
- T068.
- Web portions of T065 and T066.

### Remaining T062 — Privacy lifecycle tests

Complete shared/domain lifecycle coverage for:

- Locked/reopened vault behavior.
- Recovery export lifecycle.
- Clear-local-data lifecycle.
- Encryption key cleanup.
- Retained-source deletion.
- Failure rollback for every destructive operation.
- Restart behavior after clear/delete.
- Preservation of learned rules where specified.
- Correct tombstone/version behavior.

Likely files:

- `packages/domain/src/privacy/`
- `packages/domain/src/vault-io/`
- `packages/domain/tests/privacy-lifecycle.test.ts`
- `apps/web/src/local/export.ts`
- `apps/web/src/local/security.ts`

Acceptance criteria:

- A failed clear/delete/export operation leaves the vault usable.
- Keys are removed when the contract says they should be removed.
- Retained originals, normalized transactions, rules, and mutation records have explicit lifecycle behavior.
- Export remains available before destructive deletion.
- Browser-only globals are feature-detected in shared tests.

### T065 — Privacy/settings surfaces

The web surface is already present. Finish only the web-first review:

- Ensure local storage wording is accurate.
- Explain that pending mutations/device pairings are not included in portable backups.
- Explain that local deletion does not erase copies already delivered to other devices.
- Explain that no hosted account is required.
- Ensure statements, imported records, rules, vaults, and clear-local-data controls state their scope.

Native parity remains deferred.

### T066 — Encrypted vault export/import

The web implementation is present. Finish only the web evidence and failure-state review:

- Wrong password.
- Corrupt checksum.
- Unsupported version.
- Invalid schema/reference.
- Cancelled restore.
- Isolated copy import.
- Source-vault preservation.
- Restore after reload.
- Pending-sync exclusion warning.

Native/shared parity remains deferred.

---

## 4.6 US6 — Synchronization

### Current status

**Not complete. This is the largest remaining product area.**

The current `/sync` page provides:

- Pending mutation counts.
- Failed mutation details.
- Open conflict counts.
- Opaque conflict metadata.
- Keep-local decisions.
- Keep-remote decisions.
- Manual JSON resolution.
- Keep-both JSON resolution.
- Encrypted local resolution mutations.
- Explicit messaging that no remote delivery or projection application has happened.

It does not yet provide:

- Real web-to-relay connection.
- iOS-to-relay connection.
- Durable relay storage across process restarts.
- LAN discovery.
- TLS/WSS.
- Durable device registry.
- Snapshot/bootstrap transfer.
- Web ingestion of remote mutations.
- Exactly-once projection application.
- Derived-summary refresh from remote mutations.
- Reconnect/retry actions.
- Forget-device controls.
- Full phone-away synchronization.

Unchecked sync tasks:

- T069 — Pairing contract coverage.
- T070 — Snapshot/bootstrap contract tests.
- T071 — Phone-away queue/restart/idempotent batch tests.
- T073 — iOS sync status tests.
- T074 — Relay discovery, secure endpoint, and device registry.
- T075 — Key exchange, rotation, and protected storage.
- T076 — Snapshot/bootstrap implementation.
- T077 — Encrypted mutation exchange integration.
- T078 — iOS durable queue/reconnect.
- T079 — Web mutation ingestion and exactly-once application.
- T080 — Connected conflict application.
- T081 — Sync/reconnect/device-control UI.

### Web-first sync goal

Before iOS, make the web synchronization architecture real and testable using a local relay or simulated second web projection.

The desired pipeline is:

```text
LocalMutationQueue
  -> RelayTransport
  -> ExchangeResponse
  -> MutationDecoder
  -> ProjectionApplier
  -> ConflictRecorder
  -> Summary refresh
```

Responsibilities:

- The relay carries opaque envelopes.
- Authorized clients decrypt envelopes.
- The web projection applier validates and applies mutations.
- Mutation IDs provide idempotency.
- Base versions and changed fields determine conflict behavior.
- Unsafe concurrent edits create conflicts before destructive overwrite.
- Summary queries recalculate from the resulting projection.

---

## 5. Web-first implementation milestones

## Milestone 1 — Web privacy and lifecycle closeout

### Scope

- T062.
- Web portion of T058.
- Web portion of T065.
- Web portion of T066.
- Web portion of T086.
- Web portion of T087.

### Work

1. Expand privacy lifecycle tests.
2. Verify backup failure and recovery states.
3. Verify deletion/retention semantics.
4. Verify local encryption-key cleanup.
5. Review Settings wording against `docs/security-model.md`.
6. Preserve the current source-vault and pending-sync warnings.

### Result

A complete offline-first, privacy-aware web tracker with truthful local backup and deletion behavior.

---

## Milestone 2 — Web UX, accessibility, and responsive closeout

### Scope

- Web portion of T088.
- Web portion of T090.
- Web portion of T092.

### Work

Review every route at desktop and mobile widths:

- Overview.
- Transactions.
- Import.
- Settings.
- Sync/review.

Check:

- Keyboard-only completion of core flows.
- Visible focus states.
- Focus order.
- Focus restoration after dialogs.
- Screen-reader names.
- Form error announcements.
- Table semantics.
- Mobile table/list behavior.
- WCAG AA contrast.
- Dark-mode contrast.
- Reduced-motion behavior.
- Loading states.
- Empty states.
- Error states.
- Destructive-action copy.
- Long merchant names and large transaction lists.
- Narrow viewport overflow.

The existing design system should be polished incrementally; do not replace it wholesale.

### Result

A visually coherent, responsive, keyboard-accessible web release with documented manual review evidence.

---

## Milestone 3 — Web relay client boundary

### Scope

- T069.
- T077.
- Web portions of T081.

### Work

Create a dedicated web sync adapter rather than putting WebSocket logic directly in `SyncPage`.

Suggested structure:

```text
apps/web/src/local/sync/
  relay-client.ts
  sync-service.ts
  mutation-queue.ts
  projection-applier.ts
  sync-types.ts
```

Responsibilities:

- Connect to the relay.
- Send authenticated exchange requests.
- Handle connection failure.
- Handle relay error codes.
- Reconnect only during explicit foreground activity.
- Return clear states:
  - `disconnected`
  - `connecting`
  - `connected`
  - `pending`
  - `failed`
  - `synced`
- Expose last exchange time.
- Expose oldest pending mutation.
- Preserve pending changes across reload.

The UI should consume a service/state boundary instead of managing raw transport details.

### Result

The web app can make a real local relay connection without falsely claiming delivery.

---

## Milestone 4 — Web mutation ingestion and projection application

### Scope

- T079.
- Web portion of T080.
- Remaining web portion of T081.

### Work

Implement:

1. Decode authorized mutation ciphertext.
2. Validate vault ID.
3. Validate entity type and operation.
4. Check mutation ID idempotency.
5. Check base version.
6. Apply create/update/delete/rule/category mutations.
7. Preserve tombstones.
8. Record conflicts for unsafe concurrent changes.
9. Mark mutation status.
10. Refresh transaction history and summaries.
11. Return explicit acknowledgement only after local projection application succeeds.

Mutation application must be transactional. A failed projection must not be acknowledged as applied.

### Result

A remote mutation can safely update a second web projection exactly once.

---

## Milestone 5 — Web retry, reconnect, and sync controls

### Scope

- Remaining web portion of T081.

### Work

Add:

- Connect/reconnect action.
- Retry failed mutations.
- Last successful exchange time.
- Oldest pending mutation.
- Failed mutation reason.
- Explicit pending backlog details.
- Forget-device placeholder or real action depending on transport readiness.
- Clear-local-pending-changes action with a destructive warning.
- Clear separation between local save and remote acknowledgement.

Never show “synced” until:

1. The relay acknowledges the exchange.
2. The local projection applies the mutation.
3. The local mutation state is updated transactionally.

### Result

The web sync page accurately represents the full lifecycle of a local mutation.

---

## Milestone 6 — Two-projection web synchronization tests

### Scope

- T070.
- T071.
- T077.
- T079.
- Web portion of T080.
- Web portion of T081.

### Test model

Use two local web projections or a web client plus a test transport. iOS is not required for this milestone.

Required scenarios:

1. Create on client A appears once on client B.
2. Edit on A applies on B.
3. Delete on A creates and applies a tombstone on B.
4. Duplicate mutation replay does not create a duplicate.
5. Duplicate batch replay returns the original response.
6. Same entity, different fields can merge when contractually safe.
7. Same entity, same field creates a conflict.
8. Unknown conflict fields fail closed.
9. Relay failure leaves local data usable.
10. Reload preserves pending mutations.
11. Reconnect drains pending mutations.
12. Dashboard summaries refresh exactly once.
13. Failed application does not produce a false acknowledgement.
14. Wrong-vault mutations are rejected.
15. Unauthorized device/capability attempts are rejected.

### Result

Web synchronization behavior is proven independently of the native client.

---

## Milestone 7 — Web release documentation and traceability

### Scope

- T091.
- T092.
- T093.
- T095 web portion.
- T096 web portion.

### Documentation updates

Update or create:

- Root README.
- `specs/001-local-expense-tracker/quickstart.md`.
- A web validation record under `docs/validation/`.
- Web/relay startup instructions.
- Backup/restore instructions.
- Supported and unsupported PDF behavior.
- Offline limitations.
- Current sync boundary.
- Browser requirements.
- Future macOS/iOS requirements.

The quick web startup should be documented as:

```bash
cd apps/web
npm run dev -- --host 127.0.0.1
```

The root command should remain available:

```bash
npm run dev:web
```

If npm argument forwarding causes Vite flags to be interpreted incorrectly from the root, document that Vite-specific flags should be passed from `apps/web`.

### Traceability table

Create a web-first mapping of:

- Functional requirements → implementation files.
- Success criteria → tests/audits.
- Open limitations → task IDs.
- Deferred iOS work → macOS/Xcode gate.
- Deferred live sync → US6 milestone.

---

## 6. Exact web files likely to be involved

### Existing web app

- `apps/web/src/App.tsx`
- `apps/web/src/main.tsx`
- `apps/web/src/features/dashboard/DashboardPage.tsx`
- `apps/web/src/features/transactions/TransactionsPage.tsx`
- `apps/web/src/features/imports/ImportPage.tsx`
- `apps/web/src/features/settings/SettingsPage.tsx`
- `apps/web/src/features/sync/SyncPage.tsx`
- `apps/web/src/components/LocalStatus.tsx`
- `apps/web/src/local/vault.ts`
- `apps/web/src/local/export.ts`
- `apps/web/src/local/security.ts`
- `apps/web/src/local/waSqliteDb.ts`
- `apps/web/src/styles/tokens.css`
- `apps/web/src/styles/global.css`

### Shared domain

- `packages/domain/src/privacy/`
- `packages/domain/src/vault-io/`
- `packages/domain/src/sync/`
- `packages/domain/src/storage/`
- `packages/domain/tests/privacy-lifecycle.test.ts`
- `packages/domain/tests/sync-conflicts.test.ts`
- `packages/domain/tests/sync-log.test.ts`

### Relay

- `apps/relay/src/relay-server.ts`
- `apps/relay/src/main.ts`
- `apps/relay/tests/relay.test.ts`
- `apps/relay/tests/pairing.test.ts`

### Existing validation

- `apps/web/tests/`
- `scripts/audit-browser.mjs`
- `scripts/audit-reload.mjs`
- `scripts/audit-offline.mjs`
- `scripts/audit-restart.mjs`
- `scripts/audit-vaults.mjs`
- `scripts/audit-backup.mjs`
- `scripts/audit-service-worker.mjs`

### Security/documentation

- `docs/security-model.md`
- `docs/dependency-matrix.md`
- `specs/001-local-expense-tracker/contracts/api.md`
- `specs/001-local-expense-tracker/contracts/design-system.md`

---

## 7. Deferred iOS and macOS work

The current machine cannot run Xcode, xcodebuild, XcodeGen, an iOS Simulator, or XCTest UI execution. Do not block web completion on these tasks.

Defer:

- T039 — iOS manual-entry UI/Dynamic Type tests.
- Native portion of T043 — iOS encrypted mutation-log integration.
- T047 — iOS overview/filter XCTest execution.
- T055 — iOS categorization XCTest execution.
- T060 — native categorization controls and durable native rule mutations.
- T063 — iOS privacy/persistence XCTest execution.
- T073 — iOS sync-status tests.
- T078 — iOS durable pending queue/reconnect.
- T089 — native iOS HIG/accessibility/Dynamic Type/Dark Mode runtime validation.
- Native portions of T065, T066, T083, T084, T086, and T087.
- T094 — full clean-machine iOS phone-away rehearsal.

When a Mac is available, the native milestone should include:

1. Generate the Xcode project from `apps/ios/project.yml`.
2. Build for iOS 16.
3. Run domain and persistence XCTest.
4. Run iPhone X-class layout/accessibility checks.
5. Validate Keychain/SQLite restart behavior.
6. Validate native import parity.
7. Validate native privacy/delete/export behavior.
8. Validate native pending queue across force-close/restart.
9. Integrate native relay exchange.
10. Run the complete phone-away/PC-later acceptance test.

---

## 8. Deferred production relay hardening

Do not begin with LAN discovery and certificate complexity before the local protocol and projection application work.

After web synchronization is proven locally, implement:

- T074 — LAN discovery, secure endpoint, Local Network permission guidance, durable device registry.
- T075 — Device key lifecycle, signing-key storage/rotation, vault-key rotation, protected private-key storage.
- T076 — Authenticated encrypted snapshot/bootstrap, chunking, resume, checksum/version validation, merge preview, catch-up.
- Remaining T077 — Production encrypted exchange, retry/backoff, durable relay behavior.

The current relay is development scaffolding with:

- Health endpoint.
- WebSocket transport.
- Opaque mutation store.
- Replay/idempotency behavior.
- Vault scoping.
- Server challenge/proof pairing foundation.
- Capability checks.
- Socket-bound authorization.
- Authority-only revocation.

It is not yet a production LAN security boundary because TLS/WSS and durable device state are not complete.

---

## 9. Final validation gates

Run validation after implementation milestones, not during every planning step.

### Static checks

```bash
npm run typecheck
npm run lint
npm test
npm run build
git diff --check
```

### Focused checks

```bash
npx vitest run --project web
npx vitest run --project relay
npx vitest run --project domain
npx vitest run --project parsing
```

Use root-level Vitest commands. Workspace-local project filtering may fail because the workspace script runs outside the root Vitest configuration.

### Browser checks

Run only after relevant changes:

- Import/browser audit.
- Reload persistence audit.
- Offline audit.
- Restart audit.
- Vault lifecycle/isolation audit.
- Backup audit.
- Service-worker audit.

Record synthetic file injection separately from native file chooser evidence.

### Web release acceptance

The web-first release is ready when:

- CSV import works.
- Text PDF import works.
- Import review prevents unresolved rows from being committed.
- Duplicate decisions work.
- Manual create/edit/delete works.
- Summaries update correctly.
- Search/filter/sort/reset work.
- Category correction and personal rules work.
- Offline entry/edit/summary work.
- Restart persistence works.
- Encrypted export/restore/copy works.
- Privacy deletion scopes are accurate.
- Private/demo vaults remain isolated.
- Sync status does not falsely claim remote delivery.
- Keyboard and automated accessibility checks pass.
- Responsive layout has no critical defects.
- Typecheck, lint, tests, build, and browser audits pass.
- Known limitations are documented.

---

## 10. Recommended implementation order

1. Complete T062 privacy lifecycle coverage.
2. Review and harden web backup/restore failure states.
3. Review Settings privacy/security wording against the security model.
4. Perform the web responsive/accessibility/design audit.
5. Consolidate web validation evidence and traceability.
6. Finalize relay exchange contract tests.
7. Add the web relay client boundary.
8. Implement web mutation ingestion and transactional projection application.
9. Add retry/reconnect and accurate synchronization states.
10. Add two-projection web synchronization tests.
11. Run the web release validation gate.
12. Move to macOS for iOS runtime validation.
13. Implement native queue/reconnect and native parity.
14. Harden LAN relay security and durable device lifecycle.
15. Run the full clean-machine phone-away/PC-later rehearsal.

---

## 11. Definition of done by scope

### Web-first definition of done

- The local web app is useful without sync or iOS.
- All P1 web stories work end-to-end.
- Privacy/export/offline behavior is safe and documented.
- Demo and private vaults are isolated.
- Accessibility and responsive review is complete.
- Local sync/conflict messaging is truthful.
- Web validation passes.

### Web-sync definition of done

- Web mutations exchange through a local relay contract.
- Remote mutations apply transactionally.
- Duplicate replay is idempotent.
- Conflicts are preserved and reviewable.
- Failed delivery remains pending/failed.
- Summary/history refreshes after projection application.
- UI never claims remote synchronization before acknowledgement and local application.

### Full product definition of done

- iOS builds and runs on iOS 16/iPhone X-class hardware.
- iOS queue survives restart.
- Pairing and key lifecycle are secure and durable.
- Snapshot/bootstrap works.
- Phone-away/PC-later exchange works exactly once.
- Native and web fixtures remain behaviorally aligned.
- Full clean-machine rehearsal passes.

---

## 12. Risks and mitigations

### Risk: Sync scope expands into a complete distributed system

**Mitigation:** Implement a minimal local two-projection protocol first. Keep snapshot/bootstrap, device management, and LAN discovery separate milestones.

### Risk: Relay security and projection bugs become entangled

**Mitigation:** Keep opaque relay transport, client decryption, projection application, and conflict recording in separate layers with contract tests.

### Risk: Web UI falsely implies sync completion

**Mitigation:** Preserve explicit states and wording. Only report `synced` after relay acknowledgement plus local projection application.

### Risk: Browser file automation consumes disproportionate time

**Mitigation:** Treat synthetic file injection as valid bounded evidence and document native chooser automation as a harness limitation unless a reliable tool is available.

### Risk: iOS work blocks web delivery

**Mitigation:** Keep native tasks explicitly deferred until macOS/Xcode is available. Continue with web/shared contracts and simulated second-client tests.

### Risk: Existing implementation is rewritten unnecessarily

**Mitigation:** Extend the existing domain, repository, mutation-log, relay, and audit helpers. Avoid replacing the parser, vault store, or visual system without a demonstrated defect.

---

## 13. Approval checkpoint

Before implementation begins, please confirm:

1. Approve the web-first scope.
2. Approve deferring iOS runtime completion until macOS/Xcode is available.
3. Approve implementing a simulated/two-projection web sync milestone before native iOS sync.
4. Approve keeping the current relay localhost-only until the protocol and projection application are proven.
5. Approve treating native file chooser automation as bounded evidence unless a reliable file-capable harness is available.

Once approved, implementation should begin with **Milestone 1: T062 privacy lifecycle coverage and web release closeout**, followed by the web sync boundary.
