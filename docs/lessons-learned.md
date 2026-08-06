# Lessons Learned & Error Log

**Purpose:** A permanent, structured record of mistakes, errors, gotchas, project issues, and fixes. The goal: never repeat a lesson, and never let a future session re-debug something already solved (e.g., the PDF import issue that once took ~1 hour).

## How this file stays up to date (automatic)

1. **Git hook safety net:** `.githooks/post-commit` auto-appends a placeholder entry here for every commit whose message mentions `fix`/`bug`/`error`/`regression`/etc. — look for `(auto-captured, needs enrichment)` entries.
2. **Agent ritual (mandatory, immediate):** the session protocol in `knowledge.md` and `AGENTS.md` requires reading this file at session start and appending a full entry **immediately** whenever an error is fixed, a mistake is made, or a gotcha is discovered — never at session end.
3. **Session-end sweep:** the agent expands auto-captured placeholders with root cause + "avoid in future" and removes the enrichment marker.

## Entry format (keep every entry this shape)

- **Symptom:** what went wrong or the error observed
- **Root cause:** why it happened
- **Fix:** what was changed to resolve it
- **Avoid in future:** the actionable rule to prevent recurrence
- **Status:** `fixed` | `workaround` | `open`

---

## 2026-08-05 — PDF import showed generic "This file could not be imported." (took ~1 h to find)

- **Symptom:** Uploading a valid PDF in the browser showed the generic error card even though Node parsing produced 19 rows. No specific error surfaced anywhere in the UI.
- **Root cause:** `App.tsx`'s vault-bootstrap effect called `store.db.close()` on its cancelled effect pass. In dev, React StrictMode runs the effect twice against the same module-singleton wa-sqlite handle, so the first pass closed the live DB that the second pass published. Every later query (import `listCategories`/`listTransactions`) failed with `SQLITE_MISUSE` — an *uncoded* error that rendered as the generic card. Unit tests never caught it (Node has no StrictMode double-invoke; jsdom cannot run the real browser/wa-sqlite path).
- **Fix:** The cancelled pass no longer closes the session-owned singleton store; raw parse/commit errors are now logged with `console.error` instead of being swallowed. Verified end-to-end with `scripts/repro-import.mjs`.
- **Avoid in future:**
  - Never call `.close()`/dispose on a module-singleton resource from a cancelled React StrictMode effect pass.
  - Browser-only bugs are invisible to Node/jsdom tests — verify in a real browser (`scripts/audit-browser.mjs`, `scripts/repro-import.mjs`, `scripts/audit-reload.mjs`).
  - Never swallow raw errors — `console.error` the original error before mapping to a safe user message.
  - Diagnose from the real console error (CDP) before theorizing.
- **Status:** fixed

## 2026-08-05 — Audit assertions failed because the test assumed behavior instead of checking the contract

- **Symptom:** Three live-audit assertions failed even though the app was behaving correctly.
- **Root cause:** Assertions assumed all 5 re-imported rows would be duplicates, ignoring that the excluded row was never committed (so it correctly stayed "Ready").
- **Fix:** Re-derived expectations from the actual data flow; assertions corrected in `scripts/audit-browser.mjs`.
- **Avoid in future:** When an assertion fails, first decide whether the app OR the assertion is wrong; verify against the actual contract/golden data before changing code.
- **Status:** fixed

## 2026-08-05 — Bash `cd x && cmd &` backgrounds the whole list (wrong cwd)

- **Symptom:** After `cd x && npx serve &`, subsequent commands ran from the original cwd (module not found / wrong script path).
- **Root cause:** In bash, `&` applies to the entire `cd && cmd` list, not just `cmd`.
- **Fix:** Use the subshell pattern `(cd x && cmd > log 2>&1 & echo $! > pid)` and kill via the recorded PID.
- **Avoid in future:** For backgrounded servers in test/automation commands, always use the subshell pattern or absolute paths; confirm with `pwd` after `&`.
- **Status:** fixed

## 2026-08-05 — browser-use agent unreliable here; use the repo's CDP harness instead

