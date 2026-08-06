# Aug 6 — Automatic Statement Categorization Plan

**Status:** Implemented — approved deterministic-first web/shared pass completed 2026-08-06
**Scope:** Web/shared categorization first; iOS taxonomy source was mirrored where low-risk, while native runtime parity remains platform-gated.
**User decisions received:** Add Subscriptions; classify transfers/payments as Transfers; keep unknown merchants Needs review. Initial ML scope remains undecided.
**Primary goal:** Make common statement merchants receive useful, explainable categories automatically during import review, while keeping the app local-first, offline-capable, zero-cost, and safe against confident-looking wrong guesses.

---

## 1. What I audited

### Existing pipeline

The current path is:

1. CSV/PDF parser emits `parsedMerchant`, amount, date, and diagnostics.
2. `apps/web/src/features/imports/import-pipeline.ts` calls `suggestCategory(...)` for every parsed row.
3. `packages/domain/src/categorization/suggest.ts` checks active personal rules first, then deterministic default rules.
4. `packages/domain/src/categorization/default-rules.ts` matches normalized keyword tokens against category names.
5. `ReviewTable` displays the suggested category, provenance, confidence, and explanation.
6. Import commit persists the selected/suggested `category_id`, source, and confidence.
7. User corrections can create or strengthen a local merchant rule through `personal-rules.ts`.

Relevant files:

- `packages/domain/src/categorization/normalize.ts`
- `packages/domain/src/categorization/default-rules.ts`
- `packages/domain/src/categorization/suggest.ts`
- `packages/domain/src/categorization/personal-rules.ts`
- `apps/web/src/features/imports/import-pipeline.ts`
- `apps/web/src/features/imports/components/ReviewTable.tsx`
- `apps/web/src/features/imports/ImportPage.tsx`
- `packages/domain/src/entities/category.ts`
- `packages/domain/tests/categorization.test.ts`
- `apps/web/tests/import-contract.test.ts`
- `apps/web/tests/pdf-contract.test.ts`
- `packages/parsing/tests/accuracy.test.ts`

### Current system is partially working

A direct diagnostic against the repository's real `TD_Bank_Realistic_Mock.pdf`, using the current parser and categorizer with the default categories, produced these results:

| Statement merchant | Current result | Intended result |
|---|---|---|
| `Uber *Trip Help.Uber.Com Ca` | Transportation / high | Transportation |
| `Direct Dep - Payroll Gusto` | Income / high | Income |
| `Sq *Local Coffee Shop San Fran` | Food and Dining / high | Food and Dining |
| `Ach Withdrawal - Comcast Cable` | Bills and Utilities / medium | Bills and Utilities |
| `Target 00012345 Los Angeles` | **Food and Dining / high** | **Shopping** |
| `Amzn Mktp Us*Amzn.Com/Bill Wa` | unresolved | Shopping |
| `Trader Joe's Qps` | unresolved | Food and Dining |
| `Chevron 0123456 Gas` | Transportation / high | Transportation |
| `Netflix.Com Netflix.Com Ca` | Entertainment / high | Entertainment |
| `Ach Withdrawal - Amex Epay` | unresolved | Transfers |
| `Direct Dep - Payroll Gusto` | Income / high | Income |
| `Doordash*Chipotle Ca` | Food and Dining / high | Food and Dining |
| `Spotify Usa 800-952-5210 Ny` | Entertainment / high | Entertainment or Subscriptions |
| `The Home Depot` | unresolved | Shopping |
| `Ach Withdrawal - State Farm` | unresolved | Bills and Utilities |
| `Online Transfer To Acct 9876` | Transfers / medium | Transfers |
| `Apple.Com/Bill Cupertino Ca` | unresolved | Shopping or Entertainment; decide explicitly |
| `Wal-Mart` | unresolved | Shopping |
| `Ach Withdrawal - Apartment Rent` | Bills and Utilities / medium | Bills and Utilities |

Therefore, the categorization engine is not completely broken. It already handles several obvious descriptors, but its merchant vocabulary and normalization are incomplete, and one existing rule is clearly misclassified (`target` is currently listed under Food and Dining).

