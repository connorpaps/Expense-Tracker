# Expense Tracker — Non-iOS Speckit Completion Plan

**Date:** 2026-08-06  
**Status:** Planning document; no implementation changes made for this plan  
**Scope:** Complete the remaining web, shared TypeScript/domain, relay, security, documentation, and release work from `specs/001-local-expense-tracker/tasks.md`. Explicitly exclude iOS/macOS/Xcode-gated work.

## 1. Executive summary

The repository is not yet complete against every non-iOS requirement in the original Speckit plan. The current web-first product is substantially implemented, but the production synchronization path and several cross-cutting release tasks remain open.

The remaining work should be completed in this order:

1. Close shared privacy, backup, and web release-boundary gaps.
2. Finish web accessibility, responsive, security-disclosure, and design review.
3. Complete and harden the relay protocol contracts.
4. Add durable secure relay/device state and authenticated web-to-web pairing.
5. Implement encrypted snapshot/bootstrap and resumable mutation exchange.
6. Replace browser-only action ciphertexts with complete authenticated entity envelopes.
7. Apply remote web mutations transactionally, including conflicts and summary refresh.
8. Add two-projection web/relay acceptance tests as the non-iOS substitute for iOS phone-away testing.
9. Complete vault/demo/backup/privacy evidence, documentation, traceability, and final release validation.

The result will be a complete non-iOS implementation and a truthful web-to-web/local-relay synchronization rehearsal. It will **not** prove native iOS behavior or the original iPhone phone-away acceptance scenario; those remain deferred until macOS/Xcode/iOS validation is available.

## 2. Current baseline and evidence

The checklist currently contains **60 checked tasks and 36 unchecked tasks**. The unchecked count includes mixed tasks whose web/shared portion is already implemented but whose native portion is intentionally deferred.

Current non-iOS validation evidence:

- **43 test files / 203 tests passed**.
- All workspace TypeScript typechecks passed.
- ESLint passed for the configured first-party TypeScript scope.
- Web production build passed.
- `git diff --check` passed.
- All browser/release audit scripts passed `node --check`.
- Clean real-Chrome dev run passed `audit-browser.mjs` **22/22** with no console issues.
- Clean real-Chrome reload persistence audit passed.
- Existing recorded release evidence also covers offline, restart, vault isolation, backup, and service-worker audits.
- Relay and pairing suites pass **18 tests**.

The correct direct web-server command is:

```bash
npm run dev --workspace @expense-tracker/web -- --host localhost --port 5191
```

The root `npm run dev:web -- --host ...` form does not reliably forward Vite flags and must not be used for release automation.

## 3. Scope classification

### 3.1 Explicitly excluded iOS/macOS tasks

Do not block the non-iOS release on these tasks:

- T039 — iOS manual-entry UI/Dynamic Type XCTest execution.
- T047 — iOS overview/filter XCTest execution.
- T055 — iOS categorization XCTest execution.
- T060 — native iOS categorization/rule UI and durable native rule mutations.
- T063 — iOS privacy/persistence XCTest execution.
- T073 — iOS sync-status/reconnect tests.
- T078 — iOS durable pending queue/reconnect integration.
- T089 — native iOS HIG, Dynamic Type, VoiceOver, Dark Mode, safe-area, haptic, and iOS 16 runtime validation.
- Native portions of T043, T058, T065, T066, T083, T084, T086, and T087.
- The native portion of T094 and all iOS steps in the original clean-machine rehearsal.

### 3.2 Already implemented web/shared portions that need closeout evidence, not a rewrite

These should receive targeted tests, documentation, or checklist reconciliation rather than a new architecture:

- **T043:** Web transaction forms already use the transactional encrypted mutation boundary. The iOS append-only integration remains deferred.
- **T058:** Web/shared category provenance, confidence, and review metadata are implemented. Native parity remains deferred.
- **T065:** Web privacy/settings explanations and controls are implemented. Native parity remains deferred.
- **T066:** Web encrypted export/import and validation are implemented. Native/shared parity and stronger file-capable automation remain deferred.
- **T084:** Web vault creation, switching, demo labeling, and isolation are implemented. Native adapter parity remains deferred.
- **T087:** Web/domain deletion and retention explanations are implemented. Native runtime parity and authenticated remote deletion need separate treatment.

### 3.3 Non-iOS work that remains materially open

The implementation plan must address:

- T062 — expanded shared privacy lifecycle tests.
- T069 — complete relay pairing contract coverage.
- T070 — encrypted snapshot/bootstrap contract tests.
- T071 — relay/web phone-away-equivalent queue/restart/idempotency tests.
- T074 — non-iOS relay discovery/secure endpoint/device registry work.
- T075 — non-iOS key exchange, durable key lifecycle, rotation, revocation, and protected web storage.
- T076 — authenticated encrypted snapshot/bootstrap implementation.
- T077 — production-quality encrypted append/exchange, known-clock, batch, replay, and retry behavior.
- T079 — web remote mutation ingestion and exactly-once projection application.
- T080 — connected web conflict detection/application/review/resolution.
- T081 — web sync status, reconnect, retry, backlog, device, and limitation surfaces.
- T082 — relay unauthorized-envelope/vault-isolation tests.
- T083 — named web demo/privacy integration coverage.
- T086 — file-capable browser backup restore evidence where the harness permits it.
- T087 — web/shared remote-deletion and retained-metadata disclosures where applicable.
- T088 — web design-system and responsive polish.
- T090 — manual and automated web accessibility/release review.
- T091 — complete test/performance evidence recorded under `docs/validation/`.
- T092 — security/threat-model/privacy-screen reconciliation.
- T093 — web/relay setup and limitation documentation.
- T094 — web/relay clean-machine substitute rehearsal; original iOS rehearsal remains deferred.
- T095 — final non-iOS lint/typecheck/test/browser/build gate.
- T096 — final requirements-to-tests traceability.

## 4. Ordered implementation phases

## Phase 0 — Freeze the boundary and traceability

**Tasks:** T043, T058, T065, T066, T084, T087, T096 preparation.

1. Treat the current uncommitted sync changes as the implementation baseline; do not overwrite them with a second sync architecture.
2. Create a traceability table mapping every non-iOS requirement and success criterion to implementation files, unit tests, integration tests, browser audits, or an explicit limitation.
3. Keep mixed tasks unchecked until their wording is split or their native portion is completed on macOS. Do not mark a mixed task fully complete based only on web evidence.
4. Record three distinct states everywhere:
   - local save,
   - relay acknowledgement,
   - remote projection applied.
5. Keep the production UI fail-closed: no decoder means no claim of cross-device financial projection.

**Exit criteria:** Every remaining task has an owner, dependency, evidence target, and explicit iOS exclusion where applicable.

## Phase 1 — Privacy, backup, and web release-boundary closeout

**Tasks:** T062, web portions of T065/T066/T087.

Expand domain and web tests for:

- lock/reopen with the wrong key;
- key cleanup after clear-local-data;
- recovery export before destructive operations;
- failed deletion/clear/export rollback;
- retained statement-original deletion;
- imported-record deletion and learned-rule retention;
- vault purge and cross-vault isolation;
- reload/restart after destructive operations;
- checksum, password, schema, reference, cancellation, and replacement failures;
- explicit warnings that pending mutations/device records are excluded from portable backups;
- explicit warnings that local deletion cannot erase data already delivered to another device.

Review Settings copy against `docs/security-model.md`. Keep the current encrypted backup and import-as-new implementation; do not replace it.

**Exit criteria:** Every destructive local operation either completes atomically or leaves the vault usable, and each privacy promise visible in the UI is backed by a test.

## Phase 2 — Web design, accessibility, responsive, and security review

**Tasks:** T088, T090, T092.

Audit Overview, Transactions, Import, Settings, and Sync at desktop and narrow mobile widths.

Verify:

- keyboard-only completion of create/edit/import/backup/delete/sync-review flows;
- visible focus and logical focus order;
- focus restoration after dialogs and confirmations;
- accessible names, labels, table semantics, and live-region announcements;
- WCAG AA contrast in default and dark themes;
- reduced-motion behavior;
- loading, empty, malformed-input, duplicate, conflict, and failed-sync states;
- long merchant names, large tables, narrow layouts, and overflow;
- destructive-action scope and plain-language privacy copy.

Resolve only concrete defects found in the existing token/design system. Do not wholesale-replace the current visual language.

Update security disclosures for browser storage limitations, localhost-only relay limitations, TLS/WSS status, key lifecycle, revocation limits, retained metadata, unsupported PDFs, and no-hosted-service claims.

