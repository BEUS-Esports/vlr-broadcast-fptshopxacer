<!-- markdownlint-disable MD041 -->

> "Work expands so as to fill the time available for its completion" - Parkinson's Law
>
> Actually, work always expands to my personal life =))))))

# FPT Shop x Acer - VLR Graphics Controller

Upcoming project for the FPT Shop x Acer Valorant Broadcast Graphics Controller.

Built with SvelteKit 3 and Svelte 5, with admin UI from Skeleton UI.

## Local development

Copy `.env.example` to `.env`, install dependencies with `pnpm install`, then run `pnpm db:migrate` and `pnpm dev`. The default `file:local.db` database is persistent and ignored by Git. Use migrations for schema changes; keep `db:push` away from event data.

Run `pnpm db:seed` after migration to add three fictional teams and 18 players for local preparation. Re-running it preserves existing records and edits. The player profiles are not assigned to tournament rosters; those are managed separately.

`/admin/tournaments` manages event details, team entries, player availability, map pools, matches, individual games, lineups, and match-wide vetoes. Reusable profiles and resources live at `/admin/teams`, `/admin/players`, and `/admin/resources`. `ASSET_DIR` stores uploaded logos/portraits and imported game art outside the build; back it up together with the database. Asset URLs are relative to the app origin, so the same images load from another PC through the server's LAN address. Set `BODY_SIZE_LIMIT=32M` for three team logos of up to 10 MB each when using the Node adapter.

Management tabs support deep links and retain unsaved drafts. Each section saves separately; stale saves keep the submitted draft until you explicitly reload it. Editing requires JavaScript. Reopen terminal games before changing their map, sides, or lineup; normal score corrections recalculate the series directly. Removing a player from a current roster preserves their saved historical lineups.

Game preparation follows **Info → Lineup → Map Veto → Agent Select → Post-Game Report**. Agent Select owns the saved player-to-agent mapping; Post-Game Report displays it read-only. Match → Games offers **Duplicate Game** with an unused target number and target-derived label. It copies the lineup, optionally agents (OFF by default), and derives map/starting sides from the target veto. It leaves scores, results, statistics, MVP and import metadata empty and preserves the source game and tournament roster.

Run the management browser journeys with `pnpm exec playwright test tests/phase3-management.e2e.ts tests/phase3-conflicts.e2e.ts`. The runner migrates a temporary database, uses a temporary asset directory, builds and starts its own app, and removes the test data after shutdown. For installed Google Chrome, set `PLAYWRIGHT_CHANNEL=chrome` before running Playwright or client Vitest tests. Rebuild with your normal environment before running the app after a browser test build.

