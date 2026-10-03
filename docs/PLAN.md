# FPT Shop x Acer — App Build Plan

## Goal and status

Deliver the application described in [TECH-SPEC.md](./TECH-SPEC.md) for the November 2026 broadcast. Build the management foundation first, establish manual graphics operation, then connect providers and complete broadcast rehearsal.

**Implementation began on 2026-09-27.** Phases 1–4 are implemented; Phase 2 still needs a rehearsal from another LAN machine and a live server-side catalogue refresh in the target network. Phase 5/5.1 implementation, automated Node/browser verification, and real Valorant/OBS graphics acceptance are complete. Phase 6 live-provider/external-HUD work is now planned on `feat/phase-6-live-data`; Phases 7 onward remain open. The design team supplies final layouts/assets; developers first build functional test templates.

The specification owns product behavior. This file owns build order, concrete work packages, dependencies, and acceptance checks. Read the specification before starting a phase, and update these documents if an approved requirement changes.

## Starting point

| Existing item          | Current state / implication                                                                                                                                                                   |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework              | TypeScript, SvelteKit 3, Svelte 5, Skeleton UI, Tailwind, and the Node adapter are already configured. Use their current APIs rather than assuming a SvelteKit 2 layout/configuration.        |
| Database               | Drizzle with the libSQL client and SQLite dialect. The schema is split by domain under `src/lib/server/db/schema/`; reviewed forward migrations through `0006` recreate the current schema.   |
| Routes                 | `/admin` has Team, Player, and Game Resources CRUD screens. `/gfx` remains a transparent 1920×1080 canvas.                                                                                    |
| Production graphics    | Seven stable live routes render in the built Node app, with shared SSE and template fallback. Real Valorant/OBS composition testing passed for the Phase 5/5.1 test package; the native-HUD-safe In-Game treatment is retained as Phase 6 fallback. |
| Verification/reference | Vitest server/component projects, Playwright configuration, Prettier, and ESLint exist. The MLBB project under `examples/` is a reference, not part of the application to rewrite.            |

A concrete GStack `/livenow` payload/schema is now available, while successful Spectra hosted post-game reports are still unavailable. Provider fixtures can support implementation, but each live provider still needs its own recorded real event-session verification before broadcast-ready status. Preserve unrelated working-tree changes and example files throughout.

## Build sequence

```text
1. Persistent foundation
   → 2. Profiles and resources
   → 3. Tournament/match/game management  [first usable milestone]
   → 4. Manual statistics
   → 5. Shared broadcast controls and all test graphics
   → 6. Live providers and HUD failover
   → 7. Spectra post-game import
   → 8. Design-team asset integration
   → 9. Deployment, recovery, and broadcast rehearsal
```

Phase 8 can proceed once Phase 5's data/control contracts are stable and design assets arrive. Provider validation can happen as soon as a test match is available. Neither is a dependency of the first management milestone.

## Phase 1 - Establish a persistent application foundation

### Work

- [x] Inspect the current scaffold, scripts, environment configuration, and local database before changing anything. Record the baseline check/build results; distinguish existing issues from new work.
- [x] Add the initial reviewed Drizzle migrations and persistent local database setup. Keep schema ownership in `src/lib/server/db/schema/` and preserve the domain split.
- [x] Establish optimistic stale-write handling with integer revisions on editable aggregate roots. Collection edits must bump their owning aggregate revision in the same transaction.
- [x] Establish server validation/error conventions and transaction boundaries that later CRUD slices can reuse. Cross-record tournament/match/game relationships are validated during saves rather than encoded as a tournament rules engine.
- [x] Establish the Skeleton management shell and accessible form behavior needed by the first CRUD screens. Team, Player, and Game Resources forms use labelled native controls, visible errors, and stale-save feedback.

### Done when

- Database state survives restart and the initial schema can be recreated from reviewed migrations.
- A stale update using an old revision is rejected rather than silently overwriting newer data.
- A multi-row aggregate edit either commits completely or rolls back completely.

### Focused proof

Test migration recreation, optimistic concurrency, and one transactional aggregate update using a disposable database. Run `pnpm check` and the relevant tests.

