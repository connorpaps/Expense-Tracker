# Application Contracts: Local Vault and Peer Synchronization

These contracts describe the client-visible behavior between the local web/iOS clients, an optional free user-controlled relay, and the parsing/categorization domain. No hosted provider, paid cloud account, or App Store service is required.

## Contract conventions

- A **vault** is the isolated data boundary. Clients MUST NOT apply mutations from another vault without explicit import/merge confirmation.
- Every mutation has a stable `mutation_id`, `device_id`, logical clock metadata, entity ID, operation, affected fields, and payload.
- Dates are ISO calendar dates (`YYYY-MM-DD`); timestamps are ISO 8601 UTC.
- Monetary values use integer minor units plus a three-letter currency code.
- Mutation payloads exchanged over the relay are application-layer encrypted envelopes.
- The relay MUST NOT need to read normalized financial values to route or store mutations.
- Errors return a stable `code`, safe user-facing `message`, and optional entity/field/row reference.

## Vault lifecycle contract

### Create vault

A client can create a new local vault without network access or credentials.

Required outcomes:

- Generate a new vault ID and local encryption key.
- Create default categories and an empty mutation log.
- Show the vault name and last local save status.
- Offer encrypted export immediately as a backup path.

### Open/import vault

A client can open a local vault or explicitly import an encrypted vault export.

Rules:

- The client validates format, version, checksum, and encryption before modifying the active vault.
- Import MUST use a preview and explicit confirmation when it would merge with existing data.
- Corrupt or incompatible exports remain untouched and produce a recoverable error.

### Pair device

`pairing/start` and `pairing/accept` are logical operations implemented over a local HTTPS/WebSocket channel or equivalent user-controlled relay.

```json
{
  "vault_id": "uuid",
  "initiating_device_id": "uuid",
  "pairing_code": "short-lived-code",
  "expires_at": "2026-08-04T19:05:00Z",
  "capabilities": ["read", "write", "import", "export"]
}
```

Rules:

- Pairing requires explicit user confirmation on both devices and occurs in a foreground session.
- Pairing codes expire quickly and are single-use.
- The handshake authenticates a one-time public-key exchange; each device keeps its private key in platform-protected storage.
- After confirmation, the initiating device sends a device-specific wrapped vault key and current key version; the accepting device decrypts it locally and never forwards plaintext key material.
- The user can revoke a paired device, rotate keys, and clear that device's local vault. Rotation creates new wrapped keys for active devices, retains prior key versions until encrypted historical records are migrated or explicitly retired, and marks revoked-device keys unusable for future exchange. Revocation cannot erase data already delivered to that device.
- The relay cannot pair a device to a vault without the pairing handshake and must reject replayed pairing or mutation identifiers.
- The local web companion exposes an authenticated secure endpoint; development certificate/trust setup is documented, and plaintext transport is not an accepted production behavior for financial data.
- iOS local-network permission and foreground reconnect behavior are explicit UX states; background sync is not required in the first release.

### Initial vault bootstrap

The currently authorized initiating client is the snapshot authority for a newly paired device. The relay only routes authenticated opaque chunks and cannot inspect the snapshot contents.

A newly paired device has no local clock or records. It MUST bootstrap before ordinary mutation exchange:

```json
{
  "vault_id": "uuid",
  "device_id": "uuid",
  "key_version": 1,
  "encrypted_snapshot": "base64url(...)",
  "snapshot_checkpoint": { "device-a": 42 },
  "has_more": false
}
```

Rules:

- The snapshot is encrypted for the newly paired device and includes vault metadata, categories, transactions, active rules, tombstones required for correctness, and a mutation checkpoint; raw statement originals are included only when explicitly retained.
- The receiving device validates the vault ID, decrypts locally, verifies the snapshot checksum/version, and previews any merge before replacing or merging local data.
- Bootstrap is resumable and idempotent. After applying the checkpoint, the device requests mutations newer than that checkpoint.
- If bootstrap fails, the receiving device keeps its existing vault untouched and reports a recoverable error.

## Mutation contract

### Mutation envelope

```json
{
  "mutation_id": "uuid",
  "vault_id": "uuid",
  "device_id": "uuid",
  "clock": {
    "lamport": 42,
    "vector": { "device-a": 42, "device-b": 17 }
  },
  "entity_type": "transaction",
  "entity_id": "uuid",
  "operation": "update",
  "base_version": 3,
  "changed_fields": ["category_id", "category_source"],
  "ciphertext": "base64url(...)"
}
```

Allowed operations:

- `create`
- `update`
- `delete`
- `restore`
- `merge`
- `import_commit`
- `rule_update`
- `category_update`

### Append mutation

Local writes append a mutation before updating the user interface. The local mutation is durable even when no relay is reachable.

Rules:

- Applying the same mutation ID more than once is a no-op.
- Mutations must be ordered by causal metadata, not device wall-clock time alone.
- A local operation returns `saved_local` immediately, then reports `pending_sync`, `synced`, `disconnected`, `failed`, or `conflict` separately.
- The payload is decrypted only by an authorized paired client.

