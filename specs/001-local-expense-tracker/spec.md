# Feature Specification: Local Expense Tracker

**Feature Branch**: `001-local-expense-tracker`

**Created**: 2026-08-04

**Status**: Draft

**Input**: User description: "Build a local web app and native iOS expense tracker based on https://github.com/conniexu444/parse-and-track-spending and its live demo. Users can manually add expenses or upload CSV and PDF bank statements. The app parses statements, categorizes transactions, totals spending over weekly and monthly periods, lets users correct categories, learns from corrections, and syncs the local web app with iOS. Use skills from skills.sh, including the Impeccable and design taste skills, and support iPhone X on iOS 16.7.9 and newer."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Import and review a bank statement (Priority: P1)

As a person who wants to understand recent spending, I can upload a CSV or PDF bank statement and review the transactions the app found before they are added to my expense history.

**Why this priority**: Importing existing financial data is the central value of the product and removes the burden of entering months of expenses by hand.

**Independent Test**: Provide a supported sample CSV and a supported text-based PDF containing known transactions, upload each independently, and verify that the review results contain the expected dates, merchants, amounts, credits, and import warnings without requiring the dashboard or mobile app.

**Acceptance Scenarios**:

1. **Given** a supported CSV statement, **When** the user uploads it, **Then** the app identifies the transaction rows, normalizes their dates and amounts, assigns an initial category or marks the row for review, and shows a reviewable import summary.
2. **Given** a supported text-based PDF statement, **When** the user uploads it, **Then** the app extracts the transaction rows and presents the same review experience as a CSV import.
3. **Given** an import with ambiguous, malformed, or unsupported rows, **When** parsing completes, **Then** the app preserves the usable rows, identifies the affected rows and reason, and never silently discards financial data.
4. **Given** a statement that overlaps a previously imported statement, **When** the user reviews the import, **Then** the app identifies likely duplicates and lets the user exclude or keep each affected transaction before saving.
5. **Given** the user cancels an import during review, **When** the user leaves the review, **Then** no transactions from that import are added to the expense history.

---

### User Story 2 - Add and edit an expense manually (Priority: P1)

As a person tracking a cash purchase or correcting an incomplete record, I can manually add an expense and edit its details later.

**Why this priority**: Manual entry is required for purchases that never appear in an uploaded statement and provides a dependable fallback when parsing needs review.

**Independent Test**: Add a transaction with a date, merchant, amount, category, and optional note, save it, reopen it, edit a field, and verify that the updated record appears in the transaction history and totals.

**Acceptance Scenarios**:

1. **Given** the user is viewing their transactions, **When** they submit a valid manual expense, **Then** the expense is saved with the entered details and included in the appropriate totals.
2. **Given** a manual entry has a missing date, merchant, amount, or category, **When** the user tries to save it, **Then** the app identifies the missing or invalid field and prevents an incomplete record from being saved.
3. **Given** an existing transaction, **When** the user edits and saves its amount, date, merchant, note, or category, **Then** the history and affected summaries recalculate from the updated record.
4. **Given** an expense was entered by mistake, **When** the user chooses delete, **Then** the app asks for confirmation and removes it only after an explicit confirmation.

---

### User Story 3 - Understand spending over time (Priority: P1)

As a person trying to manage my spending, I can see total spending, credits, category breakdowns, and trends for weekly, monthly, and custom date ranges.

**Why this priority**: Summaries turn raw transactions into useful financial insight and are the primary reason to return after importing data.

**Independent Test**: Load a fixture containing transactions across multiple weeks and months, select each supported period, and verify that totals, category breakdowns, and transaction counts match independently calculated expected values.

**Acceptance Scenarios**:

1. **Given** saved transactions across several dates and categories, **When** the user opens the dashboard, **Then** the app shows total spending, total credits or refunds, net activity, transaction count, and a category breakdown for the active period.
2. **Given** the user changes the period from weekly to monthly, **When** the period changes, **Then** all summary values and visible transactions update to the selected period.
3. **Given** the user chooses a custom date range or category filter, **When** the filter is applied, **Then** the dashboard and transaction list show only matching records and clearly indicate the active filter.
4. **Given** the selected period has no transactions, **When** the dashboard loads, **Then** the app shows an informative empty state with a clear way to add or import data rather than showing misleading zeros without context.

