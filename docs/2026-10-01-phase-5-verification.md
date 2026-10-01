# Phase 5 verification — 2026-10-01

Phase 5 implementation and automated verification are complete. Full acceptance and broadcast readiness remain pending a real OBS/Valorant rehearsal. Authentication is deferred by user decision: run on a trusted LAN; anyone who can reach management routes can currently mutate data. Read-only output pages are not an authorization boundary.

## Reproduce

Use Node 24 LTS, pnpm 11, installed Chrome (`PLAYWRIGHT_CHANNEL=chrome`) and one E2E worker. Run generated-file operations sequentially: check, build and browser tests all write `.svelte-kit` or `build`. The runner migrates only its disposable temporary database and uses temporary assets; no event/local database was migrated for this verification.

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm exec vitest run --project server --maxWorkers 1
pnpm exec vitest run --project client --maxWorkers 1
pnpm exec playwright test tests/phase5-broadcast.e2e.ts tests/phase5-controller.e2e.ts tests/phase5-graphics.e2e.ts tests/team-a-veto-order.e2e.ts --workers 1
pnpm build
```

Global E2E setup migrates/seeds the fixture and builds in a child process, then forks a clean app process importing only the actual adapter-node `build/index.js` entrypoint (the same application started by `node build`). It owns the HTTP server over IPC and closes all connections at teardown. Keeping seed imports out of the app process ensures native runtime dependencies cannot be masked by the fixture. This exercises static assets, browser hydration, form actions, SSE and all output routes in the production adapter, without Vite preview.

## Production corrections found by verification

The first built-Node run failed all four journeys: immutable scripts/CSS returned 404 and server-rendered forms never hydrated. Adapter-node **6.0.0-next.12** used a relative, slash-only module ID for its Rolldown `dir.js` chunk group. The unmatched module was inlined into `build/server/chunks/handler-*.js`; its `import.meta.url` made the asset root `build/server/chunks/client` instead of `build/client`.

The tracked [pnpm patch](../patches/@sveltejs__adapter-node@6.0.0-next.12.patch) resolves the module ID and normalizes Windows separators in the group predicate, keeping `dir.js` at the build root. An intermediate absolute-only patch still failed hydration; normalization is required. `pnpm install --frozen-lockfile` applies the patch through `pnpm-workspace.yaml` and the lockfile. Remove it when an upstream adapter release fixes this path and the built-Node journeys pass without it. No generated build-file edits or extra static server hide the problem.

That first run also rejected the SSE test's same-origin form action: this SvelteKit 3 adapter derives HTTPS when no configured origin exists and no trusted protocol header is provided. `vite.config.ts` now passes `process.env.ORIGIN` to **build-time** `paths.origin`. Set the intended LAN origin before building, then use the same address for controllers and outputs. Runtime `ORIGIN` alone does not reconfigure this installed adapter. CSRF checking remains enabled; no trusted-origin wildcard or protocol-header shortcut was added. Rebuild when the deployment origin changes.

A separate clean `node build` process exposed a native-client packaging issue that seed imports in the E2E owner had masked: `Cannot find module '@libsql/win32-x64-msvc'` from a bundled build chunk. The existing `@libsql/client` dependency now belongs to runtime `dependencies`, so the adapter externalizes it and its native binary resolves through its own installed package. Deploy the build with production dependencies installed; the build directory alone is insufficient.

## Evidence map

| Requirement                                                                | Evidence                                                                                                                                                                                                                                                                                                                                        |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Complete shared selection, retained parent drafts, stale second controller | `tests/phase5-controller.e2e.ts`: two independent controller contexts, retained draft rejected with HTTP 409, explicit reload; `services/broadcast.test.ts` checks persisted relationships/revisions.                                                                                                                                           |
| Multiple outputs, stable URLs, visibility, refreshed latest selection      | `tests/phase5-graphics.e2e.ts`: all seven output pages open together, every output sees selected/new game, parent-only drafts retain old game, hide/show each output, refresh every output, clear selection everywhere.                                                                                                                         |
| Browser-native SSE publication/reconnect                                   | `tests/phase5-broadcast.e2e.ts`: complete initial envelope, real committed management action, newer snapshot, reconnect resync; publisher/client/invalidation tests check concurrency, monotonic envelopes and failed publication recovery.                                                                                                     |
| Competition A/B separate from screen/side axes                             | Controller E2E preserves real saved game, lineup, veto and statistics rows across swaps and side controls; `Pregame.svelte.test.ts` checks rendered team position/color isolation; selectors/snapshot/service tests check ownership.                                                                                                            |
| Standard A opener, grand-final B double-ban, edited order                  | `tests/team-a-veto-order.e2e.ts`, `services/vetoes.test.ts`, rendered `VetoEditor.svelte.test.ts` exercise standard presets, B consecutive bans and editable/saved actor order.                                                                                                                                                                 |
| Incomplete/missing preparation, no invented data                           | All seven built outputs render incomplete lineups and absent portraits/logos/agents, incomplete veto, no MVP and missing statistics; then render a completely unprepared second game and no selection. Component tests add saved partial post-game values, zero/null metrics, missing records and failed assets.                                |
| Player Stats modes/scopes, substitutions and coverage                      | Controller E2E saves Single and Head-to-Head in game/match/tournament scopes; `Statistics.svelte.test.ts` renders explicit same-team and other-team choices/order, supported Performance Score, partial coverage; `statistics-aggregation.test.ts` proves zero vs null, substitute appearances and broader-scope unavailable Performance Score. |
| Production template fallback/read-only surface/transparency                | All seven built outputs use an unknown tournament slug and resolve `data-template=test`, have no form/button/input/select, send no mutation requests, report 1920×1080 and transparent body; unknown graphic is HTTP 404.                                                                                                                       |
| Native-HUD-first In-Game                                                   | `Pregame.svelte.test.ts` checks the 960×112 strip at (480,224), provisional protected rectangles, missing/long values and current/prepared side colors. Real HUD compatibility is pending.                                                                                                                                                      |

## Browser screenshots

These are transparent 1920×1080 browser captures of generic templates with deliberately incomplete saved preparation. They are browser evidence, not OBS composition acceptance or final tournament artwork.

| Output        | Capture                                        |
| ------------- | ---------------------------------------------- |
| Player Lineup | [PNG](./phase-5-screenshots/player-lineup.png) |
| Player Stats  | [PNG](./phase-5-screenshots/player-stats.png)  |
| Map Veto      | [PNG](./phase-5-screenshots/map-veto.png)      |
| Agent Select  | [PNG](./phase-5-screenshots/agent-select.png)  |
| In-Game       | [PNG](./phase-5-screenshots/in-game.png)       |
| Post-Game     | [PNG](./phase-5-screenshots/post-game.png)     |
| MVP           | [PNG](./phase-5-screenshots/mvp.png)           |

Populated journey captures reuse the controller's saved preparation: [current sides](./phase-5-screenshots/in-game-current-sides.png), [Single](./phase-5-screenshots/player-stats-single.png), [same-team Head-to-Head](./phase-5-screenshots/player-stats-head-to-head.png), [saved veto](./phase-5-screenshots/map-veto-saved.png) and [saved game MVP](./phase-5-screenshots/mvp-saved.png). The saved metric rows contain explicit zero and partial/null values; broader-scope Performance Score is unavailable.

All twelve captures were visually reviewed. A Python standard-library PNG check confirmed 1920×1080, 8-bit RGBA and first-pixel alpha 0 for each. This confirms browser PNG transparency alongside the CSS check and `omitBackground` capture option; it does not prove OBS source composition.

## Results

| Command                                                               | Result                                                                                                                                          |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm check`                                                          | 0 errors, 0 warnings                                                                                                                            |
| Full server Vitest, one worker                                        | 29 files; 93 passed, 2 role-gated skipped. The passing persistence parent test launches both writer/reader roles in separate processes.         |
| Full client Vitest, Chrome, one worker                                | 8 files; 30 passed                                                                                                                              |
| Four Phase 5/prerequisite Playwright journeys, built Node, one worker | 4 passed                                                                                                                                        |
| `pnpm build`, disposable database                                     | Exit 0                                                                                                                                          |
| Separate clean `node build` process                                   | Hydrated management, successful same-origin save, foreign-Origin HTTP 403 and all seven SSE outputs; no immutable asset failures or page errors |
| Changed TypeScript/JS ESLint and changed-file Prettier                | Passed                                                                                                                                          |
| `git diff --check`                                                    | Passed                                                                                                                                          |

