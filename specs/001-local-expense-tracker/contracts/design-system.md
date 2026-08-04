# Design Contract: Expense Tracker

## Product design read

Reading this as: a daily-use personal finance product for privacy-conscious people and portfolio reviewers, with a calm editorial-finance language, leaning toward an expressive custom token system on the web and native iOS HIG patterns on mobile.

## Visual direction

- **Web mode**: Operate. The dashboard must be fast to scan and trustworthy, with visual distinction coming from a strong typographic hierarchy, a single confident accent, deliberate whitespace, and data-driven visualizations rather than decorative clutter.
- **iOS mode**: Native operate. Preserve the same product vocabulary, category meaning, and state language while using tab navigation, navigation stacks, sheets, semantic system colors, SF Symbols, Dynamic Type, safe areas, and standard gestures.
- **Portfolio surface**: A labeled demo mode can use more expressive composition and curated sample data, but it MUST remain truthful and clearly separate from a user's private local vault.

## Shared tokens and invariants

- Semantic tokens: background, elevated surface, primary text, secondary text, muted text, accent, positive, warning, destructive, focus, and review-needed.
- Web direction: cool ink neutrals with one electric-copper accent, a humanist display face paired with a highly legible system sans, 12px/16px/24px spacing rhythm, and 14px/18px/24px radius tiers. The exact font files and token values are selected in the implementation design pass and must be recorded rather than improvised per screen.
- One accent family across the web product; category colors are semantic and must remain distinguishable without color alone.
- All text and controls meet WCAG AA contrast targets on web and platform accessibility contrast expectations on iOS.
- All critical interactions have loading, success, warning, error, empty, offline, and conflict states.
- The same terms are used across clients: `Review import`, `Needs review`, `Personal rule`, `Syncing`, `Waiting to sync`, `Conflict`, `Total spent`, `Credits`, and `Net activity`.
- Motion communicates hierarchy, feedback, or state transitions and honors reduced-motion settings.

## Required screens and visual acceptance

The first release MUST produce and review these concrete screens in both a populated and empty/error state where applicable:

1. Web dashboard with period switcher, summary totals, category breakdown, recent activity, and sync status.
2. Web import review with progress, row diagnostics, filters, category correction, duplicate handling, and commit summary.
3. Web transaction history with search/filter/sort and inline category correction.
4. Web manual entry/detail flow with validation and destructive confirmation.
5. Web privacy/settings and conflict resolution.
6. iOS overview, transactions, manual entry, import/review, settings/privacy, sync status, and conflict resolution.
7. Portfolio/demo entry state with clearly labeled sample data.

Visual acceptance requires: no clipped content at iPhone X width; no critical action below a safe-area obstruction; no missing loading/error/empty/offline state; no contrast or focus/touch-target defect; chart meaning remains understandable without color; and web/iOS screenshots show a coherent visual family while respecting platform-native interaction patterns.

## Web surfaces

### Dashboard

- Period control: week, month, custom.
- Summary region: total spent, credits, net activity, transaction count.
- Category breakdown with a chart plus an accessible text/table alternative.
- Recent transaction activity with a clear route to the full history.
- Sync/offline status is always discoverable but not visually noisy.

### Import review

- Dropzone and file picker support CSV/PDF only.
- Parser status uses progressive feedback, not a blocking blank screen.
- Review table prioritizes merchant, date, amount, category suggestion, confidence/status, and action.
- Rows needing attention are filterable and never hidden below accepted rows.
- Commit action states accepted, excluded, unresolved, duplicate, and error counts before confirmation.

### Transaction history

- Search, period, category, and status filters are composable and resettable.
- Category edits are keyboard accessible and show provenance/explanation.
- Large result sets use incremental loading and preserve scroll/filter state.

### Manual entry and detail

- Labels are above fields; placeholder text never replaces labels.
- Amount and date fields use explicit formatting and validation.
- Delete is destructive, confirmed, and explains scope.

## Native iOS surfaces

- Primary navigation uses 3-5 tabs only if the information architecture needs them; the initial plan should prefer a small set such as Overview, Transactions, Import, and Settings.
- Hierarchical details use `NavigationStack` compatible with iOS 16.
- Manual entry and import review use sheets when the task is focused; users can dismiss safely without losing unsaved work.
- List rows have at least 44pt interactive targets and expose edit/delete through standard controls or swipe actions without overriding the system back gesture.
- Use SF Symbols for standard actions, semantic system colors, system text styles, Dynamic Type, Dark Mode, VoiceOver labels/hints, and meaningful haptic outcomes.
- The primary iOS flow must fit iPhone X width and respect notch/home-indicator safe areas.
- Charts must have an accessible textual summary and avoid relying on color alone.

## Accessibility acceptance

- Web: keyboard-only completion of import review, manual entry, category correction, and filter reset; visible focus; semantic headings/labels; reduced motion; contrast validation.
- iOS: VoiceOver completion of the same primary flows; Dynamic Type at largest supported setting; Dark Mode; Increase Contrast; 44pt targets; no color-only meaning.
- Errors are adjacent to the field or row they describe and are announced/available to assistive technologies.

## Visual quality gates

- No generic three-card dashboard pattern as the primary composition.
- No decorative gradient or motion that obscures amounts, categories, warnings, or sync state.
- No invented financial performance metrics in demo content without an explicit sample label.
- The web and iOS apps must feel related, not pixel-identical.
- The design review uses Impeccable for operate-mode UX/a11y/performance review, design-taste-frontend for visual direction where applicable, and iOS HIG/mobile skills for native surfaces.
