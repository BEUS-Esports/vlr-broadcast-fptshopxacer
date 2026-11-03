# First RHS Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve first-show reliability and operator control before the first RHS, with independently tested releases continuing during the tournament.

**Architecture:** Keep the existing single Node process, saved Preview / captured Program model, seven graphic IDs, and per-graphic output URLs. Add browser asset preparation and an optional composite output around the existing renderer. Group the lineup and statistics changes into one compatible snapshot/schema release.

**Tech Stack:** TypeScript, SvelteKit 3.1, Svelte 5, Skeleton UI, Drizzle/libSQL, pnpm, Vitest, Playwright.

**Spec:** [POSSIBLE_IMPROVEMENTS.md](../../../POSSIBLE_IMPROVEMENTS.md), supported by [TECH-SPEC.md](../../TECH-SPEC.md) and [PLAN.md](../../PLAN.md).

**Status:** A1–A4 are implemented with validation limits recorded in [RHS-RUNBOOK.md](../../RHS-RUNBOOK.md). B1 has a shared output owner, a rehearsal link and production-build browser coverage; visual acceptance and vMix measurements remain pending. C implementation and D1/D2 are pending. D3 is deferred by the user's trusted-LAN decision. User confirmed the first RHS is **next week**, with development continuing during the tournament. No blanket feature freeze. Exact RHS day, available working hours, and final artwork are not yet specified. Checkboxes below still track full task acceptance, including unperformed physical checks.

## Start here

**First implementation task: A1, preload images and retry failed images.** A4 must finish before any schema release. Reserve a three-hour production rehearsal block before choosing optional work.

Estimates are focused engineering hours including relevant automated checks, excluding artwork production and waiting for other people. They are planning ranges, not measured throughput or delivery promises.

| Batch | Scope                                                                             | Estimate                   | Placement                                                  |
| ----- | --------------------------------------------------------------------------------- | -------------------------- | ---------------------------------------------------------- |
| A     | Image preload/retry, readable logs, sidebar icons, runtime alignment and recovery | 11–17 hours                | First RHS priority                                         |
| B     | Measured composite output for vMix                                                | 8–12 hours                 | Next RHS candidate; retain individual sources              |
| C     | Lineup team choice and independent statistics pickers                             | 10–16 hours                | Next candidate; may continue into tournament               |
| D     | Output presence, wording, conditional shared-password gate                        | 6–10 hours; gate adds 4–6  | Follow core work; gate moves earlier if access requires it |
| E     | Docker, full accounts, combined PVW/PGM workspace                                 | 8–12 / 24–40 / 32–48 hours | Separate later projects; PVW/PGM after event               |

Suggested first RHS scope is **A + B + three-hour rehearsal: 22–32 hours**. A alone plus rehearsal is **14–20 hours**. Add C only if the remaining time and design inputs support another 10–16 hours. When time is short, move unaccepted work to the next release; retain the working individual-output setup.

## Global constraints

- Preserve Show/Hide, Preview/Program, optimistic locking, retained drafts, source attribution, and native-HUD fallback. Saved content changes reach Program through Hide → Show; explicitly live controls remain live.
- Keep all seven individual URLs public and read-only. Run one application process. Keep `/gfx` SSR as configured; item 3 is intentionally skipped.
- Preserve structured `logEvent` arguments, JSONL records, redaction, and stdout/stderr routing. Console presentation is the only logging change.
- Use forward migrations and disposable test databases. Back up and rehearse restoration before event upgrades; never use `db:push` on event data. Confirm before replacing production data.
- Ship accepted slices between sessions with a known working build and recovery instructions. Continue development during the tournament; schema changes need more recovery preparation than frontend changes.

## Review focus

- **Cold output / failed image:** hidden graphics preload saved assets; bounded retries recover without reload or endless requests. Covered by A1.
- **Old held Program:** valid v2/v3 captures upgrade without replacing their content with latest saved data. Invalid captures remain rejected. Covered by C1.
- **Concurrent operators:** live lineup changes cannot publish unsaved preparation; stale content saves keep drafts. Covered by C2/C3.
- **Shared output disconnect:** composite teardown cleans both streams; provider loss preserves native fallback; admin Preview does not count as output presence. Covered by B1/D1.
- **Recovery during a tournament:** restored DB, assets, and separately held encryption key reproduce saved output; an old binary must not silently discard a newer capture format. Covered by A4/C1 and release acceptance.