**Exit criteria:** Automated axe checks pass for all routes, the manual checklist is recorded, and the UI never visually or verbally implies unsupported sync behavior.

## Phase 3 — Complete relay and pairing protocol contracts

**Tasks:** T069, T070, T077 test and contract portions.

### Pairing contract

Add tests for:

- short-lived server-generated codes;
- one-time enrollment;
- expiry before confirmation;
- expiry cleanup after disconnect;
- proof-of-possession failure;
- wrong vault and wrong device rejection;
- replayed proof rejection;
- revocation invalidation;
- capability denial;
- socket-bound token reuse from another connection.

### Snapshot/bootstrap contract

Define versioned manifest and message types for:

- vault ID and key version;
- snapshot ID and checkpoint;
- chunk index/count;
- ciphertext and authenticated metadata;
- checksum and signature;
- resume request;
- explicit merge preview;
- stale, wrong-vault, invalid-signature, invalid-checksum, and unsupported-version errors.

### Mutation exchange contract

Complete tests for:

- bounded upload/download batches;
- known-clock filtering;
- batch IDs and replay-cache stability;
- duplicate mutation IDs with identical envelopes;
- duplicate IDs with different envelopes;
- rejected oversized batches;
- retry/backoff classification;
- durable response replay after relay restart;
- explicit accepted/rejected/conflicting IDs.

**Exit criteria:** Contract tests define every accepted, rejected, retryable, and fail-closed state before transport hardening begins.

## Phase 4 — Durable, secure non-iOS relay and web device state

**Tasks:** T074, T075, non-iOS portions of T077.

Implement the local $0 path without a hosted service:

1. Add a durable local relay registry for vaults, devices, capabilities, key versions, revocations, and replay responses. The relay must persist only routing/authentication metadata and opaque encrypted envelopes.
2. Add secure endpoint configuration. Development may remain explicit localhost-only; LAN mode must require configured TLS/WSS credentials and must fail closed when absent.
3. Add a documented endpoint/discovery mechanism suitable for web clients. Do not claim automatic LAN discovery until it is actually implemented and tested.
4. Implement WebCrypto P-256 key generation/storage, device-specific wrapped vault-key records, key-version checks, rotation, and revocation. Browser storage limitations must remain disclosed.
5. Implement protected P-256 ECDSA signing-key storage, signing-key rotation, verification-key versioning, and revocation semantics for authenticated snapshot manifests.
6. Require accepting-device confirmation before a wrapped key becomes usable.
7. Bind authorization to vault, device, capability, and socket/session; reject wrong-vault envelopes before storage or projection.
8. Add restart tests proving registry, revocation, signing-key versions, and replay state survive relay process restart.

No production secrets or private keys may be committed. Use generated test material only in tests.

**Exit criteria:** Two authorized web projections can pair through the relay, unauthorized/wrong-vault clients are rejected, and relay restart does not erase security or replay state.

## Phase 5 — Authenticated snapshot/bootstrap and mutation exchange

**Tasks:** T076, remaining T077.

Implement:

- signed versioned snapshot manifests;
- AES-GCM encrypted snapshot chunks with authenticated associated data binding vault/snapshot/chunk context;
- P-256 signature verification before applying any snapshot;
- checksum and schema validation;
- resumable chunk transfer;
- explicit preview before replacing or copying a vault;
- stale/wrong-vault/unsigned/invalid snapshot rejection;
- post-bootstrap mutation catch-up from the checkpoint;
- known-clock exchange with bounded batches;
- replay-safe batch IDs and retry/backoff;
- response acknowledgement only for explicitly accepted envelopes.

Bootstrap must never silently replace a local vault. The UI must show source vault, target vault, merge/copy mode, counts, and whether pending local changes are excluded.

**Exit criteria:** A second web projection can bootstrap from an encrypted snapshot, resume an interrupted transfer, reject tampering, and catch up with mutations without duplicate application.

## Phase 6 — Full web envelope bridge and remote projection application

**Tasks:** T079, web/shared portions of T080 and T081.

The current production web app intentionally lacks a decoder, and several Settings mutations contain action metadata rather than complete entity projections. Correct this before claiming web-to-web sync:

1. Define a versioned authenticated mutation payload containing the complete validated entity projection needed for the operation.
2. Bind ciphertext AAD to vault ID, mutation ID, entity type, entity ID, operation, and key version.
3. Ensure category, rule, transaction, delete, restore, import, and privacy mutations either carry complete safe projections or are explicitly excluded from remote projection with a visible retryable status.
4. Keep decryption outside the relay. The relay stores and routes opaque envelopes only.
5. Validate decrypted payload entity, vault, ID, operation, changed fields, types, versions, and allowed fields.
6. Apply the projection and mutation-log exactly-once guard in one transaction.
7. Record conflicts before destructive overwrite when base versions/changed fields indicate unsafe concurrency.
8. Refresh transaction history, summaries, category totals, and pending/conflict counts after successful application.
9. Acknowledge a mutation only after the receiving projection commits successfully; failed projection must remain retryable.
10. Preserve the separately trusted source origin (`web`, `ios`, `importer`) for `last_modified_by` without using it to weaken envelope identity.

**Exit criteria:** A decoded remote web mutation appears exactly once in the second projection, failed decoding/application is retryable, and no UI reports “synced” before the required acknowledgement/application conditions are met.

## Phase 7 — Connected conflicts and truthful sync controls

**Tasks:** T080, T081.

Add or complete:

- connected conflict candidate creation;
- same-field conflict detection;
- safe different-field merge;
- unknown-field fail-closed behavior;
- keep-local, keep-remote, manual, and keep-both resolutions;
- immutable resolution retry semantics;
- reconnect and explicit retry controls;
- oldest pending mutation and last successful exchange;
- failed mutation reason and retryability;
- backlog details;
- forget-device/revoke flow;
- clear-local-pending warning;
- clear distinction between local save, relay receipt, and projection application.

**Exit criteria:** The Sync page is a complete state machine rather than a local-only review shell, while still refusing to claim capabilities not configured in the current environment.

## Phase 8 — Vault isolation, demo privacy, and file-capable evidence

**Tasks:** T082, T083, T084 web portion, T086 web portion, T087 web portion.

Add named tests for:

- relay rejection of wrong-vault envelopes;
- unauthorized capability attempts;
- private/demo vault creation and labeling;
- demo-only records and deletion scope;
- two-way vault switching without stale session data;
- encrypted friend export/import as isolated copy;
- source-vault preservation;
- category/rule/reference remapping;
- pending/device metadata exclusion from portable backups;
- deletion explanations for statements, transactions, rules, vaults, and mutation metadata;
- explicit authenticated remote-deletion/tombstone behavior or a fail-closed documented limitation, including the fact that local deletion cannot erase copies already delivered to another device.

Keep synthetic `DataTransfer` backup coverage, but pursue a file-capable browser runner only if it can reliably prove native `input.files`. Otherwise record the limitation rather than converting synthetic evidence into a false native-chooser claim.

**Exit criteria:** No cross-vault read/write or relay envelope path can cross scopes, and demo/copy flows are covered by named web tests plus live browser evidence.

## Phase 9 — Non-iOS release evidence and traceability

**Tasks:** T091, T093, T094 web/relay substitute, T095, T096.

Create:

- `docs/validation/non-ios-release.md` — exact commands, counts, warnings, and audit results;
- `docs/validation/traceability.md` — FR/SC → implementation → test/audit mapping;
- `docs/validation/web-relay-rehearsal.md` — clean-machine web/relay two-projection rehearsal;
- `specs/001-local-expense-tracker/quickstart.md` updates for web startup and limitations;
- root `README.md`/setup documentation updates;
- relay startup, backup/restore, browser requirements, and known sync-boundary documentation.

The validation record must include exact pass counts for parser accuracy, summary, mutation-log, pairing, encryption-boundary, phone-away-equivalent, conflict, accessibility, and 10,000-transaction performance suites, plus measured performance results and machine/runtime context. It must separately identify synthetic file injection from native file-chooser evidence.

The web/relay rehearsal must cover:

1. clean install/startup;
2. private and demo vault creation;
3. CSV and text-PDF import/review/commit;
4. manual create/edit/delete;
5. summaries/search/filter/category rules;
6. offline write and reload/restart persistence;
7. encrypted export and isolated copy import;
8. relay startup and two authorized web projections;
9. mutation upload, acknowledgement, remote application, summary refresh;
10. duplicate replay and relay restart;
11. same-field conflict and resolution;
12. wrong-vault/unauthorized rejection;
13. clear local data and backup warning behavior.