The screenshot showing no selected categories for even `Uber`, payroll, coffee, Comcast, and Target must be verified in the real current browser path before implementation. Possible explanations include an old/stale bundle, a different vault/category set, or a UI/runtime path that is not using the current source result. The plan begins with that reproduction rather than assuming the static diagnostic is the whole story.

### Current correctness gaps

1. **Merchant aliases are too narrow.** There is no `amzn` → Amazon, `wal mart` → Walmart, or apostrophe-tolerant `trader joe's` matching.
2. **Payment-processor prefixes are not interpreted as wrappers.** `SQ *` is present in the descriptor, although the current `coffee` keyword happens to rescue that example. The same issue will hide many small merchants.
3. **Common merchant vocabulary is incomplete.** Home Depot, State Farm, Apple billing, and Amex payment descriptors are absent.
4. **Category precedence is wrong for some merchants.** `target` is in Food and Dining even though it should be Shopping. A broad keyword cannot safely outrank a specific merchant mapping.
5. **Direction/descriptor semantics are underused.** `Direct Dep` and `ACH Withdrawal` should influence classification. An Amex electronic payment is a transfer/payment, not ordinary spending.
6. **Unresolved rows are currently initialized as `accept` when they are valid parser rows.** A row can have `category_id: null` and still be considered accepted. This weakens the intended human-review boundary.
7. **The fallback-category lookup is structurally suspect.** `suggest.ts` stores active categories in a map keyed by category ID, then attempts to look up `FALLBACK_CATEGORY_NAME` as if it were an ID. If `Other` fallback is retained, this must be corrected; otherwise unresolved rows should remain explicitly unresolved.
8. **There is no full TD categorization regression.** Existing tests cover Starbucks/Uber and generic rule behavior, but not all 19 real TD merchants or the expected category matrix.
9. **Merchant display and merchant matching are coupled too loosely.** The app correctly preserves original text, but it needs a dedicated matching representation/canonical merchant identity for explainable aliases without overwriting source data.

---

## 2. Research findings

### Upstream project

The provided upstream project uses a local configuration file with two useful ideas:

- `categoryKeywords`: category-to-keyword lists.
- `merchantMappings`: regex patterns that map noisy descriptors to friendly merchant names.

Relevant upstream files:

- [category-config.example.json](https://raw.githubusercontent.com/conniexu444/parse-and-track-spending/main/src/utils/category-config.example.json)
- [parsers.js](https://raw.githubusercontent.com/conniexu444/parse-and-track-spending/main/src/utils/parsers.js)
- [useTransactions.js](https://raw.githubusercontent.com/conniexu444/parse-and-track-spending/main/src/hooks/useTransactions.js)
- [utils README](https://raw.githubusercontent.com/conniexu444/parse-and-track-spending/main/src/utils/README.md)
- [upstream README](https://github.com/conniexu444/parse-and-track-spending)

The upstream approach is useful as a vocabulary/configuration reference, especially for `AMAZON`, `SPOTIFY`, `NETFLIX`, `UBER`, `SQ *`, and `TST*`. It is not sufficient by itself for this app because its categorization is simple first-match substring logic, has no strong ambiguity/confidence policy, and its optional AI analysis sends transaction data to external APIs when users provide keys. We should adapt the local mapping ideas without copying the cloud AI behavior or first-match precedence.

### Industry/API research

Plaid's enrichment product documents a much more sophisticated cloud engine using cleaned merchant names, counterparties, confidence, and category taxonomies:

- [Plaid Enrich API](https://plaid.com/docs/api/products/enrich/)
- [Plaid Transactions API](https://plaid.com/docs/api/products/transactions/)
- [Plaid enrichment engine overview](https://plaid.com/blog/transaction-enrichment-engine/)

That is useful as a conceptual model—canonical merchant identity, confidence, and category hierarchy—but it is not appropriate as a direct dependency here because it requires sending financial descriptors to a hosted service, conflicts with the project's $0/local-only requirement, and would add credentials, availability, and privacy concerns.

### Skills review

The available local skills were inspected and no existing skill specifically provides a ready-made merchant-categorization implementation suitable for this TypeScript/local-first codebase. No community skill was installed. Community skills from `skills.sh` should not be installed without explicit approval, and no installation is necessary for the proposed deterministic approach.

### Recommended technical direction

Use a layered, local-only classifier:

1. **Unicode and descriptor normalization** — built-in JavaScript only.
2. **Payment-processor and bank-descriptor cleanup** — aliases/wrappers retained for explanation.
3. **Specific merchant aliases and high-confidence rules** — exact/token/phrase rules with explicit precedence.
4. **Direction-aware rules** — positive deposits, withdrawals, payments, and transfers affect category candidates.
5. **User-learned rules** — existing local personal rules remain highest priority.
6. **Conservative fallback** — unresolved or ambiguous rows remain `Needs review`; no opaque cloud AI guess.
7. **Optional future on-device ML** — explicitly deferred until deterministic coverage and evaluation are strong. A local model would increase bundle size, complexity, explainability burden, and platform parity work; it is not needed to solve the TD examples.

No hosted API, paid enrichment service, remote LLM, or financial-data upload is recommended.

---

## 3. Proposed behavior and category policy

Use the existing categories plus the newly approved `Subscriptions` category. Because this is a schema/data change, the implementation must include a monotonic migration and backup compatibility:

- Food and Dining
- Transportation
- Shopping
- Bills and Utilities
- Entertainment
- Subscriptions **(new)**
- Health
- Travel
- Income
- Transfers
- Other

Recommended default mappings for the TD statement:

- Uber, Lyft, taxi, transit, gas, parking → Transportation
- Starbucks, coffee, cafes, restaurants, DoorDash, Chipotle, grocery stores, Trader Joe's → Food and Dining
- Amazon/AMZN, Target, Walmart/Wal-Mart, Home Depot, Apple.com/Bill → Shopping
- Comcast, State Farm insurance, apartment rent, utility providers → Bills and Utilities
- Netflix, Spotify, Hulu, streaming/media with recurring/subscription evidence → Subscriptions
- One-off movie, concert, ticket, or game charges → Entertainment
- Direct deposit/payroll/salary → Income
- Account transfers, Zelle/Venmo transfers, credit-card/electronic payments → Transfers

**Important policy:** Transfer/payment rows should still be imported and categorized as Transfers so they are visible and auditable, but summaries should not treat them as ordinary spending. This matches the existing Transfers category and avoids silently deleting account activity.

**Confirmed taxonomy decision:** Add a dedicated `Subscriptions` category. Subscription detection must be conservative: recurring/known subscription merchants such as Netflix, Spotify, Hulu, Disney+, Microsoft, LinkedIn, and similar services should map to Subscriptions; one-off entertainment purchases should remain Entertainment. The implementation must update default category seeding, existing-vault migration, summaries, backup compatibility, demo data where relevant, and iOS source definitions when native parity work resumes.

---

## 4. Detailed implementation plan

### Phase 0 — Reproduce and instrument the actual reported UI issue

Before changing matching rules:

1. Run the current web app against a fresh browser profile.
2. Upload `TD_Bank_Realistic_Mock.pdf` through the real UI.
3. Capture the review rows' merchant, selected category value, category source, confidence, and explanation from the DOM and live SQLite state.
4. Compare the browser result with direct `buildImportPreview` output.
5. Verify active-vault categories exist with the expected names and `is_active = 1`.
6. Confirm whether the screenshot came from the current bundle, stale dev/preview port, or a real current-path regression.
7. Add a diagnostic assertion to the browser audit only after the expected behavior is confirmed.

**Exit criteria:** We can state whether the screenshot is caused by stale runtime state, missing category rows, a UI binding issue, or incomplete rule matching.

### Phase 1 — Establish a typed categorization contract

Refine the domain model without breaking existing persisted rows:

1. Extend suggestion input to accept transaction context where needed:
   - merchant display text
   - amount direction/sign
   - source type/file type
   - optionally bank descriptor metadata
2. Extend suggestion output with structured evidence:
   - canonical merchant key/name, if known
   - matched rule/alias ID
   - matched pattern/keyword
   - normalization/processor transformations used
   - score/confidence
   - candidate alternatives when ambiguous
   - reason code such as `merchant_alias`, `keyword`, `direction`, `personal_rule`, `transfer_descriptor`, `manual_required`
3. Keep the existing `CategorySource`/`CategoryConfidence` contract compatible, adding fields only where shared contracts need them.
4. Preserve `merchant_original` and the parser's display merchant. Matching metadata must not overwrite financial source text.

### Phase 2 — Improve normalization and canonical merchant identity

Replace the current minimal normalization with a carefully tested matching pipeline:

1. Unicode NFD normalization and diacritic removal.
2. Lowercase and whitespace normalization.
3. Normalize apostrophes and common punctuation consistently.
4. Strip or tokenize non-identity metadata:
   - store/order numbers
   - phone numbers
   - URLs/domains and state/city suffixes where safe
   - terminal/payment processor wrappers such as `SQ`, `TST`, `POS`
   - bank operation prefixes such as `ACH Withdrawal`, `Direct Dep`, `Online Transfer`
5. Add a canonical alias table for known forms:
   - `amzn`, `amzn mktp`, `amazon.com` → Amazon
   - `wal mart`, `wal-mart` → Walmart
   - `trader joe's`, `trader joes` → Trader Joe's
   - `sq *` → Square/payment processor wrapper, while retaining merchant tokens after it
   - `doordash*chipotle` → Chipotle/DoorDash food evidence
   - `apple.com/bill` → Apple billing
6. Return both normalized tokens and evidence of removed/recognized wrappers so the review UI can explain the match.
7. Do not use broad fuzzy matching yet. A false positive in finance is worse than a manual review, and deterministic aliases solve the demonstrated cases.

### Phase 3 — Replace flat first-match rules with precedence-aware rules

Refactor `default-rules.ts` into explicit rule records or typed groups:

1. **Specific merchant aliases** outrank generic keywords.
2. **Specific phrases** outrank single tokens.
3. **Direction/descriptor rules** can override generic merchant rules when appropriate:
   - `direct dep` + positive amount → Income
   - `ach withdrawal` + `comcast` → Bills and Utilities
   - `ach withdrawal` + `amex epay` → Transfers
   - `online transfer` → Transfers
4. **Explicit merchant corrections**:
   - Target → Shopping, never Food and Dining merely because it sells groceries.
   - Walmart/Wal-Mart → Shopping.
   - Home Depot → Shopping.
5. Resolve conflicts deterministically only when the evidence is sufficiently strong; otherwise return `manual_required` with candidate explanations.
6. Keep personal rules above defaults, preserving the existing specificity/priority/evidence behavior.
7. Add rule IDs and an auditable static rule registry so future changes can be tested and explained.

### Phase 4 — Make import review semantics safe and useful

1. Automatically preselect a category when confidence is `high` or `confirmed` and evidence is unambiguous.
2. Treat `manual_required`/`unresolved` suggestions as `pending`, not `accept`.
3. Keep duplicate candidates pending regardless of category confidence.
4. Keep parser errors pending and blocked.
5. Show a clear explanation below the category control:
   - `Matched merchant alias “Amazon”`
   - `Matched default pattern “coffee”`
   - `Matched transfer descriptor “Online Transfer”`
   - `Needs review — no confident match`
6. Show the canonical merchant as a secondary hint only; never replace the original statement merchant.
7. Allow one-click correction and preserve the existing “Remember this merchant” flow.
8. If a user corrects an auto-category, record correction history and optionally strengthen a personal rule as the app already does.
9. Add an import summary such as `15 categorized automatically · 4 need review` so the user can trust what happened.

### Phase 5 — Add full regression fixtures and evaluation

Add a dedicated TD categorization fixture/contract containing all 19 rows and expected category/source/confidence. Tests should cover:

1. Exact TD PDF merchant matrix.
2. The five screenshot examples.
3. Payment-processor wrappers (`SQ *`, `TST*`, `DD*`, `PY*`, `BT*`).
4. Aliases and punctuation (`AMZN`, `Wal-Mart`, `Trader Joe's`, `Netflix.Com`).
5. Directional descriptors (`Direct Dep`, `ACH Withdrawal`, `Online Transfer`).
6. Conflicting/broad merchants (`Target`, `Apple`, marketplace descriptors).
7. Unknown merchants remain reviewable rather than silently assigned.
8. Personal rules override defaults.
9. Duplicate rows remain pending even when auto-categorized.
10. Import commit persists category ID/source/confidence correctly.
11. Backup/export/import preserves the new rule/evidence fields if any are persisted.
12. Web accessibility coverage for explanations, status, and category controls.
13. Real Chrome PDF review audit verifies DOM-selected categories, not only Node output.

Suggested acceptance target for the TD fixture:

- At least 16/19 rows receive an unambiguous automatic category in the initial deterministic pass.
- The remaining rows are either intentionally manual due to ambiguity or are explicitly documented policy decisions.
- Zero known obvious misclassifications in the expected matrix.
- Every automatic category has visible evidence.

### Phase 6 — Validation and release evidence

Run, in order:

1. Domain categorization/import tests.
2. Web import contract, PDF contract, integration, and accessibility tests.
3. Full workspace typecheck.
4. ESLint and targeted formatting checks.
5. Production build.
6. Real Chrome TD PDF audit from a fresh profile.
7. Regression check that imported categories appear in Transactions and Overview.
8. Full repository test gate and `git diff --check`.
9. Update `handoff.md`, `knowledge.md`, `docs/lessons-learned.md`, and traceability documentation with actual evidence and any remaining platform boundaries.

This plan was approved by the user on 2026-08-06 and executed. The validation evidence is recorded in `handoff.md` and `knowledge.md`.

---

## 5. Deferred options and why

### Do not start with cloud AI/API enrichment

The upstream project has optional Anthropic/OpenAI analysis, but that is for narrative analysis and sends transaction data to external APIs. It is incompatible with this app's local-first privacy boundary and introduces cost/credentials. It is not needed for common merchant classification.

### Do not start with on-device embeddings/LLM

An on-device ML classifier would ship a model inside the web app and execute locally through a browser-compatible runtime such as WebAssembly/WebGPU/ONNX; no financial data would leave the device. It could help with novel merchants, but it introduces:

- model download/storage and bundle-size costs;
- browser runtime compatibility, memory, CPU, and cold-start costs;
- model-version migration and reproducibility concerns;
- confidence calibration and explainability requirements;
- a fixed evaluation set to prevent silent regressions; and
- iOS parity work, either by sharing a compatible model/runtime or maintaining a separate Core ML/native implementation and proving both platforms agree.

The deterministic/learned system can solve the demonstrated TD cases without those costs, so ML should be considered only after measured evaluation shows meaningful unresolved coverage. The user has not yet selected whether ML belongs in the first implementation scope.

### Do not add fuzzy matching indiscriminately

Fuzzy matching can turn `Target`/`Target Optical`, `Apple`/`Apple.com/Bill`, or similarly named merchants into incorrect categories. If introduced later, it must be bounded to a canonical alias dictionary, use high thresholds, expose similarity evidence, and fall back to manual review on close competing candidates.

---

## 6. Open decisions for approval

1. **Category taxonomy — decided:** Add a separate `Subscriptions` category and migrate/seed it safely in existing vaults and backups.
2. **Transfer behavior — decided:** Classify account/card payments as `Transfers`, keep them visible, and exclude them from ordinary spending totals.
3. **Unknown valid merchants — decided:** Leave them `Needs review` rather than auto-assigning `Other`.
4. **Matching scope — pending:** Choose deterministic-first or include on-device ML now. The plan recommends deterministic-first because it directly solves the TD examples without model/runtime/iOS parity costs.
5. **Rule customization — pending:** The plan recommends curated defaults plus local learned rules, without a raw JSON editor in the first pass. Decide whether an advanced local rule editor is required now.
6. **Reported screenshot — answered:** The screenshot was opened at `http://localhost:5174/#/import`; Phase 0 will still reproduce the current live path and verify the active vault/category data before rule changes.

---

## Approval gate

The user approved the recommended deterministic-first scope without a raw JSON editor. The implementation pass remained limited to web/shared behavior, added no hosted APIs or unapproved dependencies, and deferred on-device ML pending measured need.