- **Symptom:** The browser-use agent returned no output in this environment; CDP `DOM.setFileInputFiles` did not reliably expose `input.files`.
- **Fix:** Built custom headless-Chrome CDP harnesses using Node's built-in WebSocket + `DataTransfer` File injection: `scripts/repro-import.mjs`, `scripts/audit-browser.mjs`, `scripts/audit-reload.mjs`.
- **Avoid in future:** For browser verification in this repo, reuse those scripts instead of spawning browser automation agents.
- **Status:** fixed

## 2026-08-05 — First PDF parse cold-starts slowly

- **Symptom:** The first in-session PDF parse in a fresh browser profile sometimes took > 30 s; subsequent parses were fast.
- **Root cause:** Cold start of the PDF.js worker in a fresh profile.
- **Fix:** None needed (correct behavior); automation should allow generous waits on the first PDF parse.
- **Avoid in future:** Don't flag "slow first PDF parse" as a bug; budget ~45 s in automated checks.
- **Status:** known quirk

## 2026-08-05 — Stray dev/test listeners accumulate across sessions

- **Symptom:** A stale Vite server kept listening on 5173 across sessions; ad-hoc relay/preview tests left listeners on 8712/4199.
- **Fix:** Killed strays by inspecting `netstat -ano | grep LISTENING` and killing the PIDs; use `--strictPort` and capture the PID.
- **Avoid in future:** Check `netstat -ano | grep -E ':(5173|8712|4199)' | grep LISTENING` before dev runs and after server tests.
- **Status:** fixed

## 2026-08-06 — Confirmation must revalidate an authority before peer issuance

- **Symptom:** Review found that an existing authority could be revoked or expire after pairing start but before confirmation, while peer issuance and binding proceeded from stale session state.
- **Root cause:** Confirmation trusted the session's saved token hash and ignored current device revocation/expiry; binding results were not treated as a required gate.
- **Fix:** Revalidated the current authority record immediately before issuance, checked bind results, and rolled back newly issued records/bindings on failure. Added focused pairing coverage around credential ordering.
- **Avoid in future:** Revalidate mutable authorization state at the commit point of a multi-party handshake, and treat every binding operation as transactional.
- **Status:** fixed

## 2026-08-06 — Lessons log append accidentally replaced the file

- **Symptom:** A write intended to append one lesson replaced the full lessons log with a shortened version.
- **Root cause:** A whole-file write tool was used where an append operation was required.
- **Fix:** Restored the committed lessons log and appended the new structured entries with a shell heredoc; verified the tail and line count.
- **Avoid in future:** Never use whole-file replacement for an append-only memory log unless the complete current file has been read and preserved; prefer a targeted append command.
- **Status:** fixed

## 2026-08-06 — Vitest hoists module mocks before test-scope constants

- **Symptom:** The new sync integration suite failed before running because the mocked encryption function was accessed before initialization.
- **Root cause:** `vi.mock` is hoisted by Vitest, while the mock function had been declared as a normal top-level constant.
- **Fix:** Created the mock with `vi.hoisted` and reset it before each test; the fake database now tracks pending mutation state.
- **Avoid in future:** Use `vi.hoisted` for mock values referenced by a hoisted factory, and clear stateful mocks between tests.
- **Status:** fixed

## 2026-08-06 — CDP audit must use semantic labels and React-native input setters

- **Symptom:** The first live vault audit reported an unlabeled input and timed out creating a vault even though the UI had a semantic label.
- **Root cause:** The harness checked `aria-label` instead of the implicit label and assigned `.value` directly on a controlled React input, bypassing React's tracked value setter.
- **Fix:** The audit now verifies the semantic label and uses the native HTML input value setter before dispatching events; it also selects the created vault by its explicit label.
- **Avoid in future:** Test accessible names through the user-facing label semantics, and use a framework-compatible native value setter for CDP-controlled React inputs.
- **Status:** fixed

## 2026-08-06 — Workspace-local Vitest project filters need root context

- **Symptom:** Running `npm run test --workspace @expense-tracker/web` failed with `No projects matched the filter "web"` before executing tests.
- **Root cause:** The workspace script passes the root Vitest project name while npm runs it with the workspace directory as the working directory, so the root config is not loaded.
- **Fix:** Use the established root command `npx vitest run --project web` for repository validation; the application and tests were unchanged.
- **Avoid in future:** Run workspace-scoped Vitest filters from the repository root, or define a workspace-local Vitest config/script that does not depend on root project names.
- **Status:** fixed

