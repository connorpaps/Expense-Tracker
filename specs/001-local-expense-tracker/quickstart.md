# Quickstart — Expense Tracker

## Prerequisites

- Node.js 22.5 or newer
- npm
- Chrome or Chromium for live browser audits
- No hosted database, account, paid API, or cloud credential is required for local web use

Install dependencies from the repository root:

```bash
npm install
```

## Run the web app

Use the workspace command directly when passing Vite host/port flags:

```bash
npm run dev --workspace @expense-tracker/web -- --host localhost --port 5191
```

Open `http://localhost:5191/`. The app creates a local SQLite-backed vault in the browser profile; mutation payloads and portable backups are encrypted, but the browser database itself should not be treated as equivalent to full-disk or iOS Keychain protection. CSV and text-based PDF parsing, manual entries, summaries, rules, backups, and privacy controls work offline after the app shell is available.

The shorthand `npm run dev:web` is suitable for the default port, but the workspace command above is preferred for explicit audit ports because root npm flag forwarding can be ambiguous.

## Optional localhost relay

The relay is an optional user-controlled companion. It stores opaque envelopes and is secure-mode localhost-only until durable registry and TLS/WSS setup are implemented:

```bash
npm run dev:relay
```

The relay is not a hosted sync service or a LAN security boundary. Do not expose it to a network without the planned authenticated TLS/WSS deployment.

## Current synchronization boundary

The web app clearly distinguishes local persistence from relay receipt and projection application. A browser-local non-exportable WebCrypto mutation key is scoped to one browser profile; a second browser cannot decrypt those records merely because both connect to the same loopback relay. The current web build therefore fails closed for general cross-browser projection. Import commits, privacy actions, conflict decisions, and other unsupported action-only records remain local-only and visible in Sync & review rather than being reported as synchronized.

Complete paired-device key delivery, signed encrypted snapshot/bootstrap, durable relay/device state, LAN discovery, connected two-projection rehearsal, and iOS phone-away validation remain future/platform-gated work.

## Backup and privacy

Use **Settings → Export encrypted backup** to create a password-protected `.etvault` file. The password cannot be recovered by the app. Backups contain portable vault records, not pending mutation queues or pairing/device metadata. Importing a backup creates a new isolated vault copy and leaves the source vault unchanged.

Local deletion controls explain their scope. Deleting local data cannot erase copies already delivered to another device. Browser IndexedDB/WebCrypto storage has weaker platform protection than iOS Keychain; protect the browser profile and backup password accordingly.

## Tests and audits

```bash
npm test
npm run typecheck
npm run lint
npm run build
npm run format:check
git diff --check
```

For a clean web browser audit, start the workspace server as above and run scripts in sequence:

```bash
node scripts/audit-browser.mjs 5191
node scripts/audit-reload.mjs 5191
node scripts/audit-offline.mjs 5191
node scripts/audit-restart.mjs 5191
node scripts/audit-vaults.mjs 5191
node scripts/audit-backup.mjs 5191
```

The backup audit uses synthetic file injection because the headless CDP harness cannot reliably expose native chooser `input.files`; it is not native file-chooser proof.
