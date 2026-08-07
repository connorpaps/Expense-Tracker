---
version: 1
slug: "apps-web-src-app-tsx"
primary_target: "apps/web/src/App.tsx"
related_targets: ["apps/web/src/features/dashboard/DashboardPage.tsx","apps/web/src/features/transactions/TransactionsPage.tsx","apps/web/src/features/imports/ImportPage.tsx","apps/web/src/features/settings/SettingsPage.tsx","apps/web/src/features/sync/SyncPage.tsx"]
---

# Web app surface brief

## Mode and scope

**Mode:** Operate.

This is a replacement visual world for the existing local-first web app, not a marketing page. Preserve the current route slugs and core workflows for this pass: Overview, Transactions, Import, Settings, and Sync & review. The redesign may improve page composition and responsive treatment inside those routes, but it must not change product truth, vault isolation, currency semantics, import review behavior, privacy boundaries, or honest sync terminology.

## Audience and job

The primary audience is a privacy-conscious person using a desktop or laptop as a financial workbench: reviewing statement imports, correcting categories, checking spending, managing vaults, and maintaining backups. Portfolio reviewers are a secondary audience and should understand the craft through the real product mechanism rather than invented claims.

The user should be able to orient quickly, identify what is local and safe, inspect financial records with confidence, complete review-heavy tasks efficiently, and understand pending or limited sync without guessing.

## Core tasks and proof

- **Overview:** understand the selected period, spend/credit/net activity, category distribution, and recent records; move quickly to history or import.
- **Transactions:** search, filter, sort, create, edit, delete, inspect category provenance, and apply explicit corrections.
- **Import:** select a supported statement, understand diagnostics and duplicates, review category suggestions, correct rows, and commit only intentional changes.
- **Settings:** manage currency, categories, rules, vaults, encrypted backup, retention, and destructive local actions with clear scope.
- **Sync & review:** distinguish local persistence, pending changes, relay receipt, remote projection, conflicts, failures, and local-only records.

Proof comes from the live interface: legible values, explicit state, reviewable rows, local/offline status, and honest boundaries. Do not add fake metrics, bank integrations, testimonials, hosted-account claims, or cloud guarantees.

## Chosen direction

**Cedar Ledger**, expressed as a precise desktop workbench with the visual grammar of a contemporary financial instrument: charcoal structure, mineral paper surfaces, evergreen action lines, saffron highlights, olive review states, and data treated as the primary material. This is a restrained palette-and-spacing grammar, not a literal illustration or marketing treatment.

The first viewport should establish the current vault, local status, page purpose, and one obvious next action without a generic hero or repetitive card wall. Overview should feel like a readable instrument panel; Transactions and Import should become the most capable work surfaces; Settings and Sync should make privacy and system state calm and inspectable.

The memorable moment is the **depth line**: a compact, persistent context treatment that makes the active vault, local save state, and any pending/review attention understandable at a glance, then lets the data work—not decoration—carry the page.

## Constraints and finish criteria

Use the existing React/Vite/custom CSS stack unless a later decision proves a dependency necessary. Keep the current route structure and accessible semantics. Support keyboard focus, readable contrast, reduced motion, narrow widths, empty/loading/error/offline/needs-review/conflict/demo states, and no accidental horizontal overflow. Preserve useful density on desktop and deliberately stack dense records on mobile. Motion must be sparse and state-led.

The display face is self-hosted from the bundled Fraunces variable font so the visual voice survives offline use; body and data type remain system-safe. Overview deliberately uses no chart dependency: the real category proportions, summaries, and records are the evidence. Mobile keeps all five route labels in a compact sticky header with deliberate horizontal navigation rather than hiding secondary work behind an ambiguous More control. Implementation is complete only after desktop and mobile browser inspection, interaction/error-state checks, web tests, typecheck, lint, production build, and a documented finish review against `DESIGN.md` and this brief.
