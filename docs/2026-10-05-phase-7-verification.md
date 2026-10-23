# Phase 7 verification — provider-neutral post-game import

## Provider contracts and real evidence

On 2026-10-05, the current HenrikDev documentation/OpenAPI confirmed `GET /valorant/v4/matches/{affinity}/{platform}/{name}/{tag}?size=N`, `GET /valorant/v4/match/{affinity}/{matchId}`, and the `Authorization` API-key header. The documentation changelog and OpenAPI version labels differ; this implementation relies on the verified v4 paths and response fields, not an assumed global version label.

With the user's server-configured key, the current adapter successfully fetched exact detail for the supplied match and then five recent candidates for its authorized Riot ID anchor. Discovery included the supplied match. The successful check used two requests, affinity `ap` and platform `pc`, at 2026-10-05 15:38 UTC. No key, raw payload, or participant identity was written into this record.

The supplied 533,865-byte JSONC response and live exact detail normalize as a completed competitive Lotus match with ten players, ten K/D/A sets and ten agent identities. The sample has team scores 12–1, 14 round records (13 Elimination and one terminal Surrendered), and 98 kill events. Its terminal surrender record has no plant/defuse or credited kills. The conservative scored-round completeness gate leaves all event-derived metrics null for this shape. It does not turn uncertain event coverage into zero. Performance Score and Trades remain null.

This is real competitive-match discovery/detail and payload evidence. It does not establish custom/event-queue discovery, event roster mapping, or end-to-end acceptance against the persistent event database. Verify an authorized completed custom/event game before declaring the tournament provider path broadcast-ready. The real check did not import into or migrate the local/event database.

**Editor's note**: Custom games will display the same way, provided that the Match Host does not turn on Hide Match History. To query _ONLY_ custom games, URL Parameter `mode=custom` can help get only Custom Games. It's important to know that, even if the `data.metadata.queue.id` is `custom`, it's unclear if the `data.metadata.queue.mode_type` changes per the Lobby Settings (Standard, Skirmish, etc...). Limited testing with other games from my own time does confirm, but needs more testing.

Spectra's current frontend config and source/type definitions identify `https://stats.valospectra.com/getStats?code=<UPPERCASE_GROUP>` and a v4-compatible response. This hosted statistics dependency is separate from the outgoing live Socket.IO server and extras service. Spectra fixtures are synthetic and source-shaped. No successful real hosted report, pending-to-ready transition or group-code reuse has been observed for this event; these remain release dependencies.

## Automated proof

Provider contract/config tests: 31 passed after independent review. These cover optional private runtime environment loading, independent provider availability, secret-safe serialization/errors, authorization, path encoding, exact-ID mismatch, timeout, 429, malformed data, candidate ordering/empty lists, bounded Spectra polling/cancellation, K/D/A, event coverage, first-blood ordering/ties, and the synthetic surrender boundary.

Domain/database verification after independent review: 46 server test files passed, 256 tests passed and two skipped. The focused review/statistics/agents slice passed 28 tests. Coverage includes ten-player identity mapping, manual mapping, conflicting map/team/result, persistent manual statistics and agent ownership, provider-null protection, explicit single-player discard, stale tokens/context, duplicate associations, concurrent writes, transaction rollback and a populated 0009-to-0010 migration.

UI and route proof: six Chrome component tests and three server action tests passed. They cover provider ordering, missing Riot IDs, manual availability, candidate selection, ten-player diffs, scoped conflicts, revised mappings, stale context and ignored late responses. Action tests verify the saved lineup anchor, server-fetched exact detail, private configuration, encoded paths, request signals and safe error serialization.

Independent UI review found that cancellation could hide the outcome of a committed import/discard. The client now cancels reads only, disables provider controls during writes and processes write completion even after a manual-save revision refresh. Delayed import/discard regressions failed before the fix and passed afterward, verifying canonical refresh and visible completion; a separate regression retains read cancellation. The UI re-review approved the fix.

The two deterministic Playwright journeys passed against the actual adapter-node build and localhost provider fixtures in 29.2 seconds, including clean teardown. HenrikDev covers explicit candidate choice, canonical import, manual correction, repeated keep-local protection, explicit provider resolution, renamed-player mapping, revision invalidation and 429 feedback. Spectra covers pending exhaustion, Stop/Cancel with a delayed response, pending-to-ready review/import and reload persistence. The fixture server replaces the key with a synthetic value before configuring localhost destinations. Temporary-database deletion uses bounded native retries for Windows's delayed libSQL handle release, retaining the resolved-safe-path check and permanent failure reporting.

Release commands on the integrated implementation:

- `pnpm check`: zero errors and zero warnings.
- `pnpm build`: passed with the Node adapter. A subsequent scan of 481 client/source/documentation files found zero configured-key leaks; client output also contained no synthetic test key.
- `pnpm test` with Chrome, before the final cancellation regressions: 320 passed, two skipped and 12 failed. All failures are the same existing graphics-template assertions described below. The final component slice passed all six tests after the cancellation fix. This command stops before E2E, so the provider journey was run separately.
- `pnpm lint`: stopped on repository-wide formatting warnings, including existing files and the supplied JSONC/phase plan. Scoped ESLint passed for all changed phase 7 TypeScript/Svelte files; scoped Prettier passed for those files and maintained documentation. The supplied sample and original phase plan were preserved.

All three changed Svelte files passed the official autofixer with no issues or suggestions. The provider review viewport was inspected: both source cards, candidates and shared review heading/map remain readable without overlap. Provider, domain and UI task reviews approved their implementation. The whole-change review conclusion is recorded after the remaining gate.

Baseline before the phase 7 domain/UI changes:

- Server Vitest: 44 files passed, 208 tests passed, two skipped.
- Svelte/type check: zero errors and zero warnings.
- Client Vitest (Chrome): 58 passed, 12 failed in two existing graphics-template test files, `Pregame.svelte.test.ts` (seven failures) and `Statistics.svelte.test.ts` (five). Assertions expect earlier graphics labels/colors/layout. Those graphics were unchanged by phase 7. The browser runner also emitted its existing transform-hook warning and development missing-image hook errors.

Keep pre-existing graphics assertions separate from phase 7 regressions; a failing full suite must not be reported as passing.

## Operations and acceptance boundaries

HenrikDev and ValoSpectra credentials are now managed from the server-side Settings screen and stored encrypted in SQLite by migration `0011_provider_settings`; do not post them into chat, put them in public variables, include them in fixtures, or expose them to OBS/client output. `SETTINGS_ENCRYPTION_KEY` (or the generated ignored `data/settings.key`) remains outside the database. Use only event participants whose data use is authorized under HenrikDev's current consent/use requirements. Discovery/detail are explicit actions, with no continuous HenrikDev polling or automatic provider fallback. Treat rate-limit errors as a reason to wait.

The adapters default to AP/PC, five candidates and a 15-second request timeout. Spectra defaults to three attempts with 15-second pending intervals. Provider settings are DB-backed server configuration; legacy Phase 7 environment variables are first-run bootstrap inputs only. An invalid provider configuration must not disable manual operation or the other provider.

When either source is unavailable, enter or correct statistics in the existing manual Post-Game Report editor. Blank means unknown and zero means measured zero. Canonical saved records continue to serve aggregation and graphics. Provider work never finalizes game scores/results, selects MVP, switches live provider/HUD mode or changes broadcast selection.

Migration `0010_post_game_import` adds source/report uniqueness and independent statistics/agent ownership. The disposable populated-upgrade test protects legacy agent corrections, including saved lineup players without statistics rows, without inventing timestamps. Existing duplicate source/report associations cause the unique index to reject the upgrade and require reviewed reconciliation. Back up the database/assets and rehearse the forward migration against a disposable copy before deployment; do not run `db:push` on event data. The persistent local/event database has not been migrated.

## 2026-10-06 follow-up — Settings consolidation

After the verification run above, Phase 7 provider configuration was consolidated with the existing Settings screen. Migration `0011_provider_settings` adds a singleton DB-backed provider settings record; ValoSpectra Org/access credentials and HenrikDev API credentials are AES-256-GCM encrypted at rest, with the encryption root kept outside SQLite. The existing plaintext `data/live-provider.json` is now a first-run migration input only and is removed after a successful DB bootstrap. HenrikDev affinity, platform, API host, candidate count and request timeout, plus Spectra hosted post-game host/poll settings, are editable from Settings. The old environment variables are bootstrap-only when no settings row exists.

This follow-up also preserves Phase 6's existing Save-and-connect flow while adding a save-only action; post-game-only changes do not restart an otherwise healthy live provider session. Focused settings persistence tests were added, and the Phase 7 migration-upgrade test now rewinds both `0010` and `0011` before replay.

The release-command results earlier in this document predate this follow-up. In the current ChatGPT execution environment, the GitHub connector can read/write the branch but the execution container cannot resolve `github.com`, so `pnpm check`, Vitest, build, lint and Playwright have **not** been independently rerun for the Settings-consolidation commits. Re-run those gates locally before treating this follow-up as release-verified.

## Addtional Review