Progress, 2026-09-27: the local `file:local.db` database was created through `pnpm db:migrate`. Focused tests recreate the schema, upgrade a populated database, reject stale writes, preserve references, and prove rollback of a failed map-pool replacement. Baseline `pnpm check` had zero diagnostics and the production build passed. The untracked MLBB example still emits missing-dependency messages during `pnpm check`; it is outside this app's build.

Authentication, sessions, and Administrator/Operator authorization are intentionally deferred from the current feature path. Revisit them before exposing the management application to an untrusted network; they are not part of the current domain-schema milestone.

## Phase 2 — Add reusable profiles, assets, and game resources

### Work

- [x] Add Team and Player records and CRUD screens. Start with the profile fields in the specification; keep tournament membership out of a player's single global team field.
- [x] Implement safe logo/portrait upload and storage, with normal/white/black team-logo variants and missing-asset placeholders.
- [x] Add the maps and agents needed by game preparation and the templates. Add equipment assets when the live HUD consumes them; do not build unused catalogue editors.
- [x] Choose and verify a suitable resource-catalogue import source. Support deliberate refreshes and local asset availability; keep referenced records stable across updates.
- [x] Protect referenced profiles/resources from destructive deletion while permitting ordinary editing and removal of unused records.

### Done when

- Operators can create and reopen reusable profiles and prepare resources without any provider connection.
- Uploads work across the intended LAN address, and invalid uploads or unsafe paths are rejected.
- Catalogue refreshes preserve referenced IDs/assets instead of silently changing event setup.

### Focused proof

Check upload validation, reference-preserving deletion, and resource-refresh behavior. Exercise one team/player/resource CRUD browser journey with realistic placeholder assets.

Progress, 2026-09-28: Team and Player forms save revisions and normal/white/black logos or portraits; assets are served from `ASSET_DIR` with generated paths. Map and Agent forms support local manual preparation. Operator-triggered VALORANT-API refresh imports tactical maps and playable agents, copies their required images locally, and updates provider UUID matches without changing application IDs, selected map-pool references, existing image paths, or operator availability choices. The public catalogue response was inspected live; the app's refresh path was proved with a fixture because this shell cannot resolve external DNS. A browser session against a disposable database saved and reopened one team with a served logo, one player, and one map. Focused tests cover invalid uploads/paths, referenced deletion, and repeat/invalid refresh. A separate-machine LAN check remains for deployment rehearsal.

## Phase 3 — Complete tournament, match, game, and lineup management

### Work

- [x] Add tournaments with unique URL-safe slugs, participating teams, plain tournament player lists, and editable tournament map pools. Do not add main/substitute roles.
- [x] Add matches with two distinct tournament entries, match text, and BO1/2/3/5 rules. A stored winner must be one of those two entries. Store/derive completion and result consistently, including a completed BO2 draw.
- [x] Add the match-wide ordered veto editor. Validate maps against the event pool and allow operator changes to the action sequence and acting team, including consecutive same-team picks and game-number assignments before games exist.
- [x] Add games individually with unique match-relative numbers, editable names, maps, starting sides, team-attached scores, and results. Once a match has games, veto actions, or a stored match result, changing its Team A/B entries is blocked until that dependent data is explicitly cleared/reset so existing scores and actions cannot change team identity. Prepare the reusable Info → Lineup → Map Veto workspace; its veto view edits the match record.
- [x] Add five ordered lineup slots per team per game. Validate membership, duplicate players, and cross-team conflicts; preserve historical lineups during roster edits. Surface stale saves and edits that would invalidate completed data.

### Done when — first management milestone

- An operator can prepare a tournament, rosters, maps, matches, and games; save; restart; and reopen the complete setup without graphics or telemetry.
- BO2 supports 2–0, 1–1, and 0–2. A winner-bracket team can pick two maps consecutively. A substitute can appear in a later game's lineup without changing the earlier lineup or introducing roster roles.
- Side swaps do not move scores between teams, and result corrections produce the correct series score.

### Focused proof

