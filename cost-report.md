# Expense Tracker Cost and Feasibility Report

**Status**: Temporary planning report

**Date**: 2026-08-04

## Executive Summary

The required first-release architecture is designed to be buildable, runnable, testable, and usable for **$0 in software and service fees**:

- The web app runs locally with a local encrypted vault.
- The iOS app is installed on the owner's phone through Xcode and a free Apple Account/Personal Team.
- The PC runs the local web app and optional free relay/companion; the iOS app can queue expenses while away and later synchronize them when the user returns to the PC network and opens both apps in the foreground.
- CSV/PDF parsing and categorization run locally; no paid parsing, AI, bank, or document API is required.
- Optional static hosting is demo-only and is not required for the application to work.
- App Store and TestFlight distribution are explicitly out of scope.

This is a **$0-required setup**, not a promise that hardware, electricity, internet access, or future optional hosted services have no cost. A Mac is required for native iOS builds, and free iOS provisioning has periodic reinstall limitations.

## Required Stack and Cost Status

| Technology or tool | Required cost | Notes |
|---|---:|---|
| React, TypeScript, Vite | $0 | Free/open-source development stack; runs locally and can be statically hosted optionally |
| Node.js and npm | $0 | Free local runtime and package tooling |
| Swift, SwiftUI, XCTest, Xcode | $0 in software fees | Requires compatible Mac hardware; Xcode supports local simulator/device development |
| SQLite-compatible local storage | $0 | Local vault storage; exact library must pass license review before implementation |
| Papa Parse or equivalent | $0 | Local CSV parsing; exact dependency must remain permissively licensed |
| PDF.js or equivalent | $0 | Local text-PDF parsing; no upload or paid document service required |
| Local relay/companion | $0 | Runs on the user's computer or future desktop app using a free runtime; no hosted relay is required |
| Design/testing skills | $0 required | Guidance only; not runtime dependencies or paid hosted services |
| Supabase, PowerSync, hosted databases, hosted sync | Not required | Removed from the required architecture because hosted free tiers are not permanent guarantees |

Every dependency selected during implementation MUST be free to install and use for this project, have an acceptable license, and work without a paid account or hosted service.

## Required $0 Operating Model

```text
Local computer:
  React/Vite web app
  Encrypted local vault
  Optional local relay/companion

Owner's iPhone:
  Native SwiftUI app, iOS 16 minimum
  Encrypted local vault

Connection:
  Explicit pairing code
  Encrypted local-network mutation exchange
  Append-only mutation log

Optional only:
  Static web hosting for a sanitized demo shell
  User-controlled relay outside the local network
```

The relay is not the source of truth and must not be the only copy of financial data. When it is unavailable, local entry, import, categorization, summaries, and history remain usable. Synchronization resumes when the devices can reconnect.

## iOS Cost and Distribution Boundary

The owner may develop and test the app locally without Apple Developer Program membership using:

- A compatible Mac
- Xcode
- A free Apple Account/Personal Team
- The iOS Simulator and/or the owner's iPhone X-class device

Free personal-device provisioning has practical limitations, including periodic expiration/reinstallation. These limitations must be documented, but they do not create a required monetary fee for the requested local testing workflow.

The following are explicitly not required:

- App Store publication
- TestFlight
- Public distribution
- Paid Apple Developer Program membership

If public distribution is desired later, Apple Developer Program membership and its current annual fee would become an optional future cost. It is not part of this project requirement.

## Hosting Status

Always-on public hosting is not required. The supported baseline is local operation and same-network synchronization.

Optional static hosting may be used for a portfolio/demo shell if its free terms remain suitable, but it MUST:

- Use sanitized demo data only.
- Never be required for vault creation or core flows.
- Never receive raw bank statements by default.
- Not introduce a required hosted database, auth service, or sync provider.

A remote relay or tunnel can be added later as a user-controlled enhancement, but the first release does not promise remote synchronization across arbitrary networks for $0.

## Privacy and Data-Cost Boundary

- Statements are parsed locally and default to ephemeral originals.
- Normalized records remain in encrypted local vaults.
- Mutation envelopes exchanged through the relay are application-layer encrypted.
- Pairing is explicit and revocable.
- Export/import provides a user-controlled backup and migration path.
- No paid cloud account, cloud credential, bank login, AI API, parsing API, or hosted sync tier is required.

## Feasibility Matrix

| Scenario | $0 required? | Conditions |
|---|---:|---|
| Local web development and use | Yes | Requires a computer and local free toolchain |
| CSV/PDF parsing and categorization | Yes | Runs locally with supported file limits |
| Web offline storage | Yes | Uses local encrypted vault storage |
| iOS simulator development | Yes | Requires a compatible Mac and Xcode |
| Personal iPhone installation/testing | Yes | Free Apple Account; periodic provisioning/reinstall limitations |
| iOS phone-away/PC-later synchronization | Yes | iOS queues expenses locally; later foreground reconnect to the PC web app/relay drains the backlog exactly once |
| Web-to-iOS synchronization | Yes | Same local network or a user-controlled free relay must be available |
| Public always-on hosted sync | Not required | Deliberately excluded from the baseline |
| Optional static demo hosting | Usually | Depends on the host's current free terms and quotas |
| App Store/TestFlight distribution | No | Optional future path requiring paid Apple membership |

## Final Status

**Confirmed:** The revised plans and specifications now require a $0-required local setup. Supabase, PowerSync Cloud, hosted databases, hosted synchronization, paid APIs, and App Store/TestFlight distribution are no longer required dependencies.

**Caveats:** The user must provide a compatible development computer, a Mac for native iOS builds, an iPhone for device testing, and any ordinary electricity/network access. Free iOS provisioning may require periodic reinstall. Expenses added while away from the PC remain safely queued on the phone, but they become available on the PC only after the PC/relay is reachable and the apps reconnect in the foreground. Remote, always-on synchronization while the PC is unreachable would require additional user-controlled infrastructure or a future hosted service and is outside the strict $0 first-release promise.

## Sources for implementation verification

- Xcode: https://developer.apple.com/xcode/
- Apple membership comparison: https://developer.apple.com/support/compare-memberships/
- React: https://react.dev/
- TypeScript: https://www.typescriptlang.org/
- Vite: https://vite.dev/
- SQLite: https://www.sqlite.org/copyright.html
- PDF.js: https://mozilla.github.io/pdf.js/