The Game Resources page syncs tactical maps, playable agents, and weapons from [VALORANT-API](https://valorant-api.com/). The server needs internet access only during refresh; saved records and downloaded images remain available locally afterward. The management routes currently have no sign-in gate, so keep the app on a trusted network until the planned account and session work is implemented.

## Broadcast operation and production

The sidebar separates **Preparation** (Teams, Players, Game Resources, Tournaments) from **GFX Control** (Global Settings and all seven graphics). `/admin/graphics` opens Global Settings; the seven `/admin/graphics/<graphic>` pages share Global Setup and edit the same canonical preparation as normal management. Choose Tournament → Match → Game and **Take game live**; partial selector drafts and management browsing retain the live game. Hide every shown graphic before changing or clearing the selection; the server enforces this across controllers.

Each page has an embedded 16:9 Preview and **Large Preview** dialog using the actual output renderer. Preview follows the latest saved data, including while program is hidden. **Show** publishes a persisted capture of that graphic's saved preparation and content controls. Saves update Preview while shown program retains its capture. Repeating Show preserves it; **Hide → Show** publishes the latest saved version. Explicit presentation/current-side changes still act live. Dirty editors retain their original record and revision across refresh or a remote selection change. Player Stats supports Single and Head-to-Head in game/match/tournament scopes; MVP uses the saved operator pick. Missing preparation stays visibly unavailable.

Use these stable, read-only OBS URLs, all on a transparent 1920×1080 canvas:

| Graphic       | Route                     |
| ------------- | ------------------------- |
| Player Lineup | `/gfx/live/player-lineup` |
| Player Stats  | `/gfx/live/player-stats`  |
| Map Veto      | `/gfx/live/map-veto`      |
| Agent Select  | `/gfx/live/agent-select`  |
| In-Game       | `/gfx/live/in-game`       |
| Post-Game     | `/gfx/live/post-game`     |
| MVP           | `/gfx/live/mvp`           |

Team A/B is competition order; **Swap Left/Right** changes only screen presentation. Current attackers/defenders change blue/red colors without moving teams. The Phase 5/5.1 native In-Game fallback has passed real Valorant/OBS composition testing. Unknown tournament slugs use the generic test templates; final supplied artwork remains a later phase.

Use Node 24 LTS and `pnpm install --frozen-lockfile`. The lockfile applies a small adapter-node prerelease patch for Windows static-asset paths. Set `ORIGIN` to the exact address used by controllers and OBS **before building**: SvelteKit 3's `paths.origin` is a build setting; setting it only at runtime does not configure this installed adapter. Use the same address afterward, and rebuild when the deployment origin changes. For PowerShell:

```powershell
$env:ORIGIN = 'http://192.168.1.10:3000' # replace with the server LAN address
pnpm build
$env:HOST = '0.0.0.0'
$env:PORT = '3000'
node --env-file=.env build
```

Keep `DATABASE_URL` and `ASSET_DIR` persistent and set `BODY_SIZE_LIMIT=32M` for uploads. Run **one Node process**: SSE delivery is process-local; shared pub/sub is required before multiple workers/replicas. Prepared graphic captures persist in the database across restart. Authentication is intentionally deferred for trusted-LAN operation. Output pages contain no controls, but anyone who can reach management routes can write; they are not protected by sign-in or authorization.

Existing installations need reviewed forward migrations **0004** (broadcast state), **0005** (prepared-data broadcast invalidation), **0006** (independent broadcast-control revision), **0007** (persisted graphic captures), **0008** (agent ability artwork metadata), **0009** (in-game match controls), **0010** (post-game import provenance and report uniqueness), **0011** (encrypted provider settings), and **0012** (separate Spectra post-game group code). Migration 0007 hides previously shown graphics because no reviewed capture exists yet; Show them again after reviewing preparation. Migration 0010 conservatively protects legacy imported agents whose manual-edit history is unavailable; review differing agent proposals on the first reimport. Back up the database and assets together, stop the app, confirm `DATABASE_URL`, rehearse `pnpm db:migrate` against a disposable copy, then apply reviewed migrations during a planned event upgrade. Do not use `db:push` on event data. Verification uses disposable databases; this phase has not migrated the local/event database.

Run `PLAYWRIGHT_CHANNEL=chrome` and `pnpm exec playwright test tests/phase5-broadcast.e2e.ts tests/phase5-controller.e2e.ts tests/phase5-graphics.e2e.ts tests/team-a-veto-order.e2e.ts --workers 1` for production Node browser journeys. Run check/build/E2E sequentially because they share generated files. See [Phase 5 evidence and screenshots](./docs/2026-10-01-phase-5-verification.md). The Phase 5/5.1 native/test package is the accepted fallback baseline; external provider HUD acceptance is recorded separately.

Phase 5.1 journeys are `tests/phase5.1-workflow.e2e.ts`, `tests/phase5.1-duplication.e2e.ts`, and `tests/phase5.1-visuals.e2e.ts`. See [Phase 5.1 verification](./docs/2026-10-02-phase-5.1-verification.md) for the current workflow and Test GFX v2 screenshots. Test GFX v2 is generic test artwork.

## Live providers and external HUD

Apply migration **0008**, then sync Agents in **Game Resources** to download ability icons into the existing local asset store. Existing agents keep their IDs and artwork; unavailable measurements remain blank in the HUD.

Open **Settings** (`/admin/settings`) and save/connect a source. Spectra supports Europe, North America, or a custom HTTP/HTTPS host; enter its group code and access key (blank is allowed for a custom server). Socket.IO match output uses port 5200 and supporter lookup uses port 5101. GStack defaults to `http://localhost:57780/`: `/livenow` seeds the state and the VHUD command stream uses WebSocket port 57770 (57773 for HTTPS). Both endpoints must be reachable from the application server.

In **In-Game** control, confirm both provider teams and the observed players against the selected saved game, then **Enable external HUD**. Local player/team branding stays authoritative. Source None/disconnect and **Use native HUD** are shared controls. Retry waits are 1/2/4/8 seconds; four failed retries select native fallback. Recovery keeps native mode until an operator re-enables the external HUD. **View Data** shows current normalized, redacted raw, and connection/mapping data with Copy JSON. Agent Select may show transient observed picks; it never saves them automatically.

Provider settings are persisted in the database by migration **0011**. ValoSpectra's Org/access key and HenrikDev's API key are encrypted at rest with AES-256-GCM; keep the encryption root outside SQLite via `SETTINGS_ENCRYPTION_KEY`, or let the server create the ignored `data/settings.key` file. Back up that encryption root separately with the database—losing it makes the saved credentials undecryptable. On first use only, a legacy `data/live-provider.json` and the old Phase 7 environment variables are imported into the database; the legacy plaintext live-provider file is removed only after the saved settings validate and decrypt. An unreadable or invalid legacy file stops provider-settings initialization without saving defaults or deleting the file; correct the file (or the `LIVE_PROVIDER_CONFIG_FILE` override) and restart the server to retry. A restart starts disconnected/native and requires mapping review. Run one Node process: all browser clients subscribe to application SSE and share one upstream session. Raw diagnostics stay on the trusted-LAN admin boundary; credentials are excluded from output URLs, public SSE and form responses.

Run `pnpm exec playwright test tests/phase6-live.e2e.ts` for the local fixture journey. See [Phase 6 implementation and verification](./docs/2026-10-03-phase-6-live-providers-external-hud.md). Real Spectra and GStack sessions and external HUD/OBS composition still require separate acceptance; neither provider is declared broadcast-ready. The GStack reference folder is ignored and its code/assets are not bundled into the application.

## Post-game imports

Apply reviewed migrations **0010**, **0011**, and **0012** before using provider imports. Configure HenrikDev and Spectra from **Settings** (`/admin/settings`): HenrikDev supports Riot affinities `ap`, `br`, `eu`, `kr`, `latam`, and `na`, plus PC/console, base URL, candidate count, request timeout, and an encrypted API key. Legacy Phase 7 environment values are bootstrap-only for an empty settings table. Only query participants whose data use is authorized under HenrikDev's current consent/use requirements. Never put provider credentials in public variables, fixtures, OBS URLs, or client-visible application data.

Open a saved game's **Post-Game Report**. HenrikDev is recommended beside ValoSpectra; choose a saved lineup Riot ID, fetch recent matches and select the intended candidate. Exact detail opens the shared mapping and change review. Missing or renamed Riot IDs require explicit saved-player mappings. Review map, time, teams, score, agents, all metrics and source availability before confirming. A different provider/report needs explicit replacement confirmation. Statistics and agent conflicts have separate **Keep local**/**Use provider** choices; kept corrections stay protected on later reimports. Import does not finalize scores/results, choose MVP or change the live HUD.

Spectra uses the separate hosted statistics service configured in **Settings**, with a per-fetch group code or the saved ValoSpectra group code. The hosted post-game base URL, poll interval, and maximum attempts are DB-backed settings and are independent from Spectra's live socket region/host. Pending polling is bounded and can be stopped; a reused group code still requires review of returned match identity. Running the outgoing live server alone does not provide hosted statistics.

Provider errors leave the manual editor available. Blank means unknown, zero means measured zero. Performance Score is independent of provider combat score; Trades remain unavailable from these adapters. Missing/incomplete round events, including the verified surrender shape, leave derived metrics blank. To correct a lineup identity protected by imported data, explicitly discard only that player's saved statistics/provenance, then use the normal lineup correction flow. This leaves the other players, lineup agents and report association intact.

Run the deterministic browser journey with `PLAYWRIGHT_CHANNEL=chrome` and `pnpm exec playwright test tests/phase7-post-game.e2e.ts`. See [Phase 7 verification](./docs/2026-10-05-phase-7-verification.md) for automated checks, the real HenrikDev competitive-match retrieval result, and the remaining custom-event/Spectra acceptance dependencies.

## Expected features includes

- CRUD tasks and management features for:
  - Reusable teams and players
  - Tournaments -> Matches -> Games
  - Game Resources
- Graphics:
  - Player Lineup
  - Player Stats
  - Map Veto
  - Agent Select
  - In-Game
  - Post-Game
  - MVP

## Inspiration

- Valorant Champions Tour broadcast graphics.
- Post Match from <stats.bumpfull.com> or <https://github.com/ranamerp/val-image-generator> etc...
- [Barracks.gg](https://barracks.gg) Graphics Controller, works well with Riot Games' Partner Tournaments as it has live data.
- [Previous work with TFT for the FPT Shop Uni Tour 2026](https://github.com/Rookie001MC/tft-broadcast)
  - Features CRUD actions, Winner GFX, Post-Game GFX, Ranking GFX.
- [Previous work with the MLBB Road to Asiad 2026 Aichi-Nagoya](https://github.com/BEUS-Esports/mlbb-hud-road-to-asiad-2026) (GitHub is private, source code [here](./examples/mlbb-hud-road-to-asiad-2026/))

## Expected integrations

### Live Game Data:

- [ValoSpectra](https://www.valospectra.com/), server here: <https://github.com/ValoSpectra/Spectra-Server>, uses Overwolf under the hood.
- [GStack](https://gstack.app), GStack-Client API schema here: <https://gstack.app/API/VHUD.html>, uses OCR and Machine Vision.
- Direct Riot match-data and account integrations are outside the current scope; see [the specification](./docs/TECH-SPEC.md).

### Game Resources

- [VALORANT-API](https://valorant-api.com/) supplies the implemented map, agent, and weapon catalogues. Images are downloaded locally during deliberate per-resource syncs.
