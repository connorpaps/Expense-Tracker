# Security model

## Goals and non-goals

Expense Tracker is local-first. The security goal is to keep financial records in a
vault controlled by the user, prevent accidental cross-vault access, protect sync
payloads in transit and at the relay, and make destructive data operations explicit.
The required path has no hosted identity provider, service-role key, hosted database,
or cloud backup.

The relay is a user-controlled companion. It is not a trusted financial-data reader,
and it is not the only copy of a vault. It should see only opaque encrypted envelopes
and metadata required for routing/replay protection.

## Data boundaries

- Web and iOS local vaults are the authoritative stores for their device.
- Every durable domain row is scoped by `vault_id`; repositories require a vault ID
  for reads and writes.
- Statement originals are local and should be treated as ephemeral/private. The
  import contract retains normalized source metadata and diagnostics without
  requiring a hosted upload.
- The relay stores or forwards opaque encrypted mutation/snapshot envelopes only.
- Demo data must live in a separate, explicitly labeled vault and never query a
  personal vault.

## Cryptographic design contract

The shared contract specifies:

- AES-256-GCM for application payload encryption.
- HKDF-SHA-256 for key derivation where a platform adapter needs derivation.
- P-256 ECDH for device-specific vault-key wrapping.
- P-256 ECDSA for authenticated snapshot manifests.
- 12-byte unique nonces for AES-GCM and authenticated associated data binding the
  ciphertext to its vault/entity context.

The relay does not possess plaintext vault keys. A paired device receives only a
wrapped copy of the vault key intended for that device, with an explicit key version.

## Key lifecycle

1. Generate vault key material locally.
2. Store the active key through platform-protected storage where available (browser
   protected storage has weaker guarantees than iOS Keychain and must be disclosed).
3. During pairing, wrap a device-specific copy using the authorized device's P-256
   public key; never send the plaintext vault key to the relay.
4. Include key version metadata in wrapped keys, snapshots, and mutation handling.
5. During rotation, retain historical versions only until records are migrated and
   the user-approved retirement point is reached.
6. Forget-device/revocation removes that device's authorization and wrapped-key
   material; it does not magically erase data already observed by a compromised
   device.
7. Clear-local-data removes local vault/key material and pending queue state. Recovery
   is possible only from an explicitly encrypted export whose password/key the user
   controls.

## Pairing and synchronization

Pairing must be short-lived, single-use, explicit on both foreground devices, and
bound to a vault. Exchange requests include a vault ID, device ID, batch ID, and
known clock. Stable mutation IDs and relay replay detection prevent a retried batch
from being applied twice. Clients apply mutations idempotently and preserve tombstones.

Lamport/vector clock metadata identifies causal order and concurrent edits. Field-aware
conflicts are surfaced for review instead of silently choosing a value. The relay's
current scaffold verifies transport shape and batch replay behavior; full authenticated
pairing, snapshot bootstrap, device registry, and conflict resolution are later US6
work and must not be implied by the scaffold.

## Threats and limitations

- A compromised browser process can read an unlocked web vault; browser local storage
  is not equivalent to iOS Keychain or hardware-backed storage.
- A compromised iOS device or paired device may access data available to that device.
- Same-network security, TLS/certificate setup, Local Network permission, and relay
  discovery require an explicit production hardening pass before treating LAN sync as
  release-ready.
- Password recovery cannot be provided by a server in the $0 local-only architecture;
  losing the encrypted export credential can make recovery impossible.
- Metadata such as connection timing, batch size, and vault/device identifiers may be
  visible to the local relay even though financial payloads remain encrypted.
- OCR, password-protected PDFs, and image-only PDFs are intentionally unsupported in
  the first import path rather than silently processed incompletely.

## Implementation status

Implemented now:

- Vault-scoped SQL schema/repository boundaries and tombstone/index constraints.
- Platform-neutral AES-GCM/ECDH/HKDF/signature interfaces with dedicated ECDH and ECDSA test keys.
- WebCrypto-style envelope test helpers and relay opaque replay/idempotency tests.
- Web local vault adapter plus iOS source adapters for Keychain-backed keys, AES-GCM encrypted SQLite rows, and restart-persisted pending IDs.
- Cancellable native CSV/text-PDF parsing and explicit local import review/commit source flow.

Still required before production sync claims:

- Browser protected-key storage and encrypted recovery export/import.
- Authenticated pairing and end-to-end P-256 snapshot signing/verification across both clients.
- Secure LAN endpoint setup, certificate/authentication guidance, and Local Network permission flow.
- Encrypted native mutation-envelope creation and complete two-client conflict review.
- macOS Xcode compilation, XCTest execution, and runtime fixture parity validation.
