# Expense Tracker — Full App Audit Report (2026-08-05)

**Scope:** Complete audit of the implemented app (spec tasks T001–T037, Phases 1–3 / US1 import-review MVP) — static validation plus live testing in real Chrome against both the dev server and the production build.

## Executive summary

**Everything currently in scope is working.** All static checks pass (typecheck, lint, 122/122 tests, production build) and all 21 live-browser audit scenarios pass against both the dev server and the production bundle, with a completely clean console (zero errors/exceptions/network failures). Local data persists across page reloads, and the relay serves health + WebSocket round-trips correctly.

The only "gaps" found are **spec-correct unimplemented future work** (US2–US7), not regressions — with one user-visible caveat: the Overview and Transactions pages are static shells whose empty-state copy becomes misleading once imports exist.

## 1. Static validation

| Check | Result |
|---|---|
| `npm run typecheck` (all workspaces) | ✅ Pass |
| `npm run lint` (ESLint) | ✅ Pass |
| `npm test` (Vitest) | ✅ 20 files / 122 tests pass |
| `npm run build` (web production) | ✅ Pass (chunk-size warnings only, see §4) |
| Relay tests | ✅ 10/10 |

## 2. Live browser audit (headless Chrome + CDP, fresh profile)

Audit tooling added this session: `scripts/audit-browser.mjs` (21-scenario E2E), `scripts/audit-reload.mjs` (reload persistence), `scripts/repro-import.mjs` (PDF regression). File injection uses a real `DataTransfer` `File` on the real file input — no mocked internals.

**Result: 21/21 PASS on dev server (`:5173`) and 21/21 PASS on the production build (`vite preview`), console clean in both.**

- Vault bootstrap: 1 vault, 10 seeded categories
- Navigation: Overview / Transactions / Import / Settings all render correct headings
- **CSV import:** Amex fixture → 5-row review table, correct dates/amounts, category suggestions (Starbucks → Food and Dining, Uber → Transportation), Exclude decision (Accept 4 / Exclude 1), commit → "4 transactions added"
- **Duplicate re-import:** exactly the 4 committed rows flagged "Possible duplicate", the excluded (uncommitted) row stays Ready; commit correctly blocked; "Needs attention" filter shows only flagged rows; exclude-all → commit → "0 transactions added" (no silent duplicates)
- **PDF import:** TD mock → 19-row review table (`pdf_text_table`), commit → "19 transactions added"
- **Empty file:** correct error card ("does not contain any recognizable transactions")
- **Malformed file:** 6 rows with per-row diagnostics, commit blocked
- **DB accounting:** 23 transactions, 3 import sessions, 29 import rows, 0 orphaned rows

## 3. Additional live checks

| Check | Result |
|---|---|
| Reload persistence | ✅ Same vault id, 5 committed transactions and 10 categories survive a full `Page.reload` (no re-seed) |
| Relay `/health` | ✅ `{"status":"ok", ...}`; unknown path → 404 |
| Relay WebSocket | ✅ `pong` round-trip over `ws://127.0.0.1:8712/ws` |
| Console/network during all flows | ✅ Zero errors, zero failed requests (only `favicon.ico` 404, cosmetic) |

## 4. Findings (non-blocking)

1. **Misleading empty states (most visible gap).** `DashboardPage` ("No spending yet") and `TransactionsPage` ("Nothing here yet") are static shells even after committing imports — US3 (summaries/list/search, T045–T052) is not yet implemented, so committed transactions never appear there. Per spec this is correct, but the copy is misleading. Options: implement US3 next, or soften the copy to indicate the feature is coming.
2. **Settings copy over-promises.** The page says "Export an encrypted vault backup from this screen" but no export/clear controls exist yet (US5, T065–T067). Adjust copy or implement.
3. **Bundle size warnings.** Main chunk 863 kB, parser worker 504 kB, `pdf.worker` 2.3 MB, wa-sqlite WASM 2.28 MB (expected for PDF.js/WASM). Non-blocking; code-splitting/manualChunks is a possible polish item (T088).
4. **First PDF parse latency.** The first in-session PDF parse cold-starts the PDF.js worker and can take several seconds (one run exceeded 30 s in a cold headless instance); subsequent parses are fast. Not a failure — allow generous waits in automated checks.
5. **iOS is source-only here.** Native app/XCTests cannot be compiled on this Windows machine (documented limitation); needs macOS/Xcode validation (T004/T018/T020/T024 scope).
6. **Relay is scaffold-only** by design: health + opaque envelope acknowledgment + idempotent replay store. Full pairing/sync protocol is US6 (T069–T081).

## 5. Recommendations / next steps

1. **Next implementation priority:** US2 manual entry (T038–T044) — it is the stated P1 prerequisite for US3 summaries and US6 sync, and it directly fixes the misleading Transactions page.
2. Follow with US3 (T045–T052) so Overview/Transactions reflect committed data.
3. Keep `scripts/audit-browser.mjs` as the regression gate for import flows (dev + production).
4. Budget iOS validation on macOS before claiming native parity.

## Tooling added this session

- `scripts/audit-browser.mjs` — 21-scenario browser E2E audit (dev or `vite preview` port argument)
- `scripts/audit-reload.mjs` — vault/transaction persistence across reload
- `scripts/repro-import.mjs` — focused PDF import regression (from the earlier bug fix)