This is the explicit non-iOS substitute for the web/relay portion of T094. It must be recorded as separate evidence and must not be used to mark the original iOS phone-away acceptance scenario complete. The iOS portion remains deferred/platform-gated in the final traceability table.

## 5. Dependency order

```text
T062 privacy lifecycle
  -> T065/T066/T087 web closeout
  -> T088/T090/T092 web UX/security review

T069 pairing contracts + T070 bootstrap contracts + T077 exchange contracts
  -> T074 durable secure relay/device state
  -> T075 key lifecycle
  -> T076 snapshot/bootstrap
  -> T077 durable exchange
  -> T079 web projection application
  -> T080 connected conflicts
  -> T081 sync controls

T082/T083/T084/T086/T087 isolation and demo evidence
  -> T091/T093 documentation and validation records
  -> T094 web/relay rehearsal
  -> T095 final gate
  -> T096 final traceability
```

Do not start LAN/TLS complexity before the protocol and two-projection projection tests are stable. Do not configure a production decoder before complete authenticated entity payloads exist.

## 6. Final non-iOS validation matrix

Run these after implementation, sequentially where they share a server/profile:

### Static and automated

```bash
npm test
npm run typecheck
npm run lint
npm run build
npm run format:check
git diff --check
```

Focused suites:

```bash
npm run test:fixtures
npm run test:web
npm run test:relay
npx vitest run --project domain
npx vitest run --project parsing
```

### Browser development evidence

Start with the workspace-level command, not the root flag-forwarding form:

```bash
npm run dev --workspace @expense-tracker/web -- --host localhost --port 5191
```

Then run sequentially with fresh profiles:

```bash
node scripts/audit-browser.mjs 5191
node scripts/audit-reload.mjs 5191
node scripts/audit-offline.mjs 5191
node scripts/audit-restart.mjs 5191
node scripts/audit-vaults.mjs 5191
node scripts/audit-backup.mjs 5191
```

### Production evidence

Build and start preview on a clean port, then run:

```bash
node scripts/audit-browser.mjs 4173
node scripts/audit-reload.mjs 4173
node scripts/audit-service-worker.mjs 4173
```

Record synthetic file injection separately from native file chooser evidence. Never run multiple isolated audits concurrently against the same port.

### Security/adversarial evidence

Verify:

- wrong-vault envelope rejection;
- wrong capability/token rejection;
- expired/replayed pairing rejection;
- invalid signature/checksum rejection;
- wrong-key decryption failure;
- duplicate mutation and duplicate batch idempotency;
- failed projection leaves the mutation retryable;
- relay restart preserves authorization/replay state;
- local clear removes local keys and queue state;
- backup excludes device/mutation metadata.

### Performance evidence

Run parser accuracy/safety, summary performance, 10,000-transaction filters, bounded relay batches, bootstrap chunk limits, and memory/timeout checks. Record measurements and machine context; do not introduce machine-specific hard cutoffs without a documented basis.

## 7. Definition of done

The non-iOS scope is complete when:

- Every non-iOS implementation requirement has working code or an explicit documented limitation.
- Web local flows pass end-to-end: import, review, manual entry, summaries, categorization, offline operation, backups, privacy, vault isolation, and demo mode.
- Two web projections can pair through the local relay, bootstrap safely, exchange encrypted mutations, apply them exactly once, refresh summaries, and review/resolve conflicts.
- Relay security is fail-closed, durable, vault-scoped, and TLS/WSS behavior is explicit.
- No decoder, relay receipt, or local decision is mislabeled as remote projection success.
- Automated tests, typecheck, lint, build, accessibility checks, browser audits, adversarial checks, performance checks, and clean-machine web/relay rehearsal pass.
- `docs/validation/traceability.md` maps remaining non-iOS Speckit requirements to evidence.
- iOS-specific tasks remain clearly marked deferred rather than falsely checked.

## 8. Explicit residual iOS boundary after this plan

Even after this plan is complete, the following claims remain unavailable until macOS/Xcode/iOS validation:

- SwiftUI runtime and iOS 16/iPhone X layout validation.
- Native Keychain/SQLite/XCTest execution.
- Native import/privacy/export/demo parity.
- Native durable pending queue and foreground reconnect.
- The original phone-away/PC-later acceptance rehearsal.
- Native cross-client conflict review and accessibility validation.

Those are platform-gated deliverables, not defects in the non-iOS completion plan.
