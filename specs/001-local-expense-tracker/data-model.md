# Data Model: Local Expense Tracker

**Feature**: [spec.md](spec.md)
**Research**: [research.md](research.md)

## Modeling principles

- Every durable record is scoped to exactly one private local vault.
- Client-generated IDs are stable across offline retries and synchronization.
- Monetary values are stored as exact minor units plus an explicit currency code; floating-point display values are never used as the source of truth.
- Imported source values remain available for review without replacing normalized values.
- Mutable records carry version and synchronization metadata so clients can detect stale edits and surface conflicts.
- Deletion is represented consistently enough for offline propagation and explicit user-visible deletion status.

## Entities

### LocalVault

Represents one user's isolated local product space.

| Field | Type | Rules |
|---|---|---|
| id | UUID | Required; stable client-generated vault identity |
| vault_owner_label | string | Optional local label for the vault owner; not an account identity and not required for operation |
| default_currency | ISO currency code | Required; valid ISO code; used only as a display/input default |
| locale | BCP 47 string | Required; valid locale; drives date/number/calendar presentation |
| week_start | enum | `locale_default`, `sunday`, or `monday` |
| demo_mode | boolean | Clearly labels sample data and prevents confusion with real records |
| created_at / updated_at | timestamp | Local UTC timestamps; device clocks are not used for conflict ordering |
| deleted_at | nullable timestamp | Set only through explicit vault deletion workflow |

**Relationships**: owns Categories, Transactions, StatementImports, CategorizationRules, SpendingSummaries (derived), PairedDevices, MutationLogs, Conflicts, and DemoDatasets.

**Vault key lifecycle**:

- The vault encryption key is generated locally and is never stored in plaintext in the database or relay.
- The browser protects the key through the platform's available local key/protected storage mechanism and an explicit unlock/recovery flow; iOS uses Keychain-backed protection. The selected web implementation must document its supported browser limitations before claiming encrypted-at-rest protection.
- A paired device receives only a device-specific wrapped vault key after the authenticated public-key handshake. Revocation stops future key wrapping and exchange; rotation creates a new key version and re-wraps it only for active devices.
- An encrypted recovery export is the user's only cross-device recovery path if every authorized device is lost. The UI must clearly warn that an unrecoverable key means unrecoverable vault data.

### PairedDevice

Represents a device explicitly authorized to exchange this vault's encrypted mutations.

| Field | Type | Rules |
|---|---|---|
| id | UUID | Stable device identity |
| vault_id | UUID | Required; local vault scope |
| display_name | string | Required; user-editable label |
| public_key | encoded key | Required; received only through the authenticated pairing handshake |
| capabilities | set | Explicitly granted `read`, `write`, `import`, or `export` capabilities |
| wrapped_vault_key | encrypted blob | Device-specific wrapped key; never plaintext; replaced on vault-key rotation |
| key_version | integer | Vault-key version used by this device |
| paired_at / last_seen_at | timestamp | Local timestamps; last-seen is informational |
| status | enum | `pending`, `active`, `revoked` |
| revoked_at | nullable timestamp | Set when the user forgets the device |

**Rules**:

- Pairing is single-use and requires confirmation on both devices.
- Revocation prevents new exchange and causes the device to be removed from future key wrapping; it does not retroactively erase data already delivered to that device.
- Private keys remain in platform-protected local storage and are never persisted by the relay.

### Category

A user-visible expense grouping.

| Field | Type | Rules |
|---|---|---|
| id | UUID | Stable client-generated ID |
| vault_id | UUID | Required; vault-scoped |
| name | string | Required; trimmed; unique among active categories per vault |
| slug | string | Derived stable identifier; updated carefully when renamed |
| kind | enum | `expense`, `income`, `transfer`, or `other` |
| color_token | design token reference | Must map to an accessible theme color; color cannot be the only meaning |
| icon_name | system/icon identifier | Must map to an approved web or SF Symbol family per client |
| position | integer | Unique ordering among active categories |
| is_active | boolean | Inactive categories remain available to historical transactions |
| created_at / updated_at | timestamp | Required |
| version | integer | Incremented on mutation |

**Rules**:

- At least one active fallback category MUST remain available.
- Deactivation MUST NOT orphan transactions.
- Merge requires explicit source/target confirmation and rewrites affected transaction category references through a versioned operation.

### Transaction

A normalized financial activity record.

