# Dependency matrix

**Scope:** local-first Expense Tracker implementation, August 2026. Manifest ranges use `^` where shown; reproducible installs use the committed `package-lock.json` (lockfile version 3).

The required product path remains $0 in software and service fees. No hosted database,
hosted synchronization tier, cloud credential, paid parsing API, App Store account,
or TestFlight distribution is required.

| Area | Dependency | Manifest range / lock | License/use | Current boundary |
|---|---|---:|---|---|
| Web UI | React + React DOM | `^19.0.0` | MIT; local bundle | Implemented in `apps/web` |
| Web build | Vite + React plugin | `^6.0.0` / `^4.5.0` | MIT; local dev/build | Implemented |
| TypeScript | TypeScript | `^5.9.0` | Apache-2.0; local compile | Implemented |
| CSV parsing | Papa Parse | `^5.4.0` | MIT; local parsing | Implemented in `packages/parsing` |
| Text PDF parsing | PDF.js | `^5.4.0` | Apache-2.0; local text extraction | Implemented in `packages/parsing`; OCR intentionally deferred |
| Browser SQLite | `@journeyapps/wa-sqlite` | `^2.0.1` | MIT; WASM/local VFS | Adapter implemented in `apps/web/src/local`; browser runtime validation remains a browser/clean-machine task |
| Web test DOM | jsdom | `^25.0.0` | MIT; test-only | Implemented |
| Web test utilities | Testing Library + axe-core | current workspace pins | MIT; test-only | Implemented web contract/accessibility tests |
| Relay transport | `ws` | `^8.18.0` | MIT; local process | Health/WebSocket/replay scaffold implemented; full pairing protocol is future US6 work |
| Relay runtime | Node.js + `tsx` | Node >=22.5 / `^4.19.0` | Open source runtime/tooling | Implemented |
| iOS UI | SwiftUI/Foundation/Combine | Apple SDK, iOS 16 floor | System frameworks | Scaffold implemented; no third-party UI dependency |
| iOS storage | System SQLite3 + encrypted Codable rows | Apple SDK | Must remain free/local and iOS 16-compatible | `SQLiteVaultStore` source adapter plus Keychain key persistence; Xcode validation pending |
| iOS crypto | CryptoKit + Security Keychain | Apple SDK | System frameworks | AES-GCM encrypted local rows and Keychain-backed vault keys are implemented in source; Xcode validation pending |
| iOS project generation | XcodeGen (optional) | not required at runtime | MIT; developer tool | `apps/ios/project.yml` provided; XcodeGen/xcodebuild unavailable on this Windows machine |

## Selection rules

- Dependencies must run locally and must not require an account or hosted tier.
- Financial data remains in local vaults; the relay is optional and should retain only opaque encrypted envelopes.
- New dependencies require a license, iOS 16/browser compatibility, and offline/local-use review before adoption.
- SwiftData is intentionally excluded because iOS 17 is above the required deployment floor.
