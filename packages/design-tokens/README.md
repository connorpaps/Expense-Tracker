# @expense-tracker/design-tokens

Single source of truth for the Expense Tracker semantic token vocabulary described in
`specs/001-local-expense-tracker/contracts/design-system.md`: modern Cedar Ledger web
surfaces with charcoal structure and evergreen action, 12/16/24px spacing rhythm, 14/18/24px radius
tiers, and the shared product vocabulary. Web values live in `src/web/`; iOS values are
emitted as Swift using native semantic colors.

**Version**: 0.1.0 (see `CHANGELOG` entries below)

## Changelog

### 0.1.0 — 2026-08-04

- Semantic color tokens (mineral background, elevated surface, charcoal primary/secondary/muted text, evergreen accent,
  positive, warning, destructive, focus, review-needed).
- Spacing, radius, type-scale, and motion tokens.
- Contrast validation helpers with WCAG AA assertions in tests.
- iOS semantic token Swift emission (`ExpenseTrackerDesignTokens.swift`).

## Source layout

```text
src/web/   # web token objects + CSS variable strings
src/ios/   # Swift semantic token source
tests/     # token contract + contrast tests
```