| Field | Type | Rules |
|---|---|---|
| id | UUID | Stable client-generated ID; idempotent across retries |
| vault_id | UUID | Required; immutable vault scope |
| occurred_on | date | Required; parsed or manually entered |
| merchant_display | string | Required; user-visible normalized merchant |
| merchant_original | nullable string | Original parsed/source description |
| amount_minor | signed integer | Required; exact minor-unit amount; sign semantics documented in contract |
| currency | ISO currency code | Required; no implicit conversion |
| category_id | UUID | Required after commit; may be fallback/review category during import |
| category_source | enum | `user`, `personal_rule`, `default_rule`, `manual_required` |
| category_confidence | enum | `confirmed`, `high`, `medium`, `low`, `unresolved` |
| note | nullable string | User-editable; bounded length |
| source_type | enum | `manual`, `csv`, `pdf`, `demo` |
| statement_import_id | nullable UUID | References source import when applicable |
| source_row_key | nullable string | Stable source row reference for idempotent re-imports |
| review_state | enum | `confirmed`, `needs_review`, `excluded`, `conflict` |
| original_payload | nullable encrypted JSON | Restricted original fields needed for review; encrypted at rest and never rendered by default |
| created_at / updated_at | timestamp | Required |
| deleted_at | nullable timestamp | Tombstone until sync retention permits purge |
| version | integer | Incremented on every mutation |
| last_modified_by | enum | `web`, `ios`, `relay`, `importer` |

**Validation**:

- Merchant cannot be blank after trimming.
- Amount cannot be NaN, overflow, or an ambiguous sign.
- Date must be valid and representable in the user's selected calendar context.
- Currency must be explicit.
- An imported transaction cannot be committed with `needs_review` unresolved unless the user explicitly excludes it or confirms the fallback.

### StatementImport

A parsing session and import audit record. The first release applies the same CSV/PDF behavior on web and iOS: web parsing runs in a worker and iOS parsing runs in cancellable background work, both validated against shared fixtures.


| Field | Type | Rules |
|---|---|---|
| id | UUID | Stable client-generated ID |
| vault_id | UUID | Required; local vault scope |
| file_name | string | User-provided display name; sanitized |
| file_type | enum | `csv` or `pdf` |
| file_size_bytes | integer | Positive; bounded by configured import limit |
| source_fingerprint | string | Hash/fingerprint used for duplicate import warnings; does not expose file contents |
| bank_profile | nullable string | Recognized adapter/profile name, or `unknown` |
| parser_version | string | Identifies parser behavior used for reproducibility |
| status | enum | `queued`, `parsing`, `review`, `committed`, `cancelled`, `failed`, `partial` |
| total_rows | integer | Non-negative |
| recognized_rows | integer | Non-negative and <= total_rows |
| warning_count / error_count | integer | Non-negative |
| storage_reference | nullable string | Local vault retention key/reference only if original retention is enabled; never a hosted-object URL |
| created_at / completed_at | timestamp | Required where applicable |
| deleted_at | nullable timestamp | Explicit user deletion |

**State transitions**:

```text
queued -> parsing -> review -> committed
queued -> cancelled
parsing -> failed
parsing -> partial -> review
review -> cancelled
review -> committed
committed -> deleted
```

### ImportRowReview

A row-level parse and user decision record. This can be persisted as a child record or a local-only review projection until commit.

| Field | Type | Rules |
|---|---|---|
| id | UUID | Stable within the import |
| import_id | UUID | Required |
| source_row_number | integer | Positive |
| parsed_date | nullable date | Validated independently |
| parsed_merchant | nullable string | Preserves source text |
| parsed_amount_minor | nullable integer | Exact if unambiguous |
| parsed_currency | nullable code | Explicit or inherited from statement context |
| suggested_category_id | nullable UUID | May be unresolved |
| category_source / confidence | enum | Explainable suggestion metadata |
| row_status | enum | `valid`, `warning`, `error`, `duplicate_candidate`, `excluded`, `accepted` |
| diagnostic_code | nullable string | Stable machine-readable issue code |
| diagnostic_message | nullable string | Plain-language explanation |
| duplicate_candidate_ids | array UUID | Existing matching transaction candidates |
| user_decision | enum | `accept`, `exclude`, `edit`, `pending` |

### CategorizationRule

A default or user-specific rule used to suggest categories.

| Field | Type | Rules |
|---|---|---|
| id | UUID | Stable ID |
| vault_id | UUID | Required; local vault scope |
| category_id | UUID | Required while active |
| rule_type | enum | `default_keyword`, `default_pattern`, `personal_merchant`, `personal_pattern`, `context_override` |
| matcher | normalized string/JSON | Sanitized, bounded, and explainable |
| priority | integer | Higher specificity wins; deterministic tie-breaker |
| confidence | decimal/enum | Must be explainable; no false precision in UI |
| evidence_count | integer | Number of explicit corrections/confirmations supporting it |
| is_active | boolean | User can disable personal rules |
| created_from | enum | `system`, `user_correction`, `explicit_user_rule` |
| created_at / updated_at | timestamp | Required |
| version | integer | Incremented on mutation |

**Learning policy**:

- A single correction updates the transaction immediately but does not necessarily create a global personal rule unless the user chooses to save it or the configured evidence threshold is met.
- Personal rules outrank generic defaults but lose to explicit user selection during the current import.
- Rules with conflicting evidence become `context_override` candidates or require review; they do not silently oscillate.
- Removing a rule does not rewrite already confirmed historical categories unless the user explicitly requests a retroactive reclassification.

### SpendingSummary

