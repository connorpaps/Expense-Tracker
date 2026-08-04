# Phase 0 Research: Local Expense Tracker

**Feature**: [spec.md](spec.md)
**Date**: 2026-08-04

## Decision 1: Strict $0-required local-first architecture

**Decision**: The required product path uses no paid hosted service, paid API, cloud credential, App Store membership, TestFlight, or third-party hosted sync tier. Each client owns a local encrypted vault. A free local-network or user-controlled relay exchanges encrypted mutation envelopes when devices are connected. Optional static hosting may publish the demo shell, but the application remains fully functional when run locally.

**Rationale**:

- The user explicitly requires free setup and does not need App Store publication.
- Local vaults preserve offline operation, privacy, and fast summaries without depending on a cloud database.
- A mutation-log protocol can synchronize web, iOS, and future desktop clients without tying the data model to one vendor's hosted plan.
- A local companion/relay is a practical free bridge between a browser and an iPhone on the same network. It can also be packaged with a future desktop app.

**Alternatives considered**:

- **Supabase + PowerSync Cloud**: productive and technically strong, but hosted free-tier behavior is not a permanent cost guarantee and Supabase free projects may pause after inactivity.
- **Self-hosted Supabase + PowerSync**: no software subscription is required, but it adds a large operational footprint and is unnecessary for the core local app.
- **Cloudflare-only custom backend**: free-tier hosting is possible, but a custom auth and sync engine increases financial data integrity risk.
- **File-only iCloud/Syncthing synchronization**: can be free for some users, but browser file access, iOS sandbox access, pairing, and conflict-safe writes are inconsistent across platforms.

## Decision 2: Local encrypted vaults

**Decision**: Store normalized transactions, categories, learning rules, imports, and mutation logs in a local SQLite-compatible vault on each client. Use platform-appropriate encryption/key protection and support explicit encrypted vault export/import.

**Rationale**:

- SQLite is public-domain software and works across web/WASM, iOS, and future desktop targets.
- Local data remains available without an account, network, or hosted provider.
- Vaults provide a clear privacy boundary: one user can maintain separate personal and demo vaults, and a friend can receive a separate exported copy.
- Append-only mutations plus tombstones support safe replay, backup, and synchronization.

**Required behaviors**:

- Sensitive fields including retained source payloads, vault-key material, and unresolved conflict candidates are encrypted at rest; the implementation must identify which browser storage primitive and iOS Keychain/SQLite protection provide that guarantee and test locked/reopened behavior.
- The browser vault uses an IndexedDB/SQLite-compatible local store; the exact library must have a no-cost permissive license and must not require a hosted service. Before implementation, the browser encryption design must document its threat-model boundary, key derivation/unlock behavior, protected key wrapping, locked/reopened tests, and the limitations of browser storage; it must not claim stronger protection than the chosen platform permits.
- iOS uses SQLite or an iOS 16-compatible SQLite wrapper; SwiftData is prohibited because it requires iOS 17.
- Vault export/import is explicit, encrypted, versioned, and validated before replacing or merging local data.
- A vault is never exposed as an unprotected downloadable database through the UI.
- The app provides `Forget paired device`, `Clear local data`, export, import, and recovery/error states.

## Decision 3: Free peer pairing and relay transport

**Decision**: Use a free local-network transport between the web companion and iOS client, with an optional user-controlled relay process for discovery and mutation exchange. Use platform discovery such as Bonjour/mDNS where available, an explicit pairing code, short-lived pairing keys, encrypted transport, and application-layer encrypted mutation envelopes.

**Rationale**:

- Same-network communication avoids hosted infrastructure charges and works well for a personal phone plus local computer.
- Explicit pairing is more appropriate than a fake cloud account when the user owns the devices.
- A relay process can be run locally with Node.js or another free runtime and can later be bundled into a desktop application.
- Application-layer encryption means the relay stores or forwards ciphertext rather than plaintext financial records.

**Implementation and security requirements**:

- Devices must be reachable on the same local network or through a user-controlled relay to synchronize. The web app connects to the companion through an explicit localhost/LAN endpoint; the implementation must document development certificates or an equivalent authenticated secure channel rather than silently downgrade to plaintext for financial data.
- The iOS client must request and explain Local Network permission, use Bonjour/mDNS or an explicit local endpoint, and perform the pairing handshake in the foreground. Background execution is not required for the first release; synchronization guarantees apply to foreground, connected sessions and resume safely when the app returns to the foreground.
- Pairing uses a short-lived code to authenticate a one-time public-key exchange. The initiating device sends a device-specific wrapped vault key only after the accepting device confirms the displayed pairing details. Each device stores its private key in platform-protected storage; the vault key is generated locally, wrapped for paired devices, and never sent as plaintext to the relay. Clear-local-data removes the local key; export creates a separately encrypted recovery backup and the UI must state that an unrecoverable key means unrecoverable vault data. Key rotation retains prior key versions until all retained snapshots, mutation envelopes, tombstones, conflict candidates, and exports are migrated or explicitly retired; revoking a device prevents future exchange but cannot erase data that device already received.

- Relay transport uses authenticated encryption and application-layer encrypted mutation envelopes. The relay may route opaque ciphertext but must reject unknown vault/device pairs and replayed mutation IDs. The currently authorized initiating client creates and signs/encrypts a versioned snapshot for the newly paired device; the relay routes opaque chunks without reading them. The new device verifies the authenticated manifest/checksum, receives the wrapped vault key, resumes interrupted chunks by checkpoint, and then catches up through mutation exchange. Bootstrap never replaces an existing local vault without explicit confirmation.

**Limitations accepted by the product**:

- An expense added on iOS while away from the PC is retained in the iOS vault and pending mutation queue across app restarts. When the user later returns to the PC's local network, opens the iOS app and PC web app/relay in the foreground, the backlog is exchanged and applied idempotently.
- Remote sync while the PC is unreachable or outside the user's network is not required for the $0 baseline. A future user-provided tunnel or self-hosted server may be documented as optional; the first release must not imply that a hosted service is included.
- A browser cannot reliably run a background network daemon, so the PC web app requires the local companion/relay to be running for automatic LAN sync; local vault operation remains available without it.
- iOS free provisioning requires periodic reinstallation, but that does not affect vault data or the local sync protocol.

## Decision 4: Append-only mutation log and conflict handling

**Decision**: Every create, update, delete, restore, category-rule change, and import commit produces an immutable mutation with a stable ID, device ID, logical clock, affected fields, and encrypted payload. Devices exchange missing mutations and apply them idempotently. Concurrent changes to the same financial field create a visible conflict record.

**Rationale**:

- A mutation log is implementable without a hosted database or central account service.
- Stable IDs prevent duplicate application when a device retries after disconnecting.
- Lamport or vector-clock metadata provides deterministic causality without trusting device wall clocks.
- Financial values and categories should not be silently overwritten by last-write-wins.

**Rules**:

- New records use client-generated UUIDs.
- Deletes are tombstones and are synchronized before eventual compaction.
- Independent edits to non-overlapping fields may merge.
- Concurrent edits to amount, date, merchant, currency, category, or source identity produce a `ConflictRecord`.
- Conflict resolution creates a new mutation and preserves the prior candidates for audit/recovery.
- Mutation-log compaction is allowed only after all paired devices acknowledge a safe checkpoint or the user creates a new export backup.

## Decision 5: Web and iOS stack

**Decision**: Use React, TypeScript, Vite, SQLite-compatible local storage, Papa Parse, PDF.js, Swift, SwiftUI, and XCTest. All required dependencies must be free to install and use and must not require a hosted account. The exact SQLite and local transport libraries will be selected during implementation only after license and iOS 16 compatibility checks.

**Rationale**:

