## 2026-08-06 — Harden adapter booleans and development cache cleanup

- **Symptom:** A user-visible import screen continued to show blank category selects after server restarts, while fresh source and browser audits categorized all TD rows correctly.
- **Root cause:** The runtime boundary was insufficiently defensive: repository mappings assumed SQLite booleans were only numeric `1`, and a production service-worker shell could remain registered on the same localhost origin and mask the current development bundle.
- **Fix:** Added shared SQLite boolean normalization for vault/category/rule flags, a regression using string-valued `is_active` rows, and development-only service-worker/cache cleanup limited to this app's same-origin `/sw.js` plus `expense-tracker-shell-*`. The encrypted import mutation payload also now uses the user's effective corrected category. Verified the actual TD PDF path in a fresh browser.
- **Avoid in future:** Treat SQLite adapter output as loosely typed at repository boundaries, and explicitly unregister production service workers when starting development code on a reused localhost origin. Browser audits must inspect selected `<select>` values, not just available options.
- **Status:** source fix and clean-profile verification pass; user's real-browser discrepancy remains unresolved

## 2026-08-06 — Clean-profile success does not close a persistent-browser bug

- **Symptom:** Fresh Chrome automation consistently renders all 19 TD categories, but the user's existing browser still renders the old blank-select UI.
- **Root cause:** Not established. The available harness has not reproduced the user's exact browser/profile/runtime state.
- **Fix:** No further product change made during closeout; existing records were preserved.
- **Avoid in future:** Treat clean-profile browser evidence as necessary but not sufficient when a user can still reproduce a UI defect. Instrument the actual tab before making additional speculative changes.
- **Status:** open for next session