Use small, realistic fixtures: two tournaments with different map pools, teams with more than five available players, a BO2 draw, and a BO5 veto with consecutive picks. Test duplicate slots/players, wrong-tournament references, a winner outside the match participants, invalid maps, blocked participant changes after dependent data exists, concurrent game creation, stale updates, and save/reopen behavior. Use transactions and database constraints where they own the invariant.

Progress, 2026-09-30: Tournament, roster, pool, match, individual game, historical lineup, and shared veto management use the existing schema. Skeleton tabs retain drafts and support deep links, keyboard navigation, and history. Five isolated browser tests cover the acceptance workflow, losing drafts from two operators, sibling-section revisions, and malformed inputs. Separate database connections exercise related-record races; a writer process exits before a fresh reader validates saved setup and foreign keys. Normal score corrections, explicit reopen, exceptional outcomes, and explicit veto propagation are covered. Final verification details are recorded in the Phase 3 implementation plan. No event-data migration was required.

**Required follow-up before Phase 5 Map Veto output:** Team A / Team B are competition-order slots. Team A starts the standard map veto, while an upper-bracket team may take two opening grand-final bans as A or B. The editor offers editable presets and saves the operator's chosen actors. This correction is specified in [2026-10-01-team-a-b-veto-order-correction.md](./2026-10-01-team-a-b-veto-order-correction.md).

## Phase 4 — Make manual post-game statistics and all scopes usable

### Work

- [x] Add saved per-game player statistics and minimal provenance fields. Distinguish unknown values, explicit zero, future imported values, and operator edits.
- [x] Build the manual post-game editor, allowing incomplete saves, corrections, agent selection, and basic scoreboard entry without detailed kill/round events.
- [x] Define the initial manual metric set as Agent, K/D/A, Performance Score, Trades, First Bloods, Plants, and Defuses. Keep richer provider-derived fields deferred until a graphic or import requirement consumes them.
- [x] Implement game, series, and tournament views over the same saved records. Sum count metrics with field-specific coverage, exclude unfinished/exceptional games from broader totals, and keep Performance Score game-scoped until an authoritative aggregation rule exists.
- [x] Add operator MVP selection and its statistics scope. Do not implement automatic MVP scoring or recommendations.

### Done when

- Operators can prepare post-game, player-stat, and MVP data with no live provider or imported report.
- Correcting a game updates its series/tournament views without separate manual aggregate maintenance.
- Missing metrics and unsupported broader-scope metrics are visibly distinguished from exact zero and complete data.

### Focused proof

Test null-vs-zero handling, partial manual records, corrections, substitutions, unfinished/exceptional games, stale writers, and completed-game-only aggregation. Verify that Performance Score stays game-scoped and a manually selected MVP is not replaced by statistical corrections. Exercise a manual entry → save → match/tournament scope browser flow.

Progress, 2026-09-30: Phase 4 landed with canonical per-game player statistics, manual Post-Game entry, field-specific coverage, game/match/tournament derived views, operator-selected MVPs, provenance seams for future imports, and focused server/Playwright coverage. Performance Score is intentionally stored as its own game-level field rather than treated as ACS.

## Phase 5 — Build shared broadcast controls and seven test graphics

### Work

- [x] Complete the management/domain Team A / Team B veto-order correction before building the Map Veto output: Team A starts the standard map veto preset, grand-final upper-bracket bans may start from A or B, and saved veto order remains editable. Broadcast left/right isolation is verified with its Phase 5 control. See [the corrective note](./2026-10-01-team-a-b-veto-order-correction.md).
- [x] Add the single persistent live-game selection with a revision/version check. Build the shared Tournament → Match → Game selector; partial dropdown changes retain the prior on-air game, while a complete valid selection updates the broadcast.
- [x] Add a server-owned broadcast snapshot/update path, initially using the specification's SSE default with ordinary revision-checked control actions (authentication explicitly deferred to trusted LAN). Reconnecting clients obtain the latest snapshot. Expose only explicit broadcast fields.
- [x] Add stable OBS live routes and slug-based template selection with a generic test-template fallback. Correct the scaffold's production graphics page options and verify rendering in a built app.
- [x] Build control/output pairs for Player Lineup, Player Stats, Map Veto, Agent Select, In-Game, Post-Game, and MVP. Reuse saved lineup/veto/statistics editors and records instead of duplicating graphics-only copies. Player Stats supports both a single Player-to-Watch mode and a head-to-head comparison from one shared control/read model. Agent preparation and the native-HUD fallback must work manually.
  - This allows the Graphics Controller to double as the specific Lineup/Map Veto/Agent Select/Ingame/Post-Game/MVP Control (where possible) just like in the tournaments/matches/games page, making the workflow even faster.
