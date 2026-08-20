# Changelog

## 1.1.0 — 2026-08-20

- Added a searchable session-history workspace with manual session creation, editing, and deletion.
- Kept per-note totals, daily totals, open counts, and session records consistent when correcting history.
- Added timestamped local backups, automatic safety backups before destructive changes, and latest-backup restore controls.
- Migrated existing sessions to stable identifiers without discarding historical records.
- Serialized data mutations to reduce lost updates when multiple plugin events finish close together.
- Documented whole-vault synchronization through Obsidian Sync, iCloud, Nutstore, and similar providers; the plugin still makes no network requests and has no separate cloud account.

## 1.0.2 — 2026-08-10

- Adopted Obsidian's official ESLint and Stylelint configurations and resolved every reported source and CSS finding.
- Added runtime validation for persisted study records, daily history, sessions, and settings.
- Migrated the settings tab to Obsidian 1.13's searchable declarative settings API.
- Replaced unsafe fire-and-forget promises and raw DOM element creation with typed, supported patterns.
- Replaced the deprecated `builtin-modules` build dependency with Node's built-in module list.
- Raised the minimum Obsidian version to 1.13.0 to match the APIs used by the plugin.

## 1.0.1 — 2026-08-10

- Removed all dynamic `<script>` element creation from the production bundle by using the stable React 18 runtime.
- Added a regression test that rejects dynamic script injection patterns in `main.js`.
- Added GitHub build provenance attestations for every release asset.
- Replaced synthetic documentation examples with an approved, anonymized snapshot of real local statistics.
- Made the main GitHub README explicitly bilingual.

## 1.0.0 — 2026-08-10

- Initial public release as Study Time Statistics.
- Added inline, non-destructive per-note statistics that scroll with the document.
- Added session history, open counts, average and longest session metrics.
- Added a 365-day heatmap, 30-day trends, time-of-day and weekday distributions.
- Added five note rankings, folder summaries, recent sessions, and streak statistics.
- Added bilingual English and Simplified Chinese interface text and documentation.