- React/TypeScript/Vite provide fast local web development and can be statically hosted at no cost if desired.
- SwiftUI provides a native iOS experience on iOS 16 without a paid publication account.
- Papa Parse and PDF.js support on-device parsing without paid document APIs or uploading financial files.
- SQLite-compatible storage supports future desktop packaging and a shared data model.

**Design constraints**:

- One coherent token system across web surfaces; no generic dashboard cards or AI-purple gradients.
- Explicit loading, empty, error, parsing-review, offline, pairing, disconnected, sync, and conflict states.
- Keyboard navigation, focus visibility, WCAG AA contrast, semantic labels, and responsive layouts are release gates.
- iOS uses HIG patterns, semantic colors, Dynamic Type, VoiceOver, safe areas, and 44pt targets.

## Decision 6: Native iOS development and free installation

**Decision**: Use SwiftUI with an iOS 16 minimum deployment target and install the app locally on the owner's iPhone through Xcode and a free Apple Account/Personal Team. App Store publication, TestFlight, paid provisioning, and public distribution are explicitly out of scope.

**Rationale**:

- Apple permits development and personal device testing with a free Apple Account, subject to periodic re-provisioning.
- The user does not require public App Store distribution.
- The free path avoids a recurring Apple Developer Program fee while preserving real-device validation.

**Compatibility rules**:

- Core flows must run on iOS 16.0 or later, including the iPhone X.
- SwiftData and iOS 17-only APIs cannot be prerequisites.
- iOS 17+ APIs may be used only behind availability checks with an iOS 16 fallback.
- The local installation workflow must document the expected periodic rebuild/reinstall limitation.

## Decision 7: Parser safety and on-device processing

**Decision**: Parse CSV and text-extractable PDF files on-device, using a web worker on web and cancellable background work on iOS. Enforce a 10 MB maximum file size, 60 PDF pages, 5 MB extracted text, 50,000 rows, and a 30-second default parse budget with cancellation.

**Rationale**:

- Financial files never need to leave the user's device for the required path.
- Worker/background processing preserves interface responsiveness.
- Explicit limits reduce resource exhaustion risks on browsers and iPhone X-class hardware.
- Encrypted and image-only PDFs are clear unsupported/manual-review states in the first release; OCR is deferred.

## Decision 8: $0 validation and quality strategy

**Decision**: Use local unit, fixture, browser, accessibility, Swift XCTest, pairing, mutation-log, conflict, and performance tests. Tests run on free local toolchains and sanitized fixtures, without paid cloud credentials.

**Required gates**:

- A clean-machine setup completes with no paid credentials.
- Web local vault works with networking disabled.
- iOS app installs locally through free Xcode provisioning.
- Web and iOS pair over a local network and exchange encrypted mutations.
- Two vaults remain isolated.
- Parser fixtures reach the 95% extraction target.
- 10,000 local transactions meet summary/filter performance targets.
- Export/import, clear-local-data, forget-device, and conflict recovery work.
- Optional static hosting is tested separately and cannot be a prerequisite.

## Resolved planning unknowns

- **Required backend**: none; the PC runs the local web app and optional free user-controlled relay.
- **Offline synchronization**: append-only encrypted mutation log over local-network pairing/relay.
- **Web client**: React, TypeScript, Vite.
- **Native client**: SwiftUI with iOS 16 minimum.
- **Storage**: SQLite-compatible local vault per client.
- **Parsing**: Papa Parse and PDF.js or equivalent no-cost local libraries.
- **PDF scope**: text-extractable PDFs for the first release; explicit unsupported/OCR path.
- **Encryption**: encrypted local vaults, protected device keys, encrypted peer transport, and application-layer encrypted mutation envelopes.
- **Conflict policy**: stable IDs, Lamport/vector-clock causality, field-aware merges, visible conflicts for simultaneous financial-field edits.
- **Parser limits**: 10 MB file, 60 PDF pages, 5 MB extracted text, 50,000 rows, 30-second default budget, and user cancellation.
- **Distribution**: free local iOS installation through Xcode; App Store/TestFlight excluded.
- **Hosting**: optional static hosting only; no paid or hosted backend is required.
