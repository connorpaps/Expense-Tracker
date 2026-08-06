# @expense-tracker/contracts

Versioned, platform-neutral contract types shared by the web app, iOS app, relay,
and test fixtures: sync/mutation, pairing, snapshot bootstrap, import, conflict,
error, and UI-state contracts.

**Version**: 0.1.0 (see `CHANGELOG` entries below)

## Changelog

### 0.1.0 — 2026-08-04

- Import contract types (`ImportState`, `ImportRowReviewDto`, decisions).
- Sync contract types: mutation envelopes, clocks, exchange, snapshot bootstrap, pairing.
- Stable error codes and safe user-facing messages (`src/errors/`).
- Security interface contracts (key store, envelope cipher, signer, key versions).
- Categorization provenance/confidence vocabulary, including summary category source/confidence/review metadata.

## Source layout

```text
src/
├── api/            # import + UI-state contracts
├── sync/           # mutation, exchange, snapshot, pairing, conflict, ui-state
├── security/       # crypto/key lifecycle interfaces
├── errors/         # stable error codes + safe messages
└── categorization/ # provenance + confidence vocabulary
```