---

### User Story 4 - Correct categories and improve future categorization (Priority: P1)

As a person who notices a transaction was categorized incorrectly, I can correct it and trust that the app will use that correction to improve later imports.

**Why this priority**: Personal merchant patterns vary, so correction and learning are necessary for categorization to become useful instead of remaining a fixed generic guess.

**Independent Test**: Import a transaction from a merchant with an incorrect initial category, change the category, import a later transaction from the same merchant, and verify that the later transaction receives the corrected category or is explicitly surfaced for confirmation when context differs.

**Acceptance Scenarios**:

1. **Given** a transaction with an incorrect category, **When** the user selects a new category and saves, **Then** the transaction, affected totals, and category summaries update immediately.
2. **Given** the user has corrected a merchant repeatedly or explicitly saved a merchant rule, **When** a later statement contains a matching merchant, **Then** the app applies the learned category and identifies that it came from a personal rule.
3. **Given** a learned rule could conflict with a more specific context such as a changed merchant description or a transfer, **When** categorization runs, **Then** the app favors the more specific evidence or marks the item for review instead of applying the rule silently.
4. **Given** a user-created categorization rule, **When** the user views personalization settings, **Then** they can inspect, edit, disable, or remove the rule.
5. **Given** a category was changed in error, **When** the user undoes or edits the change, **Then** the transaction and future categorization behavior reflect the corrected rule state.

---

### User Story 5 - Use the app privately while offline (Priority: P1)

As a person handling sensitive financial data, I can view and manage my saved records in the local web app without depending on a live connection, and I understand where my data is stored and when it is synchronized.

**Why this priority**: Privacy and local availability are core trust requirements for bank statements and expense history.

**Independent Test**: Load the local web app, add and edit transactions while offline, close and reopen it, and verify that the records remain available and the interface clearly reports unsynchronized changes when synchronization is unavailable.

**Acceptance Scenarios**:

1. **Given the local web app has previously loaded,** **When** the network becomes unavailable, **Then** the user can view saved data, add expenses, edit categories, and review summaries.
2. **Given local changes exist while offline,** **When** connectivity returns, **Then** the app identifies pending changes and synchronizes them without requiring the user to recreate the work.
3. **Given a user is learning how their data is handled,** **When** they open privacy information, **Then** the app explains local storage, synchronization, statement retention, and deletion controls in plain language.

---

### User Story 6 - Continue on iPhone and keep data synchronized (Priority: P2)

As a person who uses the app in different places, I can pair the native iOS app on an iPhone X running iOS 16.7.9 or a newer supported iPhone with my local web vault and see the same expense history, categories, learned rules, and summaries without requiring a paid cloud account.

**Why this priority**: Cross-device access makes the tracker useful for immediate manual entry while preserving the local-first experience on the primary computer.

**Independent Test**: Create a local vault, pair an iPhone X running iOS 16 with the PC's local web companion, disconnect the phone from the PC network, add a known expense on iOS, later reconnect the phone and PC/relay, open the apps in the foreground, and verify that the expense appears on the PC without being entered again.

**Acceptance Scenarios**:

1. **Given the user has a local vault and a valid pairing code,** **When** they pair the iOS app with the PC's local web companion, **Then** the app displays the vault's transactions, categories, learned rules, and summary periods without importing the statement again.
2. **Given the iOS app is temporarily disconnected from the PC or relay,** **When** the user adds or edits a transaction, **Then** the change is saved locally in a durable pending queue and visibly marked for synchronization.
3. **Given the user added expenses while away from the PC,** **When** they later return to the PC's local network, open the iOS app and PC web app/relay in the foreground, and reconnect, **Then** the queued expenses synchronize to the PC without duplicate creation and become available in the PC history and summaries.
4. **Given a record is changed on two paired devices before either change synchronizes,** **When** synchronization resumes, **Then** the app applies a predictable conflict policy, preserves the user's data, and explains any resolution requiring attention.
5. **Given the user is on an iPhone X running iOS 16.7.9,** **When** they complete the primary flows, **Then** the app remains usable without requiring features introduced after the minimum supported version.
6. **Given the user changes appearance, text size, or accessibility settings on iOS,** **When** they use the app, **Then** content remains legible, controls remain usable, and important meaning is not conveyed by color alone.