- As noted before, the ValoSpectra group code usually does not need to change between games. Even with that, there are currently 2 settings that control the group code, and either one can be changed. This can cause confusion with Group Code settings.
- Self-hosted ValoSpectra servers are expected to host the endpoints as HTTPS, including the Socket.IO ports. It might be because of that, this client cannot connect directly to the official Spectra server. It's unclear though, there is no logging to indicate that.
- For now, there is no button to fetch the HenrikDev's API from the Post-Match GFX graphic control.

## 2026-10-07 local verification

Reviewed the Phase 7 plan and the current implementation at `7b18e6c`, including Settings consolidation and migration `0012_spectra_post_game_group`. The project is **not release-clean**: the provider browser journeys pass, but the full unit/browser suites and formatting gate fail. Earlier successful results do not supersede these fresh failures.

The controlled reruns used Node `24.19.0`, pnpm `11.22.0`, and installed Google Chrome. The unconfigured mise pnpm shim was bypassed for this session without changing global tool settings. The first `mise exec ... pnpm test` run actually launched the system Node `26.5.0`; subsequent commands explicitly prepended the installed Node 24 directory to PATH. All database verification used disposable fixtures. No persistent local/event database was migrated or imported into.

| Check                                                    | Fresh result                                                                                       |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `pnpm check` on Node 24                                  | Passed: zero errors and warnings.                                                                  |
| `pnpm build`                                             | Passed with adapter-node; browser setup also built successfully on Node 24.                        |
| `pnpm lint`                                              | Failed: Prettier reported 122 files. This script stops before ESLint.                              |
| `pnpm exec eslint .`                                     | Passed independently.                                                                              |
| Initial `pnpm test`                                      | Failed: 324 passed, 16 failed, two skipped; E2E was not reached.                                   |
| `pnpm exec vitest run --maxWorkers=2` on Node 24         | 326 passed, 14 failed, two skipped across 64 files.                                                |
| Focused post-game/settings server tests on Node 24       | 53 passed, two failed across four files.                                                           |
| Post-game import component tests                         | All six passed in the full Chrome unit run.                                                        |
| `pnpm exec playwright test` on Node 24                   | 16 passed, eight failed across 24 journeys; both Phase 7 journeys and Phase 6.1 banners passed.    |
| Isolated Phase 6 journey with current Settings selectors | A temporary copy changing only two labels passed in 47.9 seconds; the original test was preserved. |

### Reproduced failures

- `src/lib/server/post-game/review.test.ts:807`: the populated-upgrade test removes the last three migration journal entries, but leaves the already-created `provider_settings` table intact. Replaying `0011` then fails with `table provider_settings already exists`. This fixture does not recreate a genuine pre-0010 database.
- `src/lib/server/post-game/review.test.ts:858`: the discarded-agent regression imports non-null statistics and immediately calls discard without clearing them. The service correctly rejects that request under the all-null discard invariant, so the intended later agent-conflict assertion is never reached.
- The remaining 12 controlled unit failures are the previously documented seven `Pregame.svelte.test.ts` and five `Statistics.svelte.test.ts` assertions about graphic labels, colors, and layout. The cache-bound timeout and persistence subprocess failure from the initial unrestricted run did not recur in the controlled run.
- The full browser run fails the admin clock selector (`Server time` versus the rendered `Server Time`), the broadcast snapshot-version assertion (expected v2, received v3), and the controller's expected `attack` identity (received `neutral`). Five later journeys time out on the disabled Tournament selector while the shared app still has shown graphics from the failed controller journey. Those later timeouts must be separated from independent feature regressions.
- Running the original Phase 6 journey alone removes that shared-state obstruction, but exposes stale Settings selectors at `tests/phase6-live.e2e.ts:140` and `:143`: `Custom host` was renamed to `Custom live host`, and `Provider` to `Connect after saving`. A temporary copy updating only those two labels passed the complete journey, including safe failed/successful Settings submissions, secret redaction, one shared upstream connection, mapping, HUD previews, native fallback, retry and disconnect. The temporary test was removed; the original journey still fails independently until its selectors are updated.

### Additional proof

An independent populated-database check started with migrations 0000-0009, seeded a ten-player imported game with a later manual statistic correction, and applied the actual 0010-0012 migrations. It passed preservation of the correction and its timestamp, conservative agent ownership for all ten players, creation of missing provenance rows without invented timestamps, the separate post-game group-code column, duplicate report rejection, and `PRAGMA foreign_key_check`. This supports the forward migration itself; the committed failing upgrade test still needs repair.

Both supplied JSONC files were decoded offline through the current v4 normalizer, without querying a provider or importing their data:

| Sample | Normalized observations                                                                                                                                                                            |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Summit | Completed competitive match; provider-order score 9-13; ten K/D/A and agent rows; 22 rounds and 162 kill events; totals of 22 first bloods, 15 plants, and five defuses.                           |
| Lotus  | Completed competitive match; provider-order score 12-1; ten K/D/A and agent rows; 14 rounds and 98 kill events; all event-derived metrics remain null at the terminal-surrender coverage boundary. |

Performance Score and Trades remain null in both samples. These are real-payload decoding observations, not new live provider retrieval, custom-event acceptance, or real-roster import proof.

The provider review screenshot was inspected at 1440x1000: the recommended HenrikDev card, Spectra card, candidates, and shared review heading/map are readable without overlap. A scan of both generated client builds found no synthetic provider credentials. Fresh Phase 6.1 screenshots and full-suite failure traces were retained in temporary verification artifacts; the previously clean tracked screenshots were restored. Existing editor notes and supplied samples were preserved.

### Acceptance boundaries and editor observations

Custom/event HenrikDev discovery and successful real Spectra hosted retrieval, pending-to-ready behavior, and group reuse remain unverified release dependencies. No live provider request with real credentials was made in this run.

The two Spectra group settings implement the plan's optional post-game override: a blank override falls back to the live group. The current endpoint builder preserves HTTPS for the socket and extras ports; that alone does not diagnose official-service connectivity. HenrikDev controls are present on the saved game's Post-Game Report, while the Post-Game GFX control still exposes the manual editor only, as noted above.

Settings also retains misleading copy saying that saving always restarts/connects the selected source and that the selected connection is being checked. The runtime deliberately preserves a healthy live session for save-only post-game changes; the help/status text should distinguish the two submit buttons.

## 2026-10-07 fixes and final verification

The automated failures recorded above have been fixed. These fresh results supersede the earlier failing checks; real-provider acceptance remains separate and pending.

- Repaired the populated-upgrade fixture to drop `provider_settings` before replaying migrations 0010-0012. The test now also checks preserved statistics/timestamps, foreign keys, and the separate post-game group-code column. The discarded-agent regression clears statistics through the existing save service before discard, preserving the production all-null safeguard and revision checks.
- Updated graphics assertions and browser selectors to the current labels, snapshot version, side-color rails, statistics scopes, and geometry. Fixed actual text overflow in shared identities and agent labels, and retained the prepared graphics canvas after clearing selection so the empty Large Preview remains visible. Regression checks failed before these fixes and passed afterward; the empty-state unit check covers all six prepared graphics.
- Added shared browser setup/cleanup for selection, presentation, publications, statistics controls, and banners, so a failed journey cannot leave later journeys blocked by shown graphics. Set the default Vitest worker limit to two after reproducing native-worker overload with unrestricted execution.
- Corrected Settings help/status text to distinguish save-only from Save and connect. Added an LF checkout policy and formatted the repository, excluding raw provider JSONC captures to preserve the supplied evidence.

The final commands used Node `24.19.0`, pnpm `11.22.0`, installed Google Chrome, and the default two-worker unit configuration. Build/browser runs used `RAYON_NUM_THREADS=1`.

| Check                       | Final result                                                              |
| --------------------------- | ------------------------------------------------------------------------- |
| `pnpm check`                | Passed: zero errors and warnings.                                         |
| `pnpm lint`                 | Passed: repository Prettier and ESLint.                                   |
| `pnpm build`                | Passed with adapter-node.                                                 |
| `pnpm exec vitest run`      | Passed: 64 files, 341 tests; two existing helper tests skipped.           |
| `pnpm exec playwright test` | Passed: all 24 journeys in one full run, including both Phase 7 journeys. |

All four behaviorally changed Svelte files (`Identity.svelte`, `StatsPanel.svelte`, `Graphic.svelte`, and Settings) passed the official autofixer with no issues or suggestions. The unit runner still prints existing SvelteKit transform-hook and `wrapDynamicImport` diagnostics; it exits successfully with all tests passing.

The player-statistics head-to-head and empty-selection Large Preview screenshots were inspected for readable, contained output. The fresh client build contains none of the scanned synthetic credentials. Fresh screenshots, browser results, and verification logs are retained in the temporary `vlr-phase7-fixes-artifacts` directory. Existing editor notes, raw samples, and tracked screenshots were preserved. All database checks used disposable fixtures; the persistent local/event database was not migrated or imported into.

Custom/event HenrikDev discovery and real Spectra hosted retrieval, pending-to-ready behavior, and group reuse still require real-provider acceptance. This fixes pass made no provider request using real credentials. The optional Spectra post-game group override and the location of HenrikDev import controls on the saved game's Post-Game Report remain as documented above.
