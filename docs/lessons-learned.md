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
