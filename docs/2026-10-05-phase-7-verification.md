# Phase 7 verification — provider-neutral post-game import

## Provider contracts and real evidence

On 2026-10-05, the current HenrikDev documentation/OpenAPI confirmed `GET /valorant/v4/matches/{affinity}/{platform}/{name}/{tag}?size=N`, `GET /valorant/v4/match/{affinity}/{matchId}`, and the `Authorization` API-key header. The documentation changelog and OpenAPI version labels differ; this implementation relies on the verified v4 paths and response fields, not an assumed global version label.

With the user's server-configured key, the current adapter successfully fetched exact detail for the supplied match and then five recent candidates for its authorized Riot ID anchor. Discovery included the supplied match. The successful check used two requests, affinity `ap` and platform `pc`, at 2026-10-05 15:38 UTC. No key, raw payload, or participant identity was written into this record.

The supplied 533,865-byte JSONC response and live exact detail normalize as a completed competitive Lotus match with ten players, ten K/D/A sets and ten agent identities. The sample has team scores 12–1, 14 round records (13 Elimination and one terminal Surrendered), and 98 kill events. Its terminal surrender record has no plant/defuse or credited kills. The conservative scored-round completeness gate leaves all event-derived metrics null for this shape. It does not turn uncertain event coverage into zero. Performance Score and Trades remain null.

This is real competitive-match discovery/detail and payload evidence. It does not establish custom/event-queue discovery, event roster mapping, or end-to-end acceptance against the persistent event database. Verify an authorized completed custom/event game before declaring the tournament provider path broadcast-ready. The real check did not import into or migrate the local/event database.

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

Keep `HENRIKDEV_API_KEY` server-only in deployment environment or the local ignored `.env`; do not post it into chat, put it in form data, or include it in fixtures. Use only event participants whose data use is authorized under HenrikDev's current consent/use requirements. Discovery/detail are explicit actions, with no continuous HenrikDev polling or automatic provider fallback. Treat rate-limit errors as a reason to wait.

The adapters default to AP/PC, five candidates and a 15-second request timeout. Spectra defaults to three attempts with 15-second pending intervals. All provider settings remain private runtime configuration; an invalid provider configuration must not disable manual operation or the other provider.

When either source is unavailable, enter or correct statistics in the existing manual Post-Game Report editor. Blank means unknown and zero means measured zero. Canonical saved records continue to serve aggregation and graphics. Provider work never finalizes game scores/results, selects MVP, switches live provider/HUD mode or changes broadcast selection.

Migration `0010_post_game_import` adds source/report uniqueness and independent statistics/agent ownership. The disposable populated-upgrade test protects legacy agent corrections, including saved lineup players without statistics rows, without inventing timestamps. Existing duplicate source/report associations cause the unique index to reject the upgrade and require reviewed reconciliation. Back up the database/assets and rehearse the forward migration against a disposable copy before deployment; do not run `db:push` on event data. The persistent local/event database has not been migrated.