- [x] Add clear controller readiness/connection states, appropriate visibility controls, and graceful output for missing preparation. Use a 1920×1080 transparent canvas. Default broadcast presentation is Team A left / Team B right with an explicit presentation-only left/right swap; Attacker is always blue and Defender is always red, independent of screen position. Prioritize a native-HUD-safe In-Game test graphic before the provider-backed custom HUD. Real OBS/Valorant composition testing for this Phase 5/5.1 package has now passed.

### Done when

- Changing the shared selector updates open controller pages and OBS outputs without replacing browser-source URLs. Ordinary management browsing does not switch the live game.
- All seven test templates render with saved/manual data. Data/control behavior is independent of the final supplied layout.
- Two operators and multiple browser outputs reconnect correctly; read-only outputs expose no credentials or mutation controls. Authentication is deferred: management writes remain reachable to anyone on the trusted LAN.

### Focused proof

Run a browser scenario with two controller sessions and at least one output: select, edit, reconnect, recover from a stale selection write, swap presentation left/right without mutating Match A/B, and change attacker/defender colors without moving team positions. Verify the standard Team A preset, a Team B upper-bracket double-ban, manually edited saved veto order, a production build, an unknown custom slug falling back to a test template, incomplete lineups, and outputs without operator cookies. Record an actual OBS visual check separately from browser-test results.

Progress, 2026-10-01: Tasks 0-8 are implemented and reviewed. Task 9 proves production adapter-node rendering, shared selection, stale multi-controller writes, all seven visibility/update/refresh/no-selection states, template fallback and saved identity/statistics isolation. See [verification evidence and screenshots](./2026-10-01-phase-5-verification.md). The Node-runtime proof found and corrected an adapter static-path packaging bug and build-origin configuration. Forward migrations 0004/0005/0006 are required for existing installations; no event/local database was migrated.

- [x] Complete actual Valorant/OBS graphics rehearsal. The Phase 5/5.1 test package is accepted as the stable manual/native fallback baseline for Phase 6.

## Phase 6 — Integrate live providers and the external-data HUD

Detailed implementation plan: [2026-10-03-phase-6-live-providers-external-hud.md](./2026-10-03-phase-6-live-providers-external-hud.md).

### Work

- [ ] Define one provider-neutral `LiveGameState` and strict runtime decoder. Keep volatile telemetry separate from the held Phase 5 BroadcastSnapshot/publication lane.
- [ ] Implement one server-owned provider coordinator with source generation invalidation, explicit local game/team/player mapping, and a separate read-only live SSE stream.
- [ ] Implement ValoSpectra through Socket.IO `logon` / `match_data`; verify supporter state server-side with `GET /getOrgForKey?key=<ACCESS_KEY>` on the extras service. Do not rely on incidental license fields in `match_data`.
- [ ] Implement GStack from the supplied `/livenow` contract, normalizing blank/string values and preserving raw unknown encodings. Verify one live transport for the event build; use `/controlpanel` only for mapping/diagnostics and `/mapbans` only for diagnostics.
- [ ] Treat Player/Expansion Client fields as per-player capabilities. Missing HP/abilities/XHP/XShield is normal partial telemetry, not a provider-health failure.
- [ ] Implement the reviewed server-owned retry/failover state machine: 1/2/4/8 second waits, fallback after four failed attempts, bounded recovery, and manual-only restoration to the external HUD.
- [ ] Add **View Data** diagnostics showing redacted raw provider data, normalized `LiveGameState`, mappings/capabilities, connection state, and parse/transport errors.
- [ ] Build the provider-backed In-Game HUD using Spectra-Frontend-VAL26 as the presentation/layout reference while keeping Svelte components coupled only to our normalized model. Retain the accepted native-HUD-safe Phase 5 graphic as fallback.
- [ ] Feed live provider agent observations into Agent Select without silently saving them; existing manual Agent Select remains the canonical fallback/editor.
- [ ] Centralize provider attribution/watermark handling and keep all credentials out of browser/OBS payloads.