---

### User Story 7 - Share the product without sharing private finances (Priority: P3)

As the owner of the project, I can let a friend use the app with their own local vault and show the product as a polished portfolio project without exposing my personal financial records or requiring a hosted account.

**Why this priority**: The user wants the product to be useful to a friend and technically impressive to demonstrate, while financial privacy must remain intact.

**Independent Test**: Create two separate local vaults, confirm that each can use the core flows, and verify that transactions, learned rules, imported statements, and settings from one vault are not visible in the other. Export one vault and verify that the friend can import it only through an explicit user action.

**Acceptance Scenarios**:

1. **Given two separate local vaults,** **When** each user opens their own vault, **Then** each sees only their own financial data and personalization rules.
2. **Given the owner wants to demonstrate the product,** **When** they use a sample-data or demo mode, **Then** the demo data is clearly labeled and cannot be mistaken for real financial records.
3. **Given the user requests deletion,** **When** they confirm deletion of a statement, transaction, or vault, **Then** the app explains the scope and completes deletion or reports exactly what remains and why.

---

### Edge Cases

- A CSV has different column names, extra columns, blank rows, duplicate header rows, quoted commas, mixed date formats, or a missing amount column.
- A PDF is password-protected, image-only, rotated, multi-column, partially unreadable, unusually large, or uses a previously unsupported bank layout.
- A statement includes pending transactions, refunds, credits, transfers, fees, negative amounts, zero-value rows, duplicate rows, or transactions spanning a year boundary.
- A statement overlaps a previous import by date and merchant but contains a legitimate recurring transaction with the same amount.
- A merchant description contains inconsistent casing, store numbers, location suffixes, punctuation, or an ambiguous generic name.
- A user changes a category after a learned rule was created, disables the rule, or applies different categories to the same merchant in different contexts.
- Two devices edit the same transaction, category, or learned rule while offline.
- A synchronization session expires, the user loses connectivity, storage is nearly full, or a local record cannot be synchronized.
- A user changes locale, time zone, currency display, calendar boundaries, text size, appearance, or VoiceOver settings.
- A user imports an empty statement, a statement with only credits, or a statement whose total does not reconcile with the visible transaction rows.
- A user tries to upload a file type other than CSV or PDF, an oversized file, or a file containing no recognizable transactions.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The product MUST provide a local web application for managing private expense data and a native iOS application for supported iPhone devices.
- **FR-002**: The product MUST support one or more independent local vaults so each user can maintain separate transactions, categories, learned rules, settings, and imported statement records without a paid account or hosted service.
- **FR-003**: Users MUST be able to manually create, view, edit, and delete an expense with at least a date, merchant, amount, and category, plus optional notes and currency information.
- **FR-004**: The product MUST allow users to upload bank statements in CSV and PDF formats from the local web app or native iOS app and review the result before committing it; both clients MUST produce the same normalized review contract.
- **FR-005**: The product MUST initially support the bank statement formats demonstrated by the reference project where practical, including American Express, Apple Card, Chase, Capital One, and US Bank examples, while clearly identifying unsupported layouts.
- **FR-006**: The product MUST extract recognizable transaction dates, merchant descriptions, amounts, credits or refunds, and statement metadata from supported files.
- **FR-007**: The product MUST normalize equivalent date, amount, sign, whitespace, and merchant formatting differences without altering the original source details needed for review.
- **FR-008**: The product MUST show an import preview with parsed rows, category suggestions, confidence or review status, duplicate warnings, row counts, and any parsing errors before saving.
- **FR-009**: The product MUST never silently discard an unreadable, ambiguous, duplicated, or unsupported row; it MUST explain the issue and provide an appropriate review, retry, exclusion, or manual-entry path.
- **FR-010**: The product MUST detect likely duplicate transactions within an import and against previously saved records, while allowing the user to keep a legitimate matching transaction.
- **FR-011**: The product MUST provide a default set of understandable expense categories and allow users to create, rename, reorder, merge, disable, and remove categories without orphaning transactions.
- **FR-012**: The product MUST automatically suggest a category for each recognizable expense using merchant and transaction context, and MUST distinguish a suggestion from a user-confirmed category.
- **FR-013**: Users MUST be able to correct a transaction category from the transaction review, transaction history, and relevant detail views.
- **FR-014**: The product MUST learn from explicit user corrections or saved merchant rules and use that knowledge for future imports in the same private local vault.
- **FR-015**: The product MUST show why a category was assigned when practical, including whether it came from a default rule, a personal rule, or requires review.
- **FR-016**: Users MUST be able to inspect, edit, disable, remove, and undo personal categorization rules and corrections.
- **FR-017**: The product MUST calculate spending totals, credits or refunds, net activity, transaction counts, and category breakdowns for weekly, monthly, and custom date ranges.
- **FR-018**: The product MUST provide transaction search, date filtering, category filtering, sorting, and a clear way to reset filters.
- **FR-019**: The product MUST preserve enough source and edit history to distinguish imported, manually entered, corrected, and learned data without exposing unnecessary sensitive source content.
- **FR-020**: The local web app MUST remain usable for viewing, manual entry, category correction, and summary review when temporarily offline after initial setup.
- **FR-021**: The product MUST synchronize a selected local vault's transactions, categories, learned rules, settings, and relevant import status across the local web app running on the user's PC and the native iOS app through a free local-network or user-controlled relay when connectivity is available.
- **FR-021A**: The product MUST durably queue expenses and other valid mutations created on iOS while the phone is away from the PC or relay, preserve them across app restarts and temporary disconnections, and automatically exchange the backlog when the user later reconnects the iOS app and PC/relay in a foreground session; each mutation MUST be applied idempotently so an expense is not duplicated.
- **FR-022**: Synchronization MUST protect financial data with encrypted local storage and encrypted peer transport, use explicit device pairing rather than a paid hosted identity service, and provide clear status for synchronized, pending, failed, disconnected, and conflict-resolved changes.
- **FR-023**: The product MUST use an append-only mutation log with stable identifiers and a predictable field-aware conflict policy that avoids silent data loss and lets the user review conflicts that cannot be safely resolved automatically.
- **FR-023A**: The product MUST remain fully usable for local entry, import, categorization, summaries, and history without cloud credentials, paid services, or an internet connection.
- **FR-023B**: The product MUST provide explicit vault export/import so a user can back up data, move it between devices, or share a separate copy with a friend without exposing the original vault.
- **FR-024**: The native iOS app MUST support iOS 16.7.9 on iPhone X and newer supported iPhone versions without making newer operating-system features a prerequisite for core flows.
- **FR-025**: The native iOS app MUST follow platform conventions for navigation, safe areas, touch targets, system typography, semantic colors, Dynamic Type, Dark Mode, VoiceOver, standard gestures, and meaningful haptic feedback.
- **FR-026**: The local web app MUST provide responsive layouts, keyboard navigation, visible focus states, readable contrast, clear labels, accessible validation, and reduced-motion support.
- **FR-027**: Both apps MUST provide consistent terminology, category meaning, transaction states, feedback, and core task outcomes while adapting controls to their platform conventions rather than presenting an identical interface everywhere.
- **FR-028**: The product MUST provide understandable loading, empty, success, warning, error, offline, parsing-review, and synchronization states for all critical flows.
- **FR-029**: The product MUST explain local vault storage, peer pairing, local-network synchronization, statement retention, export/import, and deletion behavior in user-facing language, including that no paid hosted account is required.
- **FR-030**: Users MUST be able to delete imported statements and financial records, and the product MUST clearly communicate whether derived summaries or learned rules are also removed.
- **FR-031**: The product MUST provide a clearly labeled sample-data or demo mode that can demonstrate the primary experience without exposing a user's real financial data.
- **FR-032**: The product MUST provide an export path for a user's normalized transaction data before account or record deletion.
- **FR-033**: The product MUST keep statement parsing and categorization responsive for normal supported statement sizes and MUST provide progress or status feedback for work that takes longer than a brief interaction.
- **FR-034**: The product MUST provide an accessible, visually distinctive interface appropriate for a portfolio-quality personal finance tool, using the installed Impeccable, design-taste-frontend, and platform-specific iOS design guidance during design and review.
- **FR-035**: The first release MUST exclude direct bank-account login or live transaction feeds, shared household ledgers, investment tracking, budgeting automation, tax preparation, and a standalone desktop GUI; these may be considered after the core tracker is validated.
- **FR-036**: The product MUST be buildable, runnable, and testable without paid software licenses, paid cloud subscriptions, paid parsing APIs, paid AI APIs, App Store publication, TestFlight, or a required third-party hosted sync tier.
- **FR-037**: The native iOS app MUST support free local installation and testing through Xcode and a free Apple Account on the owner's iPhone; App Store and TestFlight distribution are explicitly out of scope.

