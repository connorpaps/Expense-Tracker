---
name: Expense Tracker
description: A private local-first expense workbench with an editorial instrument character.
colors:
  ink-950: "#14161B"
  ink-900: "#1C2027"
  ink-800: "#262B34"
  ink-700: "#333B47"
  ink-600: "#4B5565"
  ink-500: "#6B7484"
  ink-400: "#9AA3B0"
  ink-300: "#C6CCD6"
  ink-200: "#E1E5EB"
  ink-100: "#EDF0F4"
  ink-50: "#EEF0ED"
  copper-700: "#8F411B"
  copper-600: "#B45A25"
  copper-500: "#C96B31"
  copper-400: "#E08A4D"
  copper-300: "#F0AA73"
  copper-100: "#F7E5D7"
  positive-700: "#18502F"
  positive-500: "#23633A"
  positive-100: "#E5F1E9"
  warning-700: "#75470A"
  warning-500: "#986014"
  warning-100: "#F7EBD7"
  destructive-700: "#7F201D"
  destructive-500: "#A52C27"
  destructive-100: "#F8E4E2"
  focus: "#2F6FED"
typography:
  display:
    fontFamily: "Fraunces, Georgia, Times New Roman, serif"
    fontSize: "clamp(2.15rem, 4vw, 3.5rem)"
    fontWeight: 700
    lineHeight: 1.12
    letterSpacing: "-0.025em"
  body:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "ui-monospace, Cascadia Code, SF Mono, Menlo, Consolas, monospace"
    fontSize: "0.68rem"
    fontWeight: 750
    lineHeight: 1.3
    letterSpacing: "0.14em"
rounded:
  sm: "10px"
  md: "14px"
  lg: "18px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  xxl: "32px"
  xxxl: "48px"
components:
  button-primary:
    backgroundColor: "{colors.copper-600}"
    textColor: "#FFFFFF"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "0 17px"
    height: "44px"
  button-secondary:
    backgroundColor: "#FFFFFF"
    textColor: "{colors.ink-950}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "0 17px"
    height: "44px"
  panel:
    backgroundColor: "#FFFFFF"
    textColor: "{colors.ink-950}"
    rounded: "{rounded.md}"
    padding: "24px"
  input:
    backgroundColor: "{colors.ink-50}"
    textColor: "{colors.ink-950}"
    rounded: "{rounded.sm}"
    height: "44px"
---

# Design System: Expense Tracker

## Overview

**Creative North Star: "The Editorial Instrument"**

Expense Tracker should feel like a carefully made working instrument for reading personal financial life. It is not a generic fintech dashboard, a playful budgeting game, or a portfolio mockup pretending to be a product. Its confidence comes from precision: clear totals, legible records, visible provenance, and honest local status.

The redesign replaces the incumbent rounded-panel-heavy treatment with a more deliberate composition. Spacious overview regions establish hierarchy, while transactions and import review retain useful density. Surfaces should feel assembled from a small vocabulary of ink, paper, copper, dividers, and measured type rather than decorated with effects.

The portfolio layer comes from the product's real mechanism: private vaults, reviewable imports, explicit categorization learning, offline use, encrypted backup, and transparent synchronization boundaries. Do not add invented customer proof, financial performance claims, or decorative charts that imply unsupported analysis.

**Key Characteristics:**
- Editorial hierarchy with practical workbench density.
- Cool ink neutrals and one copper accent family.
- Data is the visual material: amounts, dates, status, provenance, and review state.
- Open composition first; containers appear only when they clarify grouping or safety.
- Motion is sparse, fast, and reserved for feedback and state transition.

## Colors

The palette is cool ink and pale paper with copper as a deliberate signal, supported by semantic positive, warning, destructive, review, and focus roles.