### Done when

- Spectra and GStack produce the same normalized live contract and no HUD component needs provider-specific schema knowledge.
- One active provider session serves all controller, Preview, Large Preview, and OBS clients.
- Blank/missing enhanced telemetry never becomes fake zero, and absent auxiliary clients never falsely mark the provider dead.
- Explicit provider-to-local mappings preserve Match A/B, broadcast left/right, and attacker/defender as separate identity axes.
- Fixture-driven tests prove live -> 1/2/4/8 retries -> fallback -> recovered/ready-but-still-native -> operator re-enables live.
- View Data makes the latest raw-versus-normalized state inspectable without leaking access keys or other secrets.
- The external HUD degrades safely when HP/abilities/enhanced shield/health are unavailable.
- Each provider has a separately recorded real-session verification result before being declared broadcast-ready.

### Focused proof

Use controlled provider fixtures, fake timers, multiple browser subscribers, malformed/stale-generation payloads, partial auxiliary-client availability, and real Spectra/GStack sessions. Record the actual provider payload/capability observations used to justify normalization and rendering decisions.

## Phase 7 — Add Spectra post-game import with manual protection

### Work

- [ ] Read the current supported stats-service contract and configure the separate Spectra post-game source. Do not assume a self-hosted live server supplies the hosted statistics backend.
- [ ] Fetch a report by group code with bounded pending/error behavior. Keep this polling separate from the live-HUD retry state machine.
- [ ] Validate the returned match identity, participants, teams, and statistic formats against the intended local game. When identity cannot be confirmed automatically, provide an explicit operator mapping/review step.
- [ ] Import into the same records used by manual entry. Make repeat imports idempotent and surface conflicts with manual corrections before any explicit replacement. Do not switch the live game, enable the live HUD, or auto-select an MVP on import.
- [ ] Resolve the Phase 4 provenance edge cases before enabling reimport: an imported row manually cleared to all-null needs an explicit resolution path before lineup identity changes, and agent-only manual corrections need player-level conflict provenance.
- [ ] Validate one real completed-game report for the intended Spectra setup when available. Preserve the full manual workflow if the service is unavailable, inaccessible, late, or incomplete.

### Done when

- A fixture report and a manual scoreboard feed the same game/series/tournament views and graphics.
- A reused group code, duplicate import, late response, or operator correction cannot corrupt another game's records or silently replace edited data.
- Real endpoint availability is either verified with evidence or clearly listed as an unresolved release dependency; the import feature is not falsely declared proven from types alone.

### Focused proof

Test identity mismatch, duplicate requests, pending reports, partial payloads, transaction failure, manual-edit conflict, and a late response after broadcast selection changes. Verify that advanced metrics are unavailable when their required event data is missing.

## Phase 8 — Integrate design-team layouts and assets

### Work

- [ ] Receive the layouts, asset variants, dimensions, safe areas, fonts, and any animation requirements for each of the seven graphics.
- [ ] Implement the tournament-specific visual templates using the existing data/control contracts and slug resolution. Keep generic test templates available for development and tournaments without a supplied custom layout.
- [ ] Connect the live and native-HUD fallback designs to the same mode control. Confirm the fallback's placement against the real spectator feed rather than only a blank browser canvas.
- [ ] Check long names, missing portraits/logos, both team sides, varied maps, incomplete statistics, and all supported statistic scopes.
- [ ] Obtain visual acceptance from the design/broadcast team through the user's normal review process. Do not assume approval or send external messages automatically.

### Done when

- Supplied designs render correctly in OBS at the intended output size without changing management or provider ownership.
- Operators can run every graphic and both HUD modes from the same controls used for the test templates.

### Focused proof

