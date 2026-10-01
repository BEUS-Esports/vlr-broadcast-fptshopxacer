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

Run the management browser journeys with `pnpm exec playwright test tests/phase3-management.e2e.ts tests/phase3-conflicts.e2e.ts`. The runner migrates a temporary database, uses a temporary asset directory, builds and starts its own app, and removes the test data after shutdown. For installed Google Chrome, set `PLAYWRIGHT_CHANNEL=chrome` before running Playwright or client Vitest tests. Rebuild with your normal environment before running the app after a browser test build.

The Game Resources page syncs tactical maps, playable agents, and weapons from [VALORANT-API](https://valorant-api.com/). The server needs internet access only during refresh; saved records and downloaded images remain available locally afterward. The management routes currently have no sign-in gate, so keep the app on a trusted network until the planned account and session work is implemented.

## Broadcast operation and production

`/admin/graphics` owns one persisted on-air game. Choose Tournament → Match → Game and **Take game live**; parent dropdown drafts and ordinary management browsing retain the old on-air game. Other operators receive shared updates; stale drafts require an explicit reload. Each graphic has its own Show control. Player Stats supports Single and Head-to-Head in game/match/tournament scopes; MVP uses the saved operator pick. Missing preparation stays visibly unavailable.

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

Team A/B is competition order; **Swap Left/Right** changes only screen presentation. Current attackers/defenders change blue/red colors without moving teams. In-Game is supplementary context over the native HUD; its provisional placement still needs real Valorant/OBS rehearsal. Unknown tournament slugs use the generic test templates; final supplied artwork and live providers are later phases.

Use Node 24 LTS and `pnpm install --frozen-lockfile`. The lockfile applies a small adapter-node prerelease patch for Windows static-asset paths. Set `ORIGIN` to the exact address used by controllers and OBS **before building**: SvelteKit 3's `paths.origin` is a build setting; setting it only at runtime does not configure this installed adapter. Use the same address afterward, and rebuild when the deployment origin changes. For PowerShell:

```powershell
$env:ORIGIN = 'http://192.168.1.10:3000' # replace with the server LAN address
pnpm build
$env:HOST = '0.0.0.0'
$env:PORT = '3000'
node --env-file=.env build
```

Keep `DATABASE_URL` and `ASSET_DIR` persistent and set `BODY_SIZE_LIMIT=32M` for uploads. Run **one Node process**: publication is process-local; shared pub/sub is required before multiple workers/replicas. Authentication is intentionally deferred for trusted-LAN operation. Output pages contain no controls, but anyone who can reach management routes can write; they are not protected by sign-in or authorization.

Existing installations need reviewed forward migrations **0004** (broadcast state), **0005** (prepared-data broadcast invalidation), and **0006** (independent broadcast-control revision). Back up the database and assets together, stop the app, confirm `DATABASE_URL`, rehearse `pnpm db:migrate` against a disposable copy, then apply reviewed migrations during a planned event upgrade. Do not use `db:push` on event data. This phase's verification did not migrate the local/event database.

Run `PLAYWRIGHT_CHANNEL=chrome` and `pnpm exec playwright test tests/phase5-broadcast.e2e.ts tests/phase5-controller.e2e.ts tests/phase5-graphics.e2e.ts tests/team-a-veto-order.e2e.ts --workers 1` for production Node browser journeys. Run check/build/E2E sequentially because they share generated files. See [Phase 5 evidence and screenshots](./docs/2026-10-01-phase-5-verification.md); automated verification is complete, while actual OBS alpha, clipping, native-HUD compatibility and LAN rehearsal remain pending. Full Phase 5 acceptance and broadcast readiness are not yet claimed.

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