### Key Entities

- **Local Vault**: An isolated local data space containing one user's expense data, preferences, categories, learned rules, imports, mutation history, paired-device metadata, and synchronization state.
- **Transaction**: A financial activity record with date, merchant description, amount, currency, category, optional note, source, and review or confirmation state.
- **Statement Import**: A user-uploaded CSV or PDF file and its parsing session, source metadata, recognized rows, warnings, duplicate candidates, and commit status.
- **Category**: A user-visible grouping for expenses, with a name, presentation order, active state, and relationship to transactions.
- **Categorization Rule**: A default or personal rule that explains or influences a suggested category for a transaction, including its scope, confidence, active state, and history.
- **Spending Summary**: Calculated totals, credits, net activity, counts, category breakdowns, and trends for a selected period and filter set.
- **Sync Change**: A local or remote create, edit, delete, or rule update with synchronization status, timestamp, origin, and conflict information.
- **Demo Dataset**: Clearly labeled sample transactions and categories used to demonstrate the product without representing a user's real finances.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For a curated set of supported CSV and text-based PDF statements, at least 95% of valid transaction rows are extracted with the correct date, merchant, and amount, and every remaining row is surfaced with a clear review status.
- **SC-002**: A user can import a typical statement, review warnings, and commit it in under 3 minutes without entering transaction rows individually.
- **SC-003**: A user can manually add a complete expense in under 60 seconds and can correct a category from the transaction history in under 15 seconds after locating the transaction.
- **SC-004**: For a fixture of at least 10,000 saved transactions, changing a weekly, monthly, or custom period returns updated summaries and filtered results in under 1 second during normal local use.
- **SC-005**: After a user explicitly corrects or saves a merchant rule, at least 90% of matching future transactions in the evaluation fixture receive the expected category, while conflicting or low-confidence cases remain reviewable.
- **SC-006**: At least 90% of first-time test users can import a statement, find total spending for the current month, and correct one category without assistance.
- **SC-007**: When paired devices are on the same local network, a committed transaction or category correction is visible on the other device within 60 seconds in at least 95% of foreground, connected synchronization attempts.
- **SC-008**: When offline, users can complete manual entry and category correction without data loss, and pending synchronization status is visible before they leave the relevant flow.
- **SC-009**: Core web journeys pass keyboard-only navigation and automated accessibility checks, and the iOS core journeys remain usable with VoiceOver and the largest supported Dynamic Type setting.
- **SC-010**: The core iOS flows run on an iPhone X using iOS 16.7.9 without requiring an operating-system upgrade, and the experience adapts to newer supported iPhone screen sizes.
- **SC-011**: In privacy review scenarios using two separate local vaults, 100% of transactions, imported statements, learned rules, and settings remain isolated between vaults.
- **SC-012**: In a deletion test, the product removes the selected financial data and clearly reports any intentionally retained derived or mutation-log information, with an export available before destructive deletion.
- **SC-014**: From a clean setup with no paid credentials, users can create a local vault, run the PC web app and local relay, install the iOS app locally, pair the devices, and complete a manual-entry synchronization flow.
- **SC-015**: When the relay or network is unavailable, 100% of core local flows remain usable and report pending synchronization without data loss.
- **SC-016**: In a phone-away/PC-later fixture, an expense created while iOS is disconnected remains after an iOS app restart, synchronizes to the PC after foreground reconnect, appears exactly once in PC history and summaries, and does not require a hosted service.
- **SC-013**: Reviewers rate the local web and iOS experiences as visually coherent and platform-appropriate, with no critical usability, contrast, touch-target, loading-state, or error-state defects in the release checklist.