## Findings that change the original order

| Finding in the current code                                                                                                                                        | Planning consequence                                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LiveGraphic.svelte` creates both a broadcast client and a live client. `liveResources` already shares polling within one browser document.                        | Composite target is **two SSE connections total**, plus one resource poller. Seven mounted `LiveGraphic` instances would still create fourteen SSE connections. Transport merging is unnecessary for this batch. |
| `Graphic.svelte` puts six graphics into the same large screen region.                                                                                              | A composite needs explicit stacking and a composition test; fewer connections alone do not prove less vMix lag.                                                                                                  |
| Snapshot validation requires exact object shapes; only persisted v2 captures currently upgrade to v3.                                                              | Items 9 and 10 share one v4 compatibility change, including both persisted controls and held captures.                                                                                                           |
| `statisticFields` currently lives in the server database schema.                                                                                                   | Move its constant/type into a browser-safe shared module; do not import the runtime schema into the picker.                                                                                                      |
| Active tools are Node `26.13.0` / pnpm `12.16.1`, matching `mise.toml`; README says Node 24 and mentions a patch absent from current lock/workspace configuration. | Align documentation and package metadata with a verified runtime; check a clean install before removing the old patch note.                                                                                      |

## A — First RHS essentials

### A1. Prepare images before Show; recover failed images — 4–6 hours

**Backlog:** 4. **Dependencies:** none.

**Files:** Create `src/lib/broadcast/preload.ts`, `preload.test.ts`, and `primitives/Asset.svelte.test.ts`; modify `LiveGraphic.svelte` and `primitives/Asset.svelte`. Add `tests/gfx-preload.e2e.ts`.

**Interfaces:** `collectGraphicAssetUrls(snapshot: BroadcastSnapshot, graphic: GraphicId, resources: LiveResources | null): string[]`; `createAssetPreloader(): { update(urls: readonly string[]): void; destroy(): void }`.

- [ ] Add tests for hidden saved content, deduplication, scope-selected player portraits, held-versus-latest images, changed URLs, retry exhaustion, and destruction during a pending retry.
- [ ] Collect relevant logos/variants, portraits, maps, saved agent art, and locally known ability/weapon icons. Read abilities from `LiveResources`, since the prepared agent payload lacks them. Include held Program assets on reconnect. Do not depend on future telemetry or unsaved editor drafts.
- [ ] Preload on mount and saved-data/resource changes with at most four concurrent image loads. Retain a bounded working set for current saved/held content. Decode when supported; image failure never blocks Show. Add retries after 1, 5, and 15 seconds; cancel timers on URL change/unmount and retain the existing placeholder behavior.
- [ ] Run focused unit/client tests and the new browser journey. With an output opened while hidden and asset loading settled, first Show must use prepared images. A simulated transient image failure must recover without reload; permanent failure must stop retrying. Confirm saved Preview may update while Program keeps its capture.

**Visible result:** normal first Show no longer starts loading already-known artwork. Immediate Show before preparation finishes and genuinely new telemetry assets remain best-effort cases.

### A2. Plain-text console logs — 1–2 hours

**Backlog:** 1. **Files:** `src/lib/server/logging.ts`, `logging.test.ts`, README logging section.

- [ ] Extend existing console/JSONL tests to require a single textual console message, level routing, redacted nested errors, and escaped embedded newlines.
- [ ] Format the already-redacted record at the console output boundary as timestamp, level, logger name, event, and `key=value` details. Quote values containing spaces; retain structured records and the `logEvent` API.
- [ ] Run `pnpm exec vitest run --project server src/lib/server/logging.test.ts`. Confirm JSONL still exposes fields such as `event`, `requestId`, and error codes independently.

**Visible result:** a line such as `15:56:36.000 WARN [VLR] live.failure code=ETIMEDOUT`, without an object dump.

### A3. Distinct sidebar graphic icons — 0.5 hour

**Backlog:** 6b. **File:** `src/routes/admin/+layout.svelte`.

- [ ] Add an exhaustive `Record<GraphicId, ...>` icon map using existing Lucide imports: lineup/users, stats/chart, veto/map, agents/crosshair, in-game/monitor, post-game/clipboard, MVP/award.
- [ ] Run `pnpm check` and inspect the seven links in the sidebar. Preserve labels, hrefs, active state, and keyboard access; no new test suite is needed for this cosmetic change.

**Visible result:** operators can distinguish the graphic links by shape as well as text.

### A4. Repeatable runtime and recoverable event data — 5.5–8.5 hours

**Backlog:** 8 and the runtime part of 7. **Dependencies:** finish before C1 or any authentication migration.

**Files:** `README.md`, `mise.toml`, `package.json`; create `scripts/backup.mjs`, `scripts/backup.test.mjs`, and `docs/RHS-RUNBOOK.md`.

- [ ] Verify a clean frozen-lockfile install and production build in a disposable checkout using the current Node `26.13.0` / pnpm `12.16.1`. Align README, `engines`, and `packageManager` with that verified pair. Retain the lockfile unless evidence requires a change. Investigate the obsolete adapter patch note from actual clean-install results.
- [ ] Add `pnpm backup -- --output <new-directory> --app-stopped`. Require a stopped app and a new destination; take a consistent SQLite copy including committed WAL data, copy the complete asset store, and record schema/runtime/build identity. Do not print secrets or silently package the encryption key with the main backup.
- [ ] Document separate protection of the active encryption root, whether supplied by `SETTINGS_ENCRYPTION_KEY`, its configured file, or the default file. Add backup tests for paths containing spaces, WAL data, missing assets/key instructions, existing destinations, and copy failure without a false success result.
- [ ] Restore into a fresh disposable directory with the matching build and key. Verify saved event records, served artwork, held graphics, and decryption through the app. Record the stop/start commands and elapsed recovery time in the runbook.

**Visible result:** one documented backup command and a demonstrated restore, with matching tool versions. The automation does not stop the live app or overwrite event data on its own.

## B — One vMix output

### B1. Composite route with shared connections — 8–12 hours

**Backlog:** 5a. **Dependencies:** A1; its transport/composition work can ship independently of C.

**Files:** Create `src/routes/gfx/live/composite/+page.svelte`, `src/lib/broadcast/LiveOutput.svelte`, and `tests/gfx-composite.e2e.ts`; modify `LiveGraphic.svelte`, the output link UI, and README. Reuse `GraphicRenderer.svelte`, both client factories, and `liveResources`.

**Interface:** `LiveOutput` accepts `{ graphics: readonly GraphicId[] }` and owns one broadcast client, one live client, and asset preparation for their combined URLs. `LiveGraphic` becomes its single-ID wrapper. The static composite route is separate from `[graphic]`; it does not become an eighth graphic ID.

- [ ] Record a repeatable baseline on the production build: seven output documents, the same saved scene/provider fixture, active SSE/poll counts, and vMix frame/render performance. Use the same PC, resolution, frame rate, scene, and run duration for comparison. Budget 30 minutes each for before/after recordings within this task.
- [ ] Add shared-lifecycle and route tests; implement the output owner and seven positioned render layers. Suggested bottom-to-top order: in-game, map-veto, player-lineup, agent-select, post-game, player-stats, MVP. Keep each existing visibility/capture rule and fixed 1920×1080 transparent canvas.
- [ ] Verify exactly one connection to each existing SSE endpoint and one resource polling loop per composite document, including teardown/reconnect. Test all graphics individually, intended simultaneous combinations, hidden output, restart, native/external HUD switching, attribution, and fallback to individual URLs.
- [ ] Repeat the vMix measurement and inspect actual overlap/alpha. Document the accepted layer order and combinations in the runbook. Promote the composite only if composition is acceptable and measured output performance does not regress; record any claimed improvement numerically.

**Boundary:** several current full-screen graphics shown together will overlap. This batch does not automatically Hide other graphics or change their publication semantics. Final artwork may require a revised layer order. A crash of this one browser source affects every layer, so retain the individual sources as a rehearsed fallback.

## C — Lineup and statistics controls

### C1. Shared v4 contract and forward migration — 3–5 hours

**Backlog:** shared prerequisite for 9/10. **Dependencies:** A4. Release C1–C3 together to avoid repeated format changes.

**Files:** `src/lib/broadcast/controls.ts`, `types.ts`, `src/lib/server/db/schema/broadcast.ts`, `statistics.ts`, `src/lib/server/broadcast/snapshot.ts`, `src/lib/server/services/broadcast.ts`; create `src/lib/statistics/fields.ts` and the next Drizzle migration plus generated metadata. Update existing fixtures and `in-game-contract.test.ts` / `publication.test.ts`.

**Interfaces:** `LineupTeams = 'both' | 'team-a' | 'team-b'`; `liveControls.lineupTeams`; `playerStats.fields: StatisticField[]`; `controls.mvpFields: StatisticField[]`. Move/re-export the existing eight-field constant and `StatisticField` type from the shared module.

- [ ] Add populated-upgrade tests covering valid v2/v3 captures, malformed captures, legacy `player_stats` JSON, unchanged held content, and a new empty database.
- [ ] Add `lineup_teams` with default `both` and `mvp_fields` with all eight defaults. Extend existing player-stats JSON without adding another SQL column. Explicitly normalize/backfill old JSON rows; changing a TypeScript default alone does not update existing records.
- [ ] Introduce prepared snapshot v4. Upgrade only valid persisted v2/v3 publications using default team/field choices, retaining their saved data. Keep the stream envelope at v1. Validate v4 network snapshots strictly; refresh old browser documents when deploying this release. Preserve original control/data revisions during compatibility conversion.
- [ ] Run focused schema, broadcast-service, publication, and contract tests against disposable databases. Rehearse rollback with the matching pre-upgrade database backup; an old decoder cannot safely consume v4 captures. Preserve any later event edits before contemplating a restore.

### C2. Both / Team A / Team B live lineup selection — 3–5 hours

**Backlog:** 9. **Dependencies:** C1.

**Files:** `src/lib/server/services/broadcast.ts`, `graphics-control.ts`, `src/lib/components/admin/graphics/GraphicsGlobalSetup.svelte`, `src/lib/broadcast/selectors.ts`, `templates/test/PlayerLineup.svelte`; add focused coverage in `broadcast.test.ts`, `selectors.test.ts`, `templates/test/Pregame.svelte.test.ts`, and `tests/gfx-controls.e2e.ts`.

- [ ] Test live team filtering while shown, Swap independence, stale writes, restart, and changing the selected game.
- [ ] Wire `BroadcastUpdate.lineupTeams?: LineupTeams` through the existing revision-checked action. Keep it in live controls, default/reset it to `both` on game change, and filter by captured competition A/B identity rather than screen position. Hide remains available regardless of incomplete preparation.
- [ ] Add a compact live selector next to Swap in `GraphicsGlobalSetup`, displayed on the lineup page, with `Both` and the actual two team names. Preserve the original slot for a lone team in the test template; final centering/animation is a design-team decision before final-art acceptance.
- [ ] Run focused tests and the browser journey: Show both, choose A, Swap, choose B, Hide, change game. Program must change immediately for the selector while newly saved names/portraits remain held until Hide → Show.

### C3. Separate Player Stats / MVP field pickers — 4–6 hours

**Backlog:** 10. **Dependencies:** C1; bundled with C2 for release.

**Files:** `src/lib/server/services/broadcast.ts`, `graphics-control.ts`, `src/lib/components/admin/graphics/GraphicControls.svelte`, `src/lib/broadcast/templates.ts`, `templates/test/PlayerStats.svelte`, `MVP.svelte`, `StatsPanel.svelte`, `StatsFields.svelte`; create `src/lib/broadcast/template-capabilities.ts`. Extend publication/statistics tests and `tests/gfx-controls.e2e.ts`.

**Interfaces:** template capabilities declare supported `StatisticField[]` and minimum/maximum slot counts per stats graphic; test template supports all eight, minimum one, maximum eight. `StatsPanel` / `StatsFields` consume the selected list. Persist selections in canonical field order; drag-to-reorder is outside this request.

- [ ] Test independent Player Stats/MVP settings, empty/duplicate/unknown fields, server-side capability limits, and legacy defaults. Capability metadata must be shared browser/server data without importing Svelte templates into server validation.
- [ ] Add the two pickers to the existing retained-draft forms, and pass the selected fields through both single/head-to-head panels and MVP. Update the saved-versus-published notice to compare `mvpFields` as well as scope. Saving changes Preview; Show captures the list; repeated Show preserves it.
- [ ] Annotate fields with scope/player coverage, including unavailable Performance Score outside game scope and absent Trades. In head-to-head, show which player lacks data. Preserve zero values and partial coverage; never invent data or silently remove a chosen field. Default stays all eight.
- [ ] Run validation, capture, component, and browser tests. Verify one-field and eight-field layouts, scope changes, different MVP settings, dirty drafts across SSE updates, and Hide → Show. Register final-template slot limits before enabling that template's picker.

## D — Continue in small tournament releases

### D1. Output connection status — 4–6 hours

**Backlog:** 6a. **Dependency:** B1, so the UI can distinguish a composite from individual outputs.

**Files:** `src/lib/broadcast/client.ts`, `LiveOutput.svelte`, `src/routes/api/broadcast/events/+server.ts`, `src/lib/server/broadcast/publisher.ts`, admin graphics status UI; create `src/lib/server/broadcast/presence.ts` and focused tests.

- [ ] Identify output subscriptions as `composite` or a validated graphic ID on the existing broadcast stream; admin subscriptions omit output identity. Count separate active connections and clean up on cancel, abort, failed send, or backpressure closure.
- [ ] Emit a separate typed `presence` event with full counts on subscribe/change, including a server epoch. Keep it outside snapshots, publication revisions, and editor refresh triggers. Cap presence data to known output IDs; report unknown status if the admin stream disconnects.
- [ ] Test two same-ID outputs, disconnecting one, reconnect races, server restart, and admin Preview exclusion. Composite gets one dot; individual fallback outputs get their own status when connected.
- [ ] Label the status **Connected / Offline / Unknown** and explain that it does not prove vMix/OBS is showing the source. Source shutdown when hidden may legitimately show Offline.

### D2. Operator wording — 2–4 hours for the first pass

**Backlog:** 6c. **Files:** touched admin graphics/live components, associated text-based browser tests.

- [ ] Replace operator-facing `capture` with `shown version`, `revision` notices with `saved changes` / `changed by another operator`, `mapping` with `match players to teams`, `provider` with `data source`, and displayed scope values with `Current map / Series / Tournament` where accurate.
- [ ] Keep technical details in diagnostics and keep Take, Show/Hide, Preview/Program. Update affected tests alongside copy; run those journeys. Continue wording cleanup only when the relevant screen is being changed.

### D3. Shared operator-password gate, if needed — 4–6 hours

**Backlog:** 2 stopgap. **Trigger:** management access extends beyond the trusted operator LAN, or the rehearsal requires a gate. Promote ahead of B/C in that case. This is an alternative to shipping full accounts immediately.

**Files:** `src/hooks.server.ts`, `src/lib/server/auth.ts`, login/logout routes, `.env.example`, test setup/fixtures, runbook; add auth service and production-route tests.

- [ ] Define the local secret provisioning/recovery process and implement a server-side session gate for `/admin` and descendants, including form actions, `/admin/live`, and resource sync. Keep login/bootstrap exceptions exact; do not authorize every `/admin*` prefix or merely hide navigation.
- [ ] Use a server-verified session, HttpOnly/SameSite cookie, HTTPS-aware Secure setting, logout/expiry, bounded login attempts, same-origin protection, and generic failure messages. Never put the operator password in output URLs or client code.
- [ ] Verify rejected unauthenticated writes, successful LAN HTTP login, HTTPS cookie behavior, logout, and public read-only outputs/assets/API. Provide an isolated test login to all existing E2E journeys and repeat the relevant suite.

## E — Later projects with their own detailed plans

| Backlog | Work and dependency                                                                                                                                                                                                            | Acceptance                                                                                                                                                             | Estimate    |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| 7       | Docker after A4: `Dockerfile`, `.dockerignore`, Compose, deployment documentation. One Node process; persistent DB/assets/encryption-root storage; named SQLite volume on Windows. Prove clean Linux frozen install.           | Fresh install, restart and restore retain event data; uploads, form actions and both SSE streams work from another machine.                                            | 8–12 hours  |
| 2       | Full email/password accounts: users/sessions schema, atomic first-admin bootstrap, password/session services, central admin guard, recovery command, E2E login. Add user management after login/recovery works. Discord later. | LAN-only login/recovery works; concurrent bootstrap cannot create an unauthorized admin; password changes revoke sessions; public outputs stay usable without cookies. | 24–40 hours |
| 5b      | Combined PVW/PGM workspace after the event: reuse editors, capture rules and draft guards; define a page layout and independent save/conflict behavior before implementation.                                                  | Switching editors or live game cannot lose drafts or publish unsaved content; Take semantics are explicit; all seven outputs have tested workflows.                    | 32–48 hours |

**Docker origin decision:** `vite.config.ts` currently supplies `paths.origin` from `ORIGIN` at build time. Relative asset URLs do not establish that POST origin checks will work after removing it. Test request-derived origins on actual HTTP LAN and proxy configurations before deciding whether the image can be address-independent; keep CSRF protection enabled. SvelteKit documents both the [v3 origin change](https://svelte.dev/docs/kit/migrating-to-sveltekit-3#Configuration-Added-options) and [adapter origin/proxy handling](https://svelte.dev/docs/kit/adapter-node#Environment-variables-PROTOCOL_HEADER-HOST_HEADER-and-PORT_HEADER).

The current [Node release table](https://nodejs.org/en/about/previous-releases) lists both 24 and 26 as LTS. A4 proposes the already-installed 26.13.0 to avoid a runtime switch immediately before rehearsal; acceptance still requires the application's checks.

## Verification and release acceptance

For behavior changes, first reproduce the expected failure in the focused test, implement, and rerun it. Each task ends in a reviewable change with its relevant passing checks. Documentation/icon edits need targeted formatting/type/manual checks, not invented behavioral tests.

Run the final code-release checks sequentially because check/build/E2E share generated files:

1. `pnpm lint` and `pnpm check` — record existing unrelated failures separately rather than silently expanding scope.
2. `pnpm test:seed` and `pnpm exec vitest run` — include new focused tests; use `PLAYWRIGHT_CHANNEL=chrome` if using installed Chrome.
3. `pnpm exec playwright test --workers 1` — the current harness owns disposable data and a production build. Rebuild afterward using the actual deployment origin/environment.
4. `pnpm build` — archive the accepted build identity, migrations, and environment instructions; run the production Node app on the target LAN address.
5. Three-hour RHS preparation check — 60 minutes for all graphics/cold-start/lineup/stats; 60 minutes for vMix performance, provider loss/recovery and restart; 60 minutes for backup restore, source fallback and operator checks. Unavailable real-provider proof remains explicitly pending.

After schema changes, do not assume a Git revert is sufficient recovery. Keep a matching pre-upgrade DB/assets backup and encryption root; do not restore over newer tournament results without preserving/reconciling them. Prefer a forward fix when restoration would discard accepted event edits.

Svelte MCP documentation/autofixer tools were not exposed in this planning session. No Svelte code was written. Rediscover those tools when implementation starts; use the required autofixer if available, plus the repository's type/component/browser checks.

## Backlog coverage

| Source items | Planned destination                                                          |
| ------------ | ---------------------------------------------------------------------------- |
| 1, 4, 6b, 8  | A2, A1, A3, A4 respectively                                                  |
| 3, 5a, 5b    | Skip SPA conversion; B1 composite; E workspace after event                   |
| 6a, 6c       | D1 presence; D2 wording                                                      |
| 2, 7         | D3 conditional shared-password gate / E full accounts; A4 runtime / E Docker |
| 9, 10        | C1 shared compatibility work; C2 lineup; C3 statistics                       |

**Next action:** review the five-row batch table, then start A1. Exact RHS scheduling and final-template decisions can be resolved before their dependent acceptance checks.