Use deterministic saved data for browser screenshots and compare against supplied layouts. Run an actual OBS check for alpha, scaling, clipping, animation, and native-HUD compatibility. Final artwork delivery is an external dependency; test-template completion is not final visual acceptance.

## Phase 9 — Prepare deployment, recovery, and the November rehearsal

### Work

- [ ] Package the production Node application with persistent database and asset locations, documented environment variables, and a reachable LAN bind/origin. Ensure browser URLs use the server's LAN address when OBS runs on another PC.
- [ ] Document installation/startup, initial administrator setup, user recovery, database migrations, backup/restore, and restart behavior. Add HTTPS and deployment-specific protections before any online exposure.
- [ ] Verify migration and rollback/restore procedures against disposable copies before touching event data. Back up both the database and assets together; do not rely on a development schema-push command for event upgrades.
- [ ] Rehearse a complete event flow: preparation, veto, individual game creation, lineup changes, all graphics, scores/results, manual statistics, any available imports, BO2 draw, and operator-selected MVP.
- [ ] Rehearse provider loss/recovery, app/client restart, stale operator saves, missing assets, unavailable statistics service, and an entirely manual/native-HUD broadcast. Record remaining limitations and operational workarounds before release.

### Done when

- A fresh production install and a restored backup both reproduce the prepared event and assets.
- The production build passes the applicable automated checks and actual LAN/OBS rehearsal. Every claimed provider has real-session evidence.
- The operator runbook is usable, final visual assets are accepted or explicitly scheduled, and the exact November event date is reflected in the release checklist.

## Verification commands and boundaries

Use the existing tooling and the smallest checks that prove the changed slice. Do not rerun every suite after every documentation or cosmetic edit.

| Check                           | Existing command                                                                              |
| ------------------------------- | --------------------------------------------------------------------------------------------- |
| Type/Svelte checks              | `pnpm check`                                                                                  |
| Focused server logic            | `pnpm exec vitest run --project server <test-file>`                                           |
| Focused components / end-to-end | `pnpm exec vitest run --project client <test-file>` / `pnpm exec playwright test <test-file>` |
| Formatting / lint               | `pnpm exec prettier --check <changed-files>` / `pnpm lint`                                    |
| Production output               | `pnpm build`, followed by preview/Node-runtime and OBS verification as appropriate            |

Playwright's current configuration builds and starts the adapter-node entrypoint and discovers `*.e2e.ts`/`*.e2e.js` files. Install browser dependencies when required by the test environment; do not treat their absence as a product failure. Current package scripts also expose `pnpm test:unit`, `pnpm test:e2e`, and the Drizzle migration commands.

When implementing Svelte components, follow `AGENTS.md`: consult the relevant Svelte documentation and use the Svelte autofixer before handing off component changes. These two planning files contain no Svelte implementation.

## Release evidence checklist

- [ ] Management and permissions: save/reopen, correct relationships, protected writes, and session revocation.
- [ ] Competition and statistics: all BO formats, veto overrides, per-game lineups, identity-safe scores, manual corrections, and all three statistic scopes.
- [ ] Broadcast: seven graphics, stable URLs, shared selection, correct custom/test templates, production rendering, and multiple clients/operators.
- [ ] Providers and fallback: separately labelled fixture and real-session results, four retries, manual-only restoration, and complete native-HUD/manual operation.
- [ ] Operations and visuals: persistent assets, migration/restore proof, LAN/OBS rehearsal, design acceptance, and a usable operator runbook.

## Deferred work

Our own OCR client, direct Riot API/RSO integration, automated brackets, multiple independent broadcast channels, and a generic plugin architecture are not hidden prerequisites for this plan. Revisit only through a concrete new requirement. Player-branding history snapshots and additional advanced metrics likewise need a demonstrated use before expanding the model.

## Next execution step

Next, complete the pending **Phase 5 OBS/Valorant rehearsal** in [the verification report](./2026-10-01-phase-5-verification.md), then begin provider-backed Phase 6. Preserve the now-tested competition/presentation/side separation and the shared typed broadcast contract. Real provider captures remain necessary to establish provider compatibility.
