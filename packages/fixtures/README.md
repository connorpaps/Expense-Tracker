# @expense-tracker/fixtures

Sanitized CSV/PDF statement fixtures, golden expected outputs, JSON schemas, sync
fixtures, and demo data used by web, iOS, and relay tests. **Never commit real
personal bank statements or credentials here.**

**Version**: 0.1.0 (see `CHANGELOG` entries below)

## Changelog

### 0.1.0 — 2026-08-04

- JSON Schema draft-07 schemas for import, transaction, summary, mutation, snapshot,
  error, and conflict fixtures.
- Curated CSV fixtures: American Express, Apple Card, Chase, Capital One, US Bank,
  plus malformed/empty/duplicate/credit-only cases.
- Text-PDF fixtures generated deterministically by `tests/pdf-fixture-generator.ts`.
- Golden expected normalized outputs in `expected/`.
- Sync fixtures (phone-away backlog, conflict pair, mutation batch) in `sync/`.
- Clearly labeled demo dataset in `demo/`.

## Source layout

```text
schemas/      # JSON Schema draft-07 contracts
statements/   # sanitized CSV fixtures (PDFs are generated deterministically)
expected/     # golden normalized rows/diagnostics/summary totals
sync/         # phone-away, conflict, and mutation-batch fixtures
demo/         # clearly labeled sample data
src/          # fixture loader helpers
tests/        # fixture runner + golden assertions
```