Known runner output is preserved: client Vitest warns about unsupported `transformIndexHtml`; requests intentionally exercising missing-image fallback (`/missing.png`, `/next.png`) also logged dev-server `wrapDynamicImport` TypeErrors and HTTP 500. These are distinct from benign plugin/shutdown notices; all component assertions passed with exit 0. Production browser journeys and clean Node startup did not report page errors or immutable asset failures. Two later Node 24 builds exited **3221225477** before app startup (one E2E build, one standalone build); unchanged reruns passed. This Windows build instability remains a tooling concern. The known repository-wide Prettier baseline includes 40 unchanged failures; this task formats/checks its changed files only.

## Operational boundaries and pending OBS rehearsal

One Node process owns broadcast publication. Run one process; shared pub/sub is required before deploying multiple workers or replicas. Seven outputs share persisted selection and visibility through one typed broadcast library. Operator optimistic locking uses `controlRevision`; prepared database changes use `dataRevision`; SSE delivery has its own process epoch + sequence so Phase 6 provider telemetry can advance the stream without staling operator forms. Provider telemetry and final tournament artwork remain Phases 6–8.

Existing installations need forward migrations **0004** (persistent broadcast state), **0005** (prepared-data broadcast invalidation), and **0006** (independent broadcast-control revision). Back up database and `ASSET_DIR` together, stop the app and migrate with the correct `DATABASE_URL`; rehearse against a disposable copy first. Never run schema push against event data. This verification recreates disposable databases through all reviewed migrations and does not authorize an event upgrade.

Actual OBS and Valorant were unavailable. Keep these separately pending:

- [ ] Add each stable `/gfx/live/<graphic>` browser source at 1920×1080 and confirm alpha over real footage.
- [ ] Check scaling, clipping, all seven visibility/fades and any OBS custom CSS.
- [ ] Confirm provisional In-Game safe areas against the native spectator HUD, minimap, timer/score, killfeed and lower HUD.
- [ ] Swap left/right and verify competition identity, saved score ownership and lineup/veto actors remain unchanged.
- [ ] Change attackers/defenders and confirm blue/red recoloring without moving screen positions.
- [ ] Refresh browser sources, restart the app and reconnect multiple outputs; confirm latest state and stable URLs.
- [ ] Rehearse from the actual LAN/OBS machine with the configured build origin.

Browser screenshots alone cannot close this checklist.
