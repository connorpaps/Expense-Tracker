## Follow-up verification — TD categories and stale browser session (2026-08-06)

- User-reported existing tab continued showing blank category selects and `No active rule recognized` for 17 rows after hard refresh.
- Active persistent vault was inspected directly: all 11 categories were present, active, and queryable, so the issue was not missing category migration or SQLite boolean mapping.
- Strengthened `scripts/audit-browser.mjs` to assert actual selected `<select>` values and reject legacy fallback explanations. Fresh audit against port 5174 passed 23/23 with 19/19 selected categories and zero old fallback messages.
- Started a clean standalone Vite instance on `http://localhost:5180/` and independently verified the same full audit: **23/23 passed**, TD PDF committed 19 transactions, zero uncategorized rows, zero legacy fallback messages, and clean console.
- Recommended user URL for a guaranteed fresh session: `http://localhost:5180/#/import`. Existing port 5174 Vite/browser process trees remain difficult to terminate reliably on Windows; this is an environment/session issue, not categorization logic.

## Final category-preview hardening (2026-08-06)

- Hardened repository boolean mapping so `demo_mode` and `is_active` values from SQLite adapters are recognized for numeric, string, and boolean representations (`1`, `"1"`, `true`, `"true"`) while inactive values remain inactive.
- Added a storage regression using browser-compatible string-valued `is_active` rows for categories and personal rules.
- Added development startup cleanup that unregisters any production service worker and removes only `expense-tracker-shell-*` caches. This prevents an old production shell on the same localhost origin from masking the current Vite bundle; IndexedDB, SQLite, and imported records are untouched.
- Final evidence: focused regression suite **24 tests passed**, domain/web typechecks passed, live TD audit **23/23 passed** with **19/19 selected categories**, zero legacy fallback messages, and zero console errors. Full repository gate passed **43 files / 211 tests**, workspace typecheck, lint, production build, and `git diff --check` before the final two defensive changes; the post-change focused suite and typechecks also pass.
- Final defensive changes: development cleanup now unregisters only this app's same-origin `/sw.js` registration and deletes only `expense-tracker-shell-*` caches; encrypted import mutation payloads now carry the effective corrected category ID.

## Session closeout — unresolved real-browser discrepancy (2026-08-06)

- User still reports the original screenshot behavior in their actual browser: TD rows render with blank `Choose a category` selects and the legacy `No active rule recognized` text.
- Fresh automated Chrome profiles against the current Vite server continue to pass **23/23**, including **19/19 populated category selects**, so the defect is not yet reproduced in the available clean-browser harness.
- Next session should inspect the user's actual tab/runtime directly before changing more source: capture the loaded script URLs, service-worker registrations, `window.__vaultStore` category rows, `listCategories()` results, and the import preview object immediately before `ReviewTable` renders. Do not assume another hard refresh or another generic cache fix is sufficient.
- Active development listeners at closeout: port **5174** (PID 15744) and port **5180** (PID 15380). Browser vault records were not deleted.