### Primary
- **Measured Copper** (#B45A25): Primary actions, selected navigation, important local affordances, and the visual thread that identifies Expense Tracker.
- **Deep Copper** (#8F411B): Hover and active treatment where stronger contrast is needed.

### Secondary
- **Clear Positive** (#23633A): Credits, successful local saves, and confirmed positive state. Never used as decoration.
- **Review Amber** (#986014): Needs-review rows, pending attention, and warnings with an explicit action.
- **Destructive Red** (#A52C27): Destructive action and failure state only.
- **Focus Blue** (#2F6FED): Keyboard focus ring only; it must remain visible against both light and dark themes.

### Neutral
- **Ink 950** (#14161B): Primary text and strongest structural contrast.
- **Ink 600** (#4B5565): Secondary text and supporting explanations.
- **Ink 500** (#6B7484): Muted metadata and non-primary context.
- **Ink 200** (#E1E5EB): Dividers and low-emphasis borders.
- **Ink 100** (#EDF0F4): Soft grouping surfaces.
- **Cool Paper** (#EEF0ED): Page background and quiet field context.
- **Elevated White** (#FFFFFF): Panels, rows, and controls that need separation from the page.

### Named Rules
**The Copper Signal Rule.** Copper is meaningful because it is not everywhere. Use it for action, selection, and the product's local-first thread, not for every heading or decorative flourish.

**The Semantic Color Rule.** Positive, warning, destructive, review, and focus colors communicate state only. Every state must remain understandable through text, structure, or iconography without color.

## Typography

**Display Font:** Fraunces with Georgia and Times New Roman fallbacks

**Body Font:** System sans stack: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif

**Label/Mono Font:** System monospace stack: ui-monospace, Cascadia Code, SF Mono, Menlo, Consolas, monospace

**Character:** Display type gives the product a recognizable voice at page titles and key section headings. Body type stays neutral and highly legible for forms and records. Monospace is reserved for metadata, amounts, timestamps, file states, and technical sync details.

### Hierarchy
- **Display** (700, `clamp(2.15rem, 4vw, 3.5rem)`, 1.12): Route titles and high-level overview statements.
- **Headline** (700, `clamp(1.25rem, 2vw, 1.65rem)`, 1.12): Major panels and task groups.
- **Title** (700, approximately 1.05rem, 1.2): Transaction merchants, conflict titles, and focused controls.
- **Body** (400, 15px, 1.5): Explanations, form content, and privacy copy, generally kept within a readable 60-70ch measure.
- **Label** (750, approximately 0.68rem, 1.3, tracked uppercase): Small structural metadata only. Labels should not precede every section heading.

### Named Rules
**The Numbers Have a Home Rule.** Amounts, counts, dates, and sync metadata use tabular or monospace treatment so comparison is effortless. Never use expressive display type for financial values.

**The Label Restraint Rule.** Small tracked labels are structural wayfinding, not decoration. Use them where they shorten scanning, not as a ritual above every section.

## Layout

The desktop layout is a two-part workbench: a stable navigation/context rail and a generous content canvas with a readable maximum width. The primary content should support a broad desktop composition without becoming a stretched dashboard. Overview can use asymmetric summary and detail regions; Transactions and Import can use wider working widths than Settings or Sync.

Use the existing 12/16/24/32/48px rhythm as the base, with more space above a new page section than below its heading. The desktop-first experience should make statement review and transaction cleanup comfortable at laptop width. At narrow widths, the navigation becomes a compact sticky header plus horizontally scrollable or reorganized primary links, while data rows become stacked records rather than clipped tables.

Responsive behavior is a deliberate transformation, not a simple scale-down. High-value actions remain visible, long labels remain readable, and dense review surfaces may scroll horizontally only when the table semantics truly require it. No route may introduce accidental page-level horizontal overflow.

## Elevation & Depth

Depth is primarily tonal and structural. Use thin ink-neutral borders, grouped backgrounds, whitespace, and occasional restrained ambient shadows. The default surface is quiet; elevated treatment is reserved for primary task panels, dialogs, and transient states. Avoid glass everywhere, colored halos, or shadows that compete with financial values.

### Shadow Vocabulary
- **Ambient work surface** (`0 18px 50px color-mix(in srgb, var(--color-primary-text) 7%, transparent)`): Large panels where separation from the paper background is useful.
- **Action lift** (`0 8px 18px color-mix(in srgb, var(--color-accent) 24%, transparent)`): Primary actions at rest or hover, used sparingly.
- **No shadow**: Rows, dividers, metadata, and ordinary settings groups should rely on structure rather than elevation.

### Named Rules
**The Quiet Surface Rule.** If a shadow or background effect does not improve grouping, hierarchy, or state recognition, remove it.

## Shapes

The form language uses gently curved but controlled geometry: 10px controls, 14px grouped surfaces, and 18px larger task panels. Pills are reserved for filters, status, and compact state indicators. Do not mix sharp cards with round buttons without a functional reason. Borders should be low-contrast at rest and stronger on focus, hover, selected, warning, or destructive states.

## Components

### Buttons
- **Shape:** Compact, tactile controls with a 10px radius and a minimum 44px height.
- **Primary:** Measured Copper with white text, clear one-line labels, and an understated copper lift.
- **Hover / Focus:** Small upward movement or tonal change; focus uses the global focus ring and must not rely on color alone.
- **Secondary / Ghost:** Secondary buttons use a quiet elevated fill or border. Ghost buttons are for low-emphasis actions, not destructive actions by default.

### Chips
- **Style:** Compact rounded filters with a neutral fill and low-contrast border.
- **State:** Selected review/attention filters use semantic amber treatment plus text, never color alone.

### Cards / Containers
- **Corner Style:** 14px for grouped surfaces, 18px for major task panels.
- **Background:** Elevated white on cool paper, with occasional ink-100 or semantic tint for state.
- **Shadow Strategy:** Ambient only on major surfaces; rows and settings groups are structurally separated.
- **Border:** One-pixel low-contrast border at rest; semantic border when the surface carries warning, failure, or success.
- **Internal Padding:** 24px default, scaling to 32-40px for primary page panels and 16px for dense rows.

### Inputs / Fields
- **Style:** Pale paper field, 10px radius, visible neutral border, 44px minimum height, labels above fields.
- **Focus:** 3px visible focus ring with offset; focus must remain obvious in both color modes.
- **Error / Disabled:** Error text sits beside or below the field; disabled controls retain readable text and show why they cannot be used where necessary.

### Navigation
- **Style:** Desktop context rail with a compact brand mark, vault context, local status, and five route links. Active state is copper-tinted and text-led rather than a loud full-bleed tab.
- **Mobile:** Sticky compact header with vault context and a usable primary navigation treatment. Preserve route labels and avoid inaccessible overflow.

### Signature Components
- **Local status:** Always discoverable, concise, and explicit about local save, offline status, pending changes, and sync connectivity.
- **Review surface:** Import tables and transaction rows prioritize merchant, date, amount, category, provenance, and action without hiding the working data behind decorative cards.
- **Privacy boundary:** Backup, retention, vault, and sync surfaces communicate scope in plain language before destructive or trust-sensitive actions.

## Do's and Don'ts

### Do:
- **Do** make the product's privacy and local-first mechanism visible through useful status, not marketing claims.
- **Do** let financial values, row state, and review actions establish the visual rhythm.
- **Do** use asymmetry where it improves hierarchy, especially on Overview and workbench surfaces.
- **Do** preserve desktop efficiency while giving mobile users a deliberate stacked fallback.
- **Do** test populated, empty, loading, error, offline, needs-review, conflict, and demo states.
- **Do** keep the copper accent scarce enough that a selected or primary action is instantly findable.
- **Do** use motion to acknowledge saved state, filter changes, import progress, and meaningful transitions.

### Don't:
- **Don't** turn a daily expense tool into a marketing landing page.
- **Don't** hide provenance, diagnostics, review state, or local/sync limitations just to make the interface look cleaner.
- **Don't** use generic three-card dashboard composition as the central visual idea.
- **Don't** make every surface a floating rounded card or every label an uppercase eyebrow.
- **Don't** introduce fake financial metrics, customer proof, bank integrations, or synchronization guarantees.
- **Don't** rely on color alone for category, review, credit, warning, or sync meaning.
- **Don't** use motion, glass, gradients, or decorative visuals that slow down statement review or obscure amounts.