## Reference Baseline

The first release is based on the public `parse-and-track-spending` project and its live demo:

- Repository: https://github.com/conniexu444/parse-and-track-spending
- Live demo: https://conniexu444.github.io/parse-and-track-spending/

The reference baseline provides client-side CSV and PDF import examples, support for several bank formats, keyword-based categorization, total and per-category summaries, date and category filters, sortable transaction rows, inline category editing, theme switching, and local browser processing. This feature retains those proven user outcomes while adding durable private local vaults, reviewable parsing, correction-driven categorization, offline use, cross-device synchronization, and a native iOS experience.

## Assumptions

- The primary users are individuals or friends using separate local vaults, not a shared household ledger. Shared financial vaults are explicitly outside the first release.
- "Local web app" means the primary PC experience runs locally and remains useful without continuous network access. The PC runs the web app and local relay/companion; device pairing and synchronization are available when the user chooses to connect the iOS app. A future desktop wrapper may reuse the same vault and relay contracts, but a standalone desktop GUI is not required in the first release.
- The first release accepts user-provided CSV and PDF statements only. It does not request bank credentials or connect directly to bank accounts.
- Initial statement support will prioritize the formats represented in the reference project and a curated fixture set. Unsupported layouts are reported clearly rather than treated as successfully imported.
- The first release prioritizes text-extractable bank PDFs. Image-only or encrypted PDFs are detected and routed to an explicit manual-review or unsupported-file path rather than silently producing incomplete data; OCR can be added as a later enhancement after representative samples are evaluated.
- A default expense category set is provided, and users may personalize it. The initial categories are expected to include Food and Dining, Transportation, Shopping, Bills and Utilities, Entertainment, Health, Travel, Income or Credits, Transfers, and Other.
- The product preserves currencies and displays them clearly. Currency conversion and mixed-currency aggregate totals are outside the first release unless a later requirement defines conversion rules.
- Weekly summaries use the user's locale-aware calendar week by default, and monthly summaries use the user's locale-aware calendar month. Custom date ranges remain available.
- A user's explicit category correction is treated as stronger evidence than a generic default rule, but the product does not force a personal rule onto a conflicting transaction context.
- The first release uses independent local vaults and explicit device pairing rather than hosted accounts. A friend can use a separate vault or receive an explicitly exported copy; shared live household ledgers are out of scope.
- The synchronization transport uses a free local-network or user-controlled relay and an append-only mutation log. No hosted service, paid subscription, or third-party cloud account is required for core operation.
- The minimum native iOS deployment target is iOS 16 so the app can run on the user's iPhone X. Newer platform features may be adopted only with safe fallbacks that preserve core flows on iOS 16.
- The local web and iOS apps share product concepts and data outcomes but may use platform-native navigation, controls, gestures, typography, and feedback.
- The installed project-scoped skills are design and engineering guidance, not runtime product dependencies. All selected skills and runtime dependencies MUST be usable at no software-license cost; paid hosted skill services are not required.
- The first release is optimized for a polished portfolio demonstration using clearly labeled sample data and real end-to-end behavior, not fabricated financial metrics or simulated synchronization. A static demo host is optional; local operation and local-network sync remain the supported $0 baseline.