A derived projection, not the source of truth.

| Field | Type | Rules |
|---|---|---|
| vault_id | UUID | Required; local vault scope |
| period_type | enum | `week`, `month`, `custom` |
| period_start / period_end | date | Inclusive range; validated start <= end |
| filter_signature | string | Stable normalized representation of filters |
| total_spend_minor | signed integer | Derived from eligible expense transactions |
| total_credits_minor | signed integer | Derived from eligible credits/refunds |
| net_activity_minor | signed integer | Derived; exact arithmetic |
| transaction_count | integer | Derived |
| category_totals | JSON/map | Derived per active filter |
| generated_at | timestamp | Required |

Summaries MUST be recalculable from transactions and MUST NOT be independently edited.

### MutationLogEntry

An append-only local mutation and its synchronization status. The mutation log is the source for replay, peer exchange, retry, and conflict diagnostics.


| Field | Type | Rules |
|---|---|---|
| id | UUID | Stable mutation ID; immutable |
| vault_id | UUID | Required; local vault scope |
| entity_type / entity_id | enum/UUID | Required |
| operation | enum | `create`, `update`, `delete`, `restore`, `merge`, `import_commit`, `rule_update`, `category_update` |
| base_version | integer | Version observed before local mutation |
| device_id | UUID | Required; local paired-device identity |
| lamport_clock | integer | Required; monotonic causal clock |
| vector_clock | JSON/map | Required for concurrent mutation detection |
| ciphertext | encrypted blob | Application-layer encrypted changed fields; relay need not read it |
| origin | enum | `web`, `ios`, `relay`, `importer` |
| status | enum | `pending`, `exchanged`, `applied`, `conflict`, `failed`, `disconnected` |
| conflict_id | nullable UUID | References ConflictRecord when needed |
| created_at / applied_at | timestamp | Required where applicable |
| retry_count | integer | Non-negative |
| last_error_code | nullable string | Stable diagnostic code |

### ConflictRecord

A user-visible record for an unsafe concurrent edit. It is local to the vault and itself replicated as a mutation when resolved.

| Field | Type | Rules |
|---|---|---|
| id | UUID | Stable ID |
| vault_id | UUID | Required; local vault scope |
| entity_type / entity_id | enum/UUID | Required |
| conflicting_fields | array | Only fields with incompatible edits |
| local_values | encrypted JSON/blob | Local candidate values encrypted at rest |
| remote_values | encrypted JSON/blob | Remote candidate values encrypted at rest |
| base_values | encrypted JSON/blob | Last common known values when available, encrypted at rest |
| status | enum | `open`, `resolved_local`, `resolved_remote`, `resolved_manual` |
| resolved_values | JSON | Required when manually resolved |
| created_at / resolved_at | timestamp | Required where applicable |

### DemoDataset

Clearly labeled sample data used for portfolio demonstration.

| Field | Type | Rules |
|---|---|---|
| id | UUID | Stable ID |
| vault_id | UUID | Isolated from real user records |
| name | string | Must be visibly labeled as sample/demo |
| seed_version | string | Reproducible fixture version |
| created_at | timestamp | Required |

## Relationships

```text
LocalVault 1 ── * Category
LocalVault 1 ── * Transaction
LocalVault 1 ── * StatementImport
StatementImport 1 ── * ImportRowReview
StatementImport 1 ── * Transaction
LocalVault 1 ── * CategorizationRule
Category 1 ── * Transaction
Category 1 ── * CategorizationRule
LocalVault 1 ── * MutationLogEntry
MutationLogEntry 0..1 ── 1 ConflictRecord
LocalVault 1 ── * PairedDevice
LocalVault 1 ── * DemoDataset
```

## Indexes and query needs

- `(vault_id, occurred_on)` for weekly/monthly/custom summaries.
- `(vault_id, merchant_display, occurred_on)` for search, personal rules, and duplicate candidates.
- `(vault_id, category_id, occurred_on)` for category filtering.
- `(vault_id, source_fingerprint)` for repeated import warnings.
- `(vault_id, status, created_at)` for mutation queue and conflict review.
- `(vault_id, device_id, lamport_clock)` for mutation exchange.
- Client local stores MUST support indexed queries for period and category filters without accessing unrelated vaults.

## Privacy lifecycle and deletion/retention

- Forgetting a paired device MUST stop future mutation exchange with that device and revoke its pairing key.
- Clear local data MUST require explicit confirmation and MUST explain that unsynchronized changes will be removed from that device.
- Export MUST produce an encrypted vault backup plus an optional normalized, user-readable transaction export.
- User-triggered deletion creates tombstones first so paired devices remove the record.
- Statement originals default to deletion after parsing unless the user opts into local retention; the import metadata remains only as long as needed to explain provenance and deletion behavior.
- Learned rules are independent records and are not automatically deleted when one transaction is deleted. The UI MUST explain this and offer rule management.
- Vault deletion requires export confirmation and removes local records only after the user confirms the selected scope.

