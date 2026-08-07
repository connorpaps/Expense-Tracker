---
name: Expense Tracker
description: A private local-first expense workbench with a modern Cedar Ledger visual language.
colors:
  charcoal-950: "#101512"
  charcoal-900: "#202622"
  charcoal-700: "#4F5A52"
  mineral-paper: "#F3EFE7"
  mineral-surface: "#FCFAF5"
  mineral-rule: "#C9C7BD"
  evergreen-600: "#1F6657"
  evergreen-700: "#174A40"
  saffron-600: "#C58A24"
  positive-600: "#2F7058"
  review-olive: "#62652E"
  warning-700: "#815414"
  destructive-600: "#A43D36"
  focus-saffron: "#8A5A12"
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
  data:
    fontFamily: "ui-monospace, Cascadia Code, SF Mono, Menlo, Consolas, monospace"
    fontSize: "0.78rem"
    fontWeight: 700
    lineHeight: 1.3
rounded:
  sm: "8px"
  md: "14px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  xxl: "32px"
---

# Design System: Expense Tracker

## Overview

**Creative North Star: "The Cedar Ledger"**

Expense Tracker is a private local-first financial workbench. The visual system is modern, warm-neutral, and disciplined: mineral paper, charcoal structure, evergreen actions, saffron highlights, soft olive review states, and clear semantic success/error colors. It should feel like a well-made financial instrument from a contemporary studio—not a blue enterprise console, a candy-colored SaaS dashboard, or a generic fintech template.

The Cedar Ledger palette replaces the previous Rosewood and Abyssal Atlas directions. Warmth comes from the mineral paper and saffron detail; professionalism comes from charcoal type, controlled borders, an evergreen action color, and restrained composition. Color is never sprayed onto every control, and financial meaning remains explicit through labels and structure.

## Palette and use

- **Charcoal structure** (`#202622`): primary type, navigation rail, strong table headers, and structure.
- **Mineral paper** (`#F3EFE7`) and **quiet surface** (`#FCFAF5`): page field and elevated work areas.
- **Evergreen** (`#1F6657`): primary action, active navigation, selected period, import progress, and important links.
- **Saffron** (`#C58A24`): a small personality highlight for the active summary surface, dropzone invitation, and friendly attention—not errors.
- **Mint green** (`#2F7058`): local save, credits, and confirmed success.
- **Olive** (`#62652E`): needs-review and duplicate attention only.
- **Deep ochre** (`#815414`): warnings and pending attention.
- **Brick red** (`#A43D36`): destructive/error state.
- **Saffron focus** (`#8A5A12`): keyboard focus only.

Dark mode keeps the same emotional temperature as a dim studio: charcoal-green background, soft mineral type, luminous evergreen controls, and quiet saffron detail.

## Composition and spacing

The screenshot's touching blocks were intentional in the previous chart treatment: the summary strip used a one-pixel joined ledger so the four values read as one instrument. That is useful for dense data, but it made the empty Overview feel cramped and overly dashboard-like.

The Cedar Ledger separates **major blocks** with 16–24px breathing room and gives each summary value its own quiet surface. It keeps **dense structures** joined where comparison benefits: period segments, import table rows, transaction rows, and category/settings lists. This makes the interface feel more deliberate and professional without sacrificing scanability.

Overview receives the most breathing room: period controls → summary strip → empty/activity state, with clear vertical pauses. Transactions and Import retain higher density because those routes are working surfaces.

## Typography and components

Fraunces remains the self-hosted display face for recognizable route titles and section headings. System sans remains the body face. Monospace is reserved for amounts, dates, import metadata, and sync state. Financial values use tabular numerals.

Primary buttons and active controls use evergreen with high-contrast text. Saffron is never used for normal text on a light surface unless the darker warning token is used. Review surfaces use olive tint plus explicit labels. Success, warning, error, offline, and conflict states remain understandable without color alone.

Panels are quiet, lightly bordered, and separated by whitespace rather than a wall of touching borders. Shadows remain sparse. Pills are reserved for filters and compact state; major surfaces use 14px corners. No decorative blue, pink, purple, or orange/copper wash remains.

## Accessibility and integrity

All routes remain Operate mode. Preserve the existing route slugs, local-first truth, currency semantics, vault isolation, import review behavior, sync terminology, keyboard focus, reduced motion, and responsive behavior. No page-level horizontal overflow. Palette changes visual language only; they must never conceal financial values or safety boundaries.