### Offline queue and later PC synchronization

An iOS client MUST be able to create a valid expense without a reachable PC or relay. It appends the mutation to its durable local queue before reporting `saved_local` and keeps the mutation across app restarts, temporary network loss, and foreground/background transitions. When the user later opens the iOS app and the PC web app/relay in a foreground connected session, the clients exchange the queued backlog in batches.

Rules:

- The queue is ordered by causal metadata and exposes pending count, oldest pending time, last attempt, and safe retry status.
- Batch exchange is retry-safe; applying a mutation ID already present on the PC is a no-op.
- A successful backlog drain changes each mutation to `synced` and updates the PC transaction history and derived summaries exactly once.
- If the PC/relay is unavailable, the iOS app remains fully usable and explains that the expense is saved locally but not yet available on the PC.
- The first release does not require background sync or internet-wide sync while the PC is unreachable.

### Exchange mutations

`sync/exchange` is a logical protocol over local transport.

```json
{
  "vault_id": "uuid",
  "device_id": "uuid",
  "known_clock": { "device-a": 42, "device-b": 17 },
  "requested_limit": 500,
  "batch_id": "uuid",
  "oldest_pending_mutation_id": "uuid"
}
```

Response:

```json
{
  "vault_id": "uuid",
  "mutations": [
    {
      "mutation_id": "uuid",
      "clock": { "lamport": 43, "vector": { "device-a": 43 } },
      "ciphertext": "base64url(...)"
    }
  ],
  "checkpoint": { "device-a": 43, "device-b": 17 },
  "has_more": false
}
```

Rules:

- Exchange is safe to retry.
- Devices request only mutations missing from their known clock.
- The relay may persist encrypted envelopes for later exchange, but local clients remain the source of truth.
- If the relay is unavailable, the client remains fully usable and reports disconnected status.

## Conflict contract

A conflict occurs when causally concurrent mutations change the same financial field or otherwise cannot be safely merged.

```json
{
  "conflict_id": "uuid",
  "vault_id": "uuid",
  "entity_type": "transaction",
  "entity_id": "uuid",
  "conflicting_fields": ["amount_minor", "category_id"],
  "local_candidate": "encrypted-or-local-reference",
  "remote_candidate": "encrypted-or-local-reference",
  "base_candidate": "encrypted-or-local-reference",
  "status": "open"
}
```

Allowed resolutions:

- `keep_local`
- `keep_remote`
- `manual_edit`
- `keep_both` where the conflict represents genuinely separate transactions rather than two edits to one record

Resolution creates a new mutation and preserves the prior candidates until safe log compaction.

## Import contract

Imports run locally on web and iOS. The normalized result uses the same contract on both platforms.

Required import states:

- `queued`
- `parsing`
- `review`
- `committed`
- `cancelled`
- `failed`
- `partial`

Each row exposes normalized values, original source values, category suggestion, confidence/provenance, duplicate candidates, diagnostics, and an explicit user decision.

## Error contract

```json
{
  "error": {
    "code": "PAIRING_EXPIRED",
    "message": "The pairing code expired. Start pairing again on both devices.",
    "entity_reference": null,
    "retryable": false
  }
}
```

Required stable error families include:

- `VAULT_INVALID`, `VAULT_VERSION_UNSUPPORTED`, `VAULT_DECRYPT_FAILED`, `VAULT_EXPORT_FAILED`
- `PAIRING_EXPIRED`, `PAIRING_REJECTED`, `PAIRING_REVOKED`, `PAIRING_KEY_MISMATCH`
- `SYNC_DISCONNECTED`, `SYNC_RETRYABLE`, `SYNC_MUTATION_INVALID`, `SYNC_CONFLICT`, `SYNC_BACKLOG_PENDING`, `SYNC_BATCH_DUPLICATE_SAFE`
- `VALIDATION_FAILED`, `CURRENCY_REQUIRED`, `AMOUNT_INVALID`, `DATE_INVALID`
- `IMPORT_UNSUPPORTED_TYPE`, `IMPORT_TOO_LARGE`, `IMPORT_EMPTY`, `IMPORT_PARSE_FAILED`
- `IMPORT_ROW_AMBIGUOUS`, `IMPORT_DUPLICATE_CANDIDATE`, `IMPORT_COMMIT_INCOMPLETE`
- `DELETE_CONFIRMATION_REQUIRED`, `CLEAR_LOCAL_DATA_CONFIRMATION_REQUIRED`

## UI contracts

All critical operations expose these states to both clients:

- `idle`
- `working` with progress or status text when work exceeds a brief interaction
- `saved_local`
- `synced`
- `empty` with a next action
- `warning` with affected scope and user choice
- `error` with safe message, retry/manual path, and preserved local work
- `disconnected` with pending mutation count, oldest pending time, and last exchange time
- `pairing` with device and vault identity information
- `conflict` with affected fields and resolution action

The web and iOS surfaces may render these states differently, but state meaning, vault boundaries, and destructive-action confirmation MUST remain consistent.
