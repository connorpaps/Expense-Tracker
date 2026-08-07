# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

## Users

The primary user is a privacy-conscious person managing personal expenses and bank-statement history on their own computer. They may also use the companion iOS app for manual entry away from the computer. Portfolio reviewers are a secondary audience evaluating the product's local-first architecture, practical UX, and technical craft.

## Product Purpose

Expense Tracker is a local-first personal finance tool for importing statements, reviewing and categorizing transactions, manually recording expenses, understanding spending over time, and managing private vaults without a required cloud account. Success means the user can trust where their data lives, complete everyday expense work quickly, and understand what has or has not synchronized.

## Positioning

The product's meaningful mechanism is a private, vault-scoped local workflow: financial data remains usable offline in a browser-backed local vault, imports are reviewable before commit, categorization learns only from explicit user choices, and encrypted export provides a portable backup path. Relay synchronization is optional and intentionally reports its current projection boundary honestly.

## Operating Context

The primary web context is a desktop or laptop workbench used for statement review, transaction cleanup, category maintenance, summaries, privacy controls, and backup. The experience must also remain usable on narrow mobile web widths for quick review and manual capture. Users work with CSV and text-based PDF statements, personal transaction history, category rules, local/offline status, and encrypted vault backups.

## Capabilities and Constraints

- Web routes currently include Overview, Transactions, Import, Settings, and Sync & review.
- Users can import CSV and text-based PDF statements, review diagnostics and duplicates, correct categories, and commit accepted rows.
- Users can manually create, edit, and delete transactions with confirmation.
- Overview supports weekly, monthly, and custom ranges, currency-aware summaries, credits, net activity, category breakdowns, and recent activity.
- Transactions support search, category/date filtering, sorting, reset, category provenance, and correction-driven personal rules.
- Multiple isolated local vaults and clearly labeled demo vaults are supported.
- Settings includes currency, categories, personal rules, encrypted export/import, retention controls, and local deletion controls.
- The browser app remains locally usable offline after setup. Browser-local mutation keys and portable backups are encrypted, but browser storage is not equivalent to iOS Keychain or full-disk protection.
- Sync is optional and user-controlled. The current web surface distinguishes local persistence, opaque relay receipt, remote projection, local-only records, pending changes, failures, and conflicts. Full paired-device phone-away synchronization remains an open platform milestone.
- Direct bank login, live feeds, hosted databases, paid cloud services, paid parsing or AI APIs, App Store publication, and TestFlight are out of scope.
- The redesign should preserve current route slugs, core workflows, product terminology, local-first behavior, vault isolation, currency semantics, and truthful sync/privacy copy.

## Brand Commitments

The product name is Expense Tracker. The redesign should serve both daily personal use and portfolio presentation without turning the product into a marketing site. The confirmed visual direction for the web redesign is a Cedar Ledger: modern, warm-neutral, distinctive, practical, data-literate, and trustworthy rather than a blue enterprise console, pink/purple editorial treatment, orange-led treatment, or decorative SaaS.

## Evidence on Hand

- Product specification: `specs/001-local-expense-tracker/spec.md`
- Web design contract: `specs/001-local-expense-tracker/contracts/design-system.md`
- Web implementation: `apps/web/src/`
- Web tests and accessibility coverage: `apps/web/tests/`
- Current visual tokens: `apps/web/src/styles/tokens.css`, `packages/design-tokens/src/web/tokens.ts`
- Current app uses a custom React/Vite/CSS implementation with no external component library.
- Revert points: Git tag `pre-redesign-2026-08-06` for the pre-redesign app; Git tag `pre-catalog-revamp-2026-08-06` for the prior Editorial Instrument state. The rejected Catalog Instrument work is preserved in local stash `rejected-catalog-revamp-before-palette-redesign-2026-08-06`.
- The repository contains no approved customer logos, testimonials, commercial metrics, or portfolio claims. Future work must not fabricate them.

## Product Principles

- Keep private financial data useful without requiring a network.
- Make every import, category suggestion, and sync state understandable before the user commits or trusts it.
- Preserve user agency: explicit corrections teach the vault; destructive actions explain their scope.
- Prefer practical clarity over decorative complexity in daily financial work.
- Show technical limitations honestly rather than implying cloud-like guarantees the product does not provide.

## Accessibility & Inclusion

The web product must support keyboard navigation, visible focus, semantic labels and headings, accessible validation, readable contrast, reduced motion, responsive layouts, and non-color-only meaning. The native iOS product must preserve VoiceOver, Dynamic Type, Dark Mode, safe areas, semantic colors, and usable touch targets on the iOS 16 support floor.