## 2026-08-06 — Audit timeout must be registered before the exiting cleanup path

- **Symptom:** Review found the vault audit's timeout was registered after a `finally` block that always called `process.exit()`, so the timeout could never protect startup or CDP hangs.
- **Root cause:** Cleanup and process termination were structured before timeout registration.
- **Fix:** Register the timeout before the main try/finally, clear it during normal cleanup, and keep centralized cleanup for all paths.
- **Avoid in future:** Install watchdog timers before entering effectful async work, and ensure normal completion clears them without making the watchdog unreachable.
- **Status:** fixed

## 2026-08-06 — Browser cleanup APIs need a no-IndexedDB test path

- **Symptom:** The focused web privacy test failed in Node with `ReferenceError: indexedDB is not defined` while testing local-data clearing.
- **Root cause:** The cleanup helper assumed browser IndexedDB was always available, even though the same exported API is exercised in Node-environment contract tests.
- **Fix:** Make IndexedDB deletion a no-op when the API is unavailable and preserve database-close errors while still attempting key/storage cleanup.
- **Avoid in future:** Keep browser storage adapters feature-detected and test cleanup behavior in both browser and non-browser environments.
- **Status:** fixed

## 2026-08-06 — Browser audit assertions must match actual UX state transitions

- **Symptom:** The live backup audit marked restore as failed even though the preview rendered and a second vault was created.
- **Root cause:** The harness required the app to switch the active vault after creating an isolated copy, but the implemented UX intentionally leaves the current vault active.
- **Fix:** Assert the promised behavior—source vault remains present and unchanged, copied vault is isolated/non-demo—without inventing an automatic navigation requirement.
- **Avoid in future:** Validate observable product requirements, not assumed post-action navigation or selection side effects.
- **Status:** fixed

## 2026-08-06 — Browser audit watchdogs must cover preview startup and cleanup

- **Symptom:** `audit-service-worker.mjs 5173` exceeded the 300-second parent timeout without producing a result.
- **Root cause:** The audit's invocation/startup path did not complete within the bounded runner window; this is unproven evidence, not a product pass.
- **Fix:** Do not count the service-worker audit as passed; inspect its expected invocation and keep the timeout bounded before rerunning.
- **Avoid in future:** Run each browser audit with its documented invocation, install watchdogs before preview/server startup, and always distinguish timeout from a functional failure or pass.
- **Status:** investigation

## 2026-08-06 — Release hardening must typecheck new validators and watchdog initialization

- **Symptom:** The focused web typecheck rejected a new `unknown`-typed validator field, and review found the service-worker timeout could access `ws` before initialization if Chrome startup hung.
- **Root cause:** Runtime `typeof` narrowing was incomplete for `evidence_count`, and the watchdog was registered before a `let ws` declaration, leaving a temporal-dead-zone path.
- **Fix:** Add explicit numeric narrowing and declare the nullable WebSocket before registering the timeout.
- **Avoid in future:** Run typecheck immediately after validation changes, and initialize all cleanup resources before watchdog callbacks can fire.
- **Status:** fixed

## 2026-08-06 — Unknown conflict fields must fail closed

- **Symptom:** Review found that an unknown-overlap conflict (`'*'`) was reduced to an empty required-field list, so an empty keep-both payload could pass local validation.
- **Root cause:** The UI filtered the wildcard metadata out before validation and treated the result as a normal known-field conflict.
- **Fix:** Preserve wildcard metadata and reject manual/merged resolution when overlapping fields are unknown; add an integration regression test.
- **Avoid in future:** Unknown schema/field metadata must fail closed for destructive or merge decisions rather than silently accepting an under-specified payload.
- **Status:** fixed

## 2026-08-06 — Full web release pass completed

- **Symptom:** A final release pass was requested before closeout/push.
- **Root cause:** No product failure was found; this was a verification and traceability pass.
- **Fix:** Ran the full static gate and real Chrome audits against dev and production preview. All passed; backup file injection remains synthetic because headless CDP does not expose `input.files` reliably.
- **Avoid in future:** Repeat both static and live-browser gates after substantial changes, and distinguish synthetic file injection from native chooser E2E.
- **Status:** fixed
